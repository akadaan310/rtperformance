import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand/rt-mark";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { SignOutButton } from "@/components/coach/sign-out-button";
import { homePathFor, listMyMemberships, requireUser } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Your workspaces" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ suspended?: string; unlinked?: string; password?: string; choose?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/home");
  const memberships = await listMyMemberships();
  const active = memberships.filter((m) => m.status === "active");

  if (active.length === 1 && !sp.suspended && !sp.unlinked && !sp.choose) redirect(homePathFor(active[0]!));

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="RT Performance home">
          <Wordmark />
        </Link>
        <SignOutButton />
      </header>
      <main id="main" className="mx-auto max-w-5xl px-6 pb-24 pt-10">
        <p className="eyebrow">Signed in as {user.email}</p>
        <h1 className="display mt-3 text-5xl text-ivory-50 md:text-6xl">{active.length ? "Choose a workspace." : "You're in."}</h1>

        {sp.password === "updated" && <p className="mt-4 text-sm text-sage-400" role="status">Your password was updated.</p>}
        {sp.suspended && (
          <p role="alert" className="mt-6 rounded-xs border border-signal-600/50 bg-signal-600/10 p-4 text-sm text-signal-400">
            The workspace “{sp.suspended}” is currently suspended. Contact the RT Performance network owner if you believe this is a mistake.
          </p>
        )}
        {sp.unlinked && (
          <p role="alert" className="mt-6 rounded-xs border border-gold-600/50 bg-gold-600/10 p-4 text-sm text-gold-300">
            Your athlete login isn&apos;t linked to a profile yet. Ask your coach to send you a fresh invitation link.
          </p>
        )}

        {memberships.length === 0 ? (
          <EmptyState className="mt-10" title="No workspace yet">
            <p>
              RT Performance is invitation-only. When your coach — or the network owner, if you&apos;re a trainer — sends you an invitation link, open it while
              signed in as <strong className="text-ivory-100">{user.email}</strong> and you&apos;ll land in your workspace.
            </p>
          </EmptyState>
        ) : (
          <ul className="mt-10 grid gap-3 md:grid-cols-2">
            {memberships.map((m) => (
              <li key={m.orgId}>
                <Link
                  href={m.status === "active" ? homePathFor(m) : `/home?suspended=${m.slug}`}
                  className="group surface flex items-center justify-between gap-4 p-5 transition-colors hover:border-accent/70"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={m.kind === "master" ? "accent" : "neutral"}>{m.kind === "master" ? "Network HQ" : "Workspace"}</Badge>
                      <Badge tone="muted">{m.role === "owner" ? "Owner" : m.role === "trainer" ? "Trainer" : "Athlete"}</Badge>
                      {m.status !== "active" && <Badge tone="danger">Suspended</Badge>}
                    </div>
                    <p className="display-tight mt-3 text-2xl text-ivory-50">{m.name}</p>
                    <p className="mt-1 text-xs text-stone-500">{m.role === "athlete" ? "Athlete portal" : "Coaching workspace"} · /{m.slug}</p>
                  </div>
                  <ArrowRight className="size-5 text-stone-500 transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
