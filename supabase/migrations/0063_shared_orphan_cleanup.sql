-- 0063_shared_orphan_cleanup.sql — une INVITATION EN ATTENTE ne survit pas au défi
-- qui l'a créée.
--
-- ⚠️ POURQUOI EN BASE ET PAS AU CLIENT. Le nettoyage existe déjà côté client depuis la
-- v0.720 (`challenges.remove` supprime la proposition `pending` rattachée) et il est
-- juste — mais il ne peut RIEN GARANTIR : il dépend de deux choses fragiles. (1) Que
-- l'onglet fasse tourner un build récent : ce projet déploie plusieurs fois par jour, et
-- un onglet resté ouvert exécute l'ancien code indéfiniment (c'est tout l'objet de
-- `useAppUpdate`). (2) Que `shared_id` soit présent dans l'état LOCAL au moment du clic ;
-- s'il ne l'est pas, le nettoyage ne part même pas.
--
-- Mesuré sur la base au 2026-09-11 : UNE ligne orpheline (« Jumping jacks », proposée
-- le 2026-09-08, plus aucun défi rattaché) — l'ami voyait donc « Relève ce défi » pour
-- quelque chose qui n'existait plus, et l'accepter aurait créé un jumeau sans jumeau.
--
-- La règle descend donc là où elle ne peut plus être contournée, quel que soit le chemin
-- de suppression. Le client garde la sienne : elle rend l'écran cohérent immédiatement,
-- sans attendre un rechargement. Deux filets, pas deux vérités — ils suppriment la même
-- ligne, et supprimer deux fois ne coûte rien.

-- ⚠️ `pending` UNIQUEMENT : une fois l'invitation ACCEPTÉE, l'ami a SON propre défi
-- rattaché à cette définition. Abandonner ou supprimer le sien ne doit jamais effacer
-- le sien à lui — c'est son comparatif, pas notre décision.
create or replace function public.drop_pending_shared_on_challenge_delete()
returns trigger
language plpgsql
as $$
begin
  if old.shared_id is not null then
    delete from public.shared_challenges s
    where s.id = old.shared_id
      and s.status = 'pending'
      -- Plus aucun défi ne pointe dessus : c'est bien la dernière attache.
      and not exists (select 1 from public.challenges c where c.shared_id = s.id);
  end if;
  return old;
end;
$$;

drop trigger if exists challenges_drop_pending_shared on public.challenges;
create trigger challenges_drop_pending_shared
  after delete on public.challenges
  for each row
  execute function public.drop_pending_shared_on_challenge_delete();

-- Rattrapage des lignes déjà orphelines (celles écrites avant ce filet).
delete from public.shared_challenges s
where s.status = 'pending'
  and not exists (select 1 from public.challenges c where c.shared_id = s.id);
