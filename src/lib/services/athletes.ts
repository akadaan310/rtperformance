import { assertCan } from "@/lib/auth/permissions";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { AthleteProfile } from "@/lib/types";
import { athleteInput, athleteListInput, athleteSelfInput, athleteUpdateInput, uuid } from "@/lib/validation";
import { audit } from "./audit";
import type { ServiceContext } from "./context";

const ATHLETE_COLUMNS =
  "id, org_id, user_id, first_name, last_name, email, phone, date_of_birth, status, experience_level, training_goals, training_preferences, equipment, limitations, sessions_per_week, next_check_in_date, created_at, updated_at";

export function athleteName(a: Pick<AthleteProfile, "first_name" | "last_name">): string {
  return `${a.first_name} ${a.last_name}`.trim();
}

export async function listAthletes(ctx: ServiceContext, input: unknown = {}): Promise<AthleteProfile[]> {
  assertCan(ctx, "athletes.read");
  const q = parseInput(athleteListInput, input);
  let query = ctx.supabase.from("athlete_profiles").select(ATHLETE_COLUMNS).eq("org_id", ctx.org.id).order("first_name").limit(q.limit);
  if (q.status !== "all") query = query.eq("status", q.status);
  if (q.search) {
    const term = q.search.replace(/[%,()]/g, " ").trim();
    if (term) query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data ?? []) as AthleteProfile[];
}

/** Fetches an athlete in the current workspace. The org filter plus RLS prevent cross-tenant access by ID. */
export async function getAthlete(ctx: ServiceContext, athleteId: unknown): Promise<AthleteProfile> {
  const id = parseInput(uuid, athleteId);
  if (ctx.role === "athlete" && ctx.athleteId !== id) throw new ServiceError("Athlete not found.");
  if (ctx.role !== "athlete") assertCan(ctx, "athletes.read");
  const { data, error } = await ctx.supabase.from("athlete_profiles").select(ATHLETE_COLUMNS).eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Athlete not found.");
  return data as AthleteProfile;
}

export async function createAthlete(ctx: ServiceContext, input: unknown): Promise<AthleteProfile> {
  assertCan(ctx, "athletes.write");
  const values = parseInput(athleteInput, input);
  const { data, error } = await ctx.supabase
    .from("athlete_profiles")
    .insert({ ...values, org_id: ctx.org.id, created_by: ctx.user.id })
    .select(ATHLETE_COLUMNS)
    .single();
  if (error) throw dbError(error);
  await audit(ctx, "athlete.created", { type: "athlete", id: data.id });
  return data as AthleteProfile;
}

export async function updateAthlete(ctx: ServiceContext, athleteId: unknown, input: unknown): Promise<AthleteProfile> {
  assertCan(ctx, "athletes.write");
  const id = parseInput(uuid, athleteId);
  const values = parseInput(athleteUpdateInput, input);
  const { data, error } = await ctx.supabase
    .from("athlete_profiles")
    .update(values)
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .select(ATHLETE_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Athlete not found.");
  if (values.status) await audit(ctx, `athlete.${values.status === "archived" ? "archived" : "status_changed"}`, { type: "athlete", id }, { status: values.status });
  return data as AthleteProfile;
}

/** Athletes editing their own preferences (DB trigger also restricts which columns they can change). */
export async function updateOwnPreferences(ctx: ServiceContext, input: unknown): Promise<void> {
  if (ctx.role !== "athlete" || !ctx.athleteId) throw new ServiceError("Only athletes can update their preferences here.");
  const values = parseInput(athleteSelfInput, input);
  const { error } = await ctx.supabase.from("athlete_profiles").update(values).eq("id", ctx.athleteId).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function deleteAthlete(ctx: ServiceContext, athleteId: unknown): Promise<void> {
  assertCan(ctx, "athletes.delete", "Only workspace owners can permanently delete athletes. Archive them instead.");
  const id = parseInput(uuid, athleteId);
  const { error, count } = await ctx.supabase.from("athlete_profiles").delete({ count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Athlete not found.");
  await audit(ctx, "athlete.deleted", { type: "athlete", id });
}
