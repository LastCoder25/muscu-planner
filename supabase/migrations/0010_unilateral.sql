-- 0010_unilateral.sql — exercices unilatéraux (travaillés un côté à la fois).
-- Une « série » se fait des deux côtés → durée comptée ×2, affichage « / côté ».
alter table public.exercises add column if not exists unilateral boolean not null default false;

update public.exercises set unilateral = true
where id in ('ex_bw_lunge', 'ex_row_dumbbell', 'ex_kb_row');
