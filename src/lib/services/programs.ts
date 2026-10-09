import { z } from "zod";
import { assertCan } from "@/lib/auth/permissions";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { Exercise, ProgramExercise, ProgramSession, ProgramTemplate, ProgramVersion } from "@/lib/types";
import {
  assignInput,
  prescriptionInput,
  programDraftInput,
  programMetaInput,
  sessionInput,
  uuid,
} from "@/lib/validation";
import { audit } from "./audit";
import type { ServiceContext } from "./context";
import { EXERCISE_COLUMNS } from "./exercises";

const TEMPLATE_COLUMNS =
  "id, org_id, kind, name, description, goal, level, duration_weeks, sessions_per_week, status, source_template_id, created_via, created_at, updated_at";
const VERSION_COLUMNS = "id, org_id, template_id, version_number, status, change_summary, published_at, created_at";
const SESSION_COLUMNS = "id, org_id, version_id, week_number, day_number, position, name, focus, notes, estimated_minutes";
const PEX_COLUMNS =
  "id, org_id, session_id, exercise_id, position, block_label, sets, reps, load_type, load_value, load_unit, rest_seconds, tempo, rpe_target, progression, notes, substitution_ids";

export interface ProgramListItem extends ProgramTemplate {
  latest_version: number | null;
  has_draft: boolean;
  active_assignments: number;
  session_count: number;
}

export interface SessionWithExercises extends ProgramSession {
  exercises: (ProgramExercise & { exercise: Pick<Exercise, "id" | "name" | "category" | "measurement" | "equipment" | "cues"> })[];
}

export interface ProgramDetail {
  template: ProgramTemplate;
  versions: ProgramVersion[];
  /** The version being shown: the open draft if one exists, else the latest published one. */
  version: ProgramVersion;
  editable: boolean;
  sessions: SessionWithExercises[];
}

export async function listPrograms(ctx: ServiceContext, opts: { includeArchived?: boolean; kind?: "program" | "session" } = {}): Promise<ProgramListItem[]> {
  assertCan(ctx, "programs.read");
  let query = ctx.supabase.from("program_templates").select(TEMPLATE_COLUMNS).eq("org_id", ctx.org.id).order("updated_at", { ascending: false });
  if (!opts.includeArchived) query = query.neq("status", "archived");
  if (opts.kind) query = query.eq("kind", opts.kind);
  const { data: templates, error } = await query;
  if (error) throw dbError(error);
  const ids = (templates ?? []).map((t) => t.id as string);
  if (!ids.length) return [];
  const [{ data: versions }, { data: assignments }] = await Promise.all([
    ctx.supabase.from("program_versions").select("id, template_id, version_number, status").in("template_id", ids),
    ctx.supabase.from("assignments").select("template_id").in("template_id", ids).eq("status", "active"),
  ]);
  const versionIds = (versions ?? []).map((v) => v.id as string);
  const { data: sessions } = versionIds.length
    ? await ctx.supabase.from("program_sessions").select("version_id").in("version_id", versionIds)
    : { data: [] as { version_id: string }[] };
  return (templates as ProgramTemplate[]).map((t) => {
    const vs = (versions ?? []).filter((v) => v.template_id === t.id);
    const published = vs.filter((v) => v.status === "published").sort((a, b) => b.version_number - a.version_number)[0];
    const draft = vs.find((v) => v.status === "draft");
    const shown = draft ?? published;
    return {
      ...t,
      latest_version: published?.version_number ?? null,
      has_draft: Boolean(draft),
      active_assignments: (assignments ?? []).filter((a) => a.template_id === t.id).length,
      session_count: shown ? (sessions ?? []).filter((s) => s.version_id === shown.id).length : 0,
    };
  });
}

export async function getProgram(ctx: ServiceContext, templateId: unknown, versionId?: string | null): Promise<ProgramDetail> {
  assertCan(ctx, "programs.read");
  const id = parseInput(uuid, templateId);
  const { data: template, error } = await ctx.supabase.from("program_templates").select(TEMPLATE_COLUMNS).eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!template) throw new ServiceError("Program not found.");
  const { data: versions } = await ctx.supabase
    .from("program_versions")
    .select(VERSION_COLUMNS)
    .eq("template_id", id)
    .order("version_number", { ascending: false });
  const list = (versions ?? []) as ProgramVersion[];
  const version =
    (versionId && list.find((v) => v.id === versionId)) || list.find((v) => v.status === "draft") || list.find((v) => v.status === "published");
  if (!version) throw new ServiceError("This program has no versions.");
  const sessions = await loadVersionContent(ctx, version.id);
  return { template: template as ProgramTemplate, versions: list, version, editable: version.status === "draft", sessions };
}

