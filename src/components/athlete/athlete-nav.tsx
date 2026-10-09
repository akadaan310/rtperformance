"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, ClipboardList, History, LineChart, UserRound } from "lucide-react";
import { cn } from "@/components/ui/cn";

export function athleteTabs(slug: string) {
  const base = `/t/${slug}/athlete`;
  return [
    { href: base, label: "Today", icon: CalendarCheck },
    { href: `${base}/program`, label: "Program", icon: ClipboardList },
    { href: `${base}/history`, label: "History", icon: History },
    { href: `${base}/progress`, label: "Progress", icon: LineChart },
    { href: `${base}/profile`, label: "Profile", icon: UserRound },
  ];
}

function active(pathname: string, href: string, base: string) {
  return href === base ? pathname === base : pathname.startsWith(href);
}

export function AthleteTopNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/t/${slug}/athlete`;
  return (
    <nav aria-label="Portal" className="hidden gap-1 md:flex">
      {athleteTabs(slug).map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(pathname, t.href, base) ? "page" : undefined} className={cn("rounded-xs px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]", active(pathname, t.href, base) ? "bg-ink-800 text-accent" : "text-stone-400 hover:text-ivory-100")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function AthleteBottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/t/${slug}/athlete`;
  return (
    <nav aria-label="Portal" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {athleteTabs(slug).map((t) => {
          const on = active(pathname, t.href, base);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em]", on ? "text-accent" : "text-stone-500")}>
                <Icon className="size-5" aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
