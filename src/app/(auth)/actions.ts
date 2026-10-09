"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp } from "@/lib/client-ip";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/ui/confirm-form";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(200),
});

const newPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Include at least one letter and one number");

/** Per-IP and per-IP+email throttles. AUTH_RATE_LIMIT_FACTOR (default 1) may be raised for automated test runs only. */
async function limited(scope: string, key: string, base: number): Promise<boolean> {
  const factor = Math.max(1, Number(process.env.AUTH_RATE_LIMIT_FACTOR) || 1);
  const limit = base * factor;
  const ip = await clientIp();
  return !rateLimit(`${scope}:${ip}`, limit * 3, 15 * 60_000).ok || !rateLimit(`${scope}:${ip}:${key}`, limit, 15 * 60_000).ok;
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details." };
  if (await limited("signin", parsed.data.email, 8)) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: "That email and password combination didn't work." };
  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "Enter your name").max(120),
      email: z.string().trim().toLowerCase().email("Enter a valid email address"),
      password: newPassword,
    })
    .safeParse({ full_name: formData.get("full_name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details." };
  if (await limited("signup", parsed.data.email, 4)) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    return { ok: false, error: /registered|exists/i.test(error.message) ? "An account with that email already exists. Sign in instead." : "We couldn't create that account. Try again." };
  }
  if (data.session) redirect(next);
  return { ok: true, message: "Check your inbox to confirm your email address, then come back to continue." };
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { ok: false, error: "Enter a valid email address." };
  if (await limited("recover", email.data, 3)) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists.
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = newPassword.safeParse(formData.get("password"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Choose a stronger password." };
  if (formData.get("password") !== formData.get("confirm")) return { ok: false, error: "The passwords don't match." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { ok: false, error: "We couldn't update your password. Request a new reset link." };
  redirect("/home?password=updated");
}
