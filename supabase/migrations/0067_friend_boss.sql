-- 0067 — BOSS ENTRE AMIS.
--
-- Un joueur déclare un boss (un exo au poids du corps), invite des amis, et le groupe
-- l'abat avec ses reps. Règles conçues avec l'utilisateur ; la lib `src/lib/friendBoss.ts`
-- les AFFICHE, ces fonctions les APPLIQUENT. Un test lit ce fichier et vérifie que les
-- constantes sont les mêmes des deux côtés.
--
-- ⚠️ AUCUNE ÉCRITURE DIRECTE. Les trois tables n'ont que des policies de LECTURE : tout
-- changement passe par les fonctions ci-dessous (SECURITY DEFINER), qui vérifient les
-- fenêtres de temps, l'amitié, les plafonds et les PV dans une même transaction, sous
-- verrou. Un onglet périmé ou un appel direct à l'API ne contourne rien.
--
-- ⚠️ UN CLIENT N'ÉCRIT JAMAIS LA LIGNE D'UN AUTRE : l'invitation d'un ami est créée par
-- `fboss_declare`, et sa notification par un DÉCLENCHEUR en base — jamais par le
-- téléphone du lanceur, qui ne peut programmer des messages que pour lui-même (0062).

create table if not exists public.friend_bosses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  exercise_name text not null,
  family text not null check (family in ('push', 'legs', 'pull', 'core', 'conditioning')),
  -- Poids de rep de l'exo, figé à la déclaration. Il ne touche QUE l'XP (calculée côté
  -- client) : les PV et les dégâts, eux, se comptent en unités brutes.
  rep_weight numeric not null default 1 check (rep_weight between 0.3 and 2),
  created_at timestamptz not null default now(),
  -- Posé quand tous les invités ont répondu AVANT la fin de la fenêtre (ou sans invité).
  -- Sinon le boss démarre à `created_at + 24 h`.
  start_at timestamptz,
  defeated_at timestamptz,
  hp_total integer not null check (hp_total > 0),
  damage integer not null default 0 check (damage >= 0)
);

create table if not exists public.friend_boss_members (
  boss_id uuid not null references public.friend_bosses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Dénormalisé : la RLS de `characters` est own-only, les membres doivent se voir.
  pseudo text not null,
  status text not null check (status in ('accepted', 'invited', 'declined')),
  responded_at timestamptz,
  units integer not null default 0 check (units >= 0),
  claimed boolean not null default false,
  primary key (boss_id, user_id)
);

create table if not exists public.friend_boss_hits (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.friend_bosses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  units integer not null check (units > 0),
  created_at timestamptz not null default now()
);

create index if not exists friend_boss_hits_user_idx
  on public.friend_boss_hits (boss_id, user_id, created_at);
create index if not exists friend_boss_members_user_idx
  on public.friend_boss_members (user_id);

alter table public.friend_bosses enable row level security;
alter table public.friend_boss_members enable row level security;
alter table public.friend_boss_hits enable row level security;

-- ── Aides (mêmes règles que la lib) ─────────────────────────────────────────────

-- Part de PV d'un participant. ⚠️ Doit rester égale à `FRIEND_BOSS.shareUnits`.
create or replace function public.fboss_share(p_family text) returns integer
  language sql immutable as $$
  select case p_family
    when 'push' then 300
    when 'legs' then 400
    when 'pull' then 150
    when 'core' then 1200
    when 'conditioning' then 300
  end;
$$;

-- Démarrage effectif : fin de la fenêtre de 24 h, ou plus tôt si tout le monde a répondu.
create or replace function public.fboss_start(b public.friend_bosses) returns timestamptz
  language sql immutable as $$
  select least(coalesce(b.start_at, b.created_at + interval '24 hours'),
               b.created_at + interval '24 hours');
$$;

-- Fin réelle : la mort, sinon 7 jours après le démarrage.
create or replace function public.fboss_ended(b public.friend_bosses) returns timestamptz
  language sql immutable as $$
  select coalesce(b.defeated_at, public.fboss_start(b) + interval '7 days');
$$;

-- Le joueur a-t-il un boss EN COURS, lancé ou rejoint ?
create or replace function public.fboss_busy(p_uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.friend_boss_members m
    join public.friend_bosses b on b.id = m.boss_id
    where m.user_id = p_uid and m.status = 'accepted' and now() < public.fboss_ended(b)
  );
