-- seed.sql — bibliothèque d'exercices globale (owner null = visible par tous).
-- À coller dans Supabase → SQL Editor → Run, après 0001_init.sql.
-- Les slugs sont stables : ils relient l'historique et les templates.

insert into public.exercises (id, name, muscle_primary, muscle_secondary, equipment, payload) values
-- Pectoraux
('ex_bench_barbell','Développé couché','pectoraux','{triceps,"deltoïde antérieur"}','barre','{"alternatives":["ex_bench_dumbbell","ex_incline_machine"]}'),
('ex_bench_dumbbell','Développé couché haltères','pectoraux','{triceps}','halteres','{"alternatives":["ex_bench_barbell"]}'),
('ex_incline_dumbbell','Développé incliné haltères','pectoraux','{"deltoïde antérieur"}','halteres','{"alternatives":["ex_incline_machine"]}'),
('ex_incline_machine','Développé incliné machine','pectoraux','{}','machine','{"alternatives":["ex_incline_dumbbell"]}'),
('ex_chest_fly_cable','Écarté poulie vis-à-vis','pectoraux','{}','poulie','{"alternatives":["ex_pec_deck"]}'),
('ex_pec_deck','Pec deck','pectoraux','{}','machine','{}'),
('ex_dips','Dips','pectoraux','{triceps}','poids_du_corps','{"alternatives":["ex_pushup"]}'),
('ex_pushup','Pompes','pectoraux','{triceps}','poids_du_corps','{}'),
-- Épaules
('ex_ohp_barbell','Développé militaire barre','épaules','{triceps}','barre','{"alternatives":["ex_shoulder_press_db"]}'),
('ex_shoulder_press_db','Développé épaules haltères','épaules','{triceps}','halteres','{}'),
('ex_lateral_raise','Élévations latérales','épaules','{}','halteres','{}'),
('ex_face_pull','Face pull','épaules','{dos}','poulie','{}'),
-- Triceps
('ex_triceps_pushdown','Extension triceps poulie','triceps','{}','poulie','{}'),
('ex_skullcrusher','Barre au front','triceps','{}','barre','{}'),
-- Dos
('ex_pullup','Tractions','dos','{biceps}','poids_du_corps','{"alternatives":["ex_lat_pulldown"]}'),
('ex_lat_pulldown','Tirage vertical','dos','{biceps}','machine','{"alternatives":["ex_pullup"]}'),
('ex_row_barbell','Rowing barre','dos','{biceps}','barre','{"alternatives":["ex_row_dumbbell","ex_seated_row"]}'),
('ex_row_dumbbell','Rowing haltère','dos','{biceps}','halteres','{}'),
('ex_seated_row','Tirage horizontal','dos','{biceps}','machine','{}'),
-- Biceps
('ex_curl_barbell','Curl barre','biceps','{}','barre','{"alternatives":["ex_curl_dumbbell"]}'),
('ex_curl_dumbbell','Curl haltères','biceps','{}','halteres','{}'),
-- Jambes
('ex_squat_barbell','Squat barre','quadriceps','{fessiers,ischio-jambiers}','barre','{"alternatives":["ex_leg_press"]}'),
('ex_leg_press','Presse à cuisses','quadriceps','{fessiers}','machine','{}'),
('ex_romanian_deadlift','Soulevé de terre roumain','ischio-jambiers','{fessiers,dos}','barre','{}'),
('ex_leg_curl','Leg curl','ischio-jambiers','{}','machine','{}'),
('ex_leg_extension','Leg extension','quadriceps','{}','machine','{}'),
('ex_calf_raise','Mollets debout','mollets','{}','machine','{}'),
-- Gainage / abdos
('ex_plank','Gainage','abdominaux','{}','poids_du_corps','{}'),
('ex_hanging_leg_raise','Relevé de jambes suspendu','abdominaux','{}','poids_du_corps','{}')
on conflict (id) do nothing;
