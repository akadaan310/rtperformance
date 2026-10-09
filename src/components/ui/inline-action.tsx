"use client";
import { useActionState } from "react";
import type { ActionState } from "./confirm-form";
import { SubmitButton } from "./submit-button";

/** A single-button server-action form with inline error reporting. */
export function InlineAction({
  action,
  fields,
  children,
  variant = "secondary",
  size = "sm",
  pendingLabel,
  className,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "quiet";
  size?: "sm" | "md" | "lg";
  pendingLabel?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel ?? "…"}>
        {children}
      </SubmitButton>
      {state && !state.ok && (
        <p role="alert" className="mt-1 text-xs text-signal-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
