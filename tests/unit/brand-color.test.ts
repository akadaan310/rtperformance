import { describe, expect, it } from "vitest";
import { accentForeground, contrastRatio, legibleAccent } from "@/lib/brand/color";

describe("brand color safety", () => {
  it("chooses a readable foreground for the accent", () => {
    expect(accentForeground("#C8A45D")).toBe("#111113");
    expect(accentForeground("#1E3A8A")).toBe("#f7f2e8");
  });

  it("lifts very dark accents to ≥3:1 against the page background", () => {
    const lifted = legibleAccent("#101010");
    expect(contrastRatio(lifted, "#0a0a0b")).toBeGreaterThanOrEqual(3);
    expect(legibleAccent("#C8A45D")).toBe("#c8a45d");
  });
});
