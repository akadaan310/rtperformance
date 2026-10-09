/** Row shapes for the tables in supabase/migrations. Keep in sync with the SQL. */
import type { Role } from "@/lib/auth/permissions";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  kind: "master" | "trainer";
  parent_org_id: string | null;
  status: "active" | "suspended";
  suspended_reason: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  status: "active" | "revoked";
  created_at: string;
}

export interface BrandSettings {
  org_id: string;
  display_name: string;
  coach_name: string | null;
  coach_bio: string | null;
  logo_path: string | null;
  photo_path: string | null;
  accent_color: string;
  signal_color: string;
  welcome_headline: string | null;
  welcome_body: string | null;
  portal_tagline: string | null;
  location: string | null;
  public_profile_enabled: boolean;
  updated_at: string;
}

export interface AthleteProfile {
  id: string;
  org_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  status: "active" | "paused" | "archived";
  experience_level: "beginner" | "intermediate" | "advanced" | null;
  training_goals: string | null;
  training_preferences: string | null;
  equipment: string[];
  limitations: string | null;
  sessions_per_week: number | null;
  next_check_in_date: string | null;
  created_at: string;
  updated_at: string;
}

export type ExerciseCategory =
  | "squat"
  | "hinge"
  | "push"
  | "pull"
  | "lunge"
  | "carry"
  | "core"
  | "conditioning"
  | "mobility"
  | "power"
  | "accessory";

export type Measurement = "reps_weight" | "reps" | "time" | "distance";

export interface Exercise {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  muscle_groups: string[];
  equipment: string[];
  category: ExerciseCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  measurement: Measurement;
  cues: string[];
  instructions: string | null;
  default_sets: number | null;
  default_reps: string | null;
  default_rest_seconds: number | null;
  default_tempo: string | null;
  default_rpe: number | null;
  is_archived: boolean;
}

export interface ProgramTemplate {
  id: string;
  org_id: string;
  kind: "program" | "session";
  name: string;
  description: string | null;
  goal: string | null;
  level: "beginner" | "intermediate" | "advanced" | null;
  duration_weeks: number;
  sessions_per_week: number;
  status: "draft" | "published" | "archived";
  source_template_id: string | null;
  created_via: "app" | "ai";
  created_at: string;
  updated_at: string;
}

export interface ProgramVersion {
  id: string;
  org_id: string;
  template_id: string;
  version_number: number;
  status: "draft" | "published";
  change_summary: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ProgramSession {
  id: string;
  org_id: string;
  version_id: string;
  week_number: number;
  day_number: number;
  position: number;
  name: string;
  focus: string | null;
  notes: string | null;
  estimated_minutes: number | null;
}

export type LoadType = "none" | "bodyweight" | "weight" | "percent_1rm" | "rpe";

export interface ProgramExercise {
  id: string;
  org_id: string;
  session_id: string;
  exercise_id: string;
  position: number;
  block_label: string | null;
  sets: number;
  reps: string;
  load_type: LoadType;
  load_value: number | null;
  load_unit: "lb" | "kg" | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe_target: number | null;
  progression: string | null;
  notes: string | null;
  substitution_ids: string[];
}

export interface Assignment {
  id: string;
  org_id: string;
  athlete_id: string;
  template_id: string;
  version_id: string;
  start_date: string;
  training_days: number[];
  status: "active" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
}

export interface ScheduledSession {
  id: string;
  org_id: string;
  assignment_id: string;
  athlete_id: string;
  program_session_id: string;
  scheduled_date: string;
  week_number: number;
  day_number: number;
  status: "planned" | "completed" | "skipped";
}

export interface WorkoutLog {
  id: string;
  org_id: string;
  athlete_id: string;
  scheduled_session_id: string | null;
  assignment_id: string | null;
  program_session_id: string | null;
  title: string;
  performed_on: string;
  status: "in_progress" | "completed";
  started_at: string;
  completed_at: string | null;
  perceived_effort: number | null;
  recovery_rating: number | null;
  notes: string | null;
  logged_by: string | null;
}

export interface PlannedPrescription {
  sets?: number;
  reps?: string;
  load_type?: LoadType;
  load_value?: number;
  load_unit?: "lb" | "kg";
  rest_seconds?: number;
  tempo?: string;
  rpe_target?: number;
  progression?: string;
  notes?: string;
  block_label?: string;
}

export interface WorkoutLogExercise {
  id: string;
  org_id: string;
  log_id: string;
  exercise_id: string;
  program_exercise_id: string | null;
  position: number;
  planned: PlannedPrescription;
  completed: boolean;
  notes: string | null;
}

export interface WorkoutLogSet {
  id: string;
  org_id: string;
  log_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  weight_unit: "lb" | "kg";
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  completed: boolean;
}

export interface Goal {
  id: string;
  org_id: string;
  athlete_id: string;
  title: string;
  goal_type: "strength" | "consistency" | "bodyweight" | "skill" | "custom";
  exercise_id: string | null;
  metric: "estimated_1rm" | "max_weight" | "max_reps" | "sessions_per_week" | "custom";
  unit: string | null;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  target_date: string | null;
  status: "active" | "achieved" | "archived";
  achieved_at: string | null;
  created_at: string;
}

export interface CoachNote {
  id: string;
  org_id: string;
  athlete_id: string;
  author_id: string | null;
  body: string;
  visibility: "private" | "shared";
  pinned: boolean;
  created_at: string;
}

export interface Invitation {
  id: string;
  kind: "trainer_workspace" | "workspace_member" | "athlete";
  org_id: string;
  role: Role;
  email: string;
  athlete_id: string | null;
  workspace_name: string | null;
  message: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_workspace_id: string | null;
  created_at: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export function invitationStatus(inv: Pick<Invitation, "accepted_at" | "revoked_at" | "expires_at">, now = new Date()): InvitationStatus {
  if (inv.accepted_at) return "accepted";
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at).getTime() < now.getTime()) return "expired";
  return "pending";
}

export interface AuditEvent {
  id: number;
  org_id: string | null;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  source: "app" | "ai" | "system";
  metadata: Record<string, unknown>;
  created_at: string;
}
