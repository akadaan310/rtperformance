import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, Lock, Pencil, Pin, Share2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-form";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { TabNav } from "@/components/ui/tabs";
import { AdhocWorkoutForm, AssignProgramForm, GoalForm, InviteAthleteForm, NoteForm } from "@/components/coach/athlete-forms";
import { HistoryList } from "@/components/progress/history-list";
import { ProgressView } from "@/components/progress/progress-view";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatRelative, todayKey } from "@/lib/dates";
import { describeAttention, isMissed } from "@/lib/metrics";
import { athleteName, getAthlete } from "@/lib/services/athletes";
import { listNotes } from "@/lib/services/goals";
import { listInvitations } from "@/lib/services/invitations";
import { listExerciseOptions, listPrograms } from "@/lib/services/programs";
import { athleteProgress, athleteSchedule, type RangeKey } from "@/lib/services/progress";
import { listWorkoutHistory } from "@/lib/services/workouts";
import { WEEKDAYS } from "@/lib/schedule";
import {
  cancelAssignmentAction,
  deleteAthleteAction,
  deleteNoteAction,
  revokeAthleteAccessAction,
  revokeInvitationAction,
  setAthleteStatusAction,
  setGoalStatusAction,
  setSessionStatusAction,
  startWorkoutAction,
  updateNoteAction,
} from "../actions";

export const metadata: Metadata = { title: "Athlete" };

type Tab = "overview" | "program" | "history" | "progress" | "notes";

