import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export const inputClass =
  "block w-full rounded-xs border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ivory-50 placeholder:text-stone-500 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 aria-[invalid=true]:border-signal-500";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">
        <span>{label}</span>
        {optional && <span className="text-[10px] font-medium normal-case tracking-normal text-stone-500">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-signal-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn(inputClass, "min-h-24 leading-relaxed", className)} {...props} />;
}

export function Select({ className, invalid, children, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select aria-invalid={invalid || undefined} className={cn(inputClass, "appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%239b958a' stroke-width='1.5'><path d='M3 4.5l3 3 3-3'/></svg>\")" }} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm text-ivory-200", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs border-ink-500 bg-ink-900 accent-[var(--brand-accent)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
