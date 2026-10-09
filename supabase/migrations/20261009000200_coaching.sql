-- RT Performance · Coaching domain
-- Every tenant row carries org_id. Parent/child relationships use composite foreign keys
-- (id, org_id) so a child row can never point at a parent that lives in another workspace.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
-- kind = 'trainer_workspace' : issued by the master owner from the master org; acceptance creates a new
--                              trainer workspace (child of the master) owned by the invitee.
-- kind = 'workspace_member'  : a co-trainer joining an existing workspace (role 'trainer').
-- kind = 'athlete'           : an athlete linking their login to an existing athlete profile.
create table public.invitations (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('trainer_workspace', 'workspace_member', 'athlete')),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  role                 text not null check (role in ('owner', 'trainer', 'athlete')),
  email                text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  athlete_id           uuid,
  token_hash           text not null unique,
  workspace_name       text check (workspace_name is null or char_length(workspace_name) between 2 and 80),
  message              text check (message is null or char_length(message) <= 1000),
  invited_by           uuid references auth.users (id) on delete set null,
  expires_at           timestamptz not null,
  accepted_at          timestamptz,
  accepted_by          uuid references auth.users (id) on delete set null,
  revoked_at           timestamptz,
  revoked_by           uuid references auth.users (id) on delete set null,
  created_workspace_id uuid references public.organizations (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint invitation_kind_role check (
    (kind = 'trainer_workspace' and role = 'owner' and athlete_id is null)
    or (kind = 'workspace_member' and role = 'trainer' and athlete_id is null)
    or (kind = 'athlete' and role = 'athlete' and athlete_id is not null)
  ),
  constraint invitation_single_outcome check (not (accepted_at is not null and revoked_at is not null))
);
create index invitations_org_idx on public.invitations (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Brand settings (white label)
-- ---------------------------------------------------------------------------
create table public.brand_settings (
  org_id                 uuid primary key references public.organizations (id) on delete cascade,
  display_name           text not null check (char_length(display_name) between 2 and 80),
  coach_name             text check (coach_name is null or char_length(coach_name) <= 120),
  coach_bio              text check (coach_bio is null or char_length(coach_bio) <= 2000),
  logo_path              text check (logo_path is null or char_length(logo_path) <= 400),
  photo_path             text check (photo_path is null or char_length(photo_path) <= 400),
  accent_color           text not null default '#C8A45D' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  signal_color           text not null default '#C2412D' check (signal_color ~ '^#[0-9A-Fa-f]{6}$'),
  welcome_headline       text check (welcome_headline is null or char_length(welcome_headline) <= 140),
  welcome_body           text check (welcome_body is null or char_length(welcome_body) <= 600),
  portal_tagline         text check (portal_tagline is null or char_length(portal_tagline) <= 140),
  location               text check (location is null or char_length(location) <= 120),
  public_profile_enabled boolean not null default false,
  updated_by             uuid references auth.users (id) on delete set null,
  updated_at             timestamptz not null default now()
);
create trigger brand_settings_touch before update on public.brand_settings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Athletes
-- ---------------------------------------------------------------------------
create table public.athlete_profiles (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  user_id              uuid references auth.users (id) on delete set null,
  first_name           text not null check (char_length(first_name) between 1 and 60),
  last_name            text not null default '' check (char_length(last_name) <= 60),
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                text check (phone is null or char_length(phone) <= 40),
  date_of_birth        date,
  status               text not null default 'active' check (status in ('active', 'paused', 'archived')),
  experience_level     text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  training_goals       text check (training_goals is null or char_length(training_goals) <= 2000),
  training_preferences text check (training_preferences is null or char_length(training_preferences) <= 2000),
  equipment            text[] not null default '{}',
  limitations          text check (limitations is null or char_length(limitations) <= 2000),
  sessions_per_week    smallint check (sessions_per_week between 1 and 7),
  next_check_in_date   date,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, user_id)
);
create index athlete_profiles_org_idx on public.athlete_profiles (org_id, status);
create index athlete_profiles_user_idx on public.athlete_profiles (user_id);
create trigger athlete_profiles_touch before update on public.athlete_profiles
  for each row execute function private.touch_updated_at();

