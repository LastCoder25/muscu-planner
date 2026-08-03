-- 0022_cardio_simplify.sql — simplification du cardio : log global uniquement.
-- Ajoute le dénivelé négatif (D-) ; supprime les plans d'entraînement (générateur
-- et plan retirés de l'app).

alter table public.cardio_logs add column if not exists descent_m int;

drop table if exists public.cardio_plans;
