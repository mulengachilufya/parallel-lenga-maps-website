begin;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'buyer@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'admin@example.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'other@example.invalid');

set local role service_role;

do $$
declare
  buyer uuid := '10000000-0000-0000-0000-000000000001';
  actor uuid := '10000000-0000-0000-0000-000000000002';
  team uuid := '20000000-0000-0000-0000-000000000001';
  project uuid := '30000000-0000-0000-0000-000000000001';
  key uuid := '40000000-0000-0000-0000-000000000001';
  expiry timestamptz := '2099-01-01T00:00:00Z';
  profile jsonb;
  stale_profile jsonb;
  usage jsonb;
  result jsonb;
  upload_key text := 'workspace-uploads/' || team || '/' || project || '/test.gpkg';
  file_id bigint;
  replacement_id uuid := '50000000-0000-0000-0000-000000000001';
begin
  select jsonb_build_object('standalone_team_access', standalone_team_access, 'plan_status', plan_status)
    into profile from public.profiles where id = buyer;
  if profile is null then raise exception 'signup trigger did not create a profile'; end if;
  stale_profile := profile;
  insert into public.manual_payments(reference, user_id, user_email, plan, account_type, payment_method)
    values ('manual-1', buyer, 'buyer@example.invalid', 'individual', 'personal', 'bank'),
           ('manual-2', buyer, 'buyer@example.invalid', 'individual', 'personal', 'bank');
  if public.decide_manual_payment('manual-1', actor, 'verified', null, profile,
    jsonb_build_object('plan', 'individual', 'plan_status', 'active', 'plan_expires_at', expiry), expiry) <> 'updated' then
    raise exception 'first manual approval failed';
  end if;
  if public.decide_manual_payment('manual-1', actor, 'verified', null, profile, '{}'::jsonb, null) <> 'already'
      or public.decide_manual_payment('manual-1', actor, 'rejected', null, profile, '{}'::jsonb, null) <> 'conflict' then
    raise exception 'payment transition is not idempotent';
  end if;
  if public.decide_manual_payment('manual-2', actor, 'verified', null, stale_profile, '{}'::jsonb, null) <> 'retry' then
    raise exception 'a stale profile could overwrite the first grant';
  end if;
  if not exists (select 1 from public.profiles where id = buyer and plan_expires_at = expiry and pending_plan = 'individual')
      or (select count(*) from public.payment_notifications where user_id = buyer) <> 1 then
    raise exception 'profile grant and notification did not commit together';
  end if;

  insert into public.lenco_payments(reference, user_id, user_email, product, amount_usd, amount_charged, currency, channel)
    values ('instant-1', buyer, 'buyer@example.invalid', 'pass_1m', 5, 5, 'USD', 'card');
  select jsonb_build_object('standalone_team_access', standalone_team_access, 'plan', plan, 'plan_status', plan_status,
    'plan_expires_at', plan_expires_at, 'updates_until', updates_until) into profile from public.profiles where id = buyer;
  if public.complete_lenco_payment('instant-1', 'provider-1', 'ref-1', 'card', 'USD', 4, profile, '{}'::jsonb, expiry) <> 'mismatch'
      or (select granted_at from public.lenco_payments where reference = 'instant-1') is not null then
    raise exception 'incorrect provider amount acquired a grant';
  end if;
  if public.complete_lenco_payment('instant-1', 'provider-1', 'ref-1', 'card', 'USD', 5, profile, '{}'::jsonb, expiry) <> 'granted'
      or public.complete_lenco_payment('instant-1', 'provider-1', 'ref-1', 'card', 'USD', 5, profile, '{}'::jsonb, expiry) <> 'already' then
    raise exception 'instant payment could not be finalized exactly once';
  end if;

  insert into public.organizations(id, name, plan, access_expires_at, seat_count)
    values (team, 'Test team', 'paid', now() + interval '1 day', 4);
  insert into public.organization_members(org_id, user_id, role) values (team, buyer, 'owner');
  if (select plan from public.profiles where id = buyer) <> 'individual' then
    raise exception 'joining a team changed the personal plan';
  end if;
  insert into public.api_keys(id, user_id, key_hash, key_last4, label) values (key, buyer, 'fake', '0000', 'Test');
  insert into public.api_key_monthly_usage(key_id, period, requests, egress_bytes)
    values (key, (date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date, 100, 100);
  usage := public.consume_api_quota(key, team, 8, 2, 10);
  if usage->>'result' <> 'ok' or (usage->>'requests')::int <> 1 then raise exception 'period did not roll forward'; end if;
  if public.consume_api_quota(key, team, 3, 2, 10)->>'result' <> 'egress'
      or public.consume_api_quota(key, team, 2, 2, 10)->>'result' <> 'ok'
      or public.consume_api_quota(key, team, 0, 2, 10)->>'result' <> 'requests' then
    raise exception 'quota did not constrain the exact limit';
  end if;
  if has_table_privilege('authenticated', 'public.api_keys', 'update')
      or has_function_privilege('authenticated', 'public.consume_api_quota(uuid,uuid,bigint,integer,bigint)', 'execute') then
    raise exception 'browser can write privileged API-key state';
  end if;

  perform public.create_workspace_project(project, team, buyer, 'Buyer', '{"name":"GIS","description":"","map_state":{}}',
    '[]', '[]', 'Create project', null);
  if public.reserve_workspace_uploads(project, team, buyer, jsonb_build_array(jsonb_build_object('key', upload_key, 'size', 512))) <> 512 then
    raise exception 'upload space was not reserved';
  end if;
  result := public.mutate_workspace_project(project, team, buyer, 'Buyer', 'layer.add', 'Attach upload',
    jsonb_build_array(jsonb_build_object('dataset_slug', 'upload', 'country', '', 'r2_key', upload_key,
      'file_format', 'GeoPackage', 'label', 'Test layer', 'style', '{}'::jsonb, 'file_bytes', 512)));
  if result->'rev'->>'seq' <> '2' or result->'layer'->>'r2_key' <> upload_key
      or result->'rev' ? 'snapshot' or public.workspace_upload_usage(project) <> 512 then
    raise exception 'workspace edit, revision or accounting did not commit';
  end if;
  begin
    perform public.mutate_workspace_project(project, team, actor, 'Another user', 'project', 'Invalid edit', '{"name":"Changed"}');
    raise exception 'outside user could edit the project';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reserve_workspace_uploads(project, team, buyer, (
      select jsonb_agg(jsonb_build_object('key', upload_key || n, 'size', 419430400)) from generate_series(1, 6) n
    ));
    raise exception 'over-quota upload reservation succeeded';
  exception when raise_exception then
    if sqlerrm <> 'project_full' then raise; end if;
  end;
  if (select count(*) from public.workspace_upload_reservations where project_id = project) <> 1 then
    raise exception 'rejected reservation left rows behind';
  end if;
  if public.request_account_deletion(buyer) <> 'paid_team' then raise exception 'paid owner deletion was accepted'; end if;
  if public.request_account_deletion(actor) <> 'accepted' then raise exception 'deletion confirmation was rejected'; end if;
  if public.request_account_deletion(actor) <> 'accepted' then raise exception 'deletion retry was rejected'; end if;
  if (select count(*) from public.account_deletion_jobs where user_id = actor) <> 1 then
    raise exception 'deletion confirmation could not queue idempotently';
  end if;

  update public.organizations set access_expires_at = now() - interval '1 day' where id = team;
  if public.consume_api_quota(key, team, 0, 5000, 100000)->>'result' <> 'plan-inactive' then
    raise exception 'expired team can consume quota';
  end if;

  insert into public.catalog_files(slug, iso3, country, label, file_name, r2_key, file_format, file_size_mb)
    values ('roads', 'ZMB', 'Zambia', 'Roads', 'roads.gpkg', 'live/roads.gpkg', 'GeoPackage', 1) returning id into file_id;
  insert into public.catalog_file_replacements(id, catalog_file_id, previous_key, stage_key, version_key, size_bytes, status)
    values (replacement_id, file_id, 'live/roads.gpkg', 'stage/roads.gpkg', 'versions/test/roads.gpkg', 2097152, 'ready');
  if public.publish_catalog_file_replacement(replacement_id) <> 'published' then
    raise exception 'versioned catalog publication failed';
  end if;
  if public.publish_catalog_file_replacement(replacement_id) <> 'published'
      or (select r2_key from public.catalog_files where id = file_id) <> 'versions/test/roads.gpkg'
      or (select previous_key from public.catalog_file_replacements where id = replacement_id) <> 'live/roads.gpkg' then
    raise exception 'versioned catalog publication failed to retain the previous key';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
begin
  if exists (select 1 from public.workspace_projects where id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'workspace policy exposed an expired team project';
  end if;
end;
$$;

rollback;
