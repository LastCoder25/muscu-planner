-- 0011_glute_adductors.sql — machines manquantes (reconnues à l'import).
-- muscle_primary = approximation parmi nos 9 groupes (pas de catégorie fessiers/adducteurs).
insert into public.exercises (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unilateral, payload) values
  ('ex_glute_machine', 'Glute machine', 'ischio-jambiers', '{fessiers}', 'machine', '{machine}', 1, false, '{}'),
  ('ex_adductors', 'Adducteurs', 'quadriceps', '{}', 'machine', '{machine}', 1, false, '{}'),
  ('ex_abductors', 'Abducteurs', 'quadriceps', '{fessiers}', 'machine', '{machine}', 1, false, '{}')
on conflict (id) do nothing;
