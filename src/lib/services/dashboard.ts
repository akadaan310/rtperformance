import { assertCan } from "@/lib/auth/permissions";
import { todayKey } from "@/lib/dates";
import {
  addDays,
  adherence,
  attendance,
  attentionReasons,
  describeAttention,
  isMissed,
  logVolume,
  personalRecords,
  recentRecords,
  weekStart,
} from "@/lib/metrics";
import { dbError } from "@/lib/result";
import type { AthleteProfile } from "@/lib/types";
import type { ServiceContext } from "./context";
import { loadMetricLogs, loadScheduled } from "./progress";

export interface WeeklySummary {
  weekOf: string;
  scheduled: number;
  completedWorkouts: number;
  missed: number;
  newRecords: number;
  volumeLb: number;
  previousCompleted: number;
  previousVolumeLb: number;
  attendanceRate: number | null;
  adherenceRate: number | null;
}

export async function getDashboard(ctx: ServiceContext) {
  assertCan(ctx, "athletes.read");
  const today = todayKey();
  const from = addDays(today, -56);

  const [{ data: athletesData, error }, logs, scheduled, { data: programs }] = await Promise.all([
    ctx.supabase
      .from("athlete_profiles")
      .select("id, first_name, last_name, status, next_check_in_date, user_id")
      .eq("org_id", ctx.org.id)
      .neq("status", "archived")
      .order("first_name"),
    loadMetricLogs(ctx, { from: addDays(today, -365) }),
    loadScheduled(ctx, { from, to: addDays(today, 14) }),
    ctx.supabase
      .from("program_templates")
      .select("id, name, status, updated_at, created_via, program_versions(version_number, status, published_at)")
      .eq("org_id", ctx.org.id)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);
  if (error) throw dbError(error);
  const athletes = (athletesData ?? []) as Pick<AthleteProfile, "id" | "first_name" | "last_name" | "status" | "next_check_in_date" | "user_id">[];
  const nameOf = new Map(athletes.map((a) => [a.id, `${a.first_name} ${a.last_name}`.trim()]));
  const active = athletes.filter((a) => a.status === "active");

  // Upcoming sessions (next 7 days), with session names.
  const upcomingRaw = scheduled.filter((s) => s.status === "planned" && s.scheduled_date >= today && s.scheduled_date <= addDays(today, 7)).slice(0, 12);
  const sessionIds = [...new Set(upcomingRaw.map((s) => s.program_session_id))];
  const { data: sessionNames } = sessionIds.length
    ? await ctx.supabase.from("program_sessions").select("id, name").in("id", sessionIds)
    : { data: [] as { id: string; name: string }[] };
  const sessionName = new Map((sessionNames ?? []).map((s) => [s.id as string, s.name as string]));
  const upcoming = upcomingRaw.map((s) => ({
    id: s.id,
    athlete_id: s.athlete_id,
    athlete_name: nameOf.get(s.athlete_id) ?? "Athlete",
    date: s.scheduled_date,
    session_name: sessionName.get(s.program_session_id) ?? "Session",
  }));

  const recentActivity = [...logs]
    .sort((a, b) => b.performed_on.localeCompare(a.performed_on))
    .slice(0, 8)
    .map((l) => ({
      id: l.id,
      athlete_id: l.athlete_id,
      athlete_name: nameOf.get(l.athlete_id) ?? "Athlete",
      performed_on: l.performed_on,
      status: l.status,
      exercises: l.exercises.length,
      sets: l.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0),
      effort: l.perceived_effort,
    }));

  // Records set in the last 14 days, per athlete.
  const highlights: { athlete_id: string; athlete_name: string; exercise_name: string; kind: string; value: number; on: string }[] = [];
  for (const a of active) {
    const mine = logs.filter((l) => l.athlete_id === a.id);
    if (!mine.length) continue;
    for (const r of recentRecords(personalRecords(mine), addDays(today, -14), today)) {
      // A first-ever log of an exercise is a baseline, not a record.
      const priorLogs = mine.filter((l) => l.performed_on < r.on && l.exercises.some((e) => e.exercise_name === r.exercise_name));
      if (priorLogs.length) highlights.push({ athlete_id: a.id, athlete_name: nameOf.get(a.id) ?? "Athlete", ...r });
    }
  }
  highlights.sort((a, b) => b.on.localeCompare(a.on));

  const attention = active
    .map((a) => {
      const reasons = attentionReasons(
        { hasActiveAssignment: scheduled.some((s) => s.athlete_id === a.id && s.scheduled_date >= addDays(today, -14)) },
        scheduled.filter((s) => s.athlete_id === a.id),
        logs.filter((l) => l.athlete_id === a.id),
        today,
      );
      return { athlete_id: a.id, athlete_name: nameOf.get(a.id) ?? "Athlete", reasons: reasons.map(describeAttention) };
    })
    .filter((a) => a.reasons.length);

  const checkIns = athletes
    .filter((a) => a.next_check_in_date && a.next_check_in_date <= addDays(today, 14))
    .sort((a, b) => (a.next_check_in_date ?? "").localeCompare(b.next_check_in_date ?? ""))
    .map((a) => ({ athlete_id: a.id, athlete_name: nameOf.get(a.id) ?? "Athlete", date: a.next_check_in_date as string, overdue: (a.next_check_in_date as string) < today }));

  const recentPrograms = (programs ?? []).map((p) => {
    const versions = (p.program_versions as unknown as { version_number: number; status: string; published_at: string | null }[]) ?? [];
    const latest = versions.sort((a, b) => b.version_number - a.version_number)[0];
    return { id: p.id as string, name: p.name as string, status: p.status as string, updated_at: p.updated_at as string, version: latest?.version_number ?? 1, versionStatus: latest?.status ?? "draft", created_via: p.created_via as string };
  });

  const window28 = addDays(today, -27);
  return {
    today,
    counts: {
      activeAthletes: active.length,
      linkedAthletes: active.filter((a) => a.user_id).length,
      upcoming7d: scheduled.filter((s) => s.status === "planned" && s.scheduled_date >= today && s.scheduled_date <= addDays(today, 7)).length,
      completed28d: logs.filter((l) => l.status === "completed" && l.performed_on >= window28).length,
    },
    attendance28: attendance(scheduled, today, window28),
    adherence28: adherence(logs, window28, today),
    upcoming,
    recentActivity,
    highlights: highlights.slice(0, 6),
    attention,
    checkIns,
    recentPrograms,
    weekly: weeklySummary(logs, scheduled, today),
  };
}

