-- RT Performance · Application RPCs
-- SECURITY DEFINER functions perform their own explicit authorization checks before touching data.
-- SECURITY INVOKER functions run under the caller's RLS policies.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(
  p_kind text,
  p_org uuid,
  p_email text,
  p_athlete uuid default null,
  p_workspace_name text default null,
  p_message text default null,
  p_ttl_days integer default 7,
  p_source text default 'app'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token   text;
  v_role    text;
  v_id      uuid;
  v_expires timestamptz;
  v_email   text := lower(trim(p_email));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_ttl_days is null or p_ttl_days < 1 or p_ttl_days > 30 then
    raise exception 'Invitations expire within 1 to 30 days' using errcode = '22023';
  end if;

  if p_kind = 'trainer_workspace' then
    if p_org is distinct from private.master_org_id() or not private.is_master_owner() then
      raise exception 'Only the network owner can invite trainers to establish a workspace' using errcode = '42501';
    end if;
    v_role := 'owner';
    p_athlete := null;
  elsif p_kind = 'workspace_member' then
    if not private.is_org_owner(p_org) then
      raise exception 'Only workspace owners can invite trainers' using errcode = '42501';
    end if;
    v_role := 'trainer';
    p_athlete := null;
  elsif p_kind = 'athlete' then
    if not private.is_coach(p_org) then
      raise exception 'Only coaches in this workspace can invite athletes' using errcode = '42501';
    end if;
    if p_athlete is null or not exists (
      select 1 from public.athlete_profiles a where a.id = p_athlete and a.org_id = p_org and a.status <> 'archived'
    ) then
      raise exception 'Athlete not found in this workspace' using errcode = '22023';
    end if;
    if exists (select 1 from public.athlete_profiles a where a.id = p_athlete and a.user_id is not null) then
      raise exception 'This athlete already has an active login' using errcode = '22023';
    end if;
    v_role := 'athlete';
  else
    raise exception 'Unknown invitation type' using errcode = '22023';
  end if;

  -- One open invitation per email+purpose: revoke older pending ones.
  update public.invitations i
     set revoked_at = now(), revoked_by = (select auth.uid())
   where i.org_id = p_org and lower(i.email) = v_email and i.kind = p_kind
     and i.accepted_at is null and i.revoked_at is null
     and (p_athlete is null or i.athlete_id = p_athlete);

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires := now() + make_interval(days => p_ttl_days);

  insert into public.invitations (kind, org_id, role, email, athlete_id, token_hash, workspace_name, message,
                                  invited_by, expires_at)
  values (p_kind, p_org, v_role, v_email, p_athlete,
          encode(extensions.digest(v_token, 'sha256'), 'hex'),
          nullif(trim(coalesce(p_workspace_name, '')), ''),
          nullif(trim(coalesce(p_message, '')), ''),
          (select auth.uid()), v_expires)
  returning id into v_id;

  perform private.audit(p_org, 'invitation.created', 'invitation', v_id,
                        case when p_source = 'ai' then 'ai' else 'app' end,
                        jsonb_build_object('kind', p_kind, 'expires_at', v_expires));

  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation for update;
  if inv.id is null then
    raise exception 'Invitation not found' using errcode = '22023';
  end if;
  if not (private.is_org_owner(inv.org_id) or (inv.kind = 'athlete' and private.is_coach(inv.org_id))) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invitation has already been accepted' using errcode = '22023';
  end if;
  if inv.revoked_at is null then
    update public.invitations set revoked_at = now(), revoked_by = (select auth.uid()) where id = inv.id;
    perform private.audit(inv.org_id, 'invitation.revoked', 'invitation', inv.id, 'app', jsonb_build_object('kind', inv.kind));
  end if;
end;
$$;

