-- 0082 — 🎟️ Tickets d'invocation (v0.992) : le sport alimente le gacha.
-- Gagnés UNIQUEMENT par le sport (Défi 360 bouclé, boss entre amis abattu, niveau global
-- gagné) ; un ticket = un tirage. Colonne À PART de `gacha` : chaque tirage réécrit `gacha`,
-- un oubli y effacerait les tickets. Additive, défaut 0 : aucune ligne existante ne bouge.
alter table public.characters
  add column if not exists gacha_tickets integer not null default 0;
