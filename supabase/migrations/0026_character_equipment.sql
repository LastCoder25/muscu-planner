-- 0026_character_equipment.sql — RPG Phase 2c : équipement du perso.
-- equipped = { weapon?, armor?, accessory?, relic? } ; inventory = Item[].
-- Stocké en JSONB sur le perso (petit volume, mono-utilisateur).
alter table public.characters add column if not exists equipped jsonb not null default '{}'::jsonb;
alter table public.characters add column if not exists inventory jsonb not null default '[]'::jsonb;
