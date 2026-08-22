-- 0055 — Spécialisation du perso : la « Voie » (archétype) choisie par le joueur.
-- Biaise les drops génériques + petit passif. Réversible. NULL = aucune voie.
alter table public.characters add column if not exists voie text;
