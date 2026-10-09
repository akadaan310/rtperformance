import type { Metadata } from "next";
import { PreferencesForm } from "@/components/athlete/preferences-form";
import { SignOutButton } from "@/components/coach/sign-out-button";
import { Panel } from "@/components/ui/feedback";
import { requireAthleteWorkspace } from "@/lib/auth/context";
import { formatRelative } from "@/lib/dates";
import { athleteName, getAthlete } from "@/lib/services/athletes";
import { listNotes } from "@/lib/services/goals";

export const metadata: Metadata = { title: "Profile" };

export default async function AthleteProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireAthleteWorkspace(slug);
  const [athlete, notes] = await Promise.all([getAthlete(ctx, ctx.athleteId), listNotes(ctx, ctx.athleteId)]);
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{ctx.user.email}</p>
        <h1 className="display mt-2 text-4xl text-ivory-50">{athleteName(athlete)}</h1>
      </header>
      <Panel title="Training preferences" eyebrow="Shared with your coach">
        <PreferencesForm slug={ctx.org.slug} athlete={athlete} />
      </Panel>
      <Panel title="Notes from your coach" bodyClassName="p-0">
        {notes.length ? (
          <ul className="divide-y divide-ink-800">
            {notes.map((n) => (
              <li key={n.id} className="px-5 py-4">
                <p className="whitespace-pre-line text-sm text-ivory-100">{n.body}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {n.author_name ?? "Coach"} · {formatRelative(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-stone-500">Notes your coach chooses to share will appear here.</p>
        )}
      </Panel>
      <Panel title="Account">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-400">
          <span>Signed in as {ctx.user.email}</span>
          <SignOutButton />
        </div>
      </Panel>
    </div>
  );
}
