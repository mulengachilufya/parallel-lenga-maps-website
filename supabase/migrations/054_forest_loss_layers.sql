-- 054_forest_loss_layers.sql
--
-- Per-country files of the "Forest Cover and Tree Cover Loss by District"
-- dataset (slug forest-loss, EUDR-ready). One row per country GeoPackage:
-- one polygon per district (geoBoundaries ADM2) with tree cover 2000,
-- yearly tree cover loss, loss since the EUDR cut-off (31 Dec 2020) and
-- JRC GFC2020 forest cover. Built by scripts/district_stats/forest_loss.py,
-- seeded by scripts/seed-district-stats.mjs.
--
-- New table only; no existing table is changed.
-- Source licences: Hansen/UMD GFC, CC BY 4.0; EC JRC GFC2020, CC BY 4.0.

create table if not exists forest_loss_layers (
  id                  bigserial     primary key,
  country             varchar(255)  not null,
  iso3                varchar(3)    not null unique,
  district_count      integer       not null,
  admin_level         smallint      not null default 2,
  -- National totals, hectares (sum of the districts).
  tc2000_ha           numeric(16,1),
  loss_total_ha       numeric(16,1),
  loss_since_2021_ha  numeric(16,1),
  -- Null when the JRC GFC2020 column was left out of the files.
  forest2020_ha       numeric(16,1),
  year_start          smallint,
  year_end            smallint,
  source              varchar(500)  not null,
  source_version      varchar(100)  not null,
  license             varchar(100)  not null default 'CC BY 4.0',
  boundary_license    varchar(255),
  r2_key              varchar(1024) unique not null,
  file_size_mb        numeric(10,2) not null,
  file_format         varchar(100)  not null default 'GeoPackage',
  epsg                integer       not null default 4326,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create index if not exists idx_fll_country on forest_loss_layers(country);

alter table forest_loss_layers enable row level security;

create policy "Public can read forest loss layers"
  on forest_loss_layers for select
  to anon, authenticated
  using (true);
