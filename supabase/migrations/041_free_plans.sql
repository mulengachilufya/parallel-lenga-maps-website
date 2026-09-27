-- 041_free_plans.sql
--
-- Free plans, for individuals and for teams.
--
--   Individual free   Any signed-in account. The person chooses 3 datasets
--                     (profiles.free_datasets); those 3 can be downloaded for
--                     every country, for good. The choice is locked until
--                     they pay: only the server (service role) writes it,
--                     and it refuses to change a choice once made.
--
--   Team free         A workspace for 2 people that anyone can create for
--                     themselves (organizations.plan = 'free', seat_count 2,
--                     no end date). The team owner chooses 3 datasets for
--                     the team (organizations.free_datasets), locked the
--                     same way. Members of a free team keep a free personal
--                     profile; paying turns the team into a normal paid one
--                     (plan = 'paid').
--
-- Also: the sales pipeline's manual "pilot" is replaced by the free team.
-- The stage becomes 'free' ("On the free plan").
--
-- Applied to prod 2026-09-27 via Supabase MCP.

alter table profiles      add column if not exists free_datasets text[];
alter table profiles      add column if not exists free_datasets_at timestamptz;

alter table organizations add column if not exists plan text not null default 'paid';
alter table organizations add column if not exists free_datasets text[];
alter table organizations add column if not exists free_datasets_at timestamptz;
do $$ begin
  alter table organizations add constraint organizations_plan_check check (plan in ('paid', 'free'));
exception when duplicate_object then null; end $$;

-- At most 3 picks, never more. (The picks themselves are validated in the
-- API against the live dataset list.)
do $$ begin
  alter table profiles add constraint profiles_free_datasets_max check (free_datasets is null or cardinality(free_datasets) <= 3);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table organizations add constraint organizations_free_datasets_max check (free_datasets is null or cardinality(free_datasets) <= 3);
exception when duplicate_object then null; end $$;

-- A free team never has more than 2 seats.
do $$ begin
  alter table organizations add constraint organizations_free_seats check (plan <> 'free' or seat_count <= 2);
exception when duplicate_object then null; end $$;

-- Sales: pilot → free.
update sales_accounts set stage = 'free' where stage = 'pilot';
update sales_accounts set stage_history = (stage_history - 'pilot') || jsonb_build_object('free', stage_history -> 'pilot')
  where stage_history ? 'pilot';
alter table sales_accounts drop constraint if exists sales_accounts_stage_check;
alter table sales_accounts add constraint sales_accounts_stage_check
  check (stage in ('target','contacted','replied','meeting','free','proposal','won','acquired','lost','nurture'));
