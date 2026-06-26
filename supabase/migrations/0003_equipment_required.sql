-- 0003_equipment_required.sql
-- Matériel détaillé : chaque exo requiert un ENSEMBLE de matériel (atomes).
-- Atomes : barbell, rack, bench, dumbbells, kettlebell, bands, cable, machine,
-- pullup_bar, dip_station (poids du corps = ensemble vide, toujours dispo).
-- + enrichissement de la bibliothèque (kettlebell, élastiques, poids du corps).

alter table public.exercises
  add column if not exists equipment_required text[] not null default '{}';

-- Re-tag des exercices existants ------------------------------------------------
update public.exercises set equipment_required = '{barbell,bench}'  where id = 'ex_bench_barbell';
update public.exercises set equipment_required = '{dumbbells,bench}' where id = 'ex_bench_dumbbell';
update public.exercises set equipment_required = '{dumbbells,bench}' where id = 'ex_incline_dumbbell';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_incline_machine';
update public.exercises set equipment_required = '{cable}'          where id = 'ex_chest_fly_cable';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_pec_deck';
update public.exercises set equipment_required = '{dip_station}'    where id = 'ex_dips';
update public.exercises set equipment_required = '{}'               where id = 'ex_pushup';
update public.exercises set equipment_required = '{barbell}'        where id = 'ex_ohp_barbell';
update public.exercises set equipment_required = '{dumbbells}'      where id = 'ex_shoulder_press_db';
update public.exercises set equipment_required = '{dumbbells}'      where id = 'ex_lateral_raise';
update public.exercises set equipment_required = '{cable}'          where id = 'ex_face_pull';
update public.exercises set equipment_required = '{cable}'          where id = 'ex_triceps_pushdown';
update public.exercises set equipment_required = '{barbell,bench}'  where id = 'ex_skullcrusher';
update public.exercises set equipment_required = '{pullup_bar}'     where id = 'ex_pullup';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_lat_pulldown';
update public.exercises set equipment_required = '{barbell}'        where id = 'ex_row_barbell';
update public.exercises set equipment_required = '{dumbbells}'      where id = 'ex_row_dumbbell';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_seated_row';
update public.exercises set equipment_required = '{barbell}'        where id = 'ex_curl_barbell';
update public.exercises set equipment_required = '{dumbbells}'      where id = 'ex_curl_dumbbell';
update public.exercises set equipment_required = '{barbell,rack}'   where id = 'ex_squat_barbell';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_leg_press';
update public.exercises set equipment_required = '{barbell}'        where id = 'ex_romanian_deadlift';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_leg_curl';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_leg_extension';
update public.exercises set equipment_required = '{machine}'        where id = 'ex_calf_raise';
update public.exercises set equipment_required = '{}'               where id = 'ex_plank';
update public.exercises set equipment_required = '{pullup_bar}'     where id = 'ex_hanging_leg_raise';

-- Nouveaux exercices ------------------------------------------------------------
insert into public.exercises (id, name, muscle_primary, muscle_secondary, equipment, payload, equipment_required) values
-- Kettlebell
('ex_kb_goblet_squat','Goblet squat (kettlebell)','quadriceps','{fessiers}','kettlebell','{}','{kettlebell}'),
('ex_kb_swing','Kettlebell swing','ischio-jambiers','{fessiers,dos}','kettlebell','{}','{kettlebell}'),
('ex_kb_press','Développé kettlebell','épaules','{triceps}','kettlebell','{}','{kettlebell}'),
('ex_kb_row','Rowing kettlebell','dos','{biceps}','kettlebell','{}','{kettlebell}'),
-- Élastiques
('ex_band_squat','Squat élastique','quadriceps','{fessiers}','élastique','{}','{bands}'),
('ex_band_row','Rowing élastique','dos','{biceps}','élastique','{}','{bands}'),
('ex_band_pull_apart','Écarté élastique','épaules','{dos}','élastique','{}','{bands}'),
('ex_band_curl','Curl élastique','biceps','{}','élastique','{}','{bands}'),
('ex_band_pushdown','Extension triceps élastique','triceps','{}','élastique','{}','{bands}'),
-- Poids du corps
('ex_bw_squat','Squat poids du corps','quadriceps','{fessiers}','poids_du_corps','{}','{}'),
('ex_bw_lunge','Fentes','quadriceps','{fessiers,"ischio-jambiers"}','poids_du_corps','{}','{}'),
('ex_glute_bridge','Pont fessier','ischio-jambiers','{fessiers}','poids_du_corps','{}','{}'),
('ex_pike_pushup','Pompes piquées','épaules','{triceps}','poids_du_corps','{}','{}'),
('ex_diamond_pushup','Pompes diamant','triceps','{pectoraux}','poids_du_corps','{}','{}'),
('ex_superman','Superman (lombaires)','dos','{fessiers}','poids_du_corps','{}','{}'),
('ex_calf_raise_bw','Mollets debout (poids du corps)','mollets','{}','poids_du_corps','{}','{}')
on conflict (id) do nothing;
