import { formatRest, type ProgramCardSession } from "@/lib/program-format";

/** Read-only rendering of a program's sessions — used by the builder preview and The Tech Guy's cards. */
export function ProgramPreview({ sessions, compact = false }: { sessions: ProgramCardSession[]; compact?: boolean }) {
  if (!sessions.length) return <p className="text-sm text-stone-500">No sessions yet.</p>;
  const weeks = [...new Set(sessions.map((s) => s.week))].sort((a, b) => a - b);
  return (
    <div className="space-y-6">
      {weeks.map((w) => (
        <section key={w} aria-label={`Week ${w}`}>
          {weeks.length > 1 && <p className="eyebrow mb-2">Week {w}</p>}
          <div className={compact ? "space-y-3" : "grid gap-4 md:grid-cols-2"}>
            {sessions
              .filter((s) => s.week === w)
              .map((s, i) => (
                <article key={`${w}-${i}`} className="rounded-xs border border-ink-700 bg-ink-950/60">
                  <header className="border-b border-ink-700 px-4 py-3">
                    <p className="eyebrow">Day {s.day}</p>
                    <h4 className="display-tight mt-1 text-lg text-ivory-50">{s.name}</h4>
                    {s.focus && <p className="text-xs text-stone-400">{s.focus}</p>}
                  </header>
                  <ol className="divide-y divide-ink-800">
                    {s.exercises.map((e, j) => (
                      <li key={j} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                        <span className="min-w-0">
                          {e.block && <span className="mr-2 text-xs font-semibold text-accent">{e.block}</span>}
                          <span className="text-ivory-100">{e.name}</span>
                          {!compact && e.progression && <span className="block text-xs text-stone-500">{e.progression}</span>}
                        </span>
                        <span className="shrink-0 text-right text-xs text-stone-300" data-numeric>
                          {e.sets} × {e.reps}
                          {e.load ? ` · ${e.load}` : ""}
                          {e.rpe ? ` · RPE ${e.rpe}` : ""}
                          {!compact && (e.tempo || e.rest) ? (
                            <span className="block text-stone-500">
                              {[e.tempo && `tempo ${e.tempo}`, e.rest != null && `rest ${formatRest(e.rest)}`].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {!compact && s.notes && <p className="border-t border-ink-800 px-4 py-2 text-xs italic text-stone-400">{s.notes}</p>}
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
