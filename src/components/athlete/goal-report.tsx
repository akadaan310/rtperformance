"use client";
import { useActionState } from "react";
import { Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { reportGoalAction } from "@/app/t/[slug]/athlete/actions";

export function GoalReport({ slug, goalId, title, unit, current }: { slug: string; goalId: string; title: string; unit: string | null; current: number | null }) {
  const [state, action] = useActionState(reportGoalAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="goal_id" value={goalId} />
      <label className="min-w-48 flex-1 text-sm text-ivory-100">
        {title}
        <Input name="value" type="number" step="any" required defaultValue={current ?? ""} className="mt-1.5" aria-describedby={`unit-${goalId}`} />
        <span id={`unit-${goalId}`} className="text-xs text-stone-500">
          {unit ?? "value"}
        </span>
      </label>
      <SubmitButton size="sm" variant="secondary">
        Update
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
