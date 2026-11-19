-- 0119 — DEUX NOUVEAUX EXOS AU TEMPS : un gainage pour les FESSIERS et un pour le DOS
-- (demandé : « sur les exos de gainage, préciser quel type de gainage c'est : abdos, fessier,
-- quadri… » puis « oui » à « ajouter des exos de gainage pour les fessiers et le dos »).
-- Jusqu'ici les exos au temps de la musculation visaient les abdos (planche, planche latérale) et les
-- quadriceps (chaise). Ils se rangent dans les emplacements du Défi 360 par leur muscle PRINCIPAL :
--   · Pont fessier (tenue) → 'ischio-jambiers' (l'emplacement Charnière, comme le pont fessier) ;
--   · Superman             → 'dos' (l'emplacement Tirage).
-- Pas de muscle secondaire : comme la planche et la chaise, pour que l'XP d'une tenue ne grimpe pas
-- (le poids de rep se déduit du nombre de muscles). Le tag `variante` les écarte des PROGRAMMES
-- GÉNÉRÉS (choix manuels : Défi 360, séance libre, changement d'exercice) — les programmes existants
-- ne bougent pas. Additif et rejouable (`on conflict do nothing`).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_glute_bridge_hold', 'Pont fessier (tenue)', 'ischio-jambiers', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_superman_hold', 'Superman (gainage dorsal)', 'dos', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}')
on conflict (id) do nothing;
