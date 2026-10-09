import { assertCan } from "@/lib/auth/permissions";
import { dbError, parseInput } from "@/lib/result";
import type { AuditEvent } from "@/lib/types";
import { uuid } from "@/lib/validation";
import type { ServiceContext } from "./context";
import { z } from "zod";

export interface NetworkWorkspace {
  org_id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  athlete_count: number;
  program_count: number;
  active_assignment_count: number;
  sessions_completed_30d: number;
  last_activity_at: string | null;
}

/** Aggregate-only view of trainer workspaces in the network (no athlete records or notes). */
export async function listNetworkWorkspaces(ctx: ServiceContext): Promise<NetworkWorkspace[]> {
  assertCan(ctx, "network.manage", "Only the network owner can view the trainer network.");
  const { data, error } = await ctx.supabase.rpc("network_workspaces");
  if (error) throw dbError(error);
  return ((data ?? []) as NetworkWorkspace[]).map((w) => ({
    ...w,
    athlete_count: Number(w.athlete_count),
    program_count: Number(w.program_count),
    active_assignment_count: Number(w.active_assignment_count),
    sessions_completed_30d: Number(w.sessions_completed_30d),
  }));
}

export async function setWorkspaceStatus(ctx: ServiceContext, orgId: unknown, status: "active" | "suspended", reason?: string | null): Promise<void> {
  assertCan(ctx, "network.manage", "Only the network owner can change workspace status.");
  const id = parseInput(uuid, orgId);
  const r = parseInput(z.string().trim().max(500).optional().nullable(), reason);
  const { error } = await ctx.supabase.rpc("set_workspace_status", { p_org: id, p_status: status, p_reason: r ?? null });
  if (error) throw dbError(error);
}

export async function listAuditEvents(ctx: ServiceContext, limit = 50): Promise<(AuditEvent & { actor_name: string | null })[]> {
  assertCan(ctx, "audit.read");
  const { data, error } = await ctx.supabase
    .from("audit_events")
    .select("id, org_id, actor_id, action, target_type, target_id, source, metadata, created_at")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw dbError(error);
  const actorIds = [...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean) as string[])];
  const { data: actors } = actorIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const names = new Map((actors ?? []).map((a) => [a.id as string, (a.full_name as string | null) ?? (a.email as string)]));
  return ((data ?? []) as AuditEvent[]).map((e) => ({ ...e, actor_name: e.actor_id ? (names.get(e.actor_id) ?? null) : null }));
}
