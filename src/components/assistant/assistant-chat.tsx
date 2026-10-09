"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CircleAlert, ExternalLink, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CopyField } from "@/components/ui/copy-field";
import { Spinner } from "@/components/ui/submit-button";
import { ProgramPreview } from "@/components/program/program-preview";
import type { AssistantCard } from "@/lib/ai/tools";
import type { DisplayMessage } from "@/lib/ai/types";

const SUGGESTIONS = [
  "Create a beginner three-day strength program.",
  "Build a reusable upper-body session.",
  "Show me the athletes who missed two scheduled sessions.",
  "Summarize my coaching week.",
  "Change my workspace accent color to gold.",
  "Prepare an invitation for another trainer.",
];

export function AssistantChat({
  slug,
  conversationId: initialConversation,
  initialMessages,
  configured,
  initialPrompt,
  firstName,
}: {
  slug: string;
  conversationId: string | null;
  initialMessages: DisplayMessage[];
  configured: boolean;
  initialPrompt?: string;
  firstName?: string;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    const optimistic: DisplayMessage = { id: `local-${messages.length}`, role: "user", display: { text: message }, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, conversation_id: conversationId, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setInput(message);
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), ...data.messages]);
      if (!conversationId) {
        setConversationId(data.conversationId);
        router.replace(`/w/${slug}/assistant?c=${data.conversationId}`, { scroll: false });
      }
      router.refresh();
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(message);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[32rem] flex-col lg:h-[calc(100dvh-8rem)]">
      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto pb-6 pr-1" aria-live="polite" aria-busy={sending}>
        {!configured && (
          <div role="status" className="rounded-xs border border-gold-600/50 bg-gold-600/10 p-4 text-sm text-gold-200">
            <p className="font-semibold">The Tech Guy isn&apos;t connected yet.</p>
            <p className="mt-1 text-gold-300/90">
              The server needs <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> and <code className="font-mono text-xs">ANTHROPIC_MODEL</code>. Everything else — dashboards, programs, progress — works without it.
            </p>
          </div>
        )}
        {messages.length === 0 && (
          <div className="mx-auto max-w-2xl pt-6 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-fg">TG</span>
            <h2 className="display mt-6 text-4xl text-ivory-50">{firstName ? `What are we building, ${firstName}?` : "What are we building?"}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-stone-400">
              I read your workspace&apos;s real records and draft work in the actual program builder. Anything consequential waits for your confirmation.
            </p>
            <ul className="mt-8 grid gap-2 text-left sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" disabled={!configured || sending} onClick={() => send(s)} className="editorial w-full rounded-xs border border-ink-700 px-4 py-3 text-left text-base text-ivory-200 transition-colors hover:border-accent/60 hover:text-ivory-50 disabled:opacity-50">
                    &ldquo;{s}&rdquo;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} slug={slug} />
        ))}
        {sending && (
          <div className="flex items-center gap-3 text-sm text-stone-400">
            <Avatar />
            <span className="inline-flex items-center gap-2">
              <Spinner /> Working through your workspace…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-ink-800 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {error && (
          <p role="alert" className="mb-2 flex items-center gap-2 text-sm text-signal-400">
            <CircleAlert className="size-4" aria-hidden /> {error}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-xs border border-ink-600 bg-ink-900 p-2 focus-within:border-accent">
          <label htmlFor="assistant-input" className="sr-only">
            Message The Tech Guy
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            value={input}
            disabled={!configured}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={configured ? "Ask The Tech Guy…" : "The Tech Guy is not configured"}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ivory-50 placeholder:text-stone-500 focus:outline-none"
          />
          <Button type="submit" size="md" disabled={!configured || sending || !input.trim()} aria-label="Send">
            {sending ? <Spinner /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-stone-500">Enter to send · Shift+Enter for a new line · AI drafts are for coach review and are not medical advice.</p>
      </form>
    </div>
  );
}

function Avatar() {
  return <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">TG</span>;
}

function Message({ message, slug }: { message: DisplayMessage; slug: string }) {
  const d = message.display;
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-line rounded-xs bg-ink-800 px-4 py-3 text-sm text-ivory-50">{d.text}</p>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        {d.activity && d.activity.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tools used">
            {d.activity.map((a, i) => (
              <li key={i} className={cn("inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-[11px]", a.ok ? "border-ink-700 text-stone-400" : "border-signal-600/50 text-signal-400")}>
                <Wrench className="size-3" aria-hidden />
                {a.label}
                {!a.ok && " — failed"}
              </li>
            ))}
          </ul>
        )}
        {d.text && <RichText text={d.text} className={d.error ? "text-signal-400" : "text-ivory-100"} />}
        {d.cards?.map((c, i) => (
          <Card key={i} card={c} slug={slug} />
        ))}
      </div>
    </div>
  );
}

