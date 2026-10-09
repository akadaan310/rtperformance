/**
 * Input schemas shared by server actions, route handlers and The Tech Guy's tools.
 * One definition per operation keeps UI and AI paths on identical validation.
 */
import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const uuid = z.string().uuid("Invalid identifier");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex color like #C8A45D");
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, "3–48 characters: lowercase letters, numbers and dashes");
export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const experienceLevel = z.enum(["beginner", "intermediate", "advanced"]);

// ---------------------------------------------------------------------------
// Athletes
// ---------------------------------------------------------------------------
export const athleteInput = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(60),
  last_name: trimmed(60).default(""),
  email: email.optional().nullable().or(z.literal("").transform(() => null)),
  phone: optionalText(40),
  date_of_birth: isoDate.optional().nullable().or(z.literal("").transform(() => null)),
  experience_level: experienceLevel.optional().nullable(),
  training_goals: optionalText(2000),
  training_preferences: optionalText(2000),
  equipment: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  limitations: optionalText(2000),
  sessions_per_week: z.coerce.number().int().min(1).max(7).optional().nullable(),
  next_check_in_date: isoDate.optional().nullable().or(z.literal("").transform(() => null)),
});
export type AthleteInput = z.infer<typeof athleteInput>;

export const athleteUpdateInput = athleteInput.partial().extend({
  status: z.enum(["active", "paused", "archived"]).optional(),
});

/** Fields an athlete may change about themselves. */
export const athleteSelfInput = z.object({
  phone: optionalText(40),
  training_preferences: optionalText(2000),
  equipment: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  limitations: optionalText(2000),
  training_goals: optionalText(2000),
});

export const athleteListInput = z.object({
  search: trimmed(80).optional(),
  status: z.enum(["active", "paused", "archived", "all"]).default("active"),
  limit: z.number().int().min(1).max(200).default(100),
});

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------
export const exerciseCategory = z.enum([
  "squat",
  "hinge",
  "push",
  "pull",
  "lunge",
  "carry",
  "core",
  "conditioning",
  "mobility",
  "power",
  "accessory",
]);

export const tempo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9X]{4}$/, "Tempo is four digits, e.g. 3010");

export const exerciseInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  description: optionalText(2000),
  category: exerciseCategory,
  difficulty: experienceLevel.default("beginner"),
  measurement: z.enum(["reps_weight", "reps", "time", "distance"]).default("reps_weight"),
  muscle_groups: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  equipment: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  cues: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  instructions: optionalText(4000),
  default_sets: z.coerce.number().int().min(1).max(20).optional().nullable(),
  default_reps: optionalText(20),
  default_rest_seconds: z.coerce.number().int().min(0).max(900).optional().nullable(),
  default_tempo: tempo.optional().nullable().or(z.literal("").transform(() => null)),
  default_rpe: z.coerce.number().min(1).max(10).optional().nullable(),
});

export const exerciseSearchInput = z.object({
  query: trimmed(80).optional(),
  category: exerciseCategory.optional(),
  equipment: trimmed(40).optional(),
  limit: z.number().int().min(1).max(100).default(40),
});

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------
export const programMetaInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  kind: z.enum(["program", "session"]).default("program"),
  description: optionalText(4000),
  goal: optionalText(200),
  level: experienceLevel.optional().nullable(),
  duration_weeks: z.coerce.number().int().min(1).max(52).default(4),
  sessions_per_week: z.coerce.number().int().min(1).max(7).default(3),
});

export const loadType = z.enum(["none", "bodyweight", "weight", "percent_1rm", "rpe"]);

export const prescriptionInput = z.object({
  exercise_id: uuid,
  sets: z.coerce.number().int().min(1).max(20),
  reps: z.string().trim().min(1, "Reps are required").max(20),
  load_type: loadType.default("none"),
  load_value: z.coerce.number().min(0).max(2000).optional().nullable(),
  load_unit: z.enum(["lb", "kg"]).optional().nullable(),
  rest_seconds: z.coerce.number().int().min(0).max(900).optional().nullable(),
  tempo: tempo.optional().nullable().or(z.literal("").transform(() => null)),
  rpe_target: z.coerce.number().min(1).max(10).optional().nullable(),
  block_label: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][0-9]{0,2}$/, "Use a label like A1")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  progression: optionalText(500),
  notes: optionalText(1000),
  substitution_ids: z.array(uuid).max(5).default([]),
});
export type PrescriptionInput = z.infer<typeof prescriptionInput>;

