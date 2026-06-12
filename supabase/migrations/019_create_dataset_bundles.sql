-- 019_create_dataset_bundles.sql
--
-- Whole-of-Africa "continental bundle" downloads.
--
-- Each row points to ONE pre-built combined file in R2 that merges every
-- country in a dataset into a single download — a GeoPackage for vector
-- datasets (all 54 countries in one layer, attribute tables embedded) and,
-- in a later phase, a Cloud-Optimized GeoTIFF for the coarse climate rasters.
--
-- This table is the source of truth the bundle endpoints read: if a dataset
-- has a row here, GET /api/datasets/:id/bundle hands back a presigned URL to
-- r2_key; if not, it answers "bundle_not_ready".
--
-- The combined files are built offline by scripts/combine-vector.py and
-- registered by scripts/seed-bundles.mjs — the same prepare-*.py -> seed-*.mjs
-- pattern used for every other dataset.
--
-- Access is gated in the API (Max / Enterprise only), NOT here. RLS is enabled
-- with no policy on purpose: the anon / authenticated Supabase clients can't
-- read r2_keys directly — only the service-role server (getDatasetBundle) can,
-- because the service role bypasses RLS.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists dataset_bundles (
  dataset_id    text          primary key,   -- matches DATASETS[].id, e.g. 'roads'
  r2_key        text          not null,      -- e.g. 'bundles/roads_africa.gpkg'
  file_format   text          not null,      -- 'GeoPackage' | 'GeoTIFF (COG)'
  file_size_mb  numeric(12,2) not null default 0,
  bytes         bigint        not null default 0,
  file_count    integer       not null default 0,   -- # countries merged
  feature_count bigint,                              -- total vector features
  layers        jsonb,                               -- [{name, geometry, features}]
  built_at      timestamptz   not null default now(),
  notes         text
);

alter table dataset_bundles enable row level security;
-- No SELECT policy by design — keeps presigned-source r2_keys server-only.
