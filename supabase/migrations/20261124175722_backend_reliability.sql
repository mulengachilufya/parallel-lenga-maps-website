begin;

-- Keep historical, explicitly purchased standalone team access separate
-- from old profiles that simply mirrored their current organization.
alter table public.profiles add column if not exists standalone_team_access boolean not null default false;
update public.profiles p set standalone_team_access = true
where p.plan = 'team'
  and not exists (select 1 from public.organization_members m where m.user_id = p.id)
  and exists (select 1 from public.manual_payments m where m.user_id = p.id and m.plan = 'team' and m.status = 'verified');

create table public.payment_notifications (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('verified', 'rejected')),
  user_email text not null,
  user_name text,
  plan text not null,
  note text,
  expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz
);
create index payment_notifications_pending on public.payment_notifications(next_attempt_at) where sent_at is null;
alter table public.payment_notifications enable row level security;
revoke all on public.payment_notifications from anon, authenticated;
grant select, insert, update on public.payment_notifications to service_role;

create function public.decide_manual_payment(
  p_reference text, p_actor uuid, p_status text, p_note text,
  p_expected jsonb, p_changes jsonb, p_expires_at timestamptz
) returns text language plpgsql set search_path = '' as $$
declare
  payment public.manual_payments%rowtype;
  profile public.profiles%rowtype;
  changes public.profiles%rowtype;
  expected public.profiles%rowtype;
  remaining_plan text;
begin
  if p_status is null or p_status not in ('verified', 'rejected') then
    raise exception 'invalid payment decision';
  end if;
  select * into payment from public.manual_payments where reference = p_reference for update;
  if not found then return 'not_found'; end if;
  if payment.status = p_status then return 'already'; end if;
  if payment.status <> 'pending' then return 'conflict'; end if;
  select * into profile from public.profiles where id = payment.user_id for update;
  if not found then return 'profile_missing'; end if;
  if p_status = 'verified' then
    expected := jsonb_populate_record(null::public.profiles, p_expected);
    if row(profile.plan, profile.plan_status, profile.plan_expires_at, profile.updates_until, profile.standalone_team_access)
      is distinct from row(expected.plan, expected.plan_status, expected.plan_expires_at, expected.updates_until, expected.standalone_team_access) then
      return 'retry';
    end if;
    changes := jsonb_populate_record(profile, p_changes);
  else
    changes := profile;
  end if;
  update public.manual_payments
    set status = p_status, verified_at = now(), verified_by = p_actor, admin_note = p_note
    where id = payment.id;
  select plan into remaining_plan from public.manual_payments
    where user_id = payment.user_id and status = 'pending'
    order by submitted_at desc, id desc limit 1;
  update public.profiles
    set plan = changes.plan, plan_status = changes.plan_status, account_type = changes.account_type,
        plan_expires_at = changes.plan_expires_at, updates_until = changes.updates_until,
        standalone_team_access = changes.standalone_team_access,
        expiry_reminder_sent_at = changes.expiry_reminder_sent_at, pending_plan = remaining_plan
    where id = profile.id;
  insert into public.payment_notifications (payment_id, user_id, status, user_email, user_name, plan, note, expires_at)
    values (payment.id::text, payment.user_id, p_status, payment.user_email, payment.user_name, payment.plan, p_note, p_expires_at);
  return 'updated';
