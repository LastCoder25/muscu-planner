-- 0042 — « Pompes sur les genoux » : variante facile de la pompe (débutants).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty)
values
  ('ex_pushup_knees', 'Pompes sur les genoux', 'pectoraux', '{triceps}', 'poids_du_corps', '{}', 1)
on conflict (id) do nothing;
