-- 057_sales_outcome.sql
--
-- The pipeline ends at Sent. After that, the founder or staff simply tick
-- how it turned out: won, lost, or no response. Kept apart from `stage` so
-- ticking it starts no tasks and changes no lists. Null: not ticked yet.

alter table sales_accounts add column if not exists outcome    text check (outcome in ('won', 'lost', 'no_response'));
alter table sales_accounts add column if not exists outcome_at timestamptz;
alter table sales_accounts add column if not exists outcome_by text;
