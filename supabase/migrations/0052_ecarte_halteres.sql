-- 0052 — Ajoute l'ÉCARTÉ HALTÈRES (dumbbell fly), exo pectoraux d'isolation manquant
-- (on avait l'écarté poulie et le pec deck, mais pas la version haltères — bras semi-
-- tendus, on descend des deux côtés puis on referme). Global (owner null).
insert into exercises
  (id, owner, name, muscle_primary, muscle_secondary, equipment, equipment_required,
   difficulty, unit, unilateral, challenge_only, category, payload, tags)
values
  ('ex_chest_fly_dumbbell', null, 'Écarté haltères', 'pectoraux', '{}',
   'halteres', '{dumbbells,bench}', 2, 'reps', false, false, 'musculation',
   '{"alternatives":["ex_chest_fly_cable","ex_pec_deck","ex_bench_dumbbell"]}'::jsonb, '{}')
on conflict (id) do nothing;
