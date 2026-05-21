-- 010_create_road_layers.sql
--
-- Per-country road file metadata.
-- Source: Natural Earth 1:10m Roads (Public Domain) — significant roads only.
-- Each row points to a GeoPackage in R2 containing all roads in that country
-- with their original Natural Earth attribute table embedded.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists road_layers (
  id             bigserial    primary key,
  country        varchar(255) not null,
  iso3           varchar(3)   not null,
  feature_count  integer      not null default 0,
  total_km       numeric(10, 1) not null default 0,
  source         varchar(500) not null,
  source_version varchar(50),
  r2_key         varchar(1024) unique not null,
  file_size_mb   numeric(10, 2) not null,
  file_format    varchar(100) not null default 'GeoPackage',
  epsg           integer      not null default 4326,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists idx_rl_country on road_layers(country);
create index if not exists idx_rl_iso3    on road_layers(iso3);

alter table road_layers enable row level security;

create policy "Public can read road layers"
  on road_layers for select
  to anon, authenticated
  using (true);
