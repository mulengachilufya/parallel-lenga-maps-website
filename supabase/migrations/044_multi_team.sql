-- 044_multi_team.sql
--
-- One person, many teams. Until now organization_members.user_id was
-- UNIQUE (one org per user). People can now create and join as many teams
-- as they like (free teams always; paid teams only when an admin provisions
-- or approves them).
--
--   * profiles.org_id stays, and now means "the team I have open": the app
--     reads the active membership from it (src/lib/teams.ts getMembership),
--     and POST /api/team/switch changes it. Joining or creating a team opens
--     it; leaving the open team falls back to another team you are on.
--   * RLS no longer asks "is this MY org" (current_org_id(), a single value)
--     but "am I a member of this org" (is_org_member()), so every team you
--     are on stays readable, including its workspace uploads.
--   * current_org_id() is kept (returns the open team) for anything else.
--
-- Applied to prod 2026-09-29 via Supabase MCP.

-- 1. Allow several memberships per user. (The primary key (org_id, user_id)
--    still stops joining the same team twice.)
alter table organization_members drop constraint if exists organization_members_user_id_key;

-- 2. Membership test that RLS can use without recursing into
--    organization_members' own policy (security definer). Takes text so a
--    malformed storage path can never raise a cast error.
create or replace function public.is_org_member(p_org text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where org_id::text = p_org and user_id = auth.uid()
  )
$$;
-- Callable by every role (the read policies apply to all roles, like the
-- old current_org_id()); it only ever answers about the caller.
grant execute on function public.is_org_member(text) to anon, authenticated, service_role;

-- 2b. Is this project in this org? (Uploads must sit under the project's own
--     team folder, as they did when current_org_id() pinned one team.)
create or replace function public.ws_project_in_org(p_project text, p_org text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from workspace_projects where id::text = p_project and org_id::text = p_org)
$$;
revoke all on function public.ws_project_in_org(text, text) from public;
grant execute on function public.ws_project_in_org(text, text) to authenticated, service_role;

-- 3. The open team: profiles.org_id when it is still a membership, else the
--    earliest team joined.
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.org_id from profiles p
      where p.id = auth.uid()
        and exists (select 1 from organization_members m where m.org_id = p.org_id and m.user_id = auth.uid())),
    (select m.org_id from organization_members m where m.user_id = auth.uid()
      order by m.joined_at nulls last, m.invited_at limit 1)
  )
$$;

-- 4. Keep profiles.org_id pointing at a team the person is on.
create or replace function public.sync_profile_org()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update profiles set org_id = new.org_id where id = new.user_id;   -- open the team just joined
    return new;
  elsif tg_op = 'DELETE' then
    update profiles p set org_id = (
      select m.org_id from organization_members m where m.user_id = old.user_id
      order by m.joined_at nulls last, m.invited_at limit 1
    )
    where p.id = old.user_id and (p.org_id = old.org_id or p.org_id is null);
    return old;
  end if;
  return null;
end $$;

-- 5. Policies: membership instead of "the one org".
drop policy if exists org_member_read on organizations;
create policy org_member_read on organizations for select using (public.is_org_member(id::text));

drop policy if exists org_members_read on organization_members;
create policy org_members_read on organization_members for select using (public.is_org_member(org_id::text));

drop policy if exists org_invites_read on organization_invites;
create policy org_invites_read on organization_invites for select using (public.is_org_member(org_id::text));

drop policy if exists download_events_read on download_events;
create policy download_events_read on download_events for select
  using (user_id = auth.uid() or (org_id is not null and public.is_org_member(org_id::text)));

drop policy if exists ws_uploads_insert on storage.objects;
create policy ws_uploads_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'workspace-uploads'
  and public.is_org_member((storage.foldername(name))[1])
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and public.ws_project_in_org((storage.foldername(name))[2], (storage.foldername(name))[1])
  and public.workspace_project_role(((storage.foldername(name))[2])::uuid) = any (array['editor', 'manager'])
);

drop policy if exists ws_uploads_read on storage.objects;
create policy ws_uploads_read on storage.objects for select to authenticated using (
  bucket_id = 'workspace-uploads'
  and public.is_org_member((storage.foldername(name))[1])
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and public.ws_project_in_org((storage.foldername(name))[2], (storage.foldername(name))[1])
  and public.workspace_project_role(((storage.foldername(name))[2])::uuid) is not null
);
