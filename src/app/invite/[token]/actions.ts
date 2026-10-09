"use server";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/auth/context";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { failure } from "@/lib/result";
import { acceptInvitation } from "@/lib/services/invitations";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/ui/confirm-form";
import type { Role } from "@/lib/auth/permissions";

export async function acceptInvitationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!rateLimit(`accept:${await clientIp()}`, 20, 15 * 60_000).ok) return { ok: false, error: "Too many attempts. Try again shortly." };
  const supabase = await createClient();
  let dest: string;
  try {
    const res = await acceptInvitation(supabase, {
      token: formData.get("token"),
      workspace_name: formData.get("workspace_name") || null,
      workspace_slug: formData.get("workspace_slug") || null,
    });
    dest = res.role === "owner" && formData.get("kind") === "trainer_workspace" ? `/w/${res.slug}/settings?welcome=1` : homePathFor({ slug: res.slug, role: res.role as Role });
  } catch (err) {
    return failure(err);
  }
  redirect(dest);
}
