-- 0020_cardio_challenges.sql — exercices cardio pour les CHALLENGES.
-- Marche, course, vélo : défis « par durée OU par km » (l'unité est choisie à la
-- création et stockée sur le défi ; challenges.unit est du texte libre, pas de
-- contrainte). Tagués 'cardio' → le wizard propose le choix km/durée.
-- challenge_only = exclus du générateur de programme muscu.

insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, category, tags, payload)
values
  ('ex_ch_marche', 'Marche', 'cardio', '{}', 'poids_du_corps', '{}', 1, 'time', false, true, 'musculation', '{cardio}', '{}'),
  ('ex_ch_course', 'Course', 'cardio', '{}', 'poids_du_corps', '{}', 1, 'time', false, true, 'musculation', '{cardio}', '{}'),
  ('ex_ch_velo', 'Vélo', 'cardio', '{}', 'poids_du_corps', '{}', 1, 'time', false, true, 'musculation', '{cardio}', '{}')
on conflict (id) do nothing;
