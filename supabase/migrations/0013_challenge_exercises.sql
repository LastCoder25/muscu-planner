-- 0013_challenge_exercises.sql — exos « challenge » (poids du corps, faciles/cardio).
-- Flag challenge_only : disponibles pour les défis mais exclus du générateur de programme.
alter table public.exercises add column if not exists challenge_only boolean not null default false;

insert into public.exercises (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, payload) values
  ('ex_jump_rope', 'Corde à sauter', 'mollets', '{}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}'),
  ('ex_burpees', 'Burpees', 'quadriceps', '{pectoraux,abdominaux}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}'),
  ('ex_jumping_jacks', 'Jumping jacks', 'quadriceps', '{épaules}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}'),
  ('ex_mountain_climbers', 'Mountain climbers', 'abdominaux', '{quadriceps}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}'),
  ('ex_high_knees', 'Montées de genoux', 'quadriceps', '{abdominaux}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}'),
  ('ex_squat_jump', 'Squats sautés', 'quadriceps', '{mollets}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}'),
  ('ex_wall_sit', 'Chaise (wall sit)', 'quadriceps', '{}', 'poids_du_corps', '{}', 1, 'time', false, true, '{}'),
  ('ex_crunch', 'Crunch', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, true, '{}')
on conflict (id) do nothing;
