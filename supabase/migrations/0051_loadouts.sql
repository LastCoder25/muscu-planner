-- 0051 — Loadouts : jusqu'à 3 « sets » d'équipement rangés (les 4 slots gear :
-- weapon/armor/accessory/relic ; le familier n'est PAS rangé). Ranger = déplace le
-- stuff équipé dans un slot de loadout (le joueur se retrouve nu), pour garder un
-- stuff en réserve pendant qu'on en teste un autre. Les objets rangés ne sont PAS
-- dans le sac (ils vivent dans loadouts) et n'affectent pas le combat.
alter table public.characters
  add column if not exists loadouts jsonb not null default '[]'::jsonb;
