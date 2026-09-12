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
  /** Anneau d'arrivée des assaillants (unités du dessin, centre = 100,100). Calé sur
   *  l'enceinte (rayon 72, apothème 66,5) : ils surgissent hors champ de tir et marchent
   *  vers le mur. Si le rayon de l'enceinte bouge, cet anneau le suit. */
  spawnMin: 84,
  spawnMax: 96,
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
} as const;

/** Générateur déterministe local (même famille que `mulberry32`, sans dépendance). */
function rand(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