alter table public.invitations
  add constraint invitations_athlete_fk foreign key (athlete_id, org_id)
  references public.athlete_profiles (id, org_id) on delete cascade;

-- Athlete-self helpers
create or replace function private.is_athlete_self(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.athlete_profiles a
    join public.memberships m on m.org_id = a.org_id and m.user_id = a.user_id
    join public.organizations o on o.id = a.org_id
    where a.id = p_athlete
      and a.user_id = (select auth.uid())
      and a.status <> 'archived'
      and m.status = 'active'
      and m.role = 'athlete'
      and o.status = 'active'
  );
$$;

-- Athletes may edit only their own preference fields; coaches may edit anything.
create or replace function private.guard_athlete_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- trusted definer functions (e.g. invitation acceptance) and coaches are not restricted here
  if current_user not in ('authenticated', 'anon') or private.is_coach(old.org_id) then
    return new;
  end if;
  if new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id
     or new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name
     or new.email is distinct from old.email
     or new.status is distinct from old.status
     or new.experience_level is distinct from old.experience_level
     or new.sessions_per_week is distinct from old.sessions_per_week
     or new.next_check_in_date is distinct from old.next_check_in_date
     or new.created_by is distinct from old.created_by then
    raise exception 'Athletes may only update their own preferences' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger athlete_profiles_self_guard before update on public.athlete_profiles
  for each row execute function private.guard_athlete_self_update();

-- ---------------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------------
-- org_id null = RT Performance starter library (read-only for everyone, curated by migrations).
create table public.exercises (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid references public.organizations (id) on delete cascade,
  name                 text not null check (char_length(name) between 2 and 100),
  description          text check (description is null or char_length(description) <= 2000),
  muscle_groups        text[] not null default '{}',
  equipment            text[] not null default '{}',
  category             text not null check (category in
                         ('squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core', 'conditioning',
                          'mobility', 'power', 'accessory')),
  difficulty           text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  measurement          text not null default 'reps_weight' check (measurement in ('reps_weight', 'reps', 'time', 'distance')),
  cues                 text[] not null default '{}',
  instructions         text check (instructions is null or char_length(instructions) <= 4000),
  default_sets         smallint check (default_sets between 1 and 20),
  default_reps         text check (default_reps is null or char_length(default_reps) <= 20),
  default_rest_seconds integer check (default_rest_seconds between 0 and 900),
  default_tempo        text check (default_tempo is null or default_tempo ~ '^[0-9X]{4}$'),
  default_rpe          numeric(3, 1) check (default_rpe between 1 and 10),
  is_archived          boolean not null default false,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index exercises_unique_name
  on public.exercises (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index exercises_org_idx on public.exercises (org_id);
create trigger exercises_touch before update on public.exercises
  for each row execute function private.touch_updated_at();

create or replace function private.exercise_visible_to_org(p_exercise uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exercises e
    where e.id = p_exercise and (e.org_id is null or e.org_id = p_org)
  );
$$;

create table public.exercise_substitutions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations (id) on delete cascade,
  exercise_id   uuid not null references public.exercises (id) on delete cascade,
  substitute_id uuid not null references public.exercises (id) on delete cascade,
  note          text check (note is null or char_length(note) <= 300),
  created_at    timestamptz not null default now(),
  check (exercise_id <> substitute_id)
);
create unique index exercise_substitutions_unique
  on public.exercise_substitutions (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), exercise_id, substitute_id);

