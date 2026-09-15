-- 0072 — BOSS ENTRE AMIS : l'apparence du héros de chaque membre (v0.873).
--
-- Demande de l'utilisateur : une scène de combat avec le boss en haut et les amis en ligne
-- dessous, CHACUN AVEC SON AVATAR. Or la RLS de `characters` est own-only : on ne lit pas le
-- héros d'un ami. Chaque membre dépose donc un INSTANTANÉ de son apparence (silhouette, noms
-- et raretés des pièces portées, set, race du familier) sur SA ligne de membre, lisible par
-- les membres du boss comme le reste (policy `friend_boss_members_read`).
--
-- ⚠️ Un client n'écrit jamais la ligne d'un autre : `fboss_set_look` ne touche que les
-- adhésions de `auth.uid()`. Taille bornée. Aucune stat, aucun effet : de l'apparence seule
-- (la lib `heroLook.ts` la construit et la relit défensivement).

alter table public.friend_boss_members add column if not exists look jsonb;

create or replace function public.fboss_set_look(p_look jsonb) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' or octet_length(p_look::text) > 2000 then
    raise exception 'bad_look';
  end if;
  update public.friend_boss_members m set look = p_look
    from public.friend_bosses b
    where m.boss_id = b.id and m.user_id = v_uid and now() < public.fboss_ended(b);
end;
$$;

revoke all on function public.fboss_set_look(jsonb) from public, anon;
grant execute on function public.fboss_set_look(jsonb) to authenticated;
