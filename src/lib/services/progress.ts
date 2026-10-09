import { assertCan, isCoachRole } from "@/lib/auth/permissions";
import { todayKey } from "@/lib/dates";
import {
  addDays,
  adherence,
  attendance,
  attentionReasons,
  consistency,
  exerciseTrend,
  goalCurrentValue,
  goalProgress,
  personalRecords,
  recentRecords,
  sessionCompletion,
  weeklyVolume,
  type MetricLog,
  type MetricScheduled,
} from "@/lib/metrics";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { Goal, Measurement } from "@/lib/types";
import { uuid } from "@/lib/validation";
import type { ServiceContext } from "./context";

/** Loads workout logs (with sets) for one or many athletes into metric-ready records. */
export async function loadMetricLogs(ctx: ServiceContext, opts: { athleteIds?: string[]; from?: string }): Promise<MetricLog[]> {
  let query = ctx.supabase
    .from("workout_logs")
    .select(
      "id, athlete_id, performed_on, status, perceived_effort, recovery_rating, scheduled_session_id, workout_log_exercises(exercise_id, planned, exercises(name, measurement), workout_log_sets(reps, weight, weight_unit, duration_seconds, distance_m, rpe, completed))",
    )
    .eq("org_id", ctx.org.id)
    .order("performed_on", { ascending: true })
    .limit(2000);
  if (opts.athleteIds) query = query.in("athlete_id", opts.athleteIds);
  if (opts.from) query = query.gte("performed_on", opts.from);
  const { data, error } = await query;
  if (error) throw dbError(error);
  type Row = {
    id: string;
    athlete_id: string;
    performed_on: string;
    status: "in_progress" | "completed";
    perceived_effort: number | null;
    recovery_rating: number | null;
    scheduled_session_id: string | null;
    workout_log_exercises: {
      exercise_id: string;
      planned: { sets?: number } | null;
      exercises: { name: string; measurement: Measurement } | null;
      workout_log_sets: MetricLog["exercises"][number]["sets"];
    }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    athlete_id: r.athlete_id,
    performed_on: r.performed_on,
    status: r.status,
    perceived_effort: r.perceived_effort,
    recovery_rating: r.recovery_rating,
    scheduled_session_id: r.scheduled_session_id,
    exercises: (r.workout_log_exercises ?? []).map((e) => ({
      exercise_id: e.exercise_id,
      exercise_name: e.exercises?.name ?? "Exercise",
      measurement: e.exercises?.measurement ?? "reps_weight",
      planned_sets: typeof e.planned?.sets === "number" ? e.planned.sets : null,
      sets: (e.workout_log_sets ?? []).map((s) => ({ ...s, weight: s.weight === null ? null : Number(s.weight), rpe: s.rpe === null ? null : Number(s.rpe), distance_m: s.distance_m === null ? null : Number(s.distance_m) })),
    })),
  }));
}

export async function loadScheduled(ctx: ServiceContext, opts: { athleteIds?: string[]; from?: string; to?: string }): Promise<(MetricScheduled & { program_session_id: string; assignment_id: string })[]> {
  let query = ctx.supabase
    .from("scheduled_sessions")
    .select("id, athlete_id, scheduled_date, status, program_session_id, assignment_id, assignments!inner(status)")
    .eq("org_id", ctx.org.id)
    .neq("assignments.status", "cancelled")
    .order("scheduled_date")
    .limit(5000);
  if (opts.athleteIds) query = query.in("athlete_id", opts.athleteIds);
  if (opts.from) query = query.gte("scheduled_date", opts.from);
  if (opts.to) query = query.lte("scheduled_date", opts.to);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data ?? []).map((s) => ({
    id: s.id as string,
    athlete_id: s.athlete_id as string,
    scheduled_date: s.scheduled_date as string,
    status: s.status as MetricScheduled["status"],
    program_session_id: s.program_session_id as string,
    assignment_id: s.assignment_id as string,
  }));
}

export type RangeKey = "4w" | "12w" | "26w" | "all";
export const RANGE_WEEKS: Record<RangeKey, number> = { "4w": 4, "12w": 12, "26w": 26, all: 52 };

