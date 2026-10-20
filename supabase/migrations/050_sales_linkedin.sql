-- 050_sales_linkedin.sql
--
-- The LinkedIn track of /admin/sales (LinkedIn tab), run alongside email:
-- connect, thank them once they accept, comment on two of their posts,
-- then three days after the thank-you a message about Lenga Maps with
-- pricing and an ask for a 10 minute video call.
--
-- One row per contact. Each step is a timestamp, set when the founder marks
-- it done in the admin panel; the current step is worked out from which are
-- set (src/lib/sales/linkedin.ts). Nothing here sends anything: every
-- message is copied and sent by hand on LinkedIn.
--
-- Service role only (RLS on, no policies), like the rest of /admin.

create table if not exists sales_linkedin (
  contact_id    uuid        primary key references sales_contacts(id) on delete cascade,
  account_id    uuid        not null references sales_accounts(id) on delete cascade,
  hook          text,                     -- what we noticed about them, finishes "I came across ..."
  messages      jsonb       not null default '{}'::jsonb,   -- edited text per step: { connect?, thank?, pitch? }
  requested_at  timestamptz,              -- connection request sent
  connected_at  timestamptz,              -- they accepted
  thanked_at    timestamptz,              -- thank-you message sent
  comment1_at   timestamptz,              -- first comment on one of their posts
  comment2_at   timestamptz,              -- second comment
  pitched_at    timestamptz,              -- the Lenga Maps message, 3 days after the thank-you
  replied_at    timestamptz,
  meeting_at    timestamptz,              -- video call booked
  closed_at     timestamptz,
  closed_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sales_linkedin_account_idx on sales_linkedin (account_id);

alter table sales_linkedin enable row level security;

-- The email sequence used to carry its own LinkedIn to-dos ("Connect on
-- LinkedIn", "Send a LinkedIn message"). The LinkedIn tab runs that now, so
-- the open ones would only be duplicates.
update sales_tasks set done_at = now(), outcome = 'skipped'
 where kind = 'linkedin' and sequence = true and done_at is null;
