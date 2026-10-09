import { describe, expect, it } from "vitest";
import {
  addDays,
  adherence,
  attendance,
  attentionReasons,
  consistency,
  estimateOneRepMax,
  exerciseTrend,
  goalCurrentValue,
  goalProgress,
  logVolume,
  personalRecords,
  recentRecords,
  sessionCompletion,
  weekStart,
  type MetricLog,
  type MetricScheduled,
} from "@/lib/metrics";

const set = (reps: number | null, weight: number | null, extra: Partial<MetricLog["exercises"][number]["sets"][number]> = {}) => ({
  reps,
  weight,
  weight_unit: "lb" as const,
  duration_seconds: null,
  distance_m: null,
  rpe: null,
  completed: true,
  ...extra,
});

function log(date: string, exercises: MetricLog["exercises"], extra: Partial<MetricLog> = {}): MetricLog {
  return { id: date, athlete_id: "a1", performed_on: date, status: "completed", perceived_effort: 7, recovery_rating: 4, scheduled_session_id: "s", exercises, ...extra };
}

const squat = (sets: ReturnType<typeof set>[], planned = 3) => ({ exercise_id: "squat", exercise_name: "Back Squat", measurement: "reps_weight" as const, planned_sets: planned, sets });

describe("estimated 1RM", () => {
  it("uses Epley for 1–12 reps and refuses unreliable inputs", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBe(116.7);
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
  });
});

describe("personal records", () => {
  it("tracks best e1RM, heaviest set and most reps with dates, converting kg to lb", () => {
    const logs = [
      log("2026-09-01", [squat([set(5, 135), set(5, 135)])]),
      log("2026-09-08", [squat([set(3, 100, { weight_unit: "kg" }), set(8, 135)])]),
      log("2026-09-10", [squat([set(5, 500, { completed: false })])]),
    ];
    const [pr] = personalRecords(logs);
    expect(pr!.heaviest_lb).toBe(220.5);
    expect(pr!.heaviest_on).toBe("2026-09-08");
    expect(pr!.best_e1rm_lb).toBe(242.5);
    expect(pr!.most_reps).toBe(8);
  });

  it("ignores workouts that were not completed", () => {
    expect(personalRecords([log("2026-09-01", [squat([set(5, 200)])], { status: "in_progress" })])).toHaveLength(0);
  });

  it("reports records inside a window", () => {
    const prs = personalRecords([log("2026-09-01", [squat([set(5, 135)])]), log("2026-09-20", [squat([set(5, 155)])])]);
    expect(recentRecords(prs, "2026-09-15", "2026-09-30")[0]).toMatchObject({ kind: "e1rm", on: "2026-09-20" });
  });
});

describe("attendance vs adherence", () => {
  const today = "2026-10-09";
  const scheduled: MetricScheduled[] = [
    { id: "1", athlete_id: "a1", scheduled_date: "2026-10-01", status: "completed" },
    { id: "2", athlete_id: "a1", scheduled_date: "2026-10-03", status: "planned" }, // missed
    { id: "3", athlete_id: "a1", scheduled_date: "2026-10-05", status: "skipped" }, // excused
    { id: "4", athlete_id: "a1", scheduled_date: "2026-10-09", status: "planned" }, // today: still open
    { id: "5", athlete_id: "a1", scheduled_date: "2026-10-12", status: "planned" }, // future
  ];

  it("counts missed sessions only before today and excludes excused ones", () => {
    const a = attendance(scheduled, today);
    expect(a).toMatchObject({ completed: 1, missed: 1, excused: 1 });
    expect(a.rate).toBe(0.5);
  });

  it("returns null when nothing was due", () => {
    expect(attendance([], today).rate).toBeNull();
  });

  it("measures adherence as prescribed sets completed, independent of attendance", () => {
    const logs = [log("2026-10-01", [squat([set(5, 100), set(5, 100)], 3)]), log("2026-10-02", [squat([set(5, 100)], 3)], { scheduled_session_id: null })];
    const ad = adherence(logs);
    expect(ad).toMatchObject({ prescribed: 3, performed: 2 });
    expect(ad.rate).toBeCloseTo(2 / 3);
  });

  it("caps adherence at the prescription", () => {
    expect(adherence([log("2026-10-01", [squat([set(5, 1), set(5, 1), set(5, 1), set(5, 1)], 3)])]).rate).toBe(1);
  });

  it("session completion compares completed with started workouts", () => {
    expect(sessionCompletion([log("2026-10-01", []), log("2026-10-02", [], { status: "in_progress" })]).rate).toBe(0.5);
  });
});

