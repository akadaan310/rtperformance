import type { Metadata } from "next";
import { AdhocWorkout } from "@/components/athlete/adhoc-workout";
import { HistoryList } from "@/components/progress/history-list";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { listExerciseOptions } from "@/lib/services/programs";
import { listWorkoutHistory } from "@/lib/services/workouts";

export const metadata: Metadata = { title: "History" };

export default async function AthleteHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireAthleteWorkspace(slug);
  const [logs, exercises] = await Promise.all([listWorkoutHistory(ctx, ctx.athleteId, 100), listExerciseOptions(ctx)]);
  const base = `/t/${ctx.org.slug}/athlete`;
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your record</p>
          <h1 className="display mt-2 text-4xl text-ivory-50">History</h1>
        </div>
        <AdhocWorkout slug={ctx.org.slug} exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} />
      </header>
      <HistoryList logs={logs} hrefFor={(id) => `${base}/workout/${id}`} />
    </div>
  );
}
