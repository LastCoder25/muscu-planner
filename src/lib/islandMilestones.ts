/**
 * 🏅 LES JALONS D'ÎLE (livraison 1 du chantier « rival nommé + jalons », cadrage `po` validé par
 * l'utilisateur : « l'île 3 est redondante »). Quatre paliers de NIVEAU DU JOUEUR par île, qui
 * donnent à l'île un fil à suivre en dehors de la conquête : un nom, un texte, une pastille.
 *
 * ⚠️ NE TOUCHE NI AU COMBAT NI À L'ÉCONOMIE : aucun or, aucune force. Seul le DERNIER jalon porte
 * un petit coffre (quelques runes). Les jalons ne sont PAS des lieux : leurs ids (`isl_mile_…`)
 * ne sont jamais reconnus par `isIslandTargetId`, donc `objectivesTotal`, `fortressForce`, le
 * verrou de la forteresse et `archipel.destroyed` ne les comptent pas.
 *
 * Paramétré par île (`MILESTONES[île]`) : ajouter une île = ajouter une ligne. Une île sans ligne
 * n'a aucun jalon et sa carte n'est JAMAIS modifiée.
 *
 * L'état est un champ ADDITIF de `archipel` (`milestones`), dans le JSONB de la carte : aucune
 * migration, une carte sans le champ reste valable.
 */
import { islandById, mapPlayerLevel } from './archipelago';
import type { ExpeditionMap, ExpeditionMessage } from './expedition';

/** Les quatre rangs d'un jalon (0 à 3). */
export type MilestoneSlot = 0 | 1 | 2 | 3;
const SLOTS: readonly MilestoneSlot[] = [0, 1, 2, 3];

/** Où tombent les jalons : niveau d'entrée de l'île + ce décalage. */
export const MILESTONE_OFFSETS: Record<MilestoneSlot, number> = { 0: 4, 1: 9, 2: 14, 3: 19 };

interface MilestoneDef {
  emoji: string;
  name: string;
  text: string;
  /** Petit coffre déposé UNE fois (runes). Seul le dernier jalon en porte un. */
  chest?: { runes: number; text: string };
}

/** Les quatre jalons d'une île (un `Record` : en oublier un ne compile pas). */
type MilestoneSet = Record<MilestoneSlot, MilestoneDef>;

const NB = ' ';

/** Les jalons de chaque île. Îles 1, 2, 4 et 5 : pas encore de ligne = comportement inchangé. */
export const MILESTONES: Partial<Record<number, MilestoneSet>> = {
  3: {
    0: {
      emoji: '🕯️',
      name: 'La veille des cimetières',
      text: `Tu as veillé parmi les tombes assez longtemps pour qu’elles te connaissent. Les gardiens des cimetières parlent de toi à voix basse, et les morts ne se lèvent plus sans te jeter un regard${NB}d’abord.`,
    },
    1: {
      emoji: '🌊',
      name: 'Le chant des marées',
      text: `Le ressac du Bastion des marées couvre désormais les plaintes de l’île. Les pêcheurs de la côte racontent que le nom de ton héros se murmure jusque dans les cales des vaisseaux${NB}fantômes.`,
    },
    2: {
      emoji: '🏚️',
      name: 'L’ombre de la citadelle',
      text: `Au bout de la lande, la citadelle des morts se dresse dans la brume. Plus personne sur l’île ne doute que tu viendras frapper à sa porte, et la citadelle, elle, ne dort${NB}plus.`,
    },
    3: {
      emoji: '👑',
      name: 'Le dernier veilleur',
      text: `L’Île des Morts n’a plus rien à t’apprendre. Les derniers fantômes s’écartent sur ton passage, et au loin, derrière la brume, on devine déjà le rivage de l’île${NB}suivante.`,
      chest: {
        runes: 2,
        text: `Les veilleurs de l’île te laissent une offrande avant ton départ${NB}: quelques runes, gardées pour celui qui ira jusqu’au bout.`,
      },
    },
  },
};

/** Un jalon d'une île donnée, avec son niveau et son id. */
export interface Milestone {
  id: string;
  /** 1 à 4. */
  n: number;
  slot: MilestoneSlot;
  /** Niveau du joueur (vu par la carte) qui le franchit. */
  level: number;
  def: MilestoneDef;
}

const PREFIX = 'isl_mile_';
export const milestoneId = (island: number, n: number): string => `${PREFIX}${island}_${n}`;
/** Un id de jalon ? (Jamais un lieu : `isIslandTargetId` ne le reconnaît pas.) */
export const isMilestoneId = (id: string): boolean => id.startsWith(PREFIX);
/** Un message de la boîte 📬 qui annonce un jalon ? */
export const isMilestoneMessage = (m: Pick<ExpeditionMessage, 'id'>): boolean =>
  isMilestoneId(m.id);

