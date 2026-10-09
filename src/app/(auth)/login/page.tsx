import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/context";
import { safeNext } from "@/lib/safe-redirect";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect(safeNext(sp.next));
  return (
    <>
      <p className="eyebrow">Welcome back</p>
      <h1 className="display mt-3 text-5xl text-ivory-50">Sign in.</h1>
      <p className="mt-3 text-sm text-stone-400">Coaches, trainers and athletes all sign in here.</p>
      <div className="mt-10">
        <SignInForm next={sp.next} email={sp.email} />
      </div>
    </>
  );
}
