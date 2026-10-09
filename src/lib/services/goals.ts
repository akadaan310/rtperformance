import { z } from "zod";
import { assertCan, isCoachRole } from "@/lib/auth/permissions";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { CoachNote, Goal } from "@/lib/types";
import { goalInput, noteInput, uuid } from "@/lib/validation";
import { audit } from "./audit";
import type { ServiceContext } from "./context";

export async function createGoal(ctx: ServiceContext, input: unknown): Promise<Goal> {
  assertCan(ctx, "goals.write");
  const values = parseInput(goalInput, input);
  const { data, error } = await ctx.supabase
    .from("goals")
    .insert({ ...values, org_id: ctx.org.id, created_by: ctx.user.id })
    .select("*")
    .single();
  if (error) throw dbError(error, "Could not save the goal.");
  return data as Goal;
}

export async function setGoalStatus(ctx: ServiceContext, goalId: unknown, status: "active" | "achieved" | "archived"): Promise<void> {
  assertCan(ctx, "goals.write");
  const id = parseInput(uuid, goalId);
  const { error, count } = await ctx.supabase.from("goals").update({ status }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Goal not found.");
}

/** Manually reported progress for custom goals (athlete or coach). */
export async function reportGoalValue(ctx: ServiceContext, goalId: unknown, value: unknown): Promise<void> {
  const id = parseInput(uuid, goalId);
  const v = parseInput(z.coerce.number().min(-100000).max(100000), value);
  const { data: goal } = await ctx.supabase.from("goals").select("athlete_id, metric").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!goal) throw new ServiceError("Goal not found.");
  if (!isCoachRole(ctx.role) && goal.athlete_id !== ctx.athleteId) throw new ServiceError("Goal not found.");
  if (goal.metric !== "custom") throw new ServiceError("This goal updates automatically from logged workouts.");
  const { error } = await ctx.supabase.from("goals").update({ current_value: v }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function listNotes(ctx: ServiceContext, athleteId: unknown): Promise<(CoachNote & { author_name: string | null })[]> {
  const id = parseInput(uuid, athleteId);
  if (isCoachRole(ctx.role)) assertCan(ctx, "notes.read");
  else if (ctx.athleteId !== id) throw new ServiceError("Not found.");
  let query = ctx.supabase
    .from("coach_notes")
    .select("id, org_id, athlete_id, author_id, body, visibility, pinned, created_at")
    .eq("athlete_id", id)
    .eq("org_id", ctx.org.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  // Athletes only ever see notes their coach explicitly shared (RLS enforces the same).
  if (!isCoachRole(ctx.role)) query = query.eq("visibility", "shared");
  const { data, error } = await query;
  if (error) throw dbError(error);
  const authorIds = [...new Set((data ?? []).map((n) => n.author_id).filter(Boolean) as string[])];
  const { data: authors } = authorIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const names = new Map((authors ?? []).map((a) => [a.id as string, a.full_name as string | null]));
  return ((data ?? []) as CoachNote[]).map((n) => ({ ...n, author_name: n.author_id ? (names.get(n.author_id) ?? null) : null }));
}

export async function createNote(ctx: ServiceContext, input: unknown): Promise<void> {
  assertCan(ctx, "notes.write");
  const values = parseInput(noteInput, input);
  const { error } = await ctx.supabase.from("coach_notes").insert({ ...values, org_id: ctx.org.id, author_id: ctx.user.id });
  if (error) throw dbError(error, "Could not save the note.");
  if (values.visibility === "shared") await audit(ctx, "note.shared", { type: "athlete", id: values.athlete_id });
}

export async function updateNote(ctx: ServiceContext, noteId: unknown, patch: { visibility?: "private" | "shared"; pinned?: boolean }): Promise<void> {
  assertCan(ctx, "notes.write");
  const id = parseInput(uuid, noteId);
  const values = parseInput(z.object({ visibility: z.enum(["private", "shared"]).optional(), pinned: z.boolean().optional() }), patch);
  const { error, count } = await ctx.supabase.from("coach_notes").update(values, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Note not found.");
}

export async function deleteNote(ctx: ServiceContext, noteId: unknown): Promise<void> {
  assertCan(ctx, "notes.write");
  const id = parseInput(uuid, noteId);
  const { error, count } = await ctx.supabase.from("coach_notes").delete({ count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("You can delete your own notes (owners can delete any).");
}
