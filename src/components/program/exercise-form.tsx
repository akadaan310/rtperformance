"use client";
import { useActionState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Exercise } from "@/lib/types";
import { saveExerciseAction } from "@/app/w/[slug]/exercises/actions";

const CATEGORIES = ["squat", "hinge", "push", "pull", "lunge", "carry", "core", "conditioning", "mobility", "power", "accessory"];

export function ExerciseForm({ slug, exercise, options, substitutionIds = [] }: { slug: string; exercise?: Exercise; options: { id: string; name: string }[]; substitutionIds?: string[] }) {
  const [state, action] = useActionState(saveExerciseAction, null);
  const fe = (state && !state.ok && state.fieldErrors) || {};
  return (
    <form action={action} className="grid gap-5 md:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      {exercise && <input type="hidden" name="exercise_id" value={exercise.id} />}
      <Field label="Name" htmlFor="ex-name" className="md:col-span-2" error={fe.name}>
        <Input id="ex-name" name="name" required defaultValue={exercise?.name} />
      </Field>
      <Field label="Movement category" htmlFor="ex-cat" error={fe.category}>
        <Select id="ex-cat" name="category" defaultValue={exercise?.category ?? "accessory"}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c[0]!.toUpperCase() + c.slice(1)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Difficulty" htmlFor="ex-diff">
        <Select id="ex-diff" name="difficulty" defaultValue={exercise?.difficulty ?? "beginner"}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
      </Field>
      <Field label="Recorded as" htmlFor="ex-meas">
        <Select id="ex-meas" name="measurement" defaultValue={exercise?.measurement ?? "reps_weight"}>
          <option value="reps_weight">Reps × weight</option>
          <option value="reps">Reps only</option>
          <option value="time">Time (seconds)</option>
          <option value="distance">Distance (meters)</option>
        </Select>
      </Field>
      <Field label="Equipment" htmlFor="ex-eq" hint="Comma-separated" optional>
        <Input id="ex-eq" name="equipment" defaultValue={exercise?.equipment.join(", ")} placeholder="dumbbell, bench" />
      </Field>
      <Field label="Muscle groups" htmlFor="ex-mg" hint="Comma-separated" optional className="md:col-span-2">
        <Input id="ex-mg" name="muscle_groups" defaultValue={exercise?.muscle_groups.join(", ")} placeholder="glutes, hamstrings" />
      </Field>
      <Field label="Description" htmlFor="ex-desc" optional className="md:col-span-2">
        <Textarea id="ex-desc" name="description" defaultValue={exercise?.description ?? ""} className="min-h-16" />
      </Field>
      <Field label="Coaching cues" htmlFor="ex-cues" hint="One per line" optional className="md:col-span-2">
        <Textarea id="ex-cues" name="cues" defaultValue={exercise?.cues.join("\n")} />
      </Field>
      <Field label="Instructions" htmlFor="ex-inst" optional className="md:col-span-2">
        <Textarea id="ex-inst" name="instructions" defaultValue={exercise?.instructions ?? ""} />
      </Field>
      <fieldset className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-5">
        <legend className="eyebrow mb-3">Default prescription</legend>
        <Field label="Sets" htmlFor="ex-sets" error={fe.default_sets}>
          <Input id="ex-sets" name="default_sets" type="number" min={1} max={20} defaultValue={exercise?.default_sets ?? ""} />
        </Field>
        <Field label="Reps" htmlFor="ex-reps">
          <Input id="ex-reps" name="default_reps" defaultValue={exercise?.default_reps ?? ""} placeholder="8-10" />
        </Field>
        <Field label="Rest (s)" htmlFor="ex-rest" error={fe.default_rest_seconds}>
          <Input id="ex-rest" name="default_rest_seconds" type="number" min={0} max={900} defaultValue={exercise?.default_rest_seconds ?? ""} />
        </Field>
        <Field label="Tempo" htmlFor="ex-tempo" error={fe.default_tempo}>
          <Input id="ex-tempo" name="default_tempo" defaultValue={exercise?.default_tempo ?? ""} placeholder="3010" maxLength={4} />
        </Field>
        <Field label="RPE" htmlFor="ex-rpe" error={fe.default_rpe}>
          <Input id="ex-rpe" name="default_rpe" type="number" min={1} max={10} step="0.5" defaultValue={exercise?.default_rpe ?? ""} />
        </Field>
      </fieldset>
      <Field label="Substitutions" htmlFor="ex-subs" hint="Hold Ctrl/⌘ to choose several alternatives" optional className="md:col-span-2">
        <Select id="ex-subs" name="substitution_ids" multiple defaultValue={substitutionIds} className="h-40 bg-none">
          {options
            .filter((o) => o.id !== exercise?.id)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </Select>
      </Field>
      <div className="space-y-3 md:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>{exercise ? "Save exercise" : "Add to library"}</SubmitButton>
      </div>
    </form>
  );
}
