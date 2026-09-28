-- 043: let a project manager remove a teammate from one project entirely.
--
-- A 'none' row in workspace_project_members means "no access to this
-- project", even when the project is visible to the whole team. Removing
-- the row puts the person back on the project's default.

alter table workspace_project_members drop constraint if exists workspace_project_members_role_check;
alter table workspace_project_members
  add constraint workspace_project_members_role_check check (role in ('none', 'viewer', 'editor', 'manager'));

create or replace function public.workspace_project_role(p_project uuid, p_user uuid default auth.uid())
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when m.user_id is null then null
    when m.role = 'owner' then 'manager'
    when p.created_by = p_user then 'manager'
    else nullif(coalesce(pm.role, case when p.visibility = 'team' then p.default_role end), 'none')
  end
  from workspace_projects p
  left join organization_members m on m.org_id = p.org_id and m.user_id = p_user
  left join workspace_project_members pm on pm.project_id = p.id and pm.user_id = p_user
  where p.id = p_project
$$;
revoke all on function public.workspace_project_role(uuid, uuid) from public, anon;
grant execute on function public.workspace_project_role(uuid, uuid) to authenticated;
