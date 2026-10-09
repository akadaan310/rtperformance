import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { TabNav } from "@/components/ui/tabs";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { formatRelative } from "@/lib/dates";
import { listPrograms } from "@/lib/services/programs";

export const metadata: Metadata = { title: "Programs" };

export default async function ProgramsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; deleted?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const view = sp.view === "templates" ? "templates" : sp.view === "archived" ? "archived" : "programs";
  const all = await listPrograms(ctx, { includeArchived: true });
  const list = all.filter((p) => (view === "archived" ? p.status === "archived" : p.status !== "archived" && p.kind === (view === "templates" ? "session" : "program")));
  const base = `/w/${ctx.org.slug}`;
  return (
    <>
      <PageHeader
        eyebrow="Programming"
        title="Programs"
        description="Reusable templates and multi-week programs. Publishing locks a version; athletes keep exactly what they were assigned."
        actions={
          <>
            <ButtonLink href={`${base}/assistant?prompt=${encodeURIComponent("Create a beginner three-day strength program.")}`} variant="secondary">
              <Bot className="size-4" aria-hidden /> Draft with The Tech Guy
            </ButtonLink>
            <ButtonLink href={`${base}/programs/new`}>
              <Plus className="size-4" aria-hidden /> New program
            </ButtonLink>
          </>
        }
      />
      {sp.deleted && <p role="status" className="mb-4 text-sm text-sage-400">Program deleted.</p>}
      <TabNav
        label="Program views"
        active={view}
        tabs={[
          { key: "programs", label: "Programs", href: `${base}/programs`, count: all.filter((p) => p.kind === "program" && p.status !== "archived").length },
          { key: "templates", label: "Session templates", href: `${base}/programs?view=templates`, count: all.filter((p) => p.kind === "session" && p.status !== "archived").length },
          { key: "archived", label: "Archived", href: `${base}/programs?view=archived`, count: all.filter((p) => p.status === "archived").length },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState title={view === "archived" ? "Nothing archived" : "No programs yet"} action={view !== "archived" && <ButtonLink href={`${base}/programs/new`}>Create one</ButtonLink>}>
          {view === "templates" ? "Session templates are single workouts you can reuse when building programs." : view === "archived" ? "Archived programs keep their history and can be restored." : "Build a multi-week program from the exercise library, or ask The Tech Guy for a first draft."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <Link href={`${base}/programs/${p.id}`} className="group surface flex h-full flex-col p-5 transition-colors hover:border-accent/60">
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.status === "archived" ? <Badge tone="muted">Archived</Badge> : p.latest_version ? <Badge tone="success">Published v{p.latest_version}</Badge> : <Badge tone="warning">Draft</Badge>}
                  {p.has_draft && p.latest_version && <Badge tone="warning">Revision in progress</Badge>}
                  {p.created_via === "ai" && <Badge tone="accent">AI draft</Badge>}
                </div>
                <h2 className="display-tight mt-4 text-2xl text-ivory-50 group-hover:text-accent">{p.name}</h2>
                {p.goal && <p className="mt-1 text-sm text-stone-400">{p.goal}</p>}
                <dl className="mt-auto grid grid-cols-3 gap-2 pt-6 text-xs">
                  <div>
                    <dt className="text-stone-500">Length</dt>
                    <dd className="text-ivory-100">{p.kind === "session" ? "1 session" : `${p.duration_weeks} wk`}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Sessions</dt>
                    <dd className="text-ivory-100">{p.session_count}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Assigned</dt>
                    <dd className="text-ivory-100">{p.active_assignments}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] text-stone-500">Updated {formatRelative(p.updated_at)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
