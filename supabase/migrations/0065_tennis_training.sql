-- 0065 — ENTRAÎNEMENT TENNIS EN SOLO (Défi 360 Tennis + challenges tennis).
-- Additif : aucune colonne nouvelle. Un exo tennis porte déjà `category='prepa_physique'`
-- + tag `tennis` ; on ajoute dans ses tags :
--   • son GROUPE du Défi 360 Tennis : `t360:explosivite|reactivite|rotation|gainage|jambes|prevention`
--   • ses LIEUX : `maison` et/ou `court` (les exos d'échauffement n'ont pas de groupe).
-- Et le matériel qui manquait (médecine-ball, plots, échelle), désormais cochable au profil.

-- ── Exos existants (0015) : groupe, lieux, matériel ──
update public.exercises set tags = '{tennis,activation,mobilite,maison,court}' where id = 'ex_pp_arm_circles';
update public.exercises set tags = '{tennis,activation,mobilite,maison,court}' where id = 'ex_pp_leg_swings';
update public.exercises set tags = '{tennis,pliometrie,puissance,t360:explosivite,maison,court}' where id = 'ex_pp_squat_jump';
update public.exercises set tags = '{tennis,pliometrie,deplacement,t360:explosivite,maison,court}' where id = 'ex_pp_lateral_bound';
update public.exercises set tags = '{tennis,pliometrie,puissance,t360:explosivite,court}' where id = 'ex_pp_broad_jump';
update public.exercises set tags = '{tennis,agilite,deplacement,t360:reactivite,maison,court}' where id = 'ex_pp_side_shuffle';
update public.exercises set tags = '{tennis,agilite,deplacement,t360:reactivite,court}' where id = 'ex_pp_split_step';
update public.exercises set tags = '{tennis,agilite,deplacement,t360:reactivite,court}', equipment_required = '{cones}' where id = 'ex_pp_cone_sprint';
update public.exercises set tags = '{tennis,agilite,deplacement,t360:reactivite,maison,court}', equipment_required = '{agility_ladder}' where id = 'ex_pp_ladder_run';
update public.exercises set tags = '{tennis,rotation,puissance,t360:rotation,maison,court}', equipment_required = '{medicine_ball}' where id = 'ex_pp_medball_rot_throw';
update public.exercises set tags = '{tennis,puissance,rotation,t360:rotation,maison,court}', equipment_required = '{medicine_ball}' where id = 'ex_pp_medball_slam';
update public.exercises set tags = '{tennis,rotation,gainage,t360:rotation,maison}' where id = 'ex_pp_russian_twist';
update public.exercises set tags = '{tennis,rotation,gainage,t360:gainage,maison,court}' where id = 'ex_pp_pallof_press';
update public.exercises set tags = '{tennis,gainage,stabilite,t360:gainage,maison,court}' where id = 'ex_pp_side_plank';
update public.exercises set tags = '{tennis,gainage,stabilite,t360:gainage,maison}' where id = 'ex_pp_bird_dog';
update public.exercises set tags = '{tennis,force,equilibre,t360:jambes,maison,court}' where id = 'ex_pp_single_leg_rdl';

