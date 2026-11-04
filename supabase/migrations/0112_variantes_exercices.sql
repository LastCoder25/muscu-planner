-- 0112 — VARIANTES D'EXERCICES (demandé : « regarder s'il existe des variantes à des exercices »,
-- comme les pompes sur les genoux ou en diamant). 29 variantes connues, chacune un VRAI exercice,
-- rangée dans la famille de son mouvement côté client (`EXERCISE_VARIANT_FAMILIES`).
-- Additif : aucune colonne nouvelle. Le tag `variante` les écarte des PROGRAMMES GÉNÉRÉS (ils restent
-- des choix manuels : Défi 360, séance libre, changement d'exercice) — les programmes existants ne bougent pas.
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_pushup_incline', 'Pompes inclinées', 'pectoraux', '{triceps,"épaules"}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_pushup_decline', 'Pompes déclinées', 'pectoraux', '{triceps,"épaules"}', 'poids_du_corps', '{}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_pushup_wide', 'Pompes larges', 'pectoraux', '{triceps,"épaules"}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_pushup_archer', 'Pompes archer', 'pectoraux', '{triceps,"épaules"}', 'poids_du_corps', '{}', 3, 'reps', true, 'musculation', '{variante}'),
  ('ex_dips_bench', 'Dips sur banc', 'triceps', '{pectoraux,"épaules"}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_squat_bulgarian', 'Squat bulgare', 'quadriceps', '{fessiers,"ischio-jambiers"}', 'poids_du_corps', '{}', 2, 'reps', true, 'musculation', '{variante}'),
  ('ex_squat_pistol_assisted', 'Pistol squat assisté', 'quadriceps', '{fessiers,"ischio-jambiers"}', 'poids_du_corps', '{}', 3, 'reps', true, 'musculation', '{variante}'),
  ('ex_squat_sumo', 'Squat sumo', 'quadriceps', '{fessiers,"ischio-jambiers"}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_lunge_reverse', 'Fentes arrière', 'quadriceps', '{fessiers,"ischio-jambiers"}', 'poids_du_corps', '{}', 1, 'reps', true, 'musculation', '{variante}'),
  ('ex_lunge_walking', 'Fentes marchées', 'quadriceps', '{fessiers,"ischio-jambiers"}', 'poids_du_corps', '{}', 2, 'reps', true, 'musculation', '{variante}'),
  ('ex_calf_raise_single', 'Mollets à une jambe', 'mollets', '{}', 'poids_du_corps', '{}', 1, 'reps', true, 'musculation', '{variante}'),
  ('ex_glute_bridge_single', 'Pont fessier à une jambe', 'ischio-jambiers', '{fessiers}', 'poids_du_corps', '{}', 2, 'reps', true, 'musculation', '{variante}'),
  ('ex_hip_thrust', 'Hip thrust', 'ischio-jambiers', '{fessiers}', 'poids_du_corps', '{bench}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_rdl_single', 'Soulevé de terre roumain à une jambe', 'ischio-jambiers', '{fessiers,dos}', 'halteres', '{dumbbells}', 2, 'reps', true, 'musculation', '{variante}'),
  ('ex_curl_concentration', 'Curl concentré', 'biceps', '{avant_bras}', 'halteres', '{dumbbells}', 1, 'reps', true, 'musculation', '{variante}'),
  ('ex_curl_incline', 'Curl incliné', 'biceps', '{avant_bras}', 'halteres', '{dumbbells,bench}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_curl_preacher_ez', 'Curl pupitre barre EZ', 'biceps', '{avant_bras}', 'barre', '{ez_bar,bench}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_arnold_press', 'Arnold press', 'épaules', '{triceps}', 'halteres', '{dumbbells}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_lateral_raise_band', 'Élévations latérales élastique', 'épaules', '{}', 'elastique', '{bands}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_row_bent_supinated', 'Rowing buste penché en supination', 'dos', '{biceps}', 'barre', '{barbell}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_upright_row', 'Tirage menton', 'épaules', '{biceps}', 'halteres', '{dumbbells}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_pullover_db', 'Pull-over haltère', 'dos', '{pectoraux,triceps}', 'halteres', '{dumbbells}', 2, 'reps', false, 'musculation', '{variante}'),
  ('ex_plank_side', 'Planche latérale', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'time', true, 'musculation', '{variante}'),
  ('ex_dead_bug', 'Dead bug', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_bicycle_crunch', 'Bicycle crunch', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_leg_raise_floor', 'Relevé de jambes au sol', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_chinup', 'Tractions en supination (chin-up)', 'dos', '{biceps}', 'poids_du_corps', '{pullup_bar}', 3, 'reps', false, 'musculation', '{variante}'),
  ('ex_pullup_neutral', 'Tractions prise neutre', 'dos', '{biceps}', 'poids_du_corps', '{pullup_bar}', 3, 'reps', false, 'musculation', '{variante}'),
  ('ex_pullup_wide', 'Tractions prise large', 'dos', '{biceps}', 'poids_du_corps', '{pullup_bar}', 3, 'reps', false, 'musculation', '{variante}')
on conflict (id) do nothing;
