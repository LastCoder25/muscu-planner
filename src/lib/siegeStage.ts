// siegeStage.ts — MISE EN SCÈNE d'un siège (pur/testable).
//
// ⚠️ RÈGLE FONDATRICE, reprise mot pour mot d'`arenaStage.ts` : **ce module ne décide
// RIEN du combat**. Il place dans l'espace ce que `simulateDungeon` a déjà tranché, en
// relisant le log de `RaidReport.fights`. Les groupes repoussés, la courbe de PV et donc
// les récompenses sont identiques au bit près — la calibration de la défense n'est pas
// touchée, et un test de non-régression le vérifie.
//
// Différences avec l'arène, qui rendent le siège PLUS simple à mettre en scène :
//  • le défenseur est la BASE : elle ne bouge pas, il n'y a pas de cible à poursuivre ;
//  • les corps ne sont pas ventilés artificiellement (`splitPv`) — un raid porte sa VRAIE
//    composition (`RaidGroup.count`), donc on connaît déjà chaque assaillant ;
//  • les ennemis frappent le mur, pas un héros mobile.
//
// Ce qu'on lui emprunte, en revanche, c'est le mécanisme qui compte : les BORNES CUMULÉES.
// `dealt` (dégâts infligés au groupe) est monotone, chaque corps a sa borne, donc un corps
// tombe exactement quand le log dit qu'il tombe et ne se relève jamais.
import { BATTLE } from './siegeBattle';
import { mulberry32 } from './combat';
import { treePath } from './expedition';
import type { RaidGroup, RaidReport } from './raid';

/** Un assaillant à l'écran. Sa position est posée une fois, en anneau autour de la base. */
export interface SiegeBody {
  id: string;
  group: number; // index du groupe (= de la vague)
  member: number; // index dans le groupe
  emoji: string;
  name: string;
  level: number;
  champion: boolean;
  /** Angle d'arrivée (radians) et distance de départ, hors des murs. */
  angle: number;
  dist: number;
}

/** Un temps de l'animation. Chaque événement du log en produit un. */
interface SiegeBeat {
  /** Le TOUR du moteur d’où vient ce temps. ⚠️ Il portait jusqu’ici zéro information de
   *  position : l’écran ne pouvait donc pas savoir où en était l’assaut, et il faisait
   *  TÉLÉPORTER les corps au pied du mur dès que leur groupe était engagé. C’est lui qui
   *  porte la traversée.
   *
   *  ⚠️ Recopié du log, jamais recalculé — même règle que tout le reste de ce module :
   *  il rejoue une bataille déjà tranchée, il n’en décide rien. */
  round: number;
  group: number;
  /** `turret` = la base tire ; `foe` = un assaillant frappe le mur. */
  kind: 'turret' | 'foe';
  /** Corps concerné : la cible visée (turret) ou l'assaillant qui frappe (foe). */
  body: number;
  /** Tourelle d'où part le tir — la plus proche de la cible (turret uniquement). */
  turret: number;
  crit: boolean;
  dodge: boolean;
  damage: number;
  /** PV du MUR après ce temps → barre de vie du rempart. */
  basePv: number;
  /** Le coup portait-il SUR LE MUR ? ⚠️ Le moteur en deux phases permet désormais à un
   *  assaillant de tirer sur une TOURELLE : sans ce drapeau, l'écran tremblerait et
   *  virerait au rouge pour un coup que le rempart n'a jamais reçu. */
  onWall: boolean;
  /** Dégâts CUMULÉS infligés au groupe courant → d'où l'on déduit les corps à terre. */
  dealt: number;
  /** Corps tombant SUR ce temps (jamais deux fois, cf. bornes cumulées). */
  kills: number[];
}

export interface SiegeStage {
  bodies: SiegeBody[];
  beats: SiegeBeat[];
  maxPv: number;
  /** Groupes effectivement repoussés — recopié du rapport, jamais recalculé. */
  defeated: number;
  total: number;
  held: boolean;
}

