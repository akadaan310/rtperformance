/**
 * Scenario D — The Tech Guy. The model provider is replaced with a deterministic script so the test exercises
 * the real tool registry, validation, permission checks, database writes, confirmation flow and persistence.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorld, ctxFor, unwrap, type World } from "../support/world";
import { decidePendingAction, executeToolCall, runAssistantTurn, type RunnerLimits } from "@/lib/ai/runner";
import type { AssistantModel } from "@/lib/ai/types";
import { resetRateLimits } from "@/lib/rate-limit";

let w: World;
const limits: RunnerLimits = { dailyRequests: 100, dailyTokens: 1_000_000 };

beforeAll(async () => {
  w = await buildWorld();
});

/** A scripted model: each step inspects the conversation so far and returns the next assistant message. */
function scriptedModel(steps: ((params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.ContentBlock[])[]): AssistantModel & { calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    modelId: "test-model",
    calls,
    async createMessage(params) {
      calls.push(structuredClone(params));
      const step = steps[calls.length - 1];
      if (!step) throw new Error("model called more times than scripted");
      const content = step(params);
      return {
        id: `msg_${calls.length}`,
        type: "message",
        role: "assistant",
        model: "test-model",
        content,
        stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      } as unknown as Anthropic.Message;
    },
  };
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.ContentBlock;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.ContentBlock;

function lastToolResults(params: Anthropic.MessageCreateParamsNonStreaming): { id: string; content: unknown; isError: boolean }[] {
  const last = params.messages.at(-1)!;
  if (!Array.isArray(last.content)) return [];
  return last.content
    .filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result")
    .map((b) => ({ id: b.tool_use_id, content: JSON.parse(String(b.content)), isError: Boolean(b.is_error) }));
}

describe("The Tech Guy", () => {
  it("prepares a program draft through validated tools and reports the real backend result", async () => {
    resetRateLimits();
    const ctx = ctxFor(w.trainer, w.trainerOrg, "owner");
    let exerciseIds: string[] = [];
    const model = scriptedModel([
      () => [text("Let me find exercises."), toolUse("t1", "search_exercises", { category: "squat", limit: 5 })],
      (p) => {
        const [res] = lastToolResults(p);
        exerciseIds = (res!.content as { id: string }[]).map((e) => e.id);
        return [
          toolUse("t2", "create_program_draft", {
            name: "Beginner Three-Day Strength",
            level: "beginner",
            duration_weeks: 4,
            sessions_per_week: 3,
            description: "Coach notes: build the squat pattern first.",
            sessions: [1, 2, 3].map((d) => ({
              name: `Day ${d}`,
              day_number: d,
              exercises: [{ exercise_id: exerciseIds[0], sets: 3, reps: "8", load_type: "rpe", load_value: 6, rest_seconds: 120, progression: "+5 lb weekly" }],
            })),
          }),
        ];
      },
      (p) => {
        const [res] = lastToolResults(p);
        expect(res!.isError).toBe(false);
        return [text(`Draft created: ${(res!.content as { program_id: string }).program_id}`)];
      },
    ]);

    const turn = await runAssistantTurn(ctx, { message: "Create a beginner three-day strength program." }, model, limits);
    expect(model.calls).toHaveLength(3);
    // The model was never told the org id or allowed to pick one; the system prompt names the workspace.
    expect(JSON.stringify(model.calls[0]!.tools)).not.toContain("org_id");
    expect(model.calls[0]!.system).toBeDefined();

    const reply = turn.messages.at(-1)!;
    expect(reply.display.activity?.map((a) => a.tool)).toEqual(["search_exercises", "create_program_draft"]);
    const card = reply.display.cards?.find((c) => c.type === "program");
    expect(card).toMatchObject({ type: "program", status: "draft", versionNumber: 1 });

    const programs = unwrap(await w.trainer.client.from("program_templates").select("id, status, created_via, org_id").eq("name", "Beginner Three-Day Strength")) as { id: string; status: string; created_via: string; org_id: string }[];
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({ status: "draft", created_via: "ai", org_id: w.trainerOrg.id });
    const audit = unwrap(await w.trainer.client.from("audit_events").select("source").eq("target_id", programs[0]!.id)) as { source: string }[];
    expect(audit.map((a) => a.source)).toContain("ai");

    // Conversation persisted, scoped to this coach.
    const convs = unwrap(await w.trainer.client.from("ai_conversations").select("id").eq("id", turn.conversationId)) as unknown[];
    expect(convs).toHaveLength(1);
    const { data: peek } = await w.coTrainer.client.from("ai_conversations").select("id").eq("id", turn.conversationId);
    expect(peek).toEqual([]);
    const { data: peek2 } = await w.owner.client.from("ai_messages").select("id").eq("conversation_id", turn.conversationId);
    expect(peek2).toEqual([]);

    // Second turn: publishing requires explicit confirmation — the tool only queues it.
    const programId = programs[0]!.id;
    const model2 = scriptedModel([
      () => [toolUse("t3", "publish_program", { program_id: programId })],
      (p) => {
        const [res] = lastToolResults(p);
        expect((res!.content as { status: string }).status).toBe("awaiting_user_confirmation");
        return [text("Review and confirm the card to publish.")];
      },
    ]);
    const turn2 = await runAssistantTurn(ctx, { conversation_id: turn.conversationId, message: "Publish it." }, model2, limits);
    // History was replayed to the model.
    expect(model2.calls[0]!.messages.length).toBeGreaterThan(2);
    const pending = turn2.messages.at(-1)!.display.cards!.find((c) => c.type === "pending_action")!;
    expect(pending).toMatchObject({ tool: "publish_program", status: "pending" });
    let version = unwrap(await w.trainer.client.from("program_versions").select("status").eq("template_id", programId).single()) as { status: string };
    expect(version.status).toBe("draft");

    // Another user cannot confirm it.
    const coCtx = ctxFor(w.coTrainer, w.trainerOrg, "trainer");
    await expect(decidePendingAction(coCtx, (pending as { actionId: string }).actionId, "confirm")).rejects.toThrow(/could not be found/);

    const result = await decidePendingAction(ctx, (pending as { actionId: string }).actionId, "confirm");
    expect(result.status).toBe("executed");
    version = unwrap(await w.trainer.client.from("program_versions").select("status").eq("template_id", programId).single()) as { status: string };
    expect(version.status).toBe("published");
    // Single execution only.
    await expect(decidePendingAction(ctx, (pending as { actionId: string }).actionId, "confirm")).rejects.toThrow(/already executed/);
  });

  it("refuses the same operation for a user without sufficient permissions", async () => {
    resetRateLimits();
    const co = ctxFor(w.coTrainer, w.trainerOrg, "trainer", { source: "ai" });
    const brandBefore = unwrap(await w.trainer.client.from("brand_settings").select("accent_color").eq("org_id", w.trainerOrg.id).single()) as { accent_color: string };

    // Even if a model asks a trainer-role session to change branding, the gate refuses it…
    const out = await executeToolCall(co, "00000000-0000-0000-0000-000000000000", { name: "update_branding", input: { accent_color: "#FF0000" } });
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/Permission denied/);
    // …and the same is true end-to-end through the runner.
    const model = scriptedModel([
      () => [toolUse("x1", "update_branding", { accent_color: "#FF0000" })],
      (p) => {
        expect(lastToolResults(p)[0]!.isError).toBe(true);
        return [text("I can't change branding with your role.")];
      },
    ]);
    const turn = await runAssistantTurn(co, { message: "Change my accent to red" }, model, limits);
    expect(turn.messages.at(-1)!.display.activity![0]).toMatchObject({ ok: false });
    const brandAfter = unwrap(await w.trainer.client.from("brand_settings").select("accent_color").eq("org_id", w.trainerOrg.id).single()) as { accent_color: string };
    expect(brandAfter).toEqual(brandBefore);

    // Athletes cannot use the assistant at all.
    const athlete = ctxFor(w.trainerAthlete.actor, w.trainerOrg, "athlete", { athleteId: w.trainerAthlete.athleteId });
    await expect(runAssistantTurn(athlete, { message: "hi" }, scriptedModel([]), limits)).rejects.toThrow(/coaches/);

    // Cross-workspace ids supplied by the model are not found.
    const ownerTool = await executeToolCall(ctxFor(w.trainer, w.trainerOrg, "owner", { source: "ai" }), "00000000-0000-0000-0000-000000000000", {
      name: "get_athlete_profile",
      input: { athlete_id: w.masterAthlete.athleteId },
    });
    expect(ownerTool).toMatchObject({ isError: true });
    expect(ownerTool.content).toMatch(/not found/i);

    // Arbitrary / unknown tools are rejected.
    const evil = await executeToolCall(ctxFor(w.trainer, w.trainerOrg, "owner"), "00000000-0000-0000-0000-000000000000", { name: "run_sql", input: { sql: "select * from auth.users" } });
    expect(evil).toMatchObject({ isError: true });
  });

  it("prepares a trainer invitation only after the network owner confirms", async () => {
    resetRateLimits();
    const ctx = ctxFor(w.owner, w.master, "owner", { isMasterOwner: true });
    const email = `ai-invite-${Date.now()}@test.rtperformance.dev`;
    const model = scriptedModel([() => [toolUse("i1", "prepare_invitation", { kind: "network_trainer", email, workspace_name: "AI Invited" })], () => [text("Confirm to create the link.")]]);
    const turn = await runAssistantTurn(ctx, { message: "Prepare an invitation for another trainer." }, model, limits);
    const card = turn.messages.at(-1)!.display.cards!.find((c) => c.type === "pending_action") as { actionId: string };
    expect(unwrap(await w.owner.client.from("invitations").select("id").eq("email", email))).toEqual([]);
    const res = await decidePendingAction(ctx, card.actionId, "confirm");
    expect(res.status).toBe("executed");
    expect(res.card).toMatchObject({ type: "invitation", email });
    const rows = unwrap(await w.owner.client.from("invitations").select("kind").eq("email", email)) as { kind: string }[];
    expect(rows).toEqual([{ kind: "trainer_workspace" }]);

    // Cancelling leaves nothing behind.
    const model2 = scriptedModel([() => [toolUse("i2", "prepare_invitation", { kind: "network_trainer", email: `x${email}` })], () => [text("ok")]]);
    const turn2 = await runAssistantTurn(ctx, { conversation_id: turn.conversationId, message: "another" }, model2, limits);
    const card2 = turn2.messages.at(-1)!.display.cards!.find((c) => c.type === "pending_action") as { actionId: string };
    expect((await decidePendingAction(ctx, card2.actionId, "cancel")).status).toBe("cancelled");
    expect(unwrap(await w.owner.client.from("invitations").select("id").eq("email", `x${email}`))).toEqual([]);
  });

  it("enforces the daily usage budget and degrades gracefully on provider errors", async () => {
    resetRateLimits();
    const ctx = ctxFor(w.trainer, w.trainerOrg, "owner");
    await expect(runAssistantTurn(ctx, { message: "hi" }, scriptedModel([() => [text("hello")]]), { dailyRequests: 1, dailyTokens: 10 })).rejects.toThrow(/usage budget/);

    const failing: AssistantModel = {
      modelId: "test-model",
      async createMessage() {
        throw new Error("network down");
      },
    };
    const turn = await runAssistantTurn(ctx, { message: "hello?" }, failing, limits);
    expect(turn.messages.at(-1)!.display).toMatchObject({ error: true });
  });
});
