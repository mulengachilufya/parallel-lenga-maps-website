-- 045_upload_bytes.sql
--
-- Team uploads move from Supabase Storage to Cloudflare R2
-- (key: workspace-uploads/<org_id>/<project_id>/<random>-<filename>).
-- The size of each uploaded file is kept on its layer so the API can hold
-- every project to its storage allowance (2 GB) without listing R2.
--
-- Applied to prod via Supabase MCP.

alter table workspace_layers add column if not exists file_bytes bigint;

-- History snapshots and restores carry the size too, so a restored upload
-- still counts toward the allowance (and a large raster still streams).
-- Older snapshots have no file_bytes and restore it as null, as before.

create or replace function public.workspace_snapshot(p_project uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
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
        'created_at', l.created_at, 'file_bytes', l.file_bytes
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
$function$;

create or replace function public.workspace_restore(p_project uuid, p_seq integer, p_author uuid, p_author_name text)
 returns workspace_revisions
 language plpgsql
 set search_path to 'public'
as $function$
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
                                label, style, sort_order, added_by, added_by_name, created_at, file_bytes)
  select (l->>'id')::uuid, p_project, l->>'dataset_slug', l->>'country', l->>'r2_key',
         coalesce(l->>'file_format', ''), l->>'label', coalesce(l->'style', '{}'::jsonb),
         coalesce((l->>'sort_order')::int, 0), nullif(l->>'added_by', '')::uuid,
         l->>'added_by_name', coalesce((l->>'created_at')::timestamptz, now()),
         (l->>'file_bytes')::bigint
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
$function$;