describe("volume, trends and consistency", () => {
  it("sums weight × reps for completed loaded sets only", () => {
    expect(logVolume(log("2026-10-01", [squat([set(5, 100), set(5, 100, { completed: false }), set(null, null, { duration_seconds: 40 })])]))).toBe(500);
  });

  it("weekStart returns the ISO Monday", () => {
    expect(weekStart("2026-10-09")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
  });

  it("tracks a streak of active weeks without penalising the current week", () => {
    const today = "2026-10-09";
    const logs = [log("2026-09-22", []), log("2026-09-29", []), log("2026-10-01", [])];
    const c = consistency(logs, 4, "2026-10-05"); // current (empty) week does not break the streak
    expect(c.streak_weeks).toBe(2);
    expect(consistency(logs, 4, today).series.at(-1)!.sessions).toBe(0);
  });

  it("exerciseTrend tracks timed work by duration", () => {
    const plank = { exercise_id: "plank", exercise_name: "Plank", measurement: "time" as const, planned_sets: 3, sets: [set(null, null, { duration_seconds: 40 }), set(null, null, { duration_seconds: 45 })] };
    expect(exerciseTrend([log("2026-10-01", [plank])], "plank")[0]!.seconds).toBe(45);
  });
});

describe("goals", () => {
  it("derives strength goal values from records and clamps progress", () => {
    const logs = [log("2026-10-01", [squat([set(1, 200)])])];
    const prs = personalRecords(logs);
    const goal = { metric: "estimated_1rm" as const, exercise_id: "squat", baseline_value: 150, target_value: 250, current_value: null };
    const current = goalCurrentValue(goal, prs, logs, "2026-10-09");
    expect(current).toBe(200);
    expect(goalProgress(goal, current)).toBe(0.5);
    expect(goalProgress(goal, 400)).toBe(1);
    expect(goalProgress({ ...goal, target_value: null }, 200)).toBeNull();
  });

  it("uses the reported value for custom goals", () => {
    const g = { metric: "custom" as const, exercise_id: null, baseline_value: 10, target_value: 20, current_value: 15 };
    expect(goalCurrentValue(g, [], [], "2026-10-09")).toBe(15);
  });
});

describe("attention signals", () => {
  const today = "2026-10-09";
  it("flags repeated missed sessions, inactivity and consecutive low recovery", () => {
    const scheduled: MetricScheduled[] = [
      { id: "1", athlete_id: "a", scheduled_date: addDays(today, -3), status: "planned" },
      { id: "2", athlete_id: "a", scheduled_date: addDays(today, -5), status: "planned" },
    ];
    const logs = [log(addDays(today, -12), [], { recovery_rating: 2 }), log(addDays(today, -14), [], { recovery_rating: 1 })];
    const kinds = attentionReasons({ hasActiveAssignment: true }, scheduled, logs, today).map((r) => r.kind);
    expect(kinds).toEqual(["missed_sessions", "inactive", "low_recovery"]);
  });

  it("does not flag an athlete who is training", () => {
    expect(attentionReasons({ hasActiveAssignment: true }, [], [log(addDays(today, -2), [])], today)).toEqual([]);
  });
});
