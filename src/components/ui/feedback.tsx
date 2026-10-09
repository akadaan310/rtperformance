import type { ReactNode } from "react";
import { cn } from "./cn";

export function FormMessage({ state }: { state?: { ok: boolean; error?: string; message?: string } | null }) {
  if (!state) return null;
  if (!state.ok && state.error)
    return (
      <p role="alert" className="rounded-xs border border-signal-600/50 bg-signal-600/10 px-3 py-2 text-sm text-signal-400">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-xs border border-sage-500/40 bg-sage-500/10 px-3 py-2 text-sm text-sage-400">
        {state.message}
      </p>
    );
  return null;
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "muted";
const tones: Record<Tone, string> = {
  neutral: "border-ink-600 text-ivory-200",
  accent: "border-accent/50 text-accent",
  success: "border-sage-500/50 text-sage-400",
  warning: "border-gold-600/60 text-gold-300",
  danger: "border-signal-600/60 text-signal-400",
  muted: "border-ink-700 text-stone-500",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-sm border border-dashed border-ink-600 px-6 py-10 text-center", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px w-1/2 rule-accent opacity-60" />
      {icon && <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full border border-ink-600 text-accent">{icon}</div>}
      <h3 className="display-tight text-xl text-ivory-50">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-400">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Panel({ title, eyebrow, action, children, className, bodyClassName }: { title?: ReactNode; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("surface min-w-0", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-700/80 px-5 py-4">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && <h2 className="text-sm font-semibold tracking-wide text-ivory-50">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {/* bodyClassName replaces the default padding entirely (e.g. "p-0" for edge-to-edge lists). */}
      <div className={bodyClassName ?? "px-5 py-4"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "accent" | "signal" }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p data-numeric className={cn("display-tight mt-2 text-4xl", tone === "accent" ? "text-accent" : tone === "signal" ? "text-signal-400" : "text-ivory-50")}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-4xl text-ivory-50 md:text-5xl">{title}</h1>
        {description && <div className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-400">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xs bg-ink-800", className)} />;
}

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const pct = value === null ? 0 : Math.round(value * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : pct} className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}
