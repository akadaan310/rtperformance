"use server";
import { formString, runInWorkspace } from "@/lib/actions";
import { setWorkspaceStatus } from "@/lib/services/network";
import type { ActionState } from "@/components/ui/confirm-form";

export async function workspaceStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const status = formString(fd, "status") === "suspended" ? "suspended" : "active";
  return runInWorkspace(slug, async (ctx) => {
    await setWorkspaceStatus(ctx, formString(fd, "org_id"), status, formString(fd, "reason"));
    return status === "suspended" ? "Workspace suspended." : "Workspace reactivated.";
  }, { revalidate: [`/w/${slug}/network`] });
}
