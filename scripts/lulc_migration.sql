-- ═══════════════════════════════════════════════════════════════════════════
-- Africa LULC Dataset — Supabase migration
-- ═══════════════════════════════════════════════════════════════════════════
-- Creates the lulc_layers table for the ESA WorldCover 2021 (v200) pipeline.
-- Source: ESA WorldCover 2021 v200 — 10m resolution, 54 African countries.
--
-- Run BEFORE the first pipeline execution:
--   psql "$SUPABASE_DB_URL" -f scripts/lulc_migration.sql
-- Or paste into the Supabase SQL editor (Dashboard → SQL Editor).

create table if not exists public.lulc_layers (
  id            bigserial     primary key,
  country       text          not null,
  layer_type    text          not null default 'lulc',
  r2_key        text          not null unique,
  file_size_mb  numeric(10,4) not null,
  file_format   text          not null default 'GeoTIFF',
  source        text          not null,
  resolution    text          not null default '10m',
  epsg          integer       not null default 4326,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create index if not exists lulc_layers_country_idx
  on public.lulc_layers (country);

create index if not exists lulc_layers_layer_type_idx
  on public.lulc_layers (layer_type);

-- Auto-update updated_at on every write (reuses the function from aquifer_migration)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists lulc_layers_set_updated_at on public.lulc_layers;
create trigger lulc_layers_set_updated_at
  before update on public.lulc_layers
  for each row execute function public.set_updated_at();

-- RLS: anon read (public dataset browser), service_role write (pipeline)
alter table public.lulc_layers enable row level security;

drop policy if exists "lulc_layers read" on public.lulc_layers;
create policy "lulc_layers read"
  on public.lulc_layers for select
  using (true);

drop policy if exists "lulc_layers service write" on public.lulc_layers;
create policy "lulc_layers service write"
  on public.lulc_layers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
