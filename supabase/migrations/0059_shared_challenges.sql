-- 0059_shared_challenges.sql — DÉFI PARTAGÉ entre deux amis.
--
-- Contrainte d'architecture : les RLS de `challenges` sont own-only en INSERT, donc on
-- ne peut pas créer la ligne de son ami (et on ne veut pas d'un SECURITY DEFINER qui
-- écrirait à sa place — ce serait le seul endroit du projet où un client fabrique la
-- donnée d'un autre). Le flux passe donc par une INVITATION : le proposant écrit la
-- DÉFINITION commune, l'ami l'accepte, et c'est SON client qui insère SON propre défi
-- en le pointant sur cette définition (`challenges.shared_id`).
--
-- Les deux défis restent donc des lignes normales : toute la logique existante
-- (jetons par voie, progression, XP, clôture automatique) s'applique sans exception.
-- Le partage n'est qu'un lien, et la comparaison se fait à la lecture — les policies
-- `challenges_read_friends` (migr. 0058) autorisent déjà à lire le défi de l'ami.

create table if not exists public.shared_challenges (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invited_user uuid not null references auth.users (id) on delete cascade,
  -- Définition du défi, recopiée telle quelle par l'invité s'il accepte.
  exercise_id text not null,
  exercise_name text not null,
  muscle_primary text,
  rep_weight numeric,
  unit text not null default 'reps',
  format text not null,
  duration_days int not null,
  start_date date not null,
  config jsonb not null default '{}'::jsonb,
  -- true  = objectifs IDENTIQUES (duel strict)
  -- false = objectifs ADAPTÉS au niveau de chacun (défaut : cohérent avec toute
  --         l'app, qui calibre par niveau ; on compare alors les %, pas les reps)
  same_targets boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_ch_not_self check (created_by <> invited_user)
);

alter table public.challenges
  add column if not exists shared_id uuid references public.shared_challenges (id) on delete set null;

create index if not exists challenges_shared_idx on public.challenges (shared_id);
create index if not exists shared_ch_invited_idx on public.shared_challenges (invited_user, status);
create index if not exists shared_ch_creator_idx on public.shared_challenges (created_by, status);

alter table public.shared_challenges enable row level security;

-- Les deux parties voient la proposition, personne d'autre.
drop policy if exists shared_ch_select_party on public.shared_challenges;
create policy shared_ch_select_party on public.shared_challenges for select to authenticated
  using (auth.uid() in (created_by, invited_user));

-- On ne propose qu'en SON nom, et qu'à un AMI confirmé.
drop policy if exists shared_ch_insert_friend on public.shared_challenges;
create policy shared_ch_insert_friend on public.shared_challenges for insert to authenticated
  with check (auth.uid() = created_by and public.are_friends(auth.uid(), invited_user));

-- Seul l'INVITÉ répond : le proposant ne peut pas s'auto-accepter.
drop policy if exists shared_ch_update_invited on public.shared_challenges;
create policy shared_ch_update_invited on public.shared_challenges for update to authenticated
  using (auth.uid() = invited_user)
  with check (auth.uid() = invited_user);

-- Le proposant peut retirer sa proposition.
drop policy if exists shared_ch_delete_creator on public.shared_challenges;
create policy shared_ch_delete_creator on public.shared_challenges for delete to authenticated
  using (auth.uid() = created_by);
