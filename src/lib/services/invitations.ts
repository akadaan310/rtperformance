import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCan, can } from "@/lib/auth/permissions";
import { publicEnv } from "@/lib/env";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import { invitationStatus, type Invitation } from "@/lib/types";
import { acceptInvitationInput, invitationInput, uuid } from "@/lib/validation";
import type { ServiceContext } from "./context";

export interface CreatedInvitation {
  id: string;
  url: string;
  expiresAt: string;
  email: string;
  kind: Invitation["kind"];
}

export function invitationUrl(token: string): string {
  return `${publicEnv.siteUrl}/invite/${encodeURIComponent(token)}`;
}

/**
 * Issues an invitation. The secure token is generated in the database, stored only as a SHA-256 hash and
 * returned exactly once here so the coach can share the link.
 */
export async function createInvitation(ctx: ServiceContext, input: unknown): Promise<CreatedInvitation> {
  const values = parseInput(invitationInput, input);
  if (values.kind === "trainer_workspace") assertCan(ctx, "network.manage", "Only the network owner can invite trainers to the network.");
  else if (values.kind === "workspace_member") assertCan(ctx, "team.manage", "Only workspace owners can add trainers.");
  else {
    assertCan(ctx, "athletes.invite");
    if (!values.athlete_id) throw new ServiceError("Choose the athlete this invitation is for.", { athlete_id: "Required" });
  }
  const { data, error } = await ctx.supabase.rpc("create_invitation", {
    p_kind: values.kind,
    p_org: ctx.org.id,
    p_email: values.email,
    p_athlete: values.kind === "athlete" ? values.athlete_id : null,
    p_workspace_name: values.workspace_name,
    p_message: values.message,
    p_ttl_days: values.ttl_days,
    p_source: ctx.source ?? "app",
  });
  if (error) throw dbError(error, "Could not create the invitation.");
  const row = (Array.isArray(data) ? data[0] : data) as { invitation_id: string; token: string; expires_at: string };
  return { id: row.invitation_id, url: invitationUrl(row.token), expiresAt: row.expires_at, email: values.email, kind: values.kind };
}

export async function revokeInvitation(ctx: ServiceContext, invitationId: unknown): Promise<void> {
  const id = parseInput(uuid, invitationId);
  if (!can(ctx, "team.manage") && !can(ctx, "athletes.invite")) throw new ServiceError("You do not have permission to do that.");
  const { error } = await ctx.supabase.rpc("revoke_invitation", { p_invitation: id });
  if (error) throw dbError(error);
}

export async function listInvitations(ctx: ServiceContext, kinds: Invitation["kind"][]) {
  const { data, error } = await ctx.supabase
    .from("invitations")
    .select("id, kind, org_id, role, email, athlete_id, workspace_name, message, expires_at, accepted_at, revoked_at, created_workspace_id, created_at")
    .eq("org_id", ctx.org.id)
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw dbError(error);
  return ((data ?? []) as Invitation[]).map((i) => ({ ...i, status: invitationStatus(i) }));
}

export interface InvitationPreview {
  kind: Invitation["kind"];
  role: string;
  email: string;
  workspace_name: string;
  organization_name: string;
  inviter_name: string;
  message: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
}

export async function previewInvitation(supabase: SupabaseClient, token: string): Promise<InvitationPreview | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  if (error) throw dbError(error);
  const row = (Array.isArray(data) ? data[0] : data) as InvitationPreview | undefined;
  return row ?? null;
}

/** Accepts an invitation as the signed-in user. All validation happens server-side in SQL. */
export async function acceptInvitation(supabase: SupabaseClient, input: unknown): Promise<{ orgId: string; slug: string; role: string }> {
  const values = parseInput(acceptInvitationInput, input);
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: values.token,
    p_workspace_name: values.workspace_name ?? null,
    p_workspace_slug: values.workspace_slug ?? null,
  });
  if (error) throw dbError(error, "Could not accept the invitation.");
  const orgId = data as string;
  const { data: org } = await supabase.from("organizations").select("slug").eq("id", orgId).single();
  const { data: auth } = await supabase.auth.getUser();
  const { data: m } = await supabase.from("memberships").select("role").eq("org_id", orgId).eq("user_id", auth.user?.id ?? "").maybeSingle();
  return { orgId, slug: org?.slug as string, role: (m?.role as string) ?? "athlete" };
}
