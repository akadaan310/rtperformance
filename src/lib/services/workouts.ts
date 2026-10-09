import { z } from "zod";
import { assertCan, isCoachRole } from "@/lib/auth/permissions";
import { todayKey } from "@/lib/dates";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { Exercise, WorkoutLog, WorkoutLogExercise, WorkoutLogSet } from "@/lib/types";
import { adhocWorkoutInput, completeWorkoutInput, setInput, uuid } from "@/lib/validation";
import type { ServiceContext } from "./context";

const LOG_COLUMNS =
  "id, org_id, athlete_id, scheduled_session_id, assignment_id, program_session_id, title, performed_on, status, started_at, completed_at, perceived_effort, recovery_rating, notes, logged_by";

/** Coaches may log for any athlete in their workspace; athletes only for themselves. */
function assertCanLogFor(ctx: ServiceContext, athleteId: string) {
  if (isCoachRole(ctx.role)) return assertCan(ctx, "workouts.log_any");
  assertCan(ctx, "workouts.log_self");
  if (ctx.athleteId !== athleteId) throw new ServiceError("You can only log your own workouts.");
}

async function loadLog(ctx: ServiceContext, logId: string): Promise<WorkoutLog> {
  const { data, error } = await ctx.supabase.from("workout_logs").select(LOG_COLUMNS).eq("id", logId).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Workout not found.");
  assertCanLogFor(ctx, data.athlete_id as string);
  return data as WorkoutLog;
}

/** Opens (or resumes) the workout log for a scheduled session, snapshotting the prescription. */
export async function startScheduledWorkout(ctx: ServiceContext, scheduledSessionId: unknown): Promise<string> {
  const id = parseInput(uuid, scheduledSessionId);
  const { data: ss, error } = await ctx.supabase.from("scheduled_sessions").select("id, athlete_id, status").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!ss) throw new ServiceError("Session not found.");
  assertCanLogFor(ctx, ss.athlete_id as string);
  const { data, error: rpcErr } = await ctx.supabase.rpc("start_workout", { p_scheduled_session: id, p_performed_on: todayKey() });
  if (rpcErr) throw dbError(rpcErr, "Could not start the workout.");
  return data as string;
}

export async function startAdhocWorkout(ctx: ServiceContext, input: unknown): Promise<string> {
  const values = parseInput(adhocWorkoutInput, input);
  assertCanLogFor(ctx, values.athlete_id);
  const { data: exercises, error: exErr } = await ctx.supabase.from("exercises").select("id, org_id").in("id", values.exercise_ids);
  if (exErr) throw dbError(exErr);
  const visible = new Set((exercises ?? []).filter((e) => e.org_id === null || e.org_id === ctx.org.id).map((e) => e.id as string));
  if (values.exercise_ids.some((e) => !visible.has(e))) throw new ServiceError("One of those exercises is not available.");
  const { data: log, error } = await ctx.supabase
    .from("workout_logs")
    .insert({ org_id: ctx.org.id, athlete_id: values.athlete_id, title: values.title, performed_on: values.performed_on ?? todayKey(), logged_by: ctx.user.id })
    .select("id")
    .single();
  if (error) throw dbError(error, "Could not start the workout.");
  const { error: insErr } = await ctx.supabase
    .from("workout_log_exercises")
    .insert(values.exercise_ids.map((exercise_id, position) => ({ org_id: ctx.org.id, log_id: log.id, exercise_id, position, planned: {} })));
  if (insErr) throw dbError(insErr);
  return log.id as string;
}

export interface WorkoutDetail {
  log: WorkoutLog;
  exercises: (WorkoutLogExercise & { exercise: Pick<Exercise, "id" | "name" | "measurement" | "cues" | "instructions" | "description">; sets: WorkoutLogSet[] })[];
}

export async function getWorkout(ctx: ServiceContext, logId: unknown): Promise<WorkoutDetail> {
  const id = parseInput(uuid, logId);
  const log = await loadLog(ctx, id);
  const { data: lex, error } = await ctx.supabase
    .from("workout_log_exercises")
    .select("id, org_id, log_id, exercise_id, program_exercise_id, position, planned, completed, notes")
    .eq("log_id", id)
    .order("position");
  if (error) throw dbError(error);
  const lexIds = (lex ?? []).map((e) => e.id as string);
  const exIds = [...new Set((lex ?? []).map((e) => e.exercise_id as string))];
  const [{ data: sets }, { data: exs }] = await Promise.all([
    lexIds.length
      ? ctx.supabase.from("workout_log_sets").select("*").in("log_exercise_id", lexIds).order("set_number")
      : Promise.resolve({ data: [] as WorkoutLogSet[] }),
    exIds.length
      ? ctx.supabase.from("exercises").select("id, name, measurement, cues, instructions, description").in("id", exIds)
      : Promise.resolve({ data: [] as Exercise[] }),
  ]);
  const exMap = new Map((exs ?? []).map((e) => [e.id as string, e]));
  return {
    log,
    exercises: ((lex ?? []) as WorkoutLogExercise[]).map((e) => ({
      ...e,
      exercise: (exMap.get(e.exercise_id) as WorkoutDetail["exercises"][number]["exercise"]) ?? {
        id: e.exercise_id,
        name: "Exercise",
        measurement: "reps_weight",
        cues: [],
        instructions: null,
        description: null,
      },
      sets: ((sets ?? []) as WorkoutLogSet[]).filter((s) => s.log_exercise_id === e.id),
    })),
  };
}

