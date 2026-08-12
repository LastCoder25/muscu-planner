-- 0045 — Familiers (compagnons de l'Aventure).
--
-- Un familier est un Item de slot 'familiar' rangé dans le JSONB `equipped`/`inventory`
-- existant (aucune colonne d'objet à créer). On ajoute seulement la ressource
-- PIERRES MAGIQUES 💎 (`stones`), dépensée pour monter le niveau des familiers,
-- droppée dans les mêmes lieux que les familiers (Labyrinthe + un peu partout).

alter table characters
  add column if not exists stones integer not null default 0;

comment on column characters.stones is
  'Pierres magiques 💎 : ressource de progression des familiers (montée de niveau).';
