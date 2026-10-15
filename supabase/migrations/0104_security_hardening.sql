-- 0104 — Durcissement de sécurité (audit du 2026-10-15).
--
-- 1. AMITIÉ FORGÉE : la policy `friendships_update_addressee` ne contrôle que le destinataire
--    et le statut. Rien n'empêchait d'accepter une demande reçue (d'un second compte) en
--    réécrivant `requester_id` avec l'identifiant d'une victime : `are_friends` devenait vrai
--    et ouvrait la lecture de ses défis, de son 360 et de ses quêtes. Les deux parties d'une
--    amitié sont désormais IMMUABLES.
-- 2. DÉFI PARTAGÉ : l'invité ne doit changer que sa réponse (statut, horodatages), jamais la
--    définition ni les parties.
-- 3. BOSS MONDIAL (dormant, sans écran) : ses fonctions SECURITY DEFINER étaient appelables
--    même sans être connecté (création de boss, dégâts illimités, crédit d'or). Plus personne
--    ne les exécute côté client.
-- 4. `are_friends` n'est plus appelable par `anon` (oracle de relations).
-- 5. `is_admin()` repose sur l'IDENTIFIANT, plus sur l'e-mail du JWT : les e-mails ne sont
--    pas confirmés (mailer_autoconfirm), un contrôle d'e-mail est plus fragile.

create or replace function public.friendships_lock_parties()
returns trigger language plpgsql as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id then
    raise exception 'friendship parties are immutable' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists friendships_lock_parties on public.friendships;
create trigger friendships_lock_parties before update on public.friendships
  for each row execute function public.friendships_lock_parties();

create or replace function public.shared_challenges_lock_definition()
returns trigger language plpgsql as $$
begin
  -- Un utilisateur (auth.uid() renseigné) ne change que la réponse ; l'admin garde la main.
  if auth.uid() is not null
     and (to_jsonb(new) - 'status' - 'updated_at' - 'responded_at')
         is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'responded_at') then
    raise exception 'only the answer of a shared challenge can change' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists shared_challenges_lock_definition on public.shared_challenges;
create trigger shared_challenges_lock_definition before update on public.shared_challenges
  for each row execute function public.shared_challenges_lock_definition();

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ensure_world_boss', 'hit_world_boss', 'claim_boss_reward')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.uid() = '025e2e6a-3572-4dfc-a49f-9106c7a79855'::uuid, false);
$$;
