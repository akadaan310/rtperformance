import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());
  it("allows up to the limit within the window, then blocks until it slides", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 1000 + i).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, 1500).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, 2100).ok).toBe(true);
  });
  it("keys are independent", () => {
    rateLimit("a", 1, 1000, 0);
    expect(rateLimit("a", 1, 1000, 1).ok).toBe(false);
    expect(rateLimit("b", 1, 1000, 1).ok).toBe(true);
  });
});
