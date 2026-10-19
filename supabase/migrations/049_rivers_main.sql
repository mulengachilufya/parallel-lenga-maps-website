-- 049_rivers_main.sql
--
-- "Main rivers": a lighter copy of each country's HydroRIVERS file that
-- keeps only Strahler order 4 and up (the named rivers and their large
-- tributaries). Built from the full file by Admin -> Ops -> "Build main
-- rivers" (src/app/api/admin/datasets/rivers-main). Stored as its own
-- layer_type so every existing 'rivers' query is unchanged.

alter table hydrology_layers drop constraint if exists hydrology_layers_layer_type_check;
alter table hydrology_layers add constraint hydrology_layers_layer_type_check
  check (layer_type = any (array['rivers', 'rivers_main', 'lakes', 'watersheds']));