end;
$$;
revoke all on function public.decide_manual_payment(text, uuid, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.decide_manual_payment(text, uuid, text, text, jsonb, jsonb, timestamptz) to service_role;

revoke insert, update, delete, truncate on public.api_keys from public, anon, authenticated;
create table public.api_key_monthly_usage (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  period date not null,
  requests integer not null default 0 check (requests >= 0),
  egress_bytes bigint not null default 0 check (egress_bytes >= 0),
  primary key (key_id, period)
);
alter table public.api_key_monthly_usage enable row level security;
revoke all on public.api_key_monthly_usage from anon, authenticated;
grant select, insert, update on public.api_key_monthly_usage to service_role;

create function public.consume_api_quota(p_key uuid, p_org uuid, p_bytes bigint, p_request_limit integer, p_egress_limit bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare
  caller public.api_keys%rowtype;
  usage public.api_key_monthly_usage%rowtype;
  month_start date := date_trunc('month', statement_timestamp() at time zone 'UTC')::date;
begin
  if p_bytes is null or p_bytes < 0 or coalesce(p_request_limit, 0) <= 0 or coalesce(p_egress_limit, 0) <= 0 then
    raise exception 'invalid quota limits';
  end if;
  select * into caller from public.api_keys where id = p_key for update;
  if not found or caller.revoked_at is not null then return '{"result":"revoked"}'::jsonb; end if;
  if not exists (
    select 1 from public.organization_members m join public.organizations o on o.id = m.org_id
    where m.user_id = caller.user_id and o.id = p_org and o.plan = 'paid' and o.status = 'active'
      and (o.access_expires_at is null or o.access_expires_at > statement_timestamp())
  ) then return '{"result":"plan-inactive"}'::jsonb; end if;
  select * into usage from public.api_key_monthly_usage where key_id = p_key and period = month_start;
  if coalesce(usage.requests, 0) >= p_request_limit then return '{"result":"requests"}'::jsonb; end if;
  if p_bytes > p_egress_limit - coalesce(usage.egress_bytes, 0) then return '{"result":"egress"}'::jsonb; end if;
  insert into public.api_key_monthly_usage (key_id, period, requests, egress_bytes)
    values (p_key, month_start, 1, p_bytes)
    on conflict (key_id, period) do update set
      requests = api_key_monthly_usage.requests + 1,
      egress_bytes = api_key_monthly_usage.egress_bytes + excluded.egress_bytes
    returning * into usage;
  update public.api_keys set last_used_at = now() where id = p_key;
  return jsonb_build_object('result', 'ok', 'requests', usage.requests, 'egress_bytes', usage.egress_bytes);
end;
$$;
revoke all on function public.consume_api_quota(uuid, uuid, bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.consume_api_quota(uuid, uuid, bigint, integer, bigint) to service_role;

-- Browser SQL reads and legacy Storage use the same live-project and active-team checks as the HTTP gate.
create or replace function public.workspace_project_role(p_project uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select case
    when m.role = 'owner' or p.created_by = p_user then 'manager'
    else nullif(coalesce(pm.role, case when p.visibility = 'team' then p.default_role end), 'none')
  end
  from public.workspace_projects p
  join public.organizations o on o.id = p.org_id
  join public.organization_members m on m.org_id = o.id and m.user_id = p_user
  left join public.workspace_project_members pm on pm.project_id = p.id and pm.user_id = p_user
  where p.id = p_project and p.archived_at is null and p_user = auth.uid()
    and o.status = 'active' and (o.access_expires_at is null or o.access_expires_at > statement_timestamp())
$$;

create table public.workspace_upload_reservations (
  object_key text primary key,
  project_id uuid not null references public.workspace_projects(id) on delete cascade,
  size_bytes bigint not null check (size_bytes > 0),
  expires_at timestamptz not null,
  attached_at timestamptz,
  released_at timestamptz,
  orphaned_at timestamptz
);
create index workspace_upload_reservations_project on public.workspace_upload_reservations(project_id) where released_at is null;
create index workspace_upload_reservations_expiring on public.workspace_upload_reservations(expires_at)
  where attached_at is null and released_at is null and orphaned_at is null;
alter table public.workspace_upload_reservations enable row level security;
revoke all on public.workspace_upload_reservations from anon, authenticated;
grant select, insert, update on public.workspace_upload_reservations to service_role;

create function public.workspace_upload_usage(p_project uuid)
returns bigint language sql stable set search_path = '' as $$
  select coalesce((select sum(size_bytes) from public.workspace_upload_reservations
                   where project_id = p_project and released_at is null), 0)
       + coalesce((select sum(bytes) from (
           select max(l.file_bytes) as bytes from public.workspace_layers l
           where l.project_id = p_project and l.dataset_slug = 'upload'
             and not exists (select 1 from public.workspace_upload_reservations r where r.object_key = l.r2_key and r.released_at is null)
           group by l.r2_key
         ) existing), 0)
$$;

-- Internal role lookup for service-only mutations. A second check under
-- the project lock keeps stale HTTP authorization from writing a project.
create function public.workspace_mutation_role(p_project uuid, p_org uuid, p_actor uuid)
returns text language sql set search_path = '' as $$
  select case
    when m.role = 'owner' or p.created_by = p_actor then 'manager'
    else nullif(coalesce(pm.role, case when p.visibility = 'team' then p.default_role end), 'none')
  end
  from public.workspace_projects p
  join public.organizations o on o.id = p.org_id
  join public.organization_members m on m.org_id = o.id and m.user_id = p_actor
  left join public.workspace_project_members pm on pm.project_id = p.id and pm.user_id = p_actor
  where p.id = p_project and o.id = p_org and p.archived_at is null
    and o.status = 'active' and (o.access_expires_at is null or o.access_expires_at > statement_timestamp())
$$;

create function public.reserve_workspace_uploads(p_project uuid, p_org uuid, p_actor uuid, p_files jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  file jsonb;
  used bigint;
  adding bigint := 0;
  prefix text := 'workspace-uploads/' || p_org || '/' || p_project || '/';
begin
  perform 1 from public.workspace_projects where id = p_project for update;
  if coalesce(public.workspace_mutation_role(p_project, p_org, p_actor), '') not in ('editor', 'manager') then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;
  if jsonb_array_length(p_files) not between 1 and 40 then raise exception 'bad_upload'; end if;
  for file in select value from jsonb_array_elements(p_files) loop
    if left(file->>'key', length(prefix)) <> prefix or (file->>'size')::bigint not between 1 and 419430400 then
      raise exception 'bad_upload';
    end if;
    adding := adding + (file->>'size')::bigint;
  end loop;
  used := public.workspace_upload_usage(p_project);
  if used + adding > 2147483648 then raise exception 'project_full'; end if;
  insert into public.workspace_upload_reservations (object_key, project_id, size_bytes, expires_at)
    select value->>'key', p_project, (value->>'size')::bigint, now() + interval '30 minutes'
    from jsonb_array_elements(p_files);
  return used + adding;
end;
$$;

create function public.mutate_workspace_project(
  p_project uuid, p_org uuid, p_actor uuid, p_name text, p_action text, p_summary text, p_payload jsonb,
  p_staff_override boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare
  role text;
  result jsonb := '{}'::jsonb;
  rev public.workspace_revisions%rowtype;
  changed_project public.workspace_projects%rowtype;
  layer public.workspace_layers%rowtype;
  bookmark public.workspace_bookmarks%rowtype;
  new_layers jsonb;
  item jsonb;
  reservation public.workspace_upload_reservations%rowtype;
  layer_count integer;
  top_order integer;
  ids uuid[];
  target uuid;
begin
  select * into changed_project from public.workspace_projects where id = p_project for update;
  role := public.workspace_mutation_role(p_project, p_org, p_actor);
  if p_staff_override is true and p_action = 'members' and changed_project.org_id = p_org and changed_project.archived_at is null then
    role := 'manager';
  end if;
  if coalesce(role, '') not in ('editor', 'manager')
      or (p_action in ('project', 'archive', 'members') and role <> 'manager') then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;
  case p_action
    when 'project' then
      changed_project := jsonb_populate_record(changed_project, p_payload);
      update public.workspace_projects set name = changed_project.name, description = changed_project.description,
        map_state = changed_project.map_state, visibility = changed_project.visibility, default_role = changed_project.default_role
        where id = p_project;
    when 'archive' then
      update public.workspace_projects set archived_at = now() where id = p_project;
    when 'layer.add' then
      select count(*), coalesce(max(sort_order), -1) into layer_count, top_order
        from public.workspace_layers where project_id = p_project;
      if layer_count + jsonb_array_length(p_payload) > 40 then raise exception 'too_many_layers'; end if;
      for item in select value from jsonb_array_elements(p_payload) loop
        if item->>'dataset_slug' = 'upload' then
          select * into reservation from public.workspace_upload_reservations
            where object_key = item->>'r2_key' and project_id = p_project for update;
          if not found or reservation.released_at is not null or reservation.size_bytes <> (item->>'file_bytes')::bigint then
            raise exception 'upload_missing';
          end if;
          update public.workspace_upload_reservations set attached_at = coalesce(attached_at, now())
            where object_key = reservation.object_key;
        end if;
      end loop;
      with inserted as (
        insert into public.workspace_layers (project_id, dataset_slug, country, r2_key, file_format, label, style, sort_order, added_by, added_by_name, file_bytes)
        select p_project, value->>'dataset_slug', value->>'country', value->>'r2_key', value->>'file_format',
          value->>'label', value->'style', top_order + ordinality, p_actor, p_name, (value->>'file_bytes')::bigint
        from jsonb_array_elements(p_payload) with ordinality
        returning *
      )
      select jsonb_agg(to_jsonb(inserted) order by sort_order) into new_layers from inserted;
      result := jsonb_build_object('layers', new_layers, 'layer', new_layers->0);
    when 'layer.order' then
      select coalesce(array_agg(value::uuid), '{}'::uuid[]) into ids from jsonb_array_elements_text(p_payload);
      select count(*) into layer_count from public.workspace_layers where project_id = p_project;
      if layer_count <> cardinality(ids) or layer_count <> (
        select count(*) from public.workspace_layers where project_id = p_project and id = any(ids)
      ) then raise exception 'order_mismatch'; end if;
      update public.workspace_layers l set sort_order = layer_count - ordered.ordinality
        from unnest(ids) with ordinality ordered(id, ordinality) where l.project_id = p_project and l.id = ordered.id;
    when 'layer.edit' then
      update public.workspace_layers set label = coalesce(p_payload->>'label', label), style = coalesce(p_payload->'style', style)
        where project_id = p_project and id = (p_payload->>'id')::uuid returning * into layer;
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
      result := jsonb_build_object('layer', to_jsonb(layer));
    when 'layer.remove' then
      delete from public.workspace_layers where project_id = p_project and id = (p_payload->>'id')::uuid;
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    when 'bookmark.add' then
      insert into public.workspace_bookmarks (project_id, name, lng, lat, zoom, created_by, created_by_name)
        values (p_project, p_payload->>'name', (p_payload->>'lng')::float8, (p_payload->>'lat')::float8,
          (p_payload->>'zoom')::float8, p_actor, p_name) returning * into bookmark;
      result := jsonb_build_object('bookmark', to_jsonb(bookmark));
    when 'bookmark.remove' then
      delete from public.workspace_bookmarks where project_id = p_project and id = (p_payload->>'id')::uuid;
      if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    when 'members' then
      target := (p_payload->>'user_id')::uuid;
      if target = p_actor or target = changed_project.created_by or not exists (
        select 1 from public.organization_members where org_id = p_org and user_id = target and organization_members.role <> 'owner'
      ) then raise exception 'workspace_access_denied' using errcode = '42501'; end if;
      if p_payload->>'role' is null then
        delete from public.workspace_project_members where project_id = p_project and user_id = target;
      else
        insert into public.workspace_project_members (project_id, user_id, role, added_by)
          values (p_project, target, p_payload->>'role', p_actor)
          on conflict (project_id, user_id) do update set role = excluded.role, added_by = excluded.added_by;
      end if;
    when 'restore' then
      rev := public.workspace_restore(p_project, (p_payload->>'seq')::integer, p_actor, p_name);
      return jsonb_build_object('rev', to_jsonb(rev) - 'snapshot');
    else raise exception 'invalid workspace action';
  end case;
  rev := public.workspace_commit(p_project, p_actor, p_name, p_action, left(p_summary, 300));
  return result || jsonb_build_object('rev', to_jsonb(rev) - 'snapshot');
end;
$$;

grant execute on function public.workspace_snapshot(uuid), public.workspace_commit(uuid, uuid, text, text, text),
  public.workspace_restore(uuid, integer, uuid, text) to service_role;
revoke all on function public.workspace_upload_usage(uuid) from public, anon, authenticated;
revoke all on function public.workspace_mutation_role(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reserve_workspace_uploads(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mutate_workspace_project(uuid, uuid, uuid, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.workspace_upload_usage(uuid) to service_role;
grant execute on function public.workspace_mutation_role(uuid, uuid, uuid) to service_role;
grant execute on function public.reserve_workspace_uploads(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.mutate_workspace_project(uuid, uuid, uuid, text, text, text, jsonb, boolean) to service_role;

create function public.create_workspace_project(
  p_project uuid, p_org uuid, p_actor uuid, p_name text, p_project_data jsonb,
  p_layers jsonb, p_bookmarks jsonb, p_summary text, p_template_summary text
) returns uuid language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.organization_members m join public.organizations o on o.id = m.org_id
    where m.user_id = p_actor and o.id = p_org and o.status = 'active'
      and (o.access_expires_at is null or o.access_expires_at > statement_timestamp())
  ) then raise exception 'workspace_access_denied' using errcode = '42501'; end if;
  insert into public.workspace_projects (id, org_id, name, description, map_state, created_by)
    values (p_project, p_org, p_project_data->>'name', p_project_data->>'description', p_project_data->'map_state', p_actor);
  if p_template_summary is not null then
    perform public.workspace_commit(p_project, p_actor, p_name, 'create', left(p_summary, 300));
  end if;
  insert into public.workspace_layers (project_id, dataset_slug, country, r2_key, file_format, label, style, sort_order, added_by, added_by_name, file_bytes)
    select p_project, value->>'dataset_slug', value->>'country', value->>'r2_key', value->>'file_format',
      value->>'label', value->'style', ordinality - 1, p_actor, p_name, (value->>'file_bytes')::bigint
    from jsonb_array_elements(p_layers) with ordinality;
  insert into public.workspace_upload_reservations (object_key, project_id, size_bytes, expires_at, attached_at)
    select r2_key, p_project, max(file_bytes), now(), now() from public.workspace_layers
    where project_id = p_project and dataset_slug = 'upload' and file_bytes > 0 group by r2_key;
  if public.workspace_upload_usage(p_project) > 2147483648 then raise exception 'project_full'; end if;
  insert into public.workspace_bookmarks (project_id, name, lng, lat, zoom, created_by, created_by_name)
    select p_project, value->>'name', (value->>'lng')::float8, (value->>'lat')::float8, (value->>'zoom')::float8, p_actor, p_name
    from jsonb_array_elements(p_bookmarks);
  perform public.workspace_commit(p_project, p_actor, p_name, case when p_template_summary is null then 'create' else 'template' end,
    left(coalesce(p_template_summary, p_summary), 300));
  return p_project;
end;
$$;
revoke all on function public.create_workspace_project(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace_project(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text, text) to service_role;

create table public.account_deletion_jobs (
  user_id uuid primary key,
  org_ids uuid[] not null default '{}',
  closed_org_ids uuid[] not null default '{}',
  cleaned_org_ids uuid[] not null default '{}',
  requested_at timestamptz not null default now(),
  auth_deleted_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text
);
create index account_deletion_jobs_pending on public.account_deletion_jobs(next_attempt_at) where completed_at is null;
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from anon, authenticated;
grant select, insert, update on public.account_deletion_jobs to service_role;

create function public.request_account_deletion(p_user uuid)
returns text language plpgsql set search_path = '' as $$
declare
  team public.organizations%rowtype;
  teams uuid[] := '{}';
begin
  if exists (select 1 from public.account_deletion_jobs where user_id = p_user) then return 'accepted'; end if;
  for team in select o.* from public.organizations o
    join public.organization_members m on m.org_id = o.id and m.user_id = p_user and m.role = 'owner'
    order by o.id for update of o
  loop
    if exists (select 1 from public.organization_members where org_id = team.id and user_id <> p_user) then
      return 'owner_has_members';
    end if;
    if team.plan = 'paid' and team.status = 'active'
      and (team.access_expires_at is null or team.access_expires_at > statement_timestamp()) then
      return 'paid_team';
    end if;
    teams := array_append(teams, team.id);
  end loop;
  insert into public.account_deletion_jobs(user_id, org_ids) values (p_user, teams) on conflict do nothing;
  return 'accepted';
end;
$$;

create function public.close_deleted_account_team(p_user uuid, p_org uuid)
returns boolean language plpgsql set search_path = '' as $$
declare team public.organizations%rowtype;
begin
  if not exists (
    select 1 from public.account_deletion_jobs where user_id = p_user and auth_deleted_at is not null and p_org = any(org_ids)
  ) then return false; end if;
  select * into team from public.organizations where id = p_org for update;
  if not found then return true; end if;
  if exists (select 1 from public.organization_members where org_id = p_org) then return false; end if;
  if team.plan = 'paid' and team.status = 'active'
    and (team.access_expires_at is null or team.access_expires_at > statement_timestamp()) then return false; end if;
  delete from public.organizations where id = p_org;
  return true;
end;
$$;
revoke all on function public.request_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.close_deleted_account_team(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid) to service_role;
grant execute on function public.close_deleted_account_team(uuid, uuid) to service_role;

alter table public.dataset_bundles add column if not exists needs_rebuild_at timestamptz;

create table public.catalog_file_replacements (
  id uuid primary key default gen_random_uuid(),
  catalog_file_id bigint not null references public.catalog_files(id),
  previous_key text not null,
  stage_key text not null unique,
  version_key text unique,
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'awaiting_upload' check (status in ('awaiting_upload', 'ready', 'published', 'superseded')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.catalog_file_replacements enable row level security;
revoke all on public.catalog_file_replacements from anon, authenticated;
grant select, insert, update on public.catalog_file_replacements to service_role;

-- Called only by the GIS validation worker after it has verified the final
-- version and built the matching web derivative if the file contains rasters.
create function public.publish_catalog_file_replacement(p_id uuid)
returns text language plpgsql set search_path = '' as $$
declare replacement public.catalog_file_replacements%rowtype;
begin
  select * into replacement from public.catalog_file_replacements where id = p_id for update;
  if not found then return 'not_found'; end if;
  if replacement.status <> 'ready' then return replacement.status; end if;
  update public.catalog_files
    set r2_key = replacement.version_key, file_size_mb = round(replacement.size_bytes / 1048576.0, 2)
    where id = replacement.catalog_file_id and r2_key = replacement.previous_key;
  if not found then
    update public.catalog_file_replacements set status = 'superseded' where id = p_id;
    return 'superseded';
  end if;
  update public.dataset_bundles set needs_rebuild_at = now() where dataset_id = (
    select slug from public.catalog_files where id = replacement.catalog_file_id
  );
  update public.catalog_file_replacements set status = 'published', published_at = now() where id = p_id;
  return 'published';
end;
$$;
revoke all on function public.publish_catalog_file_replacement(uuid) from public, anon, authenticated;
grant execute on function public.publish_catalog_file_replacement(uuid) to service_role;

alter table public.sales_drafts add column if not exists send_claimed_at timestamptz;


create table if not exists lenco_payments (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  user_id         uuid not null references profiles(id) on delete cascade,
  user_email      text not null,
  user_name       text,
  plan            text not null default 'individual',
  product         text not null,
  amount_usd      numeric(10,2) not null,
  amount_charged  numeric(12,2) not null,
  currency        text not null,
  channel         text not null check (channel in ('card', 'mobile-money')),
  status          text not null default 'pending'
                  check (status in ('pending', 'successful', 'failed', 'mismatch', 'paid_unapplied')),
  lenco_id        text,
  lenco_reference text,
  paid_type       text,
  failure_reason  text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  granted_at      timestamptz
);

create index if not exists lenco_payments_user_idx   on lenco_payments (user_id, created_at desc);
create index if not exists lenco_payments_status_idx on lenco_payments (status, created_at desc);

alter table lenco_payments enable row level security;

alter table public.lenco_payments add column if not exists next_check_at timestamptz not null default now();
create unique index lenco_payments_collection_granted on public.lenco_payments(lenco_id) where granted_at is not null;
create index lenco_payments_pending_check on public.lenco_payments(next_check_at) where granted_at is null;
revoke all on public.lenco_payments from anon, authenticated;
grant select, insert, update on public.lenco_payments to service_role;

create function public.complete_lenco_payment(
  p_reference text, p_collection text, p_lenco_reference text, p_type text, p_currency text, p_amount numeric,
  p_expected jsonb, p_changes jsonb, p_expires_at timestamptz
) returns text language plpgsql set search_path = '' as $$
declare
  payment public.lenco_payments%rowtype;
  profile public.profiles%rowtype;
  expected public.profiles%rowtype;
  changes public.profiles%rowtype;
begin
  select * into payment from public.lenco_payments where reference = p_reference for update;
  if not found then return 'unknown'; end if;
  if payment.granted_at is not null then return 'already'; end if;

  if p_collection is null or p_collection = '' or p_currency is distinct from payment.currency
      or p_type is distinct from payment.channel or p_amount is null or p_amount <> payment.amount_charged then
    update public.lenco_payments set status = 'mismatch', lenco_id = p_collection, lenco_reference = p_lenco_reference,
      failure_reason = 'Collection amount, currency, channel or identifier did not match' where id = payment.id;
    return 'mismatch';
  end if;

  select * into profile from public.profiles where id = payment.user_id for update;
  if not found then return 'profile_missing'; end if;
  expected := jsonb_populate_record(null::public.profiles, p_expected);
  if row(profile.plan, profile.plan_status, profile.plan_expires_at, profile.updates_until, profile.standalone_team_access)
    is distinct from row(expected.plan, expected.plan_status, expected.plan_expires_at, expected.updates_until, expected.standalone_team_access) then
    return 'retry';
  end if;
  changes := jsonb_populate_record(profile, p_changes);
  update public.lenco_payments set status = 'successful', granted_at = now(), completed_at = now(),
    lenco_id = p_collection, lenco_reference = p_lenco_reference, paid_type = p_type, failure_reason = null where id = payment.id;
  update public.profiles set plan = changes.plan, plan_status = changes.plan_status, plan_expires_at = changes.plan_expires_at,
    updates_until = changes.updates_until, standalone_team_access = changes.standalone_team_access,
    expiry_reminder_sent_at = changes.expiry_reminder_sent_at where id = profile.id;
  insert into public.payment_notifications (payment_id, user_id, status, user_email, user_name, plan, expires_at)
    values ('lenco:' || payment.id, payment.user_id, 'verified', payment.user_email, payment.user_name, payment.plan, p_expires_at);
  return 'granted';
end;
$$;
revoke all on function public.complete_lenco_payment(text, text, text, text, text, numeric, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_lenco_payment(text, text, text, text, text, numeric, jsonb, jsonb, timestamptz) to service_role;

commit;
