-- 053_crop_production_layers.sql
--
-- Per-country files of the "Crop Production by District (MapSPAM 2020)"
-- dataset (slug crop-production). One row per country GeoPackage: one
-- polygon per district (geoBoundaries ADM2) with physical area, harvested
-- area, production and yield of 15 key crops, plus a crops_long table with
-- all 46 SPAM crops. Built by scripts/district_stats/crop_production.py,
-- seeded by scripts/seed-district-stats.mjs.
--
-- New table only; no existing table is changed.
-- Source licence: IFPRI SPAM 2020 v1.0, CC BY 4.0 (attribution required).

create table if not exists crop_production_layers (
  id                bigserial     primary key,
  country           varchar(255)  not null,
  iso3              varchar(3)    not null unique,
  district_count    integer       not null,
  -- 2 = districts (ADM2); 1 where geoBoundaries has no ADM2 (Libya, Mauritius).
  admin_level       smallint      not null default 2,
  -- Physical area of all 46 SPAM crops in the country, hectares.
  total_phys_ha     numeric(14,1),
  -- Crop with the largest physical area nationally.
  top_crop          varchar(100),
  source            varchar(500)  not null,
  source_version    varchar(100)  not null,
  license           varchar(100)  not null default 'CC BY 4.0',
  -- Licence of the country's geoBoundaries district file (varies by country).
  boundary_license  varchar(255),
  r2_key            varchar(1024) unique not null,
  file_size_mb      numeric(10,2) not null,
  file_format       varchar(100)  not null default 'GeoPackage',
  epsg              integer       not null default 4326,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_cpl_country on crop_production_layers(country);

alter table crop_production_layers enable row level security;

-- Public read (the API route gates the download URL behind the access
-- check; metadata can be browsed anonymously).
create policy "Public can read crop production layers"
  on crop_production_layers for select
  to anon, authenticated
  using (true);
