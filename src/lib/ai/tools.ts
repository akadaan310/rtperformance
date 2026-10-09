/**
 * The Tech Guy's tool registry. Every tool is:
 *   - allowlisted (the model can only call names defined here),
 *   - schema-validated with zod before anything runs,
 *   - permission-checked against the signed-in user's role in the current workspace,
 *   - executed through the same application services the UI uses (which re-validate and run under RLS).
 * The model never supplies the workspace, user or role — those come from the authenticated session.
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { can, type Permission } from "@/lib/auth/permissions";
import { todayKey } from "@/lib/dates";
import { addDays, isMissed, pct } from "@/lib/metrics";
import { ServiceError } from "@/lib/result";
import { athleteName, createAthlete, getAthlete, listAthletes } from "@/lib/services/athletes";
import { getBrand, patchBrand } from "@/lib/services/branding";
import type { ServiceContext } from "@/lib/services/context";
import { getDashboard } from "@/lib/services/dashboard";
import { searchExercises } from "@/lib/services/exercises";
import { createInvitation } from "@/lib/services/invitations";
import {
  assignProgram,
  createProgramFromDraft,
  getProgram,
  listPrograms,
  publishVersion,
  replaceDraftContent,
  startRevision,
} from "@/lib/services/programs";
import { athleteProgress, loadMetricLogs, loadScheduled } from "@/lib/services/progress";
import { WEEKDAYS } from "@/lib/schedule";
import { toCardSessions, type ProgramCardSession } from "@/lib/program-format";

export type { ProgramCardSession };

export type ToolKind = "read" | "draft" | "confirm";

export type AssistantCard =
  | { type: "program"; programId: string; versionId: string; name: string; status: string; versionNumber: number; sessions: ProgramCardSession[] }
  | { type: "pending_action"; actionId: string; tool: string; title: string; details: string[]; status: "pending" | "executed" | "cancelled" | "failed" }
  | { type: "invitation"; url: string; email: string; expiresAt: string; kind: string }
  | { type: "link"; href: string; label: string };

export interface ToolOutput {
  /** JSON-serialisable data returned to the model (minimal fields only). */
  result: unknown;
  card?: AssistantCard;
  /** Short line appended to the conversation's running summary. */
  memo?: string;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  kind: ToolKind;
  schema: S;
  /** Permission required to call (and, for confirm tools, to execute) the tool. */
  permission: (ctx: ServiceContext, input: z.infer<S>) => Permission;
  /** Human-readable confirmation text for consequential tools. */
  confirmation?: (ctx: ServiceContext, input: z.infer<S>) => Promise<{ title: string; details: string[] }>;
  run: (ctx: ServiceContext, input: z.infer<S>) => Promise<ToolOutput>;
}

function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