export async function loadVersionContent(ctx: Pick<ServiceContext, "supabase">, versionId: string): Promise<SessionWithExercises[]> {
  const { data: sessions, error } = await ctx.supabase
    .from("program_sessions")
    .select(SESSION_COLUMNS)
    .eq("version_id", versionId)
    .order("week_number")
    .order("day_number")
    .order("position");
  if (error) throw dbError(error);
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (!sessionIds.length) return [];
  const { data: pex, error: pexErr } = await ctx.supabase.from("program_exercises").select(PEX_COLUMNS).in("session_id", sessionIds).order("position");
  if (pexErr) throw dbError(pexErr);
  const exerciseIds = [...new Set((pex ?? []).map((p) => p.exercise_id as string))];
  const { data: exercises } = exerciseIds.length
    ? await ctx.supabase.from("exercises").select("id, name, category, measurement, equipment, cues").in("id", exerciseIds)
    : { data: [] };
  const exMap = new Map((exercises ?? []).map((e) => [e.id as string, e]));
  return (sessions as ProgramSession[]).map((s) => ({
    ...s,
    exercises: ((pex ?? []) as ProgramExercise[])
      .filter((p) => p.session_id === s.id)
      .map((p) => ({
        ...p,
        exercise: (exMap.get(p.exercise_id) as SessionWithExercises["exercises"][number]["exercise"]) ?? {
          id: p.exercise_id,
          name: "Exercise",
          category: "accessory",
          measurement: "reps_weight",
          equipment: [],
          cues: [],
        },
      })),
  }));
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------
export async function createProgram(ctx: ServiceContext, input: unknown): Promise<{ templateId: string; versionId: string }> {
  assertCan(ctx, "programs.write");
  const meta = parseInput(programMetaInput, input);
  const { data, error } = await ctx.supabase.rpc("create_program", {
    p_org: ctx.org.id,
    p_name: meta.name,
    p_kind: meta.kind,
    p_description: meta.description,
    p_goal: meta.goal,
    p_level: meta.level ?? null,
    p_duration_weeks: meta.duration_weeks,
    p_sessions_per_week: meta.sessions_per_week,
    p_created_via: ctx.source ?? "app",
  });
  if (error) throw dbError(error, "Could not create the program.");
  const row = (Array.isArray(data) ? data[0] : data) as { template_id: string; version_id: string };
  return { templateId: row.template_id, versionId: row.version_id };
}

/** Creates a complete draft (program + sessions + prescriptions) in one call. Used by the builder and AI. */
export async function createProgramFromDraft(ctx: ServiceContext, input: unknown): Promise<{ templateId: string; versionId: string }> {
  assertCan(ctx, "programs.write");
  const draft = parseInput(programDraftInput, input);
  await assertExercisesVisible(ctx, draft.sessions.flatMap((s) => s.exercises.flatMap((e) => [e.exercise_id, ...e.substitution_ids])));
  const ids = await createProgram(ctx, draft);
  try {
    await insertSessions(ctx, ids.versionId, draft.sessions);
  } catch (err) {
    // Do not leave a half-built draft behind.
    await ctx.supabase.from("program_templates").delete().eq("id", ids.templateId).eq("org_id", ctx.org.id);
    throw err;
  }
  return ids;
}

async function insertSessions(ctx: ServiceContext, versionId: string, sessions: z.infer<typeof programDraftInput>["sessions"]) {
  for (const [i, s] of sessions.entries()) {
    const { exercises, ...sessionValues } = s;
    const { data: row, error } = await ctx.supabase
      .from("program_sessions")
      .insert({ ...sessionValues, org_id: ctx.org.id, version_id: versionId, position: i })
      .select("id")
      .single();
    if (error) throw dbError(error, "Could not save a session.");
    if (exercises.length) {
      const { error: exErr } = await ctx.supabase
        .from("program_exercises")
        .insert(exercises.map((e, j) => ({ ...normalisePrescription(e), org_id: ctx.org.id, session_id: row.id, position: j })));
      if (exErr) throw dbError(exErr, "Could not save the session's exercises.");
    }
  }
}

function normalisePrescription(p: z.infer<typeof prescriptionInput>) {
  const weighted = p.load_type === "weight";
  return {
    ...p,
    load_value: p.load_type === "none" || p.load_type === "bodyweight" ? null : (p.load_value ?? null),
    load_unit: weighted ? (p.load_unit ?? "lb") : null,
  };
}

async function assertExercisesVisible(ctx: ServiceContext, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const { data, error } = await ctx.supabase.from("exercises").select("id, org_id").in("id", unique);
  if (error) throw dbError(error);
  const visible = new Set((data ?? []).filter((e) => e.org_id === null || e.org_id === ctx.org.id).map((e) => e.id as string));
  const missing = unique.filter((id) => !visible.has(id));
  if (missing.length) throw new ServiceError(`Unknown exercise id(s): ${missing.join(", ")}. Search the exercise library first.`);
}

export async function updateProgramMeta(ctx: ServiceContext, templateId: unknown, input: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, templateId);
  const meta = parseInput(programMetaInput.omit({ kind: true }), input);
  const { error, count } = await ctx.supabase.from("program_templates").update(meta, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Program not found.");
}

async function requireDraftVersion(ctx: ServiceContext, versionId: string): Promise<ProgramVersion> {
  const { data, error } = await ctx.supabase.from("program_versions").select(VERSION_COLUMNS).eq("id", versionId).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Program version not found.");
  if (data.status !== "draft") throw new ServiceError("Published versions are locked. Start a revision to make changes.");
  return data as ProgramVersion;
}

async function sessionVersion(ctx: ServiceContext, sessionId: string): Promise<ProgramSession> {
  const { data, error } = await ctx.supabase.from("program_sessions").select(SESSION_COLUMNS).eq("id", sessionId).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Session not found.");
  await requireDraftVersion(ctx, data.version_id as string);
  return data as ProgramSession;
}

export async function addSession(ctx: ServiceContext, versionId: unknown, input: unknown): Promise<ProgramSession> {
  assertCan(ctx, "programs.write");
  const vid = parseInput(uuid, versionId);
  const values = parseInput(sessionInput, input);
  await requireDraftVersion(ctx, vid);
  const { data: last } = await ctx.supabase.from("program_sessions").select("position").eq("version_id", vid).order("position", { ascending: false }).limit(1);
  const { data, error } = await ctx.supabase
    .from("program_sessions")
    .insert({ ...values, org_id: ctx.org.id, version_id: vid, position: ((last?.[0]?.position as number | undefined) ?? -1) + 1 })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw dbError(error);
  return data as ProgramSession;
}

export async function updateSession(ctx: ServiceContext, sessionId: unknown, input: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, sessionId);
  const values = parseInput(sessionInput, input);
  await sessionVersion(ctx, id);
  const { error } = await ctx.supabase.from("program_sessions").update(values).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function removeSession(ctx: ServiceContext, sessionId: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, sessionId);
  await sessionVersion(ctx, id);
  const { error } = await ctx.supabase.from("program_sessions").delete().eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

/** Move a session earlier/later in the program by swapping its slot (week, day, position) with its neighbour. */
export async function moveSession(ctx: ServiceContext, sessionId: unknown, direction: "up" | "down"): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, sessionId);
  const session = await sessionVersion(ctx, id);
  const sessions = await loadVersionContent(ctx, session.version_id);
  const idx = sessions.findIndex((s) => s.id === id);
  const other = sessions[direction === "up" ? idx - 1 : idx + 1];
  if (!other) return;
  const a = { week_number: other.week_number, day_number: other.day_number, position: other.position };
  const b = { week_number: session.week_number, day_number: session.day_number, position: session.position };
  // Identical slots (same week/day/position) would not reorder; nudge positions apart.
  if (a.week_number === b.week_number && a.day_number === b.day_number && a.position === b.position) {
    if (direction === "up") b.position += 1;
    else a.position += 1;
  }
  const r1 = await ctx.supabase.from("program_sessions").update(a).eq("id", session.id).eq("org_id", ctx.org.id);
  const r2 = await ctx.supabase.from("program_sessions").update(b).eq("id", other.id).eq("org_id", ctx.org.id);
  if (r1.error || r2.error) throw dbError(r1.error ?? r2.error);
}

