"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyField({ value, label = "Invitation link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <p className="eyebrow">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-xs border border-accent/50 bg-ink-950 px-3 py-2 font-mono text-xs text-ivory-100" />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 rounded-xs bg-accent px-3 text-xs font-semibold text-accent-fg"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-stone-500">This link is shown once. Send it directly to the invitee — it only works for their email address.</p>
    </div>
  );
}