export default async function AthletePage({ params, searchParams }: { params: Promise<{ slug: string; athleteId: string }>; searchParams: Promise<{ tab?: string; range?: string; created?: string; saved?: string; assigned?: string }> }) {
  const { slug, athleteId } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const athlete = await getAthlete(ctx, athleteId).catch(() => notFound());
  const tab: Tab = (["overview", "program", "history", "progress", "notes"] as const).find((t) => t === sp.tab) ?? "overview";
  const range = (["4w", "12w", "26w", "all"] as const).find((r) => r === sp.range) ?? "12w";
  const base = `/w/${ctx.org.slug}`;
  const self = `${base}/athletes/${athlete.id}`;
  const today = todayKey();
  const fields = { slug: ctx.org.slug, athlete_id: athlete.id };

  const [assignmentsRes, notes] = await Promise.all([
    ctx.supabase
      .from("assignments")
      .select("id, template_id, version_id, start_date, training_days, status, notes, created_at, program_templates(name), program_versions(version_number)")
      .eq("athlete_id", athlete.id)
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: false }),
    listNotes(ctx, athlete.id),
  ]);
  const assignments = (assignmentsRes.data ?? []).map((a) => ({
    id: a.id as string,
    template_id: a.template_id as string,
    start_date: a.start_date as string,
    training_days: a.training_days as number[],
    status: a.status as string,
    notes: a.notes as string | null,
    created_at: a.created_at as string,
    name: (a.program_templates as unknown as { name: string } | null)?.name ?? "Program",
    version: (a.program_versions as unknown as { version_number: number } | null)?.version_number ?? 1,
  }));
  const active = assignments.filter((a) => a.status === "active");

  return (
    <>
      <PageHeader
        eyebrow={`Athlete · ${athlete.status}`}
        title={athleteName(athlete)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {athlete.experience_level && <Badge>{athlete.experience_level}</Badge>}
            {athlete.sessions_per_week && <Badge tone="muted">{athlete.sessions_per_week}× / week</Badge>}
            {athlete.user_id ? <Badge tone="success">Portal active</Badge> : <Badge tone="muted">No portal login</Badge>}
            {athlete.next_check_in_date && (
              <Badge tone={athlete.next_check_in_date < today ? "danger" : "neutral"}>
                <CalendarDays className="size-3" aria-hidden /> Check-in {formatDate(athlete.next_check_in_date)}
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`${self}/edit`} variant="secondary" size="sm">
              <Pencil className="size-3.5" aria-hidden /> Edit profile
            </ButtonLink>
            <ButtonLink href={`${self}?tab=program#assign`} size="sm">
              Assign program
            </ButtonLink>
          </>
        }
      />
      {(sp.created || sp.saved || sp.assigned) && (
        <p role="status" className="-mt-4 mb-6 text-sm text-sage-400">
          {sp.created ? "Athlete created." : sp.saved ? "Profile saved." : "Program assigned — the schedule is live in the athlete's portal."}
        </p>
      )}
      <TabNav
        label="Athlete sections"
        active={tab}
        tabs={[
          { key: "overview", label: "Overview", href: self },
          { key: "program", label: "Program & schedule", href: `${self}?tab=program` },
          { key: "history", label: "History", href: `${self}?tab=history` },
          { key: "progress", label: "Progress", href: `${self}?tab=progress` },
          { key: "notes", label: "Coach notes", href: `${self}?tab=notes`, count: notes.length },
        ]}
      />

      {tab === "overview" && <Overview ctx={ctx} athlete={athlete} assignments={assignments} notes={notes} fields={fields} self={self} />}
      {tab === "program" && <ProgramTab ctx={ctx} athleteId={athlete.id} assignments={assignments} activeCount={active.length} fields={fields} self={self} today={today} />}
      {tab === "history" && <HistoryTab ctx={ctx} athleteId={athlete.id} self={self} fields={fields} />}
      {tab === "progress" && <ProgressTab ctx={ctx} athleteId={athlete.id} range={range} self={self} fields={fields} />}
      {tab === "notes" && <NotesTab notes={notes} fields={fields} canWrite={can(ctx, "notes.write")} />}
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requireCoachWorkspace>>;
type Athlete = Awaited<ReturnType<typeof getAthlete>>;
type Fields = { slug: string; athlete_id: string };

async function Overview({ ctx, athlete, assignments, notes, fields, self }: { ctx: Ctx; athlete: Athlete; assignments: { id: string; name: string; status: string; created_at: string; version: number; start_date: string }[]; notes: Awaited<ReturnType<typeof listNotes>>; fields: Fields; self: string }) {
  const [invitations, logs, membership, goals, progress] = await Promise.all([
    listInvitations(ctx, ["athlete"]).then((list) => list.filter((i) => i.athlete_id === athlete.id)),
    listWorkoutHistory(ctx, athlete.id, 30),
    athlete.user_id
      ? ctx.supabase.from("memberships").select("id, status").eq("org_id", ctx.org.id).eq("user_id", athlete.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase.from("goals").select("id, title, created_at, achieved_at, status").eq("athlete_id", athlete.id).eq("org_id", ctx.org.id),
    athleteProgress(ctx, athlete.id, "4w"),
  ]);
  const pending = invitations.filter((i) => i.status === "pending");
  const timeline = [
    { at: athlete.created_at, label: "Profile created" },
    ...assignments.map((a) => ({ at: a.created_at, label: `Assigned ${a.name} v${a.version} (starts ${formatDate(a.start_date)})${a.status === "cancelled" ? " — cancelled" : ""}` })),
    ...logs.filter((l) => l.status === "completed").map((l) => ({ at: `${l.performed_on}T12:00:00.000Z`, label: `Completed ${l.title} · ${l.set_count} sets` })),
    ...(goals.data ?? []).flatMap((g) => [
      { at: g.created_at as string, label: `Goal set: ${g.title}` },
      ...(g.achieved_at ? [{ at: g.achieved_at as string, label: `Goal achieved: ${g.title}` }] : []),
    ]),
    ...notes.map((n) => ({ at: n.created_at, label: `${n.visibility === "shared" ? "Shared" : "Private"} note added${n.author_name ? ` by ${n.author_name}` : ""}` })),
    ...invitations.filter((i) => i.accepted_at).map((i) => ({ at: i.accepted_at as string, label: "Joined the athlete portal" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  const details: [string, string | null][] = [
    ["Training goals", athlete.training_goals],
    ["Preferences", athlete.training_preferences],
    ["Equipment", athlete.equipment.length ? athlete.equipment.join(", ") : null],
    ["Limitations (athlete-reported)", athlete.limitations],
    ["Email", athlete.email],
    ["Phone", athlete.phone],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0 space-y-6">
        {progress.attention.length > 0 && (
          <div role="status" className="flex gap-3 rounded-xs border border-signal-600/50 bg-signal-600/10 p-4 text-sm text-signal-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <ul>
              {progress.attention.map((r, i) => (
                <li key={i}>{describeAttention(r)}</li>
              ))}
            </ul>
          </div>
        )}
        <Panel title="Profile">
          <dl className="grid gap-5 sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k} className={k.startsWith("Training") || k.startsWith("Limit") ? "sm:col-span-2" : ""}>
                <dt className="eyebrow">{k}</dt>
                <dd className={`mt-1 whitespace-pre-line text-sm ${v ? "text-ivory-100" : "text-stone-500"}`}>{v ?? "Not recorded"}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Activity timeline" eyebrow="Most recent first">
          {timeline.length ? (
            <ol className="relative space-y-4 border-l border-ink-700 pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span aria-hidden className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-accent" />
                  <p className="text-sm text-ivory-100">{t.label}</p>
                  <p className="text-xs text-stone-500">{formatRelative(t.at)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-stone-500">No activity yet.</p>
          )}
        </Panel>
      </div>

      <div className="min-w-0 space-y-6">
        <Panel title="Last 4 weeks" eyebrow="Snapshot">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="eyebrow">Attendance</dt>
              <dd className="display-tight mt-1 text-2xl text-ivory-50">{progress.attendance.rate === null ? "—" : `${Math.round(progress.attendance.rate * 100)}%`}</dd>
            </div>
            <div>
              <dt className="eyebrow">Adherence</dt>
              <dd className="display-tight mt-1 text-2xl text-ivory-50">{progress.adherence.rate === null ? "—" : `${Math.round(progress.adherence.rate * 100)}%`}</dd>
            </div>
            <div>
              <dt className="eyebrow">Workouts</dt>
              <dd className="display-tight mt-1 text-2xl text-ivory-50">{progress.completion.completed}</dd>
            </div>
            <div>
              <dt className="eyebrow">Streak</dt>
              <dd className="display-tight mt-1 text-2xl text-ivory-50">{progress.consistency.streak_weeks} wk</dd>
            </div>
          </dl>
          <Link href={`${self}?tab=progress`} className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-accent hover:underline">
            Full progress
          </Link>
        </Panel>

        <Panel title="Portal access">
          {athlete.user_id ? (
            <div className="space-y-3 text-sm">
              <p className="text-stone-300">
                {membership.data?.status === "revoked" ? "Portal access is revoked. The athlete cannot sign in to this workspace." : "This athlete can sign in to their portal."}
              </p>
              {membership.data && can(ctx, "team.manage") && (
                <ConfirmAction
                  action={revokeAthleteAccessAction}
                  fields={{ ...fields, membership_id: membership.data.id as string, status: membership.data.status === "revoked" ? "active" : "revoked" }}
                  trigger={membership.data.status === "revoked" ? "Restore access" : "Revoke access"}
                  title={membership.data.status === "revoked" ? "Restore portal access?" : "Revoke portal access?"}
                  body={membership.data.status === "revoked" ? "The athlete will be able to sign in again." : "The athlete will no longer be able to see their program or log workouts. Their records are kept."}
                  tone={membership.data.status === "revoked" ? "primary" : "danger"}
                  triggerVariant={membership.data.status === "revoked" ? "secondary" : "danger"}
                />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xs border border-ink-700 p-3 text-xs">
                  <div>
                    <p className="text-ivory-100">Invitation pending · {inv.email}</p>
                    <p className="text-stone-500">Expires {formatDate(inv.expires_at)}</p>
                  </div>
                  <InlineAction action={revokeInvitationAction} fields={{ ...fields, invitation_id: inv.id }} variant="ghost">
                    Revoke
                  </InlineAction>
                </div>
              ))}
              <InviteAthleteForm slug={fields.slug} athleteId={athlete.id} email={athlete.email} />
            </div>
          )}
        </Panel>

        <Panel title="Manage">
          <div className="flex flex-wrap gap-2">
            {athlete.status !== "active" && (
              <InlineAction action={setAthleteStatusAction} fields={{ ...fields, status: "active" }}>
                Mark active
              </InlineAction>
            )}
            {athlete.status === "active" && (
              <InlineAction action={setAthleteStatusAction} fields={{ ...fields, status: "paused" }}>
                Pause
              </InlineAction>
            )}
            {athlete.status !== "archived" && (
              <ConfirmAction
                action={setAthleteStatusAction}
                fields={{ ...fields, status: "archived" }}
                trigger="Archive"
                title="Archive this athlete?"
                body="Archived athletes leave the roster and dashboards. Their history is kept and you can restore them anytime."
                confirmLabel="Archive"
              />
            )}
            {can(ctx, "athletes.delete") && (
              <ConfirmAction
                action={deleteAthleteAction}
                fields={fields}
                trigger="Delete permanently"
                triggerVariant="danger"
                tone="danger"
                title="Permanently delete athlete?"
                body={
                  <>
                    This deletes {athleteName(athlete)}&apos;s profile, assignments, workout logs, goals and notes. <strong>This cannot be undone.</strong> Archive instead if you may need the history.
                  </>
                }
                confirmLabel="Delete forever"
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

async function ProgramTab({ ctx, athleteId, assignments, activeCount, fields, self, today }: { ctx: Ctx; athleteId: string; assignments: { id: string; name: string; status: string; version: number; start_date: string; training_days: number[]; notes: string | null; template_id: string }[]; activeCount: number; fields: Fields; self: string; today: string }) {
  const [schedule, programs] = await Promise.all([athleteSchedule(ctx, athleteId), listPrograms(ctx)]);
  const assignable = programs.filter((p) => p.latest_version !== null && p.status !== "archived").map((p) => ({ id: p.id, name: p.name, version: p.latest_version as number, sessionsPerWeek: p.sessions_per_week }));
  const upcoming = schedule.filter((s) => s.scheduled_date >= today && s.status === "planned").slice(0, 10);
  const past = schedule.filter((s) => s.scheduled_date < today || s.status !== "planned").reverse().slice(0, 12);
  const base = `/w/${fields.slug}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0 space-y-6">
        <Panel title="Assigned programs" bodyClassName="p-0">
          {assignments.length ? (
            <ul className="divide-y divide-ink-800">
              {assignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <Link href={`${base}/programs/${a.template_id}`} className="text-sm font-medium text-ivory-50 hover:text-accent">
                      {a.name} <span className="text-stone-500">v{a.version}</span>
                    </Link>
                    <p className="text-xs text-stone-500">
                      From {formatDate(a.start_date)} · {a.training_days.map((d) => WEEKDAYS.find((w) => w.value === d)?.short).join(", ")}
                    </p>
                    {a.notes && <p className="mt-1 text-xs text-stone-400">{a.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={a.status === "active" ? "success" : "muted"}>{a.status}</Badge>
                    {a.status === "active" && (
                      <ConfirmAction
                        action={cancelAssignmentAction}
                        fields={{ ...fields, assignment_id: a.id }}
                        trigger="Cancel"
                        triggerVariant="ghost"
                        title="Cancel this assignment?"
                        body="Upcoming sessions disappear from the athlete's portal. Workouts already logged are kept."
                        tone="danger"
                        confirmLabel="Cancel assignment"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No programs assigned yet.</p>
          )}
        </Panel>

        <Panel title="Upcoming sessions" bodyClassName="p-0">
          {upcoming.length ? (
            <ul className="divide-y divide-ink-800">
              {upcoming.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm text-ivory-100">{s.session_name}</p>
                    <p className="text-xs text-stone-500">
                      {s.scheduled_date === today ? "Today" : formatDate(s.scheduled_date, { weekday: "short", month: "short", day: "numeric" })} · {s.program_name} · week {s.week_number}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {s.log ? (
                      <ButtonLink href={`${self}/workouts/${s.log.id}`} size="sm" variant="secondary">
                        Resume log
                      </ButtonLink>
                    ) : (
                      <InlineAction action={startWorkoutAction} fields={{ ...fields, scheduled_id: s.id }} variant="secondary" pendingLabel="Opening…">
                        Log for athlete
                      </InlineAction>
                    )}
                    <InlineAction action={setSessionStatusAction} fields={{ ...fields, scheduled_id: s.id, status: "skipped" }} variant="ghost">
                      Excuse
                    </InlineAction>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">{activeCount ? "No upcoming sessions — this block is finished." : "Assign a program to schedule sessions."}</p>
          )}
        </Panel>

        <Panel title="Recent schedule" bodyClassName="p-0">
          {past.length ? (
            <ul className="divide-y divide-ink-800">
              {past.map((s) => {
                const missed = isMissed(s, today);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm text-ivory-100">{s.session_name}</p>
                      <p className="text-xs text-stone-500">{formatDate(s.scheduled_date, { weekday: "short", month: "short", day: "numeric" })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === "completed" ? <Badge tone="success">Completed</Badge> : s.status === "skipped" ? <Badge tone="muted">Excused</Badge> : missed ? <Badge tone="danger">Missed</Badge> : <Badge>Today</Badge>}
                      {s.log && (
                        <Link href={`${self}/workouts/${s.log.id}`} className="text-xs text-stone-400 hover:text-accent">
                          View log
                        </Link>
                      )}
                      {missed && !s.log && (
                        <InlineAction action={startWorkoutAction} fields={{ ...fields, scheduled_id: s.id }} variant="ghost">
                          Log late
                        </InlineAction>
                      )}
                      {s.status === "skipped" && (
                        <InlineAction action={setSessionStatusAction} fields={{ ...fields, scheduled_id: s.id, status: "planned" }} variant="ghost">
                          Undo
                        </InlineAction>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">Nothing scheduled in the past yet.</p>
          )}
        </Panel>
      </div>
      <div className="min-w-0 space-y-6">
        <section id="assign" className="scroll-mt-24">
          <Panel title="Assign a program" eyebrow="Pins the latest published version">
            <AssignProgramForm slug={fields.slug} athleteId={athleteId} programs={assignable} defaultStart={today} />
          </Panel>
        </section>
      </div>
    </div>
  );
}

async function HistoryTab({ ctx, athleteId, self, fields }: { ctx: Ctx; athleteId: string; self: string; fields: Fields }) {
  const [logs, exercises] = await Promise.all([listWorkoutHistory(ctx, athleteId, 100), listExerciseOptions(ctx)]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <HistoryList logs={logs} hrefFor={(id) => `${self}/workouts/${id}`} />
      <Panel title="Log an unscheduled workout" eyebrow="On the athlete's behalf">
        <AdhocWorkoutForm slug={fields.slug} athleteId={athleteId} exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} />
      </Panel>
    </div>
  );
}

async function ProgressTab({ ctx, athleteId, range, self, fields }: { ctx: Ctx; athleteId: string; range: RangeKey; self: string; fields: Fields }) {
  const [p, exercises] = await Promise.all([athleteProgress(ctx, athleteId, range), listExerciseOptions(ctx)]);
  return (
    <div className="min-w-0 space-y-6">
      <ProgressView
        p={p}
        rangeLinks={[
          { key: "4w", label: "4 weeks", href: `${self}?tab=progress&range=4w` },
          { key: "12w", label: "12 weeks", href: `${self}?tab=progress&range=12w` },
          { key: "26w", label: "26 weeks", href: `${self}?tab=progress&range=26w` },
          { key: "all", label: "All time", href: `${self}?tab=progress&range=all` },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Add a goal">
          <GoalForm slug={fields.slug} athleteId={athleteId} exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} />
        </Panel>
        <Panel title="Manage goals" bodyClassName="p-0">
          {p.goals.length ? (
            <ul className="divide-y divide-ink-800">
              {p.goals.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-sm text-ivory-100">{g.title}</span>
                  <div className="flex gap-1">
                    {g.status !== "achieved" && (
                      <InlineAction action={setGoalStatusAction} fields={{ ...fields, goal_id: g.id, status: "achieved" }} variant="ghost">
                        Mark achieved
                      </InlineAction>
                    )}
                    <InlineAction action={setGoalStatusAction} fields={{ ...fields, goal_id: g.id, status: "archived" }} variant="ghost">
                      Archive
                    </InlineAction>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No active goals.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function NotesTab({ notes, fields, canWrite }: { notes: Awaited<ReturnType<typeof listNotes>>; fields: Fields; canWrite: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      {canWrite && (
        <Panel title="New note" eyebrow="Private unless shared">
          <NoteForm slug={fields.slug} athleteId={fields.athlete_id} />
        </Panel>
      )}
      <div className="space-y-3">
        {notes.length === 0 && <EmptyState title="No notes yet">Private notes are visible only to coaches in this workspace. Shared notes also appear in the athlete&apos;s portal.</EmptyState>}
        {notes.map((n) => (
          <article key={n.id} className="surface p-5">
            <header className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
              {n.pinned && <Pin className="size-3.5 text-accent" aria-label="Pinned" />}
              {n.visibility === "shared" ? (
                <Badge tone="accent">
                  <Share2 className="size-3" aria-hidden /> Shared with athlete
                </Badge>
              ) : (
                <Badge tone="muted">
                  <Lock className="size-3" aria-hidden /> Private
                </Badge>
              )}
              <span>
                {n.author_name ?? "Coach"} · {formatRelative(n.created_at)}
              </span>
            </header>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ivory-100">{n.body}</p>
            {canWrite && (
              <footer className="mt-3 flex flex-wrap gap-1">
                <InlineAction action={updateNoteAction} fields={{ ...fields, note_id: n.id, visibility: n.visibility === "shared" ? "private" : "shared" }} variant="ghost">
                  {n.visibility === "shared" ? "Make private" : "Share with athlete"}
                </InlineAction>
                <InlineAction action={updateNoteAction} fields={{ ...fields, note_id: n.id, pinned: n.pinned ? "false" : "true" }} variant="ghost">
                  {n.pinned ? "Unpin" : "Pin"}
                </InlineAction>
                <ConfirmAction action={deleteNoteAction} fields={{ ...fields, note_id: n.id }} trigger="Delete" triggerVariant="ghost" title="Delete this note?" body="This cannot be undone." tone="danger" confirmLabel="Delete" />
              </footer>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
