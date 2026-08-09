-- 0039 — Classement global (« sur l'honneur ») : chaque joueur publie ses niveaux.
-- Lecture par tous les connectés (le classement) ; écriture de SA propre ligne
-- uniquement. Les stats sont reportées côté client (calculées depuis les logs).
create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null,
  global_level int not null default 1,
  global_xp int not null default 0,
  muscu_level int not null default 1,
  cardio_level int not null default 1,
  challenges_level int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

drop policy if exists leaderboard_read on public.leaderboard;
create policy leaderboard_read on public.leaderboard
  for select to authenticated using (true);

drop policy if exists leaderboard_insert_own on public.leaderboard;
create policy leaderboard_insert_own on public.leaderboard
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists leaderboard_update_own on public.leaderboard;
create policy leaderboard_update_own on public.leaderboard
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists leaderboard_xp_idx on public.leaderboard (global_xp desc);
