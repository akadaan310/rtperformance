"use client";
import { useActionState, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { acceptInvitationAction } from "./actions";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function AcceptForm({ token, kind, suggestedName }: { token: string; kind: string; suggestedName: string }) {
  const [state, action] = useActionState(acceptInvitationAction, null);
  const [name, setName] = useState(suggestedName);
  const [slug, setSlug] = useState(slugify(suggestedName));
  const [slugTouched, setSlugTouched] = useState(false);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "trainer_workspace" && (
        <>
          <Field label="Workspace name" htmlFor="workspace_name" hint="Your coaching business name. You can change it later.">
            <Input
              id="workspace_name"
              name="workspace_name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Workspace address" htmlFor="workspace_slug" hint={<>Your athletes&apos; portal lives at /t/{slug || "your-name"}</>}>
            <Input
              id="workspace_slug"
              name="workspace_slug"
              required
              pattern="[a-z0-9](?:[a-z0-9\-]{1,46}[a-z0-9])"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </Field>
        </>
      )}
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Accepting…">
        {kind === "trainer_workspace" ? "Create my workspace" : "Accept invitation"}
      </SubmitButton>
    </form>
  );
}