export async function addProgramExercise(ctx: ServiceContext, sessionId: unknown, input: unknown): Promise<ProgramExercise> {
  assertCan(ctx, "programs.write");
  const sid = parseInput(uuid, sessionId);
  const values = parseInput(prescriptionInput, input);
  await sessionVersion(ctx, sid);
  await assertExercisesVisible(ctx, [values.exercise_id, ...values.substitution_ids]);
  const { data: last } = await ctx.supabase.from("program_exercises").select("position").eq("session_id", sid).order("position", { ascending: false }).limit(1);
  const { data, error } = await ctx.supabase
    .from("program_exercises")
    .insert({ ...normalisePrescription(values), org_id: ctx.org.id, session_id: sid, position: ((last?.[0]?.position as number | undefined) ?? -1) + 1 })
    .select(PEX_COLUMNS)
    .single();
  if (error) throw dbError(error);
  return data as ProgramExercise;
}

async function programExerciseSession(ctx: ServiceContext, id: string): Promise<ProgramExercise> {
  const { data, error } = await ctx.supabase.from("program_exercises").select(PEX_COLUMNS).eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ServiceError("Exercise not found in this program.");
  await sessionVersion(ctx, data.session_id as string);
  return data as ProgramExercise;
}

export async function updateProgramExercise(ctx: ServiceContext, programExerciseId: unknown, input: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, programExerciseId);
  const values = parseInput(prescriptionInput, input);
  await programExerciseSession(ctx, id);
  await assertExercisesVisible(ctx, [values.exercise_id, ...values.substitution_ids]);
  const { error } = await ctx.supabase.from("program_exercises").update(normalisePrescription(values)).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function removeProgramExercise(ctx: ServiceContext, programExerciseId: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, programExerciseId);
  await programExerciseSession(ctx, id);
  const { error } = await ctx.supabase.from("program_exercises").delete().eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export async function moveProgramExercise(ctx: ServiceContext, programExerciseId: unknown, direction: "up" | "down"): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, programExerciseId);
  const pe = await programExerciseSession(ctx, id);
  const { data: siblings } = await ctx.supabase.from("program_exercises").select("id, position").eq("session_id", pe.session_id).order("position").order("created_at");
  const list = (siblings ?? []).map((s, i) => ({ id: s.id as string, position: i }));
  const idx = list.findIndex((s) => s.id === id);
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= list.length) return;
  [list[idx], list[swap]] = [list[swap]!, list[idx]!];
  for (const [i, item] of list.entries()) {
    const { error } = await ctx.supabase.from("program_exercises").update({ position: i }).eq("id", item.id).eq("org_id", ctx.org.id);
    if (error) throw dbError(error);
  }
}

