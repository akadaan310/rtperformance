# Security & privacy notes

**Implemented**

- Row Level Security on every tenant table; composite keys prevent cross-tenant references; privileged operations are
  permission-checked SQL functions with pinned `search_path`. Anonymous users can execute only
  `get_public_workspace` and `get_invitation_preview`.
- The web app never uses the Supabase service-role key. Operator scripts read it from the environment.
- Invitations: 256-bit random tokens generated in Postgres, stored as SHA-256 hashes, returned once, bound to the
  invited email (checked against `auth.users` at acceptance), single-use, expiring (1–30 days), revocable; new
  invitations for the same email/purpose revoke older pending ones.
- Public sign-up never grants a workspace or elevated role; the master owner exists only via provisioning.
- Server-side validation (zod) for every server action, route handler and AI tool; SQL constraints as a backstop.
- Error messages: only messages deliberately raised by our SQL functions reach users; constraint/relation details are
  replaced with generic text.
- Rate limits: sign-in/sign-up/recovery/invitation-acceptance (per IP and per IP+email), assistant (per user/minute)
  and durable daily AI budgets in the database. Supabase Auth applies its own limits as well.
- Headers: CSP (`frame-ancestors 'none'`, `object-src 'none'`, restricted `connect-src`/`img-src`), HSTS (production),
  `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy. Supabase SSR cookies are
  `SameSite=Lax`; JSON route handlers also require a same-origin `Origin`.
- Uploads: brand images only, ≤ 2 MB, type determined from file bytes (PNG/JPEG/WebP), stored under the workspace's
  folder with owner-only write policies. SVG is not accepted.
- Audit events for invitations, acceptance, workspace provisioning/suspension, publishing, assignment, athlete
  archive/delete, branding, shared notes and AI-initiated actions (`source = 'ai'`). Metadata is a small summary —
  never tokens or full records.
- AI: allowlisted tools only, no SQL/code/network tools, confirmation for consequential actions, re-check of
  permissions at execution time, minimal fields sent to the provider, conversations private per coach.

**Known trade-offs / follow-ups**

- CSP allows `'unsafe-inline'` scripts (Next.js bootstrap). A nonce-based CSP via the proxy is a reasonable next step.
- The in-memory rate limiter is per server instance. For multi-instance deployments add a shared limiter
  (e.g. Upstash Redis or platform WAF rules) for `/login`, `/signup` and `/api/assistant`.
- Coaches may record audit entries in their own workspace via `log_audit_event` (actor is forced to themselves).
- Email delivery of invitations is not connected; coaches share the single-use link directly.