$$;

-- Membre (quel que soit son statut) d'un boss — sert aux policies de lecture.
create or replace function public.is_fboss_member(p_boss uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friend_boss_members m
    where m.boss_id = p_boss and m.user_id = auth.uid()
  );
$$;

create policy friend_bosses_read on public.friend_bosses for select to authenticated
  using (public.is_fboss_member(id));
create policy friend_boss_members_read on public.friend_boss_members for select to authenticated
  using (public.is_fboss_member(boss_id));
create policy friend_boss_hits_read on public.friend_boss_hits for select to authenticated
  using (public.is_fboss_member(boss_id));

-- ── Déclarer ─────────────────────────────────────────────────────────────────────
create or replace function public.fboss_declare(
  p_exercise_id text,
  p_exercise_name text,
  p_family text,
  p_rep_weight numeric,
  p_invitees uuid[]
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pseudo text;
  v_invitees uuid[] := coalesce(p_invitees, '{}');
  v_id uuid;
  v_friend uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Verrou sur SA ligne : deux déclarations simultanées ne passent pas toutes les deux.
  select pseudo into v_pseudo from public.characters where user_id = v_uid for update;
  if v_pseudo is null then raise exception 'no_character'; end if;
  if public.fboss_share(p_family) is null then raise exception 'bad_family'; end if;
  if not exists (select 1 from public.exercises where id = p_exercise_id) then
    raise exception 'bad_exercise';
  end if;
  if public.fboss_busy(v_uid) then raise exception 'busy'; end if;
  if exists (
    select 1 from public.friend_bosses b
    where b.owner_id = v_uid and public.fboss_ended(b) + interval '7 days' > now()
  ) then raise exception 'cooldown'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_invitees
    from unnest(v_invitees) x where x <> v_uid;
  if cardinality(v_invitees) > 9 then raise exception 'too_many_invites'; end if;
  foreach v_friend in array v_invitees loop
    if not public.are_friends(v_uid, v_friend) then raise exception 'not_friend'; end if;
  end loop;

  insert into public.friend_bosses (owner_id, exercise_id, exercise_name, family, rep_weight,
                                    start_at, hp_total)
    values (v_uid, p_exercise_id, left(p_exercise_name, 80), p_family,
            least(2, greatest(0.3, coalesce(p_rep_weight, 1))),
            case when cardinality(v_invitees) = 0 then now() end,
            public.fboss_share(p_family))
    returning id into v_id;

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status, responded_at)
    values (v_id, v_uid, v_pseudo, 'accepted', now());

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status)
    select v_id, c.user_id, c.pseudo, 'invited'
    from public.characters c where c.user_id = any (v_invitees);

  return v_id;
end;
$$;

-- ── Répondre à une invitation ────────────────────────────────────────────────────
create or replace function public.fboss_respond(p_boss uuid, p_accept boolean) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.characters where user_id = v_uid for update;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'invited'
  ) then raise exception 'not_invited'; end if;
  -- La fenêtre se ferme au démarrage : 24 h, ou dès que tout le monde a répondu.
  if now() >= public.fboss_start(b) then raise exception 'closed'; end if;
  if p_accept and public.fboss_busy(v_uid) then raise exception 'busy'; end if;

  update public.friend_boss_members
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where boss_id = p_boss and user_id = v_uid;

  if p_accept then
    update public.friend_bosses set hp_total = hp_total + public.fboss_share(family)
      where id = p_boss;
  end if;

  if not exists (
    select 1 from public.friend_boss_members where boss_id = p_boss and status = 'invited'
  ) then
    update public.friend_bosses set start_at = now() where id = p_boss;
  end if;
  return json_build_object('ok', true);
end;
$$;

