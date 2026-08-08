-- 0036_character_reward_level.sql — RPG : dernier niveau global déjà récompensé.
-- Sert à verser un bonus d'énergie (croissant) à chaque passage de niveau, une
-- seule fois. 0 = jamais initialisé → le 1er passage cale la base sans bonus
-- rétroactif (évite un flot de bonus pour les niveaux déjà acquis).
alter table public.characters
  add column if not exists reward_level int not null default 0;