export const SIEGE_STAGE = {
  /**
   * DEMI-CÔTÉ DE LA CAMÉRA (centre = 100,100) : le plateau montre le carré
   * [100 ± field].
   *
   * ⚠️ Il cadrait jusqu’ici au plus juste sur l’enceinte (100), si bien que le rempart
   * occupait 72 % de la largeur et qu’il ne restait pas 30 unités de terrain autour :
   * l’armée n’avait littéralement pas la place d’arriver de loin. On recule donc la
   * caméra — l’enceinte tombe à 42 % de la largeur, entre la vue « Ma base » (72 %) et
   * la carte des mondes (~14 %).
   *
   * ⚠️ L’ENCEINTE NE CHANGE PAS DE TAILLE (rayon 72, mêmes sommets, mêmes créneaux) :
   * seule la caméra recule. C’est ce qui fait qu’on reconnaît sa propre base au moment
   * du verdict — la règle posée quand ce plateau a été écrit.
   */
  field: 170,
  /** Anneau d'arrivée des assaillants (unités du dessin, centre = 100,100).
   *
   *  ⚠️ IL VALAIT 84-96, soit 4 à 16 unités au-dessus du pied du mur : la « traversée »
   *  livrée juste avant couvrait 2 à 8 % du plateau, donc elle ne se VOYAIT pas — les
   *  assaillants avaient l’air d’être déjà arrivés. Ils surgissent désormais au bord du
   *  champ et marchent 44 à 78 unités sous le feu.
   *
   *  ⚠️ Bornés par `field` : un corps né hors cadre n’entrerait en scène qu’à
   *  mi-chemin, ce qui supprimerait précisément ce qu’on veut montrer. */
  spawnMin: 124,
  spawnMax: 158,
  /** Ouverture de l'arc d'assaut : une armée arrive d'un CÔTÉ, pas de partout — sinon
   *  elle a l'air de pleuvoir plutôt que de marcher sur la ville. */
  arc: Math.PI * 1.35,
  /** ⚠️ Une armee nombreuse marche EN PROFONDEUR. Depuis que la masse visible a ete
   *  multipliee (cf. `RAID.massMult`), un siege aligne 50 a 80 corps : sur un arc
   *  unique ils se chevauchent et ne se lisent plus comme une troupe, mais comme un
   *  trait. On les repartit donc sur plusieurs RANGS, espaces vers l exterieur — ce
   *  qui est aussi la facon dont une armee aborde reellement un rempart.
   *  ⚠️ Purement VISUEL : le nombre de rangs ne touche ni les beats, ni les bornes
   *  cumulees, ni l issue — ce module ne decide rien du combat. */
  perRank: 20,
  maxRanks: 3,
  /** Rayon auquel un assaillant est ARRIVÉ au pied du mur. Juste au-delà des tourelles
   *  (enceinte 72 + tour 7,5) pour qu’on le voie cogner sans le superposer à la pierre. */
  wallStop: 80,
  /**
   * Cadence PLANCHER d’un temps d’approche (ms).
   *
   * ⚠️ Mesuré : un tour de traversée ne porte que 6 temps (les balistes seules ont la
   * portée du terrain entier), puis 18 quand les archers entrent — soit ~60 temps pour
   * toute l’approche. À la cadence d’un long siège (62 ms) elle passait en 3,6 s : un
   * sursaut, pas une marche. Le pas d’approche est donc PLANCHONNÉ, jamais raccourci —
   * un rejeu déjà lent (180 ms) garde son rythme.
   *
   * ⚠️ Purement RENDU : le nombre de temps, leur ordre et l’issue ne bougent pas d’un
   * bit — ce module ne décide rien du combat.
   */
  approachMs: 150,
  /**
   * PART DE LA PROFONDEUR DE FORMATION CONSERVÉE À L’ARRIVÉE.
   *
   * ⚠️ Sans elle, les trois rangs convergent tous vers `wallStop` EXACTEMENT : la
   * formation s’écrase sur un cercle d’un corps d’épaisseur, où les corps se recouvrent
   * au lieu de s’étaler. C’est précisément la profondeur pour laquelle les rangs
   * existent (une armée nombreuse aborde un rempart en épaisseur, pas en file).
   *
   * ⚠️ Une PART, pas la totalité : une armée qui garderait tout son étalement n’aurait
   * pas l’air d’être arrivée au contact.
   */
  rankKeep: 0.32,
} as const;

/**
 * OÙ EN EST L’ASSAUT à ce tour : 1 au bord du terrain, 0 au pied du mur.
 *
 * ⚠️ La règle vit ICI, et pas dans le composant. Deux copies de « où en est la
 * traversée » divergeraient à la première retouche de `BATTLE.fieldDepth` — et le
 * rejeu montrerait alors une armée qui arrive avant ou après qu’elle ne frappe, ce qui
 * est exactement le genre de mensonge qu’une mise en scène ne doit jamais raconter.
 */
export function approachAt(round: number): number {
  const d = BATTLE.fieldDepth;
  if (d <= 0) return 0;
  return Math.max(0, Math.min(1, (d - Math.max(0, round)) / d));
}

/** Où s’ARRÊTE un corps parti de `spawn` : au pied du mur pour le premier rang, un peu
 *  en retrait pour ceux de derrière — l’armée garde son épaisseur au contact. */
