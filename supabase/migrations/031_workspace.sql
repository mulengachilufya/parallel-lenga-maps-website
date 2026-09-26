-- 031_workspace.sql
--
-- Team workspace: shared project spaces (layers, saved views), per-project
-- discussion with map-pinned comments, and a git-style revision history.
--
-- Access model
--   * Reads: members of the owning organization, via current_org_id().
--     Realtime (postgres_changes) goes through these same policies.
--   * Writes: API routes only, with the service role, after verifying
--     membership. There are no insert/update/delete policies on purpose.
--   * workspace_commit / workspace_restore run as service role only.
--
-- Applied to prod 2026-09-26 via Supabase MCP.

-- ── Projects ────────────────────────────────────────────────────────────────
create table if not exists workspace_projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 2000),
  map_state    jsonb not null default '{"center":[25,-4],"zoom":3,"basemap":"light"}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create index if not exists workspace_projects_org_idx on workspace_projects (org_id, updated_at desc);

-- ── Layers (live state; history lives in revisions) ─────────────────────────
create table if not exists workspace_layers (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references workspace_projects(id) on delete cascade,
  dataset_slug   text not null,
  country        text not null,
  r2_key         text not null,
  file_format    text not null default '',
  label          text not null check (char_length(label) between 1 and 160),
  style          jsonb not null default '{}'::jsonb,
  sort_order     integer not null default 0,
  added_by       uuid references auth.users(id) on delete set null,
  added_by_name  text,
  created_at     timestamptz not null default now()
);
create index if not exists workspace_layers_project_idx on workspace_layers (project_id, sort_order);

-- ── Saved views (spatial bookmarks) ─────────────────────────────────────────
create table if not exists workspace_bookmarks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references workspace_projects(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  lng              double precision not null,
  lat              double precision not null,
  zoom             double precision not null,
  created_by       uuid references auth.users(id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists workspace_bookmarks_project_idx on workspace_bookmarks (project_id, created_at);

-- ── Discussion ──────────────────────────────────────────────────────────────
create table if not exists workspace_messages (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references workspace_projects(id) on delete cascade,
  parent_id    uuid references workspace_messages(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text not null,
  body         text not null check (char_length(body) between 1 and 4000),
  lng          double precision,
  lat          double precision,
  mentions     uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz,
  check ((lng is null) = (lat is null))
);
create index if not exists workspace_messages_project_idx on workspace_messages (project_id, created_at);

-- ── Revisions (append-only, one per change) ─────────────────────────────────
create table if not exists workspace_revisions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references workspace_projects(id) on delete cascade,
  seq          integer not null,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text not null,
  action       text not null,
  summary      text not null,
  snapshot     jsonb not null,
  created_at   timestamptz not null default now(),
  unique (project_id, seq)
);
create index if not exists workspace_revisions_project_idx on workspace_revisions (project_id, seq desc);

-- ── Row level security: org members read, nobody writes directly ────────────
alter table workspace_projects  enable row level security;
alter table workspace_layers    enable row level security;
alter table workspace_bookmarks enable row level security;
alter table workspace_messages  enable row level security;
alter table workspace_revisions enable row level security;

drop policy if exists ws_projects_read on workspace_projects;
create policy ws_projects_read on workspace_projects
  for select to authenticated using (org_id = current_org_id());

drop policy if exists ws_layers_read on workspace_layers;
create policy ws_layers_read on workspace_layers
  for select to authenticated using (
    project_id in (select id from workspace_projects where org_id = current_org_id()));

drop policy if exists ws_bookmarks_read on workspace_bookmarks;
create policy ws_bookmarks_read on workspace_bookmarks
  for select to authenticated using (
    project_id in (select id from workspace_projects where org_id = current_org_id()));

drop policy if exists ws_messages_read on workspace_messages;
create policy ws_messages_read on workspace_messages
  for select to authenticated using (
    project_id in (select id from workspace_projects where org_id = current_org_id()));

drop policy if exists ws_revisions_read on workspace_revisions;
create policy ws_revisions_read on workspace_revisions
  for select to authenticated using (
    project_id in (select id from workspace_projects where org_id = current_org_id()));

-- ── Snapshot: the full shareable state of a project ─────────────────────────
create or replace function workspace_snapshot(p_project uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'name',        p.name,
    'description', p.description,
    'map_state',   p.map_state,
    'layers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'dataset_slug', l.dataset_slug, 'country', l.country,
        'r2_key', l.r2_key, 'file_format', l.file_format, 'label', l.label,
        'style', l.style, 'sort_order', l.sort_order,
        'added_by', l.added_by, 'added_by_name', l.added_by_name,
        'created_at', l.created_at
      ) order by l.sort_order, l.created_at)
      from workspace_layers l where l.project_id = p.id), '[]'::jsonb),
    'bookmarks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'lng', b.lng, 'lat', b.lat, 'zoom', b.zoom,
        'created_by', b.created_by, 'created_by_name', b.created_by_name,
        'created_at', b.created_at
      ) order by b.created_at)
      from workspace_bookmarks b where b.project_id = p.id), '[]'::jsonb)
  )
  from workspace_projects p where p.id = p_project
