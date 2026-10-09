-- RT Performance · Row Level Security
-- Principle: a row is visible only to (a) coaches (owner/trainer) of the row's own workspace, or
-- (b) the athlete the row belongs to, where that athlete is meant to see it. Membership in the master
-- organization grants NO access to trainer workspace records; network reporting goes through
-- aggregate-only SECURITY DEFINER functions (see 0500).

-- ---------------------------------------------------------------------------
-- Helpers that traverse relationships
-- ---------------------------------------------------------------------------
create or replace function private.has_any_membership(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function private.can_view_profile(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user = (select auth.uid())
    or exists (
      select 1 from public.memberships them
      where them.user_id = p_user and them.status = 'active' and private.is_coach(them.org_id)
    )
    or (
      private.is_master_owner() and exists (
        select 1 from public.memberships them
        join public.organizations o on o.id = them.org_id
        where them.user_id = p_user and them.role = 'owner' and o.parent_org_id = private.master_org_id()
      )
    );
$$;

create or replace function private.athlete_can_view_version(p_version uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    where a.version_id = p_version and a.status <> 'cancelled' and private.is_athlete_self(a.athlete_id)
  );
$$;

create or replace function private.athlete_can_view_template(p_template uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    where a.template_id = p_template and a.status <> 'cancelled' and private.is_athlete_self(a.athlete_id)
  );
$$;

create or replace function private.athlete_can_view_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.program_sessions s
    where s.id = p_session and private.athlete_can_view_version(s.version_id)
  );
$$;

create or replace function private.can_access_log(p_log uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workout_logs l
    where l.id = p_log and (private.is_coach(l.org_id) or private.is_athlete_self(l.athlete_id))
  );
$$;

create or replace function private.can_access_log_exercise(p_log_exercise uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workout_log_exercises e
    where e.id = p_log_exercise and private.can_access_log(e.log_id)
  );
$$;

create or replace function private.owns_conversation(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ai_conversations c
    where c.id = p_conversation and c.user_id = (select auth.uid()) and private.is_coach(c.org_id)
  );
$$;

-- Athlete-profile identity links can only be changed by the invitation flow (SECURITY DEFINER),
-- never by a direct API write.
create or replace function private.guard_athlete_link()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.user_id is not null then
      raise exception 'Athlete logins are linked by invitation only' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and new.user_id is not null then
      raise exception 'Athlete logins are linked by invitation only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger athlete_profiles_link_guard before insert or update on public.athlete_profiles
  for each row execute function private.guard_athlete_link();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.organizations          enable row level security;
alter table public.memberships            enable row level security;
alter table public.invitations            enable row level security;
alter table public.brand_settings         enable row level security;
alter table public.athlete_profiles       enable row level security;
alter table public.exercises              enable row level security;
alter table public.exercise_substitutions enable row level security;
alter table public.exercise_media         enable row level security;
alter table public.program_templates      enable row level security;
alter table public.program_versions       enable row level security;
alter table public.program_sessions       enable row level security;
alter table public.program_exercises      enable row level security;
alter table public.assignments            enable row level security;
alter table public.scheduled_sessions     enable row level security;
alter table public.workout_logs           enable row level security;
alter table public.workout_log_exercises  enable row level security;
alter table public.workout_log_sets       enable row level security;
alter table public.goals                  enable row level security;
alter table public.coach_notes            enable row level security;
alter table public.ai_conversations       enable row level security;
alter table public.ai_messages            enable row level security;
alter table public.ai_pending_actions     enable row level security;
alter table public.ai_usage               enable row level security;
alter table public.audit_events           enable row level security;

-- Nothing is readable anonymously; public pages use get_public_workspace().
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, avatar_path) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Organizations & memberships
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations for select to authenticated
  using (
    private.has_any_membership(id)
    or (parent_org_id is not null and parent_org_id = private.master_org_id() and private.is_master_owner())
  );
create policy organizations_update_owner on public.organizations for update to authenticated
  using (private.is_org_owner(id)) with check (private.is_org_owner(id));
revoke insert, update, delete on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.is_coach(org_id));
revoke insert, update, delete on public.memberships from authenticated;

-- ---------------------------------------------------------------------------
-- Invitations (writes only through RPCs)
-- ---------------------------------------------------------------------------
create policy invitations_select on public.invitations for select to authenticated
  using (private.is_org_owner(org_id) or (kind = 'athlete' and private.is_coach(org_id)));
revoke insert, update, delete on public.invitations from authenticated;

-- ---------------------------------------------------------------------------
-- Brand settings
-- ---------------------------------------------------------------------------
create policy brand_select on public.brand_settings for select to authenticated
  using (private.is_org_member(org_id));
create policy brand_insert on public.brand_settings for insert to authenticated
  with check (private.is_org_owner(org_id));
create policy brand_update on public.brand_settings for update to authenticated
  using (private.is_org_owner(org_id)) with check (private.is_org_owner(org_id));
revoke delete on public.brand_settings from authenticated;

-- ---------------------------------------------------------------------------
-- Athletes
-- ---------------------------------------------------------------------------
create policy athletes_select on public.athlete_profiles for select to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(id));
create policy athletes_insert on public.athlete_profiles for insert to authenticated
  with check (private.is_coach(org_id));
create policy athletes_update on public.athlete_profiles for update to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(id))
  with check (private.is_coach(org_id) or private.is_athlete_self(id));
