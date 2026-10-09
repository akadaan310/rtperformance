import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, PencilRuler } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-form";
import { Badge, PageHeader, Panel } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { TabNav } from "@/components/ui/tabs";
import { ProgramBuilder } from "@/components/program/program-builder";
import { AssignFromProgramForm, ProgramMetaForm } from "@/components/program/program-forms";
import { ProgramPreview } from "@/components/program/program-preview";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { formatDate, todayKey } from "@/lib/dates";
import { toCardSessions } from "@/lib/program-format";
import { athleteName, listAthletes } from "@/lib/services/athletes";
import { assignmentHistory, getProgram, listExerciseOptions } from "@/lib/services/programs";
import { archiveAction, deleteProgramAction, duplicateAction, publishAction, startRevisionAction } from "../actions";

export const metadata: Metadata = { title: "Program" };

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ slug: string; programId: string }>; searchParams: Promise<{ v?: string; mode?: string; duplicated?: string }> }) {
  const { slug, programId } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const detail = await getProgram(ctx, programId, sp.v ?? null).catch(() => notFound());
  const [exercises, history, athletes] = await Promise.all([listExerciseOptions(ctx), assignmentHistory(ctx, programId), listAthletes(ctx, { status: "active", limit: 200 })]);
  const { template, version, versions } = detail;
  const base = `/w/${ctx.org.slug}/programs/${template.id}`;
  const fields = { slug: ctx.org.slug, program_id: template.id };
  const draft = versions.find((v) => v.status === "draft");
  const latestPublished = versions.find((v) => v.status === "published");
  const mode = sp.mode === "preview" || !detail.editable ? "preview" : "build";
  const exerciseCount = detail.sessions.reduce((n, s) => n + s.exercises.length, 0);

  return (
    <>
      <PageHeader
        eyebrow={template.kind === "session" ? "Session template" : `Program · ${template.duration_weeks} weeks · ${template.sessions_per_week}× / week`}
        title={template.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {template.status === "archived" && <Badge tone="muted">Archived</Badge>}
            <Badge tone={version.status === "draft" ? "warning" : "success"}>
              v{version.version_number} · {version.status}
            </Badge>
            {template.created_via === "ai" && <Badge tone="accent">Drafted by The Tech Guy</Badge>}
            {template.goal && <span>{template.goal}</span>}
          </span>
        }
        actions={
          <>
            {version.status === "draft" ? (
              <ConfirmAction
                action={publishAction}
                fields={{ ...fields, version_id: version.id }}
                trigger={`Publish v${version.version_number}`}
                triggerVariant="primary"
                triggerSize="md"
                title={`Publish version ${version.version_number}?`}
                body={
                  <>
                    <p>
                      {detail.sessions.length} sessions · {exerciseCount} prescriptions. Once published this version is locked — athletes assigned to it will always see exactly
                      this plan. Further edits create version {version.version_number + 1}.
                    </p>
                    <label htmlFor="change_summary" className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">
                      Change summary (optional)
                    </label>
                    <textarea id="change_summary" name="change_summary" maxLength={1000} className="mt-1 block min-h-16 w-full rounded-xs border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ivory-50 focus:border-accent focus:outline-none" placeholder="What changed in this version?" />
                  </>
                }
                confirmLabel="Publish"
              />
            ) : (
              !draft &&
              template.status !== "archived" && (
                <InlineAction action={startRevisionAction} fields={fields} variant="primary" size="md" pendingLabel="Opening…">
                  Revise (new version)
                </InlineAction>
              )
            )}
            <InlineAction action={duplicateAction} fields={fields} size="md" pendingLabel="Duplicating…">
              Duplicate
            </InlineAction>
          </>
        }
      />
      {sp.duplicated && <p role="status" className="-mt-4 mb-6 text-sm text-sage-400">Duplicated — you&apos;re editing the copy.</p>}

      {versions.length > 1 && (
        <nav aria-label="Versions" className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="eyebrow mr-1">Versions</span>
          {versions.map((v) => (
            <Link
              key={v.id}
              href={`${base}?v=${v.id}`}
              aria-current={v.id === version.id ? "page" : undefined}
              className={`rounded-xs border px-2.5 py-1 ${v.id === version.id ? "border-accent text-accent" : "border-ink-700 text-stone-400 hover:text-ivory-100"}`}
            >
              v{v.version_number} {v.status === "draft" ? "· draft" : v.published_at ? `· ${formatDate(v.published_at)}` : ""}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {detail.editable && (
            <TabNav
              label="Builder mode"
              active={mode}
              tabs={[
                { key: "build", label: "Build", href: `${base}${sp.v ? `?v=${sp.v}` : ""}` },
                { key: "preview", label: "Preview", href: `${base}?mode=preview${sp.v ? `&v=${sp.v}` : ""}` },
              ]}
            />
          )}
          {!detail.editable && (
            <p className="mb-5 flex items-center gap-2 rounded-xs border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-stone-300">
              <Eye className="size-4 text-stone-500" aria-hidden />
              Version {version.version_number} is published and locked.{" "}
              {draft ? (
                <Link href={`${base}?v=${draft.id}`} className="text-accent hover:underline">
                  Open the draft v{draft.version_number}
                </Link>
              ) : (
                "Use “Revise” to make changes in a new version."
              )}
            </p>
          )}
          {mode === "build" ? (
            <ProgramBuilder
              slug={ctx.org.slug}
              programId={template.id}
              versionId={version.id}
              sessions={detail.sessions}
              exercises={exercises}
              weeks={template.kind === "session" ? 1 : template.duration_weeks}
              sessionsPerWeek={template.kind === "session" ? 1 : template.sessions_per_week}
            />
          ) : (
            <ProgramPreview sessions={toCardSessions(detail.sessions)} />
          )}
          {template.description && (
            <section className="mt-8 surface p-5">
              <p className="eyebrow mb-2">Overview & coach notes</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-stone-300">{template.description}</p>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {latestPublished && template.status !== "archived" && template.kind === "program" && (
            <Panel title="Assign to an athlete" eyebrow={`Pins v${latestPublished.version_number}`}>
              <AssignFromProgramForm
                slug={ctx.org.slug}
                programId={template.id}
                athletes={athletes.map((a) => ({ id: a.id, name: athleteName(a) }))}
                defaultStart={todayKey()}
                sessionsPerWeek={template.sessions_per_week}
              />
            </Panel>
          )}
          <Panel title="Assignment history" bodyClassName="p-0">
            {history.length ? (
              <ul className="divide-y divide-ink-800">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <Link href={`/w/${ctx.org.slug}/athletes/${h.athlete_id}?tab=program`} className="text-ivory-100 hover:text-accent">
                      {h.athlete_name}
                    </Link>
                    <p className="text-xs text-stone-500">
                      v{h.version_number} · from {formatDate(h.start_date)} · {h.status}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-stone-500">Not assigned yet.</p>
            )}
          </Panel>
          <details className="surface group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-ivory-50">
              <PencilRuler className="size-4 text-stone-500" aria-hidden /> Program details
            </summary>
            <div className="border-t border-ink-700 p-5">
              <ProgramMetaForm slug={ctx.org.slug} program={template} />
            </div>
          </details>
          <Panel title="Lifecycle">
            <div className="flex flex-wrap gap-2">
              <InlineAction action={archiveAction} fields={{ ...fields, archived: template.status === "archived" ? "false" : "true" }}>
                {template.status === "archived" ? "Restore" : "Archive"}
              </InlineAction>
              {history.length === 0 && (
                <ConfirmAction
                  action={deleteProgramAction}
                  fields={fields}
                  trigger="Delete"
                  triggerVariant="danger"
                  tone="danger"
                  title="Delete this program?"
                  body="All versions, sessions and prescriptions will be removed. This cannot be undone."
                  confirmLabel="Delete program"
                />
              )}
            </div>
            {history.length > 0 && <p className="mt-3 text-xs text-stone-500">Assigned programs can&apos;t be deleted — archive them to keep athletes&apos; history intact.</p>}
          </Panel>
        </aside>
      </div>
    </>
  );
}
