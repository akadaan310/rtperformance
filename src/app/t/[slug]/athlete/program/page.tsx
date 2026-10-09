import type { Metadata } from "next";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { ProgramPreview } from "@/components/program/program-preview";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { formatDate, todayKey } from "@/lib/dates";
import { isMissed } from "@/lib/metrics";
import { toCardSessions } from "@/lib/program-format";
import { loadVersionContent } from "@/lib/services/programs";
import { athleteSchedule } from "@/lib/services/progress";
import { WEEKDAYS } from "@/lib/schedule";

export const metadata: Metadata = { title: "My program" };

export default async function AthleteProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireAthleteWorkspace(slug);
  // RLS returns only this athlete's own assignments and the program versions pinned to them.
  const { data } = await ctx.supabase
    .from("assignments")
    .select("id, version_id, start_date, training_days, status, notes, program_templates(name, description, goal), program_versions(version_number)")
    .eq("athlete_id", ctx.athleteId)
    .eq("org_id", ctx.org.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  const assignments = data ?? [];
  if (!assignments.length) return <EmptyState title="No program yet">When your coach assigns a program, every session, set and rep target appears here.</EmptyState>;
  const today = todayKey();
  const schedule = await athleteSchedule(ctx, ctx.athleteId);

  return (
    <div className="space-y-12">
      {await Promise.all(
        assignments.map(async (a) => {
          const t = a.program_templates as unknown as { name: string; description: string | null; goal: string | null } | null;
          const sessions = await loadVersionContent(ctx, a.version_id as string);
          const mine = schedule.filter((s) => s.assignment_id === a.id);
          const done = mine.filter((s) => s.status === "completed").length;
          return (
            <section key={a.id as string} aria-labelledby={`p-${a.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={a.status === "active" ? "success" : "muted"}>{a.status as string}</Badge>
                <Badge tone="muted">v{(a.program_versions as unknown as { version_number: number } | null)?.version_number}</Badge>
              </div>
              <h1 id={`p-${a.id}`} className="display mt-3 text-4xl text-ivory-50">
                {t?.name}
              </h1>
              <p className="mt-2 text-sm text-stone-400">
                Started {formatDate(a.start_date as string, { month: "long", day: "numeric" })} · {(a.training_days as number[]).map((d) => WEEKDAYS.find((w) => w.value === d)?.short).join(", ")} · {done} of {mine.length} sessions done
              </p>
              {a.notes && <p className="editorial mt-4 border-l-2 border-accent pl-4 text-lg text-ivory-200">{a.notes as string}</p>}
              {t?.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-stone-300">{t.description}</p>}

              <div className="mt-6">
                <h2 className="eyebrow mb-3">Schedule</h2>
                <ol className="scrollbar-thin flex gap-2 overflow-x-auto pb-2">
                  {mine.map((s) => (
                    <li key={s.id} className={`min-w-32 rounded-xs border px-3 py-2 text-xs ${s.scheduled_date === today ? "border-accent" : "border-ink-700"}`}>
                      <p className="text-stone-500">{formatDate(s.scheduled_date, { weekday: "short", month: "short", day: "numeric" })}</p>
                      <p className="mt-0.5 truncate text-ivory-100">{s.session_name}</p>
                      <p className={`mt-1 font-semibold uppercase tracking-wider ${s.status === "completed" ? "text-accent" : isMissed(s, today) ? "text-signal" : "text-stone-500"}`}>
                        {s.status === "completed" ? "Done" : s.status === "skipped" ? "Excused" : isMissed(s, today) ? "Missed" : "Planned"}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-6">
                <h2 className="eyebrow mb-3">Every session</h2>
                <ProgramPreview sessions={toCardSessions(sessions)} />
              </div>
            </section>
          );
        }),
      )}
    </div>
  );
}
