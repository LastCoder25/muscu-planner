-- 0123 — RELEVÉS DE GENOUX (demandé : « les montées de genoux, un peu plus faciles que les jambes
-- tendues, et leur version tenue »). Jusqu'ici seul « Relevé de genoux tenu (suspendu) » existait
-- (0120), sans sa version en répétitions ni de version au sol. 3 exos d'abdominaux :
--   ex_knee_raise_floor       Relevé de genoux au sol (reps, difficulté 1, aucun matériel)
--   ex_knee_raise_floor_hold  Genoux levés tenus au sol (temps, difficulté 1, aucun matériel)
--   ex_knee_raise_hanging     Relevé de genoux suspendu (reps, difficulté 2, barre de traction)
-- Sans muscle secondaire (comme les autres exos d'abdos : le poids de rep ne gonfle pas l'XP). Tag
-- `variante` : écartés des PROGRAMMES GÉNÉRÉS (choix manuels : Défi 360, défis, séance libre).
-- Additif et rejouable (`on conflict do nothing`).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_knee_raise_floor', 'Relevé de genoux au sol', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, 'musculation', '{variante}'),
  ('ex_knee_raise_floor_hold', 'Genoux levés tenus (au sol)', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_knee_raise_hanging', 'Relevé de genoux (suspendu)', 'abdominaux', '{}', 'poids_du_corps', '{pullup_bar}', 2, 'reps', false, 'musculation', '{variante}')
on conflict (id) do nothing;
