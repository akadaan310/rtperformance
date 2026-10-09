import Link from "next/link";
import { BrandTheme, WorkspaceLogo } from "@/components/brand/brand-theme";
import { AthleteBottomNav, AthleteTopNav } from "@/components/athlete/athlete-nav";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { brandAssetUrl } from "@/lib/services/branding";

export default async function AthleteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireAthleteWorkspace(slug);
  const name = ctx.brand?.display_name ?? ctx.org.name;
  return (
    <BrandTheme accent={ctx.brand?.accent_color} signal={ctx.brand?.signal_color} className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4">
          <Link href={`/t/${ctx.org.slug}/athlete`} className="flex min-w-0 items-center gap-2.5">
            <WorkspaceLogo logoUrl={brandAssetUrl(ctx.brand?.logo_path)} name={name} className="h-8 w-8" />
            <span className="truncate text-sm font-semibold text-ivory-50">{name}</span>
          </Link>
          <AthleteTopNav slug={ctx.org.slug} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-6 md:py-10">
        {children}
      </main>
      <AthleteBottomNav slug={ctx.org.slug} />
    </BrandTheme>
  );
}
