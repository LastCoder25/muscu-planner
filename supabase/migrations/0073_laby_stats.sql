-- 0073_laby_stats.sql — LABYRINTHE : runs lancés et paliers nettoyés, par palier (v0.884).
-- Demande de l'utilisateur : afficher le % de réussite RÉEL du joueur sur chaque palier, et
-- plus une estimation simulée. Additive : {} = aucun run (tous les comptes d'avant).
alter table public.characters
  add column if not exists laby_stats jsonb not null default '{}'::jsonb;
