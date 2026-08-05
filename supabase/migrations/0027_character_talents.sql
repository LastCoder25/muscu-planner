-- 0027_character_talents.sql — RPG Phase 3 : talents du joueur (codes choisis).
-- 1 talent tous les 5 niveaux, cumulables. Ordre = ordre des choix.
alter table public.characters add column if not exists talents jsonb not null default '[]'::jsonb;
