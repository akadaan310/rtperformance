import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WorkoutLogger } from "@/components/athlete/workout-logger";
import { Badge, PageHeader } from "@/components/ui/feedback";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { formatDateLong } from "@/lib/dates";
import { athleteName, getAthlete } from "@/lib/services/athletes";
import { getWorkout } from "@/lib/services/workouts";

export const metadata: Metadata = { title: "Workout log" };

export default async function CoachWorkoutPage({ params }: { params: Promise<{ slug: string; athleteId: string; logId: string }> }) {
  const { slug, athleteId, logId } = await params;
  const ctx = await requireCoachWorkspace(slug);
  const athlete = await getAthlete(ctx, athleteId).catch(() => notFound());
  const detail = await getWorkout(ctx, logId).catch(() => notFound());
  if (detail.log.athlete_id !== athlete.id) notFound();
  const back = `/w/${ctx.org.slug}/athletes/${athlete.id}?tab=history`;
  const path = `/w/${ctx.org.slug}/athletes/${athlete.id}/workouts/${logId}`;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={back} className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 hover:text-accent">
        <ArrowLeft className="size-3.5" aria-hidden /> {athleteName(athlete)}
      </Link>
      <PageHeader
        eyebrow={formatDateLong(detail.log.performed_on)}
        title={detail.log.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {detail.log.status === "completed" ? <Badge tone="success">Completed</Badge> : <Badge tone="warning">In progress</Badge>}
            <span>Logging on behalf of {athleteName(athlete)}. Planned targets show as placeholders; what you enter is recorded as performed.</span>
          </span>
        }
      />
      <WorkoutLogger slug={ctx.org.slug} detail={detail} path={path} doneHref={back} actorLabel={`coach (${ctx.user.fullName ?? ctx.user.email})`} />
    </div>
  );
}
