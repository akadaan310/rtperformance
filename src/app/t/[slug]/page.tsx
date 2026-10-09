import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { BrandTheme, WorkspaceLogo } from "@/components/brand/brand-theme";
import { RTMark } from "@/components/brand/rt-mark";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser, getWorkspaceContext, homePathFor } from "@/lib/auth/context";
import { brandAssetUrl } from "@/lib/services/branding";
import { createClient } from "@/lib/supabase/server";

interface PublicWorkspace {
  org_id: string;
  slug: string;
  display_name: string;
  coach_name: string | null;
  coach_bio: string | null;
  logo_path: string | null;
  photo_path: string | null;
  accent_color: string;
  signal_color: string;
  welcome_headline: string | null;
  welcome_body: string | null;
  portal_tagline: string | null;
  location: string | null;
  public_profile_enabled: boolean;
}

async function load(slug: string): Promise<PublicWorkspace | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_workspace", { p_slug: slug });
  return ((Array.isArray(data) ? data[0] : data) as PublicWorkspace | undefined) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const ws = await load((await params).slug);
  if (!ws) return { title: "Not found" };
  return { title: ws.display_name, description: ws.portal_tagline ?? ws.welcome_body ?? undefined, robots: ws.public_profile_enabled ? undefined : { index: false } };
}

export default async function PublicWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await load(slug);
  if (!ws) notFound();
  const user = await getSessionUser();
  const ctx = user ? await getWorkspaceContext(ws.slug) : null;
  const photo = brandAssetUrl(ws.photo_path);
  const enter = ctx ? homePathFor({ slug: ws.slug, role: ctx.role }) : `/login?next=${encodeURIComponent(`/t/${ws.slug}/athlete`)}`;

  return (
    <BrandTheme accent={ws.accent_color} signal={ws.signal_color} className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-3">
          <WorkspaceLogo logoUrl={brandAssetUrl(ws.logo_path)} name={ws.display_name} className="h-10 w-10" />
          <span className="text-sm font-semibold text-ivory-50">{ws.display_name}</span>
        </span>
        <ButtonLink href={enter} size="sm" variant={ctx ? "primary" : "secondary"}>
          {ctx ? (ctx.role === "athlete" ? "Open my portal" : "Open workspace") : "Athlete sign in"}
        </ButtonLink>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-6 pb-24">
        <section className={`grid items-end gap-12 py-12 md:py-20 ${ws.public_profile_enabled && photo ? "md:grid-cols-[1.2fr_1fr]" : ""}`}>
          <div>
            {ws.portal_tagline && <p className="eyebrow text-accent">{ws.portal_tagline}</p>}
            <h1 className="display mt-5 text-5xl text-ivory-50 md:text-7xl">{ws.welcome_headline ?? ws.display_name}</h1>
            {ws.welcome_body && <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-300">{ws.welcome_body}</p>}
            <div className="mt-10 flex flex-wrap gap-3">
              <ButtonLink href={enter} size="lg">
                {ctx ? "Continue" : "Sign in to your portal"}
              </ButtonLink>
            </div>
            {!ctx && <p className="mt-4 max-w-md text-xs text-stone-500">Training here is by invitation. Your coach will send you a personal link to set up your account.</p>}
          </div>
          {ws.public_profile_enabled && photo && (
            <div className="relative aspect-[4/5] overflow-hidden rounded-xs border border-ink-700">
              {/* eslint-disable-next-line @next/next/no-img-element -- coach-uploaded photo */}
              <img src={photo} alt={ws.coach_name ? `Portrait of ${ws.coach_name}` : "Coach portrait"} className="size-full object-cover" />
            </div>
          )}
        </section>

        {ws.public_profile_enabled && (ws.coach_name || ws.coach_bio) && (
          <section aria-labelledby="coach-title" className="border-t border-ink-800 pt-12">
            <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
              <div>
                <p className="eyebrow">Your coach</p>
                {ws.coach_name && (
                  <h2 id="coach-title" className="display-tight mt-3 text-3xl text-ivory-50">
                    {ws.coach_name}
                  </h2>
                )}
                {ws.location && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-400">
                    <MapPin className="size-4 text-accent" aria-hidden /> {ws.location}
                  </p>
                )}
              </div>
              {ws.coach_bio && <p className="max-w-2xl whitespace-pre-line text-base leading-relaxed text-stone-300">{ws.coach_bio}</p>}
            </div>
          </section>
        )}
      </main>
      <footer className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-[11px] uppercase tracking-[0.18em] text-stone-500">
          <span>© {new Date().getFullYear()} {ws.display_name}</span>
          <Link href="/" className="flex items-center gap-2 hover:text-ivory-200">
            <RTMark className="h-4 w-4" /> Powered by RT Performance
          </Link>
        </div>
      </footer>
    </BrandTheme>
  );
}