async function logForExercise(ctx: ServiceContext, logExerciseId: string): Promise<WorkoutLog> {
  const { data, error } = await ctx.supabase.from("workout_log_exercises").select("log_id").eq("id", logExerciseId).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Exercise not found in this workout.");
  return loadLog(ctx, data.log_id as string);
}

/** Records (or overwrites) one performed set. Performed values never overwrite the planned snapshot. */
export async function saveSet(ctx: ServiceContext, input: unknown): Promise<WorkoutLogSet> {
  const values = parseInput(setInput, input);
  await logForExercise(ctx, values.log_exercise_id);
  const { data, error } = await ctx.supabase
    .from("workout_log_sets")
    .upsert({ ...values, org_id: ctx.org.id, completed: true }, { onConflict: "log_exercise_id,set_number" })
    .select("*")
    .single();
  if (error) throw dbError(error, "Could not save the set.");
  return data as WorkoutLogSet;
}

export async function deleteSet(ctx: ServiceContext, input: unknown): Promise<void> {
  const values = parseInput(z.object({ log_exercise_id: uuid, set_number: z.number().int().min(1).max(50) }), input);
  await logForExercise(ctx, values.log_exercise_id);
  const { error } = await ctx.supabase.from("workout_log_sets").delete().eq("log_exercise_id", values.log_exercise_id).eq("set_number", values.set_number);
  if (error) throw dbError(error);
}

export async function setExerciseCompleted(ctx: ServiceContext, logExerciseId: unknown, completed: boolean): Promise<void> {
  const id = parseInput(uuid, logExerciseId);
  await logForExercise(ctx, id);
  const { error } = await ctx.supabase.from("workout_log_exercises").update({ completed }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function addExerciseToWorkout(ctx: ServiceContext, logId: unknown, exerciseId: unknown): Promise<void> {
  const lid = parseInput(uuid, logId);
  const eid = parseInput(uuid, exerciseId);
  await loadLog(ctx, lid);
  const { data: last } = await ctx.supabase.from("workout_log_exercises").select("position").eq("log_id", lid).order("position", { ascending: false }).limit(1);
  const { error } = await ctx.supabase
    .from("workout_log_exercises")
    .insert({ org_id: ctx.org.id, log_id: lid, exercise_id: eid, position: ((last?.[0]?.position as number | undefined) ?? -1) + 1, planned: {} });
  if (error) throw dbError(error, "Could not add that exercise.");
}

/** Finalises a workout. Creates the persisted completed record the schedule and analytics use. */
export async function completeWorkout(ctx: ServiceContext, input: unknown): Promise<WorkoutLog> {
  const values = parseInput(completeWorkoutInput, input);
  await loadLog(ctx, values.log_id);
  const { count } = await ctx.supabase
    .from("workout_log_sets")
    .select("id, workout_log_exercises!inner(log_id)", { count: "exact", head: true })
    .eq("workout_log_exercises.log_id", values.log_id);
  if (!count) throw new ServiceError("Record at least one set before completing the workout.");
  const { data, error } = await ctx.supabase
    .from("workout_logs")
    .update({
      status: "completed",
      perceived_effort: values.perceived_effort ?? null,
      recovery_rating: values.recovery_rating ?? null,
      notes: values.notes,
      ...(values.performed_on ? { performed_on: values.performed_on } : {}),
    })
    .eq("id", values.log_id)
    .eq("org_id", ctx.org.id)
    .select(LOG_COLUMNS)
    .single();
  if (error) throw dbError(error, "Could not complete the workout.");
  return data as WorkoutLog;
}

export async function reopenWorkout(ctx: ServiceContext, logId: unknown): Promise<void> {
  const id = parseInput(uuid, logId);
  await loadLog(ctx, id);
  const { error } = await ctx.supabase.from("workout_logs").update({ status: "in_progress" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function discardWorkout(ctx: ServiceContext, logId: unknown): Promise<void> {
  const id = parseInput(uuid, logId);
  const log = await loadLog(ctx, id);
  if (log.status === "completed" && !isCoachRole(ctx.role)) throw new ServiceError("Completed workouts can only be removed by your coach.");
  const { error } = await ctx.supabase.from("workout_logs").delete().eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function listWorkoutHistory(ctx: ServiceContext, athleteId: unknown, limit = 50): Promise<(WorkoutLog & { set_count: number })[]> {
  const id = parseInput(uuid, athleteId);
  if (isCoachRole(ctx.role)) assertCan(ctx, "athletes.read");
  else if (ctx.athleteId !== id) throw new ServiceError("Not found.");
  const { data, error } = await ctx.supabase
    .from("workout_logs")
    .select(`${LOG_COLUMNS}, workout_log_exercises(workout_log_sets(count))`)
    .eq("athlete_id", id)
    .eq("org_id", ctx.org.id)
    .order("performed_on", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw dbError(error);
  return (data ?? []).map((row) => {
    const nested = (row as unknown as { workout_log_exercises: { workout_log_sets: { count: number }[] }[] }).workout_log_exercises ?? [];
    const set_count = nested.reduce((acc, e) => acc + (e.workout_log_sets?.[0]?.count ?? 0), 0);
    const { workout_log_exercises: _omit, ...log } = row as Record<string, unknown>;
    void _omit;
    return { ...(log as unknown as WorkoutLog), set_count };
  });
}
