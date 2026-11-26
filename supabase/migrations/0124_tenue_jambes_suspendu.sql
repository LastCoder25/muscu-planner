-- 0124 — TENUE JAMBES TENDUES SUSPENDU (demandé : « et le relevé de jambes tendu tenu ? »). Il existait
-- la tenue jambes tendues AU SOL (0120) et la tenue genoux suspendu (0120), pas la tenue jambes
-- tendues suspendu (équerre à la barre) : la plus difficile de la série. Un exo au TEMPS (`unit =
-- 'time'`), abdominaux, difficulté 3, barre de traction, sans muscle secondaire (comme les autres
-- tenues : une tenue ne rapporte pas plus d'XP). Tag `variante` : jamais dans un programme généré.
-- Additif et rejouable (`on conflict do nothing`).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_leg_raise_hang_hold', 'Jambes tendues tenues (suspendu)', 'abdominaux', '{}', 'poids_du_corps', '{pullup_bar}', 3, 'time', false, 'musculation', '{variante}')
on conflict (id) do nothing;
