-- 009_hydrology_layers_add_watersheds.sql
--
-- The hydrology_layers table was created with a CHECK constraint that
-- only allowed layer_type IN ('rivers', 'lakes'). HydroBASINS watershed
-- data goes in the same table under layer_type = 'watersheds', so we
-- must widen the constraint.
--
-- Also adds a unique index on (country, layer_type) so per-country
-- watershed files can be upserted cleanly without creating duplicates
-- on re-runs.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor → New query → Run

-- 1. Drop the old check constraint (name may vary — try both common names)
alter table hydrology_layers
  drop constraint if exists hydrology_layers_layer_type_check;
alter table hydrology_layers
  drop constraint if exists hydrology_layers_layer_type_fkey;

-- 2. Add the wider constraint
alter table hydrology_layers
  add constraint hydrology_layers_layer_type_check
  check (layer_type in ('rivers', 'lakes', 'watersheds'));

-- 3. Unique index on (country, layer_type) — one file per country per type
-- This lets the API return exactly one row per country when filtering by
-- layer_type, and prevents duplicate uploads.
create unique index if not exists hydrology_layers_country_type_idx
  on hydrology_layers (country, layer_type);
