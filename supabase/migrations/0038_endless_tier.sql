-- 0038 — Faille sans fin : mémorise le palier de profondeur max atteint.
-- Contenu end-game infini débloqué après le dernier donjon. Additif, RLS
-- déjà en place sur characters (own-only).
alter table public.characters
  add column if not exists endless_best int not null default 0;
