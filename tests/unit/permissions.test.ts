import { describe, expect, it } from "vitest";
import { assertCan, AuthorizationError, can, type Principal } from "@/lib/auth/permissions";

const p = (role: Principal["role"], extra: Partial<Principal> = {}): Principal => ({ role, isMasterOwner: false, workspaceIsMaster: false, ...extra });

describe("permission matrix", () => {
  it("lets owners and trainers coach, but only owners manage brand, team and audit", () => {
    for (const role of ["owner", "trainer"] as const) {
      expect(can(p(role), "athletes.write")).toBe(true);
      expect(can(p(role), "programs.publish")).toBe(true);
      expect(can(p(role), "assistant.use")).toBe(true);
    }
    expect(can(p("owner"), "brand.write")).toBe(true);
    expect(can(p("trainer"), "brand.write")).toBe(false);
    expect(can(p("trainer"), "team.manage")).toBe(false);
    expect(can(p("trainer"), "audit.read")).toBe(false);
    expect(can(p("trainer"), "athletes.delete")).toBe(false);
  });

  it("limits athletes to logging their own workouts", () => {
    expect(can(p("athlete"), "workouts.log_self")).toBe(true);
    for (const perm of ["athletes.read", "notes.read", "programs.write", "assistant.use", "brand.write", "workouts.log_any"] as const) {
      expect(can(p("athlete"), perm)).toBe(false);
    }
  });

  it("grants network management only to the master owner inside the master workspace", () => {
    expect(can(p("owner", { isMasterOwner: true, workspaceIsMaster: true }), "network.manage")).toBe(true);
    // Raymond acting inside someone else's workspace does not carry network powers there.
    expect(can(p("owner", { isMasterOwner: true, workspaceIsMaster: false }), "network.manage")).toBe(false);
    // An owner of a trainer workspace is not a network owner.
    expect(can(p("owner", { isMasterOwner: false, workspaceIsMaster: false }), "network.manage")).toBe(false);
    expect(can(p("trainer", { isMasterOwner: true, workspaceIsMaster: true }), "network.manage")).toBe(false);
  });

  it("assertCan throws AuthorizationError", () => {
    expect(() => assertCan(p("athlete"), "athletes.read")).toThrow(AuthorizationError);
    expect(() => assertCan(p("owner"), "athletes.read")).not.toThrow();
  });
});
