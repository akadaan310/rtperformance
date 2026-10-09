import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/context";
import { safeNext } from "@/lib/safe-redirect";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect(safeNext(sp.next));
  return (
    <>
      <p className="eyebrow">Create your account</p>
      <h1 className="display mt-3 text-5xl text-ivory-50">Start here.</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-400">
        RT Performance workspaces are invitation-only. Create your account, then open the invitation link your coach or the network sent you.
      </p>
      <div className="mt-10">
        <SignUpForm next={sp.next} email={sp.email} />
      </div>
    </>
  );
}
