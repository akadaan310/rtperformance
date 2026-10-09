import Link from "next/link";
import { BrandTheme, WorkspaceLogo } from "@/components/brand/brand-theme";
import { RTMark } from "@/components/brand/rt-mark";
import { MobileNav, SidebarNav } from "@/components/coach/nav";
import { SignOutButton } from "@/components/coach/sign-out-button";
import { Badge } from "@/components/ui/feedback";
import { listMyMemberships, requireCoachWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { brandAssetUrl } from "@/lib/services/branding";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCoachWorkspace(slug);
  const memberships = await listMyMemberships();
  const name = ctx.brand?.display_name ?? ctx.org.name;
  const navProps = { slug: ctx.org.slug, showNetwork: can(ctx, "network.manage"), showTeam: can(ctx, "team.manage") };
  const footer = (
    <div className="space-y-3">
      <div className="px-3">
        <p className="truncate text-sm font-medium text-ivory-100">{ctx.user.fullName ?? ctx.user.email}</p>
        <p className="truncate text-xs text-stone-500">
          {ctx.role === "owner" ? "Owner" : "Trainer"}
          {ctx.isMasterOwner && ctx.workspaceIsMaster ? " · Network owner" : ""}
        </p>
      </div>
      {memberships.length > 1 && (
        <Link href="/home?choose=1" className="block px-3 text-xs text-stone-400 hover:text-accent">
          Switch workspace ({memberships.length})
        </Link>
      )}
      <SignOutButton compact />
    </div>
  );

  return (
    <BrandTheme accent={ctx.brand?.accent_color} signal={ctx.brand?.signal_color} className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-ink-800 bg-ink-950 lg:flex">
        <div className="flex items-center gap-3 border-b border-ink-800 px-5 py-5">
          <WorkspaceLogo logoUrl={brandAssetUrl(ctx.brand?.logo_path)} name={name} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ivory-50">{name}</p>
            {ctx.workspaceIsMaster ? <Badge tone="accent" className="mt-1">Network HQ</Badge> : <p className="text-[11px] text-stone-500">/{ctx.org.slug}</p>}
          </div>
        </div>
        <nav aria-label="Workspace" className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5">
          <SidebarNav {...navProps} />
        </nav>
        <div className="border-t border-ink-800 px-2 py-4">{footer}</div>
        <div className="flex items-center gap-2 border-t border-ink-800 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-500">
          <RTMark className="h-4 w-4" /> RT Performance
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ink-800 bg-ink-950/90 px-4 backdrop-blur lg:hidden">
          <Link href={`/w/${ctx.org.slug}`} className="flex min-w-0 items-center gap-2.5">
            <WorkspaceLogo logoUrl={brandAssetUrl(ctx.brand?.logo_path)} name={name} className="h-8 w-8" />
            <span className="truncate text-sm font-semibold text-ivory-50">{name}</span>
          </Link>
          <MobileNav {...navProps}>{footer}</MobileNav>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {children}
        </main>
      </div>
    </BrandTheme>
  );
}
