-- 0121 — VARIANTES DE PLANCHE (demandé : « pour augmenter la difficulté, on éloigne les coudes de la
-- tête, au-dessus de la tête ; il y a aussi des planches sur les mains, et plus on éloigne les
-- mains, plus c'est dur — intègre ces variations »). 6 exos au TEMPS (`unit = 'time'`), tous rangés
-- dans l'emplacement Gainage du Défi 360 (muscle principal : abdominaux), dans la famille
-- « gainage » (`EXERCISE_VARIANT_FAMILIES`) : jamais deux versions de la planche dans un même défi.
--   ex_plank_knees      Planche sur les genoux (version facile)
--   ex_plank_high       Planche haute, sur les mains (bras tendus, mains sous les épaules)
--   ex_plank_feet       Planche pieds surélevés (sur un banc)
--   ex_plank_long       Planche coudes avancés (coudes devant la tête : levier plus long)
--   ex_plank_high_long  Planche haute, mains avancées (le cran le plus dur)
--   ex_plank_side_hand  Planche latérale sur la main (bras tendu, unilatérale)
-- Pas de muscle secondaire (comme la planche) : une tenue ne doit pas rapporter plus d'XP. Le tag
-- `variante` les écarte des PROGRAMMES GÉNÉRÉS (choix manuels : Défi 360, défis, séance libre).
-- Additif et rejouable (`on conflict do nothing`).
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, category, tags)
values
  ('ex_plank_knees', 'Planche sur les genoux', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_plank_high', 'Planche haute (sur les mains)', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'time', false, 'musculation', '{variante}'),
  ('ex_plank_feet', 'Planche pieds surélevés', 'abdominaux', '{}', 'poids_du_corps', '{bench}', 2, 'time', false, 'musculation', '{variante}'),
  ('ex_plank_long', 'Planche coudes avancés', 'abdominaux', '{}', 'poids_du_corps', '{}', 2, 'time', false, 'musculation', '{variante}'),
  ('ex_plank_high_long', 'Planche haute mains avancées', 'abdominaux', '{}', 'poids_du_corps', '{}', 3, 'time', false, 'musculation', '{variante}'),
  ('ex_plank_side_hand', 'Planche latérale sur la main', 'abdominaux', '{}', 'poids_du_corps', '{}', 2, 'time', true, 'musculation', '{variante}')
on conflict (id) do nothing;
