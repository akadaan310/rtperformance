"use server";
import { redirect } from "next/navigation";
import { formList, formString, runInWorkspace } from "@/lib/actions";
import { createExercise, setSubstitutions, updateExercise } from "@/lib/services/exercises";
import type { ActionState } from "@/components/ui/confirm-form";

function fields(fd: FormData) {
  return {
    name: formString(fd, "name"),
    description: formString(fd, "description"),
    category: formString(fd, "category"),
    difficulty: formString(fd, "difficulty") || "beginner",
    measurement: formString(fd, "measurement") || "reps_weight",
    muscle_groups: formList(fd, "muscle_groups"),
    equipment: formList(fd, "equipment"),
    cues: (formString(fd, "cues") ?? "").split("\n").map((c) => c.trim()).filter(Boolean),
    instructions: formString(fd, "instructions"),
    default_sets: formString(fd, "default_sets") || null,
    default_reps: formString(fd, "default_reps"),
    default_rest_seconds: formString(fd, "default_rest_seconds") || null,
    default_tempo: formString(fd, "default_tempo") ?? "",
    default_rpe: formString(fd, "default_rpe") || null,
  };
}

export async function saveExerciseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const existing = formString(fd, "exercise_id");
  let id = existing ?? "";
  const res = await runInWorkspace(slug, async (ctx) => {
    if (existing) await updateExercise(ctx, existing, fields(fd));
    else id = (await createExercise(ctx, fields(fd))).id;
    await setSubstitutions(ctx, id, formList(fd, "substitution_ids"));
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/exercises/${id}?saved=1`);
}
