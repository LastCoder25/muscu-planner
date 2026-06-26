-- 0008_body_entries.sql — suivi corporel (poids, sommeil, circonférences).
-- Une ligne = une saisie (check-in). Tous les champs de mesure sont optionnels.
-- Circonférences en cm dans un JSONB (additif : on peut ajouter des mesures sans migration).
create table if not exists public.body_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric,
  sleep_hours numeric,
  measurements jsonb,
  note text,
  created_at timestamptz not null default now()
);

alter table public.body_entries enable row level security;

create policy "body_own" on public.body_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists body_entries_user_date_idx
  on public.body_entries (user_id, measured_at desc);
