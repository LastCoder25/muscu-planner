-- 0004_difficulty_assisted.sql
-- Niveau de difficulté par exercice (1=accessible débutant, 2=intermédiaire,
-- 3=avancé) + variantes assistées élastique pour les mouvements durs.

alter table public.exercises
  add column if not exists difficulty int not null default 1
  check (difficulty between 1 and 3);

-- Exos difficiles (3) : infaisables pour un débutant sans assistance.
update public.exercises set difficulty = 3 where id in ('ex_pullup', 'ex_dips');

-- Exos modérés (2).
update public.exercises set difficulty = 2 where id in (
  'ex_bench_barbell', 'ex_ohp_barbell', 'ex_squat_barbell', 'ex_romanian_deadlift',
  'ex_row_barbell', 'ex_skullcrusher', 'ex_hanging_leg_raise',
  'ex_pike_pushup', 'ex_diamond_pushup', 'ex_kb_swing'
);

-- Variantes assistées (accessibles débutant).
insert into public.exercises (id, name, muscle_primary, muscle_secondary, equipment, payload, equipment_required, difficulty) values
('ex_pullup_assisted','Tractions assistées (élastique)','dos','{biceps}','élastique','{"alternatives":["ex_lat_pulldown","ex_band_row"]}','{pullup_bar,bands}',1),
('ex_dips_assisted','Dips assistés (élastique)','pectoraux','{triceps}','élastique','{"alternatives":["ex_pushup"]}','{dip_station,bands}',1)
on conflict (id) do nothing;
