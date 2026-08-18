-- 0050 — Pierres d'invocation de boss (🔮). Ressource farmée dans les donjons
-- (drop au nettoyage ∝ profondeur) + craftable à la poussière. Dépensée pour
-- TENTER un boss de palier (remplace l'énergie sur les boss → lie le farm de
-- donjon aux boss ; les donjons ont enfin une raison d'être farmés).
alter table public.characters
  add column if not exists summon_stones integer not null default 0;
