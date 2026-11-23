-- 0120 — TENUES DE CONTRACTION (demandé : « pouvoir faire des tenues de contraction, par exemple
-- une tenue des biceps aux haltères ou à la barre Z, des jambes tendues, des relevés de genoux… »,
-- comme le pont fessier tenu de la 0119). 13 exos au TEMPS (`unit = 'time'`), chacun rangé dans
-- l'emplacement du Défi 360 de son muscle PRINCIPAL :
--   biceps → Biceps · épaules et mollets → Épaules · pectoraux → Poussée · dos → Tirage ·
--   quadriceps → Squat · ischio-jambiers → Charnière · abdominaux → Gainage.
-- Pas de muscle secondaire (comme la planche et la chaise) : le poids de rep se déduit du nombre de
-- muscles, une tenue ne doit pas rapporter plus d'XP. Le tag `variante` les écarte des PROGRAMMES
-- GÉNÉRÉS (choix manuels : Défi 360, défis, séance libre, changement d'exercice). Additif et
-- rejouable (`on conflict do nothing`).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_curl_hold', 'Curl biceps tenu à 90° (haltères)', 'biceps', '{}', 'halteres', '{dumbbells}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_curl_ez_hold', 'Curl biceps tenu à 90° (barre Z)', 'biceps', '{}', 'barre', '{ez_bar}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_lateral_raise_hold', 'Élévation latérale tenue', 'épaules', '{}', 'halteres', '{dumbbells}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_squat_hold', 'Squat tenu en bas', 'quadriceps', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_farmer_hold', 'Tenue de charge (farmer)', 'dos', '{}', 'halteres', '{dumbbells}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_knee_raise_hold', 'Relevé de genoux tenu (suspendu)', 'abdominaux', '{}', 'poids_du_corps', '{pullup_bar}', 2, 'time', false, 'musculation', '{variante}'),
  ('ex_leg_raise_hold', 'Jambes tendues tenues (au sol)', 'abdominaux', '{}', 'poids_du_corps', '{}', 2, 'time', false, 'musculation', '{variante}'),
  ('ex_hollow_hold', 'Gainage creux (hollow hold)', 'abdominaux', '{}', 'poids_du_corps', '{}', 2, 'time', false, 'musculation', '{variante}'),
  ('ex_pushup_hold', 'Pompes tenues en bas', 'pectoraux', '{}', 'poids_du_corps', '{}', 2, 'time', false, 'musculation', '{variante}'),
  ('ex_chinup_hold', 'Tenue de traction (menton au-dessus de la barre)', 'dos', '{}', 'poids_du_corps', '{pullup_bar}', 3, 'time', false, 'musculation', '{variante}'),
  ('ex_dead_hang', 'Suspension à la barre (dead hang)', 'dos', '{}', 'poids_du_corps', '{pullup_bar}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_calf_raise_hold', 'Mollets tenus sur la pointe', 'mollets', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_glute_bridge_single_hold', 'Pont fessier à une jambe (tenue)', 'ischio-jambiers', '{}', 'poids_du_corps', '{}', 2, 'time', true, 'musculation', '{variante}')
on conflict (id) do nothing;
