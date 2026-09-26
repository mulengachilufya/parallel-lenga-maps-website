-- 037_project_roles.sql
--
-- Per-project roles, separate from the organization role.
--
--   Organization role (organization_members.role) = what you can do to the
--   company account: billing, seats, invites. Project role = what you can do
--   inside one GIS project:
--
--     viewer   see the map, layers, history; comment and leave voice notes.
--              No changes, no exports.
--     editor   + add/remove/restyle layers, saved views, restore revisions,
--              export (QGIS package, attribute-table downloads).
--     manager  + project settings (name, description, project view),
--              members and visibility, archive.
--
--   Resolution (workspace_project_role): org owner → manager; the project's
--   creator → manager; an explicit workspace_project_members row → that
--   role; otherwise, on a 'team' project, default_role; on a 'private'
--   project, no access at all (not even to see that it exists).
--
--   Every read policy on workspace tables, Realtime included, now goes
--   through this function, so a private project is invisible to teammates
--   who aren't on it. Writes remain API-only (service role).
--
-- Applied to prod 2026-09-26 via Supabase MCP.

alter table workspace_projects
  add column if not exists visibility   text not null default 'team' check (visibility in ('team', 'private')),
  add column if not exists default_role text not null default 'editor' check (default_role in ('viewer', 'editor'));

create table if not exists workspace_project_members (
  project_id uuid not null references workspace_projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('viewer', 'editor', 'manager')),
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table workspace_project_members enable row level security;

create or replace function public.workspace_project_role(p_project uuid, p_user uuid default auth.uid())
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when m.user_id is null then null
    when m.role = 'owner' then 'manager'
    when p.created_by = p_user then 'manager'
    else coalesce(pm.role, case when p.visibility = 'team' then p.default_role end)
  end
  from workspace_projects p
  left join organization_members m on m.org_id = p.org_id and m.user_id = p_user
  left join workspace_project_members pm on pm.project_id = p.id and pm.user_id = p_user
  where p.id = p_project
$$;
revoke all on function public.workspace_project_role(uuid, uuid) from public, anon;
grant execute on function public.workspace_project_role(uuid, uuid) to authenticated;

drop policy if exists ws_projects_read on workspace_projects;
create policy ws_projects_read on workspace_projects
  for select to authenticated using (workspace_project_role(id) is not null);

drop policy if exists ws_layers_read on workspace_layers;
create policy ws_layers_read on workspace_layers
  for select to authenticated using (workspace_project_role(project_id) is not null);

drop policy if exists ws_bookmarks_read on workspace_bookmarks;
create policy ws_bookmarks_read on workspace_bookmarks
  for select to authenticated using (workspace_project_role(project_id) is not null);

drop policy if exists ws_messages_read on workspace_messages;
create policy ws_messages_read on workspace_messages
  for select to authenticated using (workspace_project_role(project_id) is not null);

drop policy if exists ws_revisions_read on workspace_revisions;
create policy ws_revisions_read on workspace_revisions
  for select to authenticated using (workspace_project_role(project_id) is not null);

drop policy if exists ws_project_members_read on workspace_project_members;
create policy ws_project_members_read on workspace_project_members
  for select to authenticated using (workspace_project_role(project_id) is not null);

-- Uploaded project files: <org>/<project>/<file>. Reading needs access to
-- that project; writing needs editor or manager on it.
drop policy if exists ws_uploads_insert on storage.objects;
create policy ws_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-uploads'
    and (storage.foldername(name))[1] = current_org_id()::text
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and workspace_project_role(((storage.foldername(name))[2])::uuid) in ('editor', 'manager')
  );

drop policy if exists ws_uploads_read on storage.objects;
create policy ws_uploads_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-uploads'
    and (storage.foldername(name))[1] = current_org_id()::text
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and workspace_project_role(((storage.foldername(name))[2])::uuid) is not null
  );
