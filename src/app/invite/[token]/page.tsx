import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/rt-mark";
import { ButtonLink } from "@/components/ui/button";
import { SignOutButton } from "@/components/coach/sign-out-button";
import { getSessionUser } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { previewInvitation } from "@/lib/services/invitations";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

const KIND_COPY: Record<string, { label: string; body: (org: string) => string }> = {
  trainer_workspace: {
    label: "Trainer network invitation",
    body: (org) => `${org} has invited you to establish your own coaching workspace in the RT Performance network. Your clients, programs and notes stay in your workspace.`,
  },
  workspace_member: { label: "Trainer invitation", body: (org) => `You've been invited to coach alongside the team at ${org}.` },
  athlete: { label: "Athlete invitation", body: (org) => `Your coach at ${org} has set up your training portal. Accept to see your program and start logging sessions.` },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const [preview, user] = await Promise.all([
    previewInvitation(supabase, token).then(
      (invite) => ({ invite, failed: false }),
      () => ({ invite: null, failed: true }),
    ),
    getSessionUser(),
  ]);
  const { invite, failed: loadFailed } = preview;
  const next = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="RT Performance home">
          <Wordmark />
        </Link>
        {user && <SignOutButton />}
      </header>
      <main id="main" className="mx-auto max-w-xl px-6 pb-24 pt-10">
        {loadFailed ? (
          <Problem title="Couldn't load invitation" body="Something went wrong on our side. Refresh the page in a moment." />
        ) : !invite ? (
          <Problem title="Invitation not found" body="This link isn't valid. Check that you copied the whole link, or ask for a new invitation." />
        ) : invite.status !== "pending" ? (
          <Problem
            title={{ accepted: "Already accepted", revoked: "Invitation revoked", expired: "Invitation expired" }[invite.status]}
            body={
              invite.status === "accepted"
                ? "This invitation has already been used. Sign in to reach your workspace."
                : "Ask whoever invited you to send a new invitation link."
            }
            action={invite.status === "accepted" ? <ButtonLink href="/home">Go to my workspace</ButtonLink> : undefined}
          />
        ) : (
          <div className="surface-raised p-8">
            <p className="eyebrow text-accent">{KIND_COPY[invite.kind]?.label}</p>
            <h1 className="display mt-3 text-4xl text-ivory-50">{invite.organization_name}</h1>
            <p className="mt-4 text-sm leading-relaxed text-stone-300">{KIND_COPY[invite.kind]?.body(invite.organization_name)}</p>
            {invite.message && <blockquote className="editorial mt-5 border-l-2 border-accent pl-4 text-lg text-ivory-100">&ldquo;{invite.message}&rdquo;</blockquote>}
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-700 pt-5 text-xs">
              <div>
                <dt className="eyebrow">Invited</dt>
                <dd className="mt-1 break-all text-ivory-100">{invite.email}</dd>
              </div>
              <div>
                <dt className="eyebrow">Expires</dt>
                <dd className="mt-1 text-ivory-100">{formatDate(invite.expires_at, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
              </div>
            </dl>
            <div className="mt-8">
              {!user ? (
                <div className="space-y-3">
                  <p className="text-sm text-stone-400">Sign in or create an account with {invite.email} to accept.</p>
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}>Create account</ButtonLink>
                    <ButtonLink href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`} variant="secondary">
                      I already have an account
                    </ButtonLink>
                  </div>
                </div>
              ) : user.email.toLowerCase() !== invite.email.toLowerCase() ? (
                <p role="alert" className="rounded-xs border border-gold-600/50 bg-gold-600/10 p-4 text-sm text-gold-300">
                  You&apos;re signed in as {user.email}, but this invitation is for {invite.email}. Sign out and sign in with the invited address.
                </p>
              ) : (
                <AcceptForm token={token} kind={invite.kind} suggestedName={invite.workspace_name || ""} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Problem({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="text-center">
      <p className="eyebrow">Invitation</p>
      <h1 className="display mt-3 text-5xl text-ivory-50">{title}</h1>
      <p className="mx-auto mt-4 max-w-sm text-sm text-stone-400">{body}</p>
      {action && <div className="mt-8 flex justify-center">{action}</div>}
    </div>
  );
}