create table public.exercise_media (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  kind         text not null check (kind in ('image', 'video', 'link')),
  storage_path text check (storage_path is null or char_length(storage_path) <= 400),
  external_url text check (external_url is null or external_url ~ '^https://'),
  caption      text check (caption is null or char_length(caption) <= 200),
  position     integer not null default 0,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index exercise_media_exercise_idx on public.exercise_media (exercise_id);

create or replace function private.validate_exercise_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Org-scoped substitutions / media may only reference exercises visible to that org.
  if tg_table_name = 'exercise_substitutions' then
    if not private.exercise_visible_to_org(new.exercise_id, new.org_id)
       or not private.exercise_visible_to_org(new.substitute_id, new.org_id) then
      raise exception 'Exercise is not available in this workspace' using errcode = '23503';
    end if;
  elsif tg_table_name = 'exercise_media' then
    if not private.exercise_visible_to_org(new.exercise_id, new.org_id) then
      raise exception 'Exercise is not available in this workspace' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
create trigger exercise_substitutions_refs before insert or update on public.exercise_substitutions
  for each row execute function private.validate_exercise_refs();
create trigger exercise_media_refs before insert or update on public.exercise_media
  for each row execute function private.validate_exercise_refs();

-- ---------------------------------------------------------------------------
-- Programs: templates → immutable published versions → sessions → prescribed exercises
-- ---------------------------------------------------------------------------
create table public.program_templates (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  kind               text not null default 'program' check (kind in ('program', 'session')),
  name               text not null check (char_length(name) between 2 and 120),
  description        text check (description is null or char_length(description) <= 4000),
  goal               text check (goal is null or char_length(goal) <= 200),
  level              text check (level in ('beginner', 'intermediate', 'advanced')),
  duration_weeks     smallint not null default 1 check (duration_weeks between 1 and 52),
  sessions_per_week  smallint not null default 3 check (sessions_per_week between 1 and 7),
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  source_template_id uuid references public.program_templates (id) on delete set null,
  created_via        text not null default 'app' check (created_via in ('app', 'ai')),
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id)
);
create index program_templates_org_idx on public.program_templates (org_id, status, updated_at desc);
create trigger program_templates_touch before update on public.program_templates
  for each row execute function private.touch_updated_at();

create table public.program_versions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  template_id    uuid not null,
  version_number integer not null check (version_number >= 1),
  status         text not null default 'draft' check (status in ('draft', 'published')),
  change_summary text check (change_summary is null or char_length(change_summary) <= 1000),
  published_at   timestamptz,
  published_by   uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (template_id, org_id) references public.program_templates (id, org_id) on delete cascade,
  unique (template_id, version_number),
  unique (id, org_id)
);
create unique index program_versions_single_draft on public.program_versions (template_id) where status = 'draft';
create trigger program_versions_touch before update on public.program_versions
  for each row execute function private.touch_updated_at();

create table public.program_sessions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  version_id        uuid not null,
  week_number       smallint not null default 1 check (week_number between 1 and 52),
  day_number        smallint not null default 1 check (day_number between 1 and 7),
  position          integer not null default 0,
  name              text not null check (char_length(name) between 1 and 120),
  focus             text check (focus is null or char_length(focus) <= 200),
  notes             text check (notes is null or char_length(notes) <= 2000),
  estimated_minutes smallint check (estimated_minutes between 5 and 300),
  created_at        timestamptz not null default now(),
  foreign key (version_id, org_id) references public.program_versions (id, org_id) on delete cascade,
  unique (id, org_id)
);
create index program_sessions_version_idx on public.program_sessions (version_id, week_number, day_number, position);

create table public.program_exercises (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  session_id       uuid not null,
  exercise_id      uuid not null references public.exercises (id) on delete restrict,
  position         integer not null default 0,
  block_label      text check (block_label is null or block_label ~ '^[A-Z][0-9]{0,2}$'),
  sets             smallint not null check (sets between 1 and 20),
  reps             text not null check (char_length(reps) between 1 and 20),
  load_type        text not null default 'none'
                   check (load_type in ('none', 'bodyweight', 'weight', 'percent_1rm', 'rpe')),
  load_value       numeric(7, 2) check (load_value is null or load_value >= 0),
  load_unit        text check (load_unit in ('lb', 'kg')),
  rest_seconds     integer check (rest_seconds between 0 and 900),
  tempo            text check (tempo is null or tempo ~ '^[0-9X]{4}$'),
  rpe_target       numeric(3, 1) check (rpe_target between 1 and 10),
  progression      text check (progression is null or char_length(progression) <= 500),
  notes            text check (notes is null or char_length(notes) <= 1000),
  substitution_ids uuid[] not null default '{}',
  created_at       timestamptz not null default now(),
  foreign key (session_id, org_id) references public.program_sessions (id, org_id) on delete cascade,
  unique (id, org_id)
);
create index program_exercises_session_idx on public.program_exercises (session_id, position);

