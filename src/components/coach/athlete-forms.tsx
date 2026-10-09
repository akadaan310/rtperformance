"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyField } from "@/components/ui/copy-field";
import type { ActionState } from "@/components/ui/confirm-form";
import { WEEKDAYS } from "@/lib/schedule";
import { assignProgramAction, createGoalAction, createNoteAction, inviteAthleteAction, startWorkoutAction } from "@/app/w/[slug]/athletes/actions";

export function InviteAthleteForm({ slug, athleteId, email }: { slug: string; athleteId: string; email: string | null }) {
  const [state, action] = useActionState(inviteAthleteAction, null);
  if (state?.ok && state.url) return <CopyField value={state.url} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <Field label="Athlete email" htmlFor="invite-email">
        <Input id="invite-email" name="email" type="email" required defaultValue={email ?? ""} />
      </Field>
      <Field label="Personal note" htmlFor="invite-message" optional>
        <Textarea id="invite-message" name="message" className="min-h-16" placeholder="Welcome aboard — your first block is ready." />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="sm">Create invitation link</SubmitButton>
    </form>
  );
}

export function GoalForm({ slug, athleteId, exercises }: { slug: string; athleteId: string; exercises: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createGoalAction, null);
  const [metric, setMetric] = useState("estimated_1rm");
  const ref = useResetOnSuccess(state);
  const needsExercise = ["estimated_1rm", "max_weight", "max_reps"].includes(metric);
  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <Field label="Goal" htmlFor="goal-title" className="sm:col-span-2" error={state?.fieldErrors?.title}>
        <Input id="goal-title" name="title" required placeholder="e.g. Squat 225 lb for a single" />
      </Field>
      <Field label="Measured by" htmlFor="goal-metric">
        <Select
          id="goal-metric"
          name="metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="estimated_1rm">Estimated 1RM (lb)</option>
          <option value="max_weight">Heaviest set (lb)</option>
          <option value="max_reps">Most reps in a set</option>
          <option value="sessions_per_week">Workouts per week (4-wk avg)</option>
          <option value="custom">Manually reported value</option>
        </Select>
      </Field>
      <input type="hidden" name="goal_type" value={needsExercise ? "strength" : metric === "sessions_per_week" ? "consistency" : "custom"} />
      {needsExercise ? (
        <Field label="Exercise" htmlFor="goal-exercise" error={state?.fieldErrors?.exercise_id}>
          <Select id="goal-exercise" name="exercise_id" required>
            <option value="">Choose…</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Unit" htmlFor="goal-unit" optional>
          <Input id="goal-unit" name="unit" placeholder={metric === "custom" ? "e.g. lb bodyweight, min" : "sessions"} />
        </Field>
      )}
      <Field label="Baseline" htmlFor="goal-baseline" optional>
        <Input id="goal-baseline" name="baseline_value" type="number" step="any" />
      </Field>
      <Field label="Target" htmlFor="goal-target">
        <Input id="goal-target" name="target_value" type="number" step="any" required />
      </Field>
      <Field label="Target date" htmlFor="goal-date" optional>
        <Input id="goal-date" name="target_date" type="date" />
      </Field>
      <div className="flex items-end sm:col-span-2">
        <SubmitButton size="sm">Add goal</SubmitButton>
      </div>
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ slug, athleteId }: { slug: string; athleteId: string }) {
  const [state, action] = useActionState(createNoteAction, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <label htmlFor="note-body" className="sr-only">
        Note
      </label>
      <Textarea id="note-body" name="body" required placeholder="Observations, cues that worked, conversations…" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <Checkbox name="visibility" value="shared" label="Share with athlete" />
          <Checkbox name="pinned" label="Pin" />
        </div>
        <SubmitButton size="sm">Save note</SubmitButton>
      </div>
      <FormMessage state={state && !state.ok ? state : null} />
    </form>
  );
}

export function AssignProgramForm({ slug, athleteId, programs, defaultStart }: { slug: string; athleteId: string; programs: { id: string; name: string; version: number; sessionsPerWeek: number }[]; defaultStart: string }) {
  const [state, action] = useActionState(assignProgramAction, null);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const program = useMemo(() => programs.find((p) => p.id === programId), [programs, programId]);
  const defaults = program?.sessionsPerWeek === 2 ? [2, 5] : program?.sessionsPerWeek === 4 ? [1, 2, 4, 5] : program?.sessionsPerWeek === 5 ? [1, 2, 3, 4, 5] : [1, 3, 5];
  if (!programs.length) return <p className="text-sm text-stone-500">Publish a program first — only published versions can be assigned.</p>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <Field label="Program" htmlFor="assign-program">
        <Select id="assign-program" name="template_id" value={programId} onChange={(e) => setProgramId(e.target.value)}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · v{p.version}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Start date" htmlFor="assign-start">
        <Input id="assign-start" name="start_date" type="date" required defaultValue={defaultStart} />
      </Field>
      <fieldset key={programId}>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">Training days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="cursor-pointer">
              <input type="checkbox" name="training_days" value={d.value} defaultChecked={defaults.includes(d.value)} className="peer sr-only" />
              <span className="inline-flex h-9 w-12 items-center justify-center rounded-xs border border-ink-600 text-xs font-semibold text-stone-400 transition-colors peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                {d.short}
              </span>
            </label>
          ))}
        </div>
        {program && <p className="mt-2 text-xs text-stone-500">This program has {program.sessionsPerWeek} sessions per week. Sessions map to the chosen days in order.</p>}
      </fieldset>
      <Field label="Notes for the athlete" htmlFor="assign-notes" optional>
        <Textarea id="assign-notes" name="notes" className="min-h-16" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Assigning…">Assign program</SubmitButton>
    </form>
  );
}

export function AdhocWorkoutForm({ slug, athleteId, exercises }: { slug: string; athleteId: string; exercises: { id: string; name: string }[] }) {
  const [state, action] = useActionState(startWorkoutAction, null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="exercise_ids" value={chosen.join(",")} />
      <Field label="Workout title" htmlFor="adhoc-title">
        <Input id="adhoc-title" name="title" defaultValue="Workout" />
      </Field>
      <Field label="Find exercises" htmlFor="adhoc-search">
        <Input id="adhoc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library" />
      </Field>
      <ul className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto">
        {filtered.map((e) => (
          <li key={e.id}>
            <Checkbox checked={chosen.includes(e.id)} onChange={(ev) => setChosen((c) => (ev.target.checked ? [...c, e.id] : c.filter((x) => x !== e.id)))} label={e.name} />
          </li>
        ))}
      </ul>
      <FormMessage state={state} />
      <SubmitButton size="sm" disabled={!chosen.length}>
        Start workout ({chosen.length})
      </SubmitButton>
    </form>
  );
}

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}
