-- 0025_character_combat.sql — RPG Phase 2a : or + énergie dépensée sur le perso.
-- Énergie disponible (client) = minutes de sport de fond − energy_spent.
alter table public.characters add column if not exists gold integer not null default 0;
alter table public.characters add column if not exists energy_spent integer not null default 0;
