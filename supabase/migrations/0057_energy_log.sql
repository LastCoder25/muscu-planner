-- 0057 — Journal d'énergie HORS-SPORT (ticket : la Dynamo de faille n'apparaissait
-- pas dans l'historique ⚡ d'Aventure, faute d'horodatage). Une entrée par gain
-- (bonus de connexion, montée de niveau, Dynamo), pour un détail jour par jour comme
-- pour le sport. Les sources SPORT restent dérivées des logs/défis existants.
alter table public.characters add column if not exists energy_log jsonb not null default '[]'::jsonb;
