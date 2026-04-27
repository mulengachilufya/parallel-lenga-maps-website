-- Run this in Supabase Dashboard → SQL Editor → New query
-- Creates the population_settlements_layers table for per-country
-- Population & Settlements file metadata (built from HDX COD-PS + COD-AB).

create table if not exists population_settlements_layers (
  id                bigserial    primary key,
  country           varchar(255) not null,
  iso3              varchar(3)   not null,
  admin_level       varchar(10)  not null check (admin_level in ('ADM1', 'ADM2')),
  ref_year          integer      not null,
  total_population  bigint       not null,
  feature_count     integer      not null,
  r2_key            varchar(1024) unique not null,
  file_size_mb      numeric(10,2) not null,
  file_format       varchar(100) not null default 'Shapefile (ZIP)',
  source            varchar(500) not null,
  hdx_url           varchar(1024),
  epsg              integer      not null default 4326,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

-- Fast lookups by country and ISO-3
create index if not exists idx_psl_country on population_settlements_layers(country);
create index if not exists idx_psl_iso3    on population_settlements_layers(iso3);

-- Public read (API route uses service role which bypasses RLS anyway,
-- but enable RLS for defence-in-depth).
alter table population_settlements_layers enable row level security;

create policy "Public can read population settlements layers"
  on population_settlements_layers for select
  to anon, authenticated
  using (true);
