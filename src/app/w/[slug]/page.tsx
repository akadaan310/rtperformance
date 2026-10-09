import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, Trophy, UserPlus, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, PageHeader, Panel, Stat } from "@/components/ui/feedback";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatDateLong, formatRelative } from "@/lib/dates";
import { pct } from "@/lib/metrics";
import { getDashboard } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Command center" };

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCoachWorkspace(slug);
  const d = await getDashboard(ctx);
  const base = `/w/${ctx.org.slug}`;
  const firstName = ctx.user.fullName?.split(" ")[0];

  const actions = (
    <>
      <ButtonLink href={`${base}/athletes/new`} variant="secondary" size="sm">
        <UserPlus className="size-4" aria-hidden /> Add athlete
      </ButtonLink>
      <ButtonLink href={`${base}/programs/new`} variant="secondary" size="sm">
        <ClipboardList className="size-4" aria-hidden /> New program
      </ButtonLink>
      {can(ctx, "network.manage") ? (
        <ButtonLink href={`${base}/network#invite`} size="sm">
          Invite a trainer
        </ButtonLink>
      ) : can(ctx, "team.manage") ? (
        <ButtonLink href={`${base}/settings/team`} size="sm">
          Invite a trainer
        </ButtonLink>
      ) : null}
    </>
  );

  if (d.counts.activeAthletes === 0) {
    return (
      <>
        <PageHeader eyebrow={formatDateLong(d.today)} title={firstName ? `Welcome, ${firstName}.` : "Welcome."} actions={actions} />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { n: "01", t: "Add your first athlete", b: "Record goals, experience, equipment and any limitations they share with you.", href: `${base}/athletes/new`, cta: "Add athlete" },
            { n: "02", t: "Build a program", b: "Write sessions from the exercise library — or ask The Tech Guy for a draft to review.", href: `${base}/programs/new`, cta: "Create program" },
            { n: "03", t: "Publish & assign", b: "Assign a published version and the schedule appears in the athlete's portal.", href: `${base}/programs`, cta: "View programs" },
          ].map((s) => (
            <div key={s.n} className="surface flex flex-col p-6">
              <span className="display-tight text-3xl text-accent">{s.n}</span>
              <h2 className="mt-4 text-base font-semibold text-ivory-50">{s.t}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-400">{s.b}</p>
              <Link href={s.href} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent hover:underline">
                {s.cta} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-stone-500">
          Every metric in the command center is calculated from your workspace&apos;s own records. They&apos;ll appear here as soon as athletes start training.
        </p>
      </>
    );
  }

  const w = d.weekly;
  return (
    <>
      <PageHeader eyebrow={formatDateLong(d.today)} title="Command center" actions={actions} />

      <section aria-label="Key numbers" className="surface grid grid-cols-2 gap-px overflow-hidden bg-ink-700/80 md:grid-cols-4">
        {[
          <Stat key="a" label="Active athletes" value={d.counts.activeAthletes} sub={`${d.counts.linkedAthletes} with portal access`} />,
          <Stat key="u" label="Next 7 days" value={d.counts.upcoming7d} sub="scheduled sessions" />,
          <Stat key="att" label="Attendance · 28d" value={pct(d.attendance28.rate)} sub={`${d.attendance28.completed} done · ${d.attendance28.missed} missed`} tone={d.attendance28.rate !== null && d.attendance28.rate < 0.7 ? "signal" : undefined} />,
          <Stat key="adh" label="Adherence · 28d" value={pct(d.adherence28.rate)} sub={`${d.adherence28.performed}/${d.adherence28.prescribed} prescribed sets`} />,
        ].map((s, i) => (
          <div key={i} className="bg-ink-900 p-5">
            {s}
          </div>
        ))}
      </section>

      <section aria-labelledby="week-title" className="mt-6 surface relative overflow-hidden p-6">
        <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
        <p className="eyebrow">Week of {formatDate(w.weekOf, { month: "long", day: "numeric" })}</p>
        <h2 id="week-title" className="display-tight mt-2 text-2xl text-ivory-50 md:text-3xl">
          {w.completedWorkouts} workout{w.completedWorkouts === 1 ? "" : "s"} completed
          <span className="text-stone-500"> of {w.scheduled} scheduled</span>
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-stone-300">
          {w.missed > 0 ? `${w.missed} session${w.missed === 1 ? "" : "s"} missed so far. ` : "No missed sessions so far. "}
          {w.newRecords > 0 ? `${w.newRecords} new personal record${w.newRecords === 1 ? "" : "s"}. ` : ""}
          Training volume {w.volumeLb.toLocaleString()} lb{w.previousVolumeLb ? ` (last week ${w.previousVolumeLb.toLocaleString()} lb)` : ""}. Last week:{" "}
          {w.previousCompleted} completed workout{w.previousCompleted === 1 ? "" : "s"}.
        </p>
        <Link href={`${base}/assistant?prompt=${encodeURIComponent("Summarize my coaching week.")}`} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent hover:underline">
          Ask The Tech Guy for a written summary <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Upcoming sessions" eyebrow="Next 7 days" bodyClassName="p-0">
          {d.upcoming.length ? (
            <ul className="divide-y divide-ink-800">
              {d.upcoming.map((s) => (
                <li key={s.id}>
                  <Link href={`${base}/athletes/${s.athlete_id}?tab=program`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-850">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ivory-100">{s.athlete_name}</p>
                      <p className="truncate text-xs text-stone-500">{s.session_name}</p>
                    </div>
                    <span className={`shrink-0 text-xs ${s.date === d.today ? "font-semibold text-accent" : "text-stone-400"}`}>{s.date === d.today ? "Today" : formatDate(s.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No sessions scheduled in the next week. Assign a program to put sessions on the calendar.</p>
          )}
        </Panel>

        <Panel title="Needs attention" eyebrow="From recorded activity" bodyClassName="p-0">
          {d.attention.length ? (
            <ul className="divide-y divide-ink-800">
              {d.attention.map((a) => (
                <li key={a.athlete_id}>
                  <Link href={`${base}/athletes/${a.athlete_id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-ink-850">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm text-ivory-100">{a.athlete_name}</p>
                      <ul className="mt-0.5 text-xs text-stone-400">
                        {a.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">Nothing flagged. Athletes are flagged for 2+ missed sessions in 14 days, 10+ days without a completed workout, or two consecutive low recovery check-ins.</p>
          )}
        </Panel>

        <Panel title="Recent activity" eyebrow="Workout logs" bodyClassName="p-0">
          {d.recentActivity.length ? (
            <ul className="divide-y divide-ink-800">
              {d.recentActivity.map((l) => (
                <li key={l.id}>
                  <Link href={`${base}/athletes/${l.athlete_id}/workouts/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-850">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ivory-100">{l.athlete_name}</p>
                      <p className="text-xs text-stone-500">
                        {l.exercises} exercises · {l.sets} sets{l.effort ? ` · effort ${l.effort}/10` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {l.status === "in_progress" && <Badge tone="warning">In progress</Badge>}
                      <span className="text-xs text-stone-400">{formatDate(l.performed_on)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No workouts logged yet.</p>
          )}
        </Panel>

        <Panel title="Progress highlights" eyebrow="Personal records · 14 days" bodyClassName="p-0">
          {d.highlights.length ? (
            <ul className="divide-y divide-ink-800">
              {d.highlights.map((h, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <Trophy className="size-4 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ivory-100">
                      {h.athlete_name} · {h.exercise_name}
                    </p>
                    <p className="text-xs text-stone-500">
                      {h.kind === "e1rm" ? `Est. 1RM ${h.value} lb` : h.kind === "weight" ? `Top set ${h.value} lb` : h.kind === "reps" ? `${h.value} reps` : h.kind === "time" ? `${h.value}s` : `${h.value} m`}
                    </p>
                  </div>
                  <span className="text-xs text-stone-400">{formatDate(h.on)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No new records in the last two weeks. Records are counted once an exercise has prior history.</p>
          )}
        </Panel>

        <Panel title="Check-ins" eyebrow="Next 14 days" bodyClassName="p-0">
          {d.checkIns.length ? (
            <ul className="divide-y divide-ink-800">
              {d.checkIns.map((c) => (
                <li key={c.athlete_id}>
                  <Link href={`${base}/athletes/${c.athlete_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-ink-850">
                    <span className="flex items-center gap-3 text-sm text-ivory-100">
                      <CalendarClock className="size-4 text-stone-500" aria-hidden />
                      {c.athlete_name}
                    </span>
                    {c.overdue ? <Badge tone="danger">Overdue · {formatDate(c.date)}</Badge> : <span className="text-xs text-stone-400">{formatDate(c.date, { weekday: "short", month: "short", day: "numeric" })}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No check-ins due. Set a next check-in date on an athlete&apos;s profile.</p>
          )}
        </Panel>

        <Panel title="Recent program changes" eyebrow="Programs" action={<Link href={`${base}/programs`} className="text-xs text-stone-400 hover:text-accent">All</Link>} bodyClassName="p-0">
          {d.recentPrograms.length ? (
            <ul className="divide-y divide-ink-800">
              {d.recentPrograms.map((p) => (
                <li key={p.id}>
                  <Link href={`${base}/programs/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-850">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ivory-100">{p.name}</p>
                      <p className="text-xs text-stone-500">
                        v{p.version} · {p.versionStatus === "draft" ? "draft" : "published"}
                        {p.created_via === "ai" ? " · drafted by The Tech Guy" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">{formatRelative(p.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No programs yet.</p>
          )}
        </Panel>
      </div>

      <p className="mt-8 flex items-center gap-2 text-xs text-stone-500">
        <Users className="size-3.5" aria-hidden /> Attendance counts completed vs. scheduled sessions; adherence counts prescribed sets actually completed.{" "}
        <Link href={`${base}/settings#metrics`} className="underline-offset-4 hover:text-accent hover:underline">
          Metric definitions
        </Link>
      </p>
    </>
  );
}

