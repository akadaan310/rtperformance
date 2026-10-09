"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/submit-button";
import { completeWorkoutAction, deleteSetAction, discardWorkoutAction, reopenWorkoutAction, saveSetAction, setExerciseCompletedAction } from "@/app/actions/workouts";
import type { WorkoutDetail } from "@/lib/services/workouts";
import type { PlannedPrescription } from "@/lib/types";

interface SetRow {
  set_number: number;
  reps: string;
  weight: string;
  unit: "lb" | "kg";
  rpe: string;
  seconds: string;
  distance: string;
  saved: boolean;
  saving: boolean;
  error?: string;
}

function describePlanned(p: PlannedPrescription): string | null {
  if (!p.sets && !p.reps) return null;
  const parts = [`${p.sets ?? "?"} × ${p.reps ?? "?"}`];
  if (p.load_type === "weight" && p.load_value != null) parts.push(`${p.load_value} ${p.load_unit ?? "lb"}`);
  if (p.load_type === "percent_1rm" && p.load_value != null) parts.push(`${p.load_value}% 1RM`);
  if (p.load_type === "rpe" && p.load_value != null) parts.push(`RPE ${p.load_value}`);
  if (p.load_type === "bodyweight") parts.push("bodyweight");
  if (p.rpe_target) parts.push(`RPE ${p.rpe_target}`);
  if (p.tempo) parts.push(`tempo ${p.tempo}`);
  if (p.rest_seconds) parts.push(`rest ${Math.floor(p.rest_seconds / 60)}:${String(p.rest_seconds % 60).padStart(2, "0")}`);
  return parts.join(" · ");
}

function initialRows(ex: WorkoutDetail["exercises"][number]): SetRow[] {
  const count = Math.max(ex.planned.sets ?? 0, ex.sets.length, 1);
  return Array.from({ length: count }, (_, i) => {
    const s = ex.sets.find((x) => x.set_number === i + 1);
    return {
      set_number: i + 1,
      reps: s?.reps?.toString() ?? "",
      weight: s?.weight?.toString() ?? "",
      unit: s?.weight_unit ?? (ex.planned.load_unit as "lb" | "kg" | undefined) ?? "lb",
      rpe: s?.rpe?.toString() ?? "",
      seconds: s?.duration_seconds?.toString() ?? "",
      distance: s?.distance_m?.toString() ?? "",
      saved: Boolean(s),
      saving: false,
    };
  });
}

