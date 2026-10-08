/**
 * D'OÙ VIENT CHAQUE RESSOURCE — la fiche qui s'ouvre quand on touche une puce du plateau.
 *
 * Une devise dont on ne sait pas où la chercher force à fouiller tous les écrans. Chaque
 * entrée dit à quoi elle sert et, surtout, où la gagner.
 *
 * ⚠️ `Record<ResourceId, …>` : ajouter une devise au plateau sans dire d'où elle vient
 * casse la compilation. ⚠️ Cette table DÉCRIT les sources, elle n'en calcule aucune :
 * à tenir à jour quand une source apparaît ou disparaît (les montants restent dans les libs).
 *
 * 🏝️ LA FICHE NE MONTRE QUE CE QUI EST À PORTÉE (`sourcesFor`, demandé le 2026-10-07) : un
 * LIEU FIXE ne compte que s'il est sur l'île où l'on est, ou déjà tenu sur une île quittée
 * (il y produit toujours) ; le coffre de la forteresse, tant qu'elle tient ; la brèche sans
 * fin, sur l'île 5. Le reste (donjons, base, lieux tirés de la carte, sport) est partout.
 */
import { CONTROL_KIND_EMO, CONTROL_KIND_LABEL } from '@/lib/expedition';
import type { ControlKind, ExpeditionMap } from '@/lib/expedition';
import { controlKindsOf } from '@/lib/controlPoints';
import { FORTRESS_ID } from '@/lib/islandConquest';

export type ResourceId =
  | 'energy'
  | 'mana'
  | 'gold'
  | 'summon'
  | 'keys'
  | 'sealsChamp'
  | 'sealsGear'
  | 'tickets'
  | 'runes';

interface ResourceSource {
  emoji: string;
  label: string;
  /** Précision courte (fréquence, condition). */
  detail?: string;
  /** 🏰 Un LIEU FIXE de ce type : à portée sur son île, ou s'il est tenu ailleurs. */
  fixed?: ControlKind;
  /** 🏝️ Seulement sur ces îles. */
  islands?: readonly number[];
  /** 🏰 Le coffre de la forteresse : tant que celle de l'île tient. */
  fortress?: true;
}

/** Un lieu fixe comme source : son nom et son emoji sont ceux de la carte. */
function fixed(kind: ControlKind, detail: string): ResourceSource {
  return { emoji: CONTROL_KIND_EMO[kind], label: CONTROL_KIND_LABEL[kind], detail, fixed: kind };
}

export interface ResourceInfo {
  emoji: string;
  name: string;
  /** À quoi elle sert. */
  use: string;
  sources: ResourceSource[];
}

