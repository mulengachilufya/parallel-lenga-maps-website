-- 054_catalog_files.sql
--
-- One table for the per-country files of datasets added from 2026-10 (crop
-- production, tree cover loss, soil nutrients, mining & geology, solar & wind,
-- WorldPop 2026). Older datasets keep their own tables. Rows are added only
-- once the file is in R2, so every row is downloadable.
--
--   slug       dataset slug (src/lib/pricing.ts DatasetSlug)
--   label      what the file is, e.g. 'Global horizontal irradiation (GeoTIFF)'
--   r2_key     datasets/<iso3 lowercase>/<folder>/<file name>

create table if not exists catalog_files (
  id            bigserial primary key,
  slug          text        not null,
  iso3          text        not null,
  country       text        not null,
  label         text        not null,
  file_name     text        not null,
  r2_key        text        not null unique,
  file_format   text        not null,
  file_size_mb  numeric     not null,
  created_at    timestamptz not null default now()
);

create index if not exists catalog_files_slug_country on catalog_files (slug, country);

-- Read through the service role only (API routes presign the downloads).
alter table catalog_files enable row level security;
