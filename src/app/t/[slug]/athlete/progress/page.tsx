import type { Metadata } from "next";
import { GoalReport } from "@/components/athlete/goal-report";
import { Panel } from "@/components/ui/feedback";
import { ProgressView } from "@/components/progress/progress-view";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { athleteProgress } from "@/lib/services/progress";

export const metadata: Metadata = { title: "Progress" };

export default async function AthleteProgressPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ range?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireAthleteWorkspace(slug);
  const range = (["4w", "12w", "26w", "all"] as const).find((r) => r === sp.range) ?? "12w";
  const p = await athleteProgress(ctx, ctx.athleteId, range);
  const base = `/t/${ctx.org.slug}/athlete/progress`;
  const manual = p.goals.filter((g) => g.metric === "custom" && g.status === "active");
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Measured, not guessed</p>
        <h1 className="display mt-2 text-4xl text-ivory-50">Progress</h1>
      </header>
      <ProgressView
        p={p}
        rangeLinks={[
          { key: "4w", label: "4 wk", href: `${base}?range=4w` },
          { key: "12w", label: "12 wk", href: `${base}?range=12w` },
          { key: "26w", label: "26 wk", href: `${base}?range=26w` },
          { key: "all", label: "All", href: `${base}?range=all` },
        ]}
      />
      {manual.length > 0 && (
        <Panel title="Report goal progress" eyebrow="For goals you track yourself">
          <div className="space-y-4">
            {manual.map((g) => (
              <GoalReport key={g.id} slug={ctx.org.slug} goalId={g.id} title={g.title} unit={g.unit} current={g.current_value} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