export const RESOURCE_SOURCES: Record<ResourceId, ResourceInfo> = {
  energy: {
    emoji: '⚡',
    name: 'Énergie',
    use: 'Jouer : donjons, boss, Labyrinthe, arène.',
    sources: [
      {
        emoji: '🏃',
        label: 'Ton sport',
        detail: 'toute l’XP de fond (séances, cardio, défis, 360)',
      },
      {
        emoji: '🎁',
        label: 'Récompense du jour',
        detail: 'bonus de connexion, croît avec la série',
      },
      { emoji: '🔌', label: 'Dynamo tellurique', detail: 'bâtiment de la base, à récolter' },
      { emoji: '💧', label: 'Sources de la carte', detail: 'expéditions et équipes' },
      { emoji: '🎯', label: 'Coffre du Défi 360', detail: 'Défi 360 bouclé dans les temps' },
    ],
  },
  mana: {
    emoji: '💠',
    name: 'Pierres de mana',
    use: 'Invoquer un champion au Panthéon.',
    sources: [
      {
        emoji: '🕳️',
        label: 'Failles refermées',
        detail: 'la source principale — fermer vite paie',
      },
      { emoji: '⚔️', label: 'Incursion ratée', detail: 'la part des monstres abattus' },
      { emoji: '🛡️', label: 'Bande de faille interceptée' },
      {
        emoji: '💠',
        label: 'Mines de mana résiduel',
        detail: 'laissées par une faille qui a débordé',
      },
      fixed('mana', 'lieu fixe tenu, en continu'),
      { emoji: '🎁', label: 'Récompense du jour', detail: 'un tirage offert chaque jour' },
      { emoji: '🎰', label: 'Copie en trop au tirage', detail: 'convertie en mana' },
    ],
  },
  gold: {
    emoji: '🪙',
    name: 'Or',
    use: 'Construire et améliorer les bâtiments, l’enceinte, l’ascension des champions.',
    sources: [
      { emoji: '🏰', label: 'Donjons', detail: 'le butin des monstres' },
      { emoji: '👑', label: 'Boss de palier' },
      { emoji: '🪙', label: 'Vente', detail: 'objets, talents et familiers en trop' },
      { emoji: '🏕️', label: 'Mines et camps de la carte', detail: 'expéditions et équipes' },
      fixed('mine', 'lieu fixe tenu, en continu'),
      { emoji: '🏴‍☠️', label: 'Caravane pillée', detail: 'rare, quelques heures, beaucoup d’or' },
      { emoji: '🏟️', label: 'Arène', detail: 'selon les vagues tenues' },
      { emoji: '🛡️', label: 'Sièges repoussés', detail: 'surtout les bandits' },
      { emoji: '🎯', label: 'Coffre du Défi 360' },
      { emoji: '🐉', label: 'Coffre du boss entre amis' },
    ],
  },
  summon: {
    emoji: '🔮',
    name: 'Pierres d’invocation',
    use: 'Tenter un boss de palier.',
    sources: [
      { emoji: '🏰', label: 'Nettoyer un donjon', detail: 'plus il est profond, plus il en donne' },
      { emoji: '🔮', label: 'Sanctuaires de la carte', detail: 'expéditions et équipes' },
      { emoji: '⛩️', label: 'Autel des boss', detail: 'bâtiment de la base, à récolter' },
      fixed('circle', 'lieu fixe tenu, en continu'),
      { emoji: '💀', label: 'Camps de morts-vivants' },
      { emoji: '🏟️', label: 'Arène' },
      { emoji: '🛡️', label: 'Sièges repoussés' },
      { emoji: '🎯', label: 'Coffre du Défi 360' },
      { emoji: '🐉', label: 'Coffre du boss entre amis' },
    ],
  },
  keys: {
    emoji: '🗝️',
    name: 'Clés',
    use: 'Entrer dans le Labyrinthe, seule source de familiers.',
    sources: [
      { emoji: '🚪', label: 'Porte du Labyrinthe', detail: 'bâtiment de la base, à récolter' },
      { emoji: '📖', label: 'Archives de la carte', detail: '1, ou 2 si les gardes sont nombreux' },
      fixed('archives', 'lieu fixe tenu, en continu'),
      { emoji: '👑', label: 'Boss de palier', detail: 'garantie à la 1re victoire, puis parfois' },
      { emoji: '🏰', label: 'Donjons', detail: 'rarement' },
      { emoji: '🌀', label: 'Portail sans fin', detail: 'parfois' },
      { emoji: '🗃️', label: 'Caches sur la route', detail: 'rencontre de trajet' },
      { emoji: '🛡️', label: 'Sièges repoussés' },
      { emoji: '🎯', label: 'Coffre du Défi 360', detail: 'une par semaine bien remplie' },
    ],
  },
  sealsChamp: {
    emoji: '🔱',
    name: 'Sceaux de champion',
    use: 'Faire monter un champion au rang suivant (ascension). Il en faut 4 × le rang visé : 4 pour Argent, 8 pour Or, 12 pour Or noir…',
    sources: [
      {
        emoji: '🏛️',
        label: 'Ruines anciennes de la carte',
        detail: 'gardées — 3 × (1 + rang de la ruine) sceaux, une ruine sur deux',
      },
      fixed('ossuary', 'lieu fixe tenu, en continu'),
      {
        emoji: '🏰',
        label: 'Coffre de la forteresse de l’île',
        detail: 'une fois, quand elle tombe',
        fortress: true,
      },
      {
        emoji: '🌀',
        label: 'Brèche maudite',
        detail: '1 par victoire, elle revient tous les 3 jours',
        islands: [5],
      },
    ],
  },
  sealsGear: {
    emoji: '⚜️',
    name: 'Sceaux d’objet',
    use: 'Faire monter une pièce d’équipement de champion au rang suivant. Sans rang : il en faut autant que le rang visé (Argent 1, Or 2, Or noir 3…).',
    sources: [
      {
        emoji: '🏛️',
        label: 'Ruines anciennes de la carte',
        detail: 'gardées — 9 × (1 + ton rang), une ruine sur deux',
      },
      fixed('arsenal', 'lieu fixe tenu, en continu'),
    ],
  },
  runes: {
    emoji: '🪬',
    name: 'Runes de compétence',
    use: 'Poser une compétence sur un champion, depuis sa fiche au Panthéon : une rune tire une compétence de sa couleur (🟢 🔵 🟣 🟠), et monte d’un niveau celle qu’il porte déjà.',
    sources: [
      {
        emoji: '🗺️',
        label: 'Lieux de la carte réussis avec un champion',
        detail:
          'une chance, plus forte sur un lieu au-dessus de ton rang, doublée sur une faille refermée',
      },
      { emoji: '⬆️', label: 'Ascension d’un champion', detail: 'une rune garantie' },
      { emoji: '✨', label: 'Éveil d’un champion', detail: 'une rune par cran' },
      fixed('scriptorium', 'lieu fixe tenu, en continu'),
      fixed('altar', 'lieu fixe tenu — runes à partir du bleu'),
      fixed('lab', 'lieu fixe tenu — runes à partir du violet'),
      {
        emoji: '🏰',
        label: 'Coffre de la forteresse de l’île',
        detail: 'une fois, quand elle tombe',
        fortress: true,
      },
      { emoji: '🌀', label: 'Brèche maudite', detail: 'à chaque victoire', islands: [5] },
    ],
  },
  tickets: {
    emoji: '🎟️',
    name: 'Tickets d’invocation',
    use: 'Invoquer un champion (un ticket = un tirage).',
    sources: [
      { emoji: '⭐', label: 'Niveau global gagné', detail: '1 par niveau' },
      { emoji: '🎯', label: 'Défi 360 bouclé dans les temps', detail: '2 à 5 selon l’effort' },
      { emoji: '🐉', label: 'Boss entre amis abattu', detail: '1 à 4 selon le cran' },
      { emoji: '🛕', label: 'Construction du Panthéon', detail: '10, une seule fois' },
      {
        emoji: '⛵',
        label: 'Premier débarquement sur l’île suivante',
        detail: '10, une fois par île',
        islands: [1, 2, 3, 4],
      },
    ],
  },
};

