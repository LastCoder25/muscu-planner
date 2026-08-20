-- 0054 — Système d'ENCHANT (façon Lineage 2) pour les objets. Deux ressources :
--   • enchant_scrolls  📜 : consommés à chaque TENTATIVE d'enchantement (+N).
--   • protections      🛡️ : consommées optionnellement pour éviter le retour à +0 sur échec.
-- L'ENCHANT lui-même vit dans le JSONB des objets (equipped/inventory) — pas de colonne.
-- Migration des objets existants (level → enchant équivalent) faite au chargement client.
alter table public.characters
  add column if not exists enchant_scrolls integer not null default 0,
  add column if not exists protections integer not null default 0;
