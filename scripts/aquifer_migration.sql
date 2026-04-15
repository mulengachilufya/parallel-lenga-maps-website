-- ═══════════════════════════════════════════════════════════════════════════
-- Africa Aquifer Dataset — Supabase migration
-- ═══════════════════════════════════════════════════════════════════════════
-- Creates the aquifer_layers table for the Africa Aquifer Dataset pipeline.
-- Harmonised multi-source product: WHYMAP/BGR-UNESCO + IGRAC GGIS.
--
-- Run in Supabase SQL editor, or via:
--   psql "$SUPABASE_DB_URL" -f scripts/aquifer_migration.sql

create table if not exists public.aquifer_layers (
  id               bigserial primary key,
  country          text        not null,
  layer_type       text        not null default 'aquifer',
  r2_key           text        not null unique,
  file_size_mb     numeric(10,4) not null,
  file_format      text        not null default 'GeoPackage',
  source           text        not null,
  feature_count    integer     not null default 0,
  conflict_count   integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists aquifer_layers_country_idx
  on public.aquifer_layers (country);

create index if not exists aquifer_layers_layer_type_idx
  on public.aquifer_layers (layer_type);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists aquifer_layers_set_updated_at on public.aquifer_layers;
create trigger aquifer_layers_set_updated_at
  before update on public.aquifer_layers
  for each row execute function public.set_updated_at();

-- RLS: allow anon read, service role write (matches other dataset tables)
alter table public.aquifer_layers enable row level security;

drop policy if exists "aquifer_layers read" on public.aquifer_layers;
create policy "aquifer_layers read"
  on public.aquifer_layers for select
  using (true);

drop policy if exists "aquifer_layers service write" on public.aquifer_layers;
create policy "aquifer_layers service write"
  on public.aquifer_layers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
