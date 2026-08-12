-- 0046 — Bâtiments / filons de production passive (village autour de la ville).
--
-- Le joueur construit des filons (poussière/pierres) sur des emplacements autour de
-- la ville, financés par l'OR (puits d'or). Production passive plafonnée par le
-- niveau de sport + stockage. Stocké en JSONB (liste de {typeId, level, slot,
-- collectedAt}), comme expedition_map. Socle extensible (autres bâtiments plus tard).

alter table characters
  add column if not exists buildings jsonb not null default '[]'::jsonb;

comment on column characters.buildings is
  'Filons/bâtiments posés : [{typeId, level, slot, collectedAt}] (production passive or→poussière/pierres).';
