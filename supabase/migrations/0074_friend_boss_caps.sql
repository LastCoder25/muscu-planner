-- 0074 — BOSS ENTRE AMIS : les plafonds de saisie retrouvent leur ampleur (v0.889).
--
-- Signalé en urgence par l'utilisateur : « ça m'a bloqué mes tirs ». La v0.869 a divisé les
-- parts par 5 (pompes 300 → 60) pour faire du boss un bonus facile, et les plafonds, exprimés
-- en PART, ont suivi : 36 pompes par 24 h. Deux joueurs étaient bloqués le jour même.
-- Les plafonds reviennent à leur valeur ABSOLUE d'avant (pompes 150 par saisie, 180 par 24 h),
-- soit 2,5 et 3 parts. Les parts, la part minimale du coffre et l'XP ne bougent pas.
--
-- ⚠️ Doit rester égal à `FRIEND_BOSS.hitMaxShare` / `dayMaxShare` (src/lib/friendBoss.ts) —
-- un test lit la DERNIÈRE définition de `fboss_hit`. Les migrations précédentes ne sont pas
-- éditées : on remplace la fonction (les droits sont conservés par `create or replace`).

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
  -- ⚠️ Mêmes plafonds que `acceptedUnits` : une saisie ≤ 2,5 parts, 24 h ≤ 3 parts, et les
  -- reps qui restent avant la mort (arrondi au-dessus, comme `bossUnitsLeft`).
  v_acc := least(greatest(0, coalesce(p_units, 0)),
                 floor(v_share * 2.5)::integer,
                 floor(v_share * 3)::integer - v_day,
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
