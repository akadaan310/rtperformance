import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, buildWorld, ctxFor, first, libraryExercise, unwrap, type World } from "../support/world";
import {
  addProgramExercise,
  addSession,
  assignProgram,
  createProgram,
  createProgramFromDraft,
  duplicateProgram,
  getProgram,
  moveProgramExercise,
  publishVersion,
  startRevision,
  updateProgramExercise,
} from "@/lib/services/programs";
import { completeWorkout, getWorkout, saveSet, startScheduledWorkout } from "@/lib/services/workouts";
import { athleteProgress, athleteSchedule } from "@/lib/services/progress";
import { getBrand, patchBrand, resetBrand, updateBrand } from "@/lib/services/branding";
import { buildSchedule } from "@/lib/schedule";
import { addDays, weekStart } from "@/lib/metrics";
import { todayKey } from "@/lib/dates";

let w: World;
let squat: string, row: string, bench: string, goblet: string;
beforeAll(async () => {
  w = await buildWorld();
  [squat, row, bench, goblet] = (await Promise.all(["Back Squat", "One-Arm Dumbbell Row", "Bench Press", "Goblet Squat"].map((n) => libraryExercise(w.owner.client, n)))) as [string, string, string, string];
});

describe("program builder & versioning", () => {
  it("creates, edits, reorders and publishes a program; published versions are immutable", async () => {
    const ctx = ctxFor(w.owner, w.master, "owner", { isMasterOwner: true });
    const { templateId, versionId } = await createProgram(ctx, { name: "Test Block", duration_weeks: 2, sessions_per_week: 2 });
    const s1 = await addSession(ctx, versionId, { name: "Lower", week_number: 1, day_number: 1 });
    const a = await addProgramExercise(ctx, s1.id, { exercise_id: squat, sets: 4, reps: "5", load_type: "rpe", load_value: 7, rest_seconds: 180, tempo: "3010", substitution_ids: [goblet] });
    const b = await addProgramExercise(ctx, s1.id, { exercise_id: row, sets: 3, reps: "10" });
    await moveProgramExercise(ctx, b.id, "up");
    let detail = await getProgram(ctx, templateId);
    expect(detail.sessions[0]!.exercises.map((e) => e.exercise_id)).toEqual([row, squat]);
    expect(detail.sessions[0]!.exercises[1]).toMatchObject({ sets: 4, reps: "5", tempo: "3010", rest_seconds: 180, substitution_ids: [goblet] });

    await publishVersion(ctx, versionId, "First cut");
    detail = await getProgram(ctx, templateId);
    expect(detail.version).toMatchObject({ status: "published", version_number: 1 });
    expect(detail.editable).toBe(false);

    // Direct writes to published content are blocked in the database, not just the UI.
    const { error } = await w.owner.client.from("program_exercises").update({ sets: 10 }).eq("id", a.id);
    expect(error?.message).toMatch(/immutable/);
    await expect(updateProgramExercise(ctx, a.id, { exercise_id: squat, sets: 10, reps: "5" })).rejects.toThrow(/locked/);
    const { error: delErr } = await w.owner.client.from("program_sessions").delete().eq("id", s1.id);
    expect(delErr?.message).toMatch(/immutable/);
  });

  it("revisions create a new draft version without touching what athletes were assigned", async () => {
    const ctx = ctxFor(w.owner, w.master, "owner", { isMasterOwner: true });
    const { templateId } = await createProgramFromDraft(ctx, {
      name: "Pinned Program",
      duration_weeks: 2,
      sessions_per_week: 2,
      sessions: [1, 2].flatMap((week) => [
        { name: "A", week_number: week, day_number: 1, exercises: [{ exercise_id: squat, sets: 3, reps: "5" }] },
        { name: "B", week_number: week, day_number: 2, exercises: [{ exercise_id: bench, sets: 3, reps: "5" }] },
      ]),
    });
    const v1 = (await getProgram(ctx, templateId)).version;
    await publishVersion(ctx, v1.id);
    const start = todayKey();
    const assignmentId = await assignProgram(ctx, { athlete_id: w.masterAthlete.athleteId, template_id: templateId, start_date: start, training_days: [1, 3] });

    const draftId = await startRevision(ctx, templateId);
    const draft = await getProgram(ctx, templateId, draftId);
    expect(draft.version).toMatchObject({ status: "draft", version_number: 2 });
    expect(draft.sessions).toHaveLength(4);
    await updateProgramExercise(ctx, draft.sessions[0]!.exercises[0]!.id, { exercise_id: squat, sets: 5, reps: "3" });

    const assignment = unwrap(await w.owner.client.from("assignments").select("version_id").eq("id", assignmentId).single()) as { version_id: string };
    expect(assignment.version_id).toBe(v1.id);
    const pinned = await getProgram(ctx, templateId, v1.id);
    expect(pinned.sessions[0]!.exercises[0]).toMatchObject({ sets: 3, reps: "5" });

    // The SQL schedule matches the TypeScript preview rule.
    const scheduled = unwrap(await w.owner.client.from("scheduled_sessions").select("program_session_id, scheduled_date").eq("assignment_id", assignmentId)) as { program_session_id: string; scheduled_date: string }[];
    const expected = buildSchedule(pinned.sessions.map((s) => ({ id: s.id, week_number: s.week_number, day_number: s.day_number, position: s.position })), start, [1, 3]);
    expect(scheduled.map((s) => `${s.program_session_id}@${s.scheduled_date}`).sort()).toEqual(expected.map((e) => `${e.session_id}@${e.date}`).sort());

    // Only published versions can be assigned; unpublished programs are refused.
    const { templateId: unpublished } = await createProgram(ctx, { name: "Not yet" });
    await expect(assignProgram(ctx, { athlete_id: w.masterAthlete.athleteId, template_id: unpublished, start_date: start, training_days: [2] })).rejects.toThrow(/Publish/);
  });

  it("duplicates a program into an independent draft", async () => {
    const ctx = ctxFor(w.trainer, w.trainerOrg, "owner");
    const { templateId } = await createProgramFromDraft(ctx, { name: "Original", sessions: [{ name: "Only", day_number: 1, exercises: [{ exercise_id: squat, sets: 3, reps: "8" }] }] });
    const copy = await duplicateProgram(ctx, templateId, "Copy");
    const d = await getProgram(ctx, copy);
    expect(d.template).toMatchObject({ name: "Copy", source_template_id: templateId });
    expect(d.version.status).toBe("draft");
    expect(d.sessions[0]!.exercises).toHaveLength(1);
  });

  it("rejects exercises from another workspace's private library", async () => {
    const trainerCtx = ctxFor(w.trainer, w.trainerOrg, "owner");
    const privateEx = unwrap(await w.owner.client.from("exercises").insert({ org_id: w.master.id, name: `Raymond Special ${Date.now()}`, category: "accessory" }).select("id").single()) as { id: string };
    await expect(
      createProgramFromDraft(trainerCtx, { name: "Steal", sessions: [{ name: "S", day_number: 1, exercises: [{ exercise_id: privateEx.id, sets: 3, reps: "5" }] }] }),
    ).rejects.toThrow(/Unknown exercise/);
  });
});

