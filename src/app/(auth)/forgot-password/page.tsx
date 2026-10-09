import type { Metadata } from "next";
import { ForgotPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <p className="eyebrow">Account recovery</p>
      <h1 className="display mt-3 text-5xl text-ivory-50">Reset password.</h1>
      <p className="mt-3 text-sm text-stone-400">We&apos;ll email you a secure link to choose a new password.</p>
      <div className="mt-10">
        <ForgotPasswordForm />
      </div>
    </>
  );
}
