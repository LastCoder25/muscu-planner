// Instructions de mouvement en français, orientées débutant (3–4 étapes + 1 conseil).
// Mappées sur nos exos. Affichées sur la fiche exercice (ExercisePage).
// Si un exo a déjà des `payload.instructions` en base, on les garde en priorité.

export interface ExerciseGuide {
  steps: string[];
  tip?: string;
}

export const EXERCISE_INSTRUCTIONS: Record<string, ExerciseGuide> = {
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
      'Installe-toi sur la machine à fessiers (hip thrust), dos calé, barre/coussin sur les hanches.',
      'Pousse dans les talons pour monter le bassin jusqu’à l’extension complète des hanches.',
      'Serre les fessiers en haut, puis redescends en contrôlant.',
    ],
    tip: 'Cible les fessiers ; ne cambre pas le bas du dos en haut.',
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
};

export function exerciseInstructions(id: string): ExerciseGuide | undefined {
  return EXERCISE_INSTRUCTIONS[id];
}
