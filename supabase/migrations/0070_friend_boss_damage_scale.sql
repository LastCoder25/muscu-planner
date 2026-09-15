-- 0070 — BOSS ENTRE AMIS : une rep = 1000 dégâts (v0.872).
--
-- Demande de l'utilisateur : de plus gros chiffres, et RIEN d'autre. Les PV sont multipliés
-- d'autant : le nombre de reps pour abattre un boss ne change pas. Les parts, les plafonds
-- de saisie, la part minimale du coffre et l'XP restent en REPS (`units`) — seuls
-- `friend_bosses.hp_total` et `friend_bosses.damage` passent en points de dégât.
--
-- ⚠️ Doit rester égal à `FRIEND_BOSS.damagePerUnit` (src/lib/friendBoss.ts) — un test lit ce
-- fichier. La 0067 n'est pas éditée : on remplace les fonctions (les droits sont conservés
-- par `create or replace`).

create or replace function public.fboss_damage_per_unit() returns integer
  language sql immutable as $$
  select 1000;
$$;

-- ── Déclarer : les PV d'une part, en dégâts ─────────────────────────────────────────
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
            public.fboss_share(p_family) * public.fboss_damage_per_unit())
    returning id into v_id;

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status, responded_at)
    values (v_id, v_uid, v_pseudo, 'accepted', now());

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status)
    select v_id, c.user_id, c.pseudo, 'invited'
    from public.characters c where c.user_id = any (v_invitees);

  return v_id;
end;
$$;

-- ── Répondre : un ami qui rejoint ajoute une part, en dégâts ────────────────────────
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
  if now() >= public.fboss_start(b) then raise exception 'closed'; end if;
  if p_accept and public.fboss_busy(v_uid) then raise exception 'busy'; end if;

  update public.friend_boss_members
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where boss_id = p_boss and user_id = v_uid;

  if p_accept then
    update public.friend_bosses
      set hp_total = hp_total + public.fboss_share(family) * public.fboss_damage_per_unit()
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

-- ── Frapper : plafonds en reps, dégâts × 1000 ───────────────────────────────────────
create or replace function public.fboss_hit(p_boss uuid, p_units integer) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_share integer;
  v_day integer;
  v_acc integer;
  v_dpu integer := public.fboss_damage_per_unit();
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
  -- ⚠️ Mêmes plafonds que `acceptedUnits` : une saisie ≤ ½ part, 24 h ≤ 0,6 part, et les
  -- reps qui restent avant la mort (arrondi au-dessus, comme `bossUnitsLeft`).
  v_acc := least(greatest(0, coalesce(p_units, 0)),
                 floor(v_share * 0.5)::integer,
                 floor(v_share * 0.6)::integer - v_day,
                 ceil((b.hp_total - b.damage)::numeric / v_dpu)::integer);
  if v_acc <= 0 then
    return json_build_object('ok', false, 'reason', 'capped');
  end if;

  insert into public.friend_boss_hits (boss_id, user_id, units) values (p_boss, v_uid, v_acc);
  update public.friend_boss_members set units = units + v_acc
    where boss_id = p_boss and user_id = v_uid;
  update public.friend_bosses
    set damage = damage + v_acc * v_dpu,
        defeated_at = case when damage + v_acc * v_dpu >= hp_total then now() else defeated_at end
    where id = p_boss;

  return json_build_object('ok', true, 'accepted', v_acc,
                           'defeated', b.damage + v_acc * v_dpu >= b.hp_total);
end;
$$;

-- ── Les boss existants passent à l'échelle ─────────────────────────────────────────
-- Avant : au plus 300 s × 10 participants = 3 000 PV. Après : au moins 30 reps × 1000 =
-- 30 000. Le garde rend la conversion sans effet si elle est rejouée.
update public.friend_bosses
  set hp_total = hp_total * 1000, damage = damage * 1000
  where hp_total <= 3000;
