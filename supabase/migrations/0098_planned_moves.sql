-- ⏳ RENFORTS PROGRAMMÉS (demandé : « programmer un renfort ou un déplacement, en choisissant
-- dans combien de temps il part »). Les départs en attente vers un lieu fixe : champions et
-- miliciens de la base, membres d'autres lieux tenus. À l'heure dite ils partent comme un
-- renfort ordinaire et quittent cette colonne. Additif.
alter table public.characters add column if not exists planned_moves jsonb;
