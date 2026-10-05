-- 048_invite_project.sql
--
-- An invite can carry a project: whoever accepts joins the team AND gets
-- this role on that project. Used by Admin -> Organizations ("invite to
-- this project"), so a person without an account yet lands in the right
-- project the moment they sign up through the emailed link.

alter table organization_invites
  add column if not exists project_id uuid references workspace_projects(id) on delete set null,
  add column if not exists project_role text;

alter table organization_invites drop constraint if exists organization_invites_project_role_check;
alter table organization_invites add constraint organization_invites_project_role_check
  check (project_role is null or project_role in ('viewer', 'editor', 'manager'));
