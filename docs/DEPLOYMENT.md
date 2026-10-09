# Deploying RT Performance

The app is a standard Next.js 16 project backed by a Supabase project. These steps take it from this repository to a
live site Raymond can use. Nothing below requires a paid RT Performance subscription; standard Supabase / hosting /
Anthropic usage costs apply to whoever owns those accounts.

## 1. Create the Supabase project

1. Create a new project at [supabase.com](https://supabase.com) (Postgres 15+; 17 recommended). Note the project ref.
2. **Auth → URL configuration**: set *Site URL* to the production URL (e.g. `https://rtperformance.app`) and add
   `https://rtperformance.app/**` to *Redirect URLs*.
3. **Auth → Providers → Email**: keep email sign-up enabled. Decide on *Confirm email* (recommended on). Configure a
   custom SMTP sender (Auth → SMTP) so confirmation and password-reset emails come from your domain.
4. **Auth → Policies**: minimum password length 10 with letters and digits (matches the app's validation).

## 2. Apply the migrations

```bash
npm run supabase -- login
npm run supabase -- link --project-ref <project-ref>
npm run supabase -- db push        # applies supabase/migrations/*.sql in order
```

The migrations create the schema, RLS policies, SQL functions, the `brand-assets` (public) and `exercise-media`
(private) storage buckets with policies, and the starter exercise library. They contain **no** client or demo data.

## 3. Provision Raymond

The network-owner role can't be obtained through the UI. After deploying the app (step 4):

1. Raymond creates his account at `/signup` with his own email and password (and confirms his email if required).
2. An operator runs, from a trusted machine:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run provision:owner -- --email raymond@<his-domain> --name "RT Performance" --slug rt-performance
```

This creates the single master workspace (`/w/rt-performance`) with default RT Performance branding and makes Raymond
its owner. It is idempotent and never creates a second master. No password passes through the script.

## 4. Deploy the web app (e.g. Vercel)

1. Import the repository; framework preset *Next.js*; Node 20.9+.
2. Environment variables (Production + Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | the production URL |
| `NEXT_PUBLIC_PRIMARY_WORKSPACE_SLUG` | `rt-performance` (adds "Meet Raymond" to the landing page) |
| `ANTHROPIC_API_KEY` | server-only key for The Tech Guy |
| `ANTHROPIC_MODEL` | a current low-cost Haiku model available to the account (e.g. `claude-haiku-5-5`) |
| `AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_TOKEN_LIMIT` | optional per-user budgets (defaults 150 / 400,000) |

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to the web app — it doesn't use it.

3. Deploy. `npm run build` must pass; the CSP automatically allows the configured Supabase origin.
4. Optional: add a custom domain, then update `NEXT_PUBLIC_SITE_URL` and the Supabase Site/Redirect URLs.

## 5. Smoke test

1. Raymond signs in → `/w/rt-performance`. Workspace → Branding: add his coach photo, bio and logo.
2. Network → invite a trainer → open the link in a private window → create the trainer account → accept.
3. Add an athlete, build and publish a program, assign it, invite the athlete, log a session from the athlete portal.
4. The Tech Guy → "Summarize my coaching week."

## Operational notes

- **Backups**: enable Supabase point-in-time recovery for production data.
- **Rate limiting** across multiple instances: add a shared limiter or WAF rule (see `docs/SECURITY.md`).
- **Email delivery of invitations** is not connected; coaches copy the single-use link. Adding a transactional email
  provider is a contained change in `src/lib/services/invitations.ts`.
- **Custom domains per trainer / independent deployments** are deferred; every trainer has a branded experience at
  `/t/<slug>` and `/t/<slug>/athlete` within the shared app.
- **Demo data**: `npm run db:seed:dev` refuses non-local databases. Never set `RT_ALLOW_REMOTE_DEV_SEED` for production.