-- ── Frapper ──────────────────────────────────────────────────────────────────────
create or replace function public.fboss_hit(p_boss uuid, p_units integer) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_share integer;
  v_day integer;
  v_acc integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted'
  ) then raise exception 'not_member'; end if;
  if b.defeated_at is not null or now() < public.fboss_start(b)
     or now() >= public.fboss_start(b) + interval '7 days' then
    return json_build_object('ok', false, 'reason', 'not_active');
  end if;

  v_share := public.fboss_share(b.family);
  select coalesce(sum(units), 0) into v_day from public.friend_boss_hits
    where boss_id = p_boss and user_id = v_uid and created_at > now() - interval '24 hours';
  -- ⚠️ Mêmes plafonds que `acceptedUnits` : une saisie ≤ ½ part, 24 h ≤ 0,6 part.
  v_acc := least(greatest(0, coalesce(p_units, 0)),
                 floor(v_share * 0.5)::integer,
                 floor(v_share * 0.6)::integer - v_day,
                 b.hp_total - b.damage);
  if v_acc <= 0 then
    return json_build_object('ok', false, 'reason', 'capped');
  end if;

  insert into public.friend_boss_hits (boss_id, user_id, units) values (p_boss, v_uid, v_acc);
  update public.friend_boss_members set units = units + v_acc
    where boss_id = p_boss and user_id = v_uid;
  update public.friend_bosses
    set damage = damage + v_acc,
        defeated_at = case when damage + v_acc >= hp_total then now() else defeated_at end
    where id = p_boss;

  return json_build_object('ok', true, 'accepted', v_acc,
                           'defeated', b.damage + v_acc >= b.hp_total);
end;
$$;

-- ── Réclamer le coffre ───────────────────────────────────────────────────────────
-- ⚠️ Le serveur ne tire PAS le butin (il ne connaît pas le jeu) : il garantit seulement
-- que le coffre est dû et qu'on ne le prend qu'une fois. Le client le tire ensuite avec
-- une graine fixe (boss + joueur) et le crédite sur SA ligne.
create or replace function public.fboss_claim(p_boss uuid) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_units integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null or b.defeated_at is null then
    return json_build_object('ok', false, 'reason', 'not_defeated');
  end if;
  select units into v_units from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted' and not claimed;
  if v_units is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  if v_units < public.fboss_share(b.family) * 0.5 then
    return json_build_object('ok', false, 'reason', 'min_share');
  end if;
  update public.friend_boss_members set claimed = true
    where boss_id = p_boss and user_id = v_uid;
  return json_build_object('ok', true, 'units', v_units);
end;
$$;

-- ── Notifications (déclencheurs) ─────────────────────────────────────────────────
create or replace function public.fboss_push_invite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_exo text;
begin
  if new.status <> 'invited' then return new; end if;
  select c.pseudo, b.exercise_name into v_owner, v_exo
    from public.friend_bosses b join public.characters c on c.user_id = b.owner_id
    where b.id = new.boss_id;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    values (new.user_id, 'fboss_invite', now(),
            '⚔️ ' || coalesce(v_owner, 'Un ami') || ' demande de l’aide',
            'Un boss à abattre en ' || coalesce(v_exo, 'reps') || '. Tu as 24 h pour le rejoindre.',
            '/friends', 'fboss-invite:' || new.boss_id)
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

create or replace function public.fboss_push_down() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.defeated_at is not null or new.defeated_at is null then return new; end if;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_down', now(), '🏆 Le boss est tombé',
           'Ton groupe l’a abattu. Ton coffre t’attend.', '/friends', 'fboss-down:' || new.id
    from public.friend_boss_members m
    where m.boss_id = new.id and m.status = 'accepted'
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

drop trigger if exists fboss_invite_push on public.friend_boss_members;
create trigger fboss_invite_push after insert on public.friend_boss_members
  for each row execute function public.fboss_push_invite();

drop trigger if exists fboss_down_push on public.friend_bosses;
create trigger fboss_down_push after update of defeated_at on public.friend_bosses
  for each row execute function public.fboss_push_down();

-- ── Droits ───────────────────────────────────────────────────────────────────────
revoke all on function public.fboss_declare(text, text, text, numeric, uuid[]) from public, anon;
revoke all on function public.fboss_respond(uuid, boolean) from public, anon;
revoke all on function public.fboss_hit(uuid, integer) from public, anon;
revoke all on function public.fboss_claim(uuid) from public, anon;
revoke all on function public.fboss_busy(uuid) from public, anon;
grant execute on function public.fboss_declare(text, text, text, numeric, uuid[]) to authenticated;
grant execute on function public.fboss_respond(uuid, boolean) to authenticated;
grant execute on function public.fboss_hit(uuid, integer) to authenticated;
grant execute on function public.fboss_claim(uuid) to authenticated;
