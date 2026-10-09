/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: unknown, fallback = "/home"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/^\/(login|signup|auth)(\/|$|\?)/.test(next)) return fallback;
  return next;
}
