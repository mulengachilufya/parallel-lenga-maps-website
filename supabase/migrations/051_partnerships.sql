-- 051_partnerships.sql
--
-- The Partnerships pipeline of /admin/sales (Partnerships tab): partners
-- whose job is to get Lenga Maps used and paid for, not to buy seats
-- themselves. Each sits on one track by how the money reaches us
-- (src/lib/sales/partnerships.ts): marketplaces, built into their product,
-- joint bids, project partners, resellers and referrals.
--
-- A partner is still a sales_accounts row, so its people, timeline and the
-- LinkedIn track work as they do for customers; pipeline = 'partner' takes
-- it out of the sales lists. The partnership itself (track, stage, what
-- each side gives, the document, the next step) lives in sales_partnerships.
--
-- Service role only (RLS on, no policies), like the rest of /admin.

alter table sales_accounts add column if not exists pipeline text not null default 'sales';
do $$ begin
  alter table sales_accounts add constraint sales_accounts_pipeline_check check (pipeline in ('sales', 'partner'));
exception when duplicate_object then null; end $$;
create index if not exists sales_accounts_pipeline_idx on sales_accounts (pipeline);

create table if not exists sales_partnerships (
  account_id     uuid        primary key references sales_accounts(id) on delete cascade,
  track          text        not null check (track in ('marketplace', 'embedded', 'joint_bid', 'project', 'channel')),
  stage          text        not null default 'identified'
                 check (stage in ('identified', 'intro', 'meeting', 'proposal', 'terms', 'drafting', 'legal', 'signed', 'live', 'growing', 'paused', 'dropped')),
  stage_history  jsonb       not null default '{}'::jsonb,   -- { stage: first reached at }
  document       text        check (document in ('listing', 'licence', 'teaming', 'referral', 'reseller', 'pilot', 'loi', 'mou', 'nda', 'other')),
  we_give        text,                   -- what Lenga Maps brings
  we_get         text,                   -- what they bring
  revenue_model  text,                   -- how money reaches us, in a line
  est_annual_usd numeric,                -- rough yearly value once live
  next_step      text,
  next_step_due  date,
  dropped_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists sales_partnerships_track_idx on sales_partnerships (track, stage);

alter table sales_partnerships enable row level security;
