import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, MessageSquareQuote } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { formatDate, formatDateLong, formatRelative, todayKey } from "@/lib/dates";
import { addDays, isMissed, pct, weekStart } from "@/lib/metrics";
import { getAthlete } from "@/lib/services/athletes";
import { listNotes } from "@/lib/services/goals";
import { athleteProgress, athleteSchedule } from "@/lib/services/progress";
import { startMyWorkoutAction } from "./actions";

export const metadata: Metadata = { title: "Today" };

export default async function AthleteToday({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireAthleteWorkspace(slug);
  const today = todayKey();
  const [athlete, schedule, notes, progress] = await Promise.all([
    getAthlete(ctx, ctx.athleteId),
    athleteSchedule(ctx, ctx.athleteId, { from: addDays(today, -14), to: addDays(today, 21) }),
    listNotes(ctx, ctx.athleteId),
    athleteProgress(ctx, ctx.athleteId, "4w"),
  ]);
  const base = `/t/${ctx.org.slug}/athlete`;
  const todays = schedule.filter((s) => s.scheduled_date === today);
  const next = schedule.find((s) => s.scheduled_date > today && s.status === "planned");
  const missed = schedule.filter((s) => isMissed(s, today));
  const wkStart = weekStart(today);
  const week = schedule.filter((s) => s.scheduled_date >= wkStart && s.scheduled_date <= addDays(wkStart, 6));

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-accent">{formatDateLong(today)}</p>
        <h1 className="display mt-3 text-4xl text-ivory-50 md:text-5xl">{ctx.brand?.welcome_headline ? `${athlete.first_name}.` : `Let's work, ${athlete.first_name}.`}</h1>
        {ctx.brand?.welcome_headline && <p className="editorial mt-2 text-2xl text-ivory-200">{ctx.brand.welcome_headline}</p>}
      </header>

      <section aria-labelledby="today-title" className="space-y-3">
        <h2 id="today-title" className="eyebrow">Today&apos;s session</h2>
        {todays.length ? (
          todays.map((s) => (
            <article key={s.id} className="surface-raised relative overflow-hidden p-6">
              <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
              <p className="text-xs text-stone-400">
                {s.program_name} · week {s.week_number} · day {s.day_number}
              </p>
              <h3 className="display mt-2 text-3xl text-ivory-50">{s.session_name}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-stone-400">
                {s.focus && <span>{s.focus}</span>}
                {s.estimated_minutes && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> ~{s.estimated_minutes} min
                  </span>
                )}
              </p>
              <div className="mt-6">
                {s.status === "completed" && s.log ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="success">Completed</Badge>
                    <Link href={`${base}/workout/${s.log.id}`} className="text-sm text-accent hover:underline">
                      Review what you recorded
                    </Link>
                  </div>
                ) : s.status === "skipped" ? (
                  <Badge tone="muted">Excused by your coach</Badge>
                ) : s.log ? (
                  <ButtonLink href={`${base}/workout/${s.log.id}`} size="lg">
                    Resume workout <ArrowRight className="size-4" aria-hidden />
                  </ButtonLink>
                ) : (
                  <InlineAction action={startMyWorkoutAction} fields={{ slug: ctx.org.slug, scheduled_id: s.id }} variant="primary" size="lg" pendingLabel="Opening…">
                    Start workout
                  </InlineAction>
                )}
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="Rest day" action={next ? <p className="text-sm text-stone-300">Next up: <strong className="text-ivory-50">{next.session_name}</strong> on {formatDate(next.scheduled_date, { weekday: "long", month: "short", day: "numeric" })}</p> : undefined}>
            {schedule.length ? "Nothing scheduled today. Recover well." : "Your coach hasn't assigned a program yet. It will appear here as soon as they do."}
          </EmptyState>
        )}
      </section>

      {missed.length > 0 && (
        <section aria-labelledby="missed-title" className="rounded-xs border border-signal/50 p-4">
          <h2 id="missed-title" className="text-sm font-semibold text-signal">
            {missed.length} session{missed.length === 1 ? "" : "s"} still open from the last two weeks
          </h2>
          <ul className="mt-2 space-y-2">
            {missed.slice(0, 3).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ivory-100">
                  {s.session_name} <span className="text-stone-500">· {formatDate(s.scheduled_date)}</span>
                </span>
                {s.log ? (
                  <Link href={`${base}/workout/${s.log.id}`} className="text-xs text-accent">
                    Resume
                  </Link>
                ) : (
                  <InlineAction action={startMyWorkoutAction} fields={{ slug: ctx.org.slug, scheduled_id: s.id }} variant="ghost">
                    Log it now
                  </InlineAction>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="week-title">
        <h2 id="week-title" className="eyebrow mb-3">
          This week
        </h2>
        {week.length ? (
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {week.map((s) => (
              <li key={s.id} className="surface flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ivory-100">{s.session_name}</p>
                  <p className="text-xs text-stone-500">{s.scheduled_date === today ? "Today" : formatDate(s.scheduled_date, { weekday: "long" })}</p>
                </div>
                {s.status === "completed" ? <Badge tone="success">Done</Badge> : s.status === "skipped" ? <Badge tone="muted">Excused</Badge> : isMissed(s, today) ? <Badge tone="danger">Missed</Badge> : <Badge>Planned</Badge>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-stone-500">No sessions this week.</p>
        )}
      </section>

      <section aria-label="Your last four weeks" className="surface grid grid-cols-3 divide-x divide-ink-700">
        {[
          ["Attendance", pct(progress.attendance.rate)],
          ["Workouts", String(progress.completion.completed)],
          ["Streak", `${progress.consistency.streak_weeks} wk`],
        ].map(([l, v]) => (
          <div key={l} className="p-4 text-center">
            <p className="eyebrow">{l}</p>
            <p className="display-tight mt-1 text-2xl text-ivory-50" data-numeric>
              {v}
            </p>
          </div>
        ))}
      </section>

      {notes.length > 0 && (
        <section aria-labelledby="notes-title">
          <h2 id="notes-title" className="eyebrow mb-3">
            From your coach
          </h2>
          <ul className="space-y-3">
            {notes.slice(0, 3).map((n) => (
              <li key={n.id} className="surface flex gap-3 p-4">
                <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="whitespace-pre-line text-sm text-ivory-100">{n.body}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {n.author_name ?? "Coach"} · {formatRelative(n.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
