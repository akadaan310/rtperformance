# Architecture

## Tenancy

One application, isolated workspaces (`organizations`), explicit `memberships`.

```
organizations (kind = master)  ── Raymond Tate Performance  ←── exactly one, created by provisioning
   ▲ parent_org_id
organizations (kind = trainer) ── one per invited trainer (created when the trainer accepts)
memberships (org_id, user_id, role ∈ owner | trainer | athlete, status)
athlete_profiles.user_id ── links an athlete login to exactly one profile per workspace (via invitation only)
```

Roles:

| Role | Where | Can |
|---|---|---|
| **Network owner** | owner of the master org | everything an owner can in the master workspace, plus invite trainers to the network, aggregate network reporting, suspend/reactivate trainer workspaces |
| **Owner** | any workspace | coach + branding, team management, audit log, permanent deletes |
| **Trainer** | any workspace | athletes, programs, assignments, logging, notes, goals, The Tech Guy |
| **Athlete** | any workspace | their own profile preferences, assigned program versions, schedule, workout logs, goals, notes shared with them |

The permission matrix lives in `src/lib/auth/permissions.ts` and mirrors — never replaces — the database policies.

## Authorization layers

1. **Proxy** (`src/proxy.ts`) refreshes the Supabase session and redirects anonymous users away from private areas (UX only).
2. **Workspace context** (`src/lib/auth/context.ts`) resolves the user's membership for the requested slug from the
   session. Unknown slugs and non-membership are indistinguishable (404).
3. **Services** (`src/lib/services/*`) validate input with zod (`src/lib/validation.ts`), check `can(principal, permission)`,
   and query with the user's RLS-bound Supabase client, always filtering by the session's `org_id`.
4. **Postgres** enforces the real boundary:
   - RLS on all 25 tenant tables (`supabase/migrations/…_rls.sql`), using `SECURITY DEFINER` helpers in a non-exposed
     `private` schema (`is_coach`, `is_athlete_self`, …) with pinned `search_path`.
   - Composite foreign keys `(id, org_id)` so a child row can never reference a parent in another workspace.
   - Triggers that freeze published program versions, keep athletes to their own preference fields, link athlete
     logins only through invitations, and validate cross-references.
   - Privileged operations as RPCs with explicit checks: invitations, acceptance, workspace status, network reporting,
     publishing, assignment (+ schedule generation), workout start.
   - Clients cannot write `memberships`, `invitations`, `audit_events` or `ai_usage` directly.

The app runtime never uses the service-role key.

## Network privacy

Raymond's membership in the master org gives him **no** read access to trainer workspaces' rows. The only cross-tenant
view is `public.network_workspaces()` — owner-only, returning counts (athletes, programs, assignments, workouts in 30
days, last activity) and the trainer's name/email. Any future shared reporting must be an explicit, permission-checked
function in the same style.

## Programs & history

`program_templates` → `program_versions` (draft | published) → `program_sessions` → `program_exercises`.
Publishing locks a version (database trigger); revising opens version N+1 as a copy. `assignments` pin a published
`version_id`; `scheduled_sessions` are generated at assignment time. `start_workout` snapshots each prescription into
`workout_log_exercises.planned`; performed values live in `workout_log_sets`. Templates can change freely without
rewriting anything an athlete was assigned or recorded.

## The Tech Guy

- Route: `POST /api/assistant` → `runAssistantTurn` (`src/lib/ai/runner.ts`); confirmations via
  `POST /api/assistant/actions/[id]` → `decidePendingAction`.
- Model id from `ANTHROPIC_MODEL`; key from `ANTHROPIC_API_KEY`; server-only (`src/lib/server-env.ts`, `server-only` import).
- Bounded loop: ≤ 6 tool steps, 2,048 output tokens per call, 45 s timeout, 1 retry, effort `low` by default.
- Tools (`src/lib/ai/tools.ts`) are an allowlist with zod schemas → JSON Schema (`additionalProperties: false`). No tool
  accepts a workspace, user or role; those come from the session. Every call passes `validateToolCall`
  (allowlist → schema → role permission) and then runs through the same services as the UI (re-validated, under RLS).
- **Read tools** run immediately. **Draft tools** create drafts/records (program drafts, athlete profiles).
  **Confirm tools** (invitations, publishing, assignment, branding) only insert an `ai_pending_actions` row; the user
  confirms in the UI, the action is atomically claimed, re-validated and re-permission-checked, then executed. The
  real result is shown and written back into the conversation.
- Context minimisation: athlete tools omit contact details; metrics are computed deterministically in code and passed
  as summaries. Conversations are private to the coach (RLS) and replayed from the last 24 messages plus a short
  deterministic memo of actions taken.
- Limits: 8 requests/minute per user (in-memory), daily request/token budgets per user (`ai_usage`, written only via
  `record_ai_usage`). Provider failures produce a friendly message; the rest of the product is unaffected.
- No vector database, no background agents, no multi-agent framework.

## Branding

`brand_settings` per workspace: display name, coach name/bio/photo, logo, accent + signal colors, welcome copy, portal
tagline, location, public-profile switch. `BrandTheme` scopes colors via CSS variables; very dark accents are lifted for
legibility and accent foregrounds are chosen by contrast. Public pages read only `get_public_workspace(slug)`.
Images go to the public `brand-assets` bucket under `<org_id>/…` with owner-only write policies and byte-level type checks.
