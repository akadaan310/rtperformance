"use server";
import { formString, runInWorkspace } from "@/lib/actions";
import { ServiceError } from "@/lib/result";
import { removeBrandImage, resetBrand, updateBrand, uploadBrandImage } from "@/lib/services/branding";
import { createInvitation, revokeInvitation } from "@/lib/services/invitations";
import { setMembershipStatus } from "@/lib/services/team";
import type { ActionState } from "@/components/ui/confirm-form";

export async function saveBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await updateBrand(ctx, {
      display_name: formString(fd, "display_name"),
      coach_name: formString(fd, "coach_name"),
      coach_bio: formString(fd, "coach_bio"),
      accent_color: formString(fd, "accent_color"),
      signal_color: formString(fd, "signal_color"),
      welcome_headline: formString(fd, "welcome_headline"),
      welcome_body: formString(fd, "welcome_body"),
      portal_tagline: formString(fd, "portal_tagline"),
      location: formString(fd, "location"),
      public_profile_enabled: fd.get("public_profile_enabled") === "on",
    });
    return "Branding saved. Your athlete portal and public profile now use it.";
  }, { revalidate: [`/w/${slug}`, `/t/${slug}`] });
}

export async function resetBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await resetBrand(ctx);
    return "Branding restored to RT Performance defaults.";
  }, { revalidate: [`/w/${slug}`, `/t/${slug}`] });
}

export async function uploadBrandImageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  const kind = formString(fd, "kind") === "photo" ? "photo" : "logo";
  return runInWorkspace(slug, async (ctx) => {
    const file = fd.get("file");
    if (!(file instanceof File)) throw new ServiceError("Choose an image to upload.");
    await uploadBrandImage(ctx, kind, file);
    return kind === "logo" ? "Logo updated." : "Photo updated.";
  }, { revalidate: [`/w/${slug}`, `/t/${slug}`] });
}

export async function removeBrandImageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await removeBrandImage(ctx, formString(fd, "kind") === "photo" ? "photo" : "logo");
  }, { revalidate: [`/w/${slug}`, `/t/${slug}`] });
}

export async function inviteTrainerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  let url = "";
  const res = await runInWorkspace(slug, async (ctx) => {
    const inv = await createInvitation(ctx, {
      kind: formString(fd, "kind") === "trainer_workspace" ? "trainer_workspace" : "workspace_member",
      email: formString(fd, "email"),
      workspace_name: formString(fd, "workspace_name"),
      message: formString(fd, "message"),
      ttl_days: formString(fd, "ttl_days") || 7,
    });
    url = inv.url;
    return "Invitation created.";
  }, { revalidate: [`/w/${slug}/settings/team`, `/w/${slug}/network`] });
  return res?.ok ? { ...res, url } : res;
}

export async function revokeInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await revokeInvitation(ctx, formString(fd, "invitation_id"));
    return "Invitation revoked.";
  }, { revalidate: [`/w/${slug}/settings/team`, `/w/${slug}/network`] });
}

export async function memberStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug");
  return runInWorkspace(slug, async (ctx) => {
    await setMembershipStatus(ctx, formString(fd, "membership_id"), formString(fd, "status") === "active" ? "active" : "revoked");
    return "Access updated.";
  }, { revalidate: [`/w/${slug}/settings/team`] });
}
