"use client";
import { useActionState, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/components/ui/confirm-form";
import { WEEKDAYS } from "@/lib/schedule";
import type { ProgramTemplate } from "@/lib/types";
import { assignFromProgramAction, createProgramAction, updateMetaAction } from "@/app/w/[slug]/programs/actions";

export function ProgramMetaForm({ slug, program }: { slug: string; program?: ProgramTemplate }) {
  const [state, action] = useActionState<ActionState, FormData>(program ? updateMetaAction : createProgramAction, null);
  const fe = (state && !state.ok && state.fieldErrors) || {};
  return (
    <form action={action} className="grid gap-5 md:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      {program && <input type="hidden" name="program_id" value={program.id} />}
      <Field label="Name" htmlFor="p-name" className="md:col-span-2" error={fe.name}>
        <Input id="p-name" name="name" required defaultValue={program?.name} placeholder="Foundations Strength — Block 1" />
      </Field>
      {!program && (
        <Field label="Type" htmlFor="p-kind">
          <Select id="p-kind" name="kind" defaultValue="program">
            <option value="program">Multi-week program</option>
            <option value="session">Reusable session template</option>
          </Select>
        </Field>
      )}
      <Field label="Level" htmlFor="p-level" optional>
        <Select id="p-level" name="level" defaultValue={program?.level ?? ""}>
          <option value="">Any</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
      </Field>
      <Field label="Weeks" htmlFor="p-weeks" error={fe.duration_weeks}>
        <Input id="p-weeks" name="duration_weeks" type="number" min={1} max={52} defaultValue={program?.duration_weeks ?? 4} />
      </Field>
      <Field label="Sessions per week" htmlFor="p-spw" error={fe.sessions_per_week}>
        <Input id="p-spw" name="sessions_per_week" type="number" min={1} max={7} defaultValue={program?.sessions_per_week ?? 3} />
      </Field>
      <Field label="Goal" htmlFor="p-goal" optional className="md:col-span-2">
        <Input id="p-goal" name="goal" defaultValue={program?.goal ?? ""} placeholder="General strength, hypertrophy, return to training…" />
      </Field>
      <Field label="Overview & coach notes" htmlFor="p-desc" optional className="md:col-span-2">
        <Textarea id="p-desc" name="description" defaultValue={program?.description ?? ""} />
      </Field>
      <div className="md:col-span-2 space-y-3">
        <FormMessage state={state} />
        <SubmitButton>{program ? "Save details" : "Create draft program"}</SubmitButton>
      </div>
    </form>
  );
}

export function AssignFromProgramForm({ slug, programId, athletes, defaultStart, sessionsPerWeek }: { slug: string; programId: string; athletes: { id: string; name: string }[]; defaultStart: string; sessionsPerWeek: number }) {
  const [state, action] = useActionState(assignFromProgramAction, null);
  const [athlete, setAthlete] = useState(athletes[0]?.id ?? "");
  const defaults = sessionsPerWeek === 2 ? [2, 5] : sessionsPerWeek === 4 ? [1, 2, 4, 5] : sessionsPerWeek >= 5 ? [1, 2, 3, 4, 5] : [1, 3, 5];
  if (!athletes.length) return <p className="text-sm text-stone-500">Add an athlete first.</p>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="template_id" value={programId} />
      <Field label="Athlete" htmlFor="as-athlete">
        <Select id="as-athlete" name="athlete_id" value={athlete} onChange={(e) => setAthlete(e.target.value)}>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Start date" htmlFor="as-start">
        <Input id="as-start" name="start_date" type="date" defaultValue={defaultStart} required />
      </Field>
      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">Training days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="cursor-pointer">
              <input type="checkbox" name="training_days" value={d.value} defaultChecked={defaults.includes(d.value)} className="peer sr-only" />
              <span className="inline-flex h-9 w-12 items-center justify-center rounded-xs border border-ink-600 text-xs font-semibold text-stone-400 peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                {d.short}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Assigning…">Confirm assignment</SubmitButton>
      <p className="text-xs text-stone-500">The athlete is pinned to the latest published version. Later revisions won&apos;t change it.</p>
    </form>
  );
}