/**
 * Les jalons d'une île, dans l'ordre. Niveau = `minLevel + décalage`, borné par le plafond de
 * l'île : un jalon au-delà du plafond est OMIS (aucun niveau d'île propre : le niveau vient de
 * `mapPlayerLevel`, qui plafonne au rang max de l'île).
 */
export function milestonesOf(island: number): Milestone[] {
  const isl = islandById(island);
  const set = MILESTONES[island];
  if (!isl || !set) return [];
  const out: Milestone[] = [];
  for (const slot of SLOTS) {
    const level = isl.minLevel + MILESTONE_OFFSETS[slot];
    if (level > isl.maxLevel) continue;
    out.push({ id: milestoneId(island, slot + 1), n: slot + 1, slot, level, def: set[slot] });
  }
  return out;
}

/** La marque d'un jalon franchi (`archipel.milestones`). `silent` = déjà dépassé à l'arrivée :
 *  coché sans récompense ni fanfare. */
interface MilestoneMark {
  at: number;
  silent?: true;
}

function passageMessage(m: Milestone, at: number): ExpeditionMessage {
  const chest = m.def.chest;
  return {
    id: m.id,
    ...(chest ? { chest: true } : {}),
    title: m.def.name,
    level: m.level,
    win: true,
    text: `Niveau${NB}${m.level}${NB}: ${m.def.text}${chest ? ` ${chest.text}` : ''}`,
    gold: 0,
    energy: 0,
    ...(chest ? { runes: chest.runes } : {}),
    key: 0,
    resolvedAt: at,
    ...(chest ? { claimAt: at, claimed: false } : {}),
    read: false,
  };
}

/**
 * Cocher les jalons franchis. À appeler à chaque tick de la carte (avec le niveau du joueur).
 *
 * - Carte sans `archipel`, ou île sans jalons : `null`, la carte n'est pas touchée.
 * - PREMIÈRE lecture (carte sans le champ) : les jalons déjà dépassés sont cochés `silent`, sans
 *   récompense ni message ; le champ est posé (`{}` au besoin) pour que la suite soit un
 *   ÉVÉNEMENT.
 * - Ensuite : un jalon non coché dont le niveau est atteint est coché ET annoncé (message dans
 *   la boîte 📬, coffre au dernier). La marque ne se lève jamais : un niveau qui baisse ne
 *   l'efface pas, et un second passage ne rend rien (idempotent, pas de double octroi).
 */
export function settleMilestones(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
): { map: ExpeditionMap; msgs: ExpeditionMessage[]; fresh: Milestone[] } | null {
  const a = map.archipel;
  if (!a) return null;
  const list = milestonesOf(a.island);
  if (!list.length) return null;
  const lvl = mapPlayerLevel(map, playerLevel);
  const marks = a.milestones;
  if (!marks) {
    const init: Record<string, MilestoneMark> = {};
    for (const m of list) if (lvl >= m.level) init[m.id] = { at: now, silent: true };
    return { map: { ...map, archipel: { ...a, milestones: init } }, msgs: [], fresh: [] };
  }
  const fresh = list.filter((m) => !marks[m.id] && lvl >= m.level);
  if (!fresh.length) return null;
  const next: Record<string, MilestoneMark> = { ...marks };
  for (const m of fresh) next[m.id] = { at: now };
  return {
    map: { ...map, archipel: { ...a, milestones: next } },
    msgs: fresh.map((m) => passageMessage(m, now)),
    fresh,
  };
}

type MilestoneState = 'done' | 'next' | 'todo';

export interface MilestoneView {
  id: string;
  n: number;
  level: number;
  emoji: string;
  name: string;
  text: string;
  /** Runes du coffre, s'il y en a un. */
  chestRunes: number | null;
  state: MilestoneState;
}

/**
 * Les jalons de l'île ACTIVE pour l'écran. « Atteint » = coché, OU niveau déjà là (la marque
 * suit au prochain tick). Le premier non atteint est « prochain ». Liste vide : rien à montrer.
 */
export function milestoneViews(
  map: Pick<ExpeditionMap, 'archipel'> | null | undefined,
  playerLevel: number,
): MilestoneView[] {
  const a = map?.archipel;
  if (!a) return [];
  const lvl = mapPlayerLevel(map, playerLevel);
  let nextTaken = false;
  return milestonesOf(a.island).map((m) => {
    const done = !!a.milestones?.[m.id] || lvl >= m.level;
    const state: MilestoneState = done ? 'done' : nextTaken ? 'todo' : 'next';
    if (state === 'next') nextTaken = true;
    return {
      id: m.id,
      n: m.n,
      level: m.level,
      emoji: m.def.emoji,
      name: m.def.name,
      text: m.def.text,
      chestRunes: m.def.chest?.runes ?? null,
      state,
    };
  });
}
