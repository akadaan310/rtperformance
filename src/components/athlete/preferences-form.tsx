"use client";
import { useActionState } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AthleteProfile } from "@/lib/types";
import { updatePreferencesAction } from "@/app/t/[slug]/athlete/actions";

export function PreferencesForm({ slug, athlete }: { slug: string; athlete: AthleteProfile }) {
  const [state, action] = useActionState(updatePreferencesAction, null);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Your goals" htmlFor="pf-goals" optional>
        <Textarea id="pf-goals" name="training_goals" defaultValue={athlete.training_goals ?? ""} />
      </Field>
      <Field label="Preferences" htmlFor="pf-prefs" optional hint="Schedule, session length, things you enjoy or avoid.">
        <Textarea id="pf-prefs" name="training_preferences" defaultValue={athlete.training_preferences ?? ""} />
      </Field>
      <Field label="Equipment you can use" htmlFor="pf-eq" optional hint="Comma-separated">
        <Input id="pf-eq" name="equipment" defaultValue={athlete.equipment.join(", ")} />
      </Field>
      <Field label="Limitations or restrictions" htmlFor="pf-lim" optional hint="Share only what you're comfortable sharing. Talk to a medical professional about pain or injury.">
        <Textarea id="pf-lim" name="limitations" defaultValue={athlete.limitations ?? ""} />
      </Field>
      <Field label="Phone" htmlFor="pf-phone" optional>
        <Input id="pf-phone" name="phone" type="tel" defaultValue={athlete.phone ?? ""} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Save preferences</SubmitButton>
    </form>
  );
}
