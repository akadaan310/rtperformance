import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xs font-semibold tracking-wide transition-[background-color,color,border-color,transform] duration-200 disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  secondary: "border border-ink-600 bg-transparent text-ivory-100 hover:border-ivory-300 hover:bg-ink-800",
  ghost: "text-ivory-200 hover:bg-ink-800 hover:text-ivory-50",
  danger: "border border-signal-600/70 text-signal-400 hover:bg-signal-600/15 hover:text-ivory-50",
  quiet: "text-stone-400 hover:text-ivory-100 underline-offset-4 hover:underline",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm uppercase tracking-[0.14em]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & { variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