describe("workout logging (Scenarios A & C)", () => {
  let assignmentSessions: { id: string; scheduled_date: string }[] = [];

  beforeAll(async () => {
    const coach = ctxFor(w.trainer, w.trainerOrg, "owner");
    const { templateId, versionId } = await createProgramFromDraft(coach, {
      name: "Logging Program",
      duration_weeks: 1,
      sessions_per_week: 1,
      sessions: [{ name: "Today", day_number: 1, exercises: [{ exercise_id: squat, sets: 3, reps: "5", load_type: "weight", load_value: 135, load_unit: "lb" }, { exercise_id: row, sets: 2, reps: "10" }] }],
    });
    await publishVersion(coach, versionId);
    const today = todayKey();
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
    const assignmentId = await assignProgram(coach, { athlete_id: w.trainerAthlete.athleteId, template_id: templateId, start_date: today, training_days: [dow] });
    assignmentSessions = unwrap(await w.trainer.client.from("scheduled_sessions").select("id, scheduled_date").eq("assignment_id", assignmentId)) as typeof assignmentSessions;
  });

  it("an athlete records a real session that persists and completes the schedule", async () => {
    const actx = ctxFor(w.trainerAthlete.actor, w.trainerOrg, "athlete", { athleteId: w.trainerAthlete.athleteId });
    const schedule = await athleteSchedule(actx, w.trainerAthlete.athleteId);
    expect(schedule.map((s) => s.id)).toEqual(assignmentSessions.map((s) => s.id));

    const logId = await startScheduledWorkout(actx, assignmentSessions[0]!.id);
    // Starting again resumes the same log.
    expect(await startScheduledWorkout(actx, assignmentSessions[0]!.id)).toBe(logId);
    const detail = await getWorkout(actx, logId);
    expect(detail.exercises[0]!.planned).toMatchObject({ sets: 3, reps: "5", load_type: "weight", load_value: 135 });

    await expect(completeWorkout(actx, { log_id: logId })).rejects.toThrow(/at least one set/);
    for (const n of [1, 2, 3]) await saveSet(actx, { log_exercise_id: detail.exercises[0]!.id, set_number: n, reps: 5, weight: 140 + n * 5, weight_unit: "lb", rpe: 7 + n * 0.5 });
    await saveSet(actx, { log_exercise_id: detail.exercises[0]!.id, set_number: 3, reps: 4, weight: 155, weight_unit: "lb", rpe: 9 });
    await completeWorkout(actx, { log_id: logId, perceived_effort: 8, recovery_rating: 4, notes: "Felt strong" });

    const after = await getWorkout(actx, logId);
    expect(after.log.status).toBe("completed");
    expect(after.exercises[0]!.sets.map((s) => [s.reps, Number(s.weight)])).toEqual([[5, 145], [5, 150], [4, 155]]);
    // Planned values remain the prescription; performed values are separate rows.
    expect(after.exercises[0]!.planned.load_value).toBe(135);

    const ss = unwrap(await w.trainer.client.from("scheduled_sessions").select("status").eq("id", assignmentSessions[0]!.id).single()) as { status: string };
    expect(ss.status).toBe("completed");

    const progress = await athleteProgress(actx, w.trainerAthlete.athleteId, "4w");
    expect(progress.totals.completedWorkouts).toBe(1);
    expect(progress.records.find((r) => r.exercise_id === squat)!.heaviest_lb).toBe(155);
    expect(progress.adherence).toMatchObject({ prescribed: 5, performed: 3 });

    // The coach sees the same persisted result.
    const coachView = await athleteProgress(ctxFor(w.trainer, w.trainerOrg, "owner"), w.trainerAthlete.athleteId, "4w");
    expect(coachView.totals.completedWorkouts).toBe(1);
  });

  it("athletes cannot log for, or read, another athlete's workouts", async () => {
    const other = ctxFor(w.masterAthlete.actor, w.master, "athlete", { athleteId: w.masterAthlete.athleteId });
    await expect(startScheduledWorkout(other, assignmentSessions[0]!.id)).rejects.toThrow();
    const { data } = await w.masterAthlete.actor.client.from("workout_logs").select("id").eq("athlete_id", w.trainerAthlete.athleteId);
    expect(data).toEqual([]);
    const { error } = await w.masterAthlete.actor.client
      .from("workout_logs")
      .insert({ org_id: w.trainerOrg.id, athlete_id: w.trainerAthlete.athleteId, title: "forged", logged_by: w.masterAthlete.actor.id });
    expect(error).not.toBeNull();
  });

  it("a coach can record a workout on an athlete's behalf (Scenario A)", async () => {
    const coach = ctxFor(w.owner, w.master, "owner", { isMasterOwner: true });
    const { templateId, versionId } = await createProgramFromDraft(coach, { name: "Coach Logged", sessions: [{ name: "S", day_number: 1, exercises: [{ exercise_id: bench, sets: 2, reps: "5" }] }] });
    await publishVersion(coach, versionId);
    const monday = weekStart(todayKey());
    const assignmentId = await assignProgram(coach, { athlete_id: w.masterAthlete.athleteId, template_id: templateId, start_date: addDays(monday, -7), training_days: [1] });
    const [ss] = unwrap(await w.owner.client.from("scheduled_sessions").select("id").eq("assignment_id", assignmentId)) as { id: string }[];
    const logId = await startScheduledWorkout(coach, ss!.id);
    const d = await getWorkout(coach, logId);
    await saveSet(coach, { log_exercise_id: d.exercises[0]!.id, set_number: 1, reps: 5, weight: 100 });
    const done = await completeWorkout(coach, { log_id: logId, perceived_effort: 6 });
    expect(done.logged_by).toBe(w.owner.id);
    // The athlete sees the coach-recorded session in their own history.
    const theirs = unwrap(await w.masterAthlete.actor.client.from("workout_logs").select("id").eq("id", logId)) as unknown[];
    expect(theirs).toHaveLength(1);
  });
});

