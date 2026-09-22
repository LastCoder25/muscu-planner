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
}

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
  // ⚠️ SIGNATURES DE SET : leur poids n'est PAS la valeur de la signature seule, mais ce qui
  // manque pour que la puissance affichée du SET COMPLET égale ce qu'il vaut en vrai combat
  // (mesuré, v0.837). Les paliers d'un set ne pèsent pas pareil à l'écran et au combat selon
  // leurs stats : ce poids rattrape l'écart, set par set. Sans lui, l'optimiseur préférerait
  // un set qui brille à l'écran à un set qui gagne.
  sig_berserker: { side: 'off', weight: 0.09 },
  sig_gardien: { side: 'surv', weight: 0.27 },
  sig_assassin: { side: 'off', weight: 0.55 },
  sig_vampire: { side: 'surv', weight: 0.06 },
  sig_colosse: { side: 'surv', weight: 0.23 },
  sig_duelliste: { side: 'off', weight: 0.18 },
  sig_epineux: { side: 'off', weight: 0.19 },
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
  initiativeMult: 2, // Initiative : les coups du 1er tour ×2, inesquivables
  initiativeTurns: 1,
  predatorTurns: 3, // Œil du prédateur : les coups des 3 premiers tours sont critiques
  aegisBlock: 0.45, // Égide : la 1re attaque ennemie qui touche perd 45 %
  retortHits: 3, // Rétorsion : les 3 premiers coups ennemis reçus…
  retortMaxPvPct: 0.07, // …retirent chacun 7 % des PV max de l'ennemi
  phoenixBlock: 0.5, // Phénix : le coup qui t'aurait tué perd la moitié de ses dégâts
  thirstHealPct: 0.15, // Soif : …et tu récupères 15 % de TES PV max
  vampiricHealPct: 0.5, // Vampirisme : soin = 50 % des dégâts d'un crit
  executeKillThreshold: 0.15, // Bourreau : exécute un ennemi sous 15 % PV
  secondWindThreshold: 0.3, // Second souffle : déclenche sous 30 % PV
  secondWindHealPct: 0.25, // Second souffle : soigne 25 % des PV max
  // Procs de SET (v0.701) — même famille : non-scalants, et AUCUN ne consomme de rng.
  chargeTurns: 3, // Charge : les coups des 3 premiers tours…
  chargeMult: 1.3, // …infligent +30 %
  cadenceFrom: 3, // Cadence : à partir du 3ᵉ tour du héros… (par tour, comme l'élan)
  cadenceMult: 1.18, // …+18 % de dégâts
  thirstThreshold: 0.5, // Soif : déclenche en passant sous 50 % PV…
  thirstDrainPct: 0.05, // …retire 5 % des PV max de l'ennemi
  whettedTurns: 3, // Riposte affûtée : 3 tours entièrement critiques après la 1re attaque encaissée
  enduranceThreshold: 0.5, // Endurance : active sous 50 % PV
  enduranceReduction: 0.35, // Endurance : −35 % de dégâts subis en plus
  quarryThreshold: 0.3, // Curée : déclenche quand l'ennemi passe sous 30 % PV
  quarryHealPct: 0.22, // Curée : soigne 22 % des PV max du joueur (1× par combat)
  // SIGNATURES DE SET (v0.835) — le 4-pièces d'un set porté dans SA voie. Même famille que
  // les procs : non-scalantes, déterministes (aucune ne consomme de rng).
  // ⚠️ RECALIBRÉES EN v0.837 AVEC LES PALIERS ET LES POIDS DE PUISSANCE (cf. VOIE_SETS) : un
  // set complet porté dans sa voie vaut ~+24 % contre les meilleurs drops, pour les 8 voies,
  // en vrai combat (boss de palier + donjon le plus profond, niveaux 30/60/90).
  carnageMax: 3, // Berserker · Carnage : +dégâts ∝ PV manquants de l'ennemi, jusqu'à +300 %
  bastionHits: 3, // Gardien · Bastion : les 3 premières attaques ennemies qui touchent…
  bastionMult: 0.76, // …sont réduites d'un quart
  graceCritMult: 3.35, // Assassin · Coup de grâce : un critique inflige ×3,35 au lieu de ×2
  eternalHealCapMult: 3.5, // Vampire · Soif éternelle : plafond de soin par tour ×3,5
  unshakenMaxHitPct: 0.4, // Colosse · Inébranlable : un coup retire au plus 40 % des PV max
  secretThrustEvery: 3, // Duelliste · Botte secrète : un coup porté sur 3 est critique…
  secretThrustMult: 2.9, // …et ce critique-là inflige ×2,9
  bramblesMaxPvPct: 0.09, // Épineux · Ronces : chaque coup reçu retire 9 % des PV max ennemis
  tranceMaxStacks: 6, // Frénétique · Transe : l'élan se cumule jusqu'à 6 tours au lieu de 4
  // ⚠️ POIDS DES STATS DANS `combatPower` (v0.837, mesurés en vrai combat) : la puissance
  // comptait le vol de vie PLEIN et ignorait son plafond de soin par tour, sur-valorisait
  // l'élan et les épines. L'optimiseur montait donc des stats qui brillaient à l'écran sans
  // gagner. Vol de vie : ×0,43 et plafonné à 0,3 (au-delà, le plafond de soin mange tout).
  powerLifestealW: 0.43,
  powerLifestealCap: 0.3,
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
  powerShieldW: 0.52, // bouclier de départ 0,3 → +15,6 % de PV
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
    (1 + COMBAT.powerLifestealW * Math.min(COMBAT.powerLifestealCap, c.lifesteal ?? 0)) *
    sig *
    (1 + COMBAT.powerThornsW * (c.thorns ?? 0)) // épines = offense conditionnelle (si frappé)
  );
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
}
export interface CombatResult {
  win: boolean;
  rounds: number;
  log: CombatEvent[];
  gold: number; // 0 si défaite
}

