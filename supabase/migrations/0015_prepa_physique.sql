-- 0015_prepa_physique.sql — prépa physique (tennis & co).
-- Ajoute une CATÉGORIE d'exercice ('musculation' défaut | 'prepa_physique') et
-- des TAGS libres (agilite, pliometrie, rotation, deplacement, tennis…). Les
-- exos de prépa sont exclus du générateur muscu (comme challenge_only) et servent
-- au générateur de séance de prépa physique (src/lib/prepaBuilder.ts).

alter table public.exercises
  add column if not exists category text not null default 'musculation'
  check (category in ('musculation', 'prepa_physique'));

alter table public.exercises
  add column if not exists tags text[] not null default '{}';

-- Bloc « activation / mobilité »
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, category, tags, payload) values
  ('ex_pp_arm_circles', 'Cercles de bras', 'épaules', '{}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,activation,mobilite}', '{"notes":"Activation des épaules avant de jouer : petits puis grands cercles, dans les deux sens."}'),
  ('ex_pp_leg_swings', 'Balancements de jambe', 'ischio-jambiers', '{quadriceps}', 'poids_du_corps', '{}', 1, 'time', true, false, 'prepa_physique', '{tennis,activation,mobilite}', '{"notes":"Balance la jambe d''avant en arrière puis latéralement, appui sur le grillage/mur. Un côté à la fois."}'),
  -- Bloc « pliométrie / puissance »
  ('ex_pp_squat_jump', 'Squats sautés', 'quadriceps', '{mollets}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,pliometrie,puissance}', '{"notes":"Descends en squat, saute le plus haut possible, réception amortie. Explosivité des appuis."}'),
  ('ex_pp_lateral_bound', 'Bonds latéraux (skater)', 'quadriceps', '{mollets,ischio-jambiers}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,pliometrie,deplacement}', '{"notes":"Bonds d''un pied sur l''autre latéralement, comme un patineur. Reproduit l''appui de refente en tennis."}'),
  ('ex_pp_broad_jump', 'Saut en longueur (sans élan)', 'quadriceps', '{ischio-jambiers,mollets}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,pliometrie,puissance}', '{"notes":"Saute vers l''avant à deux pieds, bras balancés, réception stable. Puissance horizontale."}'),
  ('ex_pp_medball_slam', 'Med-ball slam', 'abdominaux', '{dos,épaules}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,puissance,rotation}', '{"notes":"Med-ball (ou balle lestée) au-dessus de la tête, projette-la au sol de toutes tes forces. Gainage explosif."}'),
  ('ex_pp_medball_rot_throw', 'Lancer rotatif med-ball (mur)', 'abdominaux', '{épaules,dos}', 'poids_du_corps', '{}', 2, 'reps', true, false, 'prepa_physique', '{tennis,rotation,puissance}', '{"notes":"De profil face à un mur, lance la med-ball en pivotant les hanches — le geste du coup droit/revers. Un côté à la fois."}'),
  -- Bloc « agilité / déplacement »
  ('ex_pp_side_shuffle', 'Pas chassés latéraux', 'quadriceps', '{mollets}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,agilite,deplacement}', '{"notes":"Déplacements latéraux en pas chassés, buste bas, ne croise pas les pieds. Sur une largeur de couloir."}'),
  ('ex_pp_ladder_run', 'Échelle d''agilité (appuis)', 'mollets', '{quadriceps}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,agilite,deplacement}', '{"notes":"Appuis rapides dans l''échelle (ou lignes tracées) : un/deux appuis par case. Fréquence des pieds."}'),
  ('ex_pp_split_step', 'Split-step + sprint 3 appuis', 'quadriceps', '{mollets}', 'poids_du_corps', '{}', 1, 'reps', false, false, 'prepa_physique', '{tennis,agilite,deplacement}', '{"notes":"Petit sursaut d''armement (split-step) puis 3 appuis explosifs vers un côté. Réaction et démarrage."}'),
  ('ex_pp_cone_sprint', 'Sprints en étoile (cônes)', 'quadriceps', '{ischio-jambiers,mollets}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,agilite,deplacement}', '{"notes":"Depuis le centre, sprinte toucher un cône puis reviens ; enchaîne les directions. Changements d''appui."}'),
  -- Bloc « gainage / anti-rotation »
  ('ex_pp_russian_twist', 'Russian twist', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, false, 'prepa_physique', '{tennis,rotation,gainage}', '{"notes":"Assis, buste incliné, pieds décollés, fais passer les mains (ou une charge) d''un côté à l''autre."}'),
  ('ex_pp_side_plank', 'Gainage latéral', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'time', true, false, 'prepa_physique', '{tennis,gainage,stabilite}', '{"notes":"Gainage sur le côté, corps aligné, hanches hautes. Stabilise le tronc. Un côté à la fois."}'),
  ('ex_pp_bird_dog', 'Bird-dog', 'dos', '{abdominaux}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,gainage,stabilite}', '{"notes":"À quatre pattes, tends bras et jambe opposés, dos neutre. Stabilité et coordination croisée."}'),
  ('ex_pp_pallof_press', 'Pallof press (anti-rotation)', 'abdominaux', '{épaules}', 'bands', '{bands}', 2, 'time', true, false, 'prepa_physique', '{tennis,rotation,gainage}', '{"notes":"Élastique fixé sur le côté, pousse les bras devant toi sans laisser le tronc tourner. Anti-rotation."}'),
  -- Bloc « force / équilibre spécifique »
  ('ex_pp_single_leg_rdl', 'Soulevé de terre unijambe', 'ischio-jambiers', '{dos,quadriceps}', 'poids_du_corps', '{}', 2, 'reps', true, false, 'prepa_physique', '{tennis,force,equilibre}', '{"notes":"Sur une jambe, penche le buste en tendant l''autre jambe derrière, dos droit. Équilibre et chaîne postérieure. Charge optionnelle (haltère)."}')
on conflict (id) do nothing;
