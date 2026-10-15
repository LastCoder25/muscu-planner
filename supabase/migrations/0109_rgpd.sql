-- 🔒 RGPD (audit 2026-10-15) : droit à l'effacement et durée de conservation appliquée.
--
-- 1. `delete_my_account()` : un utilisateur supprime SON compte. Toutes ses lignes partent par
--    les `on delete cascade` vers auth.users (vérifié : toutes les tables par utilisateur en ont).
--    ⚠️ Le mot de passe est redemandé côté client (connexion) juste avant l'appel.
--    ⚠️ ANONYMISER PLUTÔT QUE SUPPRIMER quand l'historique d'un tiers en dépend : un boss entre
--    amis lancé par ce compte passe à un autre membre accepté, sinon il disparaîtrait pour tout
--    le groupe. Un boss sans autre membre part avec le compte.
-- 2. Purge planifiée des comptes sans connexion depuis 3 ans (`RETENTION.inactiveAccountDays`,
--    src/lib/privacy.ts — la page Confidentialité l'annonce).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  update public.friend_bosses b
     set owner_id = (
       select m.user_id from public.friend_boss_members m
        where m.boss_id = b.id and m.user_id <> uid and m.status = 'accepted'
        order by m.user_id limit 1)
   where b.owner_id = uid
     and exists (
       select 1 from public.friend_boss_members m
        where m.boss_id = b.id and m.user_id <> uid and m.status = 'accepted');
  -- Seule table par utilisateur SANS clé étrangère vers auth.users (boss mondial, migr. 0029).
  delete from public.boss_contributions where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.purge_inactive_accounts(days integer default 1095)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with gone as (
    delete from auth.users
     where coalesce(last_sign_in_at, created_at) < now() - make_interval(days => days)
    returning id
  ), contrib as (
    delete from public.boss_contributions c using gone where c.user_id = gone.id
  )
  select count(*) into n from gone;
  return n;
end;
$$;

revoke all on function public.purge_inactive_accounts(integer) from public, anon, authenticated;

select cron.unschedule('purge-comptes-inactifs')
 where exists (select 1 from cron.job where jobname = 'purge-comptes-inactifs');
select cron.schedule('purge-comptes-inactifs', '47 3 * * *',
  $$select public.purge_inactive_accounts(1095)$$);
