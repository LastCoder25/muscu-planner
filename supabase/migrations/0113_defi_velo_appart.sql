-- 0113_defi_velo_appart.sql — le défi « Vélo » compte aussi le vélo d'appartement.
-- Le report des sorties le faisait déjà (`challengeIdsForActivity`) ; seul l'intitulé le taisait.
update public.exercises set name = 'Vélo ou vélo d''appartement' where id = 'ex_ch_velo';
