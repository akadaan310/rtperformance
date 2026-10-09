import Link from "next/link";
import { cn } from "./cn";

export function TabNav({ tabs, active, label }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="scrollbar-thin -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-ink-700 px-1">
      {tabs.map((t) => {
        const current = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "relative -mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
              current ? "border-accent text-ivory-50" : "border-transparent text-stone-400 hover:text-ivory-100",
            )}
          >
            {t.label}
            {typeof t.count === "number" && <span className="ml-1.5 text-stone-500">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