export const sessionInput = z.object({
  name: z.string().trim().min(1, "Session name is required").max(120),
  week_number: z.coerce.number().int().min(1).max(52).default(1),
  day_number: z.coerce.number().int().min(1).max(7).default(1),
  focus: optionalText(200),
  notes: optionalText(2000),
  estimated_minutes: z.coerce.number().int().min(5).max(300).optional().nullable(),
});

/** A complete structured draft, used by the builder's "create from structure" path and the AI. */
export const programDraftInput = programMetaInput.extend({
  sessions: z
    .array(
      sessionInput.extend({
        exercises: z.array(prescriptionInput).max(20).default([]),
      }),
    )
    .max(60)
    .default([]),
});
export type ProgramDraftInput = z.infer<typeof programDraftInput>;

export const assignInput = z.object({
  athlete_id: uuid,
  template_id: uuid,
  start_date: isoDate,
  training_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one training day").max(7),
  notes: optionalText(2000),
});

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------
export const setInput = z.object({
  log_exercise_id: uuid,
  set_number: z.coerce.number().int().min(1).max(50),
  reps: z.coerce.number().int().min(0).max(1000).optional().nullable(),
  weight: z.coerce.number().min(0).max(5000).optional().nullable(),
  weight_unit: z.enum(["lb", "kg"]).default("lb"),
  duration_seconds: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  distance_m: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  rpe: z.coerce.number().min(1).max(10).optional().nullable(),
});

export const completeWorkoutInput = z.object({
  log_id: uuid,
  perceived_effort: z.coerce.number().int().min(1).max(10).optional().nullable(),
  recovery_rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  notes: optionalText(2000),
  performed_on: isoDate.optional(),
});

export const adhocWorkoutInput = z.object({
  athlete_id: uuid,
  title: z.string().trim().min(1).max(120).default("Workout"),
  performed_on: isoDate.optional(),
  exercise_ids: z.array(uuid).min(1, "Add at least one exercise").max(20),
});

// ---------------------------------------------------------------------------
// Goals & notes
// ---------------------------------------------------------------------------
export const goalInput = z
  .object({
    athlete_id: uuid,
    title: z.string().trim().min(2, "Title is required").max(140),
    goal_type: z.enum(["strength", "consistency", "bodyweight", "skill", "custom"]).default("custom"),
    metric: z.enum(["estimated_1rm", "max_weight", "max_reps", "sessions_per_week", "custom"]).default("custom"),
    exercise_id: uuid.optional().nullable().or(z.literal("").transform(() => null)),
    unit: optionalText(20),
    baseline_value: z.coerce.number().optional().nullable(),
    target_value: z.coerce.number().optional().nullable(),
    current_value: z.coerce.number().optional().nullable(),
    target_date: isoDate.optional().nullable().or(z.literal("").transform(() => null)),
  })
  .refine((g) => !["estimated_1rm", "max_weight", "max_reps"].includes(g.metric) || Boolean(g.exercise_id), {
    message: "Choose the exercise this goal measures",
    path: ["exercise_id"],
  });

export const noteInput = z.object({
  athlete_id: uuid,
  body: z.string().trim().min(1, "Write a note").max(4000),
  visibility: z.enum(["private", "shared"]).default("private"),
  pinned: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Invitations, branding, workspace
// ---------------------------------------------------------------------------
export const invitationInput = z.object({
  kind: z.enum(["trainer_workspace", "workspace_member", "athlete"]),
  email,
  athlete_id: uuid.optional().nullable(),
  workspace_name: optionalText(80),
  message: optionalText(1000),
  ttl_days: z.coerce.number().int().min(1).max(30).default(7),
});

export const acceptInvitationInput = z.object({
  token: z.string().min(20).max(200),
  workspace_name: optionalText(80),
  workspace_slug: slug.optional().nullable(),
});

export const brandInput = z.object({
  display_name: z.string().trim().min(2, "Workspace name is required").max(80),
  coach_name: optionalText(120),
  coach_bio: optionalText(2000),
  accent_color: hexColor,
  signal_color: hexColor,
  welcome_headline: optionalText(140),
  welcome_body: optionalText(600),
  portal_tagline: optionalText(140),
  location: optionalText(120),
  public_profile_enabled: z.boolean().default(false),
});
export type BrandInput = z.infer<typeof brandInput>;

/** The subset of branding The Tech Guy may change (after confirmation). */
export const brandPatchInput = brandInput.partial().omit({ public_profile_enabled: true });
