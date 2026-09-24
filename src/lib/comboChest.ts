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
import { DUNGEONS, dungeonGold, dungeonSummonStones } from '@/data/dungeons';
import { comboTickets } from './sportTickets';

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
 *   • la part qui était en FERRAILLE (≈ 2 épaves) est RETIRÉE avec la devise (v0.998),
 *     et PAS convertie en or : l'or du coffre vaut déjà ~une séance, et y ajouter 2 épaves
 *     le portait à 1,5 séance au niveau 5 — le coffre aurait remplacé le farm ;
 *   • la clé est la plus rare de toutes : 0,2 par séance, soit 0,8 par SEMAINE. Une clé
 *     par coffre est déjà, à elle seule, plus qu'une semaine de donjons. */
const CHEST = {
  sessionShare: 0.9, // or et pierres ≈ 1 séance de donjons
  energyCap: 120, // ⚡ complément borné, jamais un substitut au sport
  runsPerSession: 10, // ~400 ⚡ / coût plafonné à 40 par descente
} as const;

export interface ComboChest {
  gold: number;
  summonStones: number;
  keys: number;
  energy: number;
  /** 🎟️ Tickets d'invocation (v0.992) : une semaine de sport alimente le gacha. ⚠️ Absent
   *  des coffres conservés AVANT les tickets — lus comme 0. */
  tickets: number;
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
    summonStones: Math.max(1, Math.round(sessionStones(L) * CHEST.sessionShare * m)),
    // Une clé n'a presque aucune source dédiée, et c'est la seule porte du Labyrinthe :
    // une par semaine BIEN remplie, jamais plus.
    keys: m >= 1 ? 1 : 0,
    energy: Math.round(Math.min(CHEST.energyCap, 20 + L * 1.6) * m),
    gold: Math.round(sessionGold(L) * CHEST.sessionShare * m),
    // 🎟️ Même facteur d'effort que le reste du coffre : 2 (posé) → 3 (moyen) → 5 (intense).
    tickets: comboTickets(m),
  };
}

/** Ce qu'un coffre CONTENAIT, conservé sur le Défi 360 (colonne `chest`, migr. 0064).
 *  Le niveau est figé au bouclage : le recalculer plus tard avec le niveau du moment
 *  afficherait un coffre que le joueur n'a jamais reçu. */
export interface ComboChestRecord extends ComboChest {
  level: number;
  at: number; // horodatage du dépôt (ms)
}

/** Le strict nécessaire d'un message de boîte pour en relire un coffre. */
interface ChestMessage {
  id: string;
  gold: number;
  energy?: number;
  summonStones?: number;
  key?: number;
  tickets?: number;
  level: number;
  resolvedAt: number;
}

export const comboChestMessageId = (comboId: string) => `chest:${comboId}`;

/** Que faire du coffre d'un 360 bouclé ?
 *  • déjà conservé sur le défi → rien (`null`) : c'est la preuve DURABLE du versement.
 *    ⚠️ La boîte ne l'est pas — elle ne garde que 3 messages (plus les butins à prendre) ; se fier à elle seule
 *    ferait verser deux fois un coffre dont le message a été chassé ;
 *  • message encore dans la boîte, mais pas conservé → on le RELIT, sans reverser
 *    (versement fait par une version d'avant, ou écriture du défi qui a échoué) ;
 *  • sinon → on le calcule, on le verse et on le conserve. */
export function comboChestPlan(
  combo: { id: string; chest?: ComboChestRecord | null },
  messages: readonly ChestMessage[],
  sets: number,
  playerLevel: number,
  now: number,
): { grant: boolean; record: ComboChestRecord } | null {
  if (combo.chest) return null;
  const m = messages.find((x) => x.id === comboChestMessageId(combo.id));
  if (m) {
    return {
      grant: false,
      record: {
        gold: m.gold,
        energy: m.energy ?? 0,
        summonStones: m.summonStones ?? 0,
        keys: m.key ?? 0,
        tickets: m.tickets ?? 0,
        level: m.level,
        at: m.resolvedAt,
      },
    };
  }
  const level = Math.max(1, playerLevel);
  return { grant: true, record: { ...comboChestReward(sets, level), level, at: now } };
}
