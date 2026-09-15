-- 0075 — BOSS ENTRE AMIS : plus de plafond sur 24 h (v0.892).
--
-- Demandé par l'utilisateur : « pas de plafond de rep par jour sur les boss commun ».
-- Seul reste le plafond d'UNE saisie (2,5 parts, pompes 150) — un garde-fou contre la faute
-- de frappe — et les reps qui restent avant la mort du boss.
--
-- ⚠️ Doit rester égal à `FRIEND_BOSS.hitMaxShare` et `acceptedUnits` (src/lib/friendBoss.ts) —
-- un test lit la DERNIÈRE définition de `fboss_hit`. Les migrations précédentes ne sont pas
-- éditées : on remplace la fonction (les droits sont conservés par `create or replace`).

create or replace function public.fboss_hit(p_boss uuid, p_units integer) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_share integer;
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
  -- ⚠️ Mêmes plafonds que `acceptedUnits` : une saisie ≤ 2,5 parts, et les reps qui restent
  -- avant la mort (arrondi au-dessus, comme `bossUnitsLeft`). Aucun plafond sur 24 h.
  v_acc := least(greatest(0, coalesce(p_units, 0)),
                 floor(v_share * 2.5)::integer,
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
