-- 032_workspace_uploads.sql
--
-- Private storage for files teams upload into workspace projects (their own
-- shapefiles, GeoPackages, GeoTIFFs, KML, QGIS project data).
--
-- Path convention: <org_id>/<project_id>/<random>-<filename>
-- Members can write and read only under their own org's folder; the API
-- route that registers an upload as a layer re-checks org + project.
--
-- Applied to prod 2026-09-26 via Supabase MCP.

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-uploads', 'workspace-uploads', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists ws_uploads_insert on storage.objects;
create policy ws_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-uploads'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

drop policy if exists ws_uploads_read on storage.objects;
create policy ws_uploads_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-uploads'
    and (storage.foldername(name))[1] = current_org_id()::text
  );
