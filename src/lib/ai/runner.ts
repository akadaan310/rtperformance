/**
 * The Tech Guy's conversation loop: model ↔ allowlisted tools, with budgets, persistence and confirmation gating.
 * Deliberately a single bounded loop — no background agents, no multi-agent orchestration.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { assertCan } from "@/lib/auth/permissions";
import { todayKey } from "@/lib/dates";
import { rateLimit } from "@/lib/rate-limit";
import { failure, ServiceError } from "@/lib/result";
import type { ServiceContext } from "@/lib/services/context";
import { dynamicContext, STATIC_INSTRUCTIONS } from "./prompt";
import { toolsFor, validateToolCall, type AssistantCard } from "./tools";
import type { AssistantModel, DisplayMessage, DisplayPayload, ToolActivity } from "./types";

export const MAX_TOOL_STEPS = 6;
export const MAX_OUTPUT_TOKENS = 2048;
export const MAX_USER_MESSAGE_CHARS = 4000;
export const HISTORY_MESSAGES = 24;
const MAX_TOOL_RESULT_CHARS = 14_000;

export interface RunnerLimits {
  dailyRequests: number;
  dailyTokens: number;
  effort?: "low" | "medium" | "high";
}

export const messageInput = z.object({
  conversation_id: z.string().uuid().optional().nullable(),
  message: z.string().trim().min(1, "Type a message").max(MAX_USER_MESSAGE_CHARS, `Keep messages under ${MAX_USER_MESSAGE_CHARS} characters`),
});

export interface TurnResult {
  conversationId: string;
  messages: DisplayMessage[];
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: Anthropic.ContentBlockParam[] | string;
  display: DisplayPayload | null;
  created_at: string;
}

const TOOL_LABELS: Record<string, string> = {
  list_athletes: "Looked up athletes",
  get_athlete_profile: "Read an athlete profile",
  get_athlete_programs: "Checked assigned programs",
  search_exercises: "Searched the exercise library",
  get_workout_history: "Reviewed workout history",
  get_progress_summary: "Pulled progress metrics",
  get_schedule: "Checked the schedule",
  get_workspace_settings: "Read workspace settings",
  list_programs: "Listed programs",
  get_program: "Opened a program",
  get_weekly_summary: "Compiled this week's numbers",
  create_program_draft: "Created a draft program",
  revise_program_draft: "Revised a program draft",
  create_athlete_profile: "Created an athlete profile",
  prepare_invitation: "Prepared an invitation for confirmation",
  publish_program: "Queued publishing for confirmation",
  assign_program: "Queued an assignment for confirmation",
  update_branding: "Queued branding changes for confirmation",
};

/** Run one user turn. Throws ServiceError for user-facing problems (limits, validation). */
export async function runAssistantTurn(ctx: ServiceContext, rawInput: unknown, model: AssistantModel, limits: RunnerLimits): Promise<TurnResult> {
  assertCan(ctx, "assistant.use", "The Tech Guy is available to coaches in this workspace.");
  const parsed = messageInput.safeParse(rawInput);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid message");
  const { message } = parsed.data;

  const burst = rateLimit(`ai:${ctx.user.id}`, 8, 60_000);
  if (!burst.ok) throw new ServiceError("You're sending messages quickly — give it a few seconds and try again.");
  await assertWithinBudget(ctx, limits);

  const conversation = await getOrCreateConversation(ctx, parsed.data.conversation_id ?? null, message);
  const history = await loadHistory(ctx, conversation.id);

  const userRow = await insertMessage(ctx, conversation.id, "user", message, { text: message });
  const newMessages: DisplayMessage[] = [toDisplay(userRow)];

  const ctxAi: ServiceContext = { ...ctx, source: "ai" };
  const tools = toolsFor(ctxAi);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: STATIC_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicContext(ctxAi, todayKey(), conversation.summary) },
  ];
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: message }];

  const cards: AssistantCard[] = [];
  const activity: ToolActivity[] = [];
  const memos: string[] = [];
  let finalText = "";

  try {
    for (let step = 0; step < MAX_TOOL_STEPS + 1; step++) {
      if (step === MAX_TOOL_STEPS) {
        finalText = finalText || "I reached my step limit for one request. Here's where things stand — ask me to continue if you'd like.";
        break;
      }
      const response = await model.createMessage({
        model: model.modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools,
        messages,
        ...(limits.effort ? { output_config: { effort: limits.effort } } : {}),
      });
      await recordUsage(ctx, response.usage);

      if (response.stop_reason === "refusal") {
        finalText = "I can't help with that request. Try rephrasing it as a coaching or workspace task.";
        break;
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        finalText = text || (response.stop_reason === "max_tokens" ? "That answer ran long — ask me to continue." : "Done.");
        break;
      }

      // Execute every requested tool, returning all results in a single user message.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of toolUses) {
        const outcome = await executeToolCall(ctxAi, conversation.id, call);
        results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) });
        activity.push({ tool: call.name, ok: !outcome.isError, label: TOOL_LABELS[call.name] ?? call.name });
        if (outcome.card) cards.push(outcome.card);
        if (outcome.memo) memos.push(outcome.memo);
      }
      const assistantContent = response.content as unknown as Anthropic.ContentBlockParam[];
      messages.push({ role: "assistant", content: assistantContent }, { role: "user", content: results });
      // Persist the pair together so the stored history always replays as a valid conversation.
      await insertMessage(ctx, conversation.id, "assistant", assistantContent, null, response.usage);
      await insertMessage(ctx, conversation.id, "user", results, null);
    }
  } catch (err) {
    const display: DisplayPayload = { text: providerErrorMessage(err), cards, activity, error: true };
    const row = await insertMessage(ctx, conversation.id, "assistant", display.text, display);
    newMessages.push(toDisplay(row));
    await touchConversation(ctx, conversation.id, conversation.summary, memos);
    return { conversationId: conversation.id, messages: newMessages };
  }

  const display: DisplayPayload = { text: finalText, cards, activity };
  const row = await insertMessage(ctx, conversation.id, "assistant", finalText, display);
  newMessages.push(toDisplay(row));
  await touchConversation(ctx, conversation.id, conversation.summary, memos);
  return { conversationId: conversation.id, messages: newMessages };
}

