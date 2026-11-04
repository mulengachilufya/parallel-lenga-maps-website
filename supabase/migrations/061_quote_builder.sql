-- 061_quote_builder.sql
--
-- The team quote form becomes a quote BUILDER (src/components/TeamQuoteBuilder.tsx):
-- seats, extras (on-site support, custom data, API), preferred term, a
-- WhatsApp number (optional) and a "please call me" flag.
--
-- All new columns are optional, so every existing row and the
-- /request-data form keep working unchanged.
--
-- RUN ONCE in: Supabase Dashboard -> SQL Editor (or supabase db push).
-- Run it BEFORE deploying the code.

alter table quote_requests add column if not exists whatsapp        text;
alter table quote_requests add column if not exists onsite_support  boolean not null default false;
alter table quote_requests add column if not exists custom_data     boolean not null default false;
alter table quote_requests add column if not exists api_access      boolean not null default false;
alter table quote_requests add column if not exists term            text
  check (term is null or term in ('month', 'quarter', 'year'));
alter table quote_requests add column if not exists wants_call      boolean not null default false;
