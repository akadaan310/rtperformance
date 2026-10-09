"use client";
import { useActionState, useState } from "react";
import { BrandTheme, WorkspaceLogo } from "@/components/brand/brand-theme";
import { ConfirmAction } from "@/components/ui/confirm-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { InlineAction } from "@/components/ui/inline-action";
import { accentForeground, contrastRatio, legibleAccent } from "@/lib/brand/color";
import type { BrandSettings } from "@/lib/types";
import { removeBrandImageAction, resetBrandAction, saveBrandAction, uploadBrandImageAction } from "@/app/w/[slug]/settings/actions";

const PRESETS = [
  { name: "RT Gold", hex: "#C8A45D" },
  { name: "Signal Red", hex: "#C2412D" },
  { name: "Ivory", hex: "#EFE8DA" },
  { name: "Steel", hex: "#8FA3B8" },
  { name: "Sage", hex: "#7F9E76" },
  { name: "Copper", hex: "#B87333" },
];

export function BrandEditor({ slug, brand, logoUrl, photoUrl, orgName }: { slug: string; brand: BrandSettings; logoUrl: string | null; photoUrl: string | null; orgName: string }) {
  const [state, action] = useActionState(saveBrandAction, null);
  const [v, setV] = useState({
    display_name: brand.display_name,
    coach_name: brand.coach_name ?? "",
    coach_bio: brand.coach_bio ?? "",
    accent_color: brand.accent_color,
    signal_color: brand.signal_color,
    welcome_headline: brand.welcome_headline ?? "",
    welcome_body: brand.welcome_body ?? "",
    portal_tagline: brand.portal_tagline ?? "",
    location: brand.location ?? "",
    public_profile_enabled: brand.public_profile_enabled,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const validHex = (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h);
  const accentOk = validHex(v.accent_color);
  const adjusted = accentOk && legibleAccent(v.accent_color).toLowerCase() !== v.accent_color.toLowerCase();
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== (brand[k] ?? (typeof v[k] === "boolean" ? false : "")));

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_26rem]">
      <form action={action} className="space-y-8">
        <input type="hidden" name="slug" value={slug} />
        <fieldset className="grid gap-5 md:grid-cols-2">
          <legend className="eyebrow mb-4">Identity</legend>
          <Field label="Workspace display name" htmlFor="b-name" error={state?.fieldErrors?.display_name}>
            <Input id="b-name" name="display_name" value={v.display_name} onChange={set("display_name")} required />
          </Field>
          <Field label="Coach name" htmlFor="b-coach" optional>
            <Input id="b-coach" name="coach_name" value={v.coach_name} onChange={set("coach_name")} />
          </Field>
          <Field label="Location" htmlFor="b-loc" optional>
            <Input id="b-loc" name="location" value={v.location} onChange={set("location")} placeholder="Tampa, Florida" />
          </Field>
          <Field label="Portal tagline" htmlFor="b-tag" optional>
            <Input id="b-tag" name="portal_tagline" value={v.portal_tagline} onChange={set("portal_tagline")} maxLength={140} />
          </Field>
          <Field label="Coach biography" htmlFor="b-bio" optional className="md:col-span-2">
            <Textarea id="b-bio" name="coach_bio" value={v.coach_bio} onChange={set("coach_bio")} maxLength={2000} />
          </Field>
        </fieldset>

        <fieldset className="grid gap-5 md:grid-cols-2">
          <legend className="eyebrow mb-4">Colors</legend>
          {(["accent_color", "signal_color"] as const).map((k) => (
            <Field key={k} label={k === "accent_color" ? "Accent" : "Signal (alerts)"} htmlFor={`b-${k}`} error={state?.fieldErrors?.[k]}>
              <div className="flex gap-2">
                <input aria-label={`${k === "accent_color" ? "Accent" : "Signal"} color picker`} type="color" value={validHex(v[k]) ? v[k] : "#000000"} onChange={set(k)} className="h-10 w-12 cursor-pointer rounded-xs border border-ink-600 bg-ink-900 p-1" />
                <Input id={`b-${k}`} name={k} value={v[k]} onChange={set(k)} pattern="#[0-9A-Fa-f]{6}" required className="font-mono" />
              </div>
            </Field>
          ))}
          <div className="md:col-span-2">
            <p className="mb-2 text-xs text-stone-500">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.hex} type="button" onClick={() => setV((s) => ({ ...s, accent_color: p.hex }))} className="inline-flex items-center gap-2 rounded-xs border border-ink-600 px-2.5 py-1.5 text-xs text-ivory-200 hover:border-ivory-300" aria-label={`Use ${p.name} as accent`}>
                  <span className="size-3.5 rounded-full" style={{ background: p.hex }} aria-hidden /> {p.name}
                </button>
              ))}
            </div>
            {accentOk && (
              <p className="mt-2 text-xs text-stone-500">
                Text on accent uses {accentForeground(legibleAccent(v.accent_color)) === "#111113" ? "charcoal" : "ivory"} ({contrastRatio(legibleAccent(v.accent_color), accentForeground(legibleAccent(v.accent_color))).toFixed(1)}:1 contrast).
                {adjusted && " This accent is very dark, so it is automatically lightened where it appears as text on the dark background."}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="eyebrow mb-4">Athlete portal & public profile</legend>
          <Field label="Welcome headline" htmlFor="b-head" optional>
            <Input id="b-head" name="welcome_headline" value={v.welcome_headline} onChange={set("welcome_headline")} maxLength={140} />
          </Field>
          <Field label="Supporting text" htmlFor="b-body" optional>
            <Textarea id="b-body" name="welcome_body" value={v.welcome_body} onChange={set("welcome_body")} maxLength={600} className="min-h-16" />
          </Field>
          <Checkbox
            name="public_profile_enabled"
            checked={v.public_profile_enabled}
            onChange={(e) => setV((s) => ({ ...s, public_profile_enabled: e.target.checked }))}
            label={
              <>
                <span className="font-medium text-ivory-100">Public coach profile</span>
                <span className="block text-xs text-stone-500">Shows your name, bio, photo and location at /t/{slug}. When off, that page shows only your workspace name and a sign-in link.</span>
              </>
            }
          />
        </fieldset>

        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="lg">Save branding</SubmitButton>
          {dirty && <span className="text-xs text-gold-300">Unsaved changes — the preview shows them.</span>}
        </div>
      </form>

      <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
        <div>
          <p className="eyebrow mb-3">Live preview · athlete portal</p>
          <BrandTheme accent={accentOk ? v.accent_color : brand.accent_color} signal={validHex(v.signal_color) ? v.signal_color : brand.signal_color}>
            <div className="overflow-hidden rounded-sm border border-ink-700 bg-ink-950">
              <div className="flex items-center gap-2.5 border-b border-ink-800 px-4 py-3">
                <WorkspaceLogo logoUrl={logoUrl} name={v.display_name || orgName} className="h-7 w-7" />
                <span className="text-sm font-semibold text-ivory-50">{v.display_name || orgName}</span>
              </div>
              <div className="relative p-5">
                <div aria-hidden className="absolute inset-x-5 top-0 h-px rule-accent" />
                <p className="eyebrow mt-2 text-accent">{v.portal_tagline || "Today"}</p>
                <p className="display mt-2 text-3xl text-ivory-50">{v.welcome_headline || "Welcome back."}</p>
                {v.welcome_body && <p className="mt-2 text-xs leading-relaxed text-stone-400">{v.welcome_body}</p>}
                <div className="mt-5 rounded-xs border border-ink-700 p-3">
                  <p className="eyebrow">Today&apos;s session</p>
                  <p className="display-tight mt-1 text-lg text-ivory-50">Lower Strength</p>
                  <div className="mt-3 flex gap-2">
                    <span className="inline-flex h-8 items-center rounded-xs bg-accent px-3 text-xs font-semibold text-accent-fg">Start workout</span>
                    <span className="inline-flex h-8 items-center rounded-xs border border-signal/70 px-3 text-xs text-signal">1 missed</span>
                  </div>
                </div>
              </div>
            </div>
          </BrandTheme>
        </div>

        <div className="surface space-y-5 p-5">
          <ImageSlot slug={slug} kind="logo" label="Logo" url={logoUrl} hint="Square PNG, JPEG or WebP, up to 2 MB." />
          <ImageSlot slug={slug} kind="photo" label="Coach photo" url={photoUrl} hint="Portrait orientation works best. Up to 2 MB." />
        </div>

        <div className="surface p-5">
          <p className="text-sm font-semibold text-ivory-50">Restore defaults</p>
          <p className="mt-1 text-xs text-stone-500">Resets colors, headline, tagline and removes the logo and photo. Names and bio are kept.</p>
          <div className="mt-3">
            <ConfirmAction action={resetBrandAction} fields={{ slug }} trigger="Restore RT Performance defaults" title="Restore default branding?" body="Your athletes will see the RT Performance defaults immediately." confirmLabel="Restore defaults" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function ImageSlot({ slug, kind, label, url, hint }: { slug: string; kind: "logo" | "photo"; label: string; url: string | null; hint: string }) {
  const [state, action] = useActionState(uploadBrandImageAction, null);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-300">{label}</p>
      <div className="flex items-start gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xs border border-ink-700 bg-ink-950">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded asset
            <img src={url} alt={`Current ${label.toLowerCase()}`} className="size-full object-cover" />
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-stone-500">None</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <form action={action} className="space-y-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="kind" value={kind} />
            <label className="sr-only" htmlFor={`file-${kind}`}>
              Upload {label}
            </label>
            <input id={`file-${kind}`} name="file" type="file" accept="image/png,image/jpeg,image/webp" required className="block w-full text-xs text-stone-400 file:mr-3 file:rounded-xs file:border-0 file:bg-ink-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ivory-100" />
            <SubmitButton size="sm" variant="secondary" pendingLabel="Uploading…">
              Upload
            </SubmitButton>
          </form>
          {url && (
            <InlineAction action={removeBrandImageAction} fields={{ slug, kind }} variant="quiet">
              Remove
            </InlineAction>
          )}
          <p className="text-[11px] text-stone-500">{hint}</p>
          <FormMessage state={state} />
        </div>
      </div>
    </div>
  );
}
