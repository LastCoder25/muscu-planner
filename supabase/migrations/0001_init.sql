-- 0001_init.sql — schéma initial appli muscu
-- Stratégie (cf. contrat v1.0) : JSONB canonique + colonnes indexées extraites.
-- À coller dans Supabase → SQL Editor → Run.

create extension if not exists "pgcrypto";

-- updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- 1) PROFILES (1 ligne par utilisateur)
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level text not null default 'debutant'
    check (level in ('debutant','intermediaire','avance')),
  objective text not null default 'remise_en_forme'
    check (objective in ('force','hypertrophie','endurance','remise_en_forme','perte_de_gras')),
  sessions_per_week int,
  units text not null default 'kg' check (units in ('kg','lb')),
  payload jsonb not null,        -- l'objet profile complet
  level_config jsonb,            -- dérivé du niveau, surchargeable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2) EXERCISES (bibliothèque : globale si owner null, sinon perso)
create table public.exercises (
  id text primary key,                  -- slug stable : 'ex_bench_barbell'
  owner uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_primary text,
  muscle_secondary text[] default '{}',
  equipment text,
  payload jsonb not null default '{}',  -- alternatives, notes…
  created_at timestamptz not null default now()
);
create index exercises_owner_idx on public.exercises(owner);

-- 3) SESSIONS (le plan)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  split text,
  objective text,
  level text,
  source text default 'app'
    check (source in ('app','user','template','ai','engine')),
  payload jsonb not null,               -- la session complète (exercises inclus)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_user_idx on public.sessions(user_id, created_at desc);
create trigger trg_sessions_updated before update on public.sessions
  for each row execute function public.set_updated_at();

-- 4) SESSION_LOGS (le bilan)
create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  name text,
  performed_at timestamptz not null default now(),
  duration_min int,
  global_difficulty int check (global_difficulty between 1 and 4),
  payload jsonb not null,               -- le log complet (performed, commentaires)
  created_at timestamptz not null default now()
);
create index session_logs_user_idx on public.session_logs(user_id, performed_at desc);
create index session_logs_session_idx on public.session_logs(session_id);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles      enable row level security;
alter table public.exercises     enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_logs  enable row level security;

-- profiles : chacun le sien
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exercises : lecture globale (owner null) ou perso ; écriture perso uniquement
create policy "exercises_read" on public.exercises
  for select using (owner is null or owner = auth.uid());
create policy "exercises_insert_own" on public.exercises
  for insert with check (owner = auth.uid());
create policy "exercises_update_own" on public.exercises
  for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "exercises_delete_own" on public.exercises
  for delete using (owner = auth.uid());

-- sessions & logs : chacun les siens
create policy "sessions_own" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "session_logs_own" on public.session_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
