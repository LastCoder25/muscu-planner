-- 0012_challenges.sql — Challenges (défis) + succès débloqués.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id text not null,
  exercise_name text not null,
  unit text not null default 'reps',              -- 'reps' | 'time'
  format text not null,                            -- fixed | progressive | pyramid | wave | cumulative
  duration_days int not null,
  start_date date not null default current_date,
  config jsonb not null default '{}',              -- start, increment, peak, cycle_days, deload_pct, total, rest_weekdays[], reminder_time
  daily_targets int[] not null default '{}',       -- objectif par jour (0 = repos)
  progress jsonb not null default '[]',            -- [{day, date, target, done, elapsed_sec, completed}]
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.challenges enable row level security;
create policy "challenges_own" on public.challenges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists challenges_user_status_idx on public.challenges (user_id, status);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,                              -- catalogue statique côté front
  unlocked_at timestamptz not null default now(),
  unique (user_id, code)
);
alter table public.achievements enable row level security;
create policy "achievements_own" on public.achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
