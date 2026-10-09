"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "./actions";

export function SignInForm({ next, email }: { next?: string; email?: string }) {
  const [state, action] = useActionState(signInAction, null);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <div className="flex justify-between text-xs text-stone-400">
        <Link href="/forgot-password" className="hover:text-accent">
          Forgot password?
        </Link>
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="hover:text-accent">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm({ next, email }: { next?: string; email?: string }) {
  const [state, action] = useActionState(signUpAction, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email" hint="Use the address your coach invited, if you have an invitation.">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-xs text-stone-400">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-ivory-100 hover:text-accent">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  return (
    <form action={action} className="space-y-5">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
      <p className="text-center text-xs text-stone-400">
        <Link href="/login" className="hover:text-accent">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-5">
      <Field label="New password" htmlFor="password" hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg">
        Update password
      </SubmitButton>
    </form>
  );
}