/** Simule un combat auto tour par tour. `seed` rend le combat reproductible. */
export function simulateCombat(
  player: Combatant,
  monster: Combatant,
  opts: { seed: number; goldOnWin: number; startPlayerPv?: number },
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
  let phoenixReady = has('phoenix');
  let secondWindReady = has('secondwind');
  // Procs de SET (v0.701). ⚠️ Tous DÉTERMINISTES : aucun n'appelle `rng`, sinon deux objets
  // de procs différents feraient diverger un combat seedé — et tous les rejeux animés avec.
  let thirstReady = has('thirst'); // Soif : draine une fois, au passage sous 50 % PV
  let quarryReady = has('quarry'); // Curée : soigne une fois, quand l'ennemi passe sous 30 %
  let pHits = 0; // coups PORTÉS par le joueur (Botte secrète)
  let whettedLeft = 0; // tours entièrement critiques restants (Riposte affûtée)
  let whettedNow = false;
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
        log.push({
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
      if (!perHit) pStacks = pTurn - 1; // l'élan monte à chaque tour du héros, pas à chaque coup
      whettedNow = whettedLeft > 0;
      if (whettedNow) whettedLeft--;
    }
    const opening = turn === 'player' && has('initiative') && pTurn <= COMBAT.initiativeTurns;
    // Soin de vol de vie de CE tour, plafonné à une fraction des PV max de l'attaquant
    // (empêche le multi-frappe de rendre le sustain infini — cf. COMBAT.lifestealRoundCap).
    let roundHeal = 0;
    const healCap = Math.round(
      (turn === 'player' ? maxPPv : monsterMaxPv) *
        COMBAT.lifestealRoundCap *
        (turn === 'player' && has('sig_vampire') ? COMBAT.eternalHealCapMult : 1),
    );
    const gainHeal = (raw: number): number => {
      const h = Math.max(0, Math.min(raw, healCap - roundHeal));
      roundHeal += h;
      return h;
    };
    for (let h = 0; h < hits && pPv > 0 && mPv > 0; h++) {
      // ⚠️ `undefined` tant que rien n'a mordu — cf. `CombatEvent.skills`.
      let skills: CombatSkill[] | undefined;
      const mark = (s: CombatSkill) => (skills ??= []).push(s);
      if (turn === 'player') {
        // ── Attaque du JOUEUR ──
        if (!opening && rng() < def.dodge * (1 - (atk.accuracy ?? 0))) {
          log.push({ round, who: turn, type: 'dodge', damage: 0, playerPv: pPv, monsterPv: mPv });
          continue;
        }
        let crit = rng() < atk.crit;
        if (has('predator_eye') && pTurn <= COMBAT.predatorTurns) {
          crit = true; // Œil
          mark('predator_eye');
        }
        // Riposte affûtée : le tour qui suit la 1re attaque encaissée est entièrement critique.
        if (whettedNow) {
          crit = true;
          mark('whetted');
        }
        // Botte secrète : un coup porté sur N est un critique appuyé, sans jet.
        const thrust = has('sig_duelliste') && (pHits + 1) % COMBAT.secretThrustEvery === 0;
        if (thrust) {
          crit = true;
          mark('sig_duelliste');
        }
        const variance = COMBAT.varianceMin + rng() * COMBAT.varianceSpan;
        const cm = thrust ? Math.max(critMult, COMBAT.secretThrustMult) : critMult;
        // Coup de grâce : il ne se déclenche pas, il AMPLIFIE chaque critique (il est déjà
        // dans `critMult`, calculé hors boucle) — donc on le marque sur le coup concerné.
        if (crit && has('sig_assassin')) mark('sig_assassin');
        let dmg = Math.max(1, Math.round(atk.damage * (crit ? cm : 1) * variance));
        if (opening) {
          dmg = Math.round(dmg * COMBAT.initiativeMult);
          mark('initiative');
        }
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
        if (atk.rage && pPv / maxPPv < COMBAT.rageThreshold) {
          mult += atk.rage;
          mark('rage');
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
        if (mult !== 1) dmg = Math.max(1, Math.round(dmg * mult));
        if (def.dmgReduction) dmg = Math.max(1, Math.round(dmg * (1 - def.dmgReduction)));
        mPv = Math.max(0, mPv - dmg);
        if (atk.bleed) {
          bleedPool += dmg * atk.bleed;
          mark('bleed');
        }
        if (perHit) pStacks++; // aventuriers : élan par coup (règle d'avant)
        if (atk.lifesteal) {
          const before = pPv;
          pPv = Math.min(maxPPv, pPv + gainHeal(Math.round(dmg * atk.lifesteal)));
          if (pPv > before) mark('lifesteal');
        }
        // Vampirisme : les crits soignent (compte dans le plafond de soin du tour).
        if (crit && has('vampiric')) {
          const before = pPv;
          pPv = Math.min(maxPPv, pPv + gainHeal(Math.round(dmg * COMBAT.vampiricHealPct)));
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
        log.push({
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
        if (rng() < def.dodge) {
          log.push({ round, who: turn, type: 'dodge', damage: 0, playerPv: pPv, monsterPv: mPv });
          continue;
        }
        // Parade : le coup est évité et l'ennemi saute son prochain tour.
        if (def.parry && rng() < def.parry) {
          stunNext = true;
          log.push({
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
        const crit = rng() < atk.crit;
        const variance = COMBAT.varianceMin + rng() * COMBAT.varianceSpan;
        let dmg = Math.max(1, Math.round(atk.damage * (crit ? monsterCritMult : 1) * variance));
        if (def.block && rng() < def.block) {
          dmg = Math.max(1, Math.round(dmg * COMBAT.blockKeep));
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
        if (firstEnemy && has('whetted')) whettedLeft = COMBAT.whettedTurns;
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
        // Soif : au passage sous 50 % PV, on blesse l'ennemi et on se remet d'aplomb.
        if (thirstReady && pPv > 0 && pPv / maxPPv < COMBAT.thirstThreshold) {
          const drain = Math.max(1, Math.round(monsterMaxPv * COMBAT.thirstDrainPct));
          mPv = Math.max(0, mPv - drain);
          pPv = Math.min(maxPPv, pPv + Math.round(maxPPv * COMBAT.thirstHealPct));
          thirstReady = false;
          mark('thirst');
        }
        // Phénix : amortit le coup fatal, une fois.
        if (pPv <= 0 && phoenixReady) {
          // Le coup fatal est amorti : s'il reste mortel, on tombe quand même.
          pPv = Math.max(0, pBefore - Math.round(dmg * (1 - COMBAT.phoenixBlock)));
          phoenixReady = false;
          mark('phoenix');
        } else if (pPv > 0 && secondWindReady && pPv / maxPPv < COMBAT.secondWindThreshold) {
          // Second souffle : sous 30 % PV pour la 1re fois → soin.
          pPv = Math.min(maxPPv, pPv + Math.round(maxPPv * COMBAT.secondWindHealPct));
          secondWindReady = false;
          mark('secondwind');
        }
        if (atk.lifesteal) {
          const avant = mPv;
          mPv = Math.min(monster.pv, mPv + gainHeal(Math.round(dmg * atk.lifesteal)));
          if (mPv > avant) mark('lifesteal');
        }
        // Épines : le joueur (défenseur) renvoie une part des dégâts reçus.
        if (def.thorns && dmg > 0) {
          mPv = Math.max(0, mPv - Math.max(1, Math.round(dmg * def.thorns)));
          mark('thorns');
        }
        // Ronces : chaque coup reçu blesse l'ennemi d'une part de SES PV max — les épines
        // ordinaires suivent les dégâts reçus, donc restent muettes face à un colosse.
        if (has('sig_epineux') && dmg > 0) {
          mPv = Math.max(0, mPv - Math.max(1, Math.round(monsterMaxPv * COMBAT.bramblesMaxPvPct)));
          mark('sig_epineux');
        }
        log.push({
          round,
          who: turn,
          type: crit ? 'crit' : 'hit',
          damage: dmg,
          playerPv: pPv,
          monsterPv: mPv,
          ...(skills ? { skills } : {}),
        });
        // Riposte : après un coup reçu (bloqué ou non), chance de contre-attaquer aussitôt.
        // UNE VOLÉE (les coups d'un tour du héros), sans critique ni variance : elle ne tire
        // au hasard que la chance. ⚠️ Un seul coup ne valait RIEN à haut niveau, où le héros
        // frappe jusqu'à 37 fois par tour (mesuré : +0 à +6 % de puissance).
        if (def.riposte && pPv > 0 && mPv > 0 && rng() < def.riposte) {
          // Critique MOYEN compris (aucun tirage) : sans lui la volée valait 1/1,5 d'une volée.
          const volley = player.damage * (player.strikes ?? 1) * (1 + player.crit * (critMult - 1));
          const r = Math.max(1, Math.round(volley * (1 - (monster.dmgReduction ?? 0))));
          mPv = Math.max(0, mPv - r);
          log.push({
            round,
            who: 'player',
            type: 'hit',
            damage: r,
            playerPv: pPv,
            monsterPv: mPv,
            skills: ['riposte'],
          });
        }
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
  return { win, rounds: round, log, gold: win ? opts.goldOnWin : 0 };
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
  for (let i = 0; i < foes.length; i++) {
    const foe = foes[i]!;
    const r = simulateCombat(player, foe.combatant, {
      seed: opts.seed + i * 1000,
      goldOnWin: foe.gold,
      startPlayerPv: pv,
    });
    fights.push({ monster: foe.combatant.name, win: r.win, result: r, maxPv: foe.combatant.pv });
    pv = r.log.length ? r.log[r.log.length - 1]!.playerPv : pv;
    if (!r.win) break;
    gold += r.gold;
    defeated++;
    // Régén entre combats = base + bonus « régén » de l'équipement (stat mineure, borné).
    const healPct = COMBAT.dungeonHealPct + (player.regen ?? 0);
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
