-- 053_admin_staff.sql
--
-- Staff: people who get parts of /admin without being owners. The owners
-- (src/lib/admin.ts) add, change and remove them at /admin/team, so no code
-- change is needed to give or take away access.
--
-- areas: which parts of /admin they can open. See src/lib/staff.ts.
-- Only the service role reads or writes this table.

create table if not exists admin_staff (
  email      text        primary key check (email = lower(email)),
  name       text,
  title      text,
  areas      text[]      not null default '{}',
  added_by   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table admin_staff enable row level security;

insert into admin_staff (email, name, title, areas, added_by)
values ('wizambulo@gmail.com', 'Wiza Mbulo', 'Chief Commercial Officer and Chief Partnerships Officer',
        array['sales', 'partners', 'payments'], 'cmulenga672@gmail.com')
on conflict (email) do nothing;

-- People can turn an invitation down.
alter table organization_invites drop constraint if exists organization_invites_status_check;
alter table organization_invites add constraint organization_invites_status_check
  check (status in ('pending', 'accepted', 'revoked', 'declined'));
