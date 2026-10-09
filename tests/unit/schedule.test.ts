import { describe, expect, it } from "vitest";
import { buildSchedule, isoWeekday } from "@/lib/schedule";

const sessions = [1, 2, 3].flatMap((day) => [1, 2].map((week) => ({ id: `w${week}d${day}`, week_number: week, day_number: day, position: day })));

describe("assignment schedule", () => {
  it("knows ISO weekdays", () => {
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
  });

  it("maps the k-th session of each week to the k-th training day from the start date", () => {
    const out = buildSchedule(sessions, "2026-10-05", [1, 3, 5]);
    expect(out.map((s) => `${s.session_id}@${s.date}`)).toEqual([
      "w1d1@2026-10-05",
      "w1d2@2026-10-07",
      "w1d3@2026-10-09",
      "w2d1@2026-10-12",
      "w2d2@2026-10-14",
      "w2d3@2026-10-16",
    ]);
  });

  it("starting mid-week orders training days forward from the start date", () => {
    const out = buildSchedule(sessions.filter((s) => s.week_number === 1), "2026-10-07", [1, 3, 5]);
    expect(out.map((s) => s.date)).toEqual(["2026-10-07", "2026-10-09", "2026-10-12"]);
  });

  it("rolls extra sessions into the following week when there are fewer training days", () => {
    const out = buildSchedule(sessions.filter((s) => s.week_number === 1), "2026-10-05", [1]);
    expect(out.map((s) => s.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });
});