create or replace function private.validate_program_exercise()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sub uuid;
begin
  if not private.exercise_visible_to_org(new.exercise_id, new.org_id) then
    raise exception 'Exercise is not available in this workspace' using errcode = '23503';
  end if;
  foreach sub in array coalesce(new.substitution_ids, '{}') loop
    if not private.exercise_visible_to_org(sub, new.org_id) then
      raise exception 'Substitution exercise is not available in this workspace' using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;
create trigger program_exercises_validate before insert or update on public.program_exercises
  for each row execute function private.validate_program_exercise();

-- Published versions are frozen: they are what athletes were actually assigned.
create or replace function private.guard_published_program_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
  v_status  text;
begin
  if tg_table_name = 'program_sessions' then
    v_version := coalesce(new.version_id, old.version_id);
    if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
      raise exception 'Sessions cannot move between program versions' using errcode = '42501';
    end if;
  else
    select s.version_id into v_version
    from public.program_sessions s
    where s.id = coalesce(new.session_id, old.session_id);
    if tg_op = 'UPDATE' and new.session_id is distinct from old.session_id then
      -- moving between sessions is allowed only within the same draft version
      if (select version_id from public.program_sessions where id = new.session_id)
         is distinct from (select version_id from public.program_sessions where id = old.session_id) then
        raise exception 'Exercises cannot move between program versions' using errcode = '42501';
      end if;
    end if;
  end if;

  select status into v_status from public.program_versions where id = v_version;
  if v_status = 'published' then
    raise exception 'Published program versions are immutable; create a new draft version to make changes'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger program_sessions_immutable before insert or update or delete on public.program_sessions
  for each row execute function private.guard_published_program_content();
create trigger program_exercises_immutable before insert or update or delete on public.program_exercises
  for each row execute function private.guard_published_program_content();

create or replace function private.guard_program_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'published' and (
         new.status <> 'published'
         or new.template_id is distinct from old.template_id
         or new.version_number is distinct from old.version_number) then
      raise exception 'Published program versions are immutable' using errcode = '42501';
    end if;
    if old.status = 'draft' and new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
  elsif tg_op = 'DELETE' then
    -- allowed only as part of deleting the whole template (cascade)
    if old.status = 'published'
       and exists (select 1 from public.program_templates t where t.id = old.template_id) then
      raise exception 'Published program versions cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  return new;
end;
$$;
create trigger program_versions_guard before update or delete on public.program_versions
  for each row execute function private.guard_program_version();

-- ---------------------------------------------------------------------------
-- Assignments & schedule
-- ---------------------------------------------------------------------------
create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  athlete_id   uuid not null,
  template_id  uuid not null,
  version_id   uuid not null,
  start_date   date not null,
  training_days smallint[] not null check (
    cardinality(training_days) between 1 and 7
    and training_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  status       text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes        text check (notes is null or char_length(notes) <= 2000),
  assigned_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (org_id) references public.organizations (id) on delete cascade,
  foreign key (athlete_id, org_id) references public.athlete_profiles (id, org_id) on delete cascade,
  foreign key (template_id, org_id) references public.program_templates (id, org_id) on delete restrict,
  foreign key (version_id, org_id) references public.program_versions (id, org_id) on delete restrict,
  unique (id, org_id)
);
create index assignments_athlete_idx on public.assignments (athlete_id, status);
create index assignments_org_idx on public.assignments (org_id, created_at desc);
create trigger assignments_touch before update on public.assignments
  for each row execute function private.touch_updated_at();

create or replace function private.validate_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
       new.version_id is distinct from old.version_id
       or new.template_id is distinct from old.template_id
       or new.athlete_id is distinct from old.athlete_id) then
    raise exception 'An assignment''s athlete and program version are fixed; create a new assignment instead'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.program_versions v
    where v.id = new.version_id and v.template_id = new.template_id and v.status = 'published'
  ) then
    raise exception 'Only published program versions can be assigned' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger assignments_validate before insert or update on public.assignments
  for each row execute function private.validate_assignment();

