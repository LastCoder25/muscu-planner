-- 0023_challenge_marche_course.sql — challenge cardio combiné « Marche ou course ».
-- Une seule piste marche+course : une sortie course compte aussi, plus de doublon.
-- Remplace les défis séparés « Marche » / « Course » côté sélecteur (front) ;
-- les anciens id restent en base pour résoudre le nom des défis existants.
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, category, tags, payload)
values
  ('ex_ch_marche_course', 'Marche ou course', 'cardio', '{}', 'poids_du_corps', '{}', 1, 'time', false, true, 'musculation', '{cardio}', '{}')
on conflict (id) do nothing;