interface ToolCallOutcome {
  content: string;
  isError: boolean;
  card?: AssistantCard;
  memo?: string;
}

/** Validate → permission-check → run (or queue for confirmation). Never trusts the model's claims about access. */
export async function executeToolCall(ctx: ServiceContext, conversationId: string, call: { name: string; input: unknown }): Promise<ToolCallOutcome> {
  const v = validateToolCall(ctx, call.name, call.input);
  if (!v.ok) return { content: JSON.stringify({ error: v.error }), isError: true };
  const { tool, input } = v;
  try {
    if (tool.kind === "confirm") {
      const summary = await tool.confirmation!(ctx, input as never);
      const { data, error } = await ctx.supabase
        .from("ai_pending_actions")
        .insert({
          org_id: ctx.org.id,
          conversation_id: conversationId,
          user_id: ctx.user.id,
          tool_name: tool.name,
          input,
          summary: JSON.stringify(summary),
        })
        .select("id")
        .single();
      if (error) throw new ServiceError("Could not queue the action for confirmation.");
      return {
        content: JSON.stringify({ status: "awaiting_user_confirmation", pending_action_id: data.id, note: "Shown to the user as a confirmation card. Not executed yet." }),
        isError: false,
        card: { type: "pending_action", actionId: data.id as string, tool: tool.name, title: summary.title, details: summary.details, status: "pending" },
      };
    }
    const out = await tool.run(ctx, input as never);
    return { content: truncate(JSON.stringify(out.result ?? null)), isError: false, card: out.card, memo: out.memo };
  } catch (err) {
    const f = failure(err);
    const detail = f.fieldErrors ? ` (${Object.entries(f.fieldErrors).map(([k, m]) => `${k}: ${m}`).join("; ")})` : "";
    return { content: JSON.stringify({ error: f.error + detail }), isError: true };
  }
}

