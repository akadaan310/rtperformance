import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { InviteTrainerForm } from "@/components/coach/invite-trainer-form";
import { ConfirmAction } from "@/components/ui/confirm-form";
import { Badge, EmptyState, PageHeader, Panel, Stat } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatRelative } from "@/lib/dates";
import { listInvitations } from "@/lib/services/invitations";
import { listAuditEvents, listNetworkWorkspaces } from "@/lib/services/network";
import { revokeInviteAction } from "../settings/actions";
import { workspaceStatusAction } from "./actions";

export const metadata: Metadata = { title: "Network" };

export default async function NetworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCoachWorkspace(slug);
  if (!can(ctx, "network.manage")) notFound();
  const [workspaces, invitations, events] = await Promise.all([listNetworkWorkspaces(ctx), listInvitations(ctx, ["trainer_workspace"]), listAuditEvents(ctx, 60)]);
  // Only trainer-network events; athlete invitations in Raymond's own coaching workspace are excluded.
  const networkEvents = events.filter((e) => e.action.startsWith("workspace.") || (e.action.startsWith("invitation.") && e.metadata?.kind === "trainer_workspace"));
  const active = workspaces.filter((w) => w.status === "active");
  const pending = invitations.filter((i) => i.status === "pending");
  const fields = { slug: ctx.org.slug };

  return (
    <>
      <PageHeader eyebrow="RT Performance network" title="Trainer network" description="Invite trainers to run their own workspaces on the RT Performance platform. You see workspace-level totals only — never a trainer's client records, notes or conversations." />

      <section aria-label="Network totals" className="surface mb-8 grid grid-cols-2 gap-px overflow-hidden bg-ink-700/80 md:grid-cols-4">
        <div className="bg-ink-900 p-5">
          <Stat label="Active workspaces" value={active.length} />
        </div>
        <div className="bg-ink-900 p-5">
          <Stat label="Pending invitations" value={pending.length} />
        </div>
        <div className="bg-ink-900 p-5">
          <Stat label="Athletes across network" value={active.reduce((n, w) => n + w.athlete_count, 0)} />
        </div>
        <div className="bg-ink-900 p-5">
          <Stat label="Workouts · 30 days" value={active.reduce((n, w) => n + w.sessions_completed_30d, 0)} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Panel title="Trainer directory" eyebrow="Aggregate reporting" bodyClassName="p-0">
            {workspaces.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No trainer workspaces yet">Invite your first trainer. When they accept, their workspace appears here.</EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-[10px] uppercase tracking-[0.14em] text-stone-500">
                      <th className="px-5 py-3 font-semibold">Workspace</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 text-right font-semibold">Athletes</th>
                      <th className="px-3 py-3 text-right font-semibold">Programs</th>
                      <th className="px-3 py-3 text-right font-semibold">Workouts 30d</th>
                      <th className="px-3 py-3 font-semibold">Last activity</th>
                      <th className="px-5 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaces.map((w) => (
                      <tr key={w.org_id} className="border-b border-ink-800 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-ivory-50">{w.name}</p>
                          <p className="text-xs text-stone-500">
                            {w.owner_name ?? w.owner_email ?? "—"} · /t/{w.slug} · since {formatDate(w.created_at)}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={w.status === "active" ? "success" : "danger"}>{w.status}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right" data-numeric>{w.athlete_count}</td>
                        <td className="px-3 py-3 text-right" data-numeric>{w.program_count}</td>
                        <td className="px-3 py-3 text-right" data-numeric>{w.sessions_completed_30d}</td>
                        <td className="px-3 py-3 text-xs text-stone-400">{w.last_activity_at ? formatRelative(w.last_activity_at) : "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <ConfirmAction
                            action={workspaceStatusAction}
                            fields={{ ...fields, org_id: w.org_id, status: w.status === "active" ? "suspended" : "active" }}
                            trigger={w.status === "active" ? "Suspend" : "Reactivate"}
                            triggerVariant={w.status === "active" ? "ghost" : "secondary"}
                            title={w.status === "active" ? `Suspend ${w.name}?` : `Reactivate ${w.name}?`}
                            body={
                              w.status === "active"
                                ? "The trainer and their athletes lose access until you reactivate it. No data is deleted."
                                : "The trainer and their athletes regain access immediately."
                            }
                            tone={w.status === "active" ? "danger" : "primary"}
                            confirmLabel={w.status === "active" ? "Suspend workspace" : "Reactivate"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Invitations" bodyClassName="p-0">
            {invitations.length ? (
              <ul className="divide-y divide-ink-800">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="text-ivory-100">
                        {i.email}
                        {i.workspace_name ? <span className="text-stone-500"> · {i.workspace_name}</span> : null}
                      </p>
                      <p className="text-xs text-stone-500">
                        Sent {formatDate(i.created_at)} · {i.status === "pending" ? `expires ${formatDate(i.expires_at, { month: "short", day: "numeric", hour: "numeric" })}` : i.accepted_at ? `accepted ${formatDate(i.accepted_at)}` : i.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={i.status === "pending" ? "warning" : i.status === "accepted" ? "success" : "muted"}>{i.status}</Badge>
                      {i.status === "pending" && (
                        <InlineAction action={revokeInviteAction} fields={{ ...fields, invitation_id: i.id }} variant="ghost">
                          Revoke
                        </InlineAction>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-stone-500">No invitations sent yet.</p>
            )}
          </Panel>

          <Panel title="Network audit history" bodyClassName="p-0">
            {networkEvents.length ? (
              <ul className="divide-y divide-ink-800">
                {networkEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="text-ivory-100">
                      {e.action.replace(".", " ").replace(/_/g, " ")}
                      {typeof e.metadata?.workspace === "string" ? ` — ${e.metadata.workspace}` : ""}
                      <span className="text-stone-500"> · {e.actor_name ?? "System"}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-stone-500">
                      {e.source === "ai" && <Badge tone="accent">AI</Badge>}
                      {formatRelative(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-stone-500">No network events yet.</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <section id="invite" className="scroll-mt-24">
            <Panel title="Invite a trainer" eyebrow="New workspace in your network">
              <InviteTrainerForm slug={ctx.org.slug} kind="trainer_workspace" />
            </Panel>
          </section>
          <div className="surface flex gap-3 p-5 text-sm text-stone-400">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <p>
              Trainer workspaces are isolated by database policy. Network reporting reads only counts through a dedicated, owner-only function. Suspending a workspace blocks access without deleting anything.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
