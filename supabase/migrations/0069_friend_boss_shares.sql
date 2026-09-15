-- Boss entre amis : parts de PV allégées (v0.869).
-- Le boss est un volume EN PLUS de la semaine ; le Défi 360 reste l'entraînement global.
-- Une part vaut désormais ~la moitié d'un groupe du 360 intermédiaire (avant : 2,5 fois).
-- ⚠️ Doit rester égal à `FRIEND_BOSS.shareUnits` (src/lib/friendBoss.ts) — un test le vérifie.
-- La 0067 n'est pas éditée : on remplace la fonction.

create or replace function public.fboss_share(p_family text) returns integer
  language sql immutable as $$
  select case p_family
    when 'push' then 60
    when 'legs' then 80
    when 'pull' then 30
    when 'core' then 300
    when 'conditioning' then 60
  end;
$$;

-- Les boss pas encore terminés reprennent leurs PV à la nouvelle échelle : une part par
-- membre accepté (c'est ce que `fboss_declare` et `fboss_respond` additionnent).
update public.friend_bosses b
  set hp_total = greatest(1, public.fboss_share(b.family) * (
        select count(*) from public.friend_boss_members m
        where m.boss_id = b.id and m.status = 'accepted')),
      defeated_at = case
        when b.defeated_at is null and b.damage >= public.fboss_share(b.family) * (
          select count(*) from public.friend_boss_members m
          where m.boss_id = b.id and m.status = 'accepted')
        then now() else b.defeated_at end
  where public.fboss_ended(b) > now();
