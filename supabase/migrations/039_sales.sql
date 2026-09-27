-- 039_sales.sql
--
-- The enterprise sales pipeline behind /admin/sales: every organisation we
-- are going after, the people there, everything we have said to them, and
-- what to do next. From "on the radar" to a paying team that uses the
-- workspace.
--
--   sales_accounts    One organisation we are selling to, and where it is in
--                     the pipeline. stage_history records the first time it
--                     reached each stage, which is what the funnel counts.
--   sales_contacts    People at that organisation. optout_token backs the
--                     "no more emails" link in every outreach email.
--   sales_activities  The timeline: emails, LinkedIn messages, calls,
--                     meetings, notes, replies and stage changes.
--   sales_tasks       Next steps with a due date, including the steps an
--                     outreach sequence lays out.
--
-- Focus countries and the email signature live in ops_settings
-- ('sales_focus_countries', 'sales_signature') so they change without a
-- deploy.
--
-- Service role only (RLS on, no policies), like the rest of /admin.
-- Website quote requests are copied in as accounts (backfill at the end;
-- new ones are added by /api/quotes).
--
-- Applied to prod 2026-09-27 via Supabase MCP.

create table if not exists sales_accounts (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  country_iso3     text,
  sector           text,
  website          text,
  linkedin_url     text,
  size             text,
  source           text        not null default 'outbound'
                   check (source in ('outbound','website_form','referral','event','partner','other')),
  stage            text        not null default 'target'
                   check (stage in ('target','contacted','replied','meeting','pilot','proposal','won','acquired','lost','nurture')),
  priority         smallint    not null default 2 check (priority between 1 and 3),
  seats_estimate   integer,
  value_usd        numeric(10,2),          -- expected price per 3-month period
  discovery        jsonb       not null default '{}'::jsonb,
  next_step        text,
  next_step_due    date,
  lost_reason      text,
  nurture_until    date,
  notes            text,
  org_id           uuid        references organizations(id) on delete set null,
  quote_request_id uuid        references quote_requests(id) on delete set null,
  stage_history    jsonb       not null default '{}'::jsonb,
  stage_changed_at timestamptz not null default now(),
  last_touch_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists sales_accounts_stage_idx   on sales_accounts (stage);
create index if not exists sales_accounts_country_idx on sales_accounts (country_iso3);
create unique index if not exists sales_accounts_quote_uidx on sales_accounts (quote_request_id) where quote_request_id is not null;

create table if not exists sales_contacts (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references sales_accounts(id) on delete cascade,
  name          text        not null,
  title         text,
  email         text,
  phone         text,
  linkedin_url  text,
  is_primary    boolean     not null default false,
  notes         text,
  opted_out_at  timestamptz,
  optout_token  uuid        not null default gen_random_uuid(),
  created_at    timestamptz not null default now()
);
create index if not exists sales_contacts_account_idx on sales_contacts (account_id);
create unique index if not exists sales_contacts_token_uidx on sales_contacts (optout_token);

create table if not exists sales_activities (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references sales_accounts(id) on delete cascade,
  contact_id  uuid        references sales_contacts(id) on delete set null,
  kind        text        not null
              check (kind in ('email','linkedin','call','meeting','note','reply','stage','task','system')),
  direction   text        check (direction in ('out','in')),
  subject     text,
  body        text,
  meta        jsonb       not null default '{}'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists sales_activities_account_idx on sales_activities (account_id, created_at desc);

create table if not exists sales_tasks (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references sales_accounts(id) on delete cascade,
  contact_id  uuid        references sales_contacts(id) on delete set null,
  kind        text        not null default 'other'
              check (kind in ('email','linkedin','call','meeting','other')),
  title       text        not null,
  template    text,                        -- outreach template to open with
  due_on      date        not null,
  sequence    boolean     not null default false,
  done_at     timestamptz,
  outcome     text        check (outcome in ('done','skipped')),
  created_at  timestamptz not null default now()
);
create index if not exists sales_tasks_open_idx on sales_tasks (due_on) where done_at is null;
create index if not exists sales_tasks_account_idx on sales_tasks (account_id);

alter table sales_accounts   enable row level security;
alter table sales_contacts   enable row level security;
alter table sales_activities enable row level security;
alter table sales_tasks      enable row level security;

-- Backfill: every website quote request becomes an account that has already
-- replied (they came to us), with its contact and the request as the first
-- entry on the timeline.
with q as (
  select * from quote_requests
  where id not in (select quote_request_id from sales_accounts where quote_request_id is not null)
), a as (
  insert into sales_accounts (name, sector, source, stage, seats_estimate, notes, quote_request_id,
                              stage_history, stage_changed_at, last_touch_at, created_at)
  select q.org_name, case q.sector when 'gov' then 'government' else q.sector end, 'website_form',
         case q.status when 'won' then 'won' when 'lost' then 'lost' when 'quoted' then 'proposal' else 'replied' end,
         q.seats,
         nullif(concat_ws(E'\n', nullif('Region: ' || q.region, 'Region: '), nullif('Datasets: ' || q.datasets_interest, 'Datasets: ')), ''),
         q.id,
         jsonb_build_object('replied', q.created_at),
         q.updated_at, q.created_at, q.created_at
  from q
  returning id, quote_request_id
), c as (
  insert into sales_contacts (account_id, name, email, is_primary)
  select a.id, coalesce(nullif(q.contact_name, ''), split_part(q.email, '@', 1)), q.email, true
  from a join quote_requests q on q.id = a.quote_request_id
  returning id, account_id
), act as (
  insert into sales_activities (account_id, contact_id, kind, direction, subject, body, created_by, created_at)
  select a.id, c.id, 'reply', 'in', 'Quote request from the website', q.notes, 'website', q.created_at
  from a join c on c.account_id = a.id join quote_requests q on q.id = a.quote_request_id
  returning account_id, contact_id
)
-- Requests nobody has answered yet start with a reply due today.
insert into sales_tasks (account_id, contact_id, kind, template, title, due_on)
select act.account_id, act.contact_id, 'email', 'meeting', 'Reply to the quote request and book a call', current_date
from act join a on a.id = act.account_id join quote_requests q on q.id = a.quote_request_id
where q.status in ('new', 'contacted');
