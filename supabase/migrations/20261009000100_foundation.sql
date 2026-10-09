-- RT Performance · Foundation
-- Tenancy model: one shared application, isolated organization workspaces.
--   * organizations      – a coaching workspace. Exactly one 'master' (Raymond Tate Performance);
--                          invited trainers receive 'trainer' workspaces whose parent is the master.
--   * memberships        – explicit user ↔ workspace relationship with a role.
--   * profiles           – public-schema mirror of auth.users (name, email).
-- Authorization helpers live in the non-exposed `private` schema and are used by RLS policies.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text check (full_name is null or char_length(full_name) <= 120),
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Organizations (workspaces)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  name             text not null check (char_length(name) between 2 and 80),
  kind             text not null default 'trainer' check (kind in ('master', 'trainer')),
  parent_org_id    uuid references public.organizations (id) on delete set null,
  status           text not null default 'active' check (status in ('active', 'suspended')),
  suspended_at     timestamptz,
  suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint master_has_no_parent check (kind <> 'master' or parent_org_id is null),
  constraint master_never_suspended check (kind <> 'master' or status = 'active')
);
-- The platform has exactly one master (network) organization.
create unique index organizations_single_master on public.organizations ((kind)) where kind = 'master';
create index organizations_parent_idx on public.organizations (parent_org_id);
create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();

-- Slugs reserved for application routes.
create or replace function private.guard_org_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug in ('admin', 'api', 'app', 'auth', 'login', 'signup', 'new', 'settings', 'network',
                  'invite', 'w', 't', 'onboarding', 'www', 'rt', 'support', 'help') then
    raise exception 'That workspace address is reserved' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger organizations_slug_guard before insert or update of slug on public.organizations
  for each row execute function private.guard_org_slug();

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'trainer', 'athlete')),
  status     text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create trigger memberships_touch before update on public.memberships
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies do not recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function private.has_org_role(p_org uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and o.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function private.is_coach(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(p_org, array['owner', 'trainer']);
$$;

create or replace function private.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(p_org, array['owner']);
$$;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(p_org, array['owner', 'trainer', 'athlete']);
$$;

-- The master (network) owner: an active owner of the single 'master' organization.
create or replace function private.master_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.organizations where kind = 'master' limit 1;
$$;

create or replace function private.is_master_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_owner(private.master_org_id());
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
