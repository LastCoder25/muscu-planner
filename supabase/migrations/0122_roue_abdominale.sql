-- 0122 — ROUE ABDOMINALE (demandé : « l'exercice pour les abdos avec la roue à poignées, sur les
-- genoux, qu'on fait rouler d'avant en arrière »). Nouvel atome de matériel `ab_wheel` (cochable au
-- profil, « Roue abdominale ») et 2 exos en répétitions, rangés dans l'emplacement Gainage du Défi 360 :
--   ex_ab_wheel_knees  Roue abdominale sur les genoux (difficulté 2)
--   ex_ab_wheel        Roue abdominale debout (difficulté 3, avancé)
-- Pas de muscle secondaire (comme les autres exos d'abdos) : le poids de rep ne gonfle pas l'XP. Tag
-- `variante` : écartés des PROGRAMMES GÉNÉRÉS (choix manuels : Défi 360, défis, séance libre).
-- Additif et rejouable (`on conflict do nothing`).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_ab_wheel_knees', 'Roue abdominale (sur les genoux)', 'abdominaux', '{}', 'poids_du_corps', '{ab_wheel}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_ab_wheel', 'Roue abdominale (debout)', 'abdominaux', '{}', 'poids_du_corps', '{ab_wheel}', 3, 'reps', false, 'musculation', '{variante}')
on conflict (id) do nothing;