export function arrivalRadius(spawn: number): number {
  const retard = Math.max(0, spawn - SIEGE_STAGE.spawnMin);
  return SIEGE_STAGE.wallStop + retard * SIEGE_STAGE.rankKeep;
}

/** Le RAYON auquel dessiner un corps parti de `spawn`, au tour donné. Il marche vers
 *  le rempart et s’y arrête — il ne le traverse pas. */
export function assaultRadius(spawn: number, round: number): number {
  const stop = arrivalRadius(spawn);
  return stop + Math.max(0, spawn - stop) * approachAt(round);
}

/** Le sol du champ de bataille : des taches de prairie, des touffes et des conifères. */
export interface BattlefieldDecor {
  patches: { cx: number; cy: number; rx: number; ry: number }[];
  tufts: string[];
  trees: string[];
}

/**
 * LE TERRAIN AUTOUR DE LA VILLE, semé une fois pour toutes.
 *
 * ⚠️ Reculer la caméra sans rien mettre autour, c’est agrandir le vide : le rempart
 * flotterait au milieu d’un dégradé, exactement le défaut que l’écran « Ma base » a
 * corrigé en se posant sur une prairie. La vue de siège est CE MÊME LIEU vu de plus
 * loin — elle en reprend donc les teintes, `treePath` (le conifère déjà partagé avec
 * la carte) et `mulberry32` (le PRNG du projet, pas une n-ième copie).
 *
 * ⚠️ GRAINES FIXES, jamais dérivées du rapport : ce sont les abords de TA base, pas un
 * champ tiré au sort. Deux sièges de suite doivent se dérouler au même endroit.
 *
 * ⚠️ Rien sous l’enceinte ni sur la terre battue qui la ceinture (`keepOut`) : là où
 * l’on marche, l’herbe ne tient pas — et une touffe posée sur le rempart trahirait la
 * profondeur au lieu de la donner.
 *
 * ⚠️ Purement DÉCORATIF, comme les lézardes : ce module ne décide rien du combat.
 */
export function battlefieldDecor(keepOut: number): BattlefieldDecor {
  const f = SIEGE_STAGE.field;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  /** Tirage-rejet dans le cadre, hors de la couronne battue. Une seule boucle pour les
   *  trois semis — celle de l’écran « Ma base », à la marge de rejet près. */
  const scatter = <T>(
    seed: number,
    want: number,
    make: (x: number, y: number, rng: () => number) => T,
  ): T[] => {
    const rng = mulberry32(seed);
    const out: T[] = [];
    for (let i = 0; i < want * 8 && out.length < want; i++) {
      const x = 100 - f + rng() * 2 * f;
      const y = 100 - f + rng() * 2 * f;
      if (Math.hypot(x - 100, y - 100) <= keepOut) continue;
      out.push(make(x, y, rng));
    }
    return out;
  };
  return {
    patches: scatter(1717, 14, (cx, cy, rng) => ({
      cx: r1(cx),
      cy: r1(cy),
      rx: r1(10 + rng() * 16),
      ry: r1(5 + rng() * 8),
    })),
    tufts: scatter(4242, 90, (x, y, rng) => {
      const h = r1(3.4 + rng() * 2.8);
      const X = r1(x);
      const Y = r1(y);
      return `M${X} ${Y} l-1.8 -${r1(h * 0.8)} M${X} ${Y} l0 -${h} M${X} ${Y} l1.8 -${r1(h * 0.8)}`;
    }),
    // ⚠️ Les arbres sont dessinés AVANT les corps : un assaillant passe devant, jamais
    // derrière. C’est ce qui autorise à en semer partout plutôt qu’en lisière.
    trees: scatter(9091, 18, (x, y, rng) => treePath(r1(x), r1(y), r1(2 + rng() * 1.2))),
  };
}

/**
 * COMBIEN DE TEMPS DURE UN TEMPS DE L’ANIMATION.
 *
 * Deux régimes. **La cadence de fond** se resserre quand l’assaut est long — un siège
 * de 200 temps ne doit pas durer trois minutes (mêmes paliers que le plateau de
 * l’arène). **La marche d’approche**, elle, a un PLANCHER : mesuré, un tour de
 * traversée ne porte que 6 temps (les balistes seules atteignent le fond du terrain),
 * donc à 62 ms toute l’approche passait en 3,6 s — un sursaut, pas une marche.
 *
 * ⚠️ PLANCHER, jamais raccourcissement : un rejeu court tourne déjà à 180 ms et garde
 * son rythme. Sinon on ralentirait ce qui est déjà lent.
 *
 * ⚠️ Le rythme vit ICI et pas dans le composant, pour la même raison que la traversée
 * elle-même : un plancher qu’aucune porte ne regarde est un levier mort qui reste
 * vert. « Est-on encore en approche ? » se lit sur `approachAt`, jamais sur une
 * comparaison à `fieldDepth` recopiée ailleurs.
 */
