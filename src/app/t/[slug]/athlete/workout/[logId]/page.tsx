import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WorkoutLogger } from "@/components/athlete/workout-logger";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { formatDateLong } from "@/lib/dates";
import { getWorkout } from "@/lib/services/workouts";

export const metadata: Metadata = { title: "Workout" };

export default async function AthleteWorkoutPage({ params }: { params: Promise<{ slug: string; logId: string }> }) {
  const { slug, logId } = await params;
  const ctx = await requireAthleteWorkspace(slug);
  const detail = await getWorkout(ctx, logId).catch(() => notFound());
  const base = `/t/${ctx.org.slug}/athlete`;
  return (
    <div>
      <Link href={detail.log.status === "completed" ? `${base}/history` : base} className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 hover:text-accent">
        <ArrowLeft className="size-3.5" aria-hidden /> Back
      </Link>
      <p className="eyebrow text-accent">{formatDateLong(detail.log.performed_on)}</p>
      <h1 className="display mt-2 text-4xl text-ivory-50">{detail.log.title}</h1>
      <p className="mb-6 mt-2 text-sm text-stone-400">Targets from your coach appear in grey. Enter what you actually did and tap ✓ to save each set.</p>
      <WorkoutLogger slug={ctx.org.slug} detail={detail} path={`${base}/workout/${logId}`} doneHref={base} actorLabel="you" />
    </div>
  );
}
