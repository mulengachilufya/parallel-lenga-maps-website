-- 046_download_source.sql
--
-- download_events now covers every way a file leaves Lenga, not only the
-- per-country button on the website:
--   website     per-country download from the site (consume-download)
--   bundle      whole-of-Africa file from the dashboard
--   api         per-country file through the API (bearer key)
--   api_bundle  whole-dataset manifest through the API
-- bytes is the size handed out, when known, so the admin page can show
-- volume as well as counts.
--
-- Applied to prod via Supabase MCP.

alter table download_events add column if not exists source text not null default 'website';
alter table download_events add column if not exists bytes bigint;

create index if not exists download_events_created_idx on download_events (created_at desc);