create table public.scheduled_sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  assignment_id      uuid not null,
  athlete_id         uuid not null,
  program_session_id uuid not null,
  scheduled_date     date not null,
  week_number        smallint not null,
  day_number         smallint not null,
  -- 'missed' is never stored: a planned session whose date has passed is derived as missed.
  status             text not null default 'planned' check (status in ('planned', 'completed', 'skipped')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (assignment_id, org_id) references public.assignments (id, org_id) on delete cascade,
  foreign key (athlete_id, org_id) references public.athlete_profiles (id, org_id) on delete cascade,
  foreign key (program_session_id, org_id) references public.program_sessions (id, org_id) on delete restrict,
  unique (assignment_id, program_session_id),
  unique (id, org_id)
);
create index scheduled_sessions_athlete_date_idx on public.scheduled_sessions (athlete_id, scheduled_date);
create index scheduled_sessions_org_date_idx on public.scheduled_sessions (org_id, scheduled_date);
create trigger scheduled_sessions_touch before update on public.scheduled_sessions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Workout logs (what was actually performed)
-- ---------------------------------------------------------------------------
create table public.workout_logs (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  athlete_id           uuid not null,
  scheduled_session_id uuid,
  assignment_id        uuid,
  program_session_id   uuid,
  title                text not null check (char_length(title) between 1 and 120),
  performed_on         date not null default current_date,
  status               text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  perceived_effort     smallint check (perceived_effort between 1 and 10),
  recovery_rating      smallint check (recovery_rating between 1 and 5),
  notes                text check (notes is null or char_length(notes) <= 2000),
  logged_by            uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (athlete_id, org_id) references public.athlete_profiles (id, org_id) on delete cascade,
  foreign key (scheduled_session_id, org_id) references public.scheduled_sessions (id, org_id) on delete set null (scheduled_session_id),
  foreign key (assignment_id, org_id) references public.assignments (id, org_id) on delete set null (assignment_id),
  foreign key (program_session_id, org_id) references public.program_sessions (id, org_id) on delete set null (program_session_id),
  unique (id, org_id)
);
create unique index workout_logs_one_per_scheduled on public.workout_logs (scheduled_session_id)
  where scheduled_session_id is not null;
create index workout_logs_athlete_idx on public.workout_logs (athlete_id, performed_on desc);
create index workout_logs_org_idx on public.workout_logs (org_id, performed_on desc);
create trigger workout_logs_touch before update on public.workout_logs
  for each row execute function private.touch_updated_at();

create table public.workout_log_exercises (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  log_id              uuid not null,
  exercise_id         uuid not null references public.exercises (id) on delete restrict,
  program_exercise_id uuid,
  position            integer not null default 0,
  planned             jsonb not null default '{}'::jsonb,
  completed           boolean not null default false,
  notes               text check (notes is null or char_length(notes) <= 1000),
  created_at          timestamptz not null default now(),
  foreign key (log_id, org_id) references public.workout_logs (id, org_id) on delete cascade,
  foreign key (program_exercise_id, org_id) references public.program_exercises (id, org_id) on delete set null (program_exercise_id),
  unique (id, org_id)
);
create index workout_log_exercises_log_idx on public.workout_log_exercises (log_id, position);
create index workout_log_exercises_exercise_idx on public.workout_log_exercises (exercise_id);

create table public.workout_log_sets (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  log_exercise_id  uuid not null,
  set_number       smallint not null check (set_number between 1 and 50),
  reps             smallint check (reps between 0 and 1000),
  weight           numeric(7, 2) check (weight >= 0),
  weight_unit      text not null default 'lb' check (weight_unit in ('lb', 'kg')),
  duration_seconds integer check (duration_seconds between 0 and 86400),
  distance_m       numeric(9, 2) check (distance_m >= 0),
  rpe              numeric(3, 1) check (rpe between 1 and 10),
  completed        boolean not null default true,
  created_at       timestamptz not null default now(),
  foreign key (log_exercise_id, org_id) references public.workout_log_exercises (id, org_id) on delete cascade,
  unique (log_exercise_id, set_number)
);

