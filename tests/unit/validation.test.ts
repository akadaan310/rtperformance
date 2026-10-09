import { describe, expect, it } from "vitest";
import { acceptInvitationInput, brandInput, goalInput, invitationInput, prescriptionInput, programDraftInput } from "@/lib/validation";
import { parseInput, ServiceError, dbError, failure } from "@/lib/result";
import { invitationStatus } from "@/lib/types";
import { safeNext } from "@/lib/safe-redirect";
import { sniffImage } from "@/lib/services/branding";

const uuid = "4b0d3c0e-5a6f-4b8a-9c1d-2e3f4a5b6c7d";

describe("input validation", () => {
  it("normalises invitation emails and rejects unknown kinds", () => {
    expect(invitationInput.parse({ kind: "athlete", email: "  Maya@Example.COM " }).email).toBe("maya@example.com");
    expect(invitationInput.safeParse({ kind: "admin", email: "a@b.co" }).success).toBe(false);
  });

  it("requires a workspace address shape when accepting trainer invitations", () => {
    expect(acceptInvitationInput.safeParse({ token: "x".repeat(40), workspace_slug: "Bad Slug!" }).success).toBe(false);
    expect(acceptInvitationInput.parse({ token: "x".repeat(40), workspace_slug: "reyes-strength" }).workspace_slug).toBe("reyes-strength");
  });

  it("validates brand colors as hex", () => {
    const base = { display_name: "Studio", accent_color: "#C8A45D", signal_color: "#C2412D" };
    expect(brandInput.safeParse(base).success).toBe(true);
    expect(brandInput.safeParse({ ...base, accent_color: "gold" }).success).toBe(false);
  });

  it("validates prescriptions (tempo, sets, block labels)", () => {
    expect(prescriptionInput.parse({ exercise_id: uuid, sets: "4", reps: "5", tempo: "3010", block_label: "a1" })).toMatchObject({ sets: 4, tempo: "3010", block_label: "A1" });
    expect(prescriptionInput.safeParse({ exercise_id: uuid, sets: 0, reps: "5" }).success).toBe(false);
    expect(prescriptionInput.safeParse({ exercise_id: uuid, sets: 3, reps: "5", tempo: "fast" }).success).toBe(false);
  });

  it("accepts a full structured program draft", () => {
    const draft = programDraftInput.parse({ name: "Base", sessions: [{ name: "Day 1", day_number: 1, exercises: [{ exercise_id: uuid, sets: 3, reps: "8" }] }] });
    expect(draft.sessions[0]!.exercises[0]!.load_type).toBe("none");
  });

  it("requires an exercise for strength goals", () => {
    expect(goalInput.safeParse({ athlete_id: uuid, title: "Squat more", metric: "estimated_1rm" }).success).toBe(false);
    expect(goalInput.safeParse({ athlete_id: uuid, title: "Squat more", metric: "estimated_1rm", exercise_id: uuid }).success).toBe(true);
  });

  it("parseInput reports field errors", () => {
    try {
      parseInput(brandInput, { display_name: "", accent_color: "x", signal_color: "#000000" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect(Object.keys((e as ServiceError).fieldErrors ?? {})).toEqual(expect.arrayContaining(["display_name", "accent_color"]));
    }
  });
});

describe("error handling", () => {
  it("passes through deliberate SQL messages but hides internals", () => {
    expect(dbError({ code: "22023", message: "This invitation has expired" }).message).toBe("This invitation has expired");
    expect(dbError({ code: "23514", message: 'new row for relation "x" violates check constraint "y"' }).message).toBe("Some of the values are not valid.");
    expect(dbError({ code: "42501", message: "permission denied for table athlete_profiles" }).message).toBe("You do not have permission to do that.");
    expect(failure(new Error("secret internals")).error).toBe("Something went wrong. Please try again.");
  });
});

describe("invitation status", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("derives status from timestamps", () => {
    expect(invitationStatus({ accepted_at: null, revoked_at: null, expires_at: "2026-10-10T00:00:00Z" }, now)).toBe("pending");
    expect(invitationStatus({ accepted_at: null, revoked_at: null, expires_at: "2026-10-01T00:00:00Z" }, now)).toBe("expired");
    expect(invitationStatus({ accepted_at: "2026-10-02T00:00:00Z", revoked_at: null, expires_at: "2026-10-01T00:00:00Z" }, now)).toBe("accepted");
    expect(invitationStatus({ accepted_at: null, revoked_at: "2026-10-02T00:00:00Z", expires_at: "2026-10-10T00:00:00Z" }, now)).toBe("revoked");
  });
});

describe("safe redirects", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/w/rt-performance")).toBe("/w/rt-performance");
    expect(safeNext("https://evil.example")).toBe("/home");
    expect(safeNext("//evil.example")).toBe("/home");
    expect(safeNext("/\\evil.example")).toBe("/home");
    expect(safeNext("/login?next=/x")).toBe("/home");
    expect(safeNext(undefined)).toBe("/home");
  });
});

describe("upload sniffing", () => {
  it("identifies images by their bytes, not their names", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))?.mime).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
