import { assertCan } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/permissions";
import { dbError, parseInput } from "@/lib/result";
import { uuid } from "@/lib/validation";
import type { ServiceContext } from "./context";

export interface TeamMember {
  id: string;
  user_id: string;
  role: Role;
  status: "active" | "revoked";
  created_at: string;
  full_name: string | null;
  email: string | null;
}

export async function listMembers(ctx: ServiceContext, roles: Role[] = ["owner", "trainer"]): Promise<TeamMember[]> {
  assertCan(ctx, "team.read");
  const { data, error } = await ctx.supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at")
    .eq("org_id", ctx.org.id)
    .in("role", roles)
    .order("created_at");
  if (error) throw dbError(error);
  const ids = (data ?? []).map((m) => m.user_id as string);
  const { data: profiles } = ids.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const map = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return (data ?? []).map((m) => ({
    ...(m as Omit<TeamMember, "full_name" | "email">),
    full_name: (map.get(m.user_id as string)?.full_name as string | null) ?? null,
    email: (map.get(m.user_id as string)?.email as string | null) ?? null,
  }));
}

export async function setMembershipStatus(ctx: ServiceContext, membershipId: unknown, status: "active" | "revoked"): Promise<void> {
  assertCan(ctx, "team.manage", "Only workspace owners can change access.");
  const id = parseInput(uuid, membershipId);
  const { error } = await ctx.supabase.rpc("set_membership_status", { p_membership: id, p_status: status });
  if (error) throw dbError(error);
}