export function WorkoutLogger({ slug, detail, path, doneHref, actorLabel }: { slug: string; detail: WorkoutDetail; path: string; doneHref: string; actorLabel: string }) {
  const router = useRouter();
  const completed = detail.log.status === "completed";
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() => Object.fromEntries(detail.exercises.map((e) => [e.id, initialRows(e)])));
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(detail.exercises.map((e) => [e.id, e.completed])));
  const [effort, setEffort] = useState<number | null>(detail.log.perceived_effort);
  const [recovery, setRecovery] = useState<number | null>(detail.log.recovery_rating);
  const [notes, setNotes] = useState(detail.log.notes ?? "");
  const [finishError, setFinishError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (exId: string, idx: number, patch: Partial<SetRow>) =>
    setRows((r) => ({ ...r, [exId]: r[exId]!.map((row, i) => (i === idx ? { ...row, ...patch } : row)) }));

  async function save(ex: WorkoutDetail["exercises"][number], idx: number) {
    const row = rows[ex.id]![idx]!;
    const m = ex.exercise.measurement;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    if (m === "reps_weight" && !row.reps) return update(ex.id, idx, { error: "Enter reps" });
    if (m === "reps" && !row.reps) return update(ex.id, idx, { error: "Enter reps" });
    if (m === "time" && !row.seconds) return update(ex.id, idx, { error: "Enter seconds" });
    if (m === "distance" && !row.distance) return update(ex.id, idx, { error: "Enter meters" });
    update(ex.id, idx, { saving: true, error: undefined });
    const res = await saveSetAction(slug, {
      log_exercise_id: ex.id,
      set_number: row.set_number,
      reps: num(row.reps),
      weight: num(row.weight),
      weight_unit: row.unit,
      rpe: num(row.rpe),
      duration_seconds: num(row.seconds),
      distance_m: num(row.distance),
    });
    update(ex.id, idx, { saving: false, saved: Boolean(res?.ok), error: res?.ok ? undefined : (res?.error ?? "Not saved") });
  }

  async function remove(ex: WorkoutDetail["exercises"][number], idx: number) {
    const row = rows[ex.id]![idx]!;
    if (row.saved) {
      const res = await deleteSetAction(slug, { log_exercise_id: ex.id, set_number: row.set_number });
      if (!res?.ok) return update(ex.id, idx, { error: res?.error ?? "Could not remove" });
    }
    setRows((r) => ({ ...r, [ex.id]: r[ex.id]!.filter((_, i) => i !== idx).map((x, i) => (x.set_number === i + 1 ? x : { ...x, set_number: i + 1, saved: false })) }));
  }

  function addSet(exId: string) {
    setRows((r) => {
      const list = r[exId]!;
      const last = list.at(-1);
      return { ...r, [exId]: [...list, { set_number: list.length + 1, reps: "", weight: last?.weight ?? "", unit: last?.unit ?? "lb", rpe: "", seconds: "", distance: "", saved: false, saving: false }] };
    });
  }

  async function toggleDone(exId: string) {
    const next = !done[exId];
    setDone((d) => ({ ...d, [exId]: next }));
    const res = await setExerciseCompletedAction(slug, exId, next);
    if (!res?.ok) setDone((d) => ({ ...d, [exId]: !next }));
  }

  const savedSets = Object.values(rows).flat().filter((r) => r.saved).length;

  return (
    <div className="space-y-4">
      {detail.exercises.length === 0 && <p className="text-sm text-stone-500">This workout has no exercises.</p>}
      {detail.exercises.map((ex, exIdx) => {
        const planned = describePlanned(ex.planned);
        const m = ex.exercise.measurement;
        const list = rows[ex.id]!;
        return (
          <section key={ex.id} aria-labelledby={`ex-${ex.id}`} className={cn("surface overflow-hidden transition-colors", done[ex.id] && "border-accent/40")}>
            <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
              <div className="min-w-0">
                <p className="eyebrow">
                  {ex.planned.block_label ?? String(exIdx + 1).padStart(2, "0")}
                  {ex.planned.notes ? " · coach note" : ""}
                </p>
                <h3 id={`ex-${ex.id}`} className="display-tight mt-1 text-xl text-ivory-50">
                  {ex.exercise.name}
                </h3>
                {planned ? (
                  <p className="mt-1 text-xs text-stone-400">
                    <span className="font-semibold uppercase tracking-[0.12em] text-stone-500">Planned</span> {planned}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-stone-500">Unprogrammed — record what you did.</p>
                )}
                {ex.planned.notes && <p className="mt-1 text-xs italic text-gold-300">{ex.planned.notes}</p>}
              </div>
              {!completed && (
                <button
                  type="button"
                  onClick={() => toggleDone(ex.id)}
                  aria-pressed={done[ex.id]}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xs border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                    done[ex.id] ? "border-accent bg-accent text-accent-fg" : "border-ink-600 text-stone-400 hover:text-ivory-100",
                  )}
                >
                  <Check className="size-3.5" aria-hidden /> {done[ex.id] ? "Done" : "Mark done"}
                </button>
              )}
            </header>

            {(ex.exercise.cues.length > 0 || ex.exercise.instructions || ex.exercise.description) && (
              <details className="group mx-4 mt-3 rounded-xs border border-ink-700 sm:mx-5">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400 hover:text-ivory-100">
                  Instructions & cues
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-2 border-t border-ink-700 px-3 py-3 text-sm text-stone-300">
                  {ex.exercise.description && <p>{ex.exercise.description}</p>}
                  {ex.exercise.instructions && <p className="whitespace-pre-line">{ex.exercise.instructions}</p>}
                  {ex.exercise.cues.length > 0 && (
                    <ul className="list-inside list-disc text-ivory-200">
                      {ex.exercise.cues.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            )}

            <div className="mt-3 overflow-x-auto px-2 pb-3 sm:px-3">
              <table className="w-full text-sm">
                <caption className="sr-only">Sets for {ex.exercise.name}</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
                    <th scope="col" className="w-10 px-2 py-1 text-left font-semibold">Set</th>
                    {(m === "reps_weight" || m === "reps") && <th scope="col" className="px-1 py-1 text-left font-semibold">Reps</th>}
                    {m === "reps_weight" && <th scope="col" className="px-1 py-1 text-left font-semibold">Weight</th>}
                    {m === "time" && <th scope="col" className="px-1 py-1 text-left font-semibold">Seconds</th>}
                    {m === "distance" && <th scope="col" className="px-1 py-1 text-left font-semibold">Meters</th>}
                    <th scope="col" className="px-1 py-1 text-left font-semibold">RPE</th>
                    <th scope="col" className="w-20 px-1 py-1">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row, idx) => {
                    const cell = "h-10 w-full min-w-14 rounded-xs border bg-ink-950 px-2 text-sm text-ivory-50 placeholder:text-stone-600 focus:border-accent focus:outline-none disabled:opacity-70";
                    const border = row.saved ? "border-accent/40" : "border-ink-600";
                    const label = `${ex.exercise.name} set ${row.set_number}`;
                    return (
                      <tr key={idx} className="align-top">
                        <td className="px-2 py-1.5">
                          <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold", row.saved ? "bg-accent text-accent-fg" : "bg-ink-800 text-stone-400")}>{row.set_number}</span>
                        </td>
                        {(m === "reps_weight" || m === "reps") && (
                          <td className="px-1 py-1.5">
                            <input aria-label={`${label} reps`} inputMode="numeric" type="number" min={0} disabled={completed} value={row.reps} placeholder={ex.planned.reps ?? ""} onChange={(e) => update(ex.id, idx, { reps: e.target.value, saved: false })} className={cn(cell, border)} />
                          </td>
                        )}
                        {m === "reps_weight" && (
                          <td className="px-1 py-1.5">
                            <div className="flex gap-1">
                              <input aria-label={`${label} weight`} inputMode="decimal" type="number" min={0} step="any" disabled={completed} value={row.weight} placeholder={ex.planned.load_type === "weight" && ex.planned.load_value != null ? String(ex.planned.load_value) : ""} onChange={(e) => update(ex.id, idx, { weight: e.target.value, saved: false })} className={cn(cell, border)} />
                              <button type="button" disabled={completed} onClick={() => update(ex.id, idx, { unit: row.unit === "lb" ? "kg" : "lb", saved: false })} className="h-10 rounded-xs border border-ink-600 px-2 text-[11px] font-semibold uppercase text-stone-400 hover:text-ivory-100" aria-label={`${label} unit: ${row.unit}. Switch unit`}>
                                {row.unit}
                              </button>
                            </div>
                          </td>
                        )}
                        {m === "time" && (
                          <td className="px-1 py-1.5">
                            <input aria-label={`${label} seconds`} inputMode="numeric" type="number" min={0} disabled={completed} value={row.seconds} placeholder={ex.planned.reps ?? ""} onChange={(e) => update(ex.id, idx, { seconds: e.target.value, saved: false })} className={cn(cell, border)} />
                          </td>
                        )}
                        {m === "distance" && (
                          <td className="px-1 py-1.5">
                            <input aria-label={`${label} meters`} inputMode="decimal" type="number" min={0} step="any" disabled={completed} value={row.distance} placeholder={ex.planned.reps ?? ""} onChange={(e) => update(ex.id, idx, { distance: e.target.value, saved: false })} className={cn(cell, border)} />
                          </td>
                        )}
                        <td className="px-1 py-1.5">
                          <input aria-label={`${label} RPE`} inputMode="decimal" type="number" min={1} max={10} step="0.5" disabled={completed} value={row.rpe} placeholder={ex.planned.rpe_target ? String(ex.planned.rpe_target) : "—"} onChange={(e) => update(ex.id, idx, { rpe: e.target.value, saved: false })} className={cn(cell, border, "max-w-20")} />
                        </td>
                        <td className="px-1 py-1.5">
                          {!completed && (
                            <div className="flex gap-1">
                              <button type="button" onClick={() => save(ex, idx)} disabled={row.saving} aria-label={`Save ${label}`} className={cn("inline-flex size-10 items-center justify-center rounded-xs border", row.saved ? "border-accent bg-accent/15 text-accent" : "border-ink-600 text-stone-300 hover:border-accent hover:text-accent")}>
                                {row.saving ? <Spinner /> : <Check className="size-4" aria-hidden />}
                              </button>
                              <button type="button" onClick={() => remove(ex, idx)} aria-label={`Remove ${label}`} className="inline-flex size-10 items-center justify-center rounded-xs text-stone-600 hover:text-signal-400">
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            </div>
                          )}
                          {row.error && (
                            <p role="alert" className="mt-1 text-[11px] text-signal-400">
                              {row.error}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!completed && (
                <button type="button" onClick={() => addSet(ex.id)} className="ml-2 mt-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400 hover:text-accent">
                  <Plus className="size-3.5" aria-hidden /> Add set
                </button>
              )}
            </div>
          </section>
        );
      })}

      <section aria-labelledby="finish-title" className="surface-raised p-5">
        <h2 id="finish-title" className="display-tight text-2xl text-ivory-50">
          {completed ? "Session recorded" : "Finish session"}
        </h2>
        {completed ? (
          <div className="mt-3 space-y-3 text-sm text-stone-300">
            <p>
              Completed{detail.log.completed_at ? ` ${new Date(detail.log.completed_at).toLocaleString()}` : ""}. {savedSets} sets recorded
              {detail.log.perceived_effort ? ` · effort ${detail.log.perceived_effort}/10` : ""}
              {detail.log.recovery_rating ? ` · recovery ${detail.log.recovery_rating}/5` : ""}.
            </p>
            {detail.log.notes && <p className="whitespace-pre-line text-ivory-200">{detail.log.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await reopenWorkoutAction(slug, detail.log.id, path);
                    router.refresh();
                  })
                }
              >
                Edit this workout
              </Button>
              <Button variant="ghost" size="sm" onClick={() => router.push(doneHref)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">Session effort (RPE)</legend>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" aria-pressed={effort === n} onClick={() => setEffort(effort === n ? null : n)} className={cn("h-10 rounded-xs border text-sm font-semibold", effort === n ? "border-accent bg-accent text-accent-fg" : "border-ink-600 text-stone-300 hover:border-stone-400")}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 flex justify-between text-[11px] text-stone-500">
                <span>Easy</span>
                <span>Maximal</span>
              </p>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">How recovered did you feel going in?</legend>
              <div className="grid grid-cols-5 gap-1">
                {["Poor", "Low", "OK", "Good", "Great"].map((l, i) => (
                  <button key={l} type="button" aria-pressed={recovery === i + 1} onClick={() => setRecovery(recovery === i + 1 ? null : i + 1)} className={cn("h-10 rounded-xs border text-xs font-semibold", recovery === i + 1 ? "border-accent bg-accent text-accent-fg" : "border-ink-600 text-stone-300 hover:border-stone-400")}>
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="workout-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">
                Notes
              </label>
              <Textarea id="workout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything your coach should know?" />
            </div>
            {finishError && (
              <p role="alert" className="text-sm text-signal-400">
                {finishError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setFinishError(null);
                    const res = await completeWorkoutAction(slug, { log_id: detail.log.id, perceived_effort: effort, recovery_rating: recovery, notes }, path);
                    if (!res?.ok) setFinishError(res?.error ?? "Could not save");
                    else router.refresh();
                  })
                }
              >
                {pending ? <Spinner /> : <Check className="size-4" aria-hidden />} Complete workout
              </Button>
              <span className="text-xs text-stone-500">
                {savedSets} set{savedSets === 1 ? "" : "s"} saved · logging as {actorLabel}
              </span>
              <Button
                variant="quiet"
                size="sm"
                className="ml-auto"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Discard this workout and all its recorded sets?")) return;
                  startTransition(async () => {
                    const res = await discardWorkoutAction(slug, detail.log.id);
                    if (res?.ok) router.push(doneHref);
                    else setFinishError(res?.error ?? "Could not discard");
                  });
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
      </section>
      {completed && <Badge tone="success">Saved to history</Badge>}
    </div>
  );
}
