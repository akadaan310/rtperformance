"use client";
import { useActionState, useRef, useEffect, type ReactNode } from "react";
import { Button } from "./button";
import { SubmitButton } from "./submit-button";
import { FormMessage } from "./feedback";

export type ActionState = { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; url?: string } | null;

/**
 * A button that opens an accessible confirmation dialog before submitting a server action.
 * Used for destructive or consequential operations.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "primary",
  triggerVariant = "secondary",
  triggerSize = "sm",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "quiet";
  triggerSize?: "sm" | "md" | "lg";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => dialog.current?.showModal()}>
        {trigger}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${title}-title`}
        className="m-auto w-[min(92vw,28rem)] rounded-sm border border-ink-600 bg-ink-850 p-0 text-ivory-100 shadow-lift backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form action={formAction} className="space-y-4 p-6">
          <h2 id={`${title}-title`} className="display-tight text-2xl text-ivory-50">
            {title}
          </h2>
          <div className="text-sm leading-relaxed text-stone-300">{body}</div>
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <FormMessage state={state && !state.ok ? state : null} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <SubmitButton variant={tone === "danger" ? "danger" : "primary"} pendingLabel="Working…">
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
