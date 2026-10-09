/**
 * Deterministic progress metrics. Definitions are documented in docs/METRICS.md.
 * All functions are pure: they take plain records and a reference date and never call the network.
 */
import type { Measurement } from "@/lib/types";

export const LB_PER_KG = 2.2046226218;

export interface MetricSet {
  reps: number | null;
  weight: number | null;
  weight_unit: "lb" | "kg";
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  completed: boolean;
}

export interface MetricLogExercise {
  exercise_id: string;
  exercise_name: string;
  measurement: Measurement;
  planned_sets: number | null;
  sets: MetricSet[];
}

export interface MetricLog {
  id: string;
  athlete_id: string;
  performed_on: string; // YYYY-MM-DD
  status: "in_progress" | "completed";
  perceived_effort: number | null;
  recovery_rating: number | null;
  scheduled_session_id: string | null;
  exercises: MetricLogExercise[];
}

export interface MetricScheduled {
  id: string;
  athlete_id: string;
  scheduled_date: string; // YYYY-MM-DD
  status: "planned" | "completed" | "skipped";
}

// ---------------------------------------------------------------------------
// Dates (UTC calendar arithmetic on YYYY-MM-DD strings)
// ---------------------------------------------------------------------------
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** Monday (ISO week start) of the week containing `key`. */
export function weekStart(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return addDays(key, 1 - dow);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function inRange(key: string, from?: string, to?: string): boolean {
  return (!from || key >= from) && (!to || key <= to);
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------
export function toPounds(weight: number, unit: "lb" | "kg"): number {
  return unit === "kg" ? weight * LB_PER_KG : weight;
}

/**
 * Estimated one-rep max (Epley). Only sets of 1–12 reps with load produce an estimate; higher-rep sets
 * are too unreliable and return null.
 */
export function estimateOneRepMax(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || weight <= 0 || reps < 1 || reps > 12) return null;
  if (reps === 1) return round1(weight);
  return round1(weight * (1 + reps / 30));
}

export interface PersonalRecord {
  exercise_id: string;
  exercise_name: string;
  measurement: Measurement;
  best_e1rm_lb: number | null;
  best_e1rm_on: string | null;
  heaviest_lb: number | null;
  heaviest_on: string | null;
  most_reps: number | null;
  most_reps_on: string | null;
  longest_seconds: number | null;
  longest_on: string | null;
  farthest_m: number | null;
  farthest_on: string | null;
}

/** Best performances per exercise across completed workouts. Weights normalised to pounds. */
export function personalRecords(logs: MetricLog[]): PersonalRecord[] {
  const byExercise = new Map<string, PersonalRecord>();
  const sorted = [...logs].filter((l) => l.status === "completed").sort((a, b) => a.performed_on.localeCompare(b.performed_on));
  for (const log of sorted) {
    for (const ex of log.exercises) {
      let pr = byExercise.get(ex.exercise_id);
      if (!pr) {
        pr = {
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          measurement: ex.measurement,
          best_e1rm_lb: null,
          best_e1rm_on: null,
          heaviest_lb: null,
          heaviest_on: null,
          most_reps: null,
          most_reps_on: null,
          longest_seconds: null,
          longest_on: null,
          farthest_m: null,
          farthest_on: null,
        };
        byExercise.set(ex.exercise_id, pr);
      }
      for (const s of ex.sets) {
        if (!s.completed) continue;
        const lb = s.weight ? toPounds(s.weight, s.weight_unit) : null;
        const e1 = estimateOneRepMax(lb, s.reps);
        if (e1 !== null && (pr.best_e1rm_lb === null || e1 > pr.best_e1rm_lb)) {
          pr.best_e1rm_lb = e1;
          pr.best_e1rm_on = log.performed_on;
        }
        if (lb !== null && lb > 0 && (pr.heaviest_lb === null || lb > pr.heaviest_lb)) {
          pr.heaviest_lb = round1(lb);
          pr.heaviest_on = log.performed_on;
        }
        if (s.reps !== null && s.reps > 0 && (pr.most_reps === null || s.reps > pr.most_reps)) {
          pr.most_reps = s.reps;
          pr.most_reps_on = log.performed_on;
        }
        if (s.duration_seconds && (pr.longest_seconds === null || s.duration_seconds > pr.longest_seconds)) {
          pr.longest_seconds = s.duration_seconds;
          pr.longest_on = log.performed_on;
        }
        if (s.distance_m && (pr.farthest_m === null || s.distance_m > pr.farthest_m)) {
          pr.farthest_m = s.distance_m;
          pr.farthest_on = log.performed_on;
        }
      }
    }
  }
  return [...byExercise.values()].filter(
    (p) => p.best_e1rm_lb !== null || p.heaviest_lb !== null || p.most_reps !== null || p.longest_seconds !== null || p.farthest_m !== null,
  );
}

/** PRs (any category) whose date falls within [from, to]. */
export function recentRecords(prs: PersonalRecord[], from: string, to: string) {
  const out: { exercise_name: string; kind: "e1rm" | "weight" | "reps" | "time" | "distance"; value: number; on: string }[] = [];
  for (const p of prs) {
    if (p.best_e1rm_on && inRange(p.best_e1rm_on, from, to) && p.best_e1rm_lb !== null)
      out.push({ exercise_name: p.exercise_name, kind: "e1rm", value: p.best_e1rm_lb, on: p.best_e1rm_on });
    else if (p.heaviest_on && inRange(p.heaviest_on, from, to) && p.heaviest_lb !== null)
      out.push({ exercise_name: p.exercise_name, kind: "weight", value: p.heaviest_lb, on: p.heaviest_on });
    else if (p.measurement === "reps" && p.most_reps_on && inRange(p.most_reps_on, from, to) && p.most_reps !== null)
      out.push({ exercise_name: p.exercise_name, kind: "reps", value: p.most_reps, on: p.most_reps_on });
    else if (p.longest_on && inRange(p.longest_on, from, to) && p.longest_seconds !== null)
      out.push({ exercise_name: p.exercise_name, kind: "time", value: p.longest_seconds, on: p.longest_on });
    else if (p.farthest_on && inRange(p.farthest_on, from, to) && p.farthest_m !== null)
      out.push({ exercise_name: p.exercise_name, kind: "distance", value: p.farthest_m, on: p.farthest_on });
  }
  return out.sort((a, b) => b.on.localeCompare(a.on));
}

/** Per-workout trend for a single exercise: best e1RM and top set weight on each date. */
export function exerciseTrend(logs: MetricLog[], exerciseId: string) {
  const points: { date: string; e1rm_lb: number | null; top_lb: number | null; reps: number | null; seconds: number | null; distance_m: number | null; volume_lb: number }[] = [];
  for (const log of [...logs].filter((l) => l.status === "completed").sort((a, b) => a.performed_on.localeCompare(b.performed_on))) {
    const ex = log.exercises.find((e) => e.exercise_id === exerciseId);
    if (!ex) continue;
    let e1: number | null = null;
    let top: number | null = null;
    let reps: number | null = null;
    let seconds: number | null = null;
    let distance: number | null = null;
    let vol = 0;
    for (const s of ex.sets) {
      if (!s.completed) continue;
      const lb = s.weight ? toPounds(s.weight, s.weight_unit) : null;
      const est = estimateOneRepMax(lb, s.reps);
      if (est !== null && (e1 === null || est > e1)) e1 = est;
      if (lb !== null && (top === null || lb > top)) top = round1(lb);
      if (s.reps !== null && (reps === null || s.reps > reps)) reps = s.reps;
      if (s.duration_seconds !== null && (seconds === null || s.duration_seconds > seconds)) seconds = s.duration_seconds;
      if (s.distance_m !== null && (distance === null || s.distance_m > distance)) distance = s.distance_m;
      if (lb && s.reps) vol += lb * s.reps;
    }
    points.push({ date: log.performed_on, e1rm_lb: e1, top_lb: top, reps, seconds, distance_m: distance, volume_lb: Math.round(vol) });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------
/** Sum of weight × reps for completed, loaded sets (pounds). Bodyweight/time/distance work is excluded. */
export function logVolume(log: MetricLog): number {
  let total = 0;
  for (const ex of log.exercises) {
    for (const s of ex.sets) {
      if (s.completed && s.weight && s.reps) total += toPounds(s.weight, s.weight_unit) * s.reps;
    }
  }
  return Math.round(total);
}

export function weeklyVolume(logs: MetricLog[], weeks: number, today: string) {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const buckets = new Map<string, number>();
  for (let i = 0; i < weeks; i++) buckets.set(addDays(start, i * 7), 0);
  for (const log of logs) {
    if (log.status !== "completed" || log.performed_on < start || log.performed_on > today) continue;
    const wk = weekStart(log.performed_on);
    buckets.set(wk, (buckets.get(wk) ?? 0) + logVolume(log));
  }
  return [...buckets.entries()].map(([week, volume_lb]) => ({ week, volume_lb }));
}

// ---------------------------------------------------------------------------
// Attendance, adherence, completion, consistency
// ---------------------------------------------------------------------------
export interface AttendanceSummary {
  due: number;
  completed: number;
  missed: number;
  excused: number;
  /** completed ÷ (due − excused); null when nothing was due. */
  rate: number | null;
}

/**
 * Attendance: share of scheduled sessions due on or before `today` (within the range) that were completed.
 * "Skipped" sessions were excused by the coach and are excluded. A planned session dated before today is missed;
 * one dated today is still open and does not count against the athlete.
 */
export function attendance(scheduled: MetricScheduled[], today: string, from?: string): AttendanceSummary {
  let completed = 0;
  let missed = 0;
  let excused = 0;
  let open = 0;
  for (const s of scheduled) {
    if (s.scheduled_date > today || !inRange(s.scheduled_date, from, today)) continue;
    if (s.status === "completed") completed++;
    else if (s.status === "skipped") excused++;
    else if (s.scheduled_date < today) missed++;
    else open++;
  }
  const denominator = completed + missed;
  return { due: completed + missed + excused + open, completed, missed, excused, rate: denominator ? completed / denominator : null };
}

export function isMissed(s: Pick<MetricScheduled, "status" | "scheduled_date">, today: string): boolean {
  return s.status === "planned" && s.scheduled_date < today;
}

/**
 * Program adherence: of the sets prescribed in completed, programmed workouts, the share actually completed
 * (capped per exercise at the prescribed number). Independent of attendance.
 */
export function adherence(logs: MetricLog[], from?: string, to?: string): { prescribed: number; performed: number; rate: number | null } {
  let prescribed = 0;
  let performed = 0;
  for (const log of logs) {
    if (log.status !== "completed" || !log.scheduled_session_id || !inRange(log.performed_on, from, to)) continue;
    for (const ex of log.exercises) {
      if (!ex.planned_sets) continue;
      prescribed += ex.planned_sets;
      performed += Math.min(ex.planned_sets, ex.sets.filter((s) => s.completed).length);
    }
  }
  return { prescribed, performed, rate: prescribed ? performed / prescribed : null };
}

/** Session completion: completed workouts ÷ workouts started in the range. */
export function sessionCompletion(logs: MetricLog[], from?: string, to?: string) {
  const inScope = logs.filter((l) => inRange(l.performed_on, from, to));
  const completed = inScope.filter((l) => l.status === "completed").length;
  return { started: inScope.length, completed, rate: inScope.length ? completed / inScope.length : null };
}

/** Completed workouts per ISO week for the last `weeks` weeks, plus the current streak of active weeks. */
export function consistency(logs: MetricLog[], weeks: number, today: string) {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const counts = new Map<string, number>();
  for (let i = 0; i < weeks; i++) counts.set(addDays(start, i * 7), 0);
  for (const l of logs) {
    if (l.status !== "completed" || l.performed_on < start || l.performed_on > today) continue;
    const wk = weekStart(l.performed_on);
    counts.set(wk, (counts.get(wk) ?? 0) + 1);
  }
  const series = [...counts.entries()].map(([week, sessions]) => ({ week, sessions }));
  // Streak counts back from the most recent week; an empty current week does not break the streak yet.
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    const point = series[i]!;
    if (point.sessions > 0) streak++;
    else if (i === series.length - 1) continue;
    else break;
  }
  const active = series.filter((s) => s.sessions > 0).length;
  return { series, streak_weeks: streak, active_weeks: active, average_per_week: round1(series.reduce((a, s) => a + s.sessions, 0) / weeks) };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export interface GoalLike {
  metric: "estimated_1rm" | "max_weight" | "max_reps" | "sessions_per_week" | "custom";
  exercise_id: string | null;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
}

/** Current value for a goal derived from logged data (or the manually reported value for custom goals). */
export function goalCurrentValue(goal: GoalLike, prs: PersonalRecord[], logs: MetricLog[], today: string): number | null {
  const pr = goal.exercise_id ? prs.find((p) => p.exercise_id === goal.exercise_id) : undefined;
  switch (goal.metric) {
    case "estimated_1rm":
      return pr?.best_e1rm_lb ?? null;
    case "max_weight":
      return pr?.heaviest_lb ?? null;
    case "max_reps":
      return pr?.most_reps ?? null;
    case "sessions_per_week": {
      const c = consistency(logs, 4, today);
      return c.average_per_week;
    }
    default:
      return goal.current_value;
  }
}

/** Progress from baseline to target in [0, 1]; null when the goal has no numeric target. */
export function goalProgress(goal: GoalLike, current: number | null): number | null {
  if (goal.target_value === null || current === null) return null;
  const baseline = goal.baseline_value ?? 0;
  const span = goal.target_value - baseline;
  if (span === 0) return current >= goal.target_value ? 1 : 0;
  return clamp01((current - baseline) / span);
}

// ---------------------------------------------------------------------------
// Coach attention signals (factual, based only on recorded activity)
// ---------------------------------------------------------------------------
export type AttentionReason =
  | { kind: "missed_sessions"; count: number }
  | { kind: "inactive"; days: number }
  | { kind: "low_recovery"; rating: number };

export function attentionReasons(
  athlete: { hasActiveAssignment: boolean },
  scheduled: MetricScheduled[],
  logs: MetricLog[],
  today: string,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const recentMissed = scheduled.filter((s) => isMissed(s, today) && s.scheduled_date >= addDays(today, -14)).length;
  if (recentMissed >= 2) reasons.push({ kind: "missed_sessions", count: recentMissed });

  const completed = logs.filter((l) => l.status === "completed").sort((a, b) => b.performed_on.localeCompare(a.performed_on));
  if (athlete.hasActiveAssignment) {
    const last = completed[0]?.performed_on;
    const days = last ? daysBetween(last, today) : null;
    if (days === null || days >= 10) reasons.push({ kind: "inactive", days: days ?? -1 });
  }
  const lastTwo = completed.slice(0, 2).map((l) => l.recovery_rating).filter((r): r is number => r !== null);
  if (lastTwo.length === 2 && lastTwo.every((r) => r <= 2)) reasons.push({ kind: "low_recovery", rating: Math.max(...lastTwo) });
  return reasons;
}

export function describeAttention(r: AttentionReason): string {
  switch (r.kind) {
    case "missed_sessions":
      return `Missed ${r.count} scheduled sessions in the last 14 days`;
    case "inactive":
      return r.days < 0 ? "No completed workouts logged yet" : `No completed workout in ${r.days} days`;
    case "low_recovery":
      return "Reported low recovery in the last two workouts";
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
