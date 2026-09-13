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
import { raidFirstSector, type RaidGroup, type RaidReport, type SiegeDefenderInfo } from './raid';

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

/** Ce qu’un temps montre. */
type SiegeBeatKind =
  /** Une BALISTE pivote vers sa cible et lâche son trait. */
  | 'turret'
  /** Un défenseur tire depuis le rempart (un aventurier, pas une machine : il ne pivote pas). */
  | 'archer'
  /** Le front cogne le mur — tous les coups d’un tour. */
  | 'wall'
  /** Une volée ennemie s’abat sur le rempart (balistes, archers) — tous les tirs d’un tour. */
  | 'salvo'
  /** On se bat DANS LA COUR. */
  | 'yard'
  /** La brèche s’ouvre ou s’élargit. */
  | 'breach'
  /** Des assaillants franchissent la brèche. */
  | 'enter'
  /** Des défenseurs descendent du rempart pour tenir la cour. */
  | 'descend';

/** Un temps de l’animation — un GESTE, qui peut regrouper plusieurs lignes du log. */
export interface SiegeBeat {
  /** Le TOUR du moteur d’où vient ce temps. ⚠️ Recopié du log, jamais recalculé : c’est
   *  lui qui porte la traversée (sans lui les corps TÉLÉPORTAIENT au pied du mur). */
  round: number;
  kind: SiegeBeatKind;
  /** Groupe du corps principal (bannière de vague). */
  group: number;
  /** Corps principal concerné, −1 s’il n’y en a pas (brèche, descente). */
  body: number;
  /** Baliste qui tire (`turret`), −1 sinon. */
  turret: number;
  /** Défenseur qui agit (`t3`, `hero`, `adv_…`), ou null. */
  shooter: string | null;
  /** Corps d’assaillants frappés par des défenseurs. */
  targets: number[];
  /** Défenseur à l’origine de chaque coup de `targets` (même index). */
  strikers: string[];
  /** Corps d’assaillants qui agissent (mur, volée, cour, entrée). */
  attackers: number[];
  /** Défenseurs frappés (volée, cour) ou qui descendent. */
  victims: string[];
  damage: number;
  /** PV du MUR après ce temps → barre du rempart. */
  basePv: number;
  /** Le coup portait-il SUR LE MUR ? Seul ce cas fait trembler l’écran. */
  onWall: boolean;
  /** Dégâts CUMULÉS infligés au groupe courant. */
  dealt: number;
  /** Corps tombant SUR ce temps (jamais deux fois). */
  kills: number[];
  /** Défenseurs mis hors de combat sur ce temps — BLESSÉS, jamais morts. */
  wounded: string[];
  /** Largeur de la brèche à ce temps (0 = le mur tient). */
  width: number;
  /** Ce temps OUVRE la brèche (elle était fermée juste avant). */
  opens: boolean;
}

