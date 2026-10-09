import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { requireCoachWorkspace } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { addDays, attentionReasons, describeAttention, pct, attendance } from "@/lib/metrics";
import { todayKey } from "@/lib/dates";
import { athleteName, listAthletes } from "@/lib/services/athletes";
import { loadMetricLogs, loadScheduled } from "@/lib/services/progress";

export const metadata: Metadata = { title: "Athletes" };

export default async function AthletesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; status?: string; deleted?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireCoachWorkspace(slug);
  const status = (["active", "paused", "archived", "all"].includes(sp.status ?? "") ? sp.status : "active") as "active" | "paused" | "archived" | "all";
  const athletes = await listAthletes(ctx, { search: sp.q, status, limit: 200 });
  const today = todayKey();
  const ids = athletes.map((a) => a.id);
  const [logs, scheduled] = ids.length
    ? await Promise.all([loadMetricLogs(ctx, { athleteIds: ids, from: addDays(today, -60) }), loadScheduled(ctx, { athleteIds: ids, from: addDays(today, -28), to: addDays(today, 14) })])
    : [[], []];
  const base = `/w/${ctx.org.slug}`;

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Athletes"
        description="Everyone you coach in this workspace. Profiles, programs and records stay private to this workspace."
        actions={
          <ButtonLink href={`${base}/athletes/new`}>
            <UserPlus className="size-4" aria-hidden /> Add athlete
          </ButtonLink>
        }
      />
      {sp.deleted && <p role="status" className="mb-4 text-sm text-sage-400">Athlete deleted.</p>}
      <form className="mb-6 flex flex-col gap-3 sm:flex-row" role="search" aria-label="Filter athletes">
        <label className="relative flex-1">
          <span className="sr-only">Search athletes</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder="Search by name or email" className="pl-9" />
        </label>
        <label className="sm:w-44">
          <span className="sr-only">Status</span>
          <Select name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </Select>
        </label>
        <button type="submit" className={buttonClass("secondary", "md")}>
          Apply
        </button>
      </form>

      {athletes.length === 0 ? (
        <EmptyState
          title={sp.q || status !== "active" ? "No matches" : "No athletes yet"}
          action={!sp.q && <ButtonLink href={`${base}/athletes/new`}>Add your first athlete</ButtonLink>}
        >
          {sp.q || status !== "active" ? "Try a different search or status filter." : "Add an athlete to start building their program and tracking progress."}
        </EmptyState>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Athletes</caption>
            <thead>
              <tr className="border-b border-ink-700 text-[10px] uppercase tracking-[0.16em] text-stone-500">
                <th scope="col" className="px-5 py-3 font-semibold">Athlete</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                <th scope="col" className="px-3 py-3 font-semibold">Attendance · 28d</th>
                <th scope="col" className="px-3 py-3 font-semibold">Last workout</th>
                <th scope="col" className="px-3 py-3 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const mine = logs.filter((l) => l.athlete_id === a.id);
                const sched = scheduled.filter((s) => s.athlete_id === a.id);
                const att = attendance(sched, today, addDays(today, -27));
                const last = mine.filter((l) => l.status === "completed").at(-1)?.performed_on;
                const flags = a.status === "active" ? attentionReasons({ hasActiveAssignment: sched.some((s) => s.scheduled_date >= addDays(today, -14)) }, sched, mine, today) : [];
                return (
                  <tr key={a.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-850">
                    <td className="px-5 py-3">
                      <Link href={`${base}/athletes/${a.id}`} className="font-medium text-ivory-50 hover:text-accent">
                        {athleteName(a)}
                      </Link>
                      <p className="text-xs text-stone-500">
                        {a.experience_level ? a.experience_level[0]!.toUpperCase() + a.experience_level.slice(1) : "Experience not set"}
                        {a.user_id ? " · portal active" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={a.status === "active" ? "success" : a.status === "paused" ? "warning" : "muted"}>{a.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-ivory-200" data-numeric>
                      {pct(att.rate)} <span className="text-xs text-stone-500">{att.completed + att.missed ? `(${att.completed}/${att.completed + att.missed})` : ""}</span>
                    </td>
                    <td className="px-3 py-3 text-stone-300">{last ? formatDate(last) : <span className="text-stone-500">—</span>}</td>
                    <td className="px-3 py-3 text-xs text-signal-400">{flags.map(describeAttention).join(" · ") || <span className="text-stone-500">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