-- Token holders may preview an invitation before signing in.
create or replace function public.get_invitation_preview(p_token text)
returns table (
  kind text, role text, email text, workspace_name text, organization_name text,
  inviter_name text, message text, status text, expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.role, i.email,
         coalesce(i.workspace_name, ''),
         coalesce(b.display_name, o.name),
         coalesce(p.full_name, 'Your coach'),
         i.message,
         case
           when i.accepted_at is not null then 'accepted'
           when i.revoked_at is not null then 'revoked'
           when i.expires_at < now() then 'expired'
           else 'pending'
         end,
         i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  left join public.brand_settings b on b.org_id = o.id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.accept_invitation(
  p_token text,
  p_workspace_name text default null,
  p_workspace_slug text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv        public.invitations;
  v_uid      uuid := (select auth.uid());
  v_email    text;
  v_org      uuid;
  v_name     text;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation' using errcode = '42501';
  end if;

  select * into inv from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  if inv.id is null then
    raise exception 'This invitation link is not valid' using errcode = '22023';
  elsif inv.accepted_at is not null then
    raise exception 'This invitation has already been used' using errcode = '22023';
  elsif inv.revoked_at is not null then
    raise exception 'This invitation was revoked' using errcode = '22023';
  elsif inv.expires_at < now() then
    raise exception 'This invitation has expired' using errcode = '22023';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is distinct from lower(inv.email) then
    raise exception 'This invitation was issued to a different email address' using errcode = '42501';
  end if;

  if inv.kind = 'trainer_workspace' then
    v_name := nullif(trim(coalesce(p_workspace_name, inv.workspace_name, '')), '');
    if v_name is null or char_length(v_name) < 2 then
      raise exception 'Choose a workspace name' using errcode = '22023';
    end if;
    if p_workspace_slug is null or p_workspace_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$' then
      raise exception 'Choose a workspace address using lowercase letters, numbers and dashes' using errcode = '22023';
    end if;
    if exists (select 1 from public.organizations where slug = p_workspace_slug) then
      raise exception 'That workspace address is already taken' using errcode = '23505';
    end if;
    insert into public.organizations (slug, name, kind, parent_org_id, created_by)
    values (p_workspace_slug, v_name, 'trainer', inv.org_id, v_uid)
    returning id into v_org;
    insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
    insert into public.brand_settings (org_id, display_name, coach_name, updated_by)
    values (v_org, v_name, (select full_name from public.profiles where id = v_uid), v_uid);
    update public.invitations
       set accepted_at = now(), accepted_by = v_uid, created_workspace_id = v_org
     where id = inv.id;
    perform private.audit(inv.org_id, 'invitation.accepted', 'organization', v_org, 'app',
                          jsonb_build_object('kind', inv.kind));
    perform private.audit(v_org, 'workspace.created', 'organization', v_org, 'app', '{}'::jsonb);
    return v_org;
  end if;

  v_org := inv.org_id;
  if exists (select 1 from public.organizations where id = v_org and status <> 'active') then
    raise exception 'This workspace is not currently active' using errcode = '42501';
  end if;

  select role into v_name from public.memberships where org_id = v_org and user_id = v_uid and status = 'active';
  if v_name is not null and v_name <> inv.role then
    raise exception 'You already belong to this workspace with a different role' using errcode = '22023';
  end if;

  if inv.kind = 'athlete' then
    select user_id into v_existing from public.athlete_profiles where id = inv.athlete_id and org_id = v_org;
    if v_existing is not null and v_existing <> v_uid then
      raise exception 'This athlete profile is already linked to another login' using errcode = '42501';
    end if;
    if exists (select 1 from public.athlete_profiles where org_id = v_org and user_id = v_uid and id <> inv.athlete_id) then
      raise exception 'Your login is already linked to another athlete profile in this workspace' using errcode = '22023';
    end if;
    update public.athlete_profiles
       set user_id = v_uid, status = case when status = 'archived' then 'active' else status end
     where id = inv.athlete_id and org_id = v_org;
  end if;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_org, v_uid, inv.role, 'active')
  on conflict (org_id, user_id) do update set role = excluded.role, status = 'active';

  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = inv.id;
  perform private.audit(v_org, 'invitation.accepted', 'invitation', inv.id, 'app',
                        jsonb_build_object('kind', inv.kind));
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisioning (service role / database owner only). Documented in docs/PROVISIONING.md.
-- ---------------------------------------------------------------------------
create or replace function public.provision_master_workspace(p_email text, p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_org  uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account exists for %. Create the account first (sign up), then provision.', p_email;
  end if;

  select id into v_org from public.organizations where kind = 'master';
  if v_org is null then
    insert into public.organizations (slug, name, kind, created_by)
    values (p_slug, p_name, 'master', v_user) returning id into v_org;
    insert into public.brand_settings (org_id, display_name, coach_name, accent_color, welcome_headline,
                                       welcome_body, portal_tagline, location, updated_by)
    values (v_org, p_name, 'Raymond Tate', '#C8A45D',
            'Discipline creates momentum. Progress makes it measurable.',
            'Personal training built around intentional programming, consistent execution, and intelligent adjustment.',
            'Relentless Training. Intelligent Progress.', 'Tampa, Florida', v_user);
  end if;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_org, v_user, 'owner', 'active')
  on conflict (org_id, user_id) do update set role = 'owner', status = 'active';

  insert into public.audit_events (org_id, actor_id, action, target_type, target_id, source, metadata)
  values (v_org, v_user, 'workspace.provisioned', 'organization', v_org, 'system', '{}'::jsonb);
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership & workspace administration
-- ---------------------------------------------------------------------------
create or replace function public.set_membership_status(p_membership uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.memberships;
begin
  if p_status not in ('active', 'revoked') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  select * into m from public.memberships where id = p_membership for update;
  if m.id is null or not private.is_org_owner(m.org_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if m.user_id = (select auth.uid()) then
    raise exception 'You cannot change your own access' using errcode = '22023';
  end if;
  if m.role = 'owner' and p_status = 'revoked' and (
       select count(*) from public.memberships where org_id = m.org_id and role = 'owner' and status = 'active') <= 1 then
    raise exception 'A workspace must keep at least one owner' using errcode = '22023';
  end if;
  update public.memberships set status = p_status where id = m.id;
  perform private.audit(m.org_id, 'membership.' || case when p_status = 'active' then 'restored' else 'revoked' end,
                        'membership', m.id, 'app', jsonb_build_object('role', m.role));
end;
$$;

-- Network owner: suspend / reactivate a trainer workspace in the network.
create or replace function public.set_workspace_status(p_org uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizations;
begin
  if not private.is_master_owner() then
    raise exception 'Only the network owner can change workspace status' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = p_org for update;
  if o.id is null or o.parent_org_id is distinct from private.master_org_id() then
    raise exception 'Workspace not found in your network' using errcode = '22023';
  end if;
  update public.organizations
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else null end,
         suspended_reason = case when p_status = 'suspended' then left(p_reason, 500) else null end
   where id = o.id;
  perform private.audit(private.master_org_id(),
                        case when p_status = 'suspended' then 'workspace.suspended' else 'workspace.reactivated' end,
                        'organization', o.id, 'app', jsonb_build_object('workspace', o.name));
end;
$$;

-- Aggregate-only network reporting. Returns counts, never athlete records or notes.
create or replace function public.network_workspaces()
returns table (
  org_id uuid, name text, slug text, status text, created_at timestamptz,
  owner_name text, owner_email text,
  athlete_count bigint, program_count bigint, active_assignment_count bigint,
  sessions_completed_30d bigint, last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_master_owner() then
    raise exception 'Only the network owner can view network reporting' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.slug, o.status, o.created_at,
         ow.full_name, ow.email,
         (select count(*) from public.athlete_profiles a where a.org_id = o.id and a.status = 'active'),
         (select count(*) from public.program_templates t where t.org_id = o.id and t.status <> 'archived'),
         (select count(*) from public.assignments s where s.org_id = o.id and s.status = 'active'),
         (select count(*) from public.workout_logs l where l.org_id = o.id and l.status = 'completed'
            and l.performed_on >= current_date - 30),
         (select max(l.updated_at) from public.workout_logs l where l.org_id = o.id)
  from public.organizations o
  left join lateral (
    select p.full_name, p.email from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.org_id = o.id and m.role = 'owner' and m.status = 'active'
    order by m.created_at limit 1
  ) ow on true
  where o.parent_org_id = private.master_org_id()
  order by o.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public workspace profile (/t/[slug]) — only fields intended for public display.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_workspace(p_slug text)
returns table (
  org_id uuid, slug text, display_name text, coach_name text, coach_bio text, logo_path text, photo_path text,
  accent_color text, signal_color text, welcome_headline text, welcome_body text, portal_tagline text,
  location text, public_profile_enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.slug, b.display_name,
         case when b.public_profile_enabled then b.coach_name end,
         case when b.public_profile_enabled then b.coach_bio end,
         b.logo_path,
         case when b.public_profile_enabled then b.photo_path end,
         b.accent_color, b.signal_color, b.welcome_headline, b.welcome_body, b.portal_tagline,
         case when b.public_profile_enabled then b.location end,
         b.public_profile_enabled
  from public.organizations o
  join public.brand_settings b on b.org_id = o.id
  where o.slug = lower(p_slug) and o.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Programs (SECURITY INVOKER: RLS decides what the caller may write)
-- ---------------------------------------------------------------------------
create or replace function public.create_program(
  p_org uuid, p_name text, p_kind text default 'program', p_description text default null,
  p_goal text default null, p_level text default null, p_duration_weeks integer default 1,
  p_sessions_per_week integer default 3, p_created_via text default 'app'
)
returns table (template_id uuid, version_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_template uuid;
  v_version  uuid;
begin
  if not private.is_coach(p_org) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  insert into public.program_templates (org_id, kind, name, description, goal, level, duration_weeks,
                                        sessions_per_week, created_via, created_by)
  values (p_org, coalesce(p_kind, 'program'), p_name, p_description, p_goal, p_level,
          coalesce(p_duration_weeks, 1), coalesce(p_sessions_per_week, 3),
          coalesce(p_created_via, 'app'), (select auth.uid()))
  returning id into v_template;
  insert into public.program_versions (org_id, template_id, version_number, status, created_by)
  values (p_org, v_template, 1, 'draft', (select auth.uid()))
  returning id into v_version;
  perform private.audit(p_org, 'program.created', 'program_template', v_template,
                        case when p_created_via = 'ai' then 'ai' else 'app' end, jsonb_build_object('name', p_name));
  return query select v_template, v_version;
end;
$$;

create or replace function private.copy_version_content(p_from uuid, p_to uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s record;
  v_new_session uuid;
  v_org uuid;
begin
  select org_id into v_org from public.program_versions where id = p_to;
  for s in select * from public.program_sessions where version_id = p_from order by week_number, day_number, position loop
    insert into public.program_sessions (org_id, version_id, week_number, day_number, position, name, focus, notes,
                                         estimated_minutes)
    values (v_org, p_to, s.week_number, s.day_number, s.position, s.name, s.focus, s.notes, s.estimated_minutes)
    returning id into v_new_session;
    insert into public.program_exercises (org_id, session_id, exercise_id, position, block_label, sets, reps, load_type,
                                          load_value, load_unit, rest_seconds, tempo, rpe_target, progression, notes,
                                          substitution_ids)
    select v_org, v_new_session, e.exercise_id, e.position, e.block_label, e.sets, e.reps, e.load_type, e.load_value,
           e.load_unit, e.rest_seconds, e.tempo, e.rpe_target, e.progression, e.notes, e.substitution_ids
    from public.program_exercises e where e.session_id = s.id;
  end loop;
end;
$$;

create or replace function public.publish_program_version(p_version uuid, p_change_summary text default null,
                                                          p_source text default 'app')
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.program_versions;
begin
  select * into v from public.program_versions where id = p_version for update;
  if v.id is null or not private.is_coach(v.org_id) then
    raise exception 'Program version not found' using errcode = '42501';
  end if;
  if v.status <> 'draft' then
    raise exception 'This version is already published' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.program_sessions s join public.program_exercises e on e.session_id = s.id
    where s.version_id = v.id
  ) then
    raise exception 'Add at least one session with an exercise before publishing' using errcode = '22023';
  end if;
  update public.program_versions
     set status = 'published', published_at = now(), published_by = (select auth.uid()),
         change_summary = coalesce(nullif(trim(p_change_summary), ''), change_summary)
   where id = v.id;
  update public.program_templates set status = 'published' where id = v.template_id and status = 'draft';
  perform private.audit(v.org_id, 'program.published', 'program_version', v.id,
                        case when p_source = 'ai' then 'ai' else 'app' end,
                        jsonb_build_object('version', v.version_number));
end;
$$;

-- Begin revising a published program: copy the latest published version into a new draft.
create or replace function public.start_program_revision(p_template uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.program_templates;
  v_latest  public.program_versions;
  v_draft   uuid;
begin
  select * into t from public.program_templates where id = p_template;
  if t.id is null or not private.is_coach(t.org_id) then
    raise exception 'Program not found' using errcode = '42501';
  end if;
  select id into v_draft from public.program_versions where template_id = t.id and status = 'draft';
  if v_draft is not null then
    return v_draft;
  end if;
  select * into v_latest from public.program_versions
   where template_id = t.id and status = 'published' order by version_number desc limit 1;
  insert into public.program_versions (org_id, template_id, version_number, status, created_by)
  values (t.org_id, t.id,
          coalesce((select max(version_number) from public.program_versions where template_id = t.id), 0) + 1,
          'draft', (select auth.uid()))
  returning id into v_draft;
  if v_latest.id is not null then
    perform private.copy_version_content(v_latest.id, v_draft);
  end if;
  return v_draft;
end;
$$;

create or replace function public.duplicate_program(p_template uuid, p_name text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.program_templates;
  v_source uuid;
  v_new_template uuid;
  v_new_version uuid;
begin
  select * into t from public.program_templates where id = p_template;
  if t.id is null or not private.is_coach(t.org_id) then
    raise exception 'Program not found' using errcode = '42501';
  end if;
  -- prefer the working draft, otherwise the latest published version
  select id into v_source from public.program_versions where template_id = t.id
   order by (status = 'draft') desc, version_number desc limit 1;
  insert into public.program_templates (org_id, kind, name, description, goal, level, duration_weeks,
                                        sessions_per_week, source_template_id, created_by)
  values (t.org_id, t.kind, coalesce(nullif(trim(p_name), ''), left(t.name || ' (copy)', 120)), t.description, t.goal,
          t.level, t.duration_weeks, t.sessions_per_week, t.id, (select auth.uid()))
  returning id into v_new_template;
  insert into public.program_versions (org_id, template_id, version_number, status, created_by)
  values (t.org_id, v_new_template, 1, 'draft', (select auth.uid()))
  returning id into v_new_version;
  if v_source is not null then
    perform private.copy_version_content(v_source, v_new_version);
  end if;
  perform private.audit(t.org_id, 'program.duplicated', 'program_template', v_new_template, 'app',
                        jsonb_build_object('source', t.id));
  return v_new_template;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assignment: pins the athlete to the latest published version and generates the schedule.
-- Schedule rule (mirrored in src/lib/schedule.ts): within each program week, the k-th session
-- falls on the k-th training weekday counted forward from the assignment's start date.
-- ---------------------------------------------------------------------------
create or replace function public.assign_program(
  p_athlete uuid, p_template uuid, p_start date, p_training_days smallint[],
  p_notes text default null, p_source text default 'app'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.athlete_profiles;
  t public.program_templates;
  v_version uuid;
  v_assignment uuid;
  v_offsets integer[];
  v_n integer;
  s record;
  v_dow integer := extract(isodow from p_start)::integer;
begin
  select * into a from public.athlete_profiles where id = p_athlete;
  if a.id is null or not private.is_coach(a.org_id) then
    raise exception 'Athlete not found' using errcode = '42501';
  end if;
  if a.status = 'archived' then
    raise exception 'Archived athletes cannot receive new programs' using errcode = '22023';
  end if;
  select * into t from public.program_templates where id = p_template and org_id = a.org_id;
  if t.id is null then
    raise exception 'Program not found in this workspace' using errcode = '22023';
  end if;
  select id into v_version from public.program_versions
   where template_id = t.id and status = 'published' order by version_number desc limit 1;
  if v_version is null then
    raise exception 'Publish this program before assigning it' using errcode = '22023';
  end if;
  if p_training_days is null or cardinality(p_training_days) = 0 then
    raise exception 'Choose at least one training day' using errcode = '22023';
  end if;

  select array_agg(o order by o) into v_offsets
  from (select distinct ((d - v_dow + 7) % 7)::integer as o from unnest(p_training_days) d) x;
  v_n := cardinality(v_offsets);

  insert into public.assignments (org_id, athlete_id, template_id, version_id, start_date, training_days, notes,
                                  assigned_by)
  values (a.org_id, a.id, t.id, v_version, p_start,
          (select array_agg(distinct d order by d) from unnest(p_training_days) d),
          p_notes, (select auth.uid()))
  returning id into v_assignment;

  for s in
    select ps.id, ps.week_number, ps.day_number,
           row_number() over (partition by ps.week_number order by ps.day_number, ps.position) as k
    from public.program_sessions ps where ps.version_id = v_version
  loop
    insert into public.scheduled_sessions (org_id, assignment_id, athlete_id, program_session_id, scheduled_date,
                                           week_number, day_number)
    values (a.org_id, v_assignment, a.id, s.id,
            p_start + (s.week_number - 1) * 7
              + v_offsets[((s.k - 1) % v_n) + 1]
              + (((s.k - 1) / v_n) * 7)::integer,
            s.week_number, s.day_number);
  end loop;

  perform private.audit(a.org_id, 'program.assigned', 'assignment', v_assignment,
                        case when p_source = 'ai' then 'ai' else 'app' end,
                        jsonb_build_object('template', t.id, 'version', v_version));
  return v_assignment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workouts: start a session log with a frozen snapshot of the prescription.
-- ---------------------------------------------------------------------------
create or replace function public.start_workout(p_scheduled_session uuid, p_performed_on date default current_date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ss public.scheduled_sessions;
  ps public.program_sessions;
  v_log uuid;
begin
  select * into ss from public.scheduled_sessions where id = p_scheduled_session;
  if ss.id is null then
    raise exception 'Session not found' using errcode = '42501';
  end if;
  select id into v_log from public.workout_logs where scheduled_session_id = ss.id;
  if v_log is not null then
    return v_log;
  end if;
  select * into ps from public.program_sessions where id = ss.program_session_id;

  insert into public.workout_logs (org_id, athlete_id, scheduled_session_id, title, performed_on, logged_by)
  values (ss.org_id, ss.athlete_id, ss.id, coalesce(ps.name, 'Workout'),
          coalesce(p_performed_on, current_date), (select auth.uid()))
  returning id into v_log;

  insert into public.workout_log_exercises (org_id, log_id, exercise_id, program_exercise_id, position, planned)
  select ss.org_id, v_log, e.exercise_id, e.id, e.position,
         jsonb_strip_nulls(jsonb_build_object(
           'sets', e.sets, 'reps', e.reps, 'load_type', e.load_type, 'load_value', e.load_value,
           'load_unit', e.load_unit, 'rest_seconds', e.rest_seconds, 'tempo', e.tempo,
           'rpe_target', e.rpe_target, 'progression', e.progression, 'notes', e.notes,
           'block_label', e.block_label))
  from public.program_exercises e where e.session_id = ss.program_session_id;

  return v_log;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI usage ledger & audit entry points
-- ---------------------------------------------------------------------------
create or replace function public.record_ai_usage(p_org uuid, p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_coach(p_org) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  insert into public.ai_usage (org_id, user_id, usage_date, requests, input_tokens, output_tokens)
  values (p_org, (select auth.uid()), current_date, 1, greatest(p_input_tokens, 0), greatest(p_output_tokens, 0))
  on conflict (org_id, user_id, usage_date) do update
    set requests = public.ai_usage.requests + 1,
        input_tokens = public.ai_usage.input_tokens + greatest(p_input_tokens, 0),
        output_tokens = public.ai_usage.output_tokens + greatest(p_output_tokens, 0);
end;
$$;

create or replace function public.log_audit_event(
  p_org uuid, p_action text, p_target_type text default null, p_target_id uuid default null,
  p_source text default 'app', p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_coach(p_org) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_source not in ('app', 'ai') then
    raise exception 'Invalid source' using errcode = '22023';
  end if;
  perform private.audit(p_org, p_action, p_target_type, p_target_id, p_source, p_metadata);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

revoke execute on function public.create_invitation(text, uuid, text, uuid, text, text, integer, text) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.accept_invitation(text, text, text) from public, anon;
revoke execute on function public.set_membership_status(uuid, text) from public, anon;
revoke execute on function public.set_workspace_status(uuid, text, text) from public, anon;
revoke execute on function public.network_workspaces() from public, anon;
revoke execute on function public.create_program(uuid, text, text, text, text, text, integer, integer, text) from public, anon;
revoke execute on function public.publish_program_version(uuid, text, text) from public, anon;
revoke execute on function public.start_program_revision(uuid) from public, anon;
revoke execute on function public.duplicate_program(uuid, text) from public, anon;
revoke execute on function public.assign_program(uuid, uuid, date, smallint[], text, text) from public, anon;
revoke execute on function public.start_workout(uuid, date) from public, anon;
revoke execute on function public.record_ai_usage(uuid, integer, integer) from public, anon;
revoke execute on function public.log_audit_event(uuid, text, text, uuid, text, jsonb) from public, anon;
revoke execute on function public.provision_master_workspace(text, text, text) from public, anon, authenticated;

grant execute on function public.create_invitation(text, uuid, text, uuid, text, text, integer, text) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text, text, text) to authenticated;
grant execute on function public.set_membership_status(uuid, text) to authenticated;
grant execute on function public.set_workspace_status(uuid, text, text) to authenticated;
grant execute on function public.network_workspaces() to authenticated;
grant execute on function public.create_program(uuid, text, text, text, text, text, integer, integer, text) to authenticated;
grant execute on function public.publish_program_version(uuid, text, text) to authenticated;
grant execute on function public.start_program_revision(uuid) to authenticated;
grant execute on function public.duplicate_program(uuid, text) to authenticated;
grant execute on function public.assign_program(uuid, uuid, date, smallint[], text, text) to authenticated;
grant execute on function public.start_workout(uuid, date) to authenticated;
grant execute on function public.record_ai_usage(uuid, integer, integer) to authenticated;
grant execute on function public.log_audit_event(uuid, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
grant execute on function public.get_public_workspace(text) to anon, authenticated;
grant execute on function public.provision_master_workspace(text, text, text) to service_role;