export interface SiegeStage {
  bodies: SiegeBody[];
  beats: SiegeBeat[];
  maxPv: number;
  /** Groupes effectivement repoussés — recopié du rapport, jamais recalculé. */
  defeated: number;
  total: number;
  held: boolean;
  /** Le pan qui cède, et l’angle de son milieu — là où la brèche s’ouvre. */
  breachPan: number;
  breachAngle: number;
  /** Qui défendait, poste de départ compris. */
  defenders: SiegeDefender[];
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
  maxRanks: 3,
  /** Corps par rang au sein d’UN groupe : un groupe tient son pan, il s’épaissit donc
   *  vers l’arrière au lieu de s’étaler sur celui du voisin. */
  perGroupRow: 7,
  /** Part d’un pan qu’un groupe occupe — le reste sépare deux vagues à l’œil. */
  panFill: 0.88,
  /** Demi-côté de la caméra une fois la brèche ouverte : on plonge vers la cour. */
  breachField: 112,
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

const STEP = (Math.PI * 2) / BATTLE.sectors;

/**
 * L’ANGLE D’UN PAN — celui de la baliste qui s’y dresse (sommet de l’octogone).
 *
 * ⚠️ MÊME REPÈRE que le dessin de l’enceinte et que `nearestTurret` : un octogone décalé
 * d’un demi-pas, qui démarre au nord. Le moteur range ses assaillants par PAN et borne
 * l’arc d’une baliste en pans ; dessiner les corps ailleurs que sur leur pan faisait
 * tirer une baliste à travers toute la ville, vers une cible posée de l’autre côté.
 */
export function sectorAngle(sector: number): number {
  return -Math.PI / 2 + STEP / 2 + sector * STEP;
}

/**
 * Place les corps d’une armée SUR LE PAN QUE LE MOTEUR LEUR A DONNÉ.
 *
 * ⚠️ Ils étaient posés sur un arc à orientation TIRÉE AU SORT, sans rapport avec
 * `siegeAttackers`, qui range pourtant chaque groupe sur un pan précis — celui que les
 * balistes voisines couvrent. Tant que les tirs étaient des traits instantanés ça
 * passait inaperçu ; dès qu’une baliste PIVOTE vers sa cible, elle se serait tournée
 * vers la ville. La géométrie du rejeu doit être celle de la bataille.
 *
 * Les angles restent CONTINUS (le groupe `gi` est à `gi` pans du premier, jamais ramené
 * modulo le tour) : sinon une armée à cheval sur le nord se couperait en deux sur l’écran.
 */
export function placeBodies(groups: RaidGroup[], seed: number, firstSector = 0): SiegeBody[] {
  const rng = rand(seed);
  const out: SiegeBody[] = [];
  groups.forEach((g, gi) => {
    if (g.count <= 0) return;
    const center = sectorAngle(firstSector) + gi * STEP;
    // Un groupe nombreux marche en PROFONDEUR : plusieurs rangs, qui se partagent la bande
    // de départ sans la déborder (au-delà on sort du cadre, en deçà on est dans les tours).
    const ranks = Math.min(
      SIEGE_STAGE.maxRanks,
      Math.max(1, Math.ceil(g.count / SIEGE_STAGE.perGroupRow)),
    );
    const perRow = Math.ceil(g.count / ranks);
    const slice = (SIEGE_STAGE.spawnMax - SIEGE_STAGE.spawnMin) / ranks;
    for (let m = 0; m < g.count; m++) {
      const rank = Math.floor(m / perRow);
      const rowSize = Math.min(perRow, g.count - rank * perRow);
      const t = ((m % perRow) + 0.5) / rowSize;
      out.push({
        id: `b${gi}_${m}`,
        group: gi,
        member: m,
        emoji: g.emoji,
        name: g.species,
        level: g.level,
        champion: !!g.champion,
        // ⚠️ Un groupe tient SON pan, pas celui du voisin : on laisse une marge entre deux
        // groupes pour qu’on distingue les vagues.
        angle: center + (t - 0.5) * STEP * SIEGE_STAGE.panFill + (rng() - 0.5) * 0.08,
        dist: SIEGE_STAGE.spawnMin + rank * slice + rng() * slice,
      });
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

// ── 🏹 LA VISÉE ─────────────────────────────────────────────────────────────────

/** Le cap (degrés) d’un dessin orienté « vers le haut » qui regarde de (x1,y1) vers
 *  (x2,y2). Même convention que la rotation des balistes de l’écran « Ma base » (+90°). */
export function aimDeg(x1: number, y1: number, x2: number, y2: number): number {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90;
}

/**
 * Tourner vers un cap par le PLUS COURT chemin.
 *
 * ⚠️ Sans elle, une baliste passant de 170° à −170° ferait un tour presque complet sur
 * elle-même pour un écart de 20° — l’œil lit une machine qui s’affole. La valeur rendue
 * n’est volontairement PAS ramenée dans [0, 360[ : c’est l’angle cumulé qui permet à la
 * transition CSS d’interpoler dans le bon sens.
 */
export function turnToward(prevDeg: number, targetDeg: number): number {
  const d = ((((targetDeg - prevDeg) % 360) + 540) % 360) - 180;
  return prevDeg + d;
}

// ── ⏱️ LE RYTHME D’UN TIR ───────────────────────────────────────────────────────

export const SHOT = {
  /** La baliste pivote vers sa cible… */
  pivotMs: 100,
  /** …PUIS lâche son trait, qui vole jusqu’à l’impact. */
  flightMs: 140,
  /** Un souffle après l’impact, pour qu’on le voie avant le geste suivant. */
  padMs: 30,
  /** Un archer ne pivote pas (un homme se tourne, une machine se règle) : il tire. */
  arrowMs: 140,
  /** Une volée ennemie : le temps de voir les flèches monter vers le rempart. */
  salvoMs: 240,
  /** Un échange de coups dans la cour. */
  yardMs: 300,
  /** Le temps de franchir la brèche. */
  enterMs: 560,
  /** Le mur CÈDE : on s’arrête, la caméra plonge vers la cour. ⚠️ Seulement à
   *  l’OUVERTURE — la brèche s’élargit 4 à 7 fois par siège, et rejouer la pause à
   *  chaque fois ajoutait jusqu’à 10 s (mesuré). */
  breachMs: 1500,
  /** La brèche s’élargit : un geste, pas une pause. */
  widenMs: 300,
  /** Une descente du rempart. */
  descendMs: 420,
  /** On ralentit sur un temps qui tue quelqu’un — un temps qui compte se regarde. */
  killMs: 260,
} as const;

/** Les instants d’un temps, en ms depuis son début. */
export interface BeatTiming {
  /** Instant où le projectile PART (0 si rien ne pivote avant). */
  launch: number;
  /** Instant de l’impact — dégâts affichés, corps qui tombe. */
  impact: number;
  /** Durée totale du temps : le suivant ne commence pas avant. */
  total: number;
}

/**
 * LES INSTANTS D’UN TEMPS : quand le trait part, quand il frappe, quand on passe au suivant.
 *
 * ⚠️ LA GARANTIE DEMANDÉE PAR L’UTILISATEUR VIT ICI : **une baliste ne se tourne pas
 * vers une autre cible tant que son projectile n’est pas parti**. Les temps se jouent
 * l’un après l’autre et une baliste ne vise qu’en DÉBUT de temps, donc il suffit que le
 * lâcher tombe avant la fin du temps — ce que `total ≥ impact > launch` assure par
 * construction, et qu’un test vérifie sur de vrais sièges.
 *
 * ⚠️ Des PLANCHERS, jamais des raccourcis : sur un long siège la cadence de fond descend
 * à 62 ms, où un pivot suivi d’un vol ne se verrait pas. Le temps s’allonge pour que le
 * geste existe ; il ne se raccourcit jamais sous le rythme de fond.
 */
export function beatTiming(beat: SiegeBeat, beatCount: number): BeatTiming {
  const base = beatMs(beat.round, beatCount);
  // ⚠️ LE GESTE SE RESSERRE QUAND LE SIÈGE S’ALLONGE, comme la cadence de fond. Mesuré à
  // gestes fixes : 73 à 90 s de moyenne et jusqu’à 157 s — ~140 tirs de baliste à 280 ms
  // chacun pesaient à eux seuls 40 s. Il ne descend jamais sous les deux tiers : en deçà,
  // un pivot suivi d’un vol ne se verrait plus.
  const k = tempoFor(beatCount);
  const ms = (x: number) => Math.round(x * k);
  const slow = beat.kills.length || beat.wounded.length ? ms(SHOT.killMs) : 0;
  let launch = 0;
  let impact = 0;
  let floor = 0;
  switch (beat.kind) {
    case 'turret':
      launch = ms(SHOT.pivotMs);
      impact = launch + ms(SHOT.flightMs);
      floor = impact + ms(SHOT.padMs);
      break;
    case 'archer':
      impact = ms(SHOT.arrowMs);
      floor = impact + ms(SHOT.padMs);
      break;
    case 'salvo':
      impact = ms(SHOT.salvoMs);
      floor = impact + ms(SHOT.padMs);
      break;
    case 'yard':
      impact = ms(SHOT.yardMs * 0.5);
      floor = ms(SHOT.yardMs);
      break;
    case 'enter':
      floor = ms(SHOT.enterMs);
      break;
    case 'breach':
      // La pause dramatique n’est PAS resserrée : elle n’arrive qu’une fois.
      floor = beat.opens ? SHOT.breachMs : ms(SHOT.widenMs);
      break;
    case 'descend':
      floor = ms(SHOT.descendMs);
      break;
    case 'wall':
      impact = Math.round(base * 0.3);
      break;
  }
  return { launch, impact, total: Math.max(base, floor) + slow };
}

/** Facteur de tempo des gestes : 1 sur un siège court, jusqu’aux deux tiers sur un long. */
function tempoFor(beatCount: number): number {
  return beatCount > 200 ? 0.66 : beatCount > 140 ? 0.8 : 1;
}

// ── 🧱 LA BRÈCHE ET LA COUR ─────────────────────────────────────────────────────

/** Rayon du mur (sommets) — le même que l’écran « Ma base ». */
export const SIEGE_WALL_R = 72;
/** Demi-largeur de la cour intérieure : l’apothème de l’octogone intérieur (×0,86). */
const YARD_APOTHEM = SIEGE_WALL_R * 0.86 * Math.cos(Math.PI / BATTLE.sectors);

/**
 * LA PART D’UN PAN QUI S’EST EFFONDRÉE, selon la largeur de la brèche.
 *
 * ⚠️ Elle SUIT la largeur du moteur au lieu d’un état « ouverte / fermée » : la brèche
 * s’élargit à mesure que le mur continue de tomber (cf. `breachWidth`), et l’écran le
 * montre. Jamais le pan entier — il reste des chicots de mur de part et d’autre.
 */
export function breachGap(width: number): number {
  if (width <= 0) return 0;
  const f = Math.min(1, width / BATTLE.breachMaxWidth);
  return 0.22 + 0.5 * f;
}

/** Demi-angle (radians) de la plus grande trouée possible, vue du centre. */
export const BREACH_HALF_ANGLE = (breachGap(BATTLE.breachMaxWidth) * STEP) / 2;
/** Où commencent les tireurs du rempart : au-delà de la plus grande trouée, avec une marge. */
const RAMPART_CLEAR = BREACH_HALF_ANGLE + 0.12;

/** Le pan qui cède : au cœur du front, entre la baliste du groupe central et la suivante. */
function breachPan(firstSector: number, groupCount: number): number {
  const c = firstSector + Math.floor(Math.max(0, groupCount - 1) / 2);
  return ((c % BATTLE.sectors) + BATTLE.sectors) % BATTLE.sectors;
}

/** L’angle du milieu d’un pan (entre le sommet `pan` et le suivant). */
export function panAngle(pan: number): number {
  return sectorAngle(pan) + STEP / 2;
}

interface Point {
  x: number;
  y: number;
}

/**
 * OÙ SE TIENT, DANS LA COUR, le k-ième assaillant entré par la brèche.
 *
 * ⚠️ Toujours À L’INTÉRIEUR de l’octogone intérieur — un test le balaie. Les places se
 * RECYCLENT (modulo) : le moteur ne laisse jamais plus de `breachMaxWidth` corps à la
 * fois dans la cour, et un corps tombé reste où il est tombé.
 */
export function yardAttackerSpot(angle: number, k: number): Point {
  const slot = ((k % 8) + 8) % 8;
  const row = Math.floor(slot / 4);
  const col = slot % 4;
  const r = 40 - row * 11;
  const lat = (col - 1.5) * 11;
  return along(angle, r, lat);
}

/** OÙ SE TIENT un défenseur : sur le chemin de ronde face au front, ou dans la cour, entre
 *  la brèche et le cœur de la ville. */
export function defenderSpot(angle: number, j: number, n: number, post: 'rampart' | 'yard'): Point {
  if (post === 'rampart') {
    // ⚠️ DE PART ET D’AUTRE DE LA BRÈCHE, jamais dessus : posés en éventail centré sur elle
    // (premier jet), les tireurs du chemin de ronde RECOUVRAIENT la trouée — vu sur le
    // banc, le mur avait l’air intact alors qu’il était ouvert. Ils flanquent donc le trou,
    // en alternant les côtés, au-delà de la plus grande ouverture possible.
    const side = j % 2 === 0 ? 1 : -1;
    const a = angle + side * (RAMPART_CLEAR + Math.floor(j / 2) * 0.2);
    const r = SIEGE_WALL_R * 0.93;
    return { x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r };
  }
  const perRow = 4;
  const row = Math.floor(j / perRow);
  const rowSize = Math.min(perRow, n - row * perRow);
  const lat = ((j % perRow) - (rowSize - 1) / 2) * 12;
  return along(angle, 20 - row * 11, lat);
}

function along(angle: number, r: number, lat: number): Point {
  const px = -Math.sin(angle);
  const py = Math.cos(angle);
  return {
    x: 100 + Math.cos(angle) * r + px * lat,
    y: 100 + Math.sin(angle) * r + py * lat,
  };
}

/** La cour tient-elle ce point ? (utilisé par les tests et par personne d’autre) */
export function insideYard(p: Point): boolean {
  const dx = p.x - 100;
  const dy = p.y - 100;
  // Octogone : on vérifie la projection sur chaque normale de pan.
  for (let i = 0; i < BATTLE.sectors; i++) {
    const a = panAngle(i);
    if (dx * Math.cos(a) + dy * Math.sin(a) > YARD_APOTHEM) return false;
  }
  return true;
}

/**
 * LE CADRAGE UNE FOIS LA BRÈCHE OUVERTE : la caméra plonge vers la cour.
 *
 * ⚠️ Demandé explicitement : « avec vision sur l’intérieur de la base ». Vue de 170 unités,
 * une mêlée entre quelques corps dans une cour de 57 unités ne se lit pas. On resserre, et
 * on décale le centre vers la brèche — c’est là que ça se passe.
 */
export function breachCamera(angle: number): { cx: number; cy: number; field: number } {
  return {
    cx: 100 + Math.cos(angle) * 18,
    cy: 100 + Math.sin(angle) * 18,
    field: SIEGE_STAGE.breachField,
  };
}

// ── 🎬 LES TEMPS ────────────────────────────────────────────────────────────────

/** Défenseur du rejeu : son identité, et son poste de DÉPART (il peut descendre). */
interface SiegeDefender extends SiegeDefenderInfo {
  post: 'rampart' | 'yard';
}

/** Graine d’un rapport — relue dans `raidId` pour ceux stockés avant qu’on la garde. */
export function reportSeed(report: RaidReport): number {
  if (Number.isFinite(report.seed)) return report.seed!;
  const m = /^raid_(-?\d+)_/.exec(report.raidId ?? '');
  return m ? Number(m[1]) : 0;
}

const ATT = /^a(\d+)$/;
const TUR = /^t(\d+)$/;

/**
 * Construit la mise en scène complète d'un rapport de siège.
 *
 * ⚠️ RÈGLE FONDATRICE INCHANGÉE : ce module ne décide RIEN du combat. Il relit le log
 * que `simulateSiege` a produit — l'issue, les corps tombés et les récompenses sont
 * identiques au bit près.
 *
 * ⚠️ LES ÉVÉNEMENTS SONT REGROUPÉS PAR TOUR, et c’est ce qui rend le reste possible.
 * Mesuré sur 30 sièges : ~160 coups sur le mur en ~19 tours, et **160 à 450 tirs
 * d’archers ennemis sur le rempart** — chacun devenait un temps, donc le rejeu passait
 * l’essentiel de sa minute à faire trembler l’écran coup par coup. Un tour de front qui
 * cogne est UN geste ; une volée qui s’abat sur le rempart en est un autre. Le temps
 * ainsi rendu paie le pivot et le vol des traits de baliste.
 *
 * ⚠️ ET PLUS RIEN N’EST JETÉ : `breach`, `enter` et `descend` étaient ignorés, et les coups
 * échangés dans la cour étaient affichés comme des tirs de tourelle. La brèche existait
 * dans la bataille, jamais à l’écran — c’est exactement ce qu’un joueur a signalé.
 */
export function buildSiegeStage(report: RaidReport, turretCount: number): SiegeStage {
  const firstSector = raidFirstSector(reportSeed(report));
  const bodies = placeBodies(
    report.groups,
    report.groups.length * 7919 + report.total,
    firstSector,
  );
  const pan = breachPan(firstSector, report.groups.length);
  const angle = panAngle(pan);

  const groupOf: number[] = [];
  report.groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) groupOf.push(gi);
  });
  const bodyOf = (id: string | undefined): number => {
    const m = ATT.exec(id ?? '');
    if (!m) return -1;
    const n = Number(m[1]);
    return n < bodies.length ? n : -1;
  };
  const turretOf = (id: string | undefined): number => {
    const m = TUR.exec(id ?? '');
    if (!m) return -1;
    const n = Number(m[1]);
    return n < turretCount ? n : -1;
  };

  const defenders = defendersOf(report, bodyOf);
  const defIds = new Set(defenders.map((d) => d.id));

  const beats: SiegeBeat[] = [];
  const blank = (round: number, kind: SiegeBeatKind): SiegeBeat => ({
    round,
    kind,
    group: 0,
    body: -1,
    turret: -1,
    shooter: null,
    targets: [],
    strikers: [],
    attackers: [],
    victims: [],
    damage: 0,
    basePv: report.maxPv,
    onWall: kind === 'wall',
    dealt: 0,
    kills: [],
    wounded: [],
    width: 0,
    opens: false,
  });

  let round = -1;
  let open = new Map<string, SiegeBeat>();
  const inside = new Set<number>();
  let width = 0;
  let last: SiegeBeat | null = null;
  /** Dégâts portés AUX ASSAILLANTS par temps : une échauffourée de la cour mêle les coups
   *  des deux camps dans `damage`, or seuls les premiers entament un groupe. */
  const foeDamage = new Map<SiegeBeat, number>();
  const beatFor = (key: string, r: number, kind: SiegeBeatKind): SiegeBeat => {
    if (r !== round) {
      round = r;
      open = new Map();
    }
    let b = open.get(key);
    if (!b) {
      b = blank(r, kind);
      b.width = width;
      open.set(key, b);
      beats.push(b);
    }
    return b;
  };

  for (const e of report.log) {
    if (e.kind === 'down') {
      if (!last) continue;
      const b = bodyOf(e.to);
      if (b >= 0) last.kills.push(b);
      else if (e.to) last.wounded.push(e.to);
      continue;
    }
    if (e.kind === 'breach') {
      const before = width;
      width = e.width ?? width;
      const b = beatFor(`breach${e.width}`, e.round, 'breach');
      b.width = width;
      b.opens = before === 0 && width > 0;
      last = b;
      continue;
    }
    if (e.kind === 'enter') {
      const body = bodyOf(e.from);
      if (body < 0) continue;
      inside.add(body);
      const b = beatFor('enter', e.round, 'enter');
      b.attackers.push(body);
      if (b.body < 0) {
        b.body = body;
        b.group = groupOf[body] ?? 0;
      }
      b.width = width;
      last = b;
      continue;
    }
    if (e.kind === 'descend') {
      const b = beatFor('descend', e.round, 'descend');
      if (e.to) b.victims.push(e.to);
      last = b;
      continue;
    }
    if (e.kind === 'wall') {
      const body = bodyOf(e.from);
      const b = beatFor('wall', e.round, 'wall');
      if (body >= 0) {
        b.attackers.push(body);
        if (b.body < 0) {
          b.body = body;
          b.group = groupOf[body] ?? 0;
        }
      }
      b.damage += e.amount ?? 0;
      last = b;
      continue;
    }

    // `kind: 'hit'`
    const cible = bodyOf(e.to);
    if (cible >= 0) {
      // Un défenseur frappe un assaillant.
      // ⚠️ UNE BALISTE = UN TEMPS, parce que c’est son PIVOT qu’on veut voir. Les archers du
      // rempart, eux, tirent en VOLÉE sur un tour, et la mêlée de la cour est UNE
      // échauffourée : chaque aventurier ayant son temps, la cour pesait à elle seule 19 à
      // 26 s d’un rejeu de niveau 60-90 (mesuré, 81 à 116 temps).
      const t = turretOf(e.from);
      const kind: SiegeBeatKind = t >= 0 ? 'turret' : inside.has(cible) ? 'yard' : 'archer';
      const key = t >= 0 ? `d:${e.from}` : kind;
      const b = beatFor(key, e.round, kind);
      if (b.shooter === null) b.shooter = e.from ?? null;
      if (e.from) b.strikers.push(e.from);
      b.turret = t;
      b.targets.push(cible);
      if (b.body < 0) {
        b.body = cible;
        b.group = groupOf[cible] ?? 0;
      }
      b.damage += e.amount ?? 0;
      foeDamage.set(b, (foeDamage.get(b) ?? 0) + (e.amount ?? 0));
      last = b;
      continue;
    }
    // Un assaillant frappe un défenseur (baliste, archer du rempart, ou dans la cour).
    const body = bodyOf(e.from);
    if (body < 0 || !e.to || !(TUR.test(e.to) || defIds.has(e.to))) continue;
    const inYard = inside.has(body);
    const b = beatFor(inYard ? 'yard' : 'salvo', e.round, inYard ? 'yard' : 'salvo');
    b.attackers.push(body);
    b.victims.push(e.to);
    if (b.body < 0) {
      b.body = body;
      b.group = groupOf[body] ?? 0;
    }
    b.damage += e.amount ?? 0;
    last = b;
  }

  // Les PV du rempart et les dégâts cumulés par groupe se DÉRIVENT de l’ordre des temps,
  // une fois les regroupements faits : calculés au fil de l’eau, un temps créé tôt dans
  // un tour aurait porté des PV d’avant les coups regroupés plus tard dans ce même tour,
  // et la barre serait remontée à l’écran.
  let pv = report.maxPv;
  const dealt = new Map<number, number>();
  for (const b of beats) {
    if (b.kind === 'wall') pv = Math.max(0, pv - b.damage);
    b.basePv = pv;
    const f = foeDamage.get(b) ?? 0;
    if (f) dealt.set(b.group, (dealt.get(b.group) ?? 0) + f);
    b.dealt = dealt.get(b.group) ?? 0;
  }

  return {
    bodies,
    beats,
    maxPv: report.maxPv,
    defeated: report.defeated,
    total: report.total,
    held: report.held,
    breachPan: pan,
    breachAngle: angle,
    defenders,
  };
}

/**
 * Les défenseurs du rejeu, tels que le rapport les a enregistrés.
 *
 * ⚠️ Pour un rapport d’avant (sans `defenders`), on les RETROUVE dans le log plutôt que
 * de montrer le vivier d’aujourd’hui : un id qui n’est ni une baliste ni un assaillant est
 * un défenseur, et qui frappe un corps resté DEHORS tirait depuis le rempart.
 */
function defendersOf(
  report: RaidReport,
  bodyOf: (id: string | undefined) => number,
): SiegeDefender[] {
  const posts = (d: SiegeDefenderInfo): SiegeDefender => ({
    ...d,
    post: d.kind === 'ranged' ? 'rampart' : 'yard',
  });
  if (report.defenders) return report.defenders.map(posts);
  const seen = new Map<string, SiegeDefenderInfo>();
  const inside = new Set<number>();
  for (const e of report.log) {
    if (e.kind === 'enter') {
      const b = bodyOf(e.from);
      if (b >= 0) inside.add(b);
    }
    if (e.kind !== 'hit') continue;
    for (const id of [e.from, e.to]) {
      if (!id || ATT.test(id) || TUR.test(id) || seen.has(id)) continue;
      seen.set(id, {
        id,
        name: id === 'hero' ? 'Héros' : 'Aventurier',
        emoji: id === 'hero' ? '🦸' : '⚔️',
        kind: 'melee',
      });
    }
    const d = e.from ? seen.get(e.from) : undefined;
    const b = bodyOf(e.to);
    if (d && b >= 0 && !inside.has(b)) d.kind = 'ranged';
  }
  return [...seen.values()].map(posts);
}