/** Replace the full content of a draft version (used by AI revisions so edits land in one validated pass). */
export async function replaceDraftContent(ctx: ServiceContext, versionId: unknown, sessionsInput: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const vid = parseInput(uuid, versionId);
  const sessions = parseInput(programDraftInput.shape.sessions, sessionsInput);
  await requireDraftVersion(ctx, vid);
  await assertExercisesVisible(ctx, sessions.flatMap((s) => s.exercises.flatMap((e) => [e.exercise_id, ...e.substitution_ids])));
  const { error } = await ctx.supabase.from("program_sessions").delete().eq("version_id", vid).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  await insertSessions(ctx, vid, sessions);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export async function publishVersion(ctx: ServiceContext, versionId: unknown, changeSummary?: string | null): Promise<void> {
  assertCan(ctx, "programs.publish");
  const vid = parseInput(uuid, versionId);
  const summary = parseInput(z.string().trim().max(1000).optional().nullable(), changeSummary);
  const { error } = await ctx.supabase.rpc("publish_program_version", { p_version: vid, p_change_summary: summary ?? null, p_source: ctx.source ?? "app" });
  if (error) throw dbError(error, "Could not publish the program.");
}

export async function startRevision(ctx: ServiceContext, templateId: unknown): Promise<string> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, templateId);
  const { data, error } = await ctx.supabase.rpc("start_program_revision", { p_template: id });
  if (error) throw dbError(error);
  return data as string;
}