/** Deterministic progress summary for one athlete (coach or the athlete themself). */
export async function athleteProgress(ctx: ServiceContext, athleteId: unknown, range: RangeKey = "12w") {
  const id = parseInput(uuid, athleteId);
  if (isCoachRole(ctx.role)) assertCan(ctx, "athletes.read");
  else if (ctx.athleteId !== id) throw new ServiceError("Not found.");

  const today = todayKey();
  const weeks = RANGE_WEEKS[range] ?? 12;
  const from = range === "all" ? undefined : addDays(today, -7 * weeks);
  const [logs, scheduled, goalsRes] = await Promise.all([
    loadMetricLogs(ctx, { athleteIds: [id] }),
    loadScheduled(ctx, { athleteIds: [id] }),
    ctx.supabase.from("goals").select("*").eq("athlete_id", id).eq("org_id", ctx.org.id).neq("status", "archived").order("created_at"),
  ]);
  if (goalsRes.error) throw dbError(goalsRes.error);
  const prs = personalRecords(logs);
  const rangedLogs = from ? logs.filter((l) => l.performed_on >= from) : logs;

  const goals = ((goalsRes.data ?? []) as Goal[]).map((g) => {
    const goal = { ...g, baseline_value: num(g.baseline_value), target_value: num(g.target_value), current_value: num(g.current_value) };
    const current = goalCurrentValue(goal, prs, logs, today);
    return { ...goal, computed_current: current, progress: goalProgress(goal, current) };
  });

  // Exercises with the most logged history get trend charts.
  const counts = new Map<string, { name: string; n: number; measurement: Measurement }>();
  for (const l of rangedLogs)
    for (const e of l.exercises) {
      const c = counts.get(e.exercise_id) ?? { name: e.exercise_name, n: 0, measurement: e.measurement };
      c.n += e.sets.some((s) => s.completed) ? 1 : 0;
      counts.set(e.exercise_id, c);
    }
  const trendExercises = [...counts.entries()]
    .filter(([, c]) => c.n > 0)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 6)
    .map(([exercise_id, c]) => ({ exercise_id, name: c.name, measurement: c.measurement, points: exerciseTrend(rangedLogs, exercise_id) }));

  const effort = rangedLogs
    .filter((l) => l.status === "completed")
    .map((l) => ({ date: l.performed_on, effort: l.perceived_effort, recovery: l.recovery_rating }));

  return {
    today,
    range,
    attendance: attendance(scheduled, today, from),
    adherence: adherence(logs, from, today),
    completion: sessionCompletion(logs, from, today),
    consistency: consistency(logs, Math.min(weeks, 26), today),
    volume: weeklyVolume(logs, Math.min(weeks, 26), today),
    records: prs.sort((a, b) => (b.best_e1rm_lb ?? 0) - (a.best_e1rm_lb ?? 0)),
    recentRecords: recentRecords(prs, addDays(today, -28), today),
    trends: trendExercises,
    effort,
    goals,
    attention: attentionReasons(
      { hasActiveAssignment: scheduled.some((s) => s.scheduled_date >= addDays(today, -14)) },
      scheduled,
      logs,
      today,
    ),
    totals: { completedWorkouts: logs.filter((l) => l.status === "completed").length },
  };
}

function num(v: number | string | null): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** Upcoming and recent scheduled sessions for an athlete, with session names. */
export async function athleteSchedule(ctx: ServiceContext, athleteId: unknown, opts: { from?: string; to?: string } = {}) {
  const id = parseInput(uuid, athleteId);
  if (isCoachRole(ctx.role)) assertCan(ctx, "athletes.read");
  else if (ctx.athleteId !== id) throw new ServiceError("Not found.");
  let query = ctx.supabase
    .from("scheduled_sessions")
    .select(
      "id, scheduled_date, status, week_number, day_number, assignment_id, program_session_id, program_sessions(name, focus, estimated_minutes), assignments!inner(status, program_templates(name)), workout_logs(id, status)",
    )
    .eq("athlete_id", id)
    .eq("org_id", ctx.org.id)
    .neq("assignments.status", "cancelled")
    .order("scheduled_date");
  if (opts.from) query = query.gte("scheduled_date", opts.from);
  if (opts.to) query = query.lte("scheduled_date", opts.to);
  const { data, error } = await query.limit(500);
  if (error) throw dbError(error);
  return (data ?? []).map((s) => {
    const ps = s.program_sessions as unknown as { name: string; focus: string | null; estimated_minutes: number | null } | null;
    const asg = s.assignments as unknown as { program_templates: { name: string } | null } | null;
    const logs = (s.workout_logs as unknown as { id: string; status: string }[] | null) ?? [];
    return {
      id: s.id as string,
      scheduled_date: s.scheduled_date as string,
      status: s.status as "planned" | "completed" | "skipped",
      week_number: s.week_number as number,
      day_number: s.day_number as number,
      assignment_id: s.assignment_id as string,
      program_session_id: s.program_session_id as string,
      session_name: ps?.name ?? "Session",
      focus: ps?.focus ?? null,
      estimated_minutes: ps?.estimated_minutes ?? null,
      program_name: asg?.program_templates?.name ?? "Program",
      log: logs[0] ?? null,
    };
  });
}

export async function setScheduledStatus(ctx: ServiceContext, scheduledId: unknown, status: "planned" | "skipped"): Promise<void> {
  assertCan(ctx, "programs.assign");
  const id = parseInput(uuid, scheduledId);
  const { error, count } = await ctx.supabase.from("scheduled_sessions").update({ status }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id).neq("status", "completed");
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Session not found or already completed.");
}
