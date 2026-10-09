import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/dates";
import type { WorkoutLog } from "@/lib/types";

export function HistoryList({ logs, hrefFor }: { logs: (WorkoutLog & { set_count: number })[]; hrefFor: (id: string) => string }) {
  if (!logs.length) return <EmptyState title="No workouts yet">Completed workouts and their recorded sets will appear here.</EmptyState>;
  return (
    <ol className="surface divide-y divide-ink-800">
      {logs.map((l) => (
        <li key={l.id}>
          <Link href={hrefFor(l.id)} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ink-850">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ivory-50">{l.title}</p>
              <p className="text-xs text-stone-500">
                {formatDate(l.performed_on, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {l.set_count} sets
                {l.perceived_effort ? ` · effort ${l.perceived_effort}/10` : ""}
                {l.recovery_rating ? ` · recovery ${l.recovery_rating}/5` : ""}
                {l.scheduled_session_id ? "" : " · unscheduled"}
              </p>
            </div>
            {l.status === "completed" ? <Badge tone="success">Completed</Badge> : <Badge tone="warning">In progress</Badge>}
          </Link>
        </li>
      ))}
    </ol>
  );
}
