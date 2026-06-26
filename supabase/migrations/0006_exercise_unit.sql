-- 0006_exercise_unit.sql — unité d'un exercice : reps (défaut) ou time (secondes).
-- Le gainage se mesure en temps, pas en répétitions.
alter table public.exercises
  add column if not exists unit text not null default 'reps'
  check (unit in ('reps', 'time'));

update public.exercises set unit = 'time' where id = 'ex_plank';
