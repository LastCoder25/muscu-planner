-- 0017_drill_logs.sql — bilans des séances de tennis jouées (runner court, Phase 3).
-- Équivalent tennis de `session_logs`. Indépendant de drill_sessions (pas de FK :
-- on garde le bilan même si la séance planifiée est supprimée).

create table public.drill_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  drill_session_id uuid,
  name text,
  sport text not null default 'tennis',
  duration_min int,
  global_difficulty int,
  payload jsonb not null default '{}',
  performed_at timestamptz not null default now()
);
create index drill_logs_user_idx on public.drill_logs(user_id, performed_at desc);

alter table public.drill_logs enable row level security;

create policy "drill_logs_own" on public.drill_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
