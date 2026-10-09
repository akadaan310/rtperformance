"use server";
import { redirect } from "next/navigation";
import { formList, formString, runInWorkspace } from "@/lib/actions";
import { updateOwnPreferences } from "@/lib/services/athletes";
import { reportGoalValue } from "@/lib/services/goals";
import { startAdhocWorkout, startScheduledWorkout } from "@/lib/services/workouts";
import type { ActionState } from "@/components/ui/confirm-form";

export async function startMyWorkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let logId = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    logId = await startScheduledWorkout(ctx, formString(fd, "scheduled_id"));
  });
  if (!res?.ok) return res;
  redirect(`/t/${slug}/athlete/workout/${logId}`);
}

export async function startMyAdhocWorkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let logId = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    logId = await startAdhocWorkout(ctx, { athlete_id: ctx.athleteId, title: formString(fd, "title") || "Workout", exercise_ids: formList(fd, "exercise_ids") });
  });
  if (!res?.ok) return res;
  redirect(`/t/${slug}/athlete/workout/${logId}`);
}

export async function updatePreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await updateOwnPreferences(ctx, {
      phone: formString(fd, "phone"),
      training_preferences: formString(fd, "training_preferences"),
      training_goals: formString(fd, "training_goals"),
      equipment: formList(fd, "equipment"),
      limitations: formString(fd, "limitations"),
    });
    return "Saved. Your coach will see the update.";
  }, { revalidate: [`/t/${slug}/athlete/profile`] });
}

export async function reportGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await reportGoalValue(ctx, formString(fd, "goal_id"), formString(fd, "value"));
    return "Progress recorded.";
  }, { revalidate: [`/t/${slug}/athlete/progress`] });
}
