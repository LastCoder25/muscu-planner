// combat.ts — moteur de combat RPG (Phase 2a). Tour par tour, auto-résolu,
// aléatoire SEEDÉ (reproductible → testable). Pur, aucune dépendance Vue/Supabase.
// Les valeurs de combat dérivent des 3 stats (elles-mêmes issues du sport).

// PRNG déterministe (mulberry32) : même seed → même combat.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine stable tirée d'une chaîne (FNV-1a) : même texte → même graine, jamais 0. */
export function seedOf(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

/** 🔮 Les 12 POUVOIRS DE RELIQUE (refonte équipement, étape 4). Les 8 premiers sont ceux
 *  des voies ; phénix et second souffle se déclenchent sur une condition, sans jauge. */
export type RelicPowerId =
  | 'brasier'
  | 'rempart'
  | 'coup_fatal'
  | 'festin'
  | 'tempete'
  | 'riposte_parfaite'
  | 'ronces'
  | 'carapace'
  | 'ouverture'
  | 'moisson'
  | 'phenix'
  | 'second_souffle';
/** La relique portée, telle que le combat la lit : son pouvoir et sa FORCE (rang × jet ×
 *  niveau d'objet, cf. `relicForce`). `fast` : Légendaire+, la jauge se remplit plus vite. */
export interface RelicCharge {
  id: RelicPowerId;
  force: number;
  fast?: boolean;
}

export interface Combatant {
  name: string;
  pv: number;
  damage: number; // dégâts de base par coup (Force)
  crit: number; // proba de critique (0..1, ×2 dégâts)
  dodge: number; // proba d'esquive (0..1)
  initiative: number; // qui commence (plus haut = d'abord)
  dmgReduction?: number; // 0..1 : dégâts reçus réduits (Défense / armure)
  lifesteal?: number; // 0..1 : PV rendus = part des dégâts infligés (vol de vie)
  strikes?: number; // frappes moyennes par tour (Vitesse) ; défaut 1 (monstres)
  // Effets SIGNATURE (objets rares, joueur uniquement) — bonus de dégâts CONDITIONNELS.
  execute?: number; // + dégâts quand l'ENNEMI est bas (< executeThreshold PV)
  rage?: number; // + dégâts quand TOI tu es bas (< rageThreshold PV)
  momentum?: number; // + dégâts à chaque tour du joueur dans le combat (cumul plafonné)
  /** Élan compté PAR COUP (règle d'avant la refonte de l'équipement) : réservé aux
   *  aventuriers, dont la calibration (route, sièges, camps, failles) est mesurée à part. */
  momentumPerHit?: boolean;
  thorns?: number; // 0..1 : part des dégâts reçus renvoyée à l'attaquant (épines, joueur)
  regen?: number; // 0..1 : BONUS de PV régénérés entre 2 combats d'un donjon (stat mineure, joueur)
  // ── Refonte équipement (étape 3) — joueur uniquement ──
  critDmg?: number; // ajouté au multiplicateur de critique (×2 → ×2 + critDmg)
  /** 0..1 : PRÉCISION. Annule cette part de l'esquive ennemie ET ajoute autant de dégâts
   *  tant que l'ennemi a plus de `accuracyOpenAbove` de ses PV (frapper juste d'entrée).
   *  ⚠️ Mesuré : l'esquive seule ne valait RIEN à haut niveau (les monstres esquivent 5 à
   *  8 %, et le héros frappe jusqu'à 37 fois par tour) — une stat morte. */
  accuracy?: number;
  bleed?: number; // part des dégâts infligés qui saigne ensuite (répartie sur 3 tours ennemis)
  block?: number; // 0..1 : chance qu'un coup reçu ne fasse que blockKeep de ses dégâts
  parry?: number; // 0..1 : chance d'éviter un coup reçu ET d'étourdir l'ennemi un tour
  riposte?: number; // 0..1 : chance de contre-attaquer après un coup reçu
  critResist?: number; // 0..1 : part du bonus de critique ennemi retirée
  startShield?: number; // 0..1 : barrière de départ, en part des PV max
  // Procs LÉGENDAIRES (objets Légendaire+, joueur uniquement) — effets NON-scalants,
  // one-shot par combat. Cf. LEGENDARY_PROCS (items.ts) pour les ids/libellés.
  procs?: ReadonlySet<string>;
  /** 🔮 Le pouvoir de la relique portée (joueur uniquement). */
  relic?: RelicCharge;
}

/** 🔮 RÉGLAGES DES POUVOIRS DE RELIQUE. La jauge va de 0 à `full` ; chaque action qui la
 *  charge y ajoute sa part (× `fastMult` pour une relique Légendaire+). Les valeurs d'effet
 *  sont multipliées par la FORCE de la relique. ⚠️ Point de départ : réglé à l'étape 7.
 *  ⚠️ Aucun pouvoir ne consomme de `rng` : sans relique, un combat seedé est inchangé. */
export const RELIC = {
  full: 100,
  fastMult: 1.25,
  /** Plafond des pouvoirs qui rendent un STOCK de dégâts, en part des PV max ennemis
   *  (× force) : sans lui, un boss à beaucoup de PV nourrit un stock qui l'écrase. */
  stockCapPct: 0.2,
  brasierCharge: 34, // par tour du héros sous le seuil — trois tours
  // ⚠️ Seuil propre (étape 7) : il fallait passer sous 30 % des PV (le seuil de rage), rare
  // dans un combat gagné — mesuré ~2,6 % de puissance.
  brasierThreshold: 0.6,
  brasierMult: 0.8, // une volée × 0,8…
  brasierMissing: 2, // …× (1 + 2 × part des PV qui manquent)
  // ⚠️ REMPART ET RONCES LIBÈRENT UNE VOLÉE (étape 7), et non plus leur stock : les dégâts
  // évités ou renvoyés sont minuscules face aux PV d'un boss — mesuré 0 % de puissance, même
  // avec 20 % de blocage ou 30 % d'épines. La jauge se remplit toujours par l'action.
  rempartCharge: 100, // un blocage remplit la jauge…
  rempartMult: 1.5, // …puis une contre-attaque de 1,5 volée
  fatalCharge: 20, // par critique porté
  fatalBonus: 0.5, // le coup fatal : critique × (1 + 0,5 × force), inesquivable
  festinScale: 0.1, // 10 % des PV max de soin perdu (plafond du tour) remplissent la jauge
  tempeteCharge: 25, // par tour du héros une fois l'élan au maximum
  tempeteMult: 1.5, // l'élan retombe, contre une rafale de 1,5 volée
  riposteCharge: 100, // une parade ou une riposte remplit la jauge
  roncesCharge: 34, // par coup d'épines (trois coups)…
  roncesMult: 1.5, // …puis une explosion de 1,5 volée
  carapaceScale: 0.5, // encaisser 50 % de ses PV max remplit la jauge…
  carapaceShield: 0.05, // …et donne une barrière de 5 % des PV max
  ouvertureMult: 2.5, // jauge PLEINE au début de chaque combat : 2,5 volées d'entrée…
  ouvertureCharge: 5, // …puis elle se recharge lentement (5 par tour)
  moissonCharge: 50, // par monstre abattu (la jauge suit le donjon)
  moissonBuff: 0.33, // jauge pleine au début d'un combat : +33 % de dégâts pour ce combat
  // ⚠️ …ET UNE CHARGE EN COMBAT (2026-09-22, demandé) : sans elle, Moisson valait 0 contre un
  // boss (un seul combat, aucun monstre abattu avant). Arracher cette part des PV de
  // l'ennemi remplit la jauge : le bonus vaut pour la fin du combat.
  moissonHpShare: 0.25,
  phenixBlock: 0.4, // le coup fatal perd 40 % (× force)…
  phenixMax: 0.9, // …au plus 90 %
  souffleHeal: 0.12, // sous 30 % PV, une fois : 12 % des PV max (× force)…
  souffleMax: 0.5, // …au plus 50 %
} as const;

/** Poids de chaque pouvoir dans la puissance affichée, × la force de la relique (une relique
 *  plus forte au même pouvoir est donc toujours mieux notée). ⚠️ MESURÉ EN VRAI COMBAT (étape
 *  7 ; boss de palier + donjon, niveaux 60/90, joueur de référence, avec la stat du pouvoir
 *  quand il en a une) : après rééquilibrage, chaque pouvoir vaut ~+3 à +12 %, la plupart +6 à
 *  +10 % — avant, de 0 % (Rempart, Ronces : leur stock ne pesait rien face à un boss) à +28 %
 *  (Carapace). La force montant avec le niveau, 0,075 × force affiche +7 % (niveau 60) à +9 %
 *  (niveau 90) : ce que le combat mesure. À 0,16 l'écran annonçait +14 à +19 %. */
const RELIC_POWER_W: Record<RelicPowerId, { side: 'off' | 'surv'; weight: number }> = {
  brasier: { side: 'off', weight: 0.075 },
  rempart: { side: 'surv', weight: 0.075 },
  coup_fatal: { side: 'off', weight: 0.075 },
  festin: { side: 'surv', weight: 0.075 },
  tempete: { side: 'off', weight: 0.075 },
  riposte_parfaite: { side: 'off', weight: 0.075 },
  ronces: { side: 'surv', weight: 0.075 },
  carapace: { side: 'surv', weight: 0.075 },
  ouverture: { side: 'off', weight: 0.075 },
  moisson: { side: 'off', weight: 0.075 },
  phenix: { side: 'surv', weight: 0.075 },
  second_souffle: { side: 'surv', weight: 0.075 },
};

// POIDS DE CHAQUE PROC dans `combatPower` (légendaires d'objets ET signatures de set).
// ⚠️ MESURÉS EN VRAI COMBAT (v0.837) : proc ajouté seul à un build optimisé, boss de palier +
// donjon le plus profond aux niveaux 30/60/90, gain en puissance ÉQUIVALENTE g → poids
// (1 + g)² − 1 (la puissance est une racine). Avant, ils valaient tous 0,06 pour des gains de
// −1 % (Initiative) à +35 % (Soif). Les 14 procs légendaires ont été RÉÉQUILIBRÉS à ~+8 %
// chacun (cf. COMBAT) : ils pèsent donc tous 0,16. Le côté (offense/survie) ne sert qu'au
// cumul de plusieurs procs.
export const PROC_POWER: Record<string, { side: 'off' | 'surv'; weight: number }> = {
  initiative: { side: 'off', weight: 0.16 },
  executioner: { side: 'off', weight: 0.16 },
  predator_eye: { side: 'off', weight: 0.16 },
  vampiric: { side: 'off', weight: 0.16 },
  charge: { side: 'off', weight: 0.16 },
  cadence: { side: 'off', weight: 0.16 },
  whetted: { side: 'off', weight: 0.16 },
  aegis: { side: 'surv', weight: 0.16 },
  retort: { side: 'surv', weight: 0.16 },
  phoenix: { side: 'surv', weight: 0.16 },
  secondwind: { side: 'surv', weight: 0.16 },
  thirst: { side: 'surv', weight: 0.16 },
  endurance: { side: 'surv', weight: 0.16 },
  quarry: { side: 'surv', weight: 0.16 },
  living_armor: { side: 'surv', weight: 0.16 },
  scarring: { side: 'surv', weight: 0.16 },
  vigilance: { side: 'surv', weight: 0.16 },
  sang_froid: { side: 'surv', weight: 0.16 },
  sidestep: { side: 'surv', weight: 0.16 },
  dance: { side: 'off', weight: 0.16 },
  rage_seal: { side: 'off', weight: 0.16 },
  hunter: { side: 'off', weight: 0.16 },
  // ⚠️ SIGNATURES DE SET : leur poids n'est PAS la valeur de la signature seule, mais ce qui
  // manque pour que la puissance affichée du SET COMPLET égale ce qu'il vaut en vrai combat.
  // Re-mesuré à la refonte équipement (étape 7), signatures recalibrées : la puissance du set
  // complet suit le combat à quelques points près. ⚠️ Le Vampire reste SURESTIMÉ à l'écran
  // (~+10 points aux niveaux 60-90) même à un poids quasi nul : c'est la valeur du vol de vie
  // qui dépend du niveau du combat (cf. `powerSustainW`), pas sa signature.
  sig_berserker: { side: 'off', weight: 0.09 },
  sig_gardien: { side: 'surv', weight: 0.09 },
  sig_assassin: { side: 'off', weight: 0.07 },
  sig_vampire: { side: 'surv', weight: 0.02 },
  sig_colosse: { side: 'surv', weight: 0.1 },
  sig_duelliste: { side: 'off', weight: 0.09 },
  sig_epineux: { side: 'off', weight: 0.1 },
  sig_frenetique: { side: 'off', weight: 0.08 },
};

// Coefficients d'équilibrage (ajustables en un endroit).
// MODÈLE (2026‑08‑09) : chaque sport nourrit 1 offense + 1 survie → l'équilibré
// (bon partout) bat les mono via des PRODUITS (offense = Force×frappes×crit ;
// survie = Vie×défense×esquive). Planchers de NIVEAU sur dégâts & PV → aucun
// pilier n'est jamais nul → les profils extrêmes restent viables.
//  💪 Puissance → Force (dégâts/coup) + Défense (réduction)
//  ❤️ Endurance → Vie (PV)
//  ⚡ Agilité   → Vitesse (multi-frappe) + Crit + Esquive
export const COMBAT = {
  // Coefs optimisés (2026‑08‑09) pour que l'ÉQUILIBRÉ soit le meilleur build à tous
  // les niveaux, les extrêmes restant viables (~57-98 % de sa puissance). Chaque
  // stat a une valeur/point comparable au point équilibré → « bon partout » gagne.
  pvBase: 100,
  pvPerLevel: 15, // plancher de PV par niveau (le muscu ne meurt pas en 2 coups)
  pvPerEndurance: 10,
  baseDamage: 6,
  damagePerLevel: 10, // plancher de dégâts par niveau (le coureur frappe quand même)
  damagePerPuissance: 1.2,
  defPerPuissance: 0.002, // Défense (réduction) issue de la Puissance
  defCap: 0.45,
  strikePerAgilite: 0.004, // Vitesse : frappes/tour = 1 + Agilité×k
  critPerAgilite: 0.002,
  critCap: 0.5,
  dodgePerAgilite: 0.003,
  dodgeCap: 0.4,
  varianceMin: 0.85, // dégâts × [0.85 .. 1.15]
  varianceSpan: 0.3,
  maxRounds: 400, // garde-fou anti-boucle (multi-frappe → combats plus courts en tours)
  dungeonHealPct: 0.15, // PV régénérés entre deux combats d'un donjon (% du max)
  // Vol de vie : PLAFOND de soin par TOUR (% des PV max de l'attaquant). Le vol de vie
  // s'applique par frappe et le multi-frappe (Agilité) le démultipliait → un build pouvait
  // se soigner à FOND chaque tour = mur increvable qu'aucune calibration de dégâts monstre
  // ne pouvait franchir (le sport n'était plus le plafond). Borné ici → le sustain reste fort
  // mais un monstre de ta ligue finit par percer (v0.600, ticket anti-runaway difficulté).
  lifestealRoundCap: 0.08,
  // Effets signature (conditionnels) — seuils & plafond.
  executeThreshold: 0.25, // « Exécution » active si l'ennemi est sous 25 % PV
  rageThreshold: 0.3, // « Rage » active si le joueur est sous 30 % PV
  // ⚠️ ÉLAN COMPTÉ PAR TOUR (refonte équipement, étape 1). Compté par COUP, il était au maximum
  // avant la fin du 1er tour dès que le héros frappait plusieurs fois (5 coups par tour au
  // niveau 30, 37 au niveau 90) : ce n'était plus un bonus qui monte, c'étaient des dégâts
  // sous un autre nom. Mesuré, un combat dure 2,4 à 6,8 tours du héros : 4 tours de cumul
  // pour qu'il monte VRAIMENT pendant le combat.
  momentumMaxStacks: 4, // « Déferlante » : cumul plafonné à 4 tours
  momentumMaxStacksPerHit: 6, // aventuriers (élan par coup, règle d'avant)
  tranceMaxStacksPerHit: 8,
  cadenceFromHit: 5,
  // Procs légendaires (non-scalants).
  // ⚠️ RÉÉQUILIBRÉS EN v0.837 (mesuré, choix de l'utilisateur) : chaque proc vaut ~+8 % de
  // puissance ÉQUIVALENTE en vrai combat (proc seul sur un build optimisé, boss + donjon, niveaux
  // 30/60/90). Avant : de −1 % (Initiative) à +35 % (Soif). Les procs « premiers coups » comptent
  // désormais des TOURS : un héros frappe ~17 fois par tour au niveau 60, un compte de coups ne
  // durait qu'un instant.
  initiativeMult: 2, // Initiative : les coups des premiers tours ×2, inesquivables…
  // …sur 3 tours (2026-09-22, mesuré) : sur un seul tour elle valait −3 à +4 % contre un boss,
  // un combat de boss durant bien plus longtemps. Désormais +5 à +10 %.
  initiativeTurns: 3,
  // Œil : +40 % (2026-09-22) — à +30 % il valait +4 à +7 %, désormais +5 à +8 %.
  predatorTurns: 6, // Œil du prédateur : les coups des 6 premiers tours sont inesquivables…
  // …⚠️ et frappent plus fort (refonte équipement, étape 7) : rendre inesquivable ne valait
  // presque rien (~1 % mesuré), les boss et les monstres esquivant peu.
  predatorMult: 1.4,
  aegisBlock: 0.75, // Égide : la 1re attaque ennemie qui touche est BLOQUÉE d'office (−75 %, comme un blocage)
  retortHits: 3, // Rétorsion : les 3 premiers coups ennemis reçus…
  retortMaxPvPct: 0.07, // …retirent chacun 7 % des PV max de l'ennemi
  phoenixBlock: 0.5, // Phénix : le coup qui t'aurait tué perd la moitié de ses dégâts
  vampiricHealPct: 0.5, // Vampirisme : soin = 50 % des dégâts d'un crit…
  // …⚠️ HORS du plafond de soin du tour (refonte équipement, étape 7), dans une réserve à part
  // de N % des PV max par tour : dans le plafond, il ne valait RIEN (0 % mesuré) sur un build
  // qui l'atteint déjà par son vol de vie — c'est-à-dire tout build équipé passé le niveau 30.
  vampiricCapPct: 0.02,
  executeKillThreshold: 0.15, // Bourreau : exécute un ennemi sous 15 % PV
  secondWindThreshold: 0.3, // Second souffle : déclenche sous 30 % PV
  secondWindHealPct: 0.25, // Second souffle : soigne 25 % des PV max
  // Procs de SET (v0.701) — même famille : non-scalants, et AUCUN ne consomme de rng.
  chargeTurns: 4, // Charge : les coups des 4 premiers tours…
  chargeMult: 2, // …infligent le double
  cadenceFrom: 3, // Cadence : à partir du 3ᵉ tour du héros… (par tour, comme l'élan)
  cadenceMult: 1.18, // …+18 % de dégâts
  thirstThreshold: 0.5, // Soif : sous 50 % PV…
  // …⚠️ le PLAFOND DE SOIN du tour est multiplié (refonte équipement, étape 7). Tripler le vol
  // de vie ne servait à rien (0 % mesuré) : le soin bute sur le plafond bien avant.
  thirstHealCapMult: 1.4,
  // ── Refonte équipement (étape 5) : 19 effets, chacun sur les stats de SON emplacement ──
  livingArmorThreshold: 0.3, // Cuirasse vivante : sous 30 % PV, une fois…
  livingArmorPct: 0.2, // …une barrière de 20 % des PV max
  scarringMult: 2, // Cicatrisation : régénération entre deux combats doublée…
  // …⚠️ et une part des PV max rendue à CHAQUE tour du héros (étape 7), hors plafond du vol de
  // vie : entre deux combats seulement, elle ne valait rien contre un boss (0 % mesuré).
  scarringTurnHeal: 0.02,
  // Riposte affûtée : ses ripostes, déjà des critiques, frappent aussi plus fort (étape 7) —
  // seulement critiques, elles n'apportaient presque rien à un joueur déjà près du plafond.
  whettedMult: 3,
  // Sang-froid : les critiques ennemis n'en sont plus — dès 101 %, donc TOUJOURS (étape 7 :
  // sous un seuil de PV il ne valait que 0,5 à 3 %, les ennemis critiquant peu).
  sangFroidThreshold: 1.01,
  vigilanceCrits: 3, // Vigilance : les 3 premiers critiques reçus sont annulés
  // Sceau de rage : ta rage reste active quels que soient tes PV (dès 101 %). À 50 % il ne
  // valait que ~1 %, même avec 30 % de rage (étape 7).
  rageSealThreshold: 1.01,
  hunterThreshold: 0.75, // Chasseur : critique certain sur un ennemi sous 75 % PV
  enduranceThreshold: 0.5, // Endurance : active sous 50 % PV
  enduranceReduction: 0.2, // Endurance : −20 % de dégâts subis en plus
  quarryThreshold: 0.3, // Curée : déclenche quand l'ennemi passe sous 30 % PV
  quarryHealPct: 0.22, // Curée : soigne 22 % des PV max du joueur (1× par combat)
  // SIGNATURES DE SET (v0.835) — le 4-pièces d'un set porté dans SA voie. Même famille que
  // les procs : non-scalantes, déterministes (aucune ne consomme de rng).
  // ⚠️ REFONTE ÉQUIPEMENT (étape 7) — RECALIBRÉES À ZÉRO sur le format 6 pièces (spec § 6.2) :
  // un set complet dans sa voie vaut +5 à +10 % contre les meilleurs drops, et « 4 pièces +
  // 2 meilleurs drops » vaut « 6 pièces » à ±3 %. Mesuré en vrai combat (boss de palier,
  // niveaux 30/60/90, 3 builds de référence, dichotomie du multiplicateur de boss à 50 %) :
  // signature seule +2 à +6 %. Elles valaient +3 % (Transe, Inébranlable) à +46 % (Soif
  // éternelle) — le Vampire et l'Épineux gagnaient leur set par leur seule signature.
  carnageMax: 0.45, // Berserker · Carnage : +dégâts ∝ PV manquants de l'ennemi, jusqu'à +45 %
  bastionHits: 3, // Gardien · Bastion : les 3 premières attaques ennemies qui touchent…
  bastionMult: 0.76, // …sont réduites d'un quart
  graceCritMult: 2.2, // Assassin · Coup de grâce : un critique inflige ×2,2 au lieu de ×2
  eternalHealCapMult: 1.2, // Vampire · Soif éternelle : plafond de soin par tour ×1,2
  unshakenMaxHitPct: 0.4, // Colosse · Inébranlable : un coup retire au plus 40 % des PV max
  secretThrustEvery: 3, // Duelliste · Botte secrète : un coup porté sur 3 est critique…
  secretThrustMult: 2.3, // …et ce critique-là inflige ×2,3
  bramblesMaxPvPct: 0.009, // Épineux · Ronces : chaque coup reçu retire 0,9 % des PV max ennemis
  tranceMaxStacks: 6, // Frénétique · Transe : l'élan se cumule jusqu'à 6 tours au lieu de 4
  // ⚠️ POIDS DES STATS DANS `combatPower` (v0.837, mesurés en vrai combat) : la puissance
  // comptait le vol de vie PLEIN et ignorait son plafond de soin par tour, sur-valorisait
  // l'élan et les épines. L'optimiseur montait donc des stats qui brillaient à l'écran sans
  // gagner. Vol de vie : ×0,43 et plafonné à 0,3 (au-delà, le plafond de soin mange tout).
  // ⚠️ Ces deux-là sont l'ESTIMATEUR DE DIMENSIONNEMENT (`offenseOf`) : routes, camps et
  // failles calent leurs ennemis dessus, et leurs bandes ont été MESURÉES avec lui. La
  // puissance AFFICHÉE compte le vol de vie autrement, cf. `powerSustainW`.
  powerLifestealW: 0.43,
  powerLifestealCap: 0.3,
  // ⚠️ REFONTE ÉQUIPEMENT (étape 7) — la PUISSANCE AFFICHÉE compte le vol de vie pour ce qu'il
  // est : de la SURVIE, dont la valeur est le SOIN PAR TOUR, plafonné à `lifestealRoundCap` des
  // PV max. Part des PV rendue par tour = min(plafond, vol de vie × dégâts par tour ÷ PV).
  // Mesuré en vrai combat (boss de palier ET donjon, 3 builds de référence) : le gain PLAFONNE
  // exactement là où ce soin atteint le plafond, et au plafond il vaut +24 % de puissance au
  // niveau 60 (+35 % au 30, +9,5 % au 90). L'écran en montrait +4 % : l'optimiseur laissait de
  // côté la stat qui gagnait le plus de combats en milieu de partie.
  // ⚠️ PAS dans `survivalOf` — essayé et MESURÉ : sa valeur réelle dépend du niveau, et
  // l'escorte de référence en porte plus ou moins selon le niveau ; dimensionner la route
  // dessus la rendait trop dure au niveau 26-45 et trop facile au 85 (elle était plate).
  // Même règle que les effets légendaires et les pouvoirs de relique : ils ne pèsent que dans
  // `combatPowerRaw`.
  powerSustainW: 3,
  powerThornsW: 0.04,
  // Élan PAR TOUR (étape 1) : mesuré en vrai combat, +1 d'élan vaut ~+2,4 à +3,0 de dégâts
  // (boss et donjon, niveaux 30/60/90, 3 builds) → 2,75. Le 4,5 d'avant valait pour l'élan
  // par coup, toujours au maximum dès le 1er tour.
  powerMomentumW: 2.75,
  powerMomentumWPerHit: 4.5, // aventuriers : l'élan par coup d'avant, inchangé
  // ── Refonte équipement (étape 3) ──
  blockKeep: 0.25, // un coup bloqué ne fait que 25 % de ses dégâts
  accuracyOpenAbove: 0.75, // précision : bonus de dégâts tant que l'ennemi est au-dessus
  bleedTicks: 3, // le saignement se vide sur 3 tours de l'ennemi
  // Poids dans combatPower, MESURÉS en vrai combat (étape 3) : la stat ajoutée seule à un
  // build de référence équipé (gearedFighter), boss de palier + donjon le plus profond,
  // niveaux 30/60/90, 2 builds ; on cherche le gain de dégâts (attaque) ou de PV (survie)
  // qui donne le même taux de victoire. Dégâts critiques : la formule suffit (+15,6 % mesuré
  // pour +16,7 % annoncé à 0,5).
  powerBleedW: 0.66, // saignement 0,3 → +19,8 % de dégâts
  powerAccuracyW: 0.28, // précision 0,3 → +8,3 % de dégâts
  powerRiposteW: 0.26, // riposte 0,3 → +7,8 % de dégâts
  powerBlockW: 0.91, // blocage 0,3 → +25,7 % de PV
  powerParryW: 0.96, // parade 0,15 → +16,9 % de PV
  powerCritResistW: 0.14, // résistance aux critiques 0,5 → +6,8 % de PV
  powerShieldW: 0.52, // barrière de départ 0,3 → +15,6 % de PV
};

/** Construit le combattant du joueur à partir de ses 3 stats et de son NIVEAU. */
export function playerCombatant(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  level = 1,
): Combatant {
  const L = Math.max(1, level);
  return {
    name,
    pv: Math.round(COMBAT.pvBase + COMBAT.pvPerLevel * L + stats.endurance * COMBAT.pvPerEndurance),
    damage: Math.max(
      1,
      Math.round(
        COMBAT.baseDamage + COMBAT.damagePerLevel * L + stats.puissance * COMBAT.damagePerPuissance,
      ),
    ),
    crit: Math.min(COMBAT.critCap, stats.agilite * COMBAT.critPerAgilite),
    dodge: Math.min(COMBAT.dodgeCap, stats.agilite * COMBAT.dodgePerAgilite),
    initiative: stats.agilite,
    dmgReduction: Math.min(COMBAT.defCap, stats.puissance * COMBAT.defPerPuissance),
    strikes: 1 + stats.agilite * COMBAT.strikePerAgilite,
  };
}

/**
 * OFFENSE PAR TOUR d’un combattant, **signatures comprises**.
 *
 * ⚠️ EXTRAITE DE `combatPower`, qui se reconstruit désormais dessus — la dette était
 * notée depuis la v0.753 « pour le jour où l’une des deux bouge ». Ce jour est arrivé :
 * la copie de `caravan.ts` ignorait les signatures (`execute`/`rage`/`momentum`, vol de
 * vie, épines) que `simulateCombat` applique pourtant. Comme elle sert à DIMENSIONNER
 * les bandits, chaque signature gagnée par l’escorte la renforçait **sans renforcer la
 * route** : mesuré, un trio passait de 76 % de victoires (0 signature) à 100 %
 * (10 signatures). Une seule formule, donc plus d’écart possible.
 *
 * ⚠️ Les conditionnelles sont pondérées par leur valeur MOYENNE attendue, pas leur
 * valeur au déclenchement : `execute` ne vaut que sous 25 % des PV adverses, `rage`
 * que sous 30 % des siens (rare dans un combat gagné), `momentum` ne monte qu’à
 * mi-course sur des combats courts. Recalibré 2026‑08‑23.
 */
export function offenseOf(c: Combatant): number {
  const sig =
    1 +
    0.12 * (c.execute ?? 0) +
    0.1 * (c.rage ?? 0) +
    (c.momentum ?? 0) * (c.momentumPerHit ? COMBAT.powerMomentumWPerHit : COMBAT.powerMomentumW);
  return (
    c.damage *
    (c.strikes ?? 1) *
    (1 + c.crit * (1 + (c.critDmg ?? 0))) *
    (1 + COMBAT.powerBleedW * (c.bleed ?? 0)) *
    (1 + COMBAT.powerAccuracyW * (c.accuracy ?? 0)) *
    (1 + COMBAT.powerRiposteW * (c.riposte ?? 0)) *
    lifestealSizingFactor(c) *
    sig *
    (1 + COMBAT.powerThornsW * (c.thorns ?? 0)) // épines = offense conditionnelle (si frappé)
  );
}

/** Le vol de vie tel que l'ESTIMATEUR DE DIMENSIONNEMENT le compte (cf. `powerLifestealW`). */
function lifestealSizingFactor(c: Combatant): number {
  return 1 + COMBAT.powerLifestealW * Math.min(COMBAT.powerLifestealCap, c.lifesteal ?? 0);
}

/** Part des PV max rendue par tour par le vol de vie, plafonnée comme en combat. */
function lifestealHealShare(c: Combatant): number {
  if (!c.lifesteal || c.pv <= 0) return 0;
  const cap =
    COMBAT.lifestealRoundCap * (c.procs?.has('sig_vampire') ? COMBAT.eternalHealCapMult : 1);
  const perRound = c.damage * (c.strikes ?? 1) * (1 + c.crit * (1 + (c.critDmg ?? 0)));
  return Math.min(cap, (c.lifesteal * perRound) / c.pv);
}

/** SURVIE d’un combattant — PV corrigés de l’esquive et de la réduction. */
export function survivalOf(c: Combatant): number {
  return (
    ((c.pv / 100 / (1 - c.dodge) / (1 - (c.dmgReduction ?? 0))) *
      (1 + COMBAT.powerShieldW * (c.startShield ?? 0)) *
      (1 + COMBAT.powerCritResistW * (c.critResist ?? 0))) /
    (1 - COMBAT.powerBlockW * (1 - COMBAT.blockKeep) * (c.block ?? 0)) /
    (1 - Math.min(0.9, COMBAT.powerParryW * (c.parry ?? 0)))
  );
}

/** Indice synthétique de puissance de combat (offense × survie) — pour l'UI. */
export function combatPower(c: Combatant): number {
  return Math.round(combatPowerRaw(c));
}

/** La même puissance, NON ARRONDIE — pour COMPARER de petits écarts.
 *  ⚠️ Un aventurier de niveau 5 vaut ~12 : l'arrondi y efface le gain d'un compagnon ou
 *  d'un talent, et un choix « au mieux » fondé sur le chiffre arrondi ne confiait rien
 *  (mesuré sur un vivier réel : 1 familier et 0 talent sur 15 aventuriers). Une seule
 *  formule : `combatPower` n'en est que l'arrondi. */
export function combatPowerRaw(c: Combatant): number {
  // Effets CONDITIONNELS pondérés par leur valeur MOYENNE réellement attendue sur un
  // combat (recalibré 2026‑08‑23 : les anciens poids sur‑valuaient l'offense conditionnelle
  // → un build tout‑execute/rage/momentum affichait une grosse « puissance » mais mourait
  // en vrai combat). execute ne s'applique qu'à l'ennemi < 25 % PV ; rage qu'à TOI < 30 % PV
  // (rare dans un combat gagné) ; momentum ne ramp qu'à moitié en moyenne (fights courts).
  const offense = offenseOf(c);
  const survie = survivalOf(c);
  // Procs LÉGENDAIRES (non-scalants) : petit bonus fixe par proc, réparti offense/survie,
  // pour qu'équiper un objet légendaire améliore la puissance affichée/comparée.
  let procOff = 1;
  let procSurv = 1;
  if (c.procs)
    for (const p of c.procs) {
      const w = PROC_POWER[p];
      if (w?.side === 'off') procOff += w.weight;
      else if (w) procSurv += w.weight;
    }
  if (c.relic) {
    const w = RELIC_POWER_W[c.relic.id];
    if (w.side === 'off') procOff += w.weight * c.relic.force;
    else procSurv += w.weight * c.relic.force;
  }
  // Le vol de vie : l'estimateur (`offenseOf`) est remplacé par sa valeur MESURÉE (soin par
  // tour, en survie) — cf. `powerSustainW`.
  procSurv *= (1 + COMBAT.powerSustainW * lifestealHealShare(c)) ** 2 / lifestealSizingFactor(c);
  // offense×survie croît ≈ niveau⁴ → chiffres énormes (dizaines de milliers dès le
  // début). On prend la RACINE : indice toujours monotone/comparable mais à échelle
  // humaine (~niveau², qq centaines au milieu de jeu au lieu de dizaines de milliers).
  return Math.sqrt(offense * procOff * survie * procSurv);
}

/** Format compact d'une puissance de combat (≈ niveau⁴ → jusqu'aux millions).
 *  Affichée EN ENTIER tant que ≤ 9999 (lisibilité), puis compactée (k / M). */
export function fmtPow(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace('.', ',') + 'M';
  if (n > 9999) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return String(Math.round(n));
}
/** Delta signé PRÉCIS entre deux puissances (petit écart = valeur exacte, gros
 *  écart = compact) → visible même quand `fmtPow` arrondit les deux pareil. */
export function fmtDelta(cur: number, next: number): string {
  const d = Math.round(next - cur);
  return (d >= 0 ? '+' : '−') + fmtPow(Math.abs(d));
}

type CombatActor = 'player' | 'monster';
type CombatEventType = 'hit' | 'crit' | 'dodge';

/**
 * ⚔️ UNE COMPÉTENCE QUI A MORDU SUR UN COUP.
 *
 * ⚠️ **SEULEMENT LES CONDITIONNELLES.** Les passives (dégâts, PV, critique, réduction) se
 * lisent déjà dans les chiffres du log ; les annoncer noierait ce qui se passe VRAIMENT
 * sous ce qui est toujours vrai.
 *
 * ⚠️ **LECTURE SEULE, ET C'EST L'INVARIANT** : marquer un coup ne consomme aucun tirage et
 * ne change aucune valeur. Un combat seedé rend exactement le même résultat avec ou sans
 * ces marques — un test d'empreinte le verrouille, parce que c'est la propriété sur
 * laquelle repose TOUTE la calibration du jeu (donjons, boss, route, sièges).
 */
export type CombatSkill =
  /**
   * ── Signatures, celles que portent les CHAMPIONS et les classes ──
   * ⚠️ Ce sont les `EffectType` conditionnels, **sans leur suffixe `_pct`** : un seul mot
   * pour la stat et pour son déclenchement, donc aucune table de correspondance à tenir.
   */
  | 'execute'
  | 'rage'
  | 'momentum'
  | 'lifesteal'
  | 'thorns'
  | 'bleed'
  | 'block'
  | 'parry'
  | 'riposte'
  | 'start_shield'
  /**
   * ── Procs légendaires et signatures de set ──
   * ⚠️ **LES IDS DE `LEGENDARY_PROCS` ET DE `SET_SIGNATURES`, à la lettre.** Inventer une
   * seconde nomenclature (« carnage » pour `sig_berserker`) aurait garanti qu'elles
   * divergent — et le libellé affiché est déjà écrit là-bas, avec son emoji.
   */
  | 'initiative'
  | 'predator_eye'
  | 'aegis'
  | 'retort'
  | 'phoenix'
  | 'secondwind'
  | 'executioner'
  | 'vampiric'
  | 'rp_brasier'
  | 'rp_rempart'
  | 'rp_coup_fatal'
  | 'rp_festin'
  | 'rp_tempete'
  | 'rp_riposte_parfaite'
  | 'rp_ronces'
  | 'rp_carapace'
  | 'rp_ouverture'
  | 'rp_moisson'
  | 'rp_phenix'
  | 'rp_second_souffle'
  | 'living_armor'
  | 'scarring'
  | 'vigilance'
  | 'sang_froid'
  | 'sidestep'
  | 'dance'
  | 'rage_seal'
  | 'hunter'
  | 'charge'
  | 'cadence'
  | 'quarry'
  | 'endurance'
  | 'whetted'
  | 'thirst'
  | 'sig_berserker'
  | 'sig_gardien'
  | 'sig_assassin'
  | 'sig_vampire'
  | 'sig_colosse'
  | 'sig_duelliste'
  | 'sig_epineux'
  | 'sig_frenetique';

export interface CombatEvent {
  round: number;
  who: CombatActor; // qui attaque
  type: CombatEventType;
  damage: number;
  playerPv: number; // PV restants après l'événement
  monsterPv: number;
  /** Les compétences qui ont mordu sur CE coup. ⚠️ ABSENT quand il n'y en a aucune, au
   *  lieu d'un tableau vide : un combat en produit ~150, et la plupart des coups sont
   *  ordinaires — on n'alloue que lorsqu'il y a quelque chose à dire. */
  skills?: CombatSkill[];
  /** 🔮 Jauge de la relique APRÈS cet événement (0..100) — seulement si le héros en porte une. */
  gauge?: number;
}
export interface CombatResult {
  win: boolean;
  rounds: number;
  log: CombatEvent[];
  gold: number; // 0 si défaite
  /** 🔮 Jauge de la relique en fin de combat (reportée au combat suivant d'un donjon). */
  gauge?: number;
}

/** Simule un combat auto tour par tour. `seed` rend le combat reproductible. */
export function simulateCombat(
  player: Combatant,
  monster: Combatant,
  opts: { seed: number; goldOnWin: number; startPlayerPv?: number; gauge?: number },
): CombatResult {
  const rng = mulberry32(opts.seed);
  let pPv = opts.startPlayerPv ?? player.pv;
  let mPv = monster.pv;
  const maxPPv = player.pv;
  const log: CombatEvent[] = [];
  let turn: CombatActor = player.initiative >= monster.initiative ? 'player' : 'monster';
  let round = 0;
  const monsterMaxPv = monster.pv;
  let pStacks = 0; // Déferlante : tours ACHEVÉS du joueur dans CE combat (par tour, pas par coup)

  // Procs légendaires du JOUEUR (non-scalants, one-shot par combat).
  const has = (p: string): boolean => player.procs?.has(p) ?? false;
  let pTurn = 0; // tours du JOUEUR entamés (Initiative / Œil / Charge / Riposte)
  let mFirstLanded = true; // 1re attaque ennemie qui TOUCHE le joueur (Égide / Rétorsion)
  // 🔮 Relique : Phénix et Second souffle en pouvoir (force) ou en effet d'avant (fixe).
  const relic = player.relic;
  const rid = relic?.id;
  const rf = relic?.force ?? 0;
  let phoenixReady = has('phoenix') || rid === 'phenix';
  let secondWindReady = has('secondwind') || rid === 'second_souffle';
  // Procs de SET (v0.701). ⚠️ Tous DÉTERMINISTES : aucun n'appelle `rng`, sinon deux objets
  // de procs différents feraient diverger un combat seedé — et tous les rejeux animés avec.
  let livingArmorReady = has('living_armor'); // Cuirasse vivante : une barrière, une fois
  let vigilanceLeft = has('vigilance') ? COMBAT.vigilanceCrits : 0; // critiques reçus annulés
  let sidestepReady = has('sidestep'); // Pas de côté : la 1re attaque est esquivée
  let quarryReady = has('quarry'); // Curée : soigne une fois, quand l'ennemi passe sous 30 %
  let pHits = 0; // coups PORTÉS par le joueur (Botte secrète)
  let retortLeft = has('retort') ? COMBAT.retortHits : 0;
  let bastionLeft = has('sig_gardien') ? COMBAT.bastionHits : 0; // Bastion : coups amortis restants
  const perHit = !!player.momentumPerHit;
  const baseCap = perHit ? COMBAT.momentumMaxStacksPerHit : COMBAT.momentumMaxStacks;
  const momentumCap = has('sig_frenetique')
    ? perHit
      ? COMBAT.tranceMaxStacksPerHit
      : COMBAT.tranceMaxStacks
    : baseCap;
  const critMult = (has('sig_assassin') ? COMBAT.graceCritMult : 2) + (player.critDmg ?? 0);
  // Refonte équipement (étape 3). ⚠️ Chaque tirage n'a lieu QUE si le joueur porte la stat :
  // sans elle, un combat seedé reste identique au bit près (test d'empreinte).
  let bleedPool = 0; // saignement en réserve (se vide sur les tours ennemis)
  let shieldLeft = Math.round(maxPPv * (player.startShield ?? 0)); // barrière de départ
  // Parade : l'ennemi sautera son prochain tour. ⚠️ Jamais deux de suite, et SANS garde :
  // un tour sauté ne contient aucune attaque, donc aucune parade possible (mesuré par
  // mutation, un garde « pas deux de suite » ne pouvait jamais mordre).
  let stunNext = false;
  const monsterCritMult = 1 + (1 - (player.critResist ?? 0)); // ×2 réduit par la résistance
  /** Une VOLÉE du héros (les coups d'un tour), sans variance : critique moyen, ou entier. */
  const volley = (critFull: boolean): number =>
    player.damage *
    (player.strikes ?? 1) *
    (1 + (critFull ? critMult - 1 : player.crit * (critMult - 1)));
  // 🔮 JAUGE DE RELIQUE. Ouverture : pleine au début de CHAQUE combat.
  let gauge = rid === 'ouverture' ? RELIC.full : Math.min(RELIC.full, opts.gauge ?? 0);
  let relicStock = 0; // Rempart / Ronces / Festin : ce qui a été accumulé
  let fatalNext = false; // Coup fatal : le prochain coup du héros
  let momentumOffset = 0; // Tempête : l'élan retombe à zéro
  let harvest = 0; // Moisson : bonus de dégâts de CE combat
  let harvestFresh = false; // Moisson : le bonus vient de s'allumer en combat (à annoncer)
  if (rid === 'moisson' && gauge >= RELIC.full) {
    harvest = RELIC.moissonBuff * rf;
    gauge = 0;
  }
  const push = (e: CombatEvent): void => {
    if (relic) e.gauge = Math.round(gauge);
    log.push(e);
  };
  /** Remplit la jauge ; `true` si elle est pleine. */
  const charge = (n: number): boolean => {
    gauge = Math.min(RELIC.full, gauge + n * (relic?.fast ? RELIC.fastMult : 1));
    return gauge >= RELIC.full;
  };
  /** Un coup de relique : un événement à part, la jauge repart de zéro. `raw` passe par la
   *  réduction ennemie, sauf un stock (déjà des dégâts subis/évités, comme les épines). */
  const relicHit = (raw: number, skill: CombatSkill, pierce = false): void => {
    gauge = 0;
    if (mPv <= 0) return;
    const r = Math.max(1, Math.round(pierce ? raw : raw * (1 - (monster.dmgReduction ?? 0))));
    mPv = Math.max(0, mPv - r);
    push({
      round,
      who: 'player',
      type: 'hit',
      damage: r,
      playerPv: pPv,
      monsterPv: mPv,
      skills: [skill],
    });
  };
  /** Vide le stock en un coup, plafonné à une part des PV max ennemis. */
  const releaseStock = (skill: CombatSkill): void => {
    const cap = monsterMaxPv * RELIC.stockCapPct * rf;
    relicHit(Math.min(relicStock * rf, cap), skill, true);
    relicStock = 0;
  };
  /** Une RIPOSTE : une volée (les coups d'un tour du héros), sans variance ni tirage.
   *  Critique MOYEN compris ; Riposte affûtée (bouclier) en fait un critique entier. */
  const riposteVolley = (extra: CombatSkill[]): void => {
    if (pPv <= 0 || mPv <= 0) return;
    const sharp = has('whetted');
    const r = Math.max(
      1,
      Math.round(
        volley(sharp) * (sharp ? COMBAT.whettedMult : 1) * (1 - (monster.dmgReduction ?? 0)),
      ),
    );
    mPv = Math.max(0, mPv - r);
    const skills: CombatSkill[] = ['riposte', ...extra];
    if (sharp) skills.push('whetted');
    push({
      round,
      who: 'player',
      type: 'hit',
      damage: r,
      playerPv: pPv,
      monsterPv: mPv,
      skills,
    });
    // Riposte parfaite : chaque riposte charge la jauge.
    if (rid === 'riposte_parfaite' && charge(RELIC.riposteCharge))
      relicHit(volley(true) * rf, 'rp_riposte_parfaite');
  };

  // Nombre de frappes d'un tour (Vitesse) : partie entière + reste probabiliste.
  const strikeCount = (c: Combatant): number => {
    const s = c.strikes ?? 1;
    const n = Math.floor(s);
    return n + (rng() < s - n ? 1 : 0);
  };

  while (pPv > 0 && mPv > 0 && round < COMBAT.maxRounds) {
    round++;
    const atk = turn === 'player' ? player : monster;
    const def = turn === 'player' ? monster : player;
    if (turn === 'monster') {
      // Saignement : une part de la réserve tombe au début de chaque tour ennemi.
      if (bleedPool > 0) {
        const tick = Math.max(1, Math.round(bleedPool / COMBAT.bleedTicks));
        bleedPool = Math.max(0, bleedPool - tick);
        mPv = Math.max(0, mPv - tick);
        push({
          round,
          who: 'player',
          type: 'hit',
          damage: tick,
          playerPv: pPv,
          monsterPv: mPv,
          skills: ['bleed'],
        });
        if (mPv <= 0) break;
      }
      // Parade : l'ennemi étourdi saute ce tour (jamais deux de suite).
      if (stunNext) {
        stunNext = false;
        turn = 'player';
        continue;
      }
    }
    const hits = Math.max(1, strikeCount(atk));
    if (turn === 'player') {
      pTurn++;
      if (has('scarring'))
        pPv = Math.min(maxPPv, pPv + Math.round(maxPPv * COMBAT.scarringTurnHeal));
      if (!perHit) pStacks = pTurn - 1 - momentumOffset; // l'élan monte à chaque tour du héros
      // 🔮 Pouvoirs qui se chargent au fil des tours.
      if (rid === 'ouverture') {
        if (gauge >= RELIC.full) relicHit(volley(false) * RELIC.ouvertureMult * rf, 'rp_ouverture');
        charge(RELIC.ouvertureCharge);
      } else if (rid === 'brasier') {
        const rageAt = has('rage_seal') ? COMBAT.rageSealThreshold : COMBAT.rageThreshold;
        const brasierAt = Math.max(rageAt, RELIC.brasierThreshold);
        if (pPv / maxPPv < brasierAt && charge(RELIC.brasierCharge)) {
          const missing = 1 - pPv / maxPPv;
          relicHit(
            volley(false) * RELIC.brasierMult * rf * (1 + RELIC.brasierMissing * missing),
            'rp_brasier',
          );
        }
      } else if (rid === 'tempete' && !perHit && pStacks >= momentumCap) {
        if (charge(RELIC.tempeteCharge)) {
          momentumOffset = pTurn - 1; // l'élan retombe (il repart de 1 au tour suivant)
          pStacks = 0;
          relicHit(volley(false) * RELIC.tempeteMult * rf, 'rp_tempete');
        }
      }
      if (mPv <= 0) break;
    }
    const opening = turn === 'player' && has('initiative') && pTurn <= COMBAT.initiativeTurns;
    // Œil du prédateur : les premiers tours sont inesquivables (prolonge la précision du casque).
    const eyeOpen = turn === 'player' && has('predator_eye') && pTurn <= COMBAT.predatorTurns;
    // Soif : sous 50 % PV, le plafond de soin du tour est multiplié.
    const thirsty = turn === 'player' && has('thirst') && pPv / maxPPv < COMBAT.thirstThreshold;
    // Soin de vol de vie de CE tour, plafonné à une fraction des PV max de l'attaquant
    // (empêche le multi-frappe de rendre le sustain infini — cf. COMBAT.lifestealRoundCap).
    let roundHeal = 0;
    const healCap = Math.round(
      (turn === 'player' ? maxPPv : monsterMaxPv) *
        COMBAT.lifestealRoundCap *
        (turn === 'player' && has('sig_vampire') ? COMBAT.eternalHealCapMult : 1) *
        (thirsty ? COMBAT.thirstHealCapMult : 1),
    );
    // Vampirisme : sa propre réserve de soin par tour, HORS du plafond ci-dessus.
    let vampiricLeft = turn === 'player' ? Math.round(maxPPv * COMBAT.vampiricCapPct) : 0;
    const gainHeal = (raw: number): number => {
      const h = Math.max(0, Math.min(raw, healCap - roundHeal));
      roundHeal += h;
      // Festin : le soin PERDU au plafond du tour devient un stock de dégâts.
      if (rid === 'festin' && turn === 'player' && raw > h) {
        relicStock += raw - h;
        if (charge(((raw - h) / (maxPPv * RELIC.festinScale)) * RELIC.full))
          releaseStock('rp_festin');
      }
      return h;
    };
    for (let h = 0; h < hits && pPv > 0 && mPv > 0; h++) {
      // ⚠️ `undefined` tant que rien n'a mordu — cf. `CombatEvent.skills`.
      let skills: CombatSkill[] | undefined;
      const mark = (s: CombatSkill) => (skills ??= []).push(s);
      if (turn === 'player') {
        // ── Attaque du JOUEUR ──
        const fatal = fatalNext;
        fatalNext = false;
        if (!opening && !eyeOpen && !fatal && rng() < def.dodge * (1 - (atk.accuracy ?? 0))) {
          push({ round, who: turn, type: 'dodge', damage: 0, playerPv: pPv, monsterPv: mPv });
          continue;
        }
        if (eyeOpen && !opening) mark('predator_eye');
        let crit = rng() < atk.crit;
        // Chasseur : critique certain sur un ennemi affaibli.
        if (has('hunter') && mPv / monsterMaxPv < COMBAT.hunterThreshold) {
          crit = true;
          mark('hunter');
        }
        // Botte secrète : un coup porté sur N est un critique appuyé, sans jet.
        const thrust = has('sig_duelliste') && (pHits + 1) % COMBAT.secretThrustEvery === 0;
        if (thrust) {
          crit = true;
          mark('sig_duelliste');
        }
        const variance = COMBAT.varianceMin + rng() * COMBAT.varianceSpan;
        if (fatal) {
          crit = true;
          mark('rp_coup_fatal');
        }
        const cm = fatal
          ? critMult * (1 + RELIC.fatalBonus * rf)
          : thrust
            ? Math.max(critMult, COMBAT.secretThrustMult)
            : critMult;
        // Coup fatal : chaque critique porté charge la jauge (pas le coup fatal lui-même).
        if (crit && !fatal && rid === 'coup_fatal' && charge(RELIC.fatalCharge)) {
          gauge = 0;
          fatalNext = true;
        }
        // Coup de grâce : il ne se déclenche pas, il AMPLIFIE chaque critique (il est déjà
        // dans `critMult`, calculé hors boucle) — donc on le marque sur le coup concerné.
        if (crit && has('sig_assassin')) mark('sig_assassin');
        let dmg = Math.max(1, Math.round(atk.damage * (crit ? cm : 1) * variance));
        if (opening) {
          dmg = Math.round(dmg * COMBAT.initiativeMult);
          mark('initiative');
        }
        // Œil du prédateur : ses premiers tours frappent aussi plus fort.
        if (eyeOpen) dmg = Math.round(dmg * COMBAT.predatorMult);
        // Charge : ouverture brutale, sur le(s) premier(s) tour(s).
        if (has('charge') && pTurn <= COMBAT.chargeTurns) {
          dmg = Math.round(dmg * COMBAT.chargeMult);
          mark('charge');
        }
        // Cadence : récompense au contraire la DURÉE — l'élan, pas l'ouverture.
        if (
          has('cadence') &&
          (perHit ? pHits >= COMBAT.cadenceFromHit - 1 : pTurn >= COMBAT.cadenceFrom)
        ) {
          dmg = Math.round(dmg * COMBAT.cadenceMult);
          mark('cadence');
        }
        // Effets signature (conditionnels), avant réduction.
        let mult = 1;
        if (atk.execute && mPv / monsterMaxPv < COMBAT.executeThreshold) {
          mult += atk.execute;
          mark('execute');
        }
        if (atk.accuracy && mPv / monsterMaxPv > COMBAT.accuracyOpenAbove) mult += atk.accuracy;
        const rageAt = has('rage_seal') ? COMBAT.rageSealThreshold : COMBAT.rageThreshold;
        if (atk.rage && pPv / maxPPv < rageAt) {
          mult += atk.rage;
          mark(pPv / maxPPv < COMBAT.rageThreshold ? 'rage' : 'rage_seal');
        }
        if (atk.momentum && pStacks > 0) {
          mult += Math.min(momentumCap, pStacks) * atk.momentum;
          mark(momentumCap > baseCap ? 'sig_frenetique' : 'momentum');
        } else if (atk.momentum) mult += Math.min(momentumCap, pStacks) * atk.momentum;
        // Carnage : plus l'ennemi saigne, plus on frappe fort.
        if (has('sig_berserker')) {
          mult += COMBAT.carnageMax * (1 - mPv / monsterMaxPv);
          mark('sig_berserker');
        }
        if (harvest) {
          mult += harvest;
          if (pHits === 0 || harvestFresh) mark('rp_moisson');
          harvestFresh = false;
        }
        if (mult !== 1) dmg = Math.max(1, Math.round(dmg * mult));
        if (def.dmgReduction) dmg = Math.max(1, Math.round(dmg * (1 - def.dmgReduction)));
        mPv = Math.max(0, mPv - dmg);
        // Moisson : la jauge se remplit aussi des PV arrachés à l'ennemi (charge en combat).
        if (rid === 'moisson' && !harvest && mPv > 0) {
          if (charge((dmg / monsterMaxPv / RELIC.moissonHpShare) * RELIC.full)) {
            harvest = RELIC.moissonBuff * rf;
            harvestFresh = true;
            gauge = 0;
          }
        }
        if (atk.bleed) {
          bleedPool += dmg * atk.bleed;
          mark('bleed');
        }
        if (perHit) pStacks++; // aventuriers : élan par coup (règle d'avant)
        if (atk.lifesteal) {
          const before = pPv;
          const cap0 = roundHeal;
          pPv = Math.min(maxPPv, pPv + gainHeal(Math.round(dmg * atk.lifesteal)));
          const overCap =
            thirsty && roundHeal > maxPPv * COMBAT.lifestealRoundCap && roundHeal > cap0;
          if (pPv > before) mark(overCap ? 'thirst' : 'lifesteal');
        }
        // Vampirisme : les crits soignent (compte dans le plafond de soin du tour).
        if (crit && has('vampiric')) {
          const before = pPv;
          const h = Math.min(vampiricLeft, Math.round(dmg * COMBAT.vampiricHealPct));
          vampiricLeft -= h;
          pPv = Math.min(maxPPv, pPv + h);
          if (pPv > before) mark('vampiric');
        }
        // Bourreau : exécute un ennemi tombé très bas.
        if (mPv > 0 && has('executioner') && mPv / monsterMaxPv < COMBAT.executeKillThreshold) {
          mPv = 0;
          mark('executioner');
        }
        // Curée : la mise à mort qui approche te remet en selle (hors plafond de soin du
        // tour — c'est un proc one-shot, pas du vol de vie répété).
        if (quarryReady && mPv > 0 && mPv / monsterMaxPv < COMBAT.quarryThreshold) {
          pPv = Math.min(maxPPv, pPv + Math.round(maxPPv * COMBAT.quarryHealPct));
          quarryReady = false;
          mark('quarry');
        }
        pHits++;
        push({
          round,
          who: turn,
          type: crit ? 'crit' : 'hit',
          damage: dmg,
          playerPv: pPv,
          monsterPv: mPv,
          ...(skills ? { skills } : {}),
        });
      } else {
        // ── Attaque du MONSTRE ──
        // Pas de côté : la 1re attaque est esquivée d'office (sans tirage).
        const stepped = sidestepReady;
        if (stepped || rng() < def.dodge) {
          sidestepReady = false;
          push({
            round,
            who: turn,
            type: 'dodge',
            damage: 0,
            playerPv: pPv,
            monsterPv: mPv,
            ...(stepped ? { skills: ['sidestep'] } : {}),
          });
          // Pas de danse : chaque esquive déclenche une riposte.
          if (has('dance')) riposteVolley(['dance']);
          continue;
        }
        // Parade : le coup est évité et l'ennemi saute son prochain tour.
        if (def.parry && rng() < def.parry) {
          stunNext = true;
          if (rid === 'riposte_parfaite' && charge(RELIC.riposteCharge))
            relicHit(volley(true) * rf, 'rp_riposte_parfaite');
          push({
            round,
            who: turn,
            type: 'dodge',
            damage: 0,
            playerPv: pPv,
            monsterPv: mPv,
            skills: ['parry'],
          });
          continue;
        }
        let crit = rng() < atk.crit;
        // Vigilance : le 1er critique reçu est annulé. Sang-froid : sous 30 % PV, plus aucun.
        if (crit && vigilanceLeft > 0) {
          crit = false;
          vigilanceLeft--;
          mark('vigilance');
        } else if (crit && has('sang_froid') && pPv / maxPPv < COMBAT.sangFroidThreshold) {
          crit = false;
          mark('sang_froid');
        }
        const variance = COMBAT.varianceMin + rng() * COMBAT.varianceSpan;
        let dmg = Math.max(1, Math.round(atk.damage * (crit ? monsterCritMult : 1) * variance));
        let blockedStock = 0;
        if (def.block && rng() < def.block) {
          const full = dmg;
          dmg = Math.max(1, Math.round(dmg * COMBAT.blockKeep));
          blockedStock = full - dmg;
          mark('block');
        }
        if (def.dmgReduction) dmg = Math.max(1, Math.round(dmg * (1 - def.dmgReduction)));
        // Endurance : le colosse se raidit quand il saigne. S'applique APRÈS la réduction
        // ordinaire (elle s'y ajoute au lieu de la remplacer) et reste bornée par elle.
        if (has('endurance') && pPv / maxPPv < COMBAT.enduranceThreshold) {
          dmg = Math.max(1, Math.round(dmg * (1 - COMBAT.enduranceReduction)));
          mark('endurance');
        }
        // Bastion : les premiers coups qui touchent sont amortis.
        if (bastionLeft > 0 && dmg > 0) {
          dmg = Math.max(1, Math.round(dmg * COMBAT.bastionMult));
          bastionLeft--;
          mark('sig_gardien');
        }
        // Inébranlable : aucun coup ne retire plus d'une part fixe des PV max.
        if (has('sig_colosse')) {
          const avant = dmg;
          dmg = Math.min(dmg, Math.max(1, Math.round(maxPPv * COMBAT.unshakenMaxHitPct)));
          if (dmg < avant) mark('sig_colosse');
        }
        const firstEnemy = mFirstLanded;
        // Rétorsion : les premiers coups ennemis reçus blessent l'ennemi d'une part de SES PV max.
        if (retortLeft > 0 && dmg > 0) {
          mPv = Math.max(0, mPv - Math.round(monsterMaxPv * COMBAT.retortMaxPvPct));
          retortLeft--;
          mark('retort');
        }
        // Égide : amortit la 1re attaque ennemie.
        if (firstEnemy && has('aegis')) {
          dmg = Math.round(dmg * (1 - COMBAT.aegisBlock));
          mark('aegis');
        }
        mFirstLanded = false;
        const pBefore = pPv;
        // Barrière de départ : elle encaisse avant les PV.
        if (shieldLeft > 0 && dmg > 0) {
          const soaked = Math.min(shieldLeft, dmg);
          shieldLeft -= soaked;
          dmg -= soaked;
          mark('start_shield');
        }
        pPv = Math.max(0, pPv - dmg);
        // Carapace : ce qu'on encaisse se transforme en barrière.
        if (
          rid === 'carapace' &&
          dmg > 0 &&
          pPv > 0 &&
          charge((dmg / (maxPPv * RELIC.carapaceScale)) * RELIC.full)
        ) {
          shieldLeft += Math.round(maxPPv * RELIC.carapaceShield * rf);
          gauge = 0;
          mark('rp_carapace');
        }
        // Cuirasse vivante : au passage sous 30 % PV, une barrière se forme (une fois).
        if (livingArmorReady && pPv > 0 && pPv / maxPPv < COMBAT.livingArmorThreshold) {
          shieldLeft += Math.round(maxPPv * COMBAT.livingArmorPct);
          livingArmorReady = false;
          mark('living_armor');
        }
        // Phénix : amortit le coup fatal, une fois.
        if (pPv <= 0 && phoenixReady) {
          // Le coup fatal est amorti : s'il reste mortel, on tombe quand même.
          const block =
            rid === 'phenix'
              ? Math.min(RELIC.phenixMax, RELIC.phenixBlock * rf)
              : COMBAT.phoenixBlock;
          pPv = Math.max(0, pBefore - Math.round(dmg * (1 - block)));
          phoenixReady = false;
          mark(rid === 'phenix' ? 'rp_phenix' : 'phoenix');
        } else if (pPv > 0 && secondWindReady && pPv / maxPPv < COMBAT.secondWindThreshold) {
          // Second souffle : sous 30 % PV pour la 1re fois → soin.
          const heal =
            rid === 'second_souffle'
              ? Math.min(RELIC.souffleMax, RELIC.souffleHeal * rf)
              : COMBAT.secondWindHealPct;
          pPv = Math.min(maxPPv, pPv + Math.round(maxPPv * heal));
          secondWindReady = false;
          mark(rid === 'second_souffle' ? 'rp_second_souffle' : 'secondwind');
        }
        if (atk.lifesteal) {
          const avant = mPv;
          mPv = Math.min(monster.pv, mPv + gainHeal(Math.round(dmg * atk.lifesteal)));
          if (mPv > avant) mark('lifesteal');
        }
        // Épines : le joueur (défenseur) renvoie une part des dégâts reçus.
        if (def.thorns && dmg > 0) {
          const t = Math.max(1, Math.round(dmg * def.thorns));
          mPv = Math.max(0, mPv - t);
          mark('thorns');
        }
        // Ronces : chaque coup reçu blesse l'ennemi d'une part de SES PV max — les épines
        // ordinaires suivent les dégâts reçus, donc restent muettes face à un colosse.
        if (has('sig_epineux') && dmg > 0) {
          mPv = Math.max(0, mPv - Math.max(1, Math.round(monsterMaxPv * COMBAT.bramblesMaxPvPct)));
          mark('sig_epineux');
        }
        push({
          round,
          who: turn,
          type: crit ? 'crit' : 'hit',
          damage: dmg,
          playerPv: pPv,
          monsterPv: mPv,
          ...(skills ? { skills } : {}),
        });
        // 🔮 Rempart vengeur / Éclat de ronces : le stock part quand la jauge est pleine.
        if (rid === 'rempart' && blockedStock > 0) {
          if (charge(RELIC.rempartCharge))
            relicHit(volley(false) * RELIC.rempartMult * rf, 'rp_rempart');
        } else if (rid === 'ronces' && def.thorns && dmg > 0 && charge(RELIC.roncesCharge))
          relicHit(volley(false) * RELIC.roncesMult * rf, 'rp_ronces');
        // Riposte : après un coup reçu (bloqué ou non), chance de contre-attaquer aussitôt.
        // UNE VOLÉE (les coups d'un tour du héros), sans critique ni variance : elle ne tire
        // au hasard que la chance. ⚠️ Un seul coup ne valait RIEN à haut niveau, où le héros
        // frappe jusqu'à 37 fois par tour (mesuré : +0 à +6 % de puissance).
        if (def.riposte && pPv > 0 && mPv > 0 && rng() < def.riposte) riposteVolley([]);
      }
    }
    turn = turn === 'player' ? 'monster' : 'player';
  }

  // Issue du combat :
  //  - mort d'un camp → vainqueur normal ;
  //  - TIMEOUT (maxRounds atteint sans mort, cf. builds ultra-tanky/vol de vie) → on
  //    tranche par le % de PV restant (décisif et JUSTE : plus de « défaite » d'un
  //    combat qu'on dominait). Départage strict → au pire (parfaite égalité) = défaite.
  let win: boolean;
  if (mPv <= 0 && pPv > 0) win = true;
  else if (pPv <= 0) win = false;
  else win = pPv / maxPPv > mPv / monsterMaxPv; // timeout → au % de vie
  // Moisson : chaque monstre abattu charge la jauge, qui suit le donjon.
  if (win && rid === 'moisson') charge(RELIC.moissonCharge);
  return {
    win,
    rounds: round,
    log,
    gold: win ? opts.goldOnWin : 0,
    ...(relic ? { gauge: Math.round(gauge) } : {}),
  };
}

/** Part des PV max rendue ENTRE deux combats : la base du lieu + la régénération de
 *  l'équipement, DOUBLÉES par Cicatrisation (armure). Source unique donjon / Labyrinthe. */
export function betweenFightsHeal(player: Combatant, base: number): number {
  const pct = base + (player.regen ?? 0);
  return player.procs?.has('scarring') ? pct * COMBAT.scarringMult : pct;
}

export interface DungeonFoe {
  combatant: Combatant;
  gold: number;
}
/** Un combat d'un donjon, dans le log de `simulateDungeon`.
 *  ⚠️ Plus EXPORTÉ depuis que les sièges sont passés au moteur en deux phases : c'était
 *  leur seul consommateur extérieur. Le type reste, privé à son module. */
interface DungeonFight {
  monster: string;
  win: boolean;
  result: CombatResult;
  /** PV de l'adversaire TEL QU'IL A COMBATTU — rampe et attente d'équipement comprises.
   *  ⚠️ C'est le maximum de sa barre de vie. L'écran le relisait sur le monstre BRUT du
   *  bestiaire, retrouvé par son nom : un monstre de 400 k PV avait une barre calée sur
   *  ~10 k, qui restait pleine jusque-là puis disparaissait d'un coup (signalé). */
  maxPv: number;
}
export interface DungeonResult {
  cleared: boolean; // tous les monstres vaincus
  defeated: number; // nombre de monstres vaincus
  total: number;
  gold: number; // or cumulé des monstres vaincus
  finalPv: number; // PV restants
  fights: DungeonFight[];
}

/**
 * Enchaîne les monstres d'un donjon. Les PV du joueur se REPORTENT d'un combat à
 * l'autre (attrition → l'Endurance compte), avec une petite régén entre deux.
 * On s'arrête à la mort du joueur ; l'or des monstres déjà vaincus est conservé.
 */
export function simulateDungeon(
  player: Combatant,
  foes: DungeonFoe[],
  opts: { seed: number },
): DungeonResult {
  let pv = player.pv;
  let gold = 0;
  let defeated = 0;
  const fights: DungeonFight[] = [];
  let gauge = 0; // 🔮 la jauge de relique suit le donjon, comme les PV
  for (let i = 0; i < foes.length; i++) {
    const foe = foes[i]!;
    const r = simulateCombat(player, foe.combatant, {
      seed: opts.seed + i * 1000,
      goldOnWin: foe.gold,
      startPlayerPv: pv,
      gauge,
    });
    gauge = r.gauge ?? gauge;
    fights.push({ monster: foe.combatant.name, win: r.win, result: r, maxPv: foe.combatant.pv });
    pv = r.log.length ? r.log[r.log.length - 1]!.playerPv : pv;
    if (!r.win) break;
    gold += r.gold;
    defeated++;
    // Régén entre combats = base + bonus « régén » de l'équipement (stat mineure, borné).
    const healPct = betweenFightsHeal(player, COMBAT.dungeonHealPct);
    pv = Math.min(player.pv, pv + Math.round(player.pv * healPct));
  }
  return {
    cleared: defeated === foes.length,
    defeated,
    total: foes.length,
    gold,
    finalPv: pv,
    fights,
  };
}
