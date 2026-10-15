-- 0103 — 🎁 BOSS ENTRE AMIS : COFFRE PERSO ET BONUS DE GROUPE SÉPARÉS (v1.200.0).
--
-- Conçu avec l'utilisateur : celui qui fait sa part ne doit pas être pénalisé si ses amis
-- lâchent. Deux récompenses, chacune prise UNE fois (le contenu est tiré côté client,
-- `src/lib/friendBoss.ts`) :
--   • `fboss_claim` — le COFFRE PERSO, selon SES reps : dû dès que sa part est faite, sinon à
--     la fin du combat (mort ou 7 jours) avec au moins une rep (lot de consolation) ;
--   • `fboss_claim_bonus` — le BONUS DE GROUPE : boss abattu ET demi-part faite.
--
-- ⚠️ Les coffres pris AVANT ce changement comprenaient déjà la victoire : `legacy_chest` les
-- marque, et leur bonus est réputé pris.

alter table public.friend_boss_members
  add column if not exists bonus_claimed boolean not null default false,
  add column if not exists legacy_chest boolean not null default false;

update public.friend_boss_members
  set legacy_chest = true, bonus_claimed = true
  where claimed and not legacy_chest;

create or replace function public.fboss_claim(p_boss uuid) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_units integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  select units into v_units from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted' and not claimed;
  if v_units is null or v_units <= 0 then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  -- Sa part entière : le coffre s'ouvre tout de suite. Sinon, à la fin du combat.
  if v_units < public.fboss_share_tier(b.family, b.tier)
     and now() < public.fboss_ended(b) then
    return json_build_object('ok', false, 'reason', 'not_ended');
  end if;
  update public.friend_boss_members set claimed = true
    where boss_id = p_boss and user_id = v_uid;
  return json_build_object('ok', true, 'units', v_units);
end;
$$;

create or replace function public.fboss_claim_bonus(p_boss uuid) returns json
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
    where boss_id = p_boss and user_id = v_uid and status = 'accepted' and not bonus_claimed;
  if v_units is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  if v_units < public.fboss_share_tier(b.family, b.tier) * 0.5 then
    return json_build_object('ok', false, 'reason', 'min_share');
  end if;
  update public.friend_boss_members set bonus_claimed = true
    where boss_id = p_boss and user_id = v_uid;
  return json_build_object('ok', true, 'units', v_units);
end;
$$;

revoke all on function public.fboss_claim(uuid) from public, anon;
revoke all on function public.fboss_claim_bonus(uuid) from public, anon;
grant execute on function public.fboss_claim(uuid) to authenticated;
grant execute on function public.fboss_claim_bonus(uuid) to authenticated;
