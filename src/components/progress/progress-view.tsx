import { Trophy } from "lucide-react";
import { BarSeries, TrendLine } from "@/components/charts/charts";
import { Badge, Panel, ProgressBar, Stat } from "@/components/ui/feedback";
import { formatDate } from "@/lib/dates";
import { pct } from "@/lib/metrics";
import type { athleteProgress } from "@/lib/services/progress";

type Progress = Awaited<ReturnType<typeof athleteProgress>>;


/** Deterministic progress view shared by the coach profile and the athlete portal. */
export function ProgressView({ p, rangeLinks }: { p: Progress; rangeLinks: { key: string; label: string; href: string }[] }) {
  const weeks = p.consistency.series.map((s) => ({ label: formatDate(s.week), value: s.sessions }));
  const volume = p.volume.map((v) => ({ label: formatDate(v.week), value: v.volume_lb }));
  const effort = p.effort.filter((e) => e.effort !== null).map((e) => ({ label: formatDate(e.date), value: e.effort }));
  const recovery = p.effort.filter((e) => e.recovery !== null).map((e) => ({ label: formatDate(e.date), value: e.recovery }));
  return (
    <div className="space-y-6">
      <nav aria-label="Date range" className="flex flex-wrap gap-1">
        {rangeLinks.map((r) => (
          <a
            key={r.key}
            href={r.href}
            aria-current={r.key === p.range ? "page" : undefined}
            className={`rounded-xs border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${r.key === p.range ? "border-accent text-accent" : "border-ink-700 text-stone-400 hover:text-ivory-100"}`}
          >
            {r.label}
          </a>
        ))}
      </nav>

      <section aria-label="Summary metrics" className="surface grid grid-cols-2 gap-px overflow-hidden bg-ink-700/80 md:grid-cols-4">
        <div className="bg-ink-900 p-5">
          <Stat label="Attendance" value={pct(p.attendance.rate)} sub={`${p.attendance.completed} of ${p.attendance.completed + p.attendance.missed} due sessions`} />
        </div>
        <div className="bg-ink-900 p-5">
          <Stat label="Adherence" value={pct(p.adherence.rate)} sub={`${p.adherence.performed}/${p.adherence.prescribed} prescribed sets`} />
        </div>
        <div className="bg-ink-900 p-5">
          <Stat label="Completion" value={pct(p.completion.rate)} sub={`${p.completion.completed} of ${p.completion.started} started`} />
        </div>
        <div className="bg-ink-900 p-5">
          <Stat label="Active streak" value={`${p.consistency.streak_weeks} wk`} sub={`${p.consistency.average_per_week} sessions / week avg`} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <BarSeries title="Workouts per week" points={weeks} unit="sessions" summary={`Average ${p.consistency.average_per_week} completed workouts per week; ${p.consistency.active_weeks} of ${weeks.length} weeks active.`} />
        </Panel>
        <Panel>
          <BarSeries title="Weekly volume" points={volume} unit="lb" format="integer" summary="Sum of weight × reps for completed loaded sets (kg converted to lb). Bodyweight and timed work are excluded." />
        </Panel>
      </div>

      {p.trends.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {p.trends.map((t) => {
            const isLoad = t.measurement === "reps_weight" && t.points.some((pt) => pt.e1rm_lb !== null);
            const kind = isLoad ? "load" : t.measurement === "time" ? "time" : t.measurement === "distance" ? "distance" : "reps";
            const unit = { load: "lb", time: "s", distance: "m", reps: "reps" }[kind];
            const label = { load: "estimated 1RM", time: "longest set", distance: "farthest set", reps: "best reps" }[kind];
            const points = t.points.map((pt) => ({ label: formatDate(pt.date), value: kind === "load" ? pt.e1rm_lb : kind === "time" ? pt.seconds : kind === "distance" ? pt.distance_m : pt.reps }));
            const first = points.find((x) => x.value !== null)?.value;
            const last = [...points].reverse().find((x) => x.value !== null)?.value;
            return (
              <Panel key={t.exercise_id}>
                <TrendLine
                  title={`${t.name} · ${label}`}
                  points={points}
                  unit={unit}
                  summary={first != null && last != null ? `From ${first} to ${last} ${unit} across ${points.length} sessions.` : "Not enough data."}
                />
              </Panel>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <TrendLine title="Session effort (RPE 1–10)" points={effort} summary="Self-reported effort after each completed workout." />
        </Panel>
        <Panel>
          <TrendLine title="Recovery check-in (1–5)" points={recovery} summary="Self-reported recovery. Reported as given — not a physiological measurement." />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Personal records" eyebrow="All time" bodyClassName="p-0">
          {p.records.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
                    <th className="px-5 py-2 font-semibold">Exercise</th>
                    <th className="px-3 py-2 text-right font-semibold">Est. 1RM</th>
                    <th className="px-3 py-2 text-right font-semibold">Top set</th>
                    <th className="px-5 py-2 text-right font-semibold">Best reps</th>
                  </tr>
                </thead>
                <tbody>
                  {p.records.slice(0, 15).map((r) => (
                    <tr key={r.exercise_id} className="border-t border-ink-800">
                      <td className="px-5 py-2 text-ivory-100">{r.exercise_name}</td>
                      <td className="px-3 py-2 text-right text-ivory-50">{r.best_e1rm_lb ? `${Math.round(r.best_e1rm_lb)} lb` : "—"}</td>
                      <td className="px-3 py-2 text-right text-stone-300">{r.heaviest_lb ? `${r.heaviest_lb} lb` : "—"}</td>
                      <td className="px-5 py-2 text-right text-stone-300">{r.most_reps ?? (r.longest_seconds ? `${r.longest_seconds}s` : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">Records appear after the first completed workout.</p>
          )}
          {p.recentRecords.length > 0 && (
            <ul className="border-t border-ink-700 px-5 py-3 text-xs text-stone-400">
              {p.recentRecords.slice(0, 4).map((r, i) => (
                <li key={i} className="flex items-center gap-2 py-0.5">
                  <Trophy className="size-3.5 text-accent" aria-hidden />
                  {r.exercise_name}: {r.kind === "e1rm" ? `est. 1RM ${Math.round(r.value)} lb` : r.kind === "weight" ? `${r.value} lb` : r.kind === "reps" ? `${r.value} reps` : r.kind === "time" ? `${r.value}s` : `${r.value} m`} · {formatDate(r.on)}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Goals" eyebrow="Progress" bodyClassName="space-y-5 px-5 py-4">
          {p.goals.length ? (
            p.goals.map((g) => (
              <div key={g.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-ivory-100">{g.title}</p>
                  {g.status === "achieved" ? <Badge tone="success">Achieved</Badge> : g.progress === 1 ? <Badge tone="accent">Target reached</Badge> : <span className="text-xs text-stone-400" data-numeric>{pct(g.progress)}</span>}
                </div>
                <div className="mt-2">
                  <ProgressBar value={g.status === "achieved" ? 1 : g.progress} label={g.title} />
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {g.computed_current !== null ? `Now ${Math.round(g.computed_current * 10) / 10}` : "No data yet"}
                  {g.target_value !== null ? ` · target ${g.target_value}` : ""} {g.unit ?? (g.metric === "estimated_1rm" || g.metric === "max_weight" ? "lb" : "")}
                  {g.target_date ? ` · by ${formatDate(g.target_date)}` : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-500">No goals set yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
