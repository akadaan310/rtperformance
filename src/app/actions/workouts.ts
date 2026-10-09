"use server";
import { runInWorkspace } from "@/lib/actions";
import { addExerciseToWorkout, completeWorkout, deleteSet, discardWorkout, reopenWorkout, saveSet, setExerciseCompleted } from "@/lib/services/workouts";
import type { ActionState } from "@/components/ui/confirm-form";

/** Workout-logging actions shared by the coach (on an athlete's behalf) and athlete experiences. */
export async function saveSetAction(slug: string, input: unknown): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await saveSet(ctx, input);
  });
}

export async function deleteSetAction(slug: string, input: unknown): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await deleteSet(ctx, input);
  });
}

export async function setExerciseCompletedAction(slug: string, logExerciseId: string, completed: boolean): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await setExerciseCompleted(ctx, logExerciseId, completed);
  });
}

export async function addExerciseAction(slug: string, logId: string, exerciseId: string, path: string): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await addExerciseToWorkout(ctx, logId, exerciseId);
  }, { revalidate: [path] });
}

export async function completeWorkoutAction(slug: string, input: unknown, path: string): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await completeWorkout(ctx, input);
    return "Workout saved.";
  }, { revalidate: [path] });
}

export async function reopenWorkoutAction(slug: string, logId: string, path: string): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await reopenWorkout(ctx, logId);
  }, { revalidate: [path] });
}

export async function discardWorkoutAction(slug: string, logId: string): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    await discardWorkout(ctx, logId);
  });
}