export function beatMs(round: number, beatCount: number): number {
  const base = beatCount > 200 ? 62 : beatCount > 90 ? 85 : beatCount > 40 ? 120 : 180;
  return approachAt(round) > 0 ? Math.max(base, SIEGE_STAGE.approachMs) : base;
}

/** ⚠️ Ce fichier importait DÉJÀ `mulberry32` vingt lignes plus haut, et en gardait un
 *  second exemplaire sous un autre nom — le commentaire « sans dépendance » avait cessé
 *  d’être vrai. La garde `|| 1` (graine 0) est conservée, elle : c’est la seule chose que
 *  la copie faisait de plus. */
const rand = (seed: number) => mulberry32(seed >>> 0 || 1);

/** Place les corps d'une armée : un arc autour de la base, un secteur par groupe pour
 *  qu'on distingue les vagues, et une gigue seedée pour éviter l'alignement militaire. */
export function placeBodies(groups: RaidGroup[], seed: number): SiegeBody[] {
  const rng = rand(seed);
  const out: SiegeBody[] = [];
  const total = groups.reduce((s, g) => s + g.count, 0);
  if (!total) return out;
  // L'arc démarre à une orientation seedée : deux sièges ne se ressemblent pas.
  const start = rng() * Math.PI * 2;
  // Assez de rangs pour que chacun reste lisible, sans depasser le fond du champ.
  const ranks = Math.min(SIEGE_STAGE.maxRanks, Math.max(1, Math.ceil(total / SIEGE_STAGE.perRank)));
  const perRank = Math.ceil(total / ranks);
  // ⚠️ Les rangs se partagent la bande de spawn EXISTANTE, ils ne la debordent pas :
  // au-dela de `spawnMax` on sort du dessin, en deca de `spawnMin` on se retrouve
  // dans les tourelles. La profondeur vient du partage, pas d un eloignement.
  const slice = (SIEGE_STAGE.spawnMax - SIEGE_STAGE.spawnMin) / ranks;
  let placed = 0;
  groups.forEach((g, gi) => {
    for (let m = 0; m < g.count; m++) {
      // Position DANS son rang : chaque rang re-etale l arc entier, sinon les rangs
      // arriere heriteraient du resserrement que l on corrige.
      const rank = Math.floor(placed / perRank);
      const rankSize = Math.min(perRank, total - rank * perRank);
      const t = ((placed % perRank) + 0.5) / rankSize;
      out.push({
        id: `b${gi}_${m}`,
        group: gi,
        member: m,
        emoji: g.emoji,
        name: g.species,
        level: g.level,
        champion: !!g.champion,
        angle: start + (t - 0.5) * SIEGE_STAGE.arc + (rng() - 0.5) * 0.12,
        dist: SIEGE_STAGE.spawnMin + rank * slice + rng() * slice,
      });
      placed++;
    }
  });
  return out;
}

/** Bornes cumulées d'un groupe : le k-ième corps tombe quand les dégâts cumulés
 *  franchissent sa borne. Parts ÉGALES qui somment EXACTEMENT aux PV du groupe → le
 *  dernier corps tombe précisément quand le groupe est vaincu, jamais avant ni après. */
export function cutsFor(groupPv: number, count: number): number[] {
  const cuts: number[] = [];
  for (let i = 1; i <= count; i++) cuts.push(Math.round((groupPv * i) / count));
  return cuts;
}

/** Tourelle la plus proche d'un angle donné (les tourelles sont réparties régulièrement). */
export function nearestTurret(angle: number, turretCount: number): number {
  if (turretCount <= 0) return 0;
  const step = (Math.PI * 2) / turretCount;
  // Les sommets de l'octogone sont décalés d'un demi-pas (cf. BasePage) et démarrent au
  // nord : on retrouve l'index en ramenant l'angle dans le même repère.
  const a = angle + Math.PI / 2 - step / 2;
  const k = Math.round(a / step);
  return ((k % turretCount) + turretCount) % turretCount;
}

