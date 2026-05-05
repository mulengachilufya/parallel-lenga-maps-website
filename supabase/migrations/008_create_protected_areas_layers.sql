-- 008_create_protected_areas_layers.sql
--
-- Per-country file metadata for the Protected Areas & Wildlife dataset
-- (WDPA — World Database on Protected Areas, UNEP-WCMC + IUCN). One row
-- per country ZIP shapefile. Source PDFs are not stored here — only the
-- cleaned, projected, country-clipped shapefile that we serve to users.
--
-- WDPA license: CC-BY 4.0 (citation required, link to www.protectedplanet.net).
-- The seeder writes that string into `source` so we never lose the
-- attribution metadata.

create table if not exists protected_areas_layers (
  id                   bigserial    primary key,
  country              varchar(255) not null,
  iso3                 varchar(3)   not null,
  feature_count        integer      not null,
  -- Total reported area in km². Sum of REP_AREA across all features for
  -- this country. WDPA's REP_AREA is what the country itself reports — it
  -- can occasionally drift from GIS-computed area, but it's the official
  -- number we surface to users.
  total_area_km2       numeric(14, 2) not null,
  -- Subset of total_area_km2 that's marine. WDPA's MARINE field: 0 = land,
  -- 1 = mixed, 2 = marine.
  marine_area_km2      numeric(14, 2),
  -- Short human-friendly summary like "23 National Parks · 12 Game Reserves
  -- · 4 Ramsar Sites" — generated from DESIG_ENG counts in the Python prep.
  designation_summary  text,
  source               varchar(500) not null,
  -- Which monthly WDPA snapshot this row was built from, e.g. "WDPA Mar 2025".
  -- Lets us migrate from one snapshot to another safely (write next snapshot
  -- to a different r2_key, swap rows when verified).
  source_version       varchar(50)  not null,
  r2_key               varchar(1024) unique not null,
  file_size_mb         numeric(10,2) not null,
  file_format          varchar(100) not null default 'Shapefile (ZIP)',
  epsg                 integer      not null default 4326,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

create index if not exists idx_pal_country on protected_areas_layers(country);
create index if not exists idx_pal_iso3    on protected_areas_layers(iso3);

alter table protected_areas_layers enable row level security;

-- Public read (the API layer gates the actual download URL behind a tier
-- check; metadata can be browsed anonymously).
create policy "Public can read protected areas layers"
  on protected_areas_layers for select
  to anon, authenticated
  using (true);
