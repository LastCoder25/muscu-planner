-- 0033 — Poids de rep par défi (XP juste selon l'exo). Dérivé à la création depuis
-- muscle_secondary (isolation vs composé) × equipment_required (chargé ou non).
-- Additif, RLS inchangée. Anciens défis = 1 (neutre).
alter table challenges
  add column if not exists rep_weight numeric not null default 1;
