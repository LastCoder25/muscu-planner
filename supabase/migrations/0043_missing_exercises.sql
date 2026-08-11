-- 0043 — Exos manquants (audit biblio) + « tirage corde » rendu trouvable.
-- Renomme l'extension triceps à la poulie pour inclure « corde » (terme courant
-- que cherchent les débutants ; « poulie » seul était peu reconnaissable).
update public.exercises
  set name = 'Extension triceps à la poulie (corde)'
  where id = 'ex_triceps_pushdown';

-- Nouveaux exos classiques absents de la biblio (biceps/triceps/épaules/mollets/dos).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty)
values
  ('ex_hammer_curl', 'Curl marteau', 'biceps', '{avant_bras}', 'halteres', '{dumbbells}', 1),
  ('ex_overhead_triceps', 'Extension triceps au-dessus de la tête', 'triceps', '{}', 'halteres', '{dumbbells}', 1),
  ('ex_triceps_kickback', 'Kickback triceps', 'triceps', '{}', 'halteres', '{dumbbells}', 1),
  ('ex_front_raise', 'Élévations frontales', 'épaules', '{}', 'halteres', '{dumbbells}', 1),
  ('ex_rear_delt_fly', 'Oiseau (deltoïde postérieur)', 'épaules', '{dos}', 'halteres', '{dumbbells}', 1),
  ('ex_seated_calf', 'Mollets assis', 'mollets', '{}', 'machine', '{machine}', 1),
  ('ex_deadlift', 'Soulevé de terre', 'dos', '{"ischio-jambiers",fessiers,lombaires}', 'barre', '{barbell}', 2)
on conflict (id) do nothing;
