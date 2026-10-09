# RT Performance

**Raymond Tate Performance — Relentless Training. Intelligent Progress.**

RT Performance is a personal-training and trainer-network platform built for Raymond Tate in Tampa, Florida. One
shared application serves Raymond's own coaching business, the independent workspaces of trainers he invites, and a
dedicated portal for every athlete — with a built-in AI assistant, **The Tech Guy**.

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, custom editorial design system (Archivo + Instrument Serif) |
| Data & auth | Supabase Postgres + Auth, Row Level Security on every tenant table, Storage for brand images |
| AI | Anthropic Messages API (server-side only), allowlisted typed tools, confirmation for consequential actions |
| Tests | Vitest (unit + database integration), Playwright (end-to-end scenarios) |

## What's in the box

- **Public site** (`/`) — editorial landing page, sign-in/sign-up, password recovery, invitation acceptance.
- **Coach workspace** (`/w/[slug]`) — command center, athlete roster and profiles, program builder with versioning,
  exercise library, progress analytics, coach notes, The Tech Guy, branding editor, team management.
- **Network administration** (`/w/[slug]/network`, network owner only) — invite trainers, aggregate-only workspace
  reporting, suspension/reactivation, audit history.
- **Trainer workspaces** — each invited trainer gets an independent, brandable workspace on the same engine.
- **Public workspace page** (`/t/[slug]`) and **athlete portal** (`/t/[slug]/athlete`) — mobile-first: today's
  session, set-by-set logging, history, progress charts, goals, coach-shared notes, preferences. Installable (PWA manifest).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the tenancy and security model, [docs/METRICS.md](docs/METRICS.md)
for metric definitions, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) to go live, and [docs/SECURITY.md](docs/SECURITY.md).

## Run it locally

Requirements: Node.js ≥ 20.9.

### Option A — Supabase CLI (Docker)

```bash
npm install
npm run supabase -- start          # starts Postgres/Auth/Storage and applies supabase/migrations
cp .env.example .env.local         # fill NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY from `supabase status`
npm run db:seed:dev                # optional demo data (local only)
npm run dev                        # http://localhost:3000
```

### Option B — Docker-free local stack (used to build and test this release)

Runs real Postgres 16 + Supabase Auth (GoTrue) + PostgREST behind a tiny gateway at `http://127.0.0.1:54321`.
Requires PostgreSQL 16 server binaries (`/usr/lib/postgresql/16/bin`). Storage is not included in this mode.

```bash
npm install
npm run stack:start                # downloads PostgREST + Auth binaries, applies migrations, prints local keys
# put the printed values into .env.local (plus NEXT_PUBLIC_SITE_URL=http://localhost:3000)
npm run db:seed:dev                # demo data: raymond@rtperformance.dev / Demo-Training-2026 (local only)
npm run dev
npm run stack:reset                # wipe and rebuild the local database from migrations
```

Demo accounts created by the dev seed (password `Demo-Training-2026`, local only):
`raymond@rtperformance.dev` (network owner) · `jordan@reyesstrength.dev` (trainer) ·
`maya@athlete.dev`, `devon@athlete.dev`, `sam@athlete.dev` (athletes).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript (`tsc --noEmit`) and ESLint |
| `npm test` | Unit tests (pure logic: permissions, metrics, schedule, validation, AI tool gating) |
| `npm run test:db` | Integration tests against a running local stack (RLS, invitations, programs, logging, AI) |
| `npm run test:e2e` | Playwright scenarios A–E (expects the dev seed; set `PLAYWRIGHT_CHROMIUM_PATH` to use a system Chromium) |
| `npm run provision:owner` | Authorized creation of the master workspace + network owner ([docs](docs/DEPLOYMENT.md#3-provision-raymond)) |
| `npm run db:seed:dev` | Development-only demo data (refuses non-local databases) |
| `npm run stack:start` / `stack:stop` / `stack:reset` | Docker-free local Supabase-compatible stack |

## Configuration

All variables are documented in [`.env.example`](.env.example). The app runtime needs only the Supabase URL + anon
key; `SUPABASE_SERVICE_ROLE_KEY` is used exclusively by operator scripts. The Tech Guy is enabled by setting both
`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` on the server — without them the assistant shows a clear "not connected" state
and everything else keeps working.

## Imagery

Landing-page photography is licensed from Unsplash and is placeholder imagery — it does not depict Raymond or any
client. Replace the files listed in [`public/images/CREDITS.md`](public/images/CREDITS.md) (slots are defined in
`src/lib/brand/imagery.ts`) once Raymond provides his own photography.
