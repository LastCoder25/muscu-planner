// Instructions de mouvement en français, orientées débutant (3–4 étapes + 1 conseil).
// Mappées sur nos exos. Affichées sur la fiche exercice (ExercisePage).
// Si un exo a déjà des `payload.instructions` en base, on les garde en priorité.

export interface ExerciseGuide {
  steps: string[];
  tip?: string;
}

const EXERCISE_INSTRUCTIONS: Record<string, ExerciseGuide> = {
  ex_squat_barbell: {
    steps: [
      'Barre sur le haut du dos, pieds largeur d’épaules, pointes légèrement ouvertes.',
      'Gaine le ventre, descends en poussant les fesses vers l’arrière, dos droit.',
      'Descends jusqu’à ce que les cuisses soient ~parallèles au sol.',
      'Remonte en poussant dans les talons sans arrondir le dos.',
    ],
    tip: 'Genoux dans l’axe des pieds, talons toujours au sol.',
  },
  ex_bw_squat: {
    steps: [
      'Pieds largeur d’épaules, bras tendus devant pour l’équilibre.',
      'Descends les fesses vers l’arrière, dos droit, jusqu’aux cuisses parallèles.',
      'Remonte en poussant dans les talons.',
    ],
    tip: 'Parfait pour apprendre le mouvement avant d’ajouter de la charge.',
  },
  ex_kb_goblet_squat: {
    steps: [
      'Tiens la kettlebell à deux mains contre la poitrine, coudes vers le bas.',
      'Pieds largeur d’épaules, descends entre les genoux, buste droit.',
      'Remonte en poussant dans les talons.',
    ],
    tip: 'La charge devant aide à garder le dos droit.',
  },
  ex_band_squat: {
    steps: [
      'Élastique sous les pieds, l’autre extrémité sur les épaules.',
      'Descends en squat, dos droit, fesses vers l’arrière.',
      'Remonte en poussant dans les talons, l’élastique ajoute de la résistance en haut.',
    ],
  },
  ex_bw_lunge: {
    steps: [
      'Debout, fais un grand pas vers l’avant.',
      'Descends le genou arrière vers le sol, buste droit.',
      'Le genou avant reste au-dessus de la cheville, puis pousse pour revenir.',
      'Alterne les jambes.',
    ],
    tip: 'Garde le tronc gainé pour ne pas pencher en avant.',
  },
  ex_leg_press: {
    steps: [
      'Assieds-toi, pieds largeur d’épaules sur la plateforme.',
      'Déverrouille, descends en pliant les genoux vers la poitrine, dos collé au dossier.',
      'Pousse sans verrouiller brutalement les genoux en fin de mouvement.',
    ],
    tip: 'Ne décolle pas les fesses du siège en bas.',
  },
  ex_leg_extension: {
    steps: [
      'Assis, chevilles derrière le boudin, dos calé.',
      'Tends les jambes en contractant l’avant des cuisses.',
      'Redescends lentement sans relâcher d’un coup.',
    ],
  },
  ex_leg_curl: {
    steps: [
      'Allongé (ou assis) selon la machine, boudin au-dessus des talons.',
      'Plie les genoux en ramenant les talons vers les fesses.',
      'Redescends lentement, contrôle la charge.',
    ],
    tip: 'Ne décolle pas les hanches pour tricher.',
  },
  ex_romanian_deadlift: {
    steps: [
      'Barre devant les cuisses, pieds largeur de hanches, légère flexion des genoux.',
      'Descends la barre le long des jambes en poussant les fesses vers l’arrière.',
      'Dos droit, descends jusqu’à sentir l’étirement des ischios, puis remonte.',
    ],
    tip: 'La barre reste proche du corps ; le dos ne s’arrondit jamais.',
  },
  ex_glute_bridge: {
    steps: [
      'Allongé sur le dos, genoux pliés, pieds à plat.',
      'Pousse dans les talons pour lever le bassin.',
      'Serre les fessiers en haut, puis redescends sans poser complètement.',
    ],
  },
  ex_kb_swing: {
    steps: [
      'Kettlebell entre les pieds, pousse les fesses en arrière (charnière de hanche).',
      'Propulse la kettlebell vers l’avant par une extension explosive des hanches.',
      'Laisse-la redescendre entre les jambes et enchaîne.',
    ],
    tip: 'Le mouvement vient des hanches, pas des bras ni des épaules.',
  },
  ex_calf_raise: {
    steps: [
      'Pointe des pieds sur la cale, charge sur les épaules/machine.',
      'Monte sur la pointe des pieds le plus haut possible.',
      'Redescends lentement en étirant le mollet en bas.',
    ],
  },
  ex_calf_raise_bw: {
    steps: [
      'Debout (sur une marche pour plus d’amplitude).',
      'Monte sur la pointe des pieds, contracte les mollets.',
      'Redescends lentement.',
    ],
  },
  ex_bench_barbell: {
    steps: [
      'Allongé, omoplates serrées, pieds au sol, barre au-dessus de la poitrine.',
      'Descends la barre vers le milieu de la poitrine, coudes à ~45°.',
      'Pousse en ligne droite jusqu’à l’extension des bras.',
    ],
    tip: 'Garde les poignets solides et les fesses sur le banc.',
  },
  ex_bench_dumbbell: {
    steps: [
      'Allongé, un haltère dans chaque main au-dessus de la poitrine.',
      'Descends les haltères au niveau de la poitrine, coudes à ~45°.',
      'Pousse vers le haut sans cogner les haltères.',
    ],
  },
  ex_incline_dumbbell: {
    steps: [
      'Banc incliné à ~30°, un haltère dans chaque main.',
      'Descends au niveau du haut de la poitrine.',
      'Pousse vers le haut en contrôlant.',
    ],
    tip: 'Cible le haut des pectoraux.',
  },
  ex_incline_machine: {
    steps: [
      'Règle le siège, poignées au niveau du haut de la poitrine.',
      'Pousse vers l’avant jusqu’à extension des bras.',
      'Reviens lentement sans relâcher la charge.',
    ],
  },
  ex_pec_deck: {
    steps: [
      'Assis, avant-bras (ou mains) sur les bras de la machine, coudes à hauteur d’épaules.',
      'Rapproche les bras devant toi en contractant les pectoraux.',
      'Reviens lentement en gardant la tension.',
    ],
  },
  ex_chest_fly_cable: {
    steps: [
      'Debout au centre, une poignée dans chaque main, léger buste en avant.',
      'Bras légèrement fléchis, rapproche les mains devant la poitrine.',
      'Écarte lentement en contrôlant.',
    ],
  },
  ex_chest_fly_dumbbell: {
    steps: [
      'Allongé sur le banc, un haltère dans chaque main, bras tendus au-dessus de la poitrine.',
      'Coudes LÉGÈREMENT fléchis (angle fixe), descends les bras sur les côtés en arc de cercle.',
      'Sens l’étirement des pectoraux, puis referme en arc jusqu’au-dessus de la poitrine.',
    ],
    tip: 'Garde les coudes semi-fléchis tout du long — ce n’est pas un développé. Charge modérée, mouvement contrôlé.',
  },
  ex_pushup: {
    steps: [
      'Mains un peu plus larges que les épaules, corps gainé en planche.',
      'Descends la poitrine vers le sol, coudes à ~45°.',
      'Pousse pour remonter sans creuser le dos.',
    ],
    tip: 'Trop dur ? Pose les genoux au sol.',
  },
  ex_diamond_pushup: {
    steps: [
      'Mains rapprochées sous la poitrine, index et pouces formant un losange.',
      'Corps gainé, descends la poitrine vers les mains, coudes près du corps.',
      'Pousse pour remonter.',
    ],
    tip: 'Cible les triceps ; pose les genoux si c’est trop dur.',
  },
  ex_dips: {
    steps: [
      'Aux barres parallèles, bras tendus, buste légèrement penché en avant.',
      'Descends en pliant les coudes jusqu’à ~90°.',
      'Pousse pour remonter à l’extension.',
    ],
    tip: 'Buste penché = plus de pectoraux ; buste droit = plus de triceps.',
  },
  ex_dips_assisted: {
    steps: [
      'Place un élastique sur les barres et pose les genoux/pieds dessus.',
      'Descends en pliant les coudes, buste contrôlé.',
      'Pousse pour remonter ; l’élastique t’aide en bas.',
    ],
    tip: 'Réduis l’épaisseur de l’élastique à mesure que tu progresses.',
  },
  ex_ohp_barbell: {
    steps: [
      'Barre au niveau des clavicules, mains un peu plus larges que les épaules.',
      'Gaine les abdos et fessiers, pousse la barre au-dessus de la tête.',
      'Verrouille bras tendus, puis redescends aux clavicules.',
    ],
    tip: 'Ne cambre pas le bas du dos : serre les fessiers.',
  },
  ex_shoulder_press_db: {
    steps: [
      'Assis ou debout, un haltère de chaque côté à hauteur d’épaules.',
      'Pousse vers le haut jusqu’à extension des bras.',
      'Redescends lentement à hauteur d’épaules.',
    ],
  },
  ex_kb_press: {
    steps: [
      'Kettlebell en rack contre l’avant-bras, coude près du corps.',
      'Pousse au-dessus de la tête en gardant le poignet droit.',
      'Redescends en contrôlant.',
    ],
  },
  ex_pike_pushup: {
    steps: [
      'En position « V inversé » (fesses hautes), mains au sol.',
      'Descends le sommet de la tête vers le sol en pliant les coudes.',
      'Pousse pour remonter.',
    ],
    tip: 'Version au poids du corps du développé épaules.',
  },
  ex_lateral_raise: {
    steps: [
      'Debout, un haltère dans chaque main le long du corps.',
      'Lève les bras sur les côtés jusqu’à hauteur d’épaules, légère flexion des coudes.',
      'Redescends lentement.',
    ],
    tip: 'Charge légère ; ne balance pas le corps.',
  },
  ex_face_pull: {
    steps: [
      'Poulie haute avec corde, recule pour mettre en tension.',
      'Tire la corde vers le visage en écartant les mains, coudes hauts.',
      'Reviens lentement.',
    ],
    tip: 'Excellent pour la santé des épaules et le dos.',
  },
  ex_band_pull_apart: {
    steps: [
      'Élastique tendu devant toi, bras tendus à hauteur d’épaules.',
      'Écarte les mains en serrant les omoplates.',
      'Reviens lentement, garde la tension.',
    ],
  },
  ex_pullup: {
    steps: [
      'Suspendu à la barre, mains en pronation un peu plus larges que les épaules.',
      'Tire en amenant la poitrine vers la barre, omoplates basses.',
      'Redescends en contrôlant jusqu’à l’extension.',
    ],
    tip: 'Trop dur ? Utilise la version assistée par élastique.',
  },
  ex_pullup_assisted: {
    steps: [
      'Élastique accroché à la barre, pose un pied/genou dedans.',
      'Tire la poitrine vers la barre, omoplates basses.',
      'Redescends en contrôlant.',
    ],
    tip: 'Diminue l’aide de l’élastique au fil des semaines.',
  },
  ex_lat_pulldown: {
    steps: [
      'Assis, cuisses calées, barre prise large en pronation.',
      'Tire la barre vers le haut de la poitrine en abaissant les omoplates.',
      'Remonte lentement bras tendus.',
    ],
    tip: 'Ne tire pas avec le buste en arrière : reste droit.',
  },
  ex_row_barbell: {
    steps: [
      'Buste penché ~45°, dos droit, barre sous les épaules.',
      'Tire la barre vers le bas-ventre en serrant les omoplates.',
      'Redescends en contrôlant.',
    ],
    tip: 'Dos toujours droit, mouvement venant des coudes.',
  },
  ex_row_dumbbell: {
    steps: [
      'Un genou et une main sur le banc, dos droit, haltère dans l’autre main.',
      'Tire l’haltère vers la hanche, coude près du corps.',
      'Redescends lentement.',
    ],
  },
  ex_seated_row: {
    steps: [
      'Assis, pieds calés, poignée en main, dos droit.',
      'Tire vers le ventre en serrant les omoplates.',
      'Reviens lentement bras tendus sans arrondir le dos.',
    ],
  },
  ex_kb_row: {
    steps: [
      'Buste penché, dos droit, kettlebell dans une main.',
      'Tire la kettlebell vers la hanche, coude près du corps.',
      'Redescends en contrôlant.',
    ],
  },
  ex_band_row: {
    steps: [
      'Élastique fixé devant toi (ou sous les pieds), une poignée dans chaque main.',
      'Tire vers le ventre en serrant les omoplates.',
      'Reviens lentement.',
    ],
  },
  ex_superman: {
    steps: [
      'Allongé sur le ventre, bras tendus devant.',
      'Lève simultanément bras et jambes en contractant le bas du dos.',
      'Tiens 1–2 s puis redescends.',
    ],
  },
  ex_curl_barbell: {
    steps: [
      'Debout, barre en supination, coudes près du corps.',
      'Monte la barre vers les épaules en contractant les biceps.',
      'Redescends lentement sans balancer.',
    ],
  },
  ex_curl_dumbbell: {
    steps: [
      'Debout, un haltère dans chaque main, coudes près du corps.',
      'Monte les haltères vers les épaules (en alternant si tu veux).',
      'Redescends lentement.',
    ],
    tip: 'Évite de balancer le buste pour tricher.',
  },
  ex_band_curl: {
    steps: [
      'Pieds sur l’élastique, une poignée dans chaque main, paumes vers le haut.',
      'Monte les mains vers les épaules en contractant les biceps.',
      'Redescends lentement.',
    ],
  },
  ex_skullcrusher: {
    steps: [
      'Allongé, barre (EZ) au-dessus du front, bras tendus.',
      'Plie les coudes pour descendre la barre vers le front, coudes fixes.',
      'Tends les bras en contractant les triceps.',
    ],
    tip: 'Garde les coudes serrés et immobiles.',
  },
  ex_curl_ez: {
    steps: [
      'Debout, barre EZ tenue sur les prises coudées, paumes vers le haut, coudes près du corps.',
      'Monte la barre vers les épaules en contractant les biceps, sans balancer.',
      'Redescends lentement jusqu’à l’extension.',
    ],
    tip: 'La barre coudée soulage les poignets par rapport à une barre droite.',
  },
  ex_curl_reverse_ez: {
    steps: [
      'Debout, barre EZ tenue en pronation (paumes vers le bas), coudes près du corps.',
      'Monte la barre vers les épaules en gardant les poignets neutres.',
      'Redescends lentement.',
    ],
    tip: 'Travaille les avant-bras et le brachial : prends plus léger qu’au curl classique.',
  },
  ex_skullcrusher_ez: {
    steps: [
      'Allongé sur un banc, barre EZ au-dessus du front sur la prise coudée, bras tendus.',
      'Plie les coudes pour descendre la barre vers le front, coudes fixes et serrés.',
      'Tends les bras en contractant les triceps.',
    ],
    tip: 'Demande à quelqu’un de t’aider à poser la barre si tu pars lourd.',
  },
  ex_close_bench_ez: {
    steps: [
      'Allongé sur un banc, barre EZ tenue sur la prise intérieure, mains un peu plus serrées que les épaules.',
      'Descends la barre vers le bas de la poitrine, coudes près du corps.',
      'Pousse jusqu’à extension complète en contractant les triceps.',
    ],
    tip: 'Les coudes restent serrés : c’est ce qui déplace le travail vers les triceps.',
  },
  ex_triceps_pushdown: {
    steps: [
      'Poulie haute, barre/corde en main, coudes collés au corps.',
      'Pousse vers le bas jusqu’à extension complète des bras.',
      'Remonte lentement sans décoller les coudes.',
    ],
  },
  ex_band_pushdown: {
    steps: [
      'Élastique accroché en hauteur, mains dessus, coudes près du corps.',
      'Pousse vers le bas jusqu’à extension des bras.',
      'Remonte lentement.',
    ],
  },
  ex_plank: {
    steps: [
      'Sur les avant-bras et la pointe des pieds, corps aligné.',
      'Gaine les abdos et les fessiers, ne creuse pas le dos.',
      'Tiens la position en respirant calmement.',
    ],
    tip: 'Mieux vaut 20 s parfaites que 1 min dos creusé.',
  },
  ex_glute_machine: {
    steps: [
      'À quatre pattes (ou sur la machine à fessiers), dos plat, appuis sur les mains et un genou.',
      'Envoie une jambe en arrière et vers le haut, genou plié, talon vers le plafond.',
      'Serre le fessier en haut, puis ramène le genou sous la hanche en contrôlant.',
    ],
    tip: 'Cible les fessiers ; ne cambre pas le bas du dos en haut. Alterne les jambes.',
  },
  ex_adductors: {
    steps: [
      'Assis sur la machine, genoux écartés contre les coussins (faces internes des cuisses).',
      'Resserre les cuisses en contractant l’intérieur des cuisses.',
      'Reviens lentement en contrôlant l’écartement.',
    ],
    tip: 'Travaille les adducteurs (intérieur de cuisse).',
  },
  ex_abductors: {
    steps: [
      'Assis sur la machine, genoux joints contre les coussins (faces externes).',
      'Écarte les cuisses en contractant l’extérieur des hanches/fessiers.',
      'Reviens lentement.',
    ],
    tip: 'Travaille les abducteurs (extérieur de hanche/fessiers).',
  },
  ex_hanging_leg_raise: {
    steps: [
      'Suspendu à la barre, corps gainé.',
      'Monte les genoux (ou jambes tendues) vers la poitrine.',
      'Redescends lentement sans te balancer.',
    ],
    tip: 'Débute genoux pliés, puis tends les jambes.',
  },
  ex_hammer_curl: {
    steps: [
      'Un haltère dans chaque main, prise NEUTRE (paumes face à face), bras le long du corps.',
      'Fléchis les coudes pour monter les haltères, coudes fixes contre les côtes.',
      'Redescends en contrôlant, sans balancer le buste.',
    ],
    tip: 'Prise marteau (pouces vers le haut) → travaille aussi les avant-bras.',
  },
  ex_overhead_triceps: {
    steps: [
      'Un haltère tenu à deux mains, bras tendus au-dessus de la tête.',
      'Descends l’haltère derrière la nuque en fléchissant seulement les coudes.',
      'Retends les bras vers le haut en contractant les triceps.',
    ],
    tip: 'Garde les coudes serrés et pointés vers le plafond.',
  },
  ex_triceps_kickback: {
    steps: [
      'Buste penché en avant, un haltère en main, coude remonté contre le corps.',
      'Tends le bras vers l’arrière jusqu’à l’extension complète du coude.',
      'Reviens en contrôlant sans bouger l’épaule.',
    ],
    tip: 'C’est l’extension du coude qui travaille : garde le bras (épaule) immobile.',
  },
  ex_front_raise: {
    steps: [
      'Un haltère dans chaque main devant les cuisses, bras tendus.',
      'Monte les bras tendus devant toi jusqu’à hauteur des épaules.',
      'Redescends lentement, sans élan du buste.',
    ],
    tip: 'Monte à hauteur d’épaule, pas plus haut ; évite de te cambrer.',
  },
  ex_rear_delt_fly: {
    steps: [
      'Buste penché en avant (dos droit), un haltère dans chaque main sous la poitrine.',
      'Écarte les bras vers l’extérieur/arrière en serrant les omoplates.',
      'Reviens en contrôlant.',
    ],
    tip: 'Charge légère : ce sont les épaules arrière, pas le dos, qui doivent tirer.',
  },
  ex_seated_calf: {
    steps: [
      'Assis, avant-pieds sur la cale, charge posée sur les genoux (machine mollets assis).',
      'Monte sur la pointe des pieds le plus haut possible.',
      'Redescends lentement en étirant bien le mollet en bas.',
    ],
    tip: 'Genou plié → cible le soléaire (mollet profond), complément des mollets debout.',
  },
  ex_deadlift: {
    steps: [
      'Barre au sol contre les tibias, pieds largeur de hanches, saisis la barre bras tendus.',
      'Dos droit et gainé, pousse dans les jambes pour décoller la barre le long des tibias.',
      'Termine debout, hanches en avant, puis redescends la barre en poussant les fesses en arrière.',
    ],
    tip: 'Dos JAMAIS arrondi. Commence léger pour maîtriser la charnière de hanche.',
  },
  // ── Variantes (migration 0112) : chacune rangée avec son mouvement (EXERCISE_VARIANT_FAMILIES) ──
  ex_pushup_incline: {
    steps: [
      'Mains sur un support stable (banc, canapé, rebord), corps gainé de la tête aux talons.',
      'Descends la poitrine vers le support en gardant les coudes à 45° du corps.',
      'Repousse jusqu’à bras tendus.',
    ],
    tip: 'Plus le support est haut, plus c’est facile : baisse-le pour progresser vers les pompes classiques.',
  },
  ex_pushup_decline: {
    steps: [
      'Pieds sur un support stable, mains au sol sous les épaules, corps gainé.',
      'Descends la poitrine vers le sol sans cambrer le bas du dos.',
      'Repousse jusqu’à bras tendus.',
    ],
    tip: 'Plus les pieds sont hauts, plus le haut des pectoraux et les épaules travaillent.',
  },
  ex_pushup_wide: {
    steps: [
      'Mains plus larges que les épaules, corps gainé de la tête aux talons.',
      'Descends la poitrine vers le sol, coudes vers l’extérieur.',
      'Repousse jusqu’à bras tendus.',
    ],
    tip: 'Les pectoraux travaillent davantage, les triceps moins : descends moins bas si les épaules tirent.',
  },
  ex_pushup_archer: {
    steps: [
      'Mains très écartées, corps gainé.',
      'Descends sur un côté en gardant l’autre bras tendu sur le côté.',
      'Remonte, puis alterne : une série = les deux côtés.',
    ],
    tip: 'Étape avant la pompe à un bras : le bras tendu aide juste à l’équilibre.',
  },
  ex_dips_bench: {
    steps: [
      'Mains sur le bord d’un banc ou d’une chaise stable, jambes tendues ou pliées devant toi.',
      'Plie les coudes vers l’arrière pour descendre les fesses près du support.',
      'Repousse jusqu’à bras tendus.',
    ],
    tip: 'Garde le dos proche du banc et les épaules basses ; plie les jambes pour faciliter.',
  },
  ex_squat_bulgarian: {
    steps: [
      'Un pied posé derrière toi sur un banc ou une chaise, l’autre pied devant.',
      'Descends en pliant le genou avant, buste droit.',
      'Remonte en poussant dans le talon de la jambe avant, puis change de jambe.',
    ],
    tip: 'Le genou avant ne s’effondre pas vers l’intérieur ; avance le pied si le genou dépasse trop les orteils.',
  },
  ex_squat_pistol_assisted: {
    steps: [
      'Debout sur une jambe, l’autre tendue devant, une main tenant un appui (porte, montant).',
      'Descends le plus bas possible en gardant le talon au sol.',
      'Remonte en t’aidant le moins possible de l’appui, puis change de jambe.',
    ],
    tip: 'Réduis l’aide de la main au fil des séances pour tendre vers le pistol complet.',
  },
  ex_squat_sumo: {
    steps: [
      'Pieds bien plus larges que les épaules, pointes tournées vers l’extérieur.',
      'Descends en poussant les genoux dans l’axe des pieds, buste droit.',
      'Remonte en contractant les fessiers.',
    ],
    tip: 'Cible davantage l’intérieur des cuisses et les fessiers.',
  },
  ex_lunge_reverse: {
    steps: [
      'Debout, pas en arrière avec une jambe.',
      'Descends jusqu’à ce que les deux genoux soient à environ 90°.',
      'Reviens en poussant dans la jambe avant, puis change de jambe.',
    ],
    tip: 'Plus facile pour les genoux et l’équilibre que les fentes avant.',
  },
  ex_lunge_walking: {
    steps: [
      'Fais un grand pas en avant et descends en fente.',
      'Pousse dans la jambe avant pour amener l’autre jambe devant, en marchant.',
      'Enchaîne en alternant les jambes sur la distance voulue.',
    ],
    tip: 'Garde un pas régulier et le buste droit ; prévois de la place devant toi.',
  },
  ex_calf_raise_single: {
    steps: [
      'Debout sur une jambe, une main sur un appui pour l’équilibre.',
      'Monte sur la pointe du pied le plus haut possible.',
      'Redescends lentement, puis change de jambe.',
    ],
    tip: 'Fais-le sur une marche pour descendre le talon sous le niveau de la pointe : plus d’amplitude.',
  },
  ex_glute_bridge_single: {
    steps: [
      'Allongé sur le dos, un pied au sol, l’autre jambe tendue en l’air.',
      'Pousse dans le talon pour monter le bassin jusqu’à l’alignement épaules-hanches-genou.',
      'Redescends en contrôle, puis change de jambe.',
    ],
    tip: 'Garde le bassin à plat, sans te laisser tourner du côté de la jambe en l’air.',
  },
  ex_hip_thrust: {
    steps: [
      'Haut du dos contre le bord d’un banc, pieds au sol, genoux pliés.',
      'Pousse dans les talons pour monter le bassin jusqu’à l’horizontale.',
      'Contracte les fessiers en haut, puis redescends en contrôle.',
    ],
    tip: 'Menton rentré et regard vers l’avant ; ne cambre pas le bas du dos en haut.',
  },
  ex_rdl_single: {
    steps: [
      'Debout sur une jambe légèrement fléchie, un haltère dans la main opposée.',
      'Penche le buste en poussant l’autre jambe vers l’arrière, dos plat.',
      'Remonte en contractant les fessiers, puis change de jambe.',
    ],
    tip: 'Choisis léger : l’équilibre est la difficulté principale.',
  },
  ex_curl_concentration: {
    steps: [
      'Assis, coude appuyé contre l’intérieur de la cuisse, haltère en main bras tendu.',
      'Monte l’haltère vers l’épaule en contractant le biceps.',
      'Redescends lentement, puis change de bras.',
    ],
    tip: 'Le coude reste fixe contre la cuisse : c’est ce qui isole le biceps.',
  },
  ex_curl_incline: {
    steps: [
      'Assis sur un banc incliné, dos appuyé, un haltère dans chaque main bras tendus vers le bas.',
      'Monte les haltères vers les épaules, coudes en arrière du corps.',
      'Redescends lentement jusqu’à l’extension complète.',
    ],
    tip: 'Le bras en arrière étire le biceps : prends plus léger qu’au curl debout.',
  },
  ex_curl_preacher_ez: {
    steps: [
      'Assis face à un pupitre, bras posés dessus, barre EZ en supination.',
      'Monte la barre vers les épaules sans décoller les bras.',
      'Redescends lentement sans verrouiller brutalement le coude.',
    ],
    tip: 'Sans pupitre, un banc incliné à 45° fait l’affaire : appuie les bras sur le dossier.',
  },
  ex_arnold_press: {
    steps: [
      'Assis ou debout, haltères devant la poitrine, paumes vers toi.',
      'Monte en tournant les poignets pour finir paumes vers l’avant, bras tendus.',
      'Redescends en inversant la rotation.',
    ],
    tip: 'Le mouvement fluide et contrôlé fait travailler les trois faisceaux de l’épaule.',
  },
  ex_lateral_raise_band: {
    steps: [
      'Debout sur l’élastique, une poignée dans chaque main le long du corps.',
      'Monte les bras sur les côtés jusqu’à hauteur d’épaules, coudes légèrement fléchis.',
      'Redescends lentement.',
    ],
    tip: 'Ne monte pas au-dessus des épaules ; ne hausse pas les épaules vers les oreilles.',
  },
  ex_row_bent_supinated: {
    steps: [
      'Buste penché à 45°, dos plat, barre tenue paumes vers le haut, bras tendus.',
      'Tire la barre vers le bas du ventre en serrant les omoplates.',
      'Redescends en contrôle.',
    ],
    tip: 'La prise en supination sollicite davantage les biceps et le bas du dos.',
  },
  ex_upright_row: {
    steps: [
      'Debout, un haltère dans chaque main devant les cuisses, paumes vers toi.',
      'Monte les haltères le long du corps jusqu’au milieu de la poitrine, coudes en haut.',
      'Redescends lentement.',
    ],
    tip: 'Ne monte pas au-dessus du sternum : au-delà, les épaules se compriment.',
  },
  ex_pullover_db: {
    steps: [
      'Allongé sur le dos (au sol ou sur un banc), un haltère tenu à deux mains au-dessus de la poitrine.',
      'Descends l’haltère derrière la tête, bras quasi tendus.',
      'Ramène-le au-dessus de la poitrine en contractant le dos.',
    ],
    tip: 'Garde les coudes légèrement fléchis et fixes : seul l’épaule bouge.',
  },
  ex_plank_side: {
    steps: [
      'Sur le côté, appui sur l’avant-bras, jambes tendues et empilées.',
      'Soulève le bassin pour aligner chevilles, hanches et épaule.',
      'Tiens la position, puis change de côté.',
    ],
    tip: 'Genou du dessous au sol pour faciliter ; pied du dessus devant pour l’équilibre.',
  },
  ex_dead_bug: {
    steps: [
      'Sur le dos, bras tendus vers le plafond, hanches et genoux à 90°.',
      'Descends le bras droit et la jambe gauche vers le sol sans cambrer.',
      'Reviens et alterne : une rep = les deux côtés.',
    ],
    tip: 'Garde le bas du dos plaqué au sol : si ça décolle, amplitude plus petite.',
  },
  ex_bicycle_crunch: {
    steps: [
      'Sur le dos, mains derrière la tête, jambes décollées.',
      'Amène le coude droit vers le genou gauche, l’autre jambe tendue.',
      'Alterne en pédalant, sans tirer sur la nuque.',
    ],
    tip: 'C’est la rotation du buste qui compte, pas la vitesse.',
  },
  ex_leg_raise_floor: {
    steps: [
      'Sur le dos, jambes tendues, mains sous les fesses ou le long du corps.',
      'Monte les jambes à la verticale sans décoller le bas du dos.',
      'Redescends lentement sans toucher le sol.',
    ],
    tip: 'Plie légèrement les genoux pour faciliter ; descends moins bas si le dos se creuse.',
  },
  ex_chinup: {
    steps: [
      'Suspendu à la barre, paumes vers toi, mains à largeur d’épaules.',
      'Tire pour amener le menton au-dessus de la barre, coudes vers le bas.',
      'Redescends en contrôle jusqu’aux bras tendus.',
    ],
    tip: 'Plus accessible que la traction en pronation : le biceps aide davantage.',
  },
  ex_pullup_neutral: {
    steps: [
      'Suspendu à des poignées parallèles, paumes face à face.',
      'Tire jusqu’à amener le menton au niveau des mains, coudes vers le bas.',
      'Redescends en contrôle jusqu’aux bras tendus.',
    ],
    tip: 'La prise la plus confortable pour les épaules et les poignets.',
  },
  ex_pullup_wide: {
    steps: [
      'Suspendu à la barre, mains nettement plus larges que les épaules, paumes vers l’avant.',
      'Tire pour amener le menton au-dessus de la barre, en serrant les omoplates.',
      'Redescends en contrôle jusqu’aux bras tendus.',
    ],
    tip: 'Sollicite surtout les grands dorsaux ; amplitude plus courte, c’est normal.',
  },
};

export function exerciseInstructions(id: string): ExerciseGuide | undefined {
  return EXERCISE_INSTRUCTIONS[id];
}
