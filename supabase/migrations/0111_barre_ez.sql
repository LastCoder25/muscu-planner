-- 0111 — BARRE EZ : nouveau matériel cochable au profil (atome `ez_bar`) et 4 exercices qui la
-- demandent (signalé : « je ne peux pas sélectionner la barre EZ »).
-- Additif : aucune colonne nouvelle. `equipment` (texte hérité) = « barre » comme la barre droite.
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty)
values
  ('ex_curl_ez', 'Curl barre EZ', 'biceps', '{avant_bras}', 'barre', '{ez_bar}', 1),
  ('ex_curl_reverse_ez', 'Curl inversé barre EZ', 'biceps', '{avant_bras}', 'barre', '{ez_bar}', 2),
  ('ex_skullcrusher_ez', 'Barre EZ au front', 'triceps', '{}', 'barre', '{ez_bar,bench}', 2),
  ('ex_close_bench_ez', 'Développé serré barre EZ', 'triceps', '{pectoraux,épaules}', 'barre', '{ez_bar,bench}', 2)
on conflict (id) do nothing;
