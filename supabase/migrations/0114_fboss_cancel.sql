-- 0114 — BOSS ENTRE AMIS : le lanceur peut ANNULER son boss, s'il est seul dessus.
--
-- Demandé par l'utilisateur : « donne la possibilité d'annuler un boss commun en cours
-- (uniquement si on est seul dessus) ». « Seul » = aucun autre membre n'a ACCEPTÉ (des
-- invitations sans réponse ou refusées ne comptent pas : elles disparaissent avec le boss).
-- Le boss est supprimé (membres et saisies partent en cascade) : le délai de 48 h du
-- lanceur ne le retient plus, puisqu'il ne reste aucun boss lancé.
--
-- Jetons : rendus (dans la limite de la réserve, 6) SEULEMENT si aucune saisie n'a été faite
-- — sinon on gagnerait de l'XP, puis on récupérerait la mise.

create or replace function public.fboss_cancel(p_boss uuid) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_refund integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Même ordre de verrous que fboss_declare / fboss_respond : personnage, puis boss.
  perform 1 from public.characters where user_id = v_uid for update;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if b.owner_id <> v_uid then raise exception 'not_owner'; end if;
  if b.defeated_at is not null then raise exception 'defeated'; end if;
  if exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id <> v_uid and status = 'accepted'
  ) then raise exception 'not_alone'; end if;

  if not exists (select 1 from public.friend_boss_hits where boss_id = p_boss) then
    v_refund := public.fboss_token_cost(b.tier);
    update public.characters
      set boss_tokens = least(6, coalesce(boss_tokens, 0) + v_refund)
      where user_id = v_uid;
  end if;

  delete from public.scheduled_pushes
    where dedupe = 'fboss-end:' || p_boss and sent_at is null;
  delete from public.friend_bosses where id = p_boss;
  return json_build_object('ok', true, 'refund', v_refund);
end;
$$;

revoke all on function public.fboss_cancel(uuid) from public, anon;
grant execute on function public.fboss_cancel(uuid) to authenticated;
