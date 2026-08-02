-- 0019_cardio_activities.sql — élargit le cardio à plusieurs ACTIVITÉS
-- (marche, rando, course, trail, vélo, vélo d'appartement, marche/course sur tapis)
-- et renomme run_type → activity. La structure de séance (phases composables) vit
-- dans le payload jsonb (pas de colonne dédiée).

alter table public.cardio_logs drop constraint if exists cardio_logs_run_type_check;
alter table public.cardio_logs rename column run_type to activity;

-- Remappe les anciens types de course (Phase A) vers l'activité 'course' / 'trail'.
update public.cardio_logs
  set activity = 'course'
  where activity in ('footing', 'fractionne', 'tempo', 'sortie_longue', 'recup');

alter table public.cardio_logs
  add constraint cardio_logs_activity_check check (activity in
    ('marche', 'rando', 'course', 'trail', 'velo', 'velo_appart', 'marche_tapis', 'course_tapis'));

alter table public.cardio_logs alter column activity set default 'course';
