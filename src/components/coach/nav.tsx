"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Bot, Dumbbell, LayoutGrid, Menu, Network, Settings, Users, X, ClipboardList } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface NavProps {
  slug: string;
  showNetwork: boolean;
  showTeam: boolean;
}

const ICONS = { dashboard: LayoutGrid, athletes: Users, programs: ClipboardList, exercises: Dumbbell, assistant: Bot, settings: Settings, network: Network, progress: BarChart3 };

export function navItems({ slug, showNetwork }: NavProps) {
  const items = [
    { key: "dashboard", label: "Command center", href: `/w/${slug}` },
    { key: "athletes", label: "Athletes", href: `/w/${slug}/athletes` },
    { key: "programs", label: "Programs", href: `/w/${slug}/programs` },
    { key: "exercises", label: "Exercise library", href: `/w/${slug}/exercises` },
    { key: "assistant", label: "The Tech Guy", href: `/w/${slug}/assistant` },
    { key: "settings", label: "Workspace", href: `/w/${slug}/settings` },
  ] as const;
  return showNetwork ? [...items, { key: "network", label: "Network", href: `/w/${slug}/network` } as const] : items;
}

function isActive(pathname: string, href: string, slug: string) {
  return href === `/w/${slug}` ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav(props: NavProps) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {navItems(props).map((item) => {
        const Icon = ICONS[item.key as keyof typeof ICONS];
        const active = isActive(pathname, item.href, props.slug);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xs px-3 py-2 text-sm transition-colors",
                active ? "bg-ink-800 text-ivory-50" : "text-stone-400 hover:bg-ink-850 hover:text-ivory-100",
              )}
            >
              <Icon className={cn("size-4", active ? "text-accent" : "text-stone-500 group-hover:text-stone-300")} aria-hidden />
              {item.label}
              {item.key === "assistant" && <span className="ml-auto rounded-xs bg-accent/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-accent">AI</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({ children, ...props }: NavProps & { children: React.ReactNode }) {
  const pathname = usePathname();
  // The menu is "open for" the path it was opened on, so navigating closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => setOpenFor((typeof next === "function" ? next(open) : next) ? pathname : null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex size-10 items-center justify-center rounded-xs text-ivory-100 hover:bg-ink-800 lg:hidden"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 bottom-0 top-16 z-40 animate-fade overflow-y-auto border-t border-ink-700 bg-ink-950 p-4 lg:hidden">
          <SidebarNav {...props} />
          <div className="mt-6 border-t border-ink-700 pt-4">{children}</div>
        </div>
      )}
    </>
  );
}