-- ── Nouveaux exos (solo, avec ou sans matériel) ──
insert into public.exercises
  (id, name, muscle_primary, muscle_secondary, equipment, equipment_required, difficulty, unit, unilateral, challenge_only, category, tags, payload) values
  -- Explosivité
  ('ex_tn_tuck_jump', 'Sauts genoux-poitrine', 'quadriceps', '{fessiers,mollets}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,pliometrie,puissance,t360:explosivite,maison,court}', '{"notes":"Saute en ramenant les genoux vers la poitrine, réception souple et enchaîne. Qualité avant quantité."}'),
  ('ex_tn_single_leg_hop', 'Sauts sur une jambe', 'quadriceps', '{mollets,fessiers}', 'poids_du_corps', '{}', 2, 'reps', true, false, 'prepa_physique', '{tennis,pliometrie,equilibre,t360:explosivite,maison,court}', '{"notes":"Petits bonds avant/arrière sur un pied, genou dans l''axe. Prépare les appuis de frappe en déséquilibre."}'),
  ('ex_tn_box_jump', 'Sauts sur box', 'quadriceps', '{fessiers,mollets}', 'box', '{plyo_box}', 2, 'reps', false, false, 'prepa_physique', '{tennis,pliometrie,puissance,t360:explosivite,maison}', '{"notes":"Saute sur la box en arrivant accroupi et stable, redescends en marchant. Repos complet entre les séries."}'),
  -- Réactivité & appuis
  ('ex_tn_wall_ball_catch', 'Balle contre le mur (réaction)', 'épaules', '{avant-bras}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,agilite,reactivite,t360:reactivite,maison,court}', '{"notes":"Face à un mur à 2 m, lance une balle de tennis et rattrape-la au rebond, en changeant d''angle pour la rendre imprévisible."}'),
  ('ex_tn_line_hops', 'Sauts rapides par-dessus une ligne', 'mollets', '{quadriceps}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,agilite,deplacement,t360:reactivite,maison,court}', '{"notes":"Pieds joints, sauts courts et rapides de part et d''autre d''une ligne (latéral puis avant/arrière). Reste sur l''avant du pied."}'),
  ('ex_tn_spider_drill', 'Spider drill (5 points du court)', 'quadriceps', '{mollets,fessiers}', 'poids_du_corps', '{}', 2, 'reps', false, false, 'prepa_physique', '{tennis,agilite,deplacement,t360:reactivite,court}', '{"notes":"Depuis le centre de la ligne de fond, va toucher les 5 points (coins, T de service, milieu) et reviens au centre à chaque fois. Une série = les 5 points."}'),
  ('ex_tn_shadow_footwork', 'Déplacements à vide (coup droit / revers)', 'quadriceps', '{mollets}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,agilite,deplacement,t360:reactivite,maison,court}', '{"notes":"Split-step, pas de placement, geste à vide, replacement au centre. Alterne coup droit et revers au rythme d''un échange."}'),
  -- Rotation
  ('ex_tn_band_forehand', 'Coup droit à l''élastique', 'abdominaux', '{épaules,dos}', 'elastique', '{bands}', 1, 'reps', true, false, 'prepa_physique', '{tennis,rotation,puissance,t360:rotation,maison,court}', '{"notes":"Élastique attaché à hauteur de hanche derrière toi, reproduis le coup droit en partant des jambes et de la rotation du bassin."}'),
  ('ex_tn_shadow_swing', 'Geste explosif à vide (raquette)', 'abdominaux', '{épaules}', 'poids_du_corps', '{}', 1, 'reps', true, false, 'prepa_physique', '{tennis,rotation,puissance,t360:rotation,maison,court}', '{"notes":"Avec ta raquette, frappe à vide le plus vite possible en tournant les hanches avant les épaules. Contrôle la fin du geste."}'),
  -- Gainage & stabilité
  ('ex_tn_plank', 'Planche', 'abdominaux', '{épaules}', 'poids_du_corps', '{}', 1, 'time', false, false, 'prepa_physique', '{tennis,gainage,stabilite,t360:gainage,maison,court}', '{"notes":"Appui sur les avant-bras et la pointe des pieds, corps aligné, ventre serré. Respire sans relâcher."}'),
  ('ex_tn_dead_bug', 'Dead bug', 'abdominaux', '{}', 'poids_du_corps', '{}', 1, 'reps', false, false, 'prepa_physique', '{tennis,gainage,stabilite,t360:gainage,maison}', '{"notes":"Sur le dos, bras et genoux levés, allonge un bras et la jambe opposée sans décoller le bas du dos. Alterne."}'),
  -- Jambes & équilibre
  ('ex_tn_lateral_lunge', 'Fentes latérales', 'quadriceps', '{fessiers,ischio-jambiers}', 'poids_du_corps', '{}', 1, 'reps', true, false, 'prepa_physique', '{tennis,force,deplacement,t360:jambes,maison,court}', '{"notes":"Grand pas de côté, fesses en arrière, jambe opposée tendue, puis repousse pour revenir. La position de la balle écartée."}'),
  ('ex_tn_reverse_lunge', 'Fentes arrière', 'quadriceps', '{fessiers}', 'poids_du_corps', '{}', 1, 'reps', true, false, 'prepa_physique', '{tennis,force,equilibre,t360:jambes,maison,court}', '{"notes":"Recule d''un grand pas, genou arrière près du sol, buste droit, puis remonte en poussant sur la jambe avant."}'),
  ('ex_tn_single_leg_calf', 'Mollets sur une jambe', 'mollets', '{}', 'poids_du_corps', '{}', 1, 'reps', true, false, 'prepa_physique', '{tennis,force,equilibre,t360:jambes,maison,court}', '{"notes":"Sur un pied, monte sur la pointe lentement puis redescends en contrôlant. Tiens-toi à un mur si besoin."}'),
  -- Prévention épaule & poignet
  ('ex_tn_band_external_rotation', 'Rotation externe d''épaule (élastique)', 'épaules', '{dos}', 'elastique', '{bands}', 1, 'reps', true, false, 'prepa_physique', '{tennis,prevention,t360:prevention,maison,court}', '{"notes":"Coude collé au corps plié à 90°, écarte l''avant-bras vers l''extérieur contre l''élastique, lentement. Le muscle qui protège l''épaule au service."}'),
  ('ex_tn_band_internal_rotation', 'Rotation interne d''épaule (élastique)', 'épaules', '{pectoraux}', 'elastique', '{bands}', 1, 'reps', true, false, 'prepa_physique', '{tennis,prevention,t360:prevention,maison,court}', '{"notes":"Coude collé au corps plié à 90°, ramène l''avant-bras vers le ventre contre l''élastique. Mouvement lent et contrôlé."}'),
  ('ex_tn_ytw', 'Y-T-W au sol', 'épaules', '{dos}', 'poids_du_corps', '{}', 1, 'reps', false, false, 'prepa_physique', '{tennis,prevention,t360:prevention,maison}', '{"notes":"Allongé sur le ventre, lève les bras en Y, puis en T, puis en W, pouces vers le haut. Une série = les trois lettres."}'),
  ('ex_tn_wrist_curl', 'Flexion-extension du poignet (bouteille)', 'avant-bras', '{}', 'poids_du_corps', '{}', 1, 'reps', true, false, 'prepa_physique', '{tennis,prevention,t360:prevention,maison}', '{"notes":"Avant-bras posé sur la cuisse, une bouteille d''eau en main : monte et descends le poignet lentement, paume vers le haut puis vers le bas."}'),
  ('ex_tn_racket_pronation', 'Pronation-supination avec la raquette', 'avant-bras', '{}', 'poids_du_corps', '{}', 1, 'reps', true, false, 'prepa_physique', '{tennis,prevention,t360:prevention,maison,court}', '{"notes":"Tiens la raquette par le manche, bras le long du corps coude plié : tourne lentement la tête de raquette d''un côté puis de l''autre."}')
on conflict (id) do update set
  name = excluded.name,
  muscle_primary = excluded.muscle_primary,
  muscle_secondary = excluded.muscle_secondary,
  equipment = excluded.equipment,
  equipment_required = excluded.equipment_required,
  difficulty = excluded.difficulty,
  unit = excluded.unit,
  unilateral = excluded.unilateral,
  challenge_only = excluded.challenge_only,
  category = excluded.category,
  tags = excluded.tags,
  payload = excluded.payload;
