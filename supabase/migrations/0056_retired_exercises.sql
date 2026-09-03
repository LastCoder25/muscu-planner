-- 0056 — Retrait progressif d'exercices doublons (ticket : simplifier tractions/dips
-- assistés). `retired` = exclu des futures sélections (générateur, wizards challenge/
-- 360, swap sheet) mais reste résolvable par id (historique, défis/360 déjà créés,
-- fiche exo) → aucune perte de données. Les variantes assistées deviennent inutiles
-- pour du NOUVEAU contenu car le toggle « assisté » (déjà existant à la saisie d'une
-- série, ChallengeNewPage/ComboDetailPage) couvre le même besoin sur l'exo de base.
alter table public.exercises add column if not exists retired boolean not null default false;
update public.exercises set retired = true where id in ('ex_pullup_assisted', 'ex_dips_assisted');
