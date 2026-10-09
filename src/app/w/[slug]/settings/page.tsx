import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { BrandEditor } from "@/components/coach/brand-editor";
import { Badge, PageHeader, Panel } from "@/components/ui/feedback";
import { TabNav } from "@/components/ui/tabs";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatRelative } from "@/lib/dates";
import { brandAssetUrl, getBrand } from "@/lib/services/branding";
import { listAuditEvents } from "@/lib/services/network";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; welcome?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const tab = sp.tab === "activity" && can(ctx, "audit.read") ? "activity" : sp.tab === "metrics" ? "metrics" : "brand";
  const base = `/w/${ctx.org.slug}/settings`;
  const brand = await getBrand(ctx);
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description={
          <>
            Your workspace lives at{" "}
            <Link href={`/t/${ctx.org.slug}`} className="inline-flex items-center gap-1 text-accent hover:underline">
              /t/{ctx.org.slug} <ExternalLink className="size-3" aria-hidden />
            </Link>
            . Athletes sign in there to reach their portal.
          </>
        }
      />
      {sp.welcome && (
        <div role="status" className="mb-6 rounded-xs border border-accent/50 bg-accent/10 p-5 text-sm text-ivory-100">
          <p className="display-tight text-xl text-ivory-50">Your workspace is live.</p>
          <p className="mt-1 text-stone-300">Set your brand below, then add your first athlete and build a program. Your clients and records are private to this workspace.</p>
        </div>
      )}
      <TabNav
        label="Settings sections"
        active={tab}
        tabs={[
          { key: "brand", label: "Branding", href: base },
          { key: "team", label: "Team", href: `${base}/team` },
          ...(can(ctx, "audit.read") ? [{ key: "activity", label: "Activity log", href: `${base}?tab=activity` }] : []),
          { key: "metrics", label: "Metric definitions", href: `${base}?tab=metrics` },
        ]}
      />
      {tab === "brand" &&
        (brand && can(ctx, "brand.write") ? (
          <BrandEditor slug={ctx.org.slug} brand={brand} logoUrl={brandAssetUrl(brand.logo_path)} photoUrl={brandAssetUrl(brand.photo_path)} orgName={ctx.org.name} />
        ) : (
          <Panel title="Branding">
            <p className="text-sm text-stone-400">Only workspace owners can change branding. Current accent: <span className="font-mono text-ivory-100">{brand?.accent_color}</span></p>
          </Panel>
        ))}
      {tab === "activity" && <ActivityLog ctx={ctx} />}
      {tab === "metrics" && <MetricDefinitions />}
    </>
  );
}

async function ActivityLog({ ctx }: { ctx: Awaited<ReturnType<typeof requireCoachWorkspace>> }) {
  const events = await listAuditEvents(ctx, 100);
  return (
    <Panel title="Activity log" eyebrow="Administrative & AI-triggered changes" bodyClassName="p-0">
      {events.length ? (
        <ul className="divide-y divide-ink-800">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="text-ivory-100">
                  {e.action.replace(".", " · ").replace(/_/g, " ")}
                  {typeof e.metadata?.name === "string" ? ` — ${e.metadata.name}` : ""}
                </p>
                <p className="text-xs text-stone-500">{e.actor_name ?? "System"}</p>
              </div>
              <div className="flex items-center gap-2">
                {e.source === "ai" && <Badge tone="accent">via The Tech Guy</Badge>}
                <span className="text-xs text-stone-500">{formatRelative(e.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-stone-500">No events yet.</p>
      )}
    </Panel>
  );
}

function MetricDefinitions() {
  const defs = [
    ["Attendance", "Completed scheduled sessions ÷ scheduled sessions that were due (dated before today) and not excused by the coach. A session dated today is still open and never counts as missed."],
    ["Missed session", "A planned session dated before today with no completed workout. Coaches can excuse a session, which removes it from attendance."],
    ["Program adherence", "Across completed workouts that came from the schedule: prescribed sets actually completed ÷ prescribed sets (capped per exercise at the prescription). Attendance and adherence are independent."],
    ["Session completion", "Workouts marked complete ÷ workouts started in the period."],
    ["Estimated 1RM", "Epley formula, weight × (1 + reps ÷ 30), from completed sets of 1–12 reps. Higher-rep sets don't produce an estimate. kg is converted to lb."],
    ["Personal record", "The best estimated 1RM, heaviest completed set, most reps, longest duration or farthest distance for an exercise. Dashboard highlights only count records on exercises with earlier history."],
    ["Volume", "Sum of weight × reps for completed, loaded sets (lb). Bodyweight, timed and distance work are excluded rather than guessed."],
    ["Consistency", "Completed workouts per calendar week (Mon–Sun). The streak counts consecutive weeks with at least one completed workout; the current week doesn't break it."],
    ["Goal progress", "(current − baseline) ÷ (target − baseline), clamped to 0–100%. Strength goals read their current value from records; consistency goals use the 4-week average; custom goals use the reported value."],
    ["Needs attention", "2+ missed sessions in 14 days; no completed workout in 10+ days while on an active schedule; or two consecutive self-reported recovery ratings of 2/5 or lower. These are prompts to check in, not assessments."],
  ];
  return (
    <section id="metrics" className="surface divide-y divide-ink-800">
      {defs.map(([t, d]) => (
        <div key={t} className="grid gap-2 px-5 py-4 md:grid-cols-[14rem_1fr]">
          <h3 className="text-sm font-semibold text-ivory-50">{t}</h3>
          <p className="text-sm leading-relaxed text-stone-400">{d}</p>
        </div>
      ))}
      <p className="px-5 py-4 text-xs text-stone-500">All metrics are calculated deterministically from recorded data — no AI is involved. Body composition, injury risk and physiological recovery are never inferred.</p>
    </section>
  );
}
