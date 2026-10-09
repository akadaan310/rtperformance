import { assertCan } from "@/lib/auth/permissions";
import { publicEnv } from "@/lib/env";
import { dbError, parseInput, ServiceError } from "@/lib/result";
import type { BrandSettings } from "@/lib/types";
import { brandInput, brandPatchInput } from "@/lib/validation";
import { audit } from "./audit";
import type { ServiceContext } from "./context";

export const BRAND_DEFAULTS = {
  accent_color: "#C8A45D",
  signal_color: "#C2412D",
  welcome_headline: "Discipline creates momentum. Progress makes it measurable.",
  welcome_body: "Personal training built around intentional programming, consistent execution, and intelligent adjustment.",
  portal_tagline: "Built on discipline. Engineered for progress.",
} as const;

export async function getBrand(ctx: ServiceContext): Promise<BrandSettings | null> {
  const { data, error } = await ctx.supabase.from("brand_settings").select("*").eq("org_id", ctx.org.id).maybeSingle();
  if (error) throw dbError(error);
  return data as BrandSettings | null;
}

export async function updateBrand(ctx: ServiceContext, input: unknown): Promise<BrandSettings> {
  assertCan(ctx, "brand.write", "Only workspace owners can change branding.");
  const values = parseInput(brandInput, input);
  return writeBrand(ctx, values, Object.keys(values));
}

/** Partial update used by The Tech Guy (after explicit confirmation). */
export async function patchBrand(ctx: ServiceContext, input: unknown): Promise<BrandSettings> {
  assertCan(ctx, "brand.write", "Only workspace owners can change branding.");
  const values = parseInput(brandPatchInput, input);
  const keys = Object.keys(values).filter((k) => values[k as keyof typeof values] !== undefined);
  if (!keys.length) throw new ServiceError("No branding changes were provided.");
  return writeBrand(ctx, values, keys);
}

async function writeBrand(ctx: ServiceContext, values: Record<string, unknown>, keys: string[]): Promise<BrandSettings> {
  const { data, error } = await ctx.supabase
    .from("brand_settings")
    .upsert({ display_name: ctx.org.name, ...values, org_id: ctx.org.id, updated_by: ctx.user.id }, { onConflict: "org_id" })
    .select("*")
    .single();
  if (error) throw dbError(error, "Could not save branding.");
  await audit(ctx, "brand.updated", { type: "organization", id: ctx.org.id }, { fields: keys });
  return data as BrandSettings;
}

export async function resetBrand(ctx: ServiceContext): Promise<BrandSettings> {
  assertCan(ctx, "brand.write", "Only workspace owners can change branding.");
  const { data, error } = await ctx.supabase
    .from("brand_settings")
    .update({ ...BRAND_DEFAULTS, display_name: ctx.org.name, logo_path: null, photo_path: null, updated_by: ctx.user.id })
    .eq("org_id", ctx.org.id)
    .select("*")
    .single();
  if (error) throw dbError(error);
  await audit(ctx, "brand.reset", { type: "organization", id: ctx.org.id });
  return data as BrandSettings;
}

const IMAGE_SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
];
export const MAX_BRAND_IMAGE_BYTES = 2 * 1024 * 1024;

/** Identifies an uploaded image by its bytes (never by the client-supplied name or MIME type). */
export function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const sig = IMAGE_SIGNATURES.find((s) => s.test(bytes));
  return sig ? { mime: sig.mime, ext: sig.ext } : null;
}

export async function uploadBrandImage(ctx: ServiceContext, kind: "logo" | "photo", file: File): Promise<string> {
  assertCan(ctx, "brand.write", "Only workspace owners can change branding.");
  if (file.size === 0) throw new ServiceError("Choose an image to upload.");
  if (file.size > MAX_BRAND_IMAGE_BYTES) throw new ServiceError("Images must be 2 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw new ServiceError("Upload a PNG, JPEG or WebP image.");
  const path = `${ctx.org.id}/${kind}-${Date.now()}.${type.ext}`;
  const { error } = await ctx.supabase.storage.from("brand-assets").upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
  if (error) throw new ServiceError("Image storage is not available. Check that the Supabase Storage bucket 'brand-assets' exists.");
  const column = kind === "logo" ? "logo_path" : "photo_path";
  const { error: updErr } = await ctx.supabase.from("brand_settings").update({ [column]: path, updated_by: ctx.user.id }).eq("org_id", ctx.org.id);
  if (updErr) throw dbError(updErr);
  await audit(ctx, "brand.image_uploaded", { type: "organization", id: ctx.org.id }, { kind });
  return path;
}

export async function removeBrandImage(ctx: ServiceContext, kind: "logo" | "photo"): Promise<void> {
  assertCan(ctx, "brand.write", "Only workspace owners can change branding.");
  const column = kind === "logo" ? "logo_path" : "photo_path";
  const { error } = await ctx.supabase.from("brand_settings").update({ [column]: null }).eq("org_id", ctx.org.id);
  if (error) throw dbError(error);
}

export function brandAssetUrl(path: string | null | undefined): string | null {
  if (!path || !publicEnv.supabaseUrl) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/brand-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}
