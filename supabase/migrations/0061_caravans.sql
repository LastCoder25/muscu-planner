-- 0061 — CARAVANES & AVENTURIERS.
--
-- Additif, comme toutes les migrations du projet. Deux colonnes, et rien d'autre :
--
--  • `adventurers` (jsonb) = le vivier du joueur. Chaque aventurier porte son CHEMIN de
--    classes, son niveau, son XP, et ses horodatages d'occupation/convalescence. Sa
--    RARETÉ et son RANG ne sont PAS stockés : ils se déduisent du chemin et du niveau
--    (cf. `advRarity` / `advRank`), donc ils ne peuvent pas mentir ni dériver.
--
--  • `caravans` (jsonb) = les convois en cours ET ceux dont la cargaison attend d'être
--    récupérée. Chaque convoi embarque une COPIE du POI (le lieu étant retiré de la carte
--    au départ, comme pour le héros) et son `outcome` déjà résolu — le voyage est seedé
--    au départ, donc déterministe et hors-ligne, comme tout le reste du jeu.
--
-- Un seul jsonb par concept plutôt qu'une table : ces états sont entièrement dérivés de
-- timestamps et de graines, ne sont jamais requêtés transversalement, et suivent le
-- modèle déjà en place pour `expedition` / `expedition_map` / `messages` (migr. 0044) et
-- `base` (migr. 0060).
--
-- ⚠️ Aucune devise nouvelle : une caravane paie en or, énergie, pierres d'invocation,
-- ferraille et clés — toutes déjà en colonnes. C'est délibéré (le projet s'est déjà
-- retrouvé à payer en monnaie morte), et c'est ce qui garantit que « le sport est le
-- plafond » : une caravane ne rapporte JAMAIS d'équipement.
--
-- Aucune policy à ajouter : `characters` est déjà en RLS own-only.

alter table public.characters
  add column if not exists adventurers jsonb,
  add column if not exists caravans jsonb;
