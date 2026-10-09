import type { NextRequest } from "next/server";

/**
 * Defense-in-depth CSRF check for JSON route handlers (session cookies are already SameSite=Lax):
 * browsers always send Origin on cross-origin POSTs, so require it to match the request host.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
