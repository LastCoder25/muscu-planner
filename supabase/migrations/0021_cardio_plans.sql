-- 0021_cardio_plans.sql — plan d'entraînement course vers une course (Phase C).
-- Le plan complet (semaines + séances datées + état fait) vit dans le payload.

create table public.cardio_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  race_type text,
  race_date date,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index cardio_plans_user_idx on public.cardio_plans(user_id, created_at desc);

alter table public.cardio_plans enable row level security;

create policy "cardio_plans_own" on public.cardio_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