/** Executes or cancels a queued action after explicit user confirmation. */
export async function decidePendingAction(ctx: ServiceContext, actionId: string, decision: "confirm" | "cancel") {
  assertCan(ctx, "assistant.use");
  const { data: action, error } = await ctx.supabase
    .from("ai_pending_actions")
    .select("id, conversation_id, tool_name, input, status, expires_at, user_id")
    .eq("id", actionId)
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error || !action) throw new ServiceError("That action could not be found.");
  if (action.status !== "pending") throw new ServiceError(`This action was already ${action.status}.`);
  if (new Date(action.expires_at as string).getTime() < Date.now()) {
    await ctx.supabase.from("ai_pending_actions").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("id", actionId);
    throw new ServiceError("This confirmation expired. Ask The Tech Guy to prepare it again.");
  }

  if (decision === "cancel") {
    await ctx.supabase.from("ai_pending_actions").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("id", actionId).eq("status", "pending");
    await insertMessage(ctx, action.conversation_id as string, "assistant", "The user cancelled that action. Nothing was changed.", {
      text: "Cancelled — nothing was changed.",
    });
    return { status: "cancelled" as const };
  }

  // Claim the action atomically so a double click cannot execute it twice.
  const { data: claimed } = await ctx.supabase
    .from("ai_pending_actions")
    .update({ status: "executing", decided_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length) throw new ServiceError("This action is already being processed.");

  const ctxAi: ServiceContext = { ...ctx, source: "ai" };
  // Re-validate and re-check permissions at execution time (roles may have changed since it was proposed).
  const v = validateToolCall(ctxAi, action.tool_name as string, action.input);
  let status: "executed" | "failed";
  let resultPayload: unknown;
  let card: AssistantCard | undefined;
  let message: string;
  if (!v.ok) {
    status = "failed";
    resultPayload = { error: v.error };
    message = v.error;
  } else {
    try {
      const out = await v.tool.run(ctxAi, v.input as never);
      status = "executed";
      resultPayload = out.result;
      card = out.card;
      message = "Done.";
      if (out.memo) {
        const { data: conv } = await ctx.supabase.from("ai_conversations").select("summary").eq("id", action.conversation_id).maybeSingle();
        await touchConversation(ctx, action.conversation_id as string, (conv?.summary as string | null) ?? null, [out.memo]);
      }
    } catch (err) {
      const f = failure(err);
      status = "failed";
      resultPayload = { error: f.error };
      message = f.error;
    }
  }
  await ctx.supabase.from("ai_pending_actions").update({ status, result: resultPayload }).eq("id", actionId);
  const text = status === "executed" ? `Confirmed and completed: ${TOOL_LABELS[action.tool_name as string]?.replace(" for confirmation", "") ?? action.tool_name}.` : `That action failed: ${message}`;
  // Recorded so the model sees the real outcome on the next turn.
  await insertMessage(ctx, action.conversation_id as string, "assistant", `[Action ${action.tool_name} ${status}] ${truncate(JSON.stringify(resultPayload ?? null), 2000)}`, {
    text,
    cards: card ? [card] : undefined,
    error: status === "failed",
  });
  return { status, result: resultPayload, card, message: text };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------
async function getOrCreateConversation(ctx: ServiceContext, conversationId: string | null, firstMessage: string) {
  if (conversationId) {
    const { data } = await ctx.supabase
      .from("ai_conversations")
      .select("id, summary")
      .eq("id", conversationId)
      .eq("org_id", ctx.org.id)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (!data) throw new ServiceError("Conversation not found.");
    return { id: data.id as string, summary: (data.summary as string | null) ?? null };
  }
  const title = firstMessage.replace(/\s+/g, " ").slice(0, 80);
  const { data, error } = await ctx.supabase
    .from("ai_conversations")
    .insert({ org_id: ctx.org.id, user_id: ctx.user.id, title: title.length >= 1 ? title : "New conversation" })
    .select("id, summary")
    .single();
  if (error) throw new ServiceError("Could not start a conversation.");
  return { id: data.id as string, summary: null };
}

/**
 * Replays recent history. Prior-turn thinking blocks are dropped (only the in-flight tool loop needs them),
 * and the window always starts at a plain user message so tool_use/tool_result pairs stay intact.
 */
export async function loadHistory(ctx: ServiceContext, conversationId: string): Promise<Anthropic.MessageParam[]> {
  const { data } = await ctx.supabase
    .from("ai_messages")
    .select("id, role, content, display, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  const rows = ((data ?? []) as StoredMessage[]).reverse();
  return buildHistory(rows);
}

export function buildHistory(rows: Pick<StoredMessage, "role" | "content">[]): Anthropic.MessageParam[] {
  const start = rows.findIndex((r) => r.role === "user" && (typeof r.content === "string" || !r.content.some((b) => b.type === "tool_result")));
  if (start < 0) return [];
  return rows.slice(start).map((r) => ({
    role: r.role,
    content:
      typeof r.content === "string"
        ? r.content
        : r.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking"),
  })) as Anthropic.MessageParam[];
}

async function insertMessage(
  ctx: ServiceContext,
  conversationId: string,
  role: "user" | "assistant",
  content: string | Anthropic.ContentBlockParam[],
  display: DisplayPayload | null,
  usage?: Anthropic.Usage,
): Promise<StoredMessage> {
  const { data, error } = await ctx.supabase
    .from("ai_messages")
    .insert({
      org_id: ctx.org.id,
      conversation_id: conversationId,
      role,
      content,
      display,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
    })
    .select("id, role, content, display, created_at")
    .single();
  if (error) throw new ServiceError("Could not save the conversation.");
  return data as StoredMessage;
}

async function touchConversation(ctx: ServiceContext, conversationId: string, summary: string | null, memos: string[]) {
  const next = memos.length ? [summary, ...memos.map((m) => `- ${m}`)].filter(Boolean).join("\n").slice(-1800) : summary;
  await ctx.supabase.from("ai_conversations").update({ summary: next }).eq("id", conversationId);
}

function toDisplay(row: StoredMessage): DisplayMessage {
  return {
    id: row.id,
    role: row.role,
    display: row.display ?? { text: typeof row.content === "string" ? row.content : "" },
    created_at: row.created_at,
  };
}

async function assertWithinBudget(ctx: ServiceContext, limits: RunnerLimits) {
  const { data } = await ctx.supabase
    .from("ai_usage")
    .select("requests, input_tokens, output_tokens")
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .eq("usage_date", new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (!data) return;
  if ((data.requests as number) >= limits.dailyRequests || (data.input_tokens as number) + (data.output_tokens as number) >= limits.dailyTokens) {
    throw new ServiceError("You've reached today's assistant usage budget. It resets tomorrow — everything else in RT Performance keeps working.");
  }
}

async function recordUsage(ctx: ServiceContext, usage: Anthropic.Usage | undefined) {
  if (!usage) return;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  await ctx.supabase.rpc("record_ai_usage", { p_org: ctx.org.id, p_input_tokens: input, p_output_tokens: usage.output_tokens ?? 0 });
}

function truncate(s: string, max = MAX_TOOL_RESULT_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

export function providerErrorMessage(err: unknown): string {
  if (err instanceof ServiceError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "The AI provider is rate limiting requests right now. Try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return "The Tech Guy's AI credentials were rejected. An administrator needs to check the server configuration.";
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "The AI provider took too long to respond. Try again, or ask a smaller question.";
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit|billing|balance/i.test(err.message)) return "The AI account's usage budget is exhausted. Everything else in RT Performance keeps working.";
    return "The AI provider rejected that request. Try rephrasing it.";
  }
  if (err instanceof Anthropic.InternalServerError) return "The AI provider is temporarily unavailable. Try again shortly.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI provider. Check the connection and try again.";
  return "Something went wrong while talking to the AI provider.";
}
