-- 011_create_soil_layers.sql
--
-- Per-country WRB soil classification rasters from SoilGrids 250m (ISRIC).
-- Each row points to a GeoTIFF in R2 containing the most-probable WRB
-- (World Reference Base) soil class at 250m resolution, clipped to that
-- country's boundaries.
--
-- Source: ISRIC SoilGrids v2.0
-- License: CC BY 4.0
-- Cite: Poggio et al. (2021). SoilGrids 2.0 ... doi:10.5194/soil-7-217-2021
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists soil_layers (
  id             bigserial    primary key,
  country        varchar(255) not null,
  iso3           varchar(3)   not null,
  source         varchar(500) not null,
  source_version varchar(50),
  resolution_m   integer      not null default 250,
  r2_key         varchar(1024) unique not null,
  file_size_mb   numeric(10, 2) not null,
  file_format    varchar(100) not null default 'GeoTIFF',
  epsg           integer      not null default 4326,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists idx_sl_country on soil_layers(country);
create index if not exists idx_sl_iso3    on soil_layers(iso3);

alter table soil_layers enable row level security;

create policy "Public can read soil layers"
  on soil_layers for select
  to anon, authenticated
  using (true);
