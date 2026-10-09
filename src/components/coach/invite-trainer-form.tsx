"use client";
import { useActionState } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyField } from "@/components/ui/copy-field";
import { Button } from "@/components/ui/button";
import { inviteTrainerAction } from "@/app/w/[slug]/settings/actions";

export function InviteTrainerForm({ slug, kind }: { slug: string; kind: "trainer_workspace" | "workspace_member" }) {
  const [state, action] = useActionState(inviteTrainerAction, null);
  if (state?.ok && state.url)
    return (
      <div className="space-y-4">
        <CopyField value={state.url} />
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Invite someone else
        </Button>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <Field label="Trainer email" htmlFor={`inv-email-${kind}`} error={state?.fieldErrors?.email}>
        <Input id={`inv-email-${kind}`} name="email" type="email" required />
      </Field>
      {kind === "trainer_workspace" && (
        <Field label="Suggested workspace name" htmlFor="inv-ws" optional hint="They can change it when accepting.">
          <Input id="inv-ws" name="workspace_name" placeholder="e.g. Jordan Reyes Strength" />
        </Field>
      )}
      <Field label="Message" htmlFor={`inv-msg-${kind}`} optional>
        <Textarea id={`inv-msg-${kind}`} name="message" className="min-h-16" />
      </Field>
      <Field label="Expires after (days)" htmlFor={`inv-ttl-${kind}`}>
        <Input id={`inv-ttl-${kind}`} name="ttl_days" type="number" min={1} max={30} defaultValue={7} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Create invitation link</SubmitButton>
      <p className="text-xs text-stone-500">Email delivery isn&apos;t connected yet — you&apos;ll get a secure single-use link to share directly.</p>
    </form>
  );
}