export async function duplicateProgram(ctx: ServiceContext, templateId: unknown, name?: string | null): Promise<string> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, templateId);
  const { data, error } = await ctx.supabase.rpc("duplicate_program", { p_template: id, p_name: name ?? null });
  if (error) throw dbError(error);
  return data as string;
}

export async function setProgramArchived(ctx: ServiceContext, templateId: unknown, archived: boolean): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, templateId);
  const { data: versions } = await ctx.supabase.from("program_versions").select("status").eq("template_id", id);
  const status = archived ? "archived" : (versions ?? []).some((v) => v.status === "published") ? "published" : "draft";
  const { error, count } = await ctx.supabase.from("program_templates").update({ status }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Program not found.");
  await audit(ctx, archived ? "program.archived" : "program.restored", { type: "program_template", id });
}

/** Deletes a program that has never been assigned. Assigned programs must be archived to preserve history. */
export async function deleteProgram(ctx: ServiceContext, templateId: unknown): Promise<void> {
  assertCan(ctx, "programs.write");
  const id = parseInput(uuid, templateId);
  const { count } = await ctx.supabase.from("assignments").select("id", { count: "exact", head: true }).eq("template_id", id);
  if (count) throw new ServiceError("This program has assignment history. Archive it instead so athletes' records stay intact.");
  const { error, count: deleted } = await ctx.supabase.from("program_templates").delete({ count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!deleted) throw new ServiceError("Program not found.");
  await audit(ctx, "program.deleted", { type: "program_template", id });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
export async function assignProgram(ctx: ServiceContext, input: unknown): Promise<string> {
  assertCan(ctx, "programs.assign");
  const values = parseInput(assignInput, input);
  const { data, error } = await ctx.supabase.rpc("assign_program", {
    p_athlete: values.athlete_id,
    p_template: values.template_id,
    p_start: values.start_date,
    p_training_days: values.training_days,
    p_notes: values.notes,
    p_source: ctx.source ?? "app",
  });
  if (error) throw dbError(error, "Could not assign the program.");
  return data as string;
}

export async function cancelAssignment(ctx: ServiceContext, assignmentId: unknown): Promise<void> {
  assertCan(ctx, "programs.assign");
  const id = parseInput(uuid, assignmentId);
  const { error, count } = await ctx.supabase.from("assignments").update({ status: "cancelled" }, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
  if (!count) throw new ServiceError("Assignment not found.");
  await audit(ctx, "assignment.cancelled", { type: "assignment", id });
}

export async function assignmentHistory(ctx: ServiceContext, templateId: unknown) {
  assertCan(ctx, "programs.read");
  const id = parseInput(uuid, templateId);
  const { data, error } = await ctx.supabase
    .from("assignments")
    .select("id, athlete_id, start_date, status, created_at, version_id, athlete_profiles(first_name, last_name), program_versions(version_number)")
    .eq("template_id", id)
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false });
  if (error) throw dbError(error);
  return (data ?? []).map((a) => ({
    id: a.id as string,
    athlete_id: a.athlete_id as string,
    athlete_name: (() => {
      const p = a.athlete_profiles as unknown as { first_name: string; last_name: string } | null;
      return p ? `${p.first_name} ${p.last_name}`.trim() : "Athlete";
    })(),
    version_number: (a.program_versions as unknown as { version_number: number } | null)?.version_number ?? null,
    start_date: a.start_date as string,
    status: a.status as string,
    created_at: a.created_at as string,
  }));
}

export async function listExerciseOptions(ctx: ServiceContext): Promise<Pick<Exercise, "id" | "name" | "category" | "equipment" | "measurement" | "default_sets" | "default_reps" | "default_rest_seconds" | "default_tempo" | "org_id">[]> {
  const { data, error } = await ctx.supabase
    .from("exercises")
    .select(EXERCISE_COLUMNS)
    .or(`org_id.is.null,org_id.eq.${ctx.org.id}`)
    .eq("is_archived", false)
    .order("name");
  if (error) throw dbError(error);
  return (data ?? []) as Exercise[];
}
