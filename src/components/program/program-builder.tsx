"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/submit-button";
import { builderAction, type BuilderOp } from "@/app/w/[slug]/programs/actions";
import { describeLoad, formatRest } from "@/lib/program-format";
import type { SessionWithExercises } from "@/lib/services/programs";
import type { Exercise } from "@/lib/types";

type Option = Pick<Exercise, "id" | "name" | "category" | "equipment" | "default_sets" | "default_reps" | "default_rest_seconds" | "default_tempo" | "org_id">;
type Pex = SessionWithExercises["exercises"][number];

export function ProgramBuilder({ slug, programId, versionId, sessions, exercises, weeks, sessionsPerWeek }: { slug: string; programId: string; versionId: string; sessions: SessionWithExercises[]; exercises: Option[]; weeks: number; sessionsPerWeek: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function run(op: BuilderOp, key: string, after?: () => void) {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const res = await builderAction(slug, programId, op);
      setBusy(null);
      if (!res?.ok) {
        setError(res?.fieldErrors ? `${res.error} ${Object.entries(res.fieldErrors).map(([k, v]) => `${k}: ${v}`).join("; ")}` : (res?.error ?? "Something went wrong."));
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const nextSlot = useMemo(() => {
    const last = sessions.at(-1);
    if (!last) return { week: 1, day: 1 };
    return last.day_number >= sessionsPerWeek ? { week: Math.min(last.week_number + 1, weeks), day: 1 } : { week: last.week_number, day: last.day_number + 1 };
  }, [sessions, sessionsPerWeek, weeks]);

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="sticky top-20 z-20 rounded-xs border border-signal-600/50 bg-ink-900 px-4 py-3 text-sm text-signal-400 shadow-lift">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-3 text-xs underline">
            Dismiss
          </button>
        </p>
      )}
      {sessions.length === 0 && (
        <div className="rounded-xs border border-dashed border-ink-600 p-6 text-center text-sm text-stone-400">Start by adding the first session. Each session is a training day (Day 1, Day 2…) within a week.</div>
      )}
      {sessions.map((s, i) => (
        <SessionCard
          key={s.id}
          session={s}
          first={i === 0}
          last={i === sessions.length - 1}
          exercises={exercises}
          busy={busy}
          pending={pending}
          run={run}
          weeks={weeks}
        />
      ))}
      <AddSession nextSlot={nextSlot} weeks={weeks} onAdd={(input) => run({ type: "addSession", versionId, input }, "add-session")} pending={busy === "add-session"} />
    </div>
  );
}

