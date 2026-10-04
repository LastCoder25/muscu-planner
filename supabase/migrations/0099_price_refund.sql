-- 💰 Remboursement de la baisse des prix (v1.51) : version déjà versée par compte.
-- Les comptes EXISTANTS partent à 0 (remboursement dû au prochain chargement) ; un compte
-- créé APRÈS naît à 1 (il n'a jamais payé l'ancien prix).
alter table public.characters add column if not exists price_refund smallint not null default 0;
alter table public.characters alter column price_refund set default 1;
