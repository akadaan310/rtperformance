"use server";
import { redirect } from "next/navigation";
import { formList, formString, runInWorkspace } from "@/lib/actions";
import { ServiceError } from "@/lib/result";
import { createAthlete, deleteAthlete, updateAthlete } from "@/lib/services/athletes";
import { createGoal, createNote, deleteNote, setGoalStatus, updateNote } from "@/lib/services/goals";
import { createInvitation, revokeInvitation } from "@/lib/services/invitations";
import { assignProgram, cancelAssignment } from "@/lib/services/programs";
import { setScheduledStatus } from "@/lib/services/progress";
import { setMembershipStatus } from "@/lib/services/team";
import { startAdhocWorkout, startScheduledWorkout } from "@/lib/services/workouts";
import type { ActionState } from "@/components/ui/confirm-form";

function athleteFields(fd: FormData) {
  return {
    first_name: formString(fd, "first_name") ?? "",
    last_name: formString(fd, "last_name") ?? "",
    email: formString(fd, "email") ?? "",
    phone: formString(fd, "phone"),
    date_of_birth: formString(fd, "date_of_birth") ?? "",
    experience_level: formString(fd, "experience_level") || null,
    training_goals: formString(fd, "training_goals"),
    training_preferences: formString(fd, "training_preferences"),
    equipment: formList(fd, "equipment"),
    limitations: formString(fd, "limitations"),
    sessions_per_week: formString(fd, "sessions_per_week") || null,
    next_check_in_date: formString(fd, "next_check_in_date") ?? "",
  };
}

export async function createAthleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let id = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    id = (await createAthlete(ctx, athleteFields(fd))).id;
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/athletes/${id}?created=1`);
}

export async function updateAthleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const athleteId = formString(fd, "athlete_id");
  const res = await runInWorkspace(slug, async (ctx) => {
    await updateAthlete(ctx, athleteId, athleteFields(fd));
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/athletes/${athleteId}?saved=1`);
}

export async function setAthleteStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const athleteId = formString(fd, "athlete_id");
  const status = formString(fd, "status") as "active" | "paused" | "archived";
  return runInWorkspace(slug, async (ctx) => {
    await updateAthlete(ctx, athleteId, { status });
    return status === "archived" ? "Athlete archived." : "Status updated.";
  }, { revalidate: [`/w/${slug}/athletes/${athleteId}`, `/w/${slug}/athletes`] });
}

export async function deleteAthleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const res = await runInWorkspace(slug, async (ctx) => {
    await deleteAthlete(ctx, formString(fd, "athlete_id"));
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/athletes?deleted=1`);
}

export async function inviteAthleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let url = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    const inv = await createInvitation(ctx, { kind: "athlete", email: formString(fd, "email"), athlete_id: formString(fd, "athlete_id"), message: formString(fd, "message") });
    url = inv.url;
    return "Invitation created. Copy the link and send it to your athlete.";
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
  return res?.ok ? { ...res, url } : res;
}

export async function revokeInvitationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await revokeInvitation(ctx, formString(fd, "invitation_id"));
    return "Invitation revoked.";
  }, { revalidate: [`/w/${slug}`, `/w/${slug}/athletes/${formString(fd, "athlete_id") ?? ""}`, `/w/${slug}/settings/team`, `/w/${slug}/network`] });
}

export async function revokeAthleteAccessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await setMembershipStatus(ctx, formString(fd, "membership_id"), (formString(fd, "status") as "active" | "revoked") ?? "revoked");
    return "Portal access updated.";
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function assignProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const athleteId = formString(fd, "athlete_id");
  const res = await runInWorkspace(slug, async (ctx) => {
    await assignProgram(ctx, {
      athlete_id: athleteId,
      template_id: formString(fd, "template_id"),
      start_date: formString(fd, "start_date"),
      training_days: formList(fd, "training_days").map(Number),
      notes: formString(fd, "notes"),
    });
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/athletes/${athleteId}?tab=program&assigned=1`);
}

export async function cancelAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await cancelAssignment(ctx, formString(fd, "assignment_id"));
    return "Assignment cancelled. Logged workouts are kept.";
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function setSessionStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await setScheduledStatus(ctx, formString(fd, "scheduled_id"), formString(fd, "status") === "skipped" ? "skipped" : "planned");
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function startWorkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const athleteId = formString(fd, "athlete_id");
  let logId = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    const scheduledId = formString(fd, "scheduled_id");
    if (scheduledId) logId = await startScheduledWorkout(ctx, scheduledId);
    else {
      const exerciseIds = formList(fd, "exercise_ids");
      if (!exerciseIds.length) throw new ServiceError("Choose at least one exercise.");
      logId = await startAdhocWorkout(ctx, { athlete_id: athleteId, title: formString(fd, "title") || "Workout", exercise_ids: exerciseIds });
    }
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/athletes/${athleteId}/workouts/${logId}`);
}

export async function createGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await createGoal(ctx, {
      athlete_id: formString(fd, "athlete_id"),
      title: formString(fd, "title"),
      goal_type: formString(fd, "goal_type") || "custom",
      metric: formString(fd, "metric") || "custom",
      exercise_id: formString(fd, "exercise_id") || null,
      unit: formString(fd, "unit"),
      baseline_value: formString(fd, "baseline_value") || null,
      target_value: formString(fd, "target_value") || null,
      target_date: formString(fd, "target_date") || "",
    });
    return "Goal added.";
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function setGoalStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await setGoalStatus(ctx, formString(fd, "goal_id"), formString(fd, "status") as "active" | "achieved" | "archived");
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function createNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await createNote(ctx, { athlete_id: formString(fd, "athlete_id"), body: formString(fd, "body"), visibility: formString(fd, "visibility") === "shared" ? "shared" : "private", pinned: fd.get("pinned") === "on" });
    return "Note saved.";
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function updateNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    const patch: { visibility?: "private" | "shared"; pinned?: boolean } = {};
    const v = formString(fd, "visibility");
    if (v === "private" || v === "shared") patch.visibility = v;
    const p = formString(fd, "pinned");
    if (p !== null) patch.pinned = p === "true";
    await updateNote(ctx, formString(fd, "note_id"), patch);
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}

export async function deleteNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await deleteNote(ctx, formString(fd, "note_id"));
    return "Note deleted.";
  }, { revalidate: [`/w/${slug}/athletes/${formString(fd, "athlete_id")}`] });
}
