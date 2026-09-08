-- 0060 — DÉFENSE DE LA BASE (sièges).
--
-- Additif, comme toutes les migrations du projet. Deux colonnes seulement :
--
--  • `base` (jsonb) porte TOUT l'état du système (structures de l'enceinte, siège en
--    approche, champ de bataille, gel de production, dernier rapport). Un seul jsonb
--    plutôt qu'une table par concept : l'état est entièrement dérivé de timestamps et
--    de graines, il n'est jamais requêté transversalement, et il suit exactement le
--    modèle déjà en place pour `expedition` / `expedition_map` / `messages` (migr. 0044).
--
--  • `scrap` (int) = la FERRAILLE 🔩, qui répare l'enceinte. Colonne à part et non clé du
--    jsonb, parce que c'est une devise comme les autres (or, clés, pierres) : elle se
--    crédite depuis les expéditions et se lit dans la topbar au même titre.
--
-- Aucune policy à ajouter : `characters` est déjà en RLS own-only.

alter table public.characters
  add column if not exists base jsonb,
  add column if not exists scrap integer not null default 0;

comment on column public.characters.base is
  'Défense de la base : enceinte, siège en approche, champ de bataille, gel de production.';
comment on column public.characters.scrap is
  'Ferraille 🔩 — répare les structures de l''enceinte. Provient des épaves de la carte.';