$$;

-- ── Commit: record the current state as the next revision ───────────────────
-- Locks the project row so concurrent commits get consecutive seq numbers.
create or replace function workspace_commit(
  p_project uuid, p_author uuid, p_author_name text, p_action text, p_summary text
) returns workspace_revisions
language plpgsql
set search_path = public
as $$
declare
  v_seq integer;
  v_rev workspace_revisions;
begin
  perform 1 from workspace_projects where id = p_project for update;
  select coalesce(max(seq), 0) + 1 into v_seq from workspace_revisions where project_id = p_project;
  update workspace_projects set updated_at = now() where id = p_project;
  insert into workspace_revisions (project_id, seq, author_id, author_name, action, summary, snapshot)
  values (p_project, v_seq, p_author, p_author_name, p_action, p_summary, workspace_snapshot(p_project))
  returning * into v_rev;
  return v_rev;
end;
$$;

-- ── Restore: make the live state match an earlier revision, then commit ─────
-- Like `git revert` to a point: history is never rewritten, the restore is
-- itself a new revision.
create or replace function workspace_restore(
  p_project uuid, p_seq integer, p_author uuid, p_author_name text
) returns workspace_revisions
language plpgsql
set search_path = public
as $$
declare
  v_snap jsonb;
begin
  perform 1 from workspace_projects where id = p_project for update;
  select snapshot into v_snap from workspace_revisions where project_id = p_project and seq = p_seq;
  if v_snap is null then
    raise exception 'revision % not found', p_seq using errcode = 'P0002';
  end if;

  update workspace_projects
     set name = v_snap->>'name',
         description = coalesce(v_snap->>'description', ''),
         map_state = coalesce(v_snap->'map_state', map_state)
   where id = p_project;

  delete from workspace_layers where project_id = p_project;
  insert into workspace_layers (id, project_id, dataset_slug, country, r2_key, file_format,
                                label, style, sort_order, added_by, added_by_name, created_at)
  select (l->>'id')::uuid, p_project, l->>'dataset_slug', l->>'country', l->>'r2_key',
         coalesce(l->>'file_format', ''), l->>'label', coalesce(l->'style', '{}'::jsonb),
         coalesce((l->>'sort_order')::int, 0), nullif(l->>'added_by', '')::uuid,
         l->>'added_by_name', coalesce((l->>'created_at')::timestamptz, now())
    from jsonb_array_elements(coalesce(v_snap->'layers', '[]'::jsonb)) l;

  delete from workspace_bookmarks where project_id = p_project;
  insert into workspace_bookmarks (id, project_id, name, lng, lat, zoom, created_by, created_by_name, created_at)
  select (b->>'id')::uuid, p_project, b->>'name', (b->>'lng')::float8, (b->>'lat')::float8,
         (b->>'zoom')::float8, nullif(b->>'created_by', '')::uuid, b->>'created_by_name',
         coalesce((b->>'created_at')::timestamptz, now())
    from jsonb_array_elements(coalesce(v_snap->'bookmarks', '[]'::jsonb)) b;

  return workspace_commit(p_project, p_author, p_author_name, 'restore',
                          'Restored the project to r' || p_seq);
end;
$$;

revoke execute on function workspace_snapshot(uuid) from public, anon, authenticated;
revoke execute on function workspace_commit(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function workspace_restore(uuid, integer, uuid, text) from public, anon, authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['workspace_projects','workspace_layers','workspace_bookmarks',
                           'workspace_messages','workspace_revisions'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
