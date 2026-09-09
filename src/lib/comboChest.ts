// comboChest.ts — LE COFFRE DE FIN DE DÉFI 360 (pur/testable).
//
// Une semaine de Défi 360, c'est une semaine d'entraînement équilibré — et jusqu'ici elle
// ne rapportait QUE de l'XP, sans aucune conséquence dans le jeu. Ce coffre est sa
// contrepartie : un CADEAU, jamais un risque.
//
// ⚠️ CE QUI LE DIMENSIONNE, ET CE QUI NE LE DIMENSIONNE PAS.
//  • Les SÉRIES réellement faites, oui. C'est le travail.
//  • Le nombre d'EXERCICES, NON. Mesuré sur le générateur : un 360 « débutant intense »
//    vaut 74 séries qu'il les répartisse sur 6 ou sur 16 exercices — même semaine, autre
//    présentation. Payer les exercices, ce serait payer un réglage de variété.
//  • Le NIVEAU du joueur fixe la magnitude, comme toute autre source du jeu.
//
// ⚠️ ET LA BANDE EST BORNÉE. L'éventail réel des 360 va de 29 séries (débutant léger) à
// 135 (avancé intense), soit ×4,66. Reporter ce rapport tel quel donnerait, à niveau égal,
// cinq fois moins à qui s'entraîne posément — une punition pour un rythme légitime.
//
// ⚠️ LES MONTANTS SONT DÉRIVÉS, JAMAIS AJUSTÉS À LA MAIN. Premier essai : des courbes
// linéaires calées « à peu près » sur des repères mesurés — elles décrochaient dès qu'on
// s'éloignait du niveau de référence (la ferraille valait 2 épaves à 40, une seule à 26).
// Le coffre lit donc les VRAIES formules : une épave, un coût d'invocation, une séance de
// donjons. Les rapports tiennent alors à tous les niveaux par construction, et suivront
// d'eux-mêmes tout rééquilibrage futur de ces sources.
import { HARVEST, travelOneWayMin, travelFactor } from './expedition';
import { DUNGEONS, dungeonGold, dungeonSummonStones } from '@/data/dungeons';

/** Séries hebdomadaires d'un 360 « moyen » — le point où le facteur d'effort vaut 1.
 *  Médiane de l'éventail que le générateur produit (29 → 135). */
export const CHEST_REF_SETS = 76;
export const CHEST_MIN_MULT = 0.7;
export const CHEST_MAX_MULT = 1.5;
/** Ce que vaut un coffre, exprimé dans les monnaies du jeu.
 *
 *  ⚠️ ANCRÉ SUR UNE SÉANCE, pas sur « une tentative de boss ». Premier calibrage : le
 *  coffre valait 1 boss (6 🔮 au niveau 26). Mesuré ensuite, UNE séance de sport donne
 *  ~400 ⚡ → 10 donjons → **40 🔮** et 99 000 🪙. Le coffre pesait donc **15 % d'une
 *  séance** pour une SEMAINE de travail : invisible. On le cale sur une séance pleine —
 *  soit environ un quart de ce que rapporte la semaine de donjons qu'il accompagne.
 *
 *  ⚠️ Toutes les monnaies ne se valent pas, et il ne faut PAS les traiter pareil :
 *   • or et pierres se FARMENT (10 donjons par séance) → on s'ancre sur la séance ;
 *   • la ferraille ne se farme pas (65 par séance en recyclage, contre 148 pour UNE
 *     épave) → on garde l'ancre « épaves », déjà généreuse ;
 *   • la clé est la plus rare de toutes : 0,2 par séance, soit 0,8 par SEMAINE. Une clé
 *     par coffre est déjà, à elle seule, plus qu'une semaine de donjons. */
export const CHEST = {
  wrecks: 2, // ferraille ≈ 2 épaves (la ferraille ne se farme pas)
  sessionShare: 0.9, // or et pierres ≈ 1 séance de donjons
  energyCap: 120, // ⚡ complément borné, jamais un substitut au sport
  runsPerSession: 10, // ~400 ⚡ / coût plafonné à 40 par descente
} as const;

export interface ComboChest {
  gold: number;
  scrap: number;
  summonStones: number;
  keys: number;
  energy: number;
}

/** Rendement d'UNE épave, à la formule exacte de la carte. */
export function wreckYield(level: number): number {
  const L = Math.max(1, level);
  const rtH = (2 * travelOneWayMin(L, 0.5)) / 60;
  return Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * travelFactor(rtH));
}
/** Le meilleur donjon accessible à ce niveau — la référence de ce qu'on farme. */
function bestDungeon(level: number) {
  return (
    [...DUNGEONS]
      .filter((d) => d.recoLevel <= level)
      .sort((a, b) => b.recoLevel - a.recoLevel)[0] ?? DUNGEONS[0]!
  );
}
/** Or d'une séance type. */
export function sessionGold(level: number): number {
  return dungeonGold(bestDungeon(level)) * CHEST.runsPerSession;
}
/** 🔮 d'une séance type — via `dungeonSummonStones`, la source unique de la règle. */
export function sessionStones(level: number): number {
  return dungeonSummonStones(bestDungeon(level)) * CHEST.runsPerSession;
}

/** Facteur d'effort d'un 360, borné. `sets` = séries RÉELLEMENT comptées (donc déjà
 *  plafonnées au palier maximal par `comboCountedSets` : empiler des séries vides ne
 *  paie pas au-delà de 120 % de l'objectif). */
export function chestEffortMult(sets: number): number {
  const raw = Math.max(0, sets) / CHEST_REF_SETS;
  return Math.min(CHEST_MAX_MULT, Math.max(CHEST_MIN_MULT, raw));
}

/** Le coffre : un peu de chaque ressource vivante, dimensionné par l'effort et le niveau. */
export function comboChestReward(sets: number, playerLevel: number): ComboChest {
  const L = Math.max(1, playerLevel);
  const m = chestEffortMult(sets);
  return {
    scrap: Math.round(wreckYield(L) * CHEST.wrecks * m),
    summonStones: Math.max(1, Math.round(sessionStones(L) * CHEST.sessionShare * m)),
    // Une clé n'a presque aucune source dédiée, et c'est la seule porte du Labyrinthe :
    // une par semaine BIEN remplie, jamais plus.
    keys: m >= 1 ? 1 : 0,
    energy: Math.round(Math.min(CHEST.energyCap, 20 + L * 1.6) * m),
    gold: Math.round(sessionGold(L) * CHEST.sessionShare * m),
  };
}