/**
 * Construit la mise en scène complète d'un rapport de siège.
 *
 * ⚠️ RÈGLE FONDATRICE INCHANGÉE : ce module ne décide RIEN du combat. Il relit le log
 * que `simulateSiege` a produit — l'issue, les corps tombés et les récompenses sont
 * identiques au bit près.
 *
 * ⚠️ IL EST MÊME PLUS FIDÈLE QU'AVANT : l'ancien rejeu devait DEVINER quels corps
 * tombaient, en reconstituant des bornes cumulées à partir des PV d'un groupe. Le
 * nouveau moteur NOMME chaque mort (`kind: 'down'`) — on n'a plus qu'à la rattacher au
 * temps qui vient de la provoquer.
 */
export function buildSiegeStage(report: RaidReport, turretCount: number): SiegeStage {
  const bodies = placeBodies(report.groups, report.groups.length * 7919 + report.total);
  const beats: SiegeBeat[] = [];

  // Index du premier corps de chaque groupe → à quel groupe appartient le corps N.
  const groupOf: number[] = [];
  report.groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) groupOf.push(gi);
  });

  /** `a12` → le corps 12. Les ids viennent de `siegeAttackers`, qui les numérote dans
   *  l'ORDRE DES GROUPES — le même que `placeBodies`. Les deux ne peuvent donc pas se
   *  désynchroniser sans que la numérotation elle-même change. */
  const bodyOf = (id: string | undefined): number => {
    if (!id || id[0] !== 'a') return -1;
    const n = Number(id.slice(1));
    return Number.isFinite(n) && n >= 0 && n < bodies.length ? n : -1;
  };
  /** `t3` → la tourelle 3. Le héros et les aventuriers n'en sont pas : leur tir part de
   *  la tourelle la plus proche de la cible, faute de position propre sur le dessin. */
  const turretOf = (id: string | undefined): number => {
    if (!id || id[0] !== 't') return -1;
    const n = Number(id.slice(1));
    return Number.isFinite(n) && n >= 0 && n < turretCount ? n : -1;
  };

  let wallPv = report.maxPv;
  for (const e of report.log) {
    if (e.kind === 'down') {
      // ⚠️ La mort se rattache au DERNIER temps joué : c'est lui qui l'a causée. Un
      // défenseur tombé (tourelle réduite au silence) n'est pas un corps du champ de
      // bataille — on ne l'ajoute donc pas aux `kills`, qui comptent les assaillants.
      const b = bodyOf(e.to);
      const last = beats[beats.length - 1];
      if (b >= 0 && last) last.kills.push(b);
      continue;
    }
    // ⚠️ 'descend' est un DÉPLACEMENT, pas un coup : sans ce filtre il tomberait dans la
    // branche 'hit' plus bas et le rejeu inventerait un tir.
    if (e.kind === 'breach' || e.kind === 'enter' || e.kind === 'descend') continue;

    if (e.kind === 'wall') {
      wallPv = Math.max(0, wallPv - (e.amount ?? 0));
      const body = bodyOf(e.from);
      beats.push({
        round: e.round,
        group: body >= 0 ? (groupOf[body] ?? 0) : 0,
        kind: 'foe',
        body: Math.max(0, body),
        turret: 0,
        crit: false,
        dodge: false,
        damage: e.amount ?? 0,
        basePv: wallPv,
        onWall: true,
        dealt: 0,
        kills: [],
      });
      continue;
    }

    // `kind: 'hit'` — reste à savoir QUI frappe QUI.
    const cible = bodyOf(e.to);
    if (cible >= 0) {
      // Un défenseur abat un assaillant. Le trait part de sa tourelle, ou de la plus
      // proche quand c'est le héros ou un aventurier.
      const t = turretOf(e.from);
      const body = bodies[cible];
      beats.push({
        round: e.round,
        group: groupOf[cible] ?? 0,
        kind: 'turret',
        body: cible,
        turret: t >= 0 ? t : nearestTurret(body?.angle ?? 0, turretCount),
        crit: false,
        dodge: false,
        damage: e.amount ?? 0,
        basePv: wallPv,
        onWall: false,
        dealt: 0,
        kills: [],
      });
    } else {
      // Un assaillant fait taire un défenseur : le mur n'encaisse rien.
      const body = bodyOf(e.from);
      beats.push({
        round: e.round,
        group: body >= 0 ? (groupOf[body] ?? 0) : 0,
        kind: 'foe',
        body: Math.max(0, body),
        turret: turretOf(e.to),
        crit: false,
        dodge: false,
        damage: e.amount ?? 0,
        basePv: wallPv,
        onWall: false,
        dealt: 0,
        kills: [],
      });
    }
  }

  return {
    bodies,
    beats,
    maxPv: report.maxPv,
    defeated: report.defeated,
    total: report.total,
    held: report.held,
  };
}
