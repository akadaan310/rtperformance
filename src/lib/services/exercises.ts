import { assertCan } from "@/lib/auth/permissions";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { Exercise } from "@/lib/types";
import { exerciseInput, exerciseSearchInput, uuid } from "@/lib/validation";
import { audit } from "./audit";
import type { ServiceContext } from "./context";

export const EXERCISE_COLUMNS =
  "id, org_id, name, description, muscle_groups, equipment, category, difficulty, measurement, cues, instructions, default_sets, default_reps, default_rest_seconds, default_tempo, default_rpe, is_archived";

/** Shared starter library (org_id null) plus this workspace's own exercises. */
export async function searchExercises(ctx: ServiceContext, input: unknown = {}): Promise<Exercise[]> {
  const q = parseInput(exerciseSearchInput, input);
  let query = ctx.supabase
    .from("exercises")
    .select(EXERCISE_COLUMNS)
    .or(`org_id.is.null,org_id.eq.${ctx.org.id}`)
    .eq("is_archived", false)
    .order("name")
    .limit(q.limit);
  if (q.query) {
    const term = q.query.replace(/[%,()]/g, " ").trim();
    if (term) query = query.ilike("name", `%${term}%`);
  }
  if (q.category) query = query.eq("category", q.category);
  if (q.equipment) query = query.contains("equipment", [q.equipment.toLowerCase()]);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data ?? []) as Exercise[];
}

export async function getExercise(ctx: ServiceContext, exerciseId: unknown) {
  const id = parseInput(uuid, exerciseId);
  const { data, error } = await ctx.supabase
    .from("exercises")
    .select(EXERCISE_COLUMNS)
    .eq("id", id)
    .or(`org_id.is.null,org_id.eq.${ctx.org.id}`)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Exercise not found.");
  const { data: subs } = await ctx.supabase
    .from("exercise_substitutions")
    .select("substitute_id, note, exercises!exercise_substitutions_substitute_id_fkey(id, name)")
    .eq("exercise_id", id)
    .or(`org_id.is.null,org_id.eq.${ctx.org.id}`);
  const { data: media } = await ctx.supabase
    .from("exercise_media")
    .select("id, kind, storage_path, external_url, caption")
    .eq("exercise_id", id)
    .order("position");
  return {
    exercise: data as Exercise,
    substitutions: (subs ?? []).map((s) => ({
      id: s.substitute_id as string,
      name: (s.exercises as unknown as { name: string } | null)?.name ?? "Exercise",
      note: s.note as string | null,
    })),
    media: (media ?? []) as { id: string; kind: string; storage_path: string | null; external_url: string | null; caption: string | null }[],
  };
}

export async function getExercisesByIds(ctx: ServiceContext, ids: string[]): Promise<Map<string, Exercise>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await ctx.supabase.from("exercises").select(EXERCISE_COLUMNS).in("id", unique);
  if (error) throw dbError(error);
  return new Map((data as Exercise[]).map((e) => [e.id, e]));
}

export async function createExercise(ctx: ServiceContext, input: unknown): Promise<Exercise> {
  assertCan(ctx, "exercises.write");
  const values = parseInput(exerciseInput, input);
  const { data, error } = await ctx.supabase
    .from("exercises")
    .insert({
      ...values,
      equipment: values.equipment.map((e) => e.toLowerCase()),
      muscle_groups: values.muscle_groups.map((m) => m.toLowerCase()),
      org_id: ctx.org.id,
      created_by: ctx.user.id,
    })
    .select(EXERCISE_COLUMNS)
    .single();
  if (error) throw dbError(error, "Could not save the exercise.");
  await audit(ctx, "exercise.created", { type: "exercise", id: data.id });
  return data as Exercise;
}

export async function updateExercise(ctx: ServiceContext, exerciseId: unknown, input: unknown): Promise<Exercise> {
  assertCan(ctx, "exercises.write");
  const id = parseInput(uuid, exerciseId);
  const values = parseInput(exerciseInput, input);
  const { data, error } = await ctx.supabase
    .from("exercises")
    .update({ ...values, equipment: values.equipment.map((e) => e.toLowerCase()), muscle_groups: values.muscle_groups.map((m) => m.toLowerCase()) })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .select(EXERCISE_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Only exercises created in this workspace can be edited.");
  return data as Exercise;
}

export async function setSubstitutions(ctx: ServiceContext, exerciseId: unknown, substituteIds: unknown): Promise<void> {
  assertCan(ctx, "exercises.write");
  const id = parseInput(uuid, exerciseId);
  const subs = parseInput(uuid.array().max(10), substituteIds).filter((s) => s !== id);
  const { error: delErr } = await ctx.supabase.from("exercise_substitutions").delete().eq("exercise_id", id).eq("org_id", ctx.org.id);
  if (delErr) throw dbError(delErr);
  if (subs.length) {
    const { error } = await ctx.supabase
      .from("exercise_substitutions")
      .insert(subs.map((s) => ({ org_id: ctx.org.id, exercise_id: id, substitute_id: s })));
    if (error) throw dbError(error);
  }
}
