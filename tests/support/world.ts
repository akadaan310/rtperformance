/**
 * Test fixtures for the database integration suite. Every actor is a real Supabase Auth user acting through
 * their own session, so Row Level Security and the SQL functions are exercised exactly as in production.
 * The service-role client is used only to arrange state that has no user-facing path (e.g. expiring an invite).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { ServiceContext } from "@/lib/services/context";
import type { Role } from "@/lib/auth/permissions";

export const env = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("Integration tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (run `npm run stack:start`).");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1"].includes(host) && process.env.RT_ALLOW_REMOTE_TESTS !== "1") throw new Error(`Refusing to run integration tests against ${host}.`);
  return { url, anon, service };
};

const PASSWORD = "Integration-Test-2026";
export const run = randomUUID().slice(0, 8);

export function adminClient(): SupabaseClient {
  const { url, service } = env();
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient {
  const { url, anon } = env();
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Actor {
  id: string;
  email: string;
  name: string;
  client: SupabaseClient;
}

export async function createActor(label: string): Promise<Actor> {
  const admin = adminClient();
  const email = `${label}-${run}@test.rtperformance.dev`;
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} Test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, role: "authenticated", user_metadata: { full_name: name } });
  if (error) throw error;
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  return { id: data.user.id, email, name, client };
}

export function unwrap<T>(res: { data: T; error: { message: string } | null }, label = "query"): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data;
}

export const first = <T>(d: T | T[]): T => (Array.isArray(d) ? d[0]! : d);

export interface Org {
  id: string;
  slug: string;
  name: string;
  kind: "master" | "trainer";
}

export function ctxFor(actor: Actor, org: Org, role: Role, opts: { isMasterOwner?: boolean; athleteId?: string | null; source?: "app" | "ai" } = {}): ServiceContext {
  return {
    supabase: actor.client,
    user: { id: actor.id, email: actor.email, fullName: actor.name },
    org: { id: org.id, slug: org.slug, name: org.name, kind: org.kind, status: "active" },
    role,
    isMasterOwner: opts.isMasterOwner ?? false,
    workspaceIsMaster: org.kind === "master",
    athleteId: opts.athleteId ?? null,
    source: opts.source,
  };
}

export interface World {
  master: Org;
  owner: Actor; // a network owner of the master org
  trainer: Actor; // owner of an invited trainer workspace
  trainerOrg: Org;
  coTrainer: Actor; // trainer-role member of the trainer workspace
  masterAthlete: { actor: Actor; athleteId: string };
  trainerAthlete: { actor: Actor; athleteId: string };
  outsider: Actor; // signed up, no memberships
}

/** Ensures a master org exists and makes a fresh test user one of its owners. */
async function masterWithOwner(owner: Actor): Promise<Org> {
  const admin = adminClient();
  const existing = unwrap(await admin.from("organizations").select("id, slug, name, kind").eq("kind", "master").maybeSingle(), "master");
  if (!existing) {
    unwrap(await admin.rpc("provision_master_workspace", { p_email: owner.email, p_name: "RT Performance", p_slug: `rt-${run}` }), "provision");
    return unwrap(await admin.from("organizations").select("id, slug, name, kind").eq("kind", "master").single(), "master") as Org;
  }
  unwrap(await admin.from("memberships").insert({ org_id: existing.id, user_id: owner.id, role: "owner" }), "owner membership");
  return existing as Org;
}

export async function buildWorld(): Promise<World> {
  const [owner, trainer, coTrainer, a1, a2, outsider] = await Promise.all(
    ["owner", "trainer", "cotrainer", "athleteone", "athletetwo", "outsider"].map((l) => createActor(l)),
  );
  const master = await masterWithOwner(owner!);

  // Network owner invites a trainer, who accepts and establishes a workspace.
  const invite = first(unwrap(await owner!.client.rpc("create_invitation", { p_kind: "trainer_workspace", p_org: master.id, p_email: trainer!.email }), "trainer invite")) as { token: string };
  const trainerOrgId = unwrap(await trainer!.client.rpc("accept_invitation", { p_token: invite.token, p_workspace_name: `Trainer ${run}`, p_workspace_slug: `trainer-${run}` }), "accept trainer") as string;
  const trainerOrg: Org = { id: trainerOrgId, slug: `trainer-${run}`, name: `Trainer ${run}`, kind: "trainer" };

  // Trainer adds a co-trainer.
  const co = first(unwrap(await trainer!.client.rpc("create_invitation", { p_kind: "workspace_member", p_org: trainerOrgId, p_email: coTrainer!.email }), "co invite")) as { token: string };
  unwrap(await coTrainer!.client.rpc("accept_invitation", { p_token: co.token }), "accept co");

  // One linked athlete in each workspace.
  async function athleteIn(coach: Actor, orgId: string, actor: Actor, first_name: string) {
    const row = unwrap(await coach.client.from("athlete_profiles").insert({ org_id: orgId, first_name, last_name: "Test", email: actor.email }).select("id").single(), "athlete") as { id: string };
    const inv = (unwrap(await coach.client.rpc("create_invitation", { p_kind: "athlete", p_org: orgId, p_email: actor.email, p_athlete: row.id }), "athlete invite") as { token: string }[])[0]!;
    unwrap(await actor.client.rpc("accept_invitation", { p_token: inv.token }), "accept athlete");
    return row.id;
  }
  const masterAthleteId = await athleteIn(owner!, master.id, a1!, "Alex");
  const trainerAthleteId = await athleteIn(trainer!, trainerOrgId, a2!, "Blake");

  return {
    master,
    owner: owner!,
    trainer: trainer!,
    trainerOrg,
    coTrainer: coTrainer!,
    masterAthlete: { actor: a1!, athleteId: masterAthleteId },
    trainerAthlete: { actor: a2!, athleteId: trainerAthleteId },
    outsider: outsider!,
  };
}

export async function libraryExercise(client: SupabaseClient, name: string): Promise<string> {
  const row = unwrap(await client.from("exercises").select("id").is("org_id", null).eq("name", name).single(), `exercise ${name}`) as { id: string };
  return row.id;
}
