-- 0067_adv_gear.sql — ÉQUIPEMENT DES AVENTURIERS : stock et forge de l'Équipementier.
-- Additive : null = aucun équipement (tous les comptes d'avant).
alter table public.characters add column if not exists adv_gear jsonb;
