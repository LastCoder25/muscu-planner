-- 0085_boss_stats.sql — BOSS DE PALIER : tentatives et victoires, par boss (v0.1061).
-- Demande de l'utilisateur : afficher le % de réussite RÉEL sur chaque boss de set, comme
-- pour les paliers du Labyrinthe (0073). Additive : {} = aucune tentative enregistrée.
alter table public.characters
  add column if not exists boss_stats jsonb not null default '{}'::jsonb;