describe("white label (Scenario E)", () => {
  it("branding changes are scoped to the owner's workspace and visible on its public page", async () => {
    const trainerCtx = ctxFor(w.trainer, w.trainerOrg, "owner");
    const masterBefore = first(unwrap(await anonClient().rpc("get_public_workspace", { p_slug: w.master.slug })) as { accent_color: string; welcome_headline: string | null }[]);

    await updateBrand(trainerCtx, { display_name: "Blake's Coach Co", accent_color: "#8FA3B8", signal_color: "#C2412D", welcome_headline: "Strength is a skill.", coach_name: "Trainer T", coach_bio: "Bio", public_profile_enabled: false });
    let pub = first(unwrap(await anonClient().rpc("get_public_workspace", { p_slug: w.trainerOrg.slug })) as Record<string, unknown>[]);
    expect(pub).toMatchObject({ display_name: "Blake's Coach Co", accent_color: "#8FA3B8", welcome_headline: "Strength is a skill.", coach_name: null, coach_bio: null });

    await patchBrand(trainerCtx, { welcome_body: "Train with intent." });
    unwrap(await w.trainer.client.from("brand_settings").update({ public_profile_enabled: true }).eq("org_id", w.trainerOrg.id));
    pub = first(unwrap(await anonClient().rpc("get_public_workspace", { p_slug: w.trainerOrg.slug })) as Record<string, unknown>[]);
    expect(pub).toMatchObject({ coach_name: "Trainer T", welcome_body: "Train with intent." });

    // The athlete in that workspace sees the new brand; other workspaces are untouched.
    const seen = unwrap(await w.trainerAthlete.actor.client.from("brand_settings").select("accent_color").eq("org_id", w.trainerOrg.id).single()) as { accent_color: string };
    expect(seen.accent_color).toBe("#8FA3B8");
    const masterAfter = first(unwrap(await anonClient().rpc("get_public_workspace", { p_slug: w.master.slug })) as { accent_color: string; welcome_headline: string | null }[]);
    expect(masterAfter).toEqual(masterBefore);

    await resetBrand(trainerCtx);
    expect((await getBrand(trainerCtx))!.accent_color).toBe("#C8A45D");
  });

  it("non-owners cannot change branding, in the service or directly", async () => {
    const co = ctxFor(w.coTrainer, w.trainerOrg, "trainer");
    await expect(patchBrand(co, { accent_color: "#000000" })).rejects.toThrow(/owners/);
    const { data } = await w.coTrainer.client.from("brand_settings").update({ accent_color: "#000000" }).eq("org_id", w.trainerOrg.id).select("org_id");
    expect(data).toEqual([]);
    const { data: other } = await w.trainer.client.from("brand_settings").update({ accent_color: "#000000" }).eq("org_id", w.master.id).select("org_id");
    expect(other).toEqual([]);
  });
});
