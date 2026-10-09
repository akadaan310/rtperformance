import type { ReactNode } from "react";
import { accentForeground, legibleAccent } from "@/lib/brand/color";

/** Scopes a workspace's accent colors to its subtree via CSS custom properties. */
export function BrandTheme({ accent, signal, children, className }: { accent?: string | null; signal?: string | null; children: ReactNode; className?: string }) {
  const a = legibleAccent(accent ?? "#C8A45D");
  const style = {
    "--brand-accent": a,
    "--brand-accent-fg": accentForeground(a),
    "--brand-signal": signal ?? "#C2412D",
  } as React.CSSProperties;
  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}

export function WorkspaceLogo({ logoUrl, name, className = "h-8 w-8" }: { logoUrl: string | null; name: string; className?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from Supabase Storage
    return <img src={logoUrl} alt={`${name} logo`} className={`${className} rounded-xs object-contain`} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`${className} display-tight inline-flex shrink-0 items-center justify-center rounded-xs border border-accent/60 bg-ink-900 text-sm text-accent`}>
      {initials || "RT"}
    </span>
  );
}
