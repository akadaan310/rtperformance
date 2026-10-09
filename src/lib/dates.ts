/** Business calendar: RT Performance operates from Tampa, Florida. Override with APP_TIMEZONE. */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/New_York";

/** Today's date (YYYY-MM-DD) in the business time zone. */
export function todayKey(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDate(key: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  if (!key) return "—";
  const d = new Date(key.length === 10 ? `${key}T12:00:00Z` : key);
  return new Intl.DateTimeFormat("en-US", { timeZone: key.length === 10 ? "UTC" : APP_TIMEZONE, ...opts }).format(d);
}

export function formatDateLong(key: string | null | undefined): string {
  return formatDate(key, { weekday: "long", month: "long", day: "numeric" });
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso);
}