function SessionCard({ session, first, last, exercises, busy, pending, run, weeks }: { session: SessionWithExercises; first: boolean; last: boolean; exercises: Option[]; busy: string | null; pending: boolean; run: (op: BuilderOp, key: string, after?: () => void) => void; weeks: number }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby={`s-${session.id}`} className="surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-700 px-4 py-3 sm:px-5">
        {editing ? (
          <SessionMetaForm
            initial={session}
            weeks={weeks}
            onCancel={() => setEditing(false)}
            onSave={(input) => run({ type: "updateSession", sessionId: session.id, input }, `s-${session.id}`, () => setEditing(false))}
            pending={busy === `s-${session.id}`}
          />
        ) : (
          <>
            <div className="min-w-0">
              <p className="eyebrow">
                Week {session.week_number} · Day {session.day_number}
                {session.estimated_minutes ? ` · ~${session.estimated_minutes} min` : ""}
              </p>
              <h3 id={`s-${session.id}`} className="display-tight mt-1 text-xl text-ivory-50">
                {session.name}
              </h3>
              {session.focus && <p className="text-xs text-stone-400">{session.focus}</p>}
              {session.notes && <p className="mt-1 max-w-2xl text-xs italic text-stone-400">{session.notes}</p>}
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Move session earlier" disabled={first || pending} onClick={() => run({ type: "moveSession", sessionId: session.id, direction: "up" }, `m-${session.id}`)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label="Move session later" disabled={last || pending} onClick={() => run({ type: "moveSession", sessionId: session.id, direction: "down" }, `m-${session.id}`)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton label="Edit session" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton
                label="Delete session"
                danger
                onClick={() => {
                  if (window.confirm(`Delete "${session.name}" and its ${session.exercises.length} exercises from this draft?`)) run({ type: "removeSession", sessionId: session.id }, `d-${session.id}`);
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </>
        )}
      </header>
      <ol className="divide-y divide-ink-800">
        {session.exercises.map((pe, i) => (
          <PrescriptionRow key={pe.id} pe={pe} first={i === 0} last={i === session.exercises.length - 1} exercises={exercises} run={run} busy={busy} pending={pending} />
        ))}
      </ol>
      <div className="border-t border-ink-800 px-4 py-3 sm:px-5">
        {adding ? (
          <ExercisePicker
            exercises={exercises}
            onCancel={() => setAdding(false)}
            onPick={(ex) =>
              run(
                {
                  type: "addExercise",
                  sessionId: session.id,
                  input: { exercise_id: ex.id, sets: ex.default_sets ?? 3, reps: ex.default_reps ?? "8-10", load_type: "none", rest_seconds: ex.default_rest_seconds ?? 90, tempo: ex.default_tempo ?? null },
                },
                `a-${session.id}`,
                () => setAdding(false),
              )
            }
            pending={busy === `a-${session.id}`}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add exercise
          </Button>
        )}
      </div>
    </section>
  );
}

function PrescriptionRow({ pe, first, last, exercises, run, busy, pending }: { pe: Pex; first: boolean; last: boolean; exercises: Option[]; run: (op: BuilderOp, key: string, after?: () => void) => void; busy: string | null; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const load = describeLoad(pe.load_type, pe.load_value, pe.load_unit);
  const subs = pe.substitution_ids.map((id) => exercises.find((e) => e.id === id)?.name).filter(Boolean);
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="group min-w-0 flex-1 text-left">
          <span className="flex items-baseline gap-2">
            {pe.block_label && <span className="text-xs font-semibold text-accent">{pe.block_label}</span>}
            <span className="text-sm font-medium text-ivory-50 group-hover:text-accent">{pe.exercise.name}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 text-stone-500 transition-transform", open && "rotate-180")} aria-hidden />
          </span>
          <span className="mt-0.5 block text-xs text-stone-400" data-numeric>
            {pe.sets} × {pe.reps}
            {load ? ` · ${load}` : ""}
            {pe.rpe_target ? ` · RPE ${pe.rpe_target}` : ""}
            {pe.tempo ? ` · tempo ${pe.tempo}` : ""}
            {pe.rest_seconds != null ? ` · rest ${formatRest(pe.rest_seconds)}` : ""}
          </span>
          {(pe.progression || subs.length > 0) && (
            <span className="mt-0.5 block text-xs text-stone-500">
              {pe.progression}
              {pe.progression && subs.length ? " · " : ""}
              {subs.length ? `Subs: ${subs.join(", ")}` : ""}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={`Move ${pe.exercise.name} up`} disabled={first || pending} onClick={() => run({ type: "moveExercise", programExerciseId: pe.id, direction: "up" }, `mx-${pe.id}`)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label={`Move ${pe.exercise.name} down`} disabled={last || pending} onClick={() => run({ type: "moveExercise", programExerciseId: pe.id, direction: "down" }, `mx-${pe.id}`)}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label={`Remove ${pe.exercise.name}`} danger onClick={() => run({ type: "removeExercise", programExerciseId: pe.id }, `rx-${pe.id}`)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      {open && <PrescriptionForm pe={pe} exercises={exercises} pending={busy === `ux-${pe.id}`} onSave={(input) => run({ type: "updateExercise", programExerciseId: pe.id, input }, `ux-${pe.id}`, () => setOpen(false))} />}
    </li>
  );
}

function PrescriptionForm({ pe, exercises, onSave, pending }: { pe: Pex; exercises: Option[]; onSave: (input: Record<string, unknown>) => void; pending: boolean }) {
  const [v, setV] = useState({
    sets: String(pe.sets),
    reps: pe.reps,
    load_type: pe.load_type,
    load_value: pe.load_value?.toString() ?? "",
    load_unit: pe.load_unit ?? "lb",
    rest_seconds: pe.rest_seconds?.toString() ?? "",
    tempo: pe.tempo ?? "",
    rpe_target: pe.rpe_target?.toString() ?? "",
    block_label: pe.block_label ?? "",
    progression: pe.progression ?? "",
    notes: pe.notes ?? "",
    substitution_ids: pe.substitution_ids,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const id = (k: string) => `${pe.id}-${k}`;
  const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400";
  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3 rounded-xs border border-ink-700 bg-ink-950/50 p-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          exercise_id: pe.exercise_id,
          sets: v.sets,
          reps: v.reps,
          load_type: v.load_type,
          load_value: v.load_value === "" ? null : v.load_value,
          load_unit: v.load_type === "weight" ? v.load_unit : null,
          rest_seconds: v.rest_seconds === "" ? null : v.rest_seconds,
          tempo: v.tempo,
          rpe_target: v.rpe_target === "" ? null : v.rpe_target,
          block_label: v.block_label,
          progression: v.progression,
          notes: v.notes,
          substitution_ids: v.substitution_ids,
        });
      }}
    >
      <div>
        <label htmlFor={id("sets")} className={lbl}>Sets</label>
        <Input id={id("sets")} type="number" min={1} max={20} value={v.sets} onChange={set("sets")} required />
      </div>
      <div>
        <label htmlFor={id("reps")} className={lbl}>Reps</label>
        <Input id={id("reps")} value={v.reps} onChange={set("reps")} required placeholder="8-10" />
      </div>
      <div>
        <label htmlFor={id("load_type")} className={lbl}>Load</label>
        <Select id={id("load_type")} value={v.load_type} onChange={set("load_type")}>
          <option value="none">Coach's call</option>
          <option value="weight">Fixed weight</option>
          <option value="percent_1rm">% of 1RM</option>
          <option value="rpe">By RPE</option>
          <option value="bodyweight">Bodyweight</option>
        </Select>
      </div>
      <div>
        <label htmlFor={id("load_value")} className={lbl}>{v.load_type === "percent_1rm" ? "Percent" : v.load_type === "rpe" ? "RPE" : "Value"}</label>
        <div className="flex gap-1">
          <Input id={id("load_value")} type="number" step="any" min={0} value={v.load_value} onChange={set("load_value")} disabled={v.load_type === "none" || v.load_type === "bodyweight"} />
          {v.load_type === "weight" && (
            <Select aria-label="Unit" value={v.load_unit} onChange={set("load_unit")} className="w-20">
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </Select>
          )}
        </div>
      </div>
      <div>
        <label htmlFor={id("rest")} className={lbl}>Rest (sec)</label>
        <Input id={id("rest")} type="number" min={0} max={900} value={v.rest_seconds} onChange={set("rest_seconds")} />
      </div>
      <div>
        <label htmlFor={id("tempo")} className={lbl}>Tempo</label>
        <Input id={id("tempo")} value={v.tempo} onChange={set("tempo")} placeholder="3010" maxLength={4} />
      </div>
      <div>
        <label htmlFor={id("rpe")} className={lbl}>Target RPE</label>
        <Input id={id("rpe")} type="number" min={1} max={10} step="0.5" value={v.rpe_target} onChange={set("rpe_target")} />
      </div>
      <div>
        <label htmlFor={id("block")} className={lbl}>Block</label>
        <Input id={id("block")} value={v.block_label} onChange={set("block_label")} placeholder="A1" maxLength={3} />
      </div>
      <div className="col-span-2">
        <label htmlFor={id("prog")} className={lbl}>Progression</label>
        <Input id={id("prog")} value={v.progression} onChange={set("progression")} placeholder="+5 lb per week when all reps are clean" />
      </div>
      <div className="col-span-2">
        <label htmlFor={id("subs")} className={lbl}>Substitutions</label>
        <Select
          id={id("subs")}
          value=""
          onChange={(e) => e.target.value && setV((s) => ({ ...s, substitution_ids: [...new Set([...s.substitution_ids, e.target.value])].slice(0, 5) }))}
        >
          <option value="">Add an alternative…</option>
          {exercises
            .filter((e) => e.id !== pe.exercise_id && !v.substitution_ids.includes(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </Select>
        {v.substitution_ids.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {v.substitution_ids.map((sid) => (
              <li key={sid} className="inline-flex items-center gap-1 rounded-xs border border-ink-600 px-2 py-0.5 text-xs text-ivory-200">
                {exercises.find((e) => e.id === sid)?.name ?? "Exercise"}
                <button type="button" aria-label="Remove substitution" onClick={() => setV((s) => ({ ...s, substitution_ids: s.substitution_ids.filter((x) => x !== sid) }))}>
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="col-span-2 sm:col-span-4">
        <label htmlFor={id("notes")} className={lbl}>Coach notes</label>
        <Textarea id={id("notes")} value={v.notes} onChange={set("notes")} className="min-h-14" />
      </div>
      <div className="col-span-2 sm:col-span-4">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />} Save prescription
        </Button>
      </div>
    </form>
  );
}

function ExercisePicker({ exercises, onPick, onCancel, pending }: { exercises: Option[]; onPick: (e: Option) => void; onCancel: () => void; pending: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const results = exercises.filter((e) => (!q || e.name.toLowerCase().includes(q.toLowerCase())) && (!cat || e.category === cat)).slice(0, 40);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search exercises</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" aria-hidden />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="pl-9" />
        </label>
        <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className="w-36">
          <option value="">All</option>
          {["squat", "hinge", "push", "pull", "lunge", "carry", "core", "conditioning", "mobility", "power", "accessory"].map((c) => (
            <option key={c} value={c}>
              {c[0]!.toUpperCase() + c.slice(1)}
            </option>
          ))}
        </Select>
        <Button variant="ghost" size="md" onClick={onCancel} aria-label="Close exercise search">
          <X className="size-4" />
        </Button>
      </div>
      <ul className="scrollbar-thin max-h-64 divide-y divide-ink-800 overflow-y-auto rounded-xs border border-ink-700">
        {results.map((e) => (
          <li key={e.id}>
            <button type="button" disabled={pending} onClick={() => onPick(e)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-800 disabled:opacity-50">
              <span className="text-ivory-100">{e.name}</span>
              <span className="text-xs text-stone-500">
                {e.category} · {e.equipment.slice(0, 2).join(", ")}
                {e.org_id ? " · custom" : ""}
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-4 text-sm text-stone-500">No exercises match. Add a custom one in the exercise library.</li>}
      </ul>
    </div>
  );
}

function SessionMetaForm({ initial, weeks, onSave, onCancel, pending }: { initial?: Partial<SessionWithExercises>; weeks: number; onSave: (input: Record<string, unknown>) => void; onCancel?: () => void; pending: boolean }) {
  const [v, setV] = useState({
    name: initial?.name ?? "",
    week_number: String(initial?.week_number ?? 1),
    day_number: String(initial?.day_number ?? 1),
    focus: initial?.focus ?? "",
    notes: initial?.notes ?? "",
    estimated_minutes: initial?.estimated_minutes?.toString() ?? "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400";
  const uid = initial?.id ?? "new";
  return (
    <form
      className="grid w-full grid-cols-2 gap-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...v, estimated_minutes: v.estimated_minutes || null });
      }}
    >
      <div className="col-span-2 sm:col-span-3">
        <label htmlFor={`${uid}-name`} className={lbl}>Session name</label>
        <Input id={`${uid}-name`} value={v.name} onChange={set("name")} required placeholder="Lower strength" />
      </div>
      <div>
        <label htmlFor={`${uid}-week`} className={lbl}>Week</label>
        <Select id={`${uid}-week`} value={v.week_number} onChange={set("week_number")}>
          {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor={`${uid}-day`} className={lbl}>Day</label>
        <Select id={`${uid}-day`} value={v.day_number} onChange={set("day_number")}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor={`${uid}-min`} className={lbl}>Minutes</label>
        <Input id={`${uid}-min`} type="number" min={5} max={300} value={v.estimated_minutes} onChange={set("estimated_minutes")} />
      </div>
      <div className="col-span-2 sm:col-span-3">
        <label htmlFor={`${uid}-focus`} className={lbl}>Focus</label>
        <Input id={`${uid}-focus`} value={v.focus} onChange={set("focus")} placeholder="Squat pattern, unilateral work" />
      </div>
      <div className="col-span-2 sm:col-span-3">
        <label htmlFor={`${uid}-notes`} className={lbl}>Session notes</label>
        <Input id={`${uid}-notes`} value={v.notes} onChange={set("notes")} placeholder="Warm-up, intent, cues" />
      </div>
      <div className="col-span-2 flex gap-2 sm:col-span-6">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner />} {initial?.id ? "Save session" : "Add session"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function AddSession({ nextSlot, weeks, onAdd, pending }: { nextSlot: { week: number; day: number }; weeks: number; onAdd: (input: Record<string, unknown>) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add session
      </Button>
    );
  return (
    <div className="surface p-4">
      <SessionMetaForm
        key={`${nextSlot.week}-${nextSlot.day}`}
        initial={{ week_number: nextSlot.week, day_number: nextSlot.day }}
        weeks={weeks}
        pending={pending}
        onCancel={() => setOpen(false)}
        onSave={(input) => {
          onAdd(input);
          setOpen(false);
        }}
      />
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex size-8 items-center justify-center rounded-xs text-stone-400 transition-colors disabled:opacity-30", danger ? "hover:bg-signal-600/15 hover:text-signal-400" : "hover:bg-ink-800 hover:text-ivory-50")}
    >
      {children}
    </button>
  );
}