function Card({ card, slug }: { card: AssistantCard; slug: string }) {
  if (card.type === "program") {
    return (
      <div className="rounded-xs border border-ink-700 bg-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
          <div>
            <p className="eyebrow">
              Program · v{card.versionNumber} · {card.status}
            </p>
            <p className="display-tight mt-1 text-lg text-ivory-50">{card.name}</p>
          </div>
          <Link href={`/w/${slug}/programs/${card.programId}?v=${card.versionId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:underline">
            Open in builder <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
        <div className="p-4">
          <ProgramPreview sessions={card.sessions} compact />
        </div>
      </div>
    );
  }
  if (card.type === "pending_action") return <PendingAction card={card} slug={slug} />;
  if (card.type === "invitation") {
    return (
      <div className="rounded-xs border border-accent/40 bg-ink-900 p-4">
        <p className="mb-3 text-sm text-ivory-100">
          Invitation for <strong>{card.email}</strong>. It hasn&apos;t been emailed — share this link with them directly.
        </p>
        <CopyField value={card.url} />
      </div>
    );
  }
  return (
    <Link href={card.href} className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:underline">
      {card.label} <ExternalLink className="size-3.5" aria-hidden />
    </Link>
  );
}

function PendingAction({ card, slug }: { card: Extract<AssistantCard, { type: "pending_action" }>; slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(card.status);
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [result, setResult] = useState<{ message?: string; card?: AssistantCard; error?: string } | null>(null);

  async function decide(decision: "confirm" | "cancel") {
    setBusy(decision);
    try {
      const res = await fetch(`/api/assistant/actions/${card.actionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, decision }) });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error ?? "That didn't work." });
      else {
        setStatus(data.status);
        setResult({ message: data.message, card: data.card, error: data.status === "failed" ? data.message : undefined });
        router.refresh();
      }
    } catch {
      setResult({ error: "Couldn't reach the server." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("rounded-xs border p-4", status === "pending" ? "border-accent/60 bg-accent/5" : "border-ink-700 bg-ink-900")} role="group" aria-label="Action awaiting confirmation">
      <p className="eyebrow text-accent">{status === "pending" ? "Needs your confirmation" : status === "executed" ? "Confirmed" : status === "cancelled" ? "Cancelled" : "Failed"}</p>
      <p className="mt-1 text-sm font-semibold text-ivory-50">{card.title}</p>
      <ul className="mt-2 space-y-0.5 text-xs text-stone-300">
        {card.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      {status === "pending" && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => decide("confirm")} disabled={busy !== null}>
            {busy === "confirm" ? <Spinner /> : <Check className="size-4" aria-hidden />} Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => decide("cancel")} disabled={busy !== null}>
            {busy === "cancel" ? <Spinner /> : <X className="size-4" aria-hidden />} Cancel
          </Button>
        </div>
      )}
      {result?.error && (
        <p role="alert" className="mt-3 text-sm text-signal-400">
          {result.error}
        </p>
      )}
      {result?.message && !result.error && (
        <p role="status" className="mt-3 text-sm text-sage-400">
          {result.message}
        </p>
      )}
      {result?.card && (
        <div className="mt-3">
          <Card card={result.card} slug={slug} />
        </div>
      )}
    </div>
  );
}

/** Minimal, injection-safe Markdown: paragraphs, bullet/numbered lists, **bold**, `code`. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0] ?? "");
          const items = lines.map((l) => l.replace(/^\s*([-*•]|\d+\.)\s+/, ""));
          const ListTag = ordered ? "ol" : "ul";
          return (
            <ListTag key={i} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
              {items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ListTag>
          );
        }
        if (/^#{1,3}\s/.test(block)) return <p key={i} className="font-semibold text-ivory-50">{inline(block.replace(/^#{1,3}\s/, ""))}</p>;
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-ivory-50">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded-xs bg-ink-800 px-1 font-mono text-xs">{part.slice(1, -1)}</code>;
    return part;
  });
}
