"use client";
import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";

/** Submit button that reflects the enclosing form's pending state. */
export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return <span aria-hidden className={`${className} inline-block animate-spin rounded-full border-2 border-current border-r-transparent`} />;
}
