-- 0035 — Défi 360 : défi combiné hebdomadaire multi-exos (couverture full-body).
-- Un « conteneur de volume » : plusieurs exos (legs) avec une cible de reps/semaine,
-- à faire dans la durée, reps réparties quand on veut. XP façon séance (reps + tonnage).
create table if not exists combo_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Défi 360',
  start_date date not null,
  duration_days int not null default 7,
  status text not null default 'active', -- active | done | abandoned
  legs jsonb not null default '[]'::jsonb, -- [{slot, exercise_id, exercise_name, muscle_primary, rep_weight, target, weight_kg, progress:[{date,reps}]}]
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table combo_challenges enable row level security;

create policy combo_own_select on combo_challenges for select using (auth.uid() = user_id);
create policy combo_own_insert on combo_challenges for insert with check (auth.uid() = user_id);
create policy combo_own_update on combo_challenges for update using (auth.uid() = user_id);
create policy combo_own_delete on combo_challenges for delete using (auth.uid() = user_id);

create index if not exists combo_challenges_user_status on combo_challenges (user_id, status);
