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
export interface SiegeBeat {
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
  /** PV de la base après ce temps → barre de vie du rempart. */
  basePv: number;
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
  arc: Math.PI * 1.15,
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
  let placed = 0;
  groups.forEach((g, gi) => {
    for (let m = 0; m < g.count; m++) {
      const t = (placed + 0.5) / total;
      out.push({
        id: `b${gi}_${m}`,
        group: gi,
        member: m,
        emoji: g.emoji,
        name: g.species,
        level: g.level,
        champion: !!g.champion,
        angle: start + (t - 0.5) * SIEGE_STAGE.arc + (rng() - 0.5) * 0.12,
        dist: SIEGE_STAGE.spawnMin + rng() * (SIEGE_STAGE.spawnMax - SIEGE_STAGE.spawnMin),
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

/** Construit la mise en scène complète d'un rapport de siège. */
export function buildSiegeStage(report: RaidReport, turretCount: number): SiegeStage {
  const bodies = placeBodies(report.groups, report.groups.length * 7919 + report.total);
  const beats: SiegeBeat[] = [];
  // Index du premier corps de chaque groupe, pour convertir (groupe, membre) → corps.
  const offset: number[] = [];
  let acc = 0;
  for (const g of report.groups) {
    offset.push(acc);
    acc += g.count;
  }

  report.fights.forEach((fight, gi) => {
    const g = report.groups[gi];
    if (!g) return;
    // PV du groupe = ceux du monstre au premier événement du log (avant tout dégât),
    // reconstitués depuis le log lui-même : on ne re-simule rien.
    const first = fight.result.log[0];
    if (!first) return;
    const groupPv = first.who === 'player' ? first.monsterPv + first.damage : first.monsterPv;
    const cuts = cutsFor(Math.max(1, groupPv), g.count);
    let dealt = 0;
    let alive = 0; // 1er corps encore debout = la cible courante
    let rotate = 0; // les assaillants frappent le mur à tour de rôle

    for (const e of fight.result.log) {
      const prev = dealt;
      if (e.who === 'player') {
        // La base tire. `dealt` suit les PV du groupe, jamais l'inverse.
        dealt = Math.max(dealt, groupPv - e.monsterPv);
        while (alive < g.count && dealt >= cuts[alive]!) alive++;
        const kills: number[] = [];
        for (let i = 0; i < g.count; i++) {
          if (prev < cuts[i]! && dealt >= cuts[i]!) kills.push(offset[gi]! + i);
        }
        const target = Math.min(g.count - 1, alive);
        const body = bodies[offset[gi]! + target];
        beats.push({
          group: gi,
          kind: 'turret',
          body: offset[gi]! + target,
          turret: nearestTurret(body?.angle ?? 0, turretCount),
          crit: e.type === 'crit',
          dodge: e.type === 'dodge',
          damage: e.damage,
          basePv: e.playerPv,
          dealt,
          kills,
        });
      } else {
        // Un assaillant frappe le mur : on fait tourner parmi ceux encore debout.
        const standing = g.count - alive;
        const idx = standing > 0 ? alive + (rotate++ % standing) : Math.max(0, g.count - 1);
        beats.push({
          group: gi,
          kind: 'foe',
          body: offset[gi]! + idx,
          turret: 0,
          crit: e.type === 'crit',
          dodge: e.type === 'dodge',
          damage: e.damage,
          basePv: e.playerPv,
          dealt,
          kills: [],
        });
      }
    }
  });

  return {
    bodies,
    beats,
    maxPv: report.maxPv,
    defeated: report.defeated,
    total: report.total,
    held: report.held,
  };
}

/** Un corps est-il encore debout à ce stade de l'animation ? Dérivé des bornes, donc
 *  toujours d'accord avec les morts annoncées par les beats. */
export function bodyAliveAt(
  stage: SiegeStage,
  groups: RaidGroup[],
  bodyIndex: number,
  beatIndex: number,
): boolean {
  const b = stage.bodies[bodyIndex];
  if (!b) return false;
  for (let i = beatIndex; i >= 0; i--) {
    if (stage.beats[i]?.kills.includes(bodyIndex)) return false;
  }
  void groups;
  return true;
}
