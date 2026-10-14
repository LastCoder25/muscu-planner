-- 0102 — 🗓️👥 LES QUÊTES DE LA SEMAINE D'UN AMI.
--
-- Les quêtes se dérivent des séances, sorties cardio et parties de tennis (tables own-only) :
-- un ami ne peut pas les recalculer. Chaque joueur publie donc un INSTANTANÉ de son tableau
-- de la semaine (`src/lib/questSnapshot.ts`), lisible par lui et par ses amis.
--
-- ⚠️ Un client n'écrit que SA ligne (insert/update own). Taille bornée. Aucune donnée de
-- séance : les objectifs, leur cible et leur avancement, rien d'autre.

create table if not exists public.weekly_quest_boards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  board jsonb not null,
  updated_at timestamptz not null default now(),
  constraint weekly_quest_boards_shape check (
    jsonb_typeof(board) = 'object' and octet_length(board::text) <= 2000
  )
);

alter table public.weekly_quest_boards enable row level security;

drop policy if exists weekly_quest_boards_read on public.weekly_quest_boards;
create policy weekly_quest_boards_read on public.weekly_quest_boards for select to authenticated
  using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));

drop policy if exists weekly_quest_boards_insert_own on public.weekly_quest_boards;
create policy weekly_quest_boards_insert_own on public.weekly_quest_boards for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists weekly_quest_boards_update_own on public.weekly_quest_boards;
create policy weekly_quest_boards_update_own on public.weekly_quest_boards for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