create policy athletes_delete on public.athlete_profiles for delete to authenticated
  using (private.is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------------
create policy exercises_select on public.exercises for select to authenticated
  using (org_id is null or private.is_org_member(org_id));
create policy exercises_insert on public.exercises for insert to authenticated
  with check (org_id is not null and private.is_coach(org_id));
create policy exercises_update on public.exercises for update to authenticated
  using (org_id is not null and private.is_coach(org_id))
  with check (org_id is not null and private.is_coach(org_id));
create policy exercises_delete on public.exercises for delete to authenticated
  using (org_id is not null and private.is_coach(org_id));

create policy exercise_subs_select on public.exercise_substitutions for select to authenticated
  using (org_id is null or private.is_org_member(org_id));
create policy exercise_subs_write on public.exercise_substitutions for all to authenticated
  using (org_id is not null and private.is_coach(org_id))
  with check (org_id is not null and private.is_coach(org_id));

create policy exercise_media_select on public.exercise_media for select to authenticated
  using (org_id is null or private.is_org_member(org_id));
create policy exercise_media_write on public.exercise_media for all to authenticated
  using (org_id is not null and private.is_coach(org_id))
  with check (org_id is not null and private.is_coach(org_id));

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
create policy templates_select on public.program_templates for select to authenticated
  using (private.is_coach(org_id) or private.athlete_can_view_template(id));
create policy templates_write on public.program_templates for all to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));

create policy versions_select on public.program_versions for select to authenticated
  using (private.is_coach(org_id) or private.athlete_can_view_version(id));
create policy versions_write on public.program_versions for all to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));

create policy sessions_select on public.program_sessions for select to authenticated
  using (private.is_coach(org_id) or private.athlete_can_view_version(version_id));
create policy sessions_write on public.program_sessions for all to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));

create policy program_exercises_select on public.program_exercises for select to authenticated
  using (private.is_coach(org_id) or private.athlete_can_view_session(session_id));
create policy program_exercises_write on public.program_exercises for all to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));

-- ---------------------------------------------------------------------------
-- Assignments & schedule
-- ---------------------------------------------------------------------------
create policy assignments_select on public.assignments for select to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(athlete_id));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (private.is_coach(org_id));
create policy assignments_update on public.assignments for update to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));
create policy assignments_delete on public.assignments for delete to authenticated
  using (private.is_org_owner(org_id));

create policy scheduled_select on public.scheduled_sessions for select to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(athlete_id));
create policy scheduled_write on public.scheduled_sessions for all to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));

-- ---------------------------------------------------------------------------
-- Workout logs
-- ---------------------------------------------------------------------------
create policy logs_select on public.workout_logs for select to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(athlete_id));
create policy logs_insert on public.workout_logs for insert to authenticated
  with check (
    (private.is_coach(org_id) or private.is_athlete_self(athlete_id))
    and logged_by = (select auth.uid())
  );
create policy logs_update on public.workout_logs for update to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(athlete_id))
  with check (private.is_coach(org_id) or private.is_athlete_self(athlete_id));
create policy logs_delete on public.workout_logs for delete to authenticated
  using (private.is_coach(org_id) or (private.is_athlete_self(athlete_id) and status = 'in_progress'));

create policy log_exercises_all on public.workout_log_exercises for all to authenticated
  using (private.can_access_log(log_id)) with check (private.can_access_log(log_id));

create policy log_sets_all on public.workout_log_sets for all to authenticated
  using (private.can_access_log_exercise(log_exercise_id))
  with check (private.can_access_log_exercise(log_exercise_id));

-- ---------------------------------------------------------------------------
-- Goals & coach notes
-- ---------------------------------------------------------------------------
create policy goals_select on public.goals for select to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(athlete_id));
create policy goals_insert on public.goals for insert to authenticated
  with check (private.is_coach(org_id));
create policy goals_update on public.goals for update to authenticated
  using (private.is_coach(org_id) or private.is_athlete_self(athlete_id))
  with check (private.is_coach(org_id) or private.is_athlete_self(athlete_id));
create policy goals_delete on public.goals for delete to authenticated
  using (private.is_coach(org_id));

create policy notes_select on public.coach_notes for select to authenticated
  using (private.is_coach(org_id) or (visibility = 'shared' and private.is_athlete_self(athlete_id)));
create policy notes_insert on public.coach_notes for insert to authenticated
  with check (private.is_coach(org_id) and author_id = (select auth.uid()));
create policy notes_update on public.coach_notes for update to authenticated
  using (private.is_coach(org_id)) with check (private.is_coach(org_id));
create policy notes_delete on public.coach_notes for delete to authenticated
  using (private.is_coach(org_id) and (author_id = (select auth.uid()) or private.is_org_owner(org_id)));

-- ---------------------------------------------------------------------------
-- AI (private to the individual coach within the workspace)
-- ---------------------------------------------------------------------------
create policy ai_conversations_own on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid()) and private.is_coach(org_id))
  with check (user_id = (select auth.uid()) and private.is_coach(org_id));

create policy ai_messages_own on public.ai_messages for all to authenticated
  using (private.owns_conversation(conversation_id))
  with check (private.owns_conversation(conversation_id));

create policy ai_pending_own on public.ai_pending_actions for all to authenticated
  using (user_id = (select auth.uid()) and private.owns_conversation(conversation_id))
  with check (user_id = (select auth.uid()) and private.owns_conversation(conversation_id));

create policy ai_usage_select_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from authenticated;

-- ---------------------------------------------------------------------------
-- Audit events: owners read their workspace's trail; writes through RPC / definer functions only.
-- ---------------------------------------------------------------------------
create policy audit_select_owner on public.audit_events for select to authenticated
  using (private.is_org_owner(org_id));
revoke insert, update, delete on public.audit_events from authenticated;
