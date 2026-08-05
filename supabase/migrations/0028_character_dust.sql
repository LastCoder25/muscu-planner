-- 0028_character_dust.sql — RPG : Poussière d'évolution (ressource d'amélioration
-- d'équipement, distincte de l'or). Gagnée en cassant des objets + un peu par run.
alter table public.characters add column if not exists dust integer not null default 0;
