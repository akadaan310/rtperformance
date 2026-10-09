import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/context";
import { ResetPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  return (
    <>
      <p className="eyebrow">Account recovery</p>
      <h1 className="display mt-3 text-5xl text-ivory-50">New password.</h1>
      {user ? (
        <div className="mt-10">
          <ResetPasswordForm />
        </div>
      ) : (
        <div className="mt-6 space-y-4 text-sm text-stone-400">
          <p>This page opens from the link in your password reset email. That link may have expired.</p>
          <ButtonLink href="/forgot-password">Request a new link</ButtonLink>
        </div>
      )}
    </>
  );
}
