-- 0018_cardio_logs.sql — course à pied / trail (Phase A : logging).
-- Alimente la piste Cardio (niveau) + les stats. Saisie MANUELLE (pas de GPS) :
-- distance, durée, dénivelé (D+ pour le trail), ressenti. Types de séance.

create table public.cardio_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cardio_session_id uuid,
  run_type text not null default 'footing'
    check (run_type in ('footing', 'fractionne', 'tempo', 'sortie_longue', 'trail', 'recup')),
  distance_km numeric,
  duration_min int,
  elevation_m int, -- D+ (dénivelé positif), surtout trail
  rpe int, -- ressenti 1–4
  comment text,
  payload jsonb not null default '{}',
  performed_at timestamptz not null default now()
);
create index cardio_logs_user_idx on public.cardio_logs(user_id, performed_at desc);

alter table public.cardio_logs enable row level security;

create policy "cardio_logs_own" on public.cardio_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