/** 🏝️ Ce qui est à portée : les lieux fixes de l'île active, ceux tenus sur une île quittée
 *  (type → numéro de l'île), l'île active (`null` hors archipel) et sa forteresse. */
export interface SourceContext {
  island: number | null;
  kinds: readonly ControlKind[];
  heldElsewhere: ReadonlyMap<ControlKind, number>;
  fortressStands: boolean;
}

/** Le contexte d'une carte (`null` = pas encore de carte : on ne montre que ce qui est partout). */
export function sourceContext(map: ExpeditionMap | null | undefined): SourceContext {
  if (!map) return { island: null, kinds: [], heldElsewhere: new Map(), fortressStands: false };
  const island = map.archipel?.island ?? null;
  const heldElsewhere = new Map<ControlKind, number>();
  for (const other of Object.values(map.islands ?? {})) {
    const id = other.archipel?.island;
    if (id === undefined || id === island) continue;
    for (const p of other.pois)
      if (p.control?.owner === 'player' && !heldElsewhere.has(p.control.kind))
        heldElsewhere.set(p.control.kind, id);
  }
  return {
    island,
    kinds: controlKindsOf(map),
    heldElsewhere,
    fortressStands:
      island !== null &&
      !map.archipel?.destroyed?.includes(FORTRESS_ID) &&
      map.archipel?.chestAt === undefined,
  };
}

/** Les sources d'une ressource à portée dans ce contexte. Un lieu fixe tenu sur une île
 *  quittée le dit (il produit toujours, à distance). */
export function sourcesFor(id: ResourceId, ctx: SourceContext): ResourceSource[] {
  const out: ResourceSource[] = [];
  for (const s of RESOURCE_SOURCES[id].sources) {
    if (s.islands && (ctx.island === null || !s.islands.includes(ctx.island))) continue;
    if (s.fortress && !ctx.fortressStands) continue;
    if (s.fixed && !ctx.kinds.includes(s.fixed)) {
      const on = ctx.heldElsewhere.get(s.fixed);
      if (on === undefined) continue;
      out.push({ ...s, detail: `tenu sur l’île ${on}, il produit toujours` });
      continue;
    }
    out.push(s);
  }
  return out;
}
