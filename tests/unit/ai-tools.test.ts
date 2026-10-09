import { describe, expect, it } from "vitest";
import { buildHistory } from "@/lib/ai/runner";
import { TOOLS, toAnthropicTool, toolsFor, validateToolCall, type ToolDefinition } from "@/lib/ai/tools";
import type { ServiceContext } from "@/lib/services/context";

function ctx(role: ServiceContext["role"], extra: Partial<ServiceContext> = {}): ServiceContext {
  return {
    role,
    isMasterOwner: false,
    workspaceIsMaster: false,
    supabase: {} as ServiceContext["supabase"],
    user: { id: "u", email: "u@example.com", fullName: "U" },
    org: { id: "o", slug: "s", name: "Studio", kind: "trainer", status: "active" },
    athleteId: null,
    ...extra,
  };
}

const uuid = "4b0d3c0e-5a6f-4b8a-9c1d-2e3f4a5b6c7d";

describe("tool registry", () => {
  it("exposes JSON schemas that forbid unknown properties", () => {
    for (const t of TOOLS) {
      const schema = toAnthropicTool(t as unknown as ToolDefinition).input_schema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.$schema).toBeUndefined();
    }
  });

  it("never lets the model choose the workspace, user or role", () => {
    for (const t of TOOLS) {
      const props = Object.keys(((toAnthropicTool(t as unknown as ToolDefinition).input_schema as { properties?: object }).properties ?? {}));
      expect(props).not.toContain("org_id");
      expect(props).not.toContain("user_id");
      expect(props).not.toContain("role");
    }
  });

  it("marks consequential tools as requiring confirmation", () => {
    const confirm = TOOLS.filter((t) => t.kind === "confirm").map((t) => t.name).sort();
    expect(confirm).toEqual(["assign_program", "prepare_invitation", "publish_program", "update_branding"]);
    expect(TOOLS.filter((t) => t.kind === "read").every((t) => !/create|update|publish|assign|invite/.test(t.name))).toBe(true);
  });
});

describe("tool-call gating", () => {
  it("rejects tools that are not allowlisted", () => {
    expect(validateToolCall(ctx("owner"), "execute_sql", { sql: "drop table x" })).toMatchObject({ ok: false });
  });

  it("rejects invalid input before anything runs", () => {
    const r = validateToolCall(ctx("owner"), "get_athlete_profile", { athlete_id: "not-a-uuid" });
    expect(r.ok).toBe(false);
  });

  it("enforces role permissions regardless of what the model asks for", () => {
    expect(validateToolCall(ctx("trainer"), "update_branding", { accent_color: "#C8A45D" })).toMatchObject({ ok: false, error: expect.stringContaining("Permission denied") });
    expect(validateToolCall(ctx("owner"), "update_branding", { accent_color: "#C8A45D" }).ok).toBe(true);
    expect(validateToolCall(ctx("athlete"), "list_athletes", {}).ok).toBe(false);
    // Only the network owner inside the master workspace may invite trainers to the network.
    expect(validateToolCall(ctx("owner"), "prepare_invitation", { kind: "network_trainer", email: "t@example.com" }).ok).toBe(false);
    expect(validateToolCall(ctx("owner", { isMasterOwner: true, workspaceIsMaster: true }), "prepare_invitation", { kind: "network_trainer", email: "t@example.com" }).ok).toBe(true);
    expect(validateToolCall(ctx("trainer"), "prepare_invitation", { kind: "athlete", email: "a@example.com", athlete_id: uuid }).ok).toBe(true);
    expect(validateToolCall(ctx("trainer"), "prepare_invitation", { kind: "trainer", email: "a@example.com" }).ok).toBe(false);
  });

  it("offers only the tools a role may use", () => {
    const trainerTools = toolsFor(ctx("trainer")).map((t) => t.name);
    expect(trainerTools).toContain("create_program_draft");
    expect(trainerTools).not.toContain("update_branding");
    expect(toolsFor(ctx("athlete"))).toHaveLength(0);
  });
});

describe("conversation replay", () => {
  it("drops prior-turn thinking blocks and starts at a plain user message", () => {
    const rows = [
      { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: "x", content: "{}" }] },
      { role: "user" as const, content: "Hi" },
      { role: "assistant" as const, content: [{ type: "thinking" as const, thinking: "…", signature: "sig" }, { type: "text" as const, text: "Hello" }] },
    ];
    const history = buildHistory(rows as never);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "Hi" });
    expect(history[1]!.content).toEqual([{ type: "text", text: "Hello" }]);
  });
});
