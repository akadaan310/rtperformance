import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { ExerciseForm } from "@/components/program/exercise-form";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { listExerciseOptions } from "@/lib/services/programs";
import { searchExercises } from "@/lib/services/exercises";
import { exerciseCategory } from "@/lib/validation";

export const metadata: Metadata = { title: "Exercise library" };

export default async function ExercisesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; category?: string; equipment?: string; source?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const category = exerciseCategory.safeParse(sp.category).success ? (sp.category as never) : undefined;
  const [results, options] = await Promise.all([searchExercises(ctx, { query: sp.q, category, equipment: sp.equipment || undefined, limit: 100 }), listExerciseOptions(ctx)]);
  const list = results.filter((e) => (sp.source === "custom" ? e.org_id : sp.source === "library" ? !e.org_id : true));
  const base = `/w/${ctx.org.slug}/exercises`;
  return (
    <>
      <PageHeader eyebrow="Library" title="Exercise library" description="Movement definitions — the RT Performance starter library plus your own. These are reference definitions; athlete prescriptions live in programs." />
      <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0">
          <form role="search" aria-label="Filter exercises" className="mb-5 grid gap-2 sm:grid-cols-[1fr_9rem_9rem_9rem_auto]">
            <label className="relative">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" aria-hidden />
              <Input name="q" defaultValue={sp.q} placeholder="Search exercises" className="pl-9" />
            </label>
            <label>
              <span className="sr-only">Category</span>
              <Select name="category" defaultValue={sp.category ?? ""}>
                <option value="">All categories</option>
                {exerciseCategory.options.map((c) => (
                  <option key={c} value={c}>
                    {c[0]!.toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span className="sr-only">Equipment</span>
              <Select name="equipment" defaultValue={sp.equipment ?? ""}>
                <option value="">Any equipment</option>
                {["barbell", "dumbbell", "kettlebell", "bodyweight", "cable", "machine", "band", "bench", "box"].map((e) => (
                  <option key={e} value={e}>
                    {e[0]!.toUpperCase() + e.slice(1)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span className="sr-only">Source</span>
              <Select name="source" defaultValue={sp.source ?? ""}>
                <option value="">All sources</option>
                <option value="library">RT library</option>
                <option value="custom">Workspace</option>
              </Select>
            </label>
            <button type="submit" className={buttonClass("secondary")}>
              Filter
            </button>
          </form>
          {list.length === 0 ? (
            <EmptyState title="No exercises match">Clear the filters or add a custom exercise.</EmptyState>
          ) : (
            <ul className="surface divide-y divide-ink-800">
              {list.map((e) => (
                <li key={e.id}>
                  <Link href={`${base}/${e.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-850">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ivory-50">{e.name}</p>
                      <p className="truncate text-xs text-stone-500">
                        {e.muscle_groups.slice(0, 3).join(", ")}
                        {e.equipment.length ? ` · ${e.equipment.join(", ")}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Badge tone="muted">{e.category}</Badge>
                      {e.org_id ? <Badge tone="accent">Workspace</Badge> : <Badge>RT library</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-500">{list.length} exercises</p>
        </div>
        <Panel title="Add a custom exercise" eyebrow="Workspace library" className="h-fit">
          <ExerciseForm slug={ctx.org.slug} options={options.map((o) => ({ id: o.id, name: o.name }))} />
        </Panel>
      </div>
    </>
  );
}
