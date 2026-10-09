import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isCoachRole, type Principal, type Role } from "@/lib/auth/permissions";
import type { BrandSettings, Organization } from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

export interface WorkspaceContext extends Principal {
  supabase: SupabaseClient;
  user: SessionUser;
  org: Organization;
  brand: BrandSettings | null;
  membershipId: string;
  /** The athlete profile linked to this login (athletes only). */
  athleteId: string | null;
}

export interface MembershipSummary {
  orgId: string;
  slug: string;
  name: string;
  kind: Organization["kind"];
  status: Organization["status"];
  role: Role;
}

/** Validated user for this request (calls the auth server; safe for authorization). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? "", fullName: (profile?.full_name as string | null) ?? null };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export const listMyMemberships = cache(async (): Promise<MembershipSummary[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role, organizations!inner(id, slug, name, kind, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at");
  return (data ?? []).map((row) => {
    const o = row.organizations as unknown as Pick<Organization, "id" | "slug" | "name" | "kind" | "status">;
    return { orgId: o.id, slug: o.slug, name: o.name, kind: o.kind, status: o.status, role: row.role as Role };
  });
});

/** Where a member should land in a workspace. */
export function homePathFor(m: Pick<MembershipSummary, "slug" | "role">): string {
  return isCoachRole(m.role) ? `/w/${m.slug}` : `/t/${m.slug}/athlete`;
}

/**
 * Resolves the signed-in user's access to a workspace. Returns null when the workspace does not exist or
 * the user has no active membership — callers must treat both identically (no existence oracle).
 */
export const getWorkspaceContext = cache(async (slug: string): Promise<WorkspaceContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug, name, kind, parent_org_id, status, suspended_reason, created_at")
    .eq("slug", slug.toLowerCase())
    .maybeSingle<Organization>();
  if (!org) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ id: string; role: Role }>();
  if (!membership) return null;

  const memberships = await listMyMemberships();
  const isMasterOwner = memberships.some((m) => m.kind === "master" && m.role === "owner" && m.status === "active");

  const { data: brand } = await supabase.from("brand_settings").select("*").eq("org_id", org.id).maybeSingle<BrandSettings>();

  let athleteId: string | null = null;
  if (membership.role === "athlete") {
    const { data: athlete } = await supabase
      .from("athlete_profiles")
      .select("id")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string }>();
    athleteId = athlete?.id ?? null;
  }

  return {
    supabase,
    user,
    org,
    brand: brand ?? null,
    membershipId: membership.id,
    role: membership.role,
    isMasterOwner,
    workspaceIsMaster: org.kind === "master",
    athleteId,
  };
});

/** For coach-area pages: requires an owner/trainer membership in an active workspace. */
export async function requireCoachWorkspace(slug: string): Promise<WorkspaceContext> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/w/${slug}`)}`);
  const ctx = await getWorkspaceContext(slug);
  if (!ctx) notFound();
  if (!isCoachRole(ctx.role)) redirect(`/t/${ctx.org.slug}/athlete`);
  if (ctx.org.status !== "active") redirect(`/home?suspended=${encodeURIComponent(ctx.org.slug)}`);
  return ctx;
}

/** For athlete-portal pages: requires an athlete membership linked to an athlete profile. */
export async function requireAthleteWorkspace(slug: string): Promise<WorkspaceContext & { athleteId: string }> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/t/${slug}/athlete`)}`);
  const ctx = await getWorkspaceContext(slug);
  if (!ctx) notFound();
  if (isCoachRole(ctx.role)) redirect(`/w/${ctx.org.slug}`);
  if (ctx.org.status !== "active") redirect(`/home?suspended=${encodeURIComponent(ctx.org.slug)}`);
  if (!ctx.athleteId) redirect("/home?unlinked=1");
  return ctx as WorkspaceContext & { athleteId: string };
}
