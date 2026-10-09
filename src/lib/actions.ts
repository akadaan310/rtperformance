import "server-only";
import { revalidatePath } from "next/cache";
import { getWorkspaceContext } from "@/lib/auth/context";
import { failure, ServiceError } from "@/lib/result";
import type { ServiceContext } from "@/lib/services/context";
import type { ActionState } from "@/components/ui/confirm-form";

/**
 * Resolves the workspace from the authenticated session (the slug only selects which of the user's own
 * memberships to use) and runs a service operation, converting errors into a user-safe ActionState.
 */
export async function runInWorkspace(
  slug: unknown,
  fn: (ctx: ServiceContext) => Promise<string | void>,
  opts: { revalidate?: string[] } = {},
): Promise<ActionState> {
  try {
    if (typeof slug !== "string" || !slug) throw new ServiceError("Workspace not found.");
    const ctx = await getWorkspaceContext(slug);
    if (!ctx) throw new ServiceError("Workspace not found.");
    if (ctx.org.status !== "active") throw new ServiceError("This workspace is suspended.");
    const message = await fn(ctx);
    for (const p of opts.revalidate ?? []) revalidatePath(p);
    return { ok: true, message: message ?? undefined };
  } catch (err) {
    return failure(err);
  }
}

export function formString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" ? v : null;
}

export function formList(fd: FormData, key: string): string[] {
  return fd
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}
