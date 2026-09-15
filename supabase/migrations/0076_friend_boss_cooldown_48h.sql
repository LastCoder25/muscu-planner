-- 0076 — BOSS ENTRE AMIS : le lanceur relance 48 h après la fin, et non plus 7 jours (v0.893).
--
-- Demande de l'utilisateur : « mettre plutôt un délai de 48 h entre la fin d'un boss commun et
-- un autre ». La fin reste la mort du boss, ou le bout de ses 7 jours (`fboss_ended`).
-- La 0071 est déjà appliquée : on remplace `fboss_declare` (droits conservés), seul le délai
-- change. La lib (`FRIEND_BOSS.cooldownMs`) porte la même valeur, un test compare les deux.

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
  v_buildings jsonb;
  v_invitees uuid[] := coalesce(p_invitees, '{}');
  v_id uuid;
  v_friend uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select pseudo, buildings into v_pseudo, v_buildings
    from public.characters where user_id = v_uid for update;
  if v_pseudo is null then raise exception 'no_character'; end if;
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_buildings) = 'array'
                                            then v_buildings else '[]'::jsonb end) e
    where e->>'typeId' = 'boss_altar' and coalesce((e->>'level')::numeric, 0) > 0
  ) then raise exception 'no_altar'; end if;
  if public.fboss_share(p_family) is null then raise exception 'bad_family'; end if;
  if not exists (select 1 from public.exercises where id = p_exercise_id) then
    raise exception 'bad_exercise';
  end if;
  if public.fboss_busy(v_uid) then raise exception 'busy'; end if;
  if exists (
    select 1 from public.friend_bosses b
    where b.owner_id = v_uid and public.fboss_ended(b) + interval '48 hours' > now()
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
