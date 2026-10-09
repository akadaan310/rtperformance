-- RT Performance · The Tech Guy (AI assistant) + audit trail

create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'New conversation' check (char_length(title) between 1 and 120),
  summary    text check (summary is null or char_length(summary) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index ai_conversations_user_idx on public.ai_conversations (org_id, user_id, updated_at desc);
create trigger ai_conversations_touch before update on public.ai_conversations
  for each row execute function private.touch_updated_at();

-- content holds Anthropic-format content blocks (text / tool_use / tool_result) so a conversation
-- can be replayed to the model; `display` holds the UI-facing rendering (text + structured cards).
create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversation_id uuid not null,
  role            text not null check (role in ('user', 'assistant')),
  content         jsonb not null,
  display         jsonb,
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  created_at      timestamptz not null default now(),
  foreign key (conversation_id, org_id) references public.ai_conversations (id, org_id) on delete cascade
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Consequential actions proposed by the assistant wait here for explicit human confirmation.
create table public.ai_pending_actions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversation_id uuid not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  tool_name       text not null check (char_length(tool_name) <= 64),
  input           jsonb not null,
  summary         text not null check (char_length(summary) <= 2000),
  status          text not null default 'pending'
                  check (status in ('pending', 'executing', 'executed', 'cancelled', 'failed')),
  result          jsonb,
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (conversation_id, org_id) references public.ai_conversations (id, org_id) on delete cascade
);
create index ai_pending_actions_conversation_idx on public.ai_pending_actions (conversation_id, created_at);

-- Daily usage ledger used for request/token budgets. Written only through record_ai_usage().
create table public.ai_usage (
  org_id        uuid not null references public.organizations (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  usage_date    date not null default current_date,
  requests      integer not null default 0 check (requests >= 0),
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  primary key (org_id, user_id, usage_date)
);

-- ---------------------------------------------------------------------------
-- Audit events. Never store secrets or full private records here; metadata is a small summary.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id          bigint generated always as identity primary key,
  org_id      uuid references public.organizations (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id   uuid,
  source      text not null default 'app' check (source in ('app', 'ai', 'system')),
  metadata    jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 4000),
  created_at  timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (org_id, created_at desc);

create or replace function private.audit(
  p_org uuid, p_action text, p_target_type text, p_target_id uuid,
  p_source text default 'app', p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, source, metadata)
  values (p_org, (select auth.uid()), p_action, p_target_type, p_target_id,
          coalesce(p_source, 'app'), coalesce(p_metadata, '{}'::jsonb));
$$;
