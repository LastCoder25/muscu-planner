-- 0034 — Consommables achetés en boutique (or). Compteur par id de consommable,
-- dépensé au lancement d'un donjon. Additif, RLS inchangée.
alter table characters
  add column if not exists consumables jsonb not null default '{}'::jsonb;
