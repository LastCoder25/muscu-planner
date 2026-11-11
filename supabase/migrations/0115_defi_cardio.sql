-- 0115_defi_cardio.sql — défi solo « Cardio » : TOUTES les sorties cardio pur
-- (marche, rando, course, trail, vélo, vélo d'appart, tapis) nourrissent un seul défi,
-- en DURÉE (minutes) uniquement : le km n'est pas comparable d'une activité à l'autre.
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, category, tags, payload)
values
  ('ex_ch_cardio', 'Cardio (toutes activités)', 'cardio', '{}', 'poids_du_corps', '{}', 1, 'time', false, true, 'musculation', '{cardio}', '{}')
on conflict (id) do nothing;