export function weeklySummary(
  logs: Awaited<ReturnType<typeof loadMetricLogs>>,
  scheduled: Awaited<ReturnType<typeof loadScheduled>>,
  today: string,
): WeeklySummary {
  const start = weekStart(today);
  const prevStart = addDays(start, -7);
  const thisWeek = logs.filter((l) => l.status === "completed" && l.performed_on >= start && l.performed_on <= today);
  const lastWeek = logs.filter((l) => l.status === "completed" && l.performed_on >= prevStart && l.performed_on < start);
  const weekScheduled = scheduled.filter((s) => s.scheduled_date >= start && s.scheduled_date <= addDays(start, 6));
  const byAthlete = new Map<string, typeof logs>();
  for (const l of logs) byAthlete.set(l.athlete_id, [...(byAthlete.get(l.athlete_id) ?? []), l]);
  let newRecords = 0;
  for (const athleteLogs of byAthlete.values()) {
    for (const r of recentRecords(personalRecords(athleteLogs), start, today)) {
      if (athleteLogs.some((l) => l.performed_on < r.on && l.exercises.some((e) => e.exercise_name === r.exercise_name))) newRecords++;
    }
  }
  return {
    weekOf: start,
    scheduled: weekScheduled.length,
    completedWorkouts: thisWeek.length,
    missed: weekScheduled.filter((s) => isMissed(s, today)).length,
    newRecords,
    volumeLb: thisWeek.reduce((n, l) => n + logVolume(l), 0),
    previousCompleted: lastWeek.length,
    previousVolumeLb: lastWeek.reduce((n, l) => n + logVolume(l), 0),
    attendanceRate: attendance(weekScheduled, today, start).rate,
    adherenceRate: adherence(logs, start, today).rate,
  };
}
