-- 0024_characters.sql — RPG : personnage de l'utilisateur (Phase 1 = pseudo unique).
-- Les stats/niveau/énergie sont DÉRIVÉS du sport côté client (pas stockés).
-- Colonnes futures (or, énergie dépensée, talents, équipement) = ajouts additifs.
create table if not exists public.characters (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  pseudo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicité GLOBALE du pseudo (insensible à la casse), imposée par la base même
-- si la RLS empêche de lire les lignes d'autrui → un pseudo pris renvoie 23505.
create unique index if not exists characters_pseudo_lower_idx
  on public.characters (lower(pseudo));

alter table public.characters enable row level security;

create policy characters_select_own on public.characters
  for select using (user_id = auth.uid());
create policy characters_insert_own on public.characters
  for insert with check (user_id = auth.uid());
create policy characters_update_own on public.characters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
