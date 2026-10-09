"use server";
import { redirect } from "next/navigation";
import { formList, formString, runInWorkspace } from "@/lib/actions";
import {
  addProgramExercise,
  addSession,
  assignProgram,
  createProgram,
  deleteProgram,
  duplicateProgram,
  moveProgramExercise,
  moveSession,
  publishVersion,
  removeProgramExercise,
  removeSession,
  setProgramArchived,
  startRevision,
  updateProgramExercise,
  updateProgramMeta,
  updateSession,
} from "@/lib/services/programs";
import type { ActionState } from "@/components/ui/confirm-form";

function metaFields(fd: FormData) {
  return {
    name: formString(fd, "name"),
    kind: formString(fd, "kind") || "program",
    description: formString(fd, "description"),
    goal: formString(fd, "goal"),
    level: formString(fd, "level") || null,
    duration_weeks: formString(fd, "duration_weeks") || 4,
    sessions_per_week: formString(fd, "sessions_per_week") || 3,
  };
}

export async function createProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let id = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    id = (await createProgram(ctx, metaFields(fd))).templateId;
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/programs/${id}`);
}

export async function updateMetaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const id = formString(fd, "program_id");
  return runInWorkspace(slug, async (ctx) => {
    await updateProgramMeta(ctx, id, metaFields(fd));
    return "Program details saved.";
  }, { revalidate: [`/w/${slug}/programs/${id}`] });
}

/** Builder operations called directly from the client builder (typed arguments, validated in services). */
export async function builderAction(slug: string, programId: string, op: BuilderOp): Promise<ActionState> {
  return runInWorkspace(slug, async (ctx) => {
    switch (op.type) {
      case "addSession":
        await addSession(ctx, op.versionId, op.input);
        break;
      case "updateSession":
        await updateSession(ctx, op.sessionId, op.input);
        break;
      case "removeSession":
        await removeSession(ctx, op.sessionId);
        break;
      case "moveSession":
        await moveSession(ctx, op.sessionId, op.direction);
        break;
      case "addExercise":
        await addProgramExercise(ctx, op.sessionId, op.input);
        break;
      case "updateExercise":
        await updateProgramExercise(ctx, op.programExerciseId, op.input);
        break;
      case "removeExercise":
        await removeProgramExercise(ctx, op.programExerciseId);
        break;
      case "moveExercise":
        await moveProgramExercise(ctx, op.programExerciseId, op.direction);
        break;
    }
  }, { revalidate: [`/w/${slug}/programs/${programId}`] });
}

export type BuilderOp =
  | { type: "addSession"; versionId: string; input: unknown }
  | { type: "updateSession"; sessionId: string; input: unknown }
  | { type: "removeSession"; sessionId: string }
  | { type: "moveSession"; sessionId: string; direction: "up" | "down" }
  | { type: "addExercise"; sessionId: string; input: unknown }
  | { type: "updateExercise"; programExerciseId: string; input: unknown }
  | { type: "removeExercise"; programExerciseId: string }
  | { type: "moveExercise"; programExerciseId: string; direction: "up" | "down" };

export async function publishAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const id = formString(fd, "program_id");
  return runInWorkspace(slug, async (ctx) => {
    await publishVersion(ctx, formString(fd, "version_id"), formString(fd, "change_summary"));
    return "Published. This version is now locked and ready to assign.";
  }, { revalidate: [`/w/${slug}/programs/${id}`, `/w/${slug}/programs`] });
}

export async function startRevisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const id = formString(fd, "program_id");
  return runInWorkspace(slug, async (ctx) => {
    await startRevision(ctx, id);
    return "New draft version opened.";
  }, { revalidate: [`/w/${slug}/programs/${id}`] });
}

export async function duplicateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let newId = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    newId = await duplicateProgram(ctx, formString(fd, "program_id"), formString(fd, "name"));
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/programs/${newId}?duplicated=1`);
}

export async function archiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const id = formString(fd, "program_id");
  return runInWorkspace(slug, async (ctx) => {
    await setProgramArchived(ctx, id, formString(fd, "archived") === "true");
    return "Saved.";
  }, { revalidate: [`/w/${slug}/programs/${id}`, `/w/${slug}/programs`] });
}

export async function deleteProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const res = await runInWorkspace(slug, async (ctx) => {
    await deleteProgram(ctx, formString(fd, "program_id"));
  });
  if (!res?.ok) return res;
  redirect(`/w/${slug}/programs?deleted=1`);
}

export async function assignFromProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
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
