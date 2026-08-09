-- 0040 — Récompense de boss « au choix » : à la victoire, 3 candidats aléatoires
-- sont tirés et le joueur en choisit 1. Stockée en attente tant qu'il n'a pas
-- choisi (persiste s'il quitte l'app). Additif, RLS characters own-only.
alter table public.characters
  add column if not exists pending_reward jsonb;
