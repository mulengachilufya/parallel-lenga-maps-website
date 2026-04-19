-- Run this in Supabase Dashboard → SQL Editor → New query
-- Creates the hydrology_layers table for river (and future lake) file metadata

create table if not exists hydrology_layers (
  id            bigserial primary key,
  country       text        not null,
  layer_type    text        not null check (layer_type in ('rivers', 'lakes')),
  r2_key        text        not null unique,
  file_size_mb  numeric(10, 2) not null default 0,
  file_format   text        not null default 'ZIP (Shapefile)',
  source        text        not null default 'HydroSHEDS / FAO',
  created_at    timestamptz not null default now()
);

-- Fast lookups by country and layer type
create index if not exists hydrology_layers_country_idx    on hydrology_layers(country);
create index if not exists hydrology_layers_layer_type_idx on hydrology_layers(layer_type);

-- Public read (API route uses service role which bypasses RLS anyway)
alter table hydrology_layers enable row level security;

create policy "Public can read hydrology layers"
  on hydrology_layers for select
  to anon, authenticated
  using (true);
