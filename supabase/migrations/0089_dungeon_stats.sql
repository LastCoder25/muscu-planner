-- 0089_dungeon_stats.sql — DONJONS : tentatives et nettoyages, par donjon (v0.1116).
-- Demande de l'utilisateur : afficher le % de réussite RÉEL sur chaque donjon, comme pour
-- les paliers du Labyrinthe (0073) et les boss de palier (0085). Additive : {} = aucune
-- tentative enregistrée.
alter table public.characters
  add column if not exists dungeon_stats jsonb not null default '{}'::jsonb;
