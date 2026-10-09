import type { ServiceContext } from "./context";

/** Best-effort audit entry for app-level mutations not already audited inside SQL functions. */
export async function audit(
  ctx: ServiceContext,
  action: string,
  target?: { type: string; id: string },
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await ctx.supabase.rpc("log_audit_event", {
    p_org: ctx.org.id,
    p_action: action,
    p_target_type: target?.type ?? null,
    p_target_id: target?.id ?? null,
    p_source: ctx.source ?? "app",
    p_metadata: metadata,
  });
  if (error && process.env.NODE_ENV !== "test") console.warn("[rt] audit write failed", error.code);
}
