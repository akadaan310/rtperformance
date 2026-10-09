"use client";
import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { startMyAdhocWorkoutAction } from "@/app/t/[slug]/athlete/actions";

/** Lets an athlete record a workout that wasn't on their schedule. */
export function AdhocWorkout({ slug, exercises }: { slug: string; exercises: { id: string; name: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(startMyAdhocWorkoutAction, null);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const list = exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => dialog.current?.showModal()}>
        <Plus className="size-4" aria-hidden /> Log an extra workout
      </Button>
      <dialog ref={dialog} aria-labelledby="adhoc-title" className="m-auto w-[min(94vw,30rem)] rounded-sm border border-ink-600 bg-ink-850 p-0 text-ivory-100 backdrop:bg-black/70">
        <form action={action} className="space-y-4 p-6">
          <h2 id="adhoc-title" className="display-tight text-2xl text-ivory-50">
            Extra workout
          </h2>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="exercise_ids" value={chosen.join(",")} />
          <Field label="Title" htmlFor="adhoc-t">
            <Input id="adhoc-t" name="title" defaultValue="Workout" />
          </Field>
          <Field label="Exercises" htmlFor="adhoc-q">
            <Input id="adhoc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </Field>
          <ul className="scrollbar-thin max-h-52 space-y-1 overflow-y-auto">
            {list.map((e) => (
              <li key={e.id}>
                <Checkbox checked={chosen.includes(e.id)} onChange={(ev) => setChosen((c) => (ev.target.checked ? [...c, e.id] : c.filter((x) => x !== e.id)))} label={e.name} />
              </li>
            ))}
          </ul>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <SubmitButton disabled={!chosen.length}>Start ({chosen.length})</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
