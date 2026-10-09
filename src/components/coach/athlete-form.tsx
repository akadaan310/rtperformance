"use client";
import { useActionState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import type { AthleteProfile } from "@/lib/types";
import type { ActionState } from "@/components/ui/confirm-form";

export function AthleteForm({
  slug,
  athlete,
  action,
  cancelHref,
}: {
  slug: string;
  athlete?: AthleteProfile;
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const fe = (state && !state.ok && state.fieldErrors) || {};
  return (
    <form action={formAction} className="space-y-10">
      <input type="hidden" name="slug" value={slug} />
      {athlete && <input type="hidden" name="athlete_id" value={athlete.id} />}

      <fieldset className="grid gap-5 md:grid-cols-2">
        <legend className="eyebrow mb-4 md:col-span-2">Basics</legend>
        <Field label="First name" htmlFor="first_name" error={fe.first_name}>
          <Input id="first_name" name="first_name" required defaultValue={athlete?.first_name} invalid={!!fe.first_name} />
        </Field>
        <Field label="Last name" htmlFor="last_name" error={fe.last_name} optional>
          <Input id="last_name" name="last_name" defaultValue={athlete?.last_name} />
        </Field>
        <Field label="Email" htmlFor="email" error={fe.email} optional hint="Used for their portal invitation.">
          <Input id="email" name="email" type="email" defaultValue={athlete?.email ?? ""} invalid={!!fe.email} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fe.phone} optional>
          <Input id="phone" name="phone" type="tel" defaultValue={athlete?.phone ?? ""} />
        </Field>
        <Field label="Date of birth" htmlFor="date_of_birth" error={fe.date_of_birth} optional>
          <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={athlete?.date_of_birth ?? ""} />
        </Field>
        <Field label="Next check-in" htmlFor="next_check_in_date" error={fe.next_check_in_date} optional>
          <Input id="next_check_in_date" name="next_check_in_date" type="date" defaultValue={athlete?.next_check_in_date ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5 md:grid-cols-2">
        <legend className="eyebrow mb-4 md:col-span-2">Training</legend>
        <Field label="Experience" htmlFor="experience_level" optional>
          <Select id="experience_level" name="experience_level" defaultValue={athlete?.experience_level ?? ""}>
            <option value="">Not set</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </Field>
        <Field label="Sessions per week" htmlFor="sessions_per_week" optional error={fe.sessions_per_week}>
          <Input id="sessions_per_week" name="sessions_per_week" type="number" min={1} max={7} defaultValue={athlete?.sessions_per_week ?? ""} />
        </Field>
        <Field label="Training goals" htmlFor="training_goals" className="md:col-span-2" optional>
          <Textarea id="training_goals" name="training_goals" defaultValue={athlete?.training_goals ?? ""} placeholder="e.g. Build general strength, first pull-up, deadlift 1.5× bodyweight" />
        </Field>
        <Field label="Preferences" htmlFor="training_preferences" className="md:col-span-2" optional>
          <Textarea id="training_preferences" name="training_preferences" defaultValue={athlete?.training_preferences ?? ""} placeholder="Schedule, session length, preferred styles…" />
        </Field>
        <Field label="Equipment available" htmlFor="equipment" className="md:col-span-2" optional hint="Comma-separated, e.g. barbell, dumbbell, bench, pull-up bar">
          <Input id="equipment" name="equipment" defaultValue={athlete?.equipment.join(", ") ?? ""} />
        </Field>
        <Field
          label="Limitations or restrictions"
          htmlFor="limitations"
          className="md:col-span-2"
          optional
          hint="Only record what the athlete has voluntarily shared. This is not a medical record."
        >
          <Textarea id="limitations" name="limitations" defaultValue={athlete?.limitations ?? ""} />
        </Field>
      </fieldset>

      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton size="lg">{athlete ? "Save changes" : "Create athlete"}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
