import type { Metadata } from "next";
import { AthleteForm } from "@/components/coach/athlete-form";
import { PageHeader } from "@/components/ui/feedback";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { createAthleteAction } from "../actions";

export const metadata: Metadata = { title: "Add athlete" };

export default async function NewAthletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCoachWorkspace(slug);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Athletes" title="Add an athlete" description="Create the athlete's profile first. You can invite them to their portal afterwards." />
      <AthleteForm slug={ctx.org.slug} action={createAthleteAction} cancelHref={`/w/${ctx.org.slug}/athletes`} />
    </div>
  );
}
