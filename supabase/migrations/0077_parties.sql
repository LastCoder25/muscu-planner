-- 0077_parties.sql — CAMPS DE FACTION : groupes partis SANS le héros vers un camp.
-- Additive : null = aucun groupe en route (tous les comptes d'avant). Un groupe AVEC le héros
-- vit dans `expedition`, comme toute expédition héros.
alter table public.characters add column if not exists parties jsonb;
