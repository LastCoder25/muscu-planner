-- 0116 — TRACTIONS EN SUPINATION, VERSION BICEPS (demandé : « la version pour biceps »).
-- `ex_chinup` (0112) est rangé sous le DOS : il n'apparaît que dans l'emplacement « Tirage » du Défi 360.
-- Cette variante est la MÊME traction (prise serrée, descente lente) mais classée sous les BICEPS : elle
-- devient un choix de l'emplacement « Biceps » du 360 et des challenges biceps. Additif, tag `variante`
-- (jamais piochée par les programmes générés), même famille de mouvement que les tractions côté client.
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_chinup_biceps', 'Tractions supination serrées (biceps)', 'biceps', '{dos,avant_bras}', 'poids_du_corps', '{pullup_bar}', 3, 'reps', false, 'musculation', '{variante}')
on conflict (id) do nothing;
