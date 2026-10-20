-- 055_soil_fertility_layers.sql
--
-- Per-country files of the "Topsoil Fertility by District (iSDAsoil 30 m)"
-- dataset (slug soil-fertility). One row per country GeoPackage: one
-- polygon per district (geoBoundaries ADM2) with pH, organic carbon, N, P,
-- K, texture, CEC and bulk density. Not the same as soil_layers (WRB soil
-- classes), which is unchanged. Built by
-- scripts/district_stats/soil_fertility.py, seeded by
-- scripts/seed-district-stats.mjs.
--
-- New table only; no existing table is changed.
-- Source licence: iSDAsoil Africa 30 m v1, CC BY 4.0.

create table if not exists soil_fertility_layers (
  id                bigserial     primary key,
  country           varchar(255)  not null,
  iso3              varchar(3)    not null unique,
  district_count    integer       not null,
  admin_level       smallint      not null default 2,
  -- Median over districts of the share of each district with iSDAsoil values.
  valid_pct_median  numeric(5,2),
  source            varchar(500)  not null,
  source_version    varchar(100)  not null,
  license           varchar(100)  not null default 'CC BY 4.0',
  boundary_license  varchar(255),
  r2_key            varchar(1024) unique not null,
  file_size_mb      numeric(10,2) not null,
  file_format       varchar(100)  not null default 'GeoPackage',
  epsg              integer       not null default 4326,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_sfl_country on soil_fertility_layers(country);

alter table soil_fertility_layers enable row level security;

create policy "Public can read soil fertility layers"
  on soil_fertility_layers for select
  to anon, authenticated
  using (true);
