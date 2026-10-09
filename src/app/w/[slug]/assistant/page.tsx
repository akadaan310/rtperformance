import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { cn } from "@/components/ui/cn";
import { isAssistantConfigured } from "@/lib/ai/server";
import type { AssistantCard } from "@/lib/ai/tools";
import type { DisplayMessage, DisplayPayload } from "@/lib/ai/types";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { formatRelative } from "@/lib/dates";

export const metadata: Metadata = { title: "The Tech Guy" };

export default async function AssistantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; prompt?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const base = `/w/${ctx.org.slug}/assistant`;

  // RLS limits conversations to this coach in this workspace.
  const { data: conversations } = await ctx.supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(30);
  const current = sp.c ? (conversations ?? []).find((c) => c.id === sp.c) : undefined;

  let messages: DisplayMessage[] = [];
  if (current) {
    const [{ data: rows }, { data: actions }] = await Promise.all([
      ctx.supabase.from("ai_messages").select("id, role, display, created_at").eq("conversation_id", current.id).not("display", "is", null).order("created_at").limit(200),
      ctx.supabase.from("ai_pending_actions").select("id, status").eq("conversation_id", current.id),
    ]);
    const statusById = new Map((actions ?? []).map((a) => [a.id as string, a.status as string]));
    messages = (rows ?? []).map((r) => {
      const display = r.display as DisplayPayload;
      return {
        id: r.id as string,
        role: r.role as "user" | "assistant",
        created_at: r.created_at as string,
        display: {
          ...display,
          cards: display.cards?.map((card: AssistantCard) =>
            card.type === "pending_action" ? { ...card, status: (statusById.get(card.actionId) === "executing" ? "pending" : (statusById.get(card.actionId) as typeof card.status)) ?? card.status } : card,
          ),
        },
      };
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside className="hidden lg:block">
        <Link href={base} className="mb-4 flex items-center gap-2 rounded-xs border border-ink-700 px-3 py-2 text-sm text-ivory-100 hover:border-accent/60">
          <MessageSquarePlus className="size-4 text-accent" aria-hidden /> New conversation
        </Link>
        <p className="eyebrow mb-2 px-1">Your conversations</p>
        <ul className="space-y-0.5">
          {(conversations ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`${base}?c=${c.id}`} aria-current={c.id === current?.id ? "page" : undefined} className={cn("block rounded-xs px-3 py-2 text-sm", c.id === current?.id ? "bg-ink-800 text-ivory-50" : "text-stone-400 hover:bg-ink-850 hover:text-ivory-100")}>
                <span className="line-clamp-1">{c.title}</span>
                <span className="text-[11px] text-stone-500">{formatRelative(c.updated_at as string)}</span>
              </Link>
            </li>
          ))}
          {!conversations?.length && <li className="px-3 text-xs text-stone-500">None yet. Conversations are private to you.</li>}
        </ul>
      </aside>
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <h1 className="display text-3xl text-ivory-50">The Tech Guy</h1>
          <Link href={base} className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            New
          </Link>
        </div>
        <AssistantChat
          key={current?.id ?? "new"}
          slug={ctx.org.slug}
          conversationId={current?.id ?? null}
          initialMessages={messages}
          configured={isAssistantConfigured()}
          initialPrompt={current ? undefined : sp.prompt?.slice(0, 500)}
          firstName={ctx.user.fullName?.split(" ")[0]}
        />
      </div>
    </div>
  );
}
