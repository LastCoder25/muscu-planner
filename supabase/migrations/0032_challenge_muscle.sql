-- 0032 — muscle_primary sur les défis (pour la limite « accessoire » : les petits
-- exos d'isolation ne consomment pas de jeton). Additif, RLS inchangée.
alter table challenges
  add column if not exists muscle_primary text;
