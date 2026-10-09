import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/feedback";
import { ProgramMetaForm } from "@/components/program/program-forms";
import { requireCoachWorkspace } from "@/lib/auth/context";

export const metadata: Metadata = { title: "New program" };

export default async function NewProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCoachWorkspace(slug);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Programs" title="New program" description="Start with the outline. You'll add sessions and exercises in the builder next — nothing is visible to athletes until you publish and assign it." />
      <ProgramMetaForm slug={ctx.org.slug} />
    </div>
  );
}
