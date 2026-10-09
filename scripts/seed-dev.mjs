#!/usr/bin/env node
/**
 * DEVELOPMENT-ONLY demo data. Refuses to run against anything but a local Supabase stack unless
 * RT_ALLOW_REMOTE_DEV_SEED=1 is set explicitly. Never run this against Raymond's production project.
 *
 * Creates demo users and walks the real product flows through each user's own session (so Row Level
 * Security applies): network invitation → trainer workspace, athlete creation, program build → publish →
 * assign, athlete invitation → acceptance, and several weeks of logged workouts.
 *
 *   node scripts/seed-dev.mjs --yes
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const host = url ? new URL(url).hostname : "";
if (!url || !anon || !service) throw new Error("Missing Supabase env vars (.env.local).");
if (!["localhost", "127.0.0.1"].includes(host) && process.env.RT_ALLOW_REMOTE_DEV_SEED !== "1") {
  console.error(`Refusing to seed demo data into ${host}. This script is for local development only.`);
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("Pass --yes to confirm you want demo data in this local database.");
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD ?? "Demo-Training-2026";
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const people = {
  raymond: { email: "raymond@rtperformance.dev", name: "Raymond Tate" },
  jordan: { email: "jordan@reyesstrength.dev", name: "Jordan Reyes" },
  maya: { email: "maya@athlete.dev", name: "Maya Chen" },
  devon: { email: "devon@athlete.dev", name: "Devon Brooks" },
  sam: { email: "sam@athlete.dev", name: "Sam Ortiz" },
};

async function ensureUser({ email, name }) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, role: "authenticated", user_metadata: { full_name: name } });
  if (error) throw error;
  return data.user.id;
}

async function session(email) {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

const must = (label) => ({ data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const one = (d) => (Array.isArray(d) ? d[0] : d);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const mondayOf = (key) => {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  return addDays(key, 1 - dow);
};

async function main() {
  const { count } = await admin.from("organizations").select("id", { count: "exact", head: true });
  if (count) {
    console.log("Organizations already exist — skipping seed (run `npm run stack:reset` for a clean database).");
    return;
  }
  for (const p of Object.values(people)) await ensureUser(p);
  must("provision")(await admin.rpc("provision_master_workspace", { p_email: people.raymond.email, p_name: "RT Performance", p_slug: "rt-performance" }));

  const ray = await session(people.raymond.email);
  const master = must("master")(await ray.from("organizations").select("id, slug").eq("slug", "rt-performance").single());
  must("brand")(
    await ray
      .from("brand_settings")
      .update({ coach_bio: "Demo biography — replace with Raymond's own words.", public_profile_enabled: true })
      .eq("org_id", master.id),
  );

  // Network: Raymond invites Jordan, Jordan accepts and gets an independent workspace.
  const trainerInvite = one(must("invite trainer")(await ray.rpc("create_invitation", { p_kind: "trainer_workspace", p_org: master.id, p_email: people.jordan.email, p_workspace_name: "Reyes Strength" })));
  const jordan = await session(people.jordan.email);
  const jordanOrg = must("accept trainer")(await jordan.rpc("accept_invitation", { p_token: trainerInvite.token, p_workspace_name: "Reyes Strength", p_workspace_slug: "reyes-strength" }));
  must("jordan brand")(await jordan.from("brand_settings").update({ accent_color: "#8FA3B8", portal_tagline: "Strength is a skill.", welcome_headline: "Show up. Write it down. Get better." }).eq("org_id", jordanOrg));

  const exercises = must("exercises")(await ray.from("exercises").select("id, name").is("org_id", null));
  const ex = (name) => {
    const e = exercises.find((x) => x.name === name);
    if (!e) throw new Error(`exercise ${name}`);
    return e.id;
  };

  async function buildProgram(client, orgId, name, sessions, meta) {
    const ids = one(must("create program")(await client.rpc("create_program", { p_org: orgId, p_name: name, p_description: meta.description, p_goal: meta.goal, p_level: meta.level, p_duration_weeks: meta.weeks, p_sessions_per_week: sessions.length })));
    for (let week = 1; week <= meta.weeks; week++) {
      for (const [i, s] of sessions.entries()) {
        const row = must("session")(await client.from("program_sessions").insert({ org_id: orgId, version_id: ids.version_id, week_number: week, day_number: i + 1, position: i, name: s.name, focus: s.focus, estimated_minutes: 60 }).select("id").single());
        must("pex")(
          await client.from("program_exercises").insert(
            s.exercises.map((e, j) => ({
              org_id: orgId,
              session_id: row.id,
              exercise_id: ex(e[0]),
              position: j,
              sets: e[1],
              reps: e[2],
              load_type: e[3] ?? "rpe",
              load_value: e[4] ?? 7,
              rest_seconds: e[5] ?? 120,
              progression: j === 0 ? "Add 5 lb when every rep is clean at the target RPE" : null,
            })),
            { defaultToNull: false },
          ),
        );
      }
    }
    must("publish")(await client.rpc("publish_program_version", { p_version: ids.version_id, p_change_summary: "Initial version" }));
    return ids.template_id;
  }

  const foundations = await buildProgram(
    ray,
    master.id,
    "Foundations Strength",
    [
      { name: "Lower Strength", focus: "Squat & hinge", exercises: [["Back Squat", 4, "5"], ["Romanian Deadlift", 3, "8"], ["Reverse Lunge", 3, "10 each", "none", null, 90], ["Plank", 3, "40", "none", null, 45]] },
      { name: "Upper Strength", focus: "Press & pull", exercises: [["Bench Press", 4, "5"], ["One-Arm Dumbbell Row", 3, "10 each"], ["Seated Dumbbell Shoulder Press", 3, "8"], ["Face Pull", 3, "15", "none", null, 60]] },
      { name: "Full Body", focus: "Strength-endurance", exercises: [["Trap Bar Deadlift", 4, "5"], ["Incline Dumbbell Press", 3, "10"], ["Lat Pulldown", 3, "10"], ["Farmer's Carry", 4, "40", "none", null, 90]] },
    ],
    { weeks: 6, goal: "General strength", level: "beginner", description: "Six weeks of linear strength work. Demo program." },
  );

  // Athletes in Raymond's own workspace — the same engine every trainer uses.
  const athletes = must("athletes")(
    await ray
      .from("athlete_profiles")
      .insert([
        { org_id: master.id, first_name: "Maya", last_name: "Chen", email: people.maya.email, experience_level: "beginner", sessions_per_week: 3, training_goals: "Build general strength; first bodyweight pull-up.", equipment: ["barbell", "dumbbell", "bench", "cable"], limitations: "Mild left knee discomfort on deep lunges (self-reported).", next_check_in_date: addDays(today, 3) },
        { org_id: master.id, first_name: "Devon", last_name: "Brooks", email: people.devon.email, experience_level: "intermediate", sessions_per_week: 3, training_goals: "Squat 275 lb; stay consistent through travel.", equipment: ["barbell", "dumbbell", "trap bar"], next_check_in_date: addDays(today, -1) },
        { org_id: master.id, first_name: "Priya", last_name: "Nair", experience_level: "beginner", sessions_per_week: 2, training_goals: "Feel stronger and move without stiffness." },
      ], { defaultToNull: false })
      .select("id, first_name"),
  );
  const [maya, devon] = athletes;
  const start = addDays(mondayOf(today), -28);
  for (const a of [maya, devon]) must("assign")(await ray.rpc("assign_program", { p_athlete: a.id, p_template: foundations, p_start: start, p_training_days: [1, 3, 5] }));

  // Maya and Devon accept their portal invitations.
  for (const [who, a] of [["maya", maya], ["devon", devon]]) {
    const inv = one(must("invite athlete")(await ray.rpc("create_invitation", { p_kind: "athlete", p_org: master.id, p_email: people[who].email, p_athlete: a.id })));
    const c = await session(people[who].email);
    must("accept athlete")(await c.rpc("accept_invitation", { p_token: inv.token }));
  }

  // History: Maya trains consistently; Devon misses recent sessions (shows up in "needs attention").
  async function logHistory(email, athleteId, opts) {
    const c = await session(email);
    const sched = must("sched")(await c.from("scheduled_sessions").select("id, scheduled_date").eq("athlete_id", athleteId).lt("scheduled_date", today).order("scheduled_date"));
    for (const [i, s] of sched.entries()) {
      if (opts.skip(i, s.scheduled_date)) continue;
      const logId = must("start")(await c.rpc("start_workout", { p_scheduled_session: s.id, p_performed_on: s.scheduled_date }));
      const lex = must("lex")(await c.from("workout_log_exercises").select("id, planned, exercises(name, measurement)").eq("log_id", logId));
      for (const e of lex) {
        const sets = e.planned.sets ?? 3;
        const base = { "Back Squat": 115, "Bench Press": 85, "Trap Bar Deadlift": 155, "Romanian Deadlift": 95 }[e.exercises.name] ?? 30;
        const rows = [];
        for (let n = 1; n <= sets; n++) {
          const m = e.exercises.measurement;
          rows.push({
            org_id: master.id,
            log_exercise_id: e.id,
            set_number: n,
            reps: m === "time" || m === "distance" ? null : Math.max(1, parseInt(e.planned.reps, 10) || 8) - (n === sets && opts.fade ? 1 : 0),
            weight: m === "reps_weight" ? base * opts.scale + Math.floor(i / 3) * 5 : null,
            duration_seconds: m === "time" ? 40 : null,
            distance_m: m === "distance" ? 40 : null,
            rpe: n === sets ? 8 : 7,
          });
        }
        must("sets")(await c.from("workout_log_sets").insert(rows));
        must("lex done")(await c.from("workout_log_exercises").update({ completed: true }).eq("id", e.id));
      }
      must("complete")(await c.from("workout_logs").update({ status: "completed", perceived_effort: 6 + (i % 3), recovery_rating: opts.recovery(i) }).eq("id", logId));
    }
  }
  await logHistory(people.maya.email, maya.id, { skip: (i) => i === 4, scale: 1, fade: false, recovery: () => 4 });
  await logHistory(people.devon.email, devon.id, { skip: (_i, d) => d >= addDays(today, -9), scale: 1.6, fade: true, recovery: (i) => (i > 5 ? 2 : 3) });

  must("goal")(await ray.from("goals").insert([
    { org_id: master.id, athlete_id: maya.id, title: "Back squat 155 lb (est. 1RM)", goal_type: "strength", metric: "estimated_1rm", exercise_id: ex("Back Squat"), baseline_value: 120, target_value: 155, unit: "lb", target_date: addDays(today, 60) },
    { org_id: master.id, athlete_id: maya.id, title: "Train 3× per week", goal_type: "consistency", metric: "sessions_per_week", baseline_value: 1, target_value: 3 },
    { org_id: master.id, athlete_id: devon.id, title: "Squat 275 lb", goal_type: "strength", metric: "estimated_1rm", exercise_id: ex("Back Squat"), baseline_value: 220, target_value: 275, unit: "lb" },
  ], { defaultToNull: false }));
  must("notes")(await ray.from("coach_notes").insert([
    { org_id: master.id, athlete_id: maya.id, author_id: (await ray.auth.getUser()).data.user.id, body: "Great bracing on squats this week. Keep the tempo honest on the way down.", visibility: "shared", pinned: true },
    { org_id: master.id, athlete_id: devon.id, author_id: (await ray.auth.getUser()).data.user.id, body: "Travelling for work through mid-month — check in about hotel-gym substitutions.", visibility: "private" },
  ], { defaultToNull: false }));

  // Jordan's independent workspace: one athlete, one program.
  const sam = must("sam")(await jordan.from("athlete_profiles").insert({ org_id: jordanOrg, first_name: "Sam", last_name: "Ortiz", email: people.sam.email, experience_level: "intermediate", sessions_per_week: 2 }).select("id").single());
  const jProgram = await buildProgram(jordan, jordanOrg, "Two-Day Minimalist", [
    { name: "Day A", focus: "Squat, press, pull", exercises: [["Goblet Squat", 3, "8"], ["Push-Up", 3, "AMRAP", "bodyweight"], ["Chest-Supported Row", 3, "10"]] },
    { name: "Day B", focus: "Hinge, carry", exercises: [["Kettlebell Deadlift", 3, "10"], ["Suitcase Carry", 3, "30", "none"], ["Dead Bug", 3, "8 each", "none"]] },
  ], { weeks: 4, goal: "Maintain strength on a tight schedule", level: "intermediate", description: "Demo program in a trainer workspace." });
  must("assign sam")(await jordan.rpc("assign_program", { p_athlete: sam.id, p_template: jProgram, p_start: addDays(mondayOf(today), -7), p_training_days: [2, 5] }));
  const samInv = one(must("invite sam")(await jordan.rpc("create_invitation", { p_kind: "athlete", p_org: jordanOrg, p_email: people.sam.email, p_athlete: sam.id })));
  must("accept sam")(await (await session(people.sam.email)).rpc("accept_invitation", { p_token: samInv.token }));

  console.log(`
Demo data ready (local development only). Password for every demo account: ${PASSWORD}
  Network owner : ${people.raymond.email}   → /w/rt-performance
  Trainer       : ${people.jordan.email}    → /w/reyes-strength
  Athletes      : ${people.maya.email}, ${people.devon.email} (RT Performance), ${people.sam.email} (Reyes Strength)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