const id = (what: string) => z.string().uuid().describe(`${what} id (UUID) returned by another tool. Never invent ids.`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date as YYYY-MM-DD");

const prescription = z.object({
  exercise_id: id("Exercise (from search_exercises)"),
  sets: z.number().int().min(1).max(20),
  reps: z.string().min(1).max(20).describe("Rep target, e.g. '5', '8-10', 'AMRAP', '30s', '40 m'"),
  load_type: z.enum(["none", "bodyweight", "weight", "percent_1rm", "rpe"]).default("none"),
  load_value: z.number().min(0).max(2000).optional().describe("Weight (with load_unit), %1RM, or RPE depending on load_type"),
  load_unit: z.enum(["lb", "kg"]).optional(),
  rest_seconds: z.number().int().min(0).max(900).optional(),
  tempo: z.string().regex(/^[0-9X]{4}$/).optional().describe("Four-digit tempo, e.g. 3010"),
  rpe_target: z.number().min(1).max(10).optional(),
  block_label: z.string().regex(/^[A-Z][0-9]{0,2}$/).optional().describe("Superset label such as A1, A2"),
  progression: z.string().max(500).optional().describe("How to progress week to week"),
  notes: z.string().max(1000).optional(),
  substitution_ids: z.array(z.string().uuid()).max(5).optional().describe("Alternative exercise ids for restrictions/equipment"),
});

const sessionShape = z.object({
  name: z.string().min(1).max(120),
  week_number: z.number().int().min(1).max(52).default(1),
  day_number: z.number().int().min(1).max(7).describe("Session order within the week (Day 1, Day 2…), not a weekday"),
  focus: z.string().max(200).optional(),
  notes: z.string().max(2000).optional().describe("Coach notes for this session"),
  estimated_minutes: z.number().int().min(5).max(300).optional(),
  exercises: z.array(prescription).min(1).max(15),
});

// ---------------------------------------------------------------------------
// Helpers to keep payloads small and free of unnecessary personal data
// ---------------------------------------------------------------------------
function programCard(detail: Awaited<ReturnType<typeof getProgram>>): AssistantCard {
  return {
    type: "program",
    programId: detail.template.id,
    versionId: detail.version.id,
    name: detail.template.name,
    status: detail.version.status,
    versionNumber: detail.version.version_number,
    sessions: toCardSessions(detail.sessions),
  };
}

function compactProgram(detail: Awaited<ReturnType<typeof getProgram>>) {
  return {
    program_id: detail.template.id,
    name: detail.template.name,
    kind: detail.template.kind,
    status: detail.template.status,
    version: { id: detail.version.id, number: detail.version.version_number, status: detail.version.status, editable: detail.editable },
    duration_weeks: detail.template.duration_weeks,
    sessions_per_week: detail.template.sessions_per_week,
    sessions: detail.sessions.map((s) => ({
      name: s.name,
      week_number: s.week_number,
      day_number: s.day_number,
      focus: s.focus,
      notes: s.notes,
      exercises: s.exercises.map((e) => ({
        exercise_id: e.exercise_id,
        name: e.exercise.name,
        sets: e.sets,
        reps: e.reps,
        load_type: e.load_type,
        load_value: e.load_value,
        load_unit: e.load_unit,
        rest_seconds: e.rest_seconds,
        tempo: e.tempo,
        rpe_target: e.rpe_target,
        progression: e.progression,
        notes: e.notes,
      })),
    })),
  };
}

function dayNames(days: number[]): string {
  return days.map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? String(d)).join(", ");
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
export const TOOLS = [
  defineTool({
    name: "list_athletes",
    description: "List athletes in the current workspace with status and training basics.",
    kind: "read",
    schema: z.object({ search: z.string().max(80).optional(), status: z.enum(["active", "paused", "archived", "all"]).default("active") }),
    permission: () => "athletes.read",
    async run(ctx, input) {
      const athletes = await listAthletes(ctx, { search: input.search, status: input.status, limit: 100 });
      return {
        result: athletes.map((a) => ({
          id: a.id,
          name: athleteName(a),
          status: a.status,
          experience_level: a.experience_level,
          sessions_per_week: a.sessions_per_week,
          has_login: Boolean(a.user_id),
        })),
      };
    },
  }),
  defineTool({
    name: "get_athlete_profile",
    description:
      "Training profile for one athlete: goals, experience, preferences, equipment and any limitations they voluntarily provided. Contact details are intentionally excluded.",
    kind: "read",
    schema: z.object({ athlete_id: id("Athlete") }),
    permission: () => "athletes.read",
    async run(ctx, input) {
      const a = await getAthlete(ctx, input.athlete_id);
      return {
        result: {
          id: a.id,
          name: athleteName(a),
          status: a.status,
          experience_level: a.experience_level,
          sessions_per_week: a.sessions_per_week,
          training_goals: a.training_goals,
          training_preferences: a.training_preferences,
          equipment: a.equipment,
          limitations: a.limitations,
          next_check_in_date: a.next_check_in_date,
        },
      };
    },
  }),
  defineTool({
    name: "get_athlete_programs",
    description: "Programs assigned to an athlete (active, completed and cancelled) with their pinned version.",
    kind: "read",
    schema: z.object({ athlete_id: id("Athlete") }),
    permission: () => "athletes.read",
    async run(ctx, input) {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .select("id, template_id, start_date, training_days, status, program_templates(name), program_versions(version_number)")
        .eq("athlete_id", input.athlete_id)
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: false });
      if (error) throw new ServiceError("Could not load assignments.");
      return {
        result: (data ?? []).map((a) => ({
          assignment_id: a.id,
          program_id: a.template_id,
          program_name: (a.program_templates as unknown as { name: string } | null)?.name,
          version: (a.program_versions as unknown as { version_number: number } | null)?.version_number,
          start_date: a.start_date,
          training_days: dayNames(a.training_days as number[]),
          status: a.status,
        })),
      };
    },
  }),
  defineTool({
    name: "search_exercises",
    description:
      "Search the exercise library (RT Performance starter library plus this workspace's exercises). Always use this to obtain exercise ids before building or revising programs.",
    kind: "read",
    schema: z.object({
      query: z.string().max(80).optional().describe("Part of the exercise name"),
      category: z
        .enum(["squat", "hinge", "push", "pull", "lunge", "carry", "core", "conditioning", "mobility", "power", "accessory"])
        .optional(),
      equipment: z.string().max(40).optional().describe("e.g. barbell, dumbbell, kettlebell, bodyweight, cable"),
      limit: z.number().int().min(1).max(60).default(25),
    }),
    permission: () => "programs.read",
    async run(ctx, input) {
      const list = await searchExercises(ctx, input);
      return {
        result: list.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          difficulty: e.difficulty,
          equipment: e.equipment,
          measurement: e.measurement,
          defaults: { sets: e.default_sets, reps: e.default_reps, rest_seconds: e.default_rest_seconds, tempo: e.default_tempo },
        })),
      };
    },
  }),
  defineTool({
    name: "get_workout_history",
    description: "Recorded workouts for an athlete over recent weeks, including performed sets (planned vs performed).",
    kind: "read",
    schema: z.object({ athlete_id: id("Athlete"), weeks: z.number().int().min(1).max(26).default(4) }),
    permission: () => "athletes.read",
    async run(ctx, input) {
      await getAthlete(ctx, input.athlete_id);
      const logs = await loadMetricLogs(ctx, { athleteIds: [input.athlete_id], from: addDays(todayKey(), -7 * input.weeks) });
      return {
        result: logs.map((l) => ({
          date: l.performed_on,
          status: l.status,
          programmed: Boolean(l.scheduled_session_id),
          perceived_effort: l.perceived_effort,
          recovery_rating: l.recovery_rating,
          exercises: l.exercises.map((e) => ({
            exercise_id: e.exercise_id,
            name: e.exercise_name,
            planned_sets: e.planned_sets,
            performed: e.sets.filter((s) => s.completed).map((s) => ({ reps: s.reps, weight: s.weight, unit: s.weight_unit, rpe: s.rpe, seconds: s.duration_seconds })),
          })),
        })),
      };
    },
  }),
  defineTool({
    name: "get_progress_summary",
    description:
      "Deterministic progress metrics for an athlete: attendance, program adherence, completion, consistency, personal records, exercise trends and goal progress.",
    kind: "read",
    schema: z.object({ athlete_id: id("Athlete"), range: z.enum(["4w", "12w", "26w", "all"]).default("12w") }),
    permission: () => "athletes.read",
    async run(ctx, input) {
      const p = await athleteProgress(ctx, input.athlete_id, input.range);
      return {
        result: {
          range: p.range,
          attendance: { ...p.attendance, rate: pct(p.attendance.rate) },
          adherence: { ...p.adherence, rate: pct(p.adherence.rate) },
          session_completion: { ...p.completion, rate: pct(p.completion.rate) },
          consistency: { streak_weeks: p.consistency.streak_weeks, average_per_week: p.consistency.average_per_week },
          personal_records: p.records.slice(0, 10).map((r) => ({ exercise: r.exercise_name, best_e1rm_lb: r.best_e1rm_lb, heaviest_lb: r.heaviest_lb, most_reps: r.most_reps })),
          trends: p.trends.map((t) => ({ exercise: t.name, points: t.points.slice(-8).map((pt) => ({ date: pt.date, e1rm_lb: pt.e1rm_lb, top_lb: pt.top_lb, reps: pt.reps })) })),
          goals: p.goals.map((g) => ({ title: g.title, metric: g.metric, target: g.target_value, current: g.computed_current, progress: pct(g.progress) })),
          attention: p.attention,
        },
      };
    },
  }),
  defineTool({
    name: "get_schedule",
    description:
      "Scheduled sessions across the workspace (or one athlete) in a date window, with status. 'missed' means a planned session dated before today that has no completed workout. Includes per-athlete missed counts.",
    kind: "read",
    schema: z.object({
      athlete_id: id("Athlete").optional(),
      days_back: z.number().int().min(0).max(90).default(14),
      days_ahead: z.number().int().min(0).max(60).default(7),
    }),
    permission: () => "athletes.read",
    async run(ctx, input) {
      const today = todayKey();
      const scheduled = await loadScheduled(ctx, {
        athleteIds: input.athlete_id ? [input.athlete_id] : undefined,
        from: addDays(today, -input.days_back),
        to: addDays(today, input.days_ahead),
      });
      const athletes = await listAthletes(ctx, { status: "all", limit: 200 });
      const names = new Map(athletes.map((a) => [a.id, athleteName(a)]));
      const missedBy = new Map<string, number>();
      for (const s of scheduled) if (isMissed(s, today)) missedBy.set(s.athlete_id, (missedBy.get(s.athlete_id) ?? 0) + 1);
      return {
        result: {
          today,
          sessions: scheduled.slice(0, 150).map((s) => ({
            athlete: names.get(s.athlete_id) ?? s.athlete_id,
            athlete_id: s.athlete_id,
            date: s.scheduled_date,
            status: isMissed(s, today) ? "missed" : s.status,
          })),
          missed_counts: [...missedBy.entries()].map(([aid, count]) => ({ athlete_id: aid, athlete: names.get(aid) ?? aid, missed: count })),
        },
      };
    },
  }),
  defineTool({
    name: "get_workspace_settings",
    description: "Current workspace branding and public profile settings.",
    kind: "read",
    schema: z.object({}),
    permission: () => "brand.read",
    async run(ctx) {
      const b = await getBrand(ctx);
      return {
        result: b && {
          workspace: ctx.org.name,
          slug: ctx.org.slug,
          display_name: b.display_name,
          coach_name: b.coach_name,
          accent_color: b.accent_color,
          signal_color: b.signal_color,
          welcome_headline: b.welcome_headline,
          welcome_body: b.welcome_body,
          portal_tagline: b.portal_tagline,
          location: b.location,
          public_profile_enabled: b.public_profile_enabled,
        },
      };
    },
  }),
  defineTool({
    name: "list_programs",
    description: "Programs and reusable session templates in this workspace.",
    kind: "read",
    schema: z.object({ include_archived: z.boolean().default(false) }),
    permission: () => "programs.read",
    async run(ctx, input) {
      const list = await listPrograms(ctx, { includeArchived: input.include_archived });
      return {
        result: list.map((p) => ({
          program_id: p.id,
          name: p.name,
          kind: p.kind,
          status: p.status,
          latest_published_version: p.latest_version,
          has_draft: p.has_draft,
          active_assignments: p.active_assignments,
          duration_weeks: p.duration_weeks,
          sessions_per_week: p.sessions_per_week,
        })),
      };
    },
  }),
  defineTool({
    name: "get_program",
    description: "Full structure of a program (current draft if one exists, otherwise the latest published version).",
    kind: "read",
    schema: z.object({ program_id: id("Program") }),
    permission: () => "programs.read",
    async run(ctx, input) {
      const detail = await getProgram(ctx, input.program_id);
      return { result: compactProgram(detail), card: programCard(detail) };
    },
  }),
  defineTool({
    name: "get_weekly_summary",
    description:
      "Deterministic numbers for this week's coaching summary: sessions completed vs scheduled, missed sessions, new personal records, volume, attendance and adherence, upcoming check-ins and athletes needing attention.",
    kind: "read",
    schema: z.object({}),
    permission: () => "athletes.read",
    async run(ctx) {
      const d = await getDashboard(ctx);
      return {
        result: {
          week_of: d.weekly.weekOf,
          ...d.weekly,
          attendance_rate: pct(d.weekly.attendanceRate),
          adherence_rate: pct(d.weekly.adherenceRate),
          active_athletes: d.counts.activeAthletes,
          new_records: d.highlights.map((h) => ({ athlete: h.athlete_name, exercise: h.exercise_name, kind: h.kind, value: h.value, on: h.on })),
          needs_attention: d.attention.map((a) => ({ athlete: a.athlete_name, reasons: a.reasons })),
          upcoming_check_ins: d.checkIns.map((c) => ({ athlete: c.athlete_name, date: c.date, overdue: c.overdue })),
          upcoming_sessions_next_7_days: d.counts.upcoming7d,
        },
      };
    },
  }),

  // ---- Draft & mutation tools -------------------------------------------------
  defineTool({
    name: "create_program_draft",
    description:
      "Create a DRAFT program (kind 'program', multi-week) or a reusable single-session template (kind 'session') with structured sessions and exercise prescriptions. Drafts are not visible to athletes until a coach publishes and assigns them. Use exercise ids from search_exercises.",
    kind: "draft",
    schema: z.object({
      name: z.string().min(2).max(120),
      kind: z.enum(["program", "session"]).default("program"),
      description: z.string().max(4000).optional().describe("Overview and coach notes for the program"),
      goal: z.string().max(200).optional(),
      level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
      duration_weeks: z.number().int().min(1).max(52).default(4),
      sessions_per_week: z.number().int().min(1).max(7).default(3),
      sessions: z.array(sessionShape).min(1).max(40),
    }),
    permission: () => "programs.write",
    async run(ctx, input) {
      const { templateId } = await createProgramFromDraft(ctx, input);
      const detail = await getProgram(ctx, templateId);
      return {
        result: { program_id: templateId, version: detail.version.version_number, status: "draft", url: `/w/${ctx.org.slug}/programs/${templateId}` },
        card: programCard(detail),
        memo: `Created draft program "${input.name}" (${templateId}).`,
      };
    },
  }),
  defineTool({
    name: "revise_program_draft",
    description:
      "Replace the sessions of a program's DRAFT version with a revised structure. If the program is published, a new draft version is opened first; published versions (and athletes' assigned copies) are never changed. Send the complete revised session list.",
    kind: "draft",
    schema: z.object({
      program_id: id("Program"),
      sessions: z.array(sessionShape).min(1).max(40),
      change_note: z.string().max(500).optional(),
    }),
    permission: () => "programs.write",
    async run(ctx, input) {
      const current = await getProgram(ctx, input.program_id);
      const versionId = current.editable ? current.version.id : await startRevision(ctx, input.program_id);
      await replaceDraftContent(ctx, versionId, input.sessions);
      if (input.change_note) await ctx.supabase.from("program_versions").update({ change_summary: input.change_note }).eq("id", versionId).eq("org_id", ctx.org.id);
      const detail = await getProgram(ctx, input.program_id, versionId);
      return {
        result: { program_id: input.program_id, draft_version: detail.version.version_number, status: "draft" },
        card: programCard(detail),
        memo: `Revised draft v${detail.version.version_number} of "${detail.template.name}".`,
      };
    },
  }),
  defineTool({
    name: "create_athlete_profile",
    description: "Create an athlete record in this workspace (no login is created; invite them separately).",
    kind: "draft",
    schema: z.object({
      first_name: z.string().min(1).max(60),
      last_name: z.string().max(60).default(""),
      experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
      training_goals: z.string().max(2000).optional(),
      training_preferences: z.string().max(2000).optional(),
      equipment: z.array(z.string().max(40)).max(30).default([]),
      limitations: z.string().max(2000).optional().describe("Only information the coach explicitly provided"),
      sessions_per_week: z.number().int().min(1).max(7).optional(),
    }),
    permission: () => "athletes.write",
    async run(ctx, input) {
      const a = await createAthlete(ctx, input);
      return {
        result: { athlete_id: a.id, name: athleteName(a) },
        card: { type: "link", href: `/w/${ctx.org.slug}/athletes/${a.id}`, label: `Open ${athleteName(a)}'s profile` },
        memo: `Created athlete ${athleteName(a)} (${a.id}).`,
      };
    },
  }),

  // ---- Consequential tools: queued for explicit confirmation ------------------
  defineTool({
    name: "prepare_invitation",
    description:
      "Prepare an invitation link. kind 'athlete' links an existing athlete record to a login; 'trainer' adds a co-trainer to this workspace; 'network_trainer' invites a trainer to establish their own workspace in the network (network owner only). The user must confirm before it is created.",
    kind: "confirm",
    schema: z.object({
      kind: z.enum(["athlete", "trainer", "network_trainer"]),
      email: z.string().email(),
      athlete_id: id("Athlete").optional(),
      workspace_name: z.string().max(80).optional().describe("Suggested workspace name for network trainers"),
      message: z.string().max(1000).optional(),
    }),
    permission: (_ctx, input) => (input.kind === "network_trainer" ? "network.manage" : input.kind === "trainer" ? "team.manage" : "athletes.invite"),
    async confirmation(ctx, input) {
      const who =
        input.kind === "athlete" && input.athlete_id ? athleteName(await getAthlete(ctx, input.athlete_id)) : input.email;
      const label = { athlete: "athlete portal access", trainer: `a trainer seat in ${ctx.org.name}`, network_trainer: "their own workspace in the RT Performance network" }[input.kind];
      return {
        title: `Create an invitation for ${who}`,
        details: [`Email: ${input.email}`, `Grants: ${label}`, "Link expires in 7 days and can be revoked."],
      };
    },
    async run(ctx, input) {
      const created = await createInvitation(ctx, {
        kind: input.kind === "network_trainer" ? "trainer_workspace" : input.kind === "trainer" ? "workspace_member" : "athlete",
        email: input.email,
        athlete_id: input.athlete_id ?? null,
        workspace_name: input.workspace_name ?? null,
        message: input.message ?? null,
      });
      return {
        result: { invitation_id: created.id, expires_at: created.expiresAt, delivered_by_email: false },
        card: { type: "invitation", url: created.url, email: created.email, expiresAt: created.expiresAt, kind: created.kind },
        memo: `Created ${input.kind} invitation for ${input.email}.`,
      };
    },
  }),
  defineTool({
    name: "publish_program",
    description: "Publish a program's current draft version so it can be assigned. Requires user confirmation.",
    kind: "confirm",
    schema: z.object({ program_id: id("Program"), change_summary: z.string().max(1000).optional() }),
    permission: () => "programs.publish",
    async confirmation(ctx, input) {
      const p = await getProgram(ctx, input.program_id);
      if (!p.editable) throw new ServiceError("This program has no draft to publish.");
      return {
        title: `Publish "${p.template.name}" v${p.version.version_number}`,
        details: [
          `${p.sessions.length} sessions · ${p.sessions.reduce((n, s) => n + s.exercises.length, 0)} exercise prescriptions`,
          "Published versions are locked; future edits create a new version.",
        ],
      };
    },
    async run(ctx, input) {
      const p = await getProgram(ctx, input.program_id);
      if (!p.editable) throw new ServiceError("This program has no draft to publish.");
      await publishVersion(ctx, p.version.id, input.change_summary ?? null);
      const after = await getProgram(ctx, input.program_id, p.version.id);
      return { result: { published_version: after.version.version_number }, card: programCard(after), memo: `Published "${after.template.name}" v${after.version.version_number}.` };
    },
  }),
  defineTool({
    name: "assign_program",
    description: "Assign a published program to an athlete starting on a date, on chosen weekdays (1=Mon … 7=Sun). Requires user confirmation.",
    kind: "confirm",
    schema: z.object({
      athlete_id: id("Athlete"),
      program_id: id("Program"),
      start_date: isoDate,
      training_days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    }),
    permission: () => "programs.assign",
    async confirmation(ctx, input) {
      const [a, p] = await Promise.all([getAthlete(ctx, input.athlete_id), getProgram(ctx, input.program_id)]);
      const published = p.versions.find((v) => v.status === "published");
      if (!published) throw new ServiceError("Publish this program before assigning it.");
      return {
        title: `Assign "${p.template.name}" to ${athleteName(a)}`,
        details: [`Version ${published.version_number}`, `Starts ${input.start_date}`, `Training days: ${dayNames(input.training_days)}`, "The athlete will see this program in their portal."],
      };
    },
    async run(ctx, input) {
      const assignmentId = await assignProgram(ctx, {
        athlete_id: input.athlete_id,
        template_id: input.program_id,
        start_date: input.start_date,
        training_days: input.training_days,
      });
      return { result: { assignment_id: assignmentId }, card: { type: "link", href: `/w/${ctx.org.slug}/athletes/${input.athlete_id}?tab=program`, label: "View the athlete's schedule" }, memo: `Assigned program ${input.program_id} to athlete ${input.athlete_id}.` };
    },
  }),
  defineTool({
    name: "update_branding",
    description:
      "Update workspace branding shown to athletes and on the public profile. Colors must be hex (RT Performance gold is #C8A45D). Requires user confirmation.",
    kind: "confirm",
    schema: z.object({
      display_name: z.string().min(2).max(80).optional(),
      coach_name: z.string().max(120).optional(),
      coach_bio: z.string().max(2000).optional(),
      accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      signal_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      welcome_headline: z.string().max(140).optional(),
      welcome_body: z.string().max(600).optional(),
      portal_tagline: z.string().max(140).optional(),
      location: z.string().max(120).optional(),
    }),
    permission: () => "brand.write",
    async confirmation(ctx, input) {
      const current = await getBrand(ctx);
      const details = Object.entries(input)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String((current as unknown as Record<string, unknown> | null)?.[k] ?? "—")} → ${String(v)}`);
      if (!details.length) throw new ServiceError("No branding changes were provided.");
      return { title: `Update ${ctx.org.name} branding`, details };
    },
    async run(ctx, input) {
      const b = await patchBrand(ctx, input);
      return {
        result: { updated: Object.keys(input), accent_color: b.accent_color },
        card: { type: "link", href: `/w/${ctx.org.slug}/settings`, label: "Review branding" },
        memo: `Updated branding (${Object.keys(input).join(", ")}).`,
      };
    },
  }),
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

const BY_NAME = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.name, t as unknown as ToolDefinition]));

export function getTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** Tools offered to the model: only those the current user could ever use. */
export function toolsFor(ctx: ServiceContext): Anthropic.Tool[] {
  if (!can(ctx, "assistant.use")) return [];
  return TOOLS.filter((t) => {
    // For tools whose permission depends on input, offer them if any variant is permitted.
    if (t.name === "prepare_invitation") return can(ctx, "athletes.invite") || can(ctx, "team.manage") || can(ctx, "network.manage");
    return can(ctx, (t as unknown as ToolDefinition).permission(ctx, {} as never));
  }).map((t) => toAnthropicTool(t as unknown as ToolDefinition));
}

export function toAnthropicTool(t: ToolDefinition): Anthropic.Tool {
  const schema = z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  schema.additionalProperties = false;
  const suffix = t.kind === "confirm" ? " (Queues a confirmation for the user; does not execute immediately.)" : "";
  return { name: t.name, description: t.description + suffix, input_schema: schema as Anthropic.Tool.InputSchema };
}

export type ValidationOutcome =
  | { ok: true; tool: ToolDefinition; input: unknown }
  | { ok: false; error: string };

/** Allowlist + schema + permission gate applied to every model-proposed tool call. */
export function validateToolCall(ctx: ServiceContext, name: string, rawInput: unknown): ValidationOutcome {
  if (!can(ctx, "assistant.use")) return { ok: false, error: "The assistant is only available to coaches." };
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Unknown tool "${name}".` };
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid input: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}` };
  }
  const permission = tool.permission(ctx, parsed.data as never);
  if (!can(ctx, permission)) return { ok: false, error: `Permission denied: your role (${ctx.role}) cannot perform "${name}".` };
  return { ok: true, tool, input: parsed.data };
}
