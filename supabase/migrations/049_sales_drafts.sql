-- 049_sales_drafts.sql
--
-- Researched first emails waiting for the founder to read and send from
-- /admin/sales (Drafts tab). One row per person: the email itself, why this
-- organisation (the research behind it) and the sources it came from.
--
-- Nothing here sends anything. A draft only goes out when an admin presses
-- Send, through the same 1-to-1 path as /api/admin/sales/:id/email.
--
-- Service role only (RLS on, no policies), like the rest of /admin.

create table if not exists sales_drafts (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references sales_accounts(id) on delete cascade,
  contact_id  uuid        references sales_contacts(id) on delete set null,
  subject     text        not null,
  body        text        not null,
  research    text,                        -- why this organisation, in a few lines
  sources     jsonb       not null default '[]'::jsonb,   -- [{ label, url }]
  batch       text,                        -- e.g. 'ZAF 2026-10'
  status      text        not null default 'draft'
              check (status in ('draft','sent','discarded')),
  sent_at     timestamptz,
  sent_by     text,
  created_by  text        not null default 'research',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sales_drafts_status_idx  on sales_drafts (status, created_at);
create index if not exists sales_drafts_account_idx on sales_drafts (account_id);

alter table sales_drafts enable row level security;
