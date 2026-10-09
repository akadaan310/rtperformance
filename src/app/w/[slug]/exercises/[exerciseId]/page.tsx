import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui/feedback";
import { ExerciseForm } from "@/components/program/exercise-form";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { formatRest } from "@/lib/program-format";
import { getExercise } from "@/lib/services/exercises";
import { listExerciseOptions } from "@/lib/services/programs";

export const metadata: Metadata = { title: "Exercise" };

export default async function ExercisePage({ params, searchParams }: { params: Promise<{ slug: string; exerciseId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { slug, exerciseId } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const { exercise: e, substitutions, media } = await getExercise(ctx, exerciseId).catch(() => notFound());
  const base = `/w/${ctx.org.slug}/exercises`;
  const custom = e.org_id === ctx.org.id;
  const options = custom ? await listExerciseOptions(ctx) : [];
  return (
    <>
      <Link href={base} className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 hover:text-accent">
        <ArrowLeft className="size-3.5" aria-hidden /> Library
      </Link>
      <PageHeader
        eyebrow={`${e.category} · ${e.difficulty}`}
        title={e.name}
        description={
          <span className="flex flex-wrap gap-2">
            {custom ? <Badge tone="accent">Workspace exercise</Badge> : <Badge>RT Performance library · read-only</Badge>}
            <Badge tone="muted">Recorded as {e.measurement.replace("_", " × ")}</Badge>
          </span>
        }
      />
      {sp.saved && <p role="status" className="-mt-4 mb-6 text-sm text-sage-400">Saved.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Panel title="How to perform it">
            {e.description && <p className="text-sm leading-relaxed text-stone-300">{e.description}</p>}
            {e.instructions && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-300">{e.instructions}</p>}
            {e.cues.length > 0 && (
              <>
                <p className="eyebrow mb-2 mt-5">Coaching cues</p>
                <ul className="space-y-1.5 text-sm text-ivory-100">
                  {e.cues.map((c) => (
                    <li key={c} className="flex gap-3">
                      <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-accent" />
                      {c}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!e.description && !e.instructions && !e.cues.length && <p className="text-sm text-stone-500">No instructions yet.</p>}
          </Panel>
          <Panel title="Details">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="eyebrow">Muscle groups</dt>
                <dd className="mt-1 text-ivory-100">{e.muscle_groups.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow">Equipment</dt>
                <dd className="mt-1 text-ivory-100">{e.equipment.join(", ") || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="eyebrow">Default prescription</dt>
                <dd className="mt-1 text-ivory-100">
                  {[e.default_sets && e.default_reps ? `${e.default_sets} × ${e.default_reps}` : null, e.default_tempo && `tempo ${e.default_tempo}`, e.default_rest_seconds != null && `rest ${formatRest(e.default_rest_seconds)}`, e.default_rpe && `RPE ${e.default_rpe}`]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Substitutions">
            {substitutions.length ? (
              <ul className="flex flex-wrap gap-2">
                {substitutions.map((s) => (
                  <li key={s.id}>
                    <Link href={`${base}/${s.id}`} className="inline-block rounded-xs border border-ink-600 px-2.5 py-1 text-sm text-ivory-100 hover:border-accent hover:text-accent">
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">No substitutions recorded.</p>
            )}
          </Panel>
          {media.length > 0 && (
            <Panel title="Media">
              <ul className="space-y-2 text-sm">
                {media.map((m) => (
                  <li key={m.id}>
                    {m.external_url ? (
                      <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">
                        {m.caption ?? m.kind} <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-stone-300">{m.caption ?? m.kind}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        {custom ? (
          <Panel title="Edit exercise" className="h-fit">
            <ExerciseForm slug={ctx.org.slug} exercise={e} options={options.map((o) => ({ id: o.id, name: o.name }))} substitutionIds={substitutions.map((s) => s.id)} />
          </Panel>
        ) : (
          <Panel title="Using this exercise" className="h-fit">
            <p className="text-sm leading-relaxed text-stone-400">
              Library exercises are shared across RT Performance workspaces and can&apos;t be edited. Add it to any program session, or create a workspace version with your own cues from the library page.
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}
