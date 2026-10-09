import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, buildWorld, createActor, ctxFor, first, unwrap, type World } from "../support/world";
import { getAthlete, listAthletes } from "@/lib/services/athletes";
import { listNetworkWorkspaces } from "@/lib/services/network";
import { createInvitation, acceptInvitation } from "@/lib/services/invitations";

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

describe("workspace isolation (Scenario B guarantees)", () => {
  it("the trainer workspace is a separate organization in Raymond's network", async () => {
    const org = unwrap(await w.trainer.client.from("organizations").select("id, kind, parent_org_id").eq("id", w.trainerOrg.id).single());
    expect(org).toMatchObject({ kind: "trainer", parent_org_id: w.master.id });
  });

  it("a trainer cannot read Raymond's athletes, notes, logs or programs — even by ID", async () => {
    unwrap(await w.owner.client.from("coach_notes").insert({ org_id: w.master.id, athlete_id: w.masterAthlete.athleteId, author_id: w.owner.id, body: "private master note" }));
    for (const table of ["athlete_profiles", "coach_notes", "workout_logs", "program_templates", "goals", "assignments"]) {
      const { data } = await w.trainer.client.from(table).select("id").eq("org_id", w.master.id);
      expect(data, table).toEqual([]);
    }
    const { data: byId } = await w.trainer.client.from("athlete_profiles").select("*").eq("id", w.masterAthlete.athleteId);
    expect(byId).toEqual([]);
  });

  it("the network owner cannot read a trainer's client records just because the trainer joined the network", async () => {
    unwrap(await w.trainer.client.from("coach_notes").insert({ org_id: w.trainerOrg.id, athlete_id: w.trainerAthlete.athleteId, author_id: w.trainer.id, body: "trainer private note" }));
    for (const table of ["athlete_profiles", "coach_notes", "brand_settings", "ai_conversations", "memberships"]) {
      const { data } = await w.owner.client.from(table).select("*").eq("org_id", w.trainerOrg.id);
      expect(data, table).toEqual([]);
    }
  });

  it("network reporting is aggregate-only and owner-only", async () => {
    const rows = await listNetworkWorkspaces(ctxFor(w.owner, w.master, "owner", { isMasterOwner: true }));
    const mine = rows.find((r) => r.org_id === w.trainerOrg.id)!;
    expect(mine).toBeDefined();
    expect(mine.athlete_count).toBe(1);
    expect(Object.keys(mine).sort()).toEqual(
      ["active_assignment_count", "athlete_count", "created_at", "last_activity_at", "name", "org_id", "owner_email", "owner_name", "program_count", "sessions_completed_30d", "slug", "status"].sort(),
    );
    const { error } = await w.trainer.client.rpc("network_workspaces");
    expect(error?.message).toMatch(/network owner/);
  });

  it("writes into another workspace are rejected even with a forged org_id", async () => {
    const { error } = await w.trainer.client.from("athlete_profiles").insert({ org_id: w.master.id, first_name: "Intruder" });
    expect(error).not.toBeNull();
    const { data } = await w.trainer.client.from("athlete_profiles").update({ first_name: "Hacked" }).eq("id", w.masterAthlete.athleteId).select("id");
    expect(data).toEqual([]);
    const { data: deleted } = await w.trainer.client.from("athlete_profiles").delete().eq("id", w.masterAthlete.athleteId).select("id");
    expect(deleted).toEqual([]);
  });

  it("composite keys stop cross-tenant references", async () => {
    // A trainer cannot attach a goal in their own org to Raymond's athlete.
    const { error } = await w.trainer.client.from("goals").insert({ org_id: w.trainerOrg.id, athlete_id: w.masterAthlete.athleteId, title: "Sneaky goal" });
    expect(error).not.toBeNull();
  });

  it("services refuse cross-workspace IDs with a not-found (no existence oracle)", async () => {
    const tctx = ctxFor(w.trainer, w.trainerOrg, "owner");
    await expect(getAthlete(tctx, w.masterAthlete.athleteId)).rejects.toThrow("Athlete not found.");
    expect((await listAthletes(tctx, { status: "all" })).map((a) => a.id)).toEqual([w.trainerAthlete.athleteId]);
  });

  it("athletes see only their own profile and only notes shared with them", async () => {
    const a = w.masterAthlete;
    unwrap(await w.owner.client.from("coach_notes").insert({ org_id: w.master.id, athlete_id: a.athleteId, author_id: w.owner.id, body: "shared note", visibility: "shared" }));
    const profiles = unwrap(await a.actor.client.from("athlete_profiles").select("id"));
    expect(profiles).toEqual([{ id: a.athleteId }]);
    const notes = unwrap(await a.actor.client.from("coach_notes").select("body")) as { body: string }[];
    expect(notes.map((n) => n.body)).toEqual(["shared note"]);
    // Another athlete in a different workspace sees nothing of the first.
    const { data } = await w.trainerAthlete.actor.client.from("athlete_profiles").select("id").eq("id", a.athleteId);
    expect(data).toEqual([]);
  });

  it("athletes may edit their preferences but not coach-controlled fields", async () => {
    const c = w.masterAthlete.actor.client;
    unwrap(await c.from("athlete_profiles").update({ training_preferences: "Mornings" }).eq("id", w.masterAthlete.athleteId));
    const { error } = await c.from("athlete_profiles").update({ status: "archived" }).eq("id", w.masterAthlete.athleteId);
    expect(error?.message).toMatch(/only update their own preferences/);
  });

  it("anonymous visitors can read nothing directly", async () => {
    const anon = anonClient();
    for (const table of ["organizations", "athlete_profiles", "exercises", "brand_settings", "invitations"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
  });
});

describe("authentication & role assignment", () => {
  it("public sign-up grants no workspace and no admin rights", async () => {
    const memberships = unwrap(await w.outsider.client.from("memberships").select("*"));
    expect(memberships).toEqual([]);
    const { error } = await w.outsider.client.rpc("provision_master_workspace", { p_email: w.outsider.email, p_name: "Mine", p_slug: "mine" });
    expect(error).not.toBeNull();
  });

  it("clients cannot write memberships or self-assign roles", async () => {
    const { error } = await w.outsider.client.from("memberships").insert({ org_id: w.master.id, user_id: w.outsider.id, role: "owner" });
    expect(error).not.toBeNull();
    const { data } = await w.coTrainer.client.from("memberships").update({ role: "owner" }).eq("user_id", w.coTrainer.id).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("only owners can invite trainers; only the network owner can invite network trainers", async () => {
    const co = ctxFor(w.coTrainer, w.trainerOrg, "trainer");
    await expect(createInvitation(co, { kind: "workspace_member", email: "x@test.dev" })).rejects.toThrow();
    const { error } = await w.trainer.client.rpc("create_invitation", { p_kind: "trainer_workspace", p_org: w.master.id, p_email: "y@test.dev" });
    expect(error?.message).toMatch(/network owner/);
    // Even calling the RPC directly with its own org id, a trainer-workspace owner can't mint network invites.
    const { error: e2 } = await w.trainer.client.rpc("create_invitation", { p_kind: "trainer_workspace", p_org: w.trainerOrg.id, p_email: "z@test.dev" });
    expect(e2?.message).toMatch(/network owner/);
  });

  it("an athlete cannot issue invitations", async () => {
    const { error } = await w.masterAthlete.actor.client.rpc("create_invitation", { p_kind: "athlete", p_org: w.master.id, p_email: "q@test.dev", p_athlete: w.masterAthlete.athleteId });
    expect(error).not.toBeNull();
  });
});

describe("invitations", () => {
  it("are single-use, email-bound, expiring and revocable", async () => {
    const owner = ctxFor(w.owner, w.master, "owner", { isMasterOwner: true });
    const athlete = unwrap(await w.owner.client.from("athlete_profiles").insert({ org_id: w.master.id, first_name: "Invitee" }).select("id").single()) as { id: string };
    const invitee = await createActor("invitee");
    const wrong = await createActor("wrongperson");

    const inv = await createInvitation(owner, { kind: "athlete", email: invitee.email, athlete_id: athlete.id });
    const token = decodeURIComponent(inv.url.split("/invite/")[1]!);
    expect(token.length).toBeGreaterThanOrEqual(40);

    // The token is stored only as a hash.
    const stored = unwrap(await adminClient().from("invitations").select("token_hash").eq("id", inv.id).single()) as { token_hash: string };
    expect(stored.token_hash).not.toContain(token);
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/);

    // Preview works for token holders, including anonymous visitors.
    const preview = first(unwrap(await anonClient().rpc("get_invitation_preview", { p_token: token })) as { status: string; kind: string }[]);
    expect(preview).toMatchObject({ status: "pending", kind: "athlete" });

    await expect(acceptInvitation(wrong.client, { token })).rejects.toThrow(/different email/);
    const accepted = await acceptInvitation(invitee.client, { token });
    expect(accepted.role).toBe("athlete");
    const linked = unwrap(await adminClient().from("athlete_profiles").select("user_id").eq("id", athlete.id).single()) as { user_id: string };
    expect(linked.user_id).toBe(invitee.id);
    await expect(acceptInvitation(invitee.client, { token })).rejects.toThrow(/already been used/);

    // Expired
    const inv2 = await createInvitation(owner, { kind: "workspace_member", email: wrong.email });
    unwrap(await adminClient().from("invitations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", inv2.id));
    await expect(acceptInvitation(wrong.client, { token: decodeURIComponent(inv2.url.split("/invite/")[1]!) })).rejects.toThrow(/expired/);

    // Revoked
    const inv3 = await createInvitation(owner, { kind: "workspace_member", email: wrong.email });
    unwrap(await w.owner.client.rpc("revoke_invitation", { p_invitation: inv3.id }));
    await expect(acceptInvitation(wrong.client, { token: decodeURIComponent(inv3.url.split("/invite/")[1]!) })).rejects.toThrow(/revoked/);

    // Garbage tokens
    await expect(acceptInvitation(wrong.client, { token: "x".repeat(43) })).rejects.toThrow(/not valid/);
  });

  it("records audit events without storing the token", async () => {
    const events = unwrap(await w.owner.client.from("audit_events").select("action, metadata").eq("org_id", w.master.id).like("action", "invitation.%")) as { action: string; metadata: object }[];
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/token/i);
  });
});

describe("suspension", () => {
  it("suspending a trainer workspace blocks its members until reactivated", async () => {
    const owner = ctxFor(w.owner, w.master, "owner", { isMasterOwner: true });
    unwrap(await w.owner.client.rpc("set_workspace_status", { p_org: w.trainerOrg.id, p_status: "suspended", p_reason: "test" }));
    expect(unwrap(await w.trainer.client.from("athlete_profiles").select("id"))).toEqual([]);
    expect(unwrap(await w.trainerAthlete.actor.client.from("athlete_profiles").select("id"))).toEqual([]);
    unwrap(await w.owner.client.rpc("set_workspace_status", { p_org: w.trainerOrg.id, p_status: "active" }));
    expect((unwrap(await w.trainer.client.from("athlete_profiles").select("id")) as unknown[]).length).toBe(1);
    // Trainers can't suspend anyone, and the master can't be suspended.
    const { error } = await w.trainer.client.rpc("set_workspace_status", { p_org: w.trainerOrg.id, p_status: "suspended" });
    expect(error).not.toBeNull();
    const { error: e2 } = await w.owner.client.rpc("set_workspace_status", { p_org: w.master.id, p_status: "suspended" });
    expect(e2).not.toBeNull();
    void owner;
  });
});
