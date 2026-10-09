import type { Metadata } from "next";
import { AthleteForm } from "@/components/coach/athlete-form";
import { PageHeader } from "@/components/ui/feedback";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { athleteName, getAthlete } from "@/lib/services/athletes";
import { notFound } from "next/navigation";
import { updateAthleteAction } from "../../actions";

export const metadata: Metadata = { title: "Edit athlete" };

export default async function EditAthletePage({ params }: { params: Promise<{ slug: string; athleteId: string }> }) {
  const { slug, athleteId } = await params;
  const ctx = await requireCoachWorkspace(slug);
  const athlete = await getAthlete(ctx, athleteId).catch(() => notFound());
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Athletes" title={`Edit ${athleteName(athlete)}`} />
      <AthleteForm slug={ctx.org.slug} athlete={athlete} action={updateAthleteAction} cancelHref={`/w/${ctx.org.slug}/athletes/${athlete.id}`} />
    </div>
  );
}
