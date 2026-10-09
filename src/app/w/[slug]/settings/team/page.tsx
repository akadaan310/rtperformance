import type { Metadata } from "next";
import { InviteTrainerForm } from "@/components/coach/invite-trainer-form";
import { ConfirmAction } from "@/components/ui/confirm-form";
import { Badge, PageHeader, Panel } from "@/components/ui/feedback";
import { InlineAction } from "@/components/ui/inline-action";
import { TabNav } from "@/components/ui/tabs";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/dates";
import { listInvitations } from "@/lib/services/invitations";
import { listMembers } from "@/lib/services/team";
import { memberStatusAction, revokeInviteAction } from "../actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCoachWorkspace(slug);
  const manage = can(ctx, "team.manage");
  const [members, invitations] = await Promise.all([listMembers(ctx), manage ? listInvitations(ctx, ["workspace_member"]) : Promise.resolve([])]);
  const base = `/w/${ctx.org.slug}/settings`;
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" />
      <TabNav
        label="Settings sections"
        active="team"
        tabs={[
          { key: "brand", label: "Branding", href: base },
          { key: "team", label: "Team", href: `${base}/team` },
          ...(can(ctx, "audit.read") ? [{ key: "activity", label: "Activity log", href: `${base}?tab=activity` }] : []),
          { key: "metrics", label: "Metric definitions", href: `${base}?tab=metrics` },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Panel title="Coaches in this workspace" bodyClassName="p-0">
            <ul className="divide-y divide-ink-800">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm text-ivory-100">{m.full_name ?? m.email}</p>
                    <p className="text-xs text-stone-500">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{m.role}</Badge>
                    {m.status === "revoked" && <Badge tone="danger">Revoked</Badge>}
                    {manage && m.user_id !== ctx.user.id && (
                      <ConfirmAction
                        action={memberStatusAction}
                        fields={{ slug: ctx.org.slug, membership_id: m.id, status: m.status === "revoked" ? "active" : "revoked" }}
                        trigger={m.status === "revoked" ? "Restore" : "Revoke access"}
                        triggerVariant={m.status === "revoked" ? "secondary" : "ghost"}
                        title={m.status === "revoked" ? "Restore access?" : "Revoke this coach's access?"}
                        body={m.status === "revoked" ? "They'll regain access to this workspace." : "They will immediately lose access to this workspace's athletes, programs and records."}
                        tone={m.status === "revoked" ? "primary" : "danger"}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          {manage && (
            <Panel title="Trainer invitations" bodyClassName="p-0">
              {invitations.length ? (
                <ul className="divide-y divide-ink-800">
                  {invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div>
                        <p className="text-ivory-100">{i.email}</p>
                        <p className="text-xs text-stone-500">
                          Sent {formatDate(i.created_at)} · expires {formatDate(i.expires_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={i.status === "pending" ? "warning" : i.status === "accepted" ? "success" : "muted"}>{i.status}</Badge>
                        {i.status === "pending" && (
                          <InlineAction action={revokeInviteAction} fields={{ slug: ctx.org.slug, invitation_id: i.id }} variant="ghost">
                            Revoke
                          </InlineAction>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-stone-500">No trainer invitations yet.</p>
              )}
            </Panel>
          )}
        </div>
        {manage ? (
          <Panel title="Add a co-trainer" eyebrow="Joins this workspace" className="h-fit">
            <InviteTrainerForm slug={ctx.org.slug} kind="workspace_member" />
          </Panel>
        ) : (
          <Panel title="Team access" className="h-fit">
            <p className="text-sm text-stone-400">Only workspace owners can invite or remove trainers.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