create or replace function private.validate_workout_log()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s record;
begin
  if tg_op = 'UPDATE' and new.athlete_id is distinct from old.athlete_id then
    raise exception 'A workout log cannot be moved to another athlete' using errcode = '42501';
  end if;
  if new.scheduled_session_id is not null then
    select ss.athlete_id, ss.assignment_id, ss.program_session_id into s
    from public.scheduled_sessions ss where ss.id = new.scheduled_session_id;
    if s.athlete_id is distinct from new.athlete_id then
      raise exception 'Scheduled session belongs to a different athlete' using errcode = '23514';
    end if;
    new.assignment_id := s.assignment_id;
    new.program_session_id := s.program_session_id;
  elsif new.assignment_id is not null then
    if not exists (select 1 from public.assignments a where a.id = new.assignment_id and a.athlete_id = new.athlete_id) then
      raise exception 'Assignment belongs to a different athlete' using errcode = '23514';
    end if;
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status = 'in_progress' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger workout_logs_validate before insert or update on public.workout_logs
  for each row execute function private.validate_workout_log();

-- Keep the schedule in sync with real workout records.
create or replace function private.sync_scheduled_session_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.scheduled_session_id is not null then
    update public.scheduled_sessions
       set status = case when new.status = 'completed' then 'completed' else 'planned' end
     where id = new.scheduled_session_id and status <> 'skipped';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.scheduled_session_id is not null
     and (tg_op = 'DELETE' or new.scheduled_session_id is distinct from old.scheduled_session_id) then
    update public.scheduled_sessions set status = 'planned'
     where id = old.scheduled_session_id and status = 'completed';
  end if;
  return null;
end;
$$;
create trigger workout_logs_sync_schedule after insert or update or delete on public.workout_logs
  for each row execute function private.sync_scheduled_session_status();

create or replace function private.validate_log_exercise()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.exercise_visible_to_org(new.exercise_id, new.org_id) then
    raise exception 'Exercise is not available in this workspace' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger workout_log_exercises_validate before insert or update on public.workout_log_exercises
  for each row execute function private.validate_log_exercise();

-- ---------------------------------------------------------------------------
-- Goals & coach notes
-- ---------------------------------------------------------------------------
create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  athlete_id     uuid not null,
  title          text not null check (char_length(title) between 2 and 140),
  goal_type      text not null default 'custom'
                 check (goal_type in ('strength', 'consistency', 'bodyweight', 'skill', 'custom')),
  exercise_id    uuid references public.exercises (id) on delete set null,
  metric         text not null default 'custom'
                 check (metric in ('estimated_1rm', 'max_weight', 'max_reps', 'sessions_per_week', 'custom')),
  unit           text check (unit is null or char_length(unit) <= 20),
  baseline_value numeric(9, 2),
  target_value   numeric(9, 2),
  current_value  numeric(9, 2),
  target_date    date,
  status         text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  achieved_at    timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (athlete_id, org_id) references public.athlete_profiles (id, org_id) on delete cascade,
  check (metric not in ('estimated_1rm', 'max_weight', 'max_reps') or exercise_id is not null)
);
create index goals_athlete_idx on public.goals (athlete_id, status);
create trigger goals_touch before update on public.goals
  for each row execute function private.touch_updated_at();

create or replace function private.guard_goal_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.exercise_id is not null and not private.exercise_visible_to_org(new.exercise_id, new.org_id) then
    raise exception 'Exercise is not available in this workspace' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') and not private.is_coach(old.org_id) then
    -- athletes may only report a current value on manually tracked goals
    if new.current_value is distinct from old.current_value and old.metric <> 'custom' then
      raise exception 'This goal is calculated from logged workouts' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'current_value' - 'updated_at') is distinct from (to_jsonb(old) - 'current_value' - 'updated_at') then
      raise exception 'Athletes may only update the current value of a goal' using errcode = '42501';
    end if;
  end if;
  if new.status = 'achieved' and new.achieved_at is null then
    new.achieved_at := now();
  end if;
  return new;
end;
$$;
create trigger goals_guard before insert or update on public.goals
  for each row execute function private.guard_goal_update();

create table public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  athlete_id uuid not null,
  author_id  uuid references auth.users (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 4000),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, org_id) references public.athlete_profiles (id, org_id) on delete cascade
);
create index coach_notes_athlete_idx on public.coach_notes (athlete_id, created_at desc);
create trigger coach_notes_touch before update on public.coach_notes
  for each row execute function private.touch_updated_at();
