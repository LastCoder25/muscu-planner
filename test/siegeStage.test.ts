import { describe, it, expect } from 'vitest';
import {
  aimDeg,
  approachAt,
  arrivalRadius,
  assaultRadius,
  battlefieldDecor,
  beatMs,
  beatTiming,
  BREACH_HALF_ANGLE,
  breachCamera,
  breachGap,
  buildSiegeStage,
  defenderSpot,
  insideYard,
  panAngle,
  placeBodies,
  cutsFor,
  nearestTurret,
  reportSeed,
  sectorAngle,
  bodyAngleAt,
  SHOT,
  SIEGE_STAGE,
  turnToward,
  yardAttackerSpot,
} from '@/lib/siegeStage';
import { BATTLE } from '@/lib/siegeBattle';
import {
  rollRaid,
  baseCombatant,
  raidFirstSector,
  resolveRaid,
  turretCount,
  TURRET_SLOTS,
  type DefenseStructure,
  type GuardUnit,
} from '@/lib/raid';
import { refFighter, gearExpect } from '@/lib/proceduralContent';
import type { Combatant } from '@/lib/combat';

function hero(L: number): Combatant {
  const f = refFighter(L);
  const ge = gearExpect(L);
  return { ...f, damage: Math.round(f.damage * ge.off), pv: Math.round(f.pv * ge.pv) };
}
const defs = (w: number, t: number): DefenseStructure[] => [
  { typeId: 'wall', level: w },
  { typeId: 'turret', level: t },
];
/** Un siège complet, prêt à mettre en scène. */
function siege(seed: number, playerLevel = 26, w = 26, t = 26, home = true) {
  const raid = rollRaid(seed, playerLevel, 0, 0);
  const report = resolveRaid(
    { defenses: defs(w, t), playerLevel, hero: home ? hero(playerLevel) : null },
    raid,
    0,
    home,
  );
  return { raid, report, stage: buildSiegeStage(report, turretCount(t)) };
}

describe('placement des assaillants', () => {
  it('un corps par assaillant, rattaché à son groupe', () => {
    const { raid, stage } = siege(101);
    const total = raid.groups.reduce((s, g) => s + g.count, 0);
    expect(stage.bodies).toHaveLength(total);
    raid.groups.forEach((g, gi) => {
      expect(stage.bodies.filter((b) => b.group === gi)).toHaveLength(g.count);
    });
    expect(new Set(stage.bodies.map((b) => b.id)).size).toBe(total);
  });

  it('ils arrivent d’un CÔTÉ, hors des murs — une armée marche, elle ne pleut pas', () => {
    const { stage } = siege(202);
    for (const b of stage.bodies) {
      expect(b.dist).toBeGreaterThanOrEqual(SIEGE_STAGE.spawnMin);
      expect(b.dist).toBeLessThanOrEqual(SIEGE_STAGE.spawnMax);
    }
    // Tous les corps tiennent dans un arc, pas sur le tour complet.
    const angles = stage.bodies.map((b) => b.angle);
    const etendue = Math.max(...angles) - Math.min(...angles);
    expect(etendue).toBeLessThan(SIEGE_STAGE.arc + 0.3);
  });

  it('est déterministe : même rapport → même mise en scène', () => {
    const a = siege(303);
    const b = buildSiegeStage(a.report, turretCount(26));
    expect(b.bodies).toEqual(a.stage.bodies);
    expect(b.beats).toEqual(a.stage.beats);
  });
});

describe('bornes cumulées', () => {
  it('les parts somment EXACTEMENT aux PV du groupe', () => {
    for (const [pv, n] of [
      [1000, 1],
      [1000, 7],
      [12345, 6],
      [7, 5],
    ] as [number, number][]) {
      const cuts = cutsFor(pv, n);
      expect(cuts).toHaveLength(n);
      expect(cuts[n - 1]).toBe(pv); // le dernier corps tombe pile à la fin du groupe
      for (let i = 1; i < n; i++) expect(cuts[i]!).toBeGreaterThanOrEqual(cuts[i - 1]!);
    }
  });

  it('un corps ne tombe qu’UNE fois, et ne se relève jamais', () => {
    for (const s of [11, 22, 33, 44, 55]) {
      const { stage } = siege(s);
      const vus = new Set<number>();
      for (const beat of stage.beats) {
        for (const k of beat.kills) {
          expect(vus.has(k), `corps ${k} tué deux fois`).toBe(false);
          vus.add(k);
        }
      }
    }
  });

  it('les dégâts cumulés sont MONOTONES par groupe', () => {
    const { stage } = siege(66);
    const dernier = new Map<number, number>();
    for (const b of stage.beats) {
      const prev = dernier.get(b.group) ?? 0;
      expect(b.dealt).toBeGreaterThanOrEqual(prev);
      dernier.set(b.group, b.dealt);
    }
  });

  it('le NOMBRE de groupes anéantis à l’écran est celui du rapport', () => {
    // C'est l'invariant qui relie l'image au rapport : ce que l'écran montre anéanti,
    // le rapport doit le compter comme repoussé.
    // ⚠️ Test RÉÉCRIT, pas supprimé : il supposait que les groupes tombent DANS
    // L'ORDRE (`gi < report.defeated`), ce qui était vrai du combat séquentiel de
    // `simulateDungeon` — une base y affrontait un groupe après l'autre. Le moteur en
    // deux phases les affronte TOUS À LA FOIS : le groupe anéanti peut être le
    // troisième. On compare donc les COMPTES, pas les rangs.
    for (const s of [7, 19, 23, 31, 47]) {
      const { raid, report, stage } = siege(s, 26, 26, 26, false);
      const morts = new Set(stage.beats.flatMap((b) => b.kills));
      let offset = 0;
      let aneantis = 0;
      raid.groups.forEach((g) => {
        const tous = Array.from({ length: g.count }, (_, i) => offset + i);
        if (tous.every((idx) => morts.has(idx))) aneantis++;
        offset += g.count;
      });
      expect(aneantis).toBe(report.defeated);
    }
  });
});

describe('cohérence avec le rapport', () => {
  it('⚠️ NON-RÉGRESSION : la mise en scène ne décide RIEN du combat', () => {
    // La règle fondatrice. Le rapport est recopié, jamais recalculé : si un jour ce test
    // échoue, c'est que la scène s'est mise à influencer l'issue — donc les récompenses.
    for (const s of [5, 15, 25, 35]) {
      const { report, stage } = siege(s);
      expect(stage.held).toBe(report.held);
      expect(stage.defeated).toBe(report.defeated);
      expect(stage.total).toBe(report.total);
      expect(stage.maxPv).toBe(report.maxPv);
    }
  });

  it('la barre du rempart suit les PV du log, et finit sur ceux du rapport', () => {
    const { report, stage } = siege(77, 26, 20, 20, false);
    for (const b of stage.beats) {
      expect(b.basePv).toBeGreaterThanOrEqual(0);
      expect(b.basePv).toBeLessThanOrEqual(report.maxPv);
    }
    const fin = stage.beats[stage.beats.length - 1];
    if (fin) expect(fin.basePv).toBe(report.finalPv);
  });

  it('chaque temps désigne des acteurs EXISTANTS : une baliste bâtie, des corps de l’armée', () => {
    // ⚠️ RÉÉCRIT, pas supprimé : il exigeait `body >= 0` sur CHAQUE temps — vrai tant qu’un
    // temps était un coup. Une brèche qui s’ouvre ou des défenseurs qui descendent ne
    // désignent aucun corps : la propriété protégée est « rien ne pointe dans le vide ».
    const { stage } = siege(88);
    const n = turretCount(26);
    const okBody = (k: number) => k >= 0 && k < stage.bodies.length;
    for (const b of stage.beats) {
      for (const k of [...b.targets, ...b.attackers, ...b.kills]) expect(okBody(k)).toBe(true);
      if (b.body !== -1) expect(okBody(b.body)).toBe(true);
      if (b.kind === 'turret') {
        expect(b.turret).toBeGreaterThanOrEqual(0);
        expect(b.turret).toBeLessThan(n);
      }
    }
    expect(stage.beats.some((b) => b.kind === 'turret')).toBe(true);
    expect(stage.beats.some((b) => b.kind === 'wall')).toBe(true);
  });

  it('la tourelle qui tire est la plus proche de sa cible', () => {
    expect(nearestTurret(-Math.PI / 2, TURRET_SLOTS)).toBe(0); // plein nord → 1re tour
    for (let k = 0; k < TURRET_SLOTS; k++) {
      const step = (Math.PI * 2) / TURRET_SLOTS;
      const angleTour = -Math.PI / 2 + step / 2 + k * step;
      expect(nearestTurret(angleTour, TURRET_SLOTS)).toBe(k);
    }
  });

  it('une base SANS tourelle ne fait pas planter la scène', () => {
    const { report } = siege(99, 26, 26, 0, true);
    const stage = buildSiegeStage(report, turretCount(0));
    for (const b of stage.beats) expect(Number.isFinite(b.turret)).toBe(true);
  });

  it('un siège sans le héros produit quand même une scène jouable', () => {
    const { stage } = siege(123, 26, 12, 12, false);
    expect(stage.beats.length).toBeGreaterThan(0);
    expect(stage.bodies.length).toBeGreaterThan(0);
  });
});

describe('placement seul', () => {
  it('ne plante pas sur une armée vide', () => {
    expect(placeBodies([], 1)).toEqual([]);
  });
});

describe('🚶 LA TRAVERSÉE : l’assaut marche sous le feu', () => {
  // ⚠️ Les corps SAUTAIENT au pied du mur dès que leur groupe était engagé : la
  // traversée n’existait pas à l’écran, alors qu’elle est tout l’intérêt du moteur —
  // c’est pendant l’approche que les balistes gagnent leur valeur, puis que les archers
  // entrent en jeu quand l’assaut passe à leur portée.

  it('l’avancée va de 1 (au bord) à 0 (au pied du mur), sans jamais repartir', () => {
    expect(approachAt(0)).toBe(1);
    expect(approachAt(BATTLE.fieldDepth)).toBe(0);
    // ⚠️ Elle ne redevient pas positive après : un siège dure bien plus longtemps que la
    // traversée, et l’armée ne doit pas se remettre à reculer au tour suivant.
    expect(approachAt(BATTLE.fieldDepth * 3)).toBe(0);
    let prev = Infinity;
    for (let r = 0; r <= BATTLE.fieldDepth; r++) {
      const v = approachAt(r);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it('⚠️ UN CORPS MARCHE DE SON POINT D’ARRIVÉE JUSQU’AU MUR, et s’y arrête', () => {
    const spawn = SIEGE_STAGE.spawnMax;
    const stop = arrivalRadius(spawn);
    expect(assaultRadius(spawn, 0)).toBe(spawn);
    expect(assaultRadius(spawn, BATTLE.fieldDepth)).toBe(stop);
    // ⚠️ Il ne TRAVERSE pas la pierre : au-delà de la traversée il reste où il est arrivé.
    expect(assaultRadius(spawn, BATTLE.fieldDepth * 4)).toBe(stop);
    // …et il s’en approche vraiment, à mi-parcours il a fait la moitié du chemin.
    const mi = assaultRadius(spawn, BATTLE.fieldDepth / 2);
    expect(mi).toBeCloseTo((spawn + stop) / 2, 6);
  });

  it('⚠️ L’ARMÉE GARDE SON ÉPAISSEUR AU CONTACT — sinon les rangs se recouvrent', () => {
    // Le premier rang touche le pied du mur…
    expect(arrivalRadius(SIEGE_STAGE.spawnMin)).toBe(SIEGE_STAGE.wallStop);
    // …et ceux de derrière restent DERRIÈRE. Sans ça les trois rangs convergent tous
    // vers le même cercle d’un corps d’épaisseur, et la profondeur pour laquelle ils
    // existent disparaît exactement au moment où l’on veut la voir.
    const derriere = arrivalRadius(SIEGE_STAGE.spawnMax);
    expect(derriere).toBeGreaterThan(SIEGE_STAGE.wallStop + 8);
    // ⚠️ …mais ils sont bien ARRIVÉS : la formation SE COMPRIME en se refermant. C’est la
    // propriété physique, et c’est elle qu’il faut épingler — une borne « pas trop loin »
    // laissait passer une armée qui garde tout son étalement, donc qui n’arrive jamais.
    const epaisseurArrivee = derriere - arrivalRadius(SIEGE_STAGE.spawnMin);
    const epaisseurDepart = SIEGE_STAGE.spawnMax - SIEGE_STAGE.spawnMin;
    expect(epaisseurArrivee).toBeLessThan(epaisseurDepart / 2);
  });

  it('⚠️ LE POINT D’ARRIVÉE EST HORS DU MUR — sinon on naîtrait déjà dessus', () => {
    // La mise en scène n’aurait plus rien à montrer, et le premier tir des balistes
    // tomberait sur une armée déjà au contact.
    expect(SIEGE_STAGE.spawnMin).toBeGreaterThan(SIEGE_STAGE.wallStop);
  });

  it('⚠️ CHAQUE TEMPS PORTE SON TOUR — aucun tour inventé, aucun tour perdu', () => {
    // C’est ce tour qui place les corps. ⚠️ RÉÉCRIT, pas supprimé : il comparait la suite
    // des tours ligne à ligne avec le log, vrai tant qu’un événement faisait un temps. Les
    // coups d’un même tour sont désormais REGROUPÉS (mesuré : ~160 coups sur le mur en ~19
    // tours) — la propriété à protéger est que les tours de la scène sont EXACTEMENT ceux
    // du log, dans l’ordre.
    for (const seed of [4242, 77, 1313]) {
      const { stage, report } = siege(seed, 26, 16, 16, true);
      const tours = stage.beats.map((b) => b.round);
      for (let i = 1; i < tours.length; i++)
        expect(tours[i]!).toBeGreaterThanOrEqual(tours[i - 1]!);
      const attendus = new Set(report.log.filter((e) => e.kind !== 'down').map((e) => e.round));
      expect(new Set(tours)).toEqual(attendus);
    }
  });

  it('⚠️ PERSONNE N’EST AU MUR AVANT D’AVOIR TRAVERSÉ', () => {
    // La garantie qui relie l’image au moteur : le premier coup porté AU MUR ne peut pas
    // arriver avant que le terrain ne soit franchi.
    for (let s = 1; s < 12; s++) {
      const { report } = siege(s * 977);
      const premier = report.log.find((e) => e.kind === 'wall');
      if (premier) expect(premier.round).toBeGreaterThanOrEqual(BATTLE.fieldDepth);
    }
  });
});

describe('🎥 LA CAMÉRA RECULE : il faut du terrain pour le traverser', () => {
  // ⚠️ La traversée existait déjà, mais la caméra cadrait au plus juste sur l’enceinte :
  // l’anneau d’arrivée était à 4-16 unités du pied du mur, soit 2 à 8 % du plateau. Les
  // assaillants « traversaient » sans bouger à l’œil — un joueur l’a dit exactement :
  // « qu’ils n’arrivent pas tout de suite ».

  /** Le terrain découvert : du rempart au bord du cadre. C’est LUI qu’on traverse. */
  const WALL_R = 72;
  const decouvert = SIEGE_STAGE.field - WALL_R;

  it('⚠️ LA TRAVERSÉE COUVRE L’ESSENTIEL DU TERRAIN DÉCOUVERT', () => {
    const court = SIEGE_STAGE.spawnMin - SIEGE_STAGE.wallStop;
    const long = SIEGE_STAGE.spawnMax - SIEGE_STAGE.wallStop;
    // Même le premier rang marche une bonne part du chemin…
    expect(court / decouvert).toBeGreaterThan(0.4);
    // …et le dernier vient vraiment du fond.
    expect(long / decouvert).toBeGreaterThan(0.7);
  });

  it('⚠️ PERSONNE NE NAÎT HORS CADRE — sinon on entre en scène déjà à mi-chemin', () => {
    // Marge pour le corps lui-même (rayon 8 + son emoji).
    expect(SIEGE_STAGE.spawnMax).toBeLessThan(SIEGE_STAGE.field - 8);
  });

  it('la chaîne des rayons est ordonnée : mur < arrivée < cadre', () => {
    expect(SIEGE_STAGE.wallStop).toBeGreaterThan(WALL_R);
    expect(SIEGE_STAGE.spawnMin).toBeGreaterThan(SIEGE_STAGE.wallStop);
    expect(SIEGE_STAGE.spawnMax).toBeGreaterThan(SIEGE_STAGE.spawnMin);
    expect(SIEGE_STAGE.field).toBeGreaterThan(SIEGE_STAGE.spawnMax);
  });

  it('⚠️ L’ENCEINTE RESTE AU MILIEU, et bien plus petite que le cadre', () => {
    // On recule la CAMÉRA, on ne rétrécit pas la base : c’est ce qui fait qu’on la
    // reconnaît. Entre la vue « Ma base » (72 % de la largeur) et la carte (~14 %).
    const part = (WALL_R * 2) / (SIEGE_STAGE.field * 2);
    expect(part).toBeLessThan(0.55);
    expect(part).toBeGreaterThan(0.25);
  });
});

describe('🚶 LE RYTHME : on marche plus lentement qu’on se bat', () => {
  it('⚠️ UN TEMPS D’APPROCHE A UN PLANCHER, un temps de mêlée non', () => {
    // Un long siège serre la cadence à 62 ms : à ce rythme les ~60 temps de traversée
    // passaient en 3,6 s. Sans plancher, la marche redevient un sursaut.
    const long = 400;
    expect(beatMs(0, long)).toBe(SIEGE_STAGE.approachMs);
    expect(beatMs(BATTLE.fieldDepth, long)).toBeLessThan(SIEGE_STAGE.approachMs);
    expect(beatMs(0, long)).toBeGreaterThan(beatMs(BATTLE.fieldDepth, long));
  });

  it('⚠️ C’EST UN PLANCHER, PAS UN RALENTISSEMENT : un rejeu déjà lent ne s’étire pas', () => {
    const court = 10; // 180 ms de cadence de fond
    expect(beatMs(0, court)).toBe(beatMs(BATTLE.fieldDepth, court));
  });

  it('la cadence de fond se resserre quand l’assaut s’allonge', () => {
    const hors = BATTLE.fieldDepth;
    expect(beatMs(hors, 10)).toBeGreaterThan(beatMs(hors, 60));
    expect(beatMs(hors, 60)).toBeGreaterThan(beatMs(hors, 150));
    expect(beatMs(hors, 150)).toBeGreaterThan(beatMs(hors, 400));
  });
});

describe('🌿 LE SOL DU CHAMP DE BATAILLE', () => {
  const KEEP = 87; // la couronne de terre battue (rayon du mur + 15)

  it('⚠️ RIEN SOUS L’ENCEINTE NI SUR LA TERRE BATTUE', () => {
    const d = battlefieldDecor(KEEP);
    for (const p of d.patches) expect(Math.hypot(p.cx - 100, p.cy - 100)).toBeGreaterThan(KEEP);
    // Les touffes et les arbres portent leur origine en tête de path : « M x y … ».
    for (const t of [...d.tufts, ...d.trees]) {
      const [x, y] = t.slice(1).trim().split(' ').map(Number);
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      // Un conifère est tracé depuis sa CIME : on tolère sa hauteur.
      expect(Math.hypot(x! - 100, y! - 100)).toBeGreaterThan(KEEP - 12);
    }
  });

  it('il couvre le cadre, et rien ne déborde', () => {
    const d = battlefieldDecor(KEEP);
    expect(d.tufts.length).toBeGreaterThan(40);
    expect(d.trees.length).toBeGreaterThan(5);
    expect(d.patches.length).toBeGreaterThan(5);
    for (const p of d.patches) {
      expect(Math.abs(p.cx - 100)).toBeLessThanOrEqual(SIEGE_STAGE.field);
      expect(Math.abs(p.cy - 100)).toBeLessThanOrEqual(SIEGE_STAGE.field);
    }
  });

  it('⚠️ CE SONT LES ABORDS DE TA BASE, pas un champ tiré au sort', () => {
    const avant = battlefieldDecor(KEEP);
    // ⚠️ ON FRANCHIT UNE MILLISECONDE. Deux appels collés passaient au vert même avec une
    // graine tirée de l’HORLOGE — or « et si chaque siège avait son décor ? » est
    // exactement la retouche plausible, et elle est fausse : ce sont les abords de TA
    // base. Deux sièges de suite se déroulent au même endroit.
    const t0 = Date.now();
    let tours = 0;
    while (Date.now() === t0) tours++;
    expect(tours).toBeGreaterThan(0);
    expect(battlefieldDecor(KEEP)).toEqual(avant);
  });
});

/** Un vivier réaliste : des tireurs au rempart, des hommes d’armes dans la cour. */
function garde(L: number, n = 6): GuardUnit[] {
  const f = refFighter(L);
  return Array.from({ length: n }, (_, i) => ({
    id: `adv_${i}`,
    name: `Aventurier ${i}`,
    emoji: i % 2 ? '🏹' : '⚔️',
    pv: f.pv * 0.4,
    damage: f.damage * 0.25,
    ranged: i % 2 === 1,
  }));
}
/** Un siège qui PERCE : enceinte à moitié montée, garnison présente. */
function breche(seed: number, L = 28) {
  const lvl = Math.round(L * 0.6);
  const raid = rollRaid(seed, L, 0, 0);
  const report = resolveRaid(
    { defenses: defs(lvl, lvl), playerLevel: L, hero: hero(L), guard: garde(L) },
    raid,
    0,
    true,
  );
  return { raid, report, lvl, stage: buildSiegeStage(report, turretCount(lvl)) };
}
const STEP = (Math.PI * 2) / TURRET_SLOTS;
const ecartAngle = (a: number, b: number) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
};
const ATT = /^a\d+$/;

describe('🧱 LA BRÈCHE ET LA COUR SE VOIENT', () => {
  // ⚠️ Signalé par l’utilisateur : « mon mur est descendu bas mais je n’ai pas vu de brèche
  // ni de combat dans la cour ». Le moteur journalisait bien `breach`, `enter` et les coups
  // échangés à l’intérieur — le rejeu les JETAIT (`continue`), et affichait les coups de la
  // cour comme des tirs de tourelle.

  it('⚠️ RIEN N’EST JETÉ : chaque entrée, chaque brèche, chaque mort du log a son temps', () => {
    for (const seed of [3, 17, 29, 41]) {
      const { report, stage } = breche(seed);
      const log = report.log;
      const entres = stage.beats.filter((b) => b.kind === 'enter').flatMap((b) => b.attackers);
      expect(entres).toHaveLength(log.filter((e) => e.kind === 'enter').length);
      expect(stage.beats.filter((b) => b.kind === 'breach')).toHaveLength(
        log.filter((e) => e.kind === 'breach').length,
      );
      const morts = log.filter((e) => e.kind === 'down' && ATT.test(e.to ?? '')).length;
      expect(stage.beats.flatMap((b) => b.kills)).toHaveLength(morts);
      const blesses = log.filter((e) => e.kind === 'down' && !ATT.test(e.to ?? '')).length;
      expect(stage.beats.flatMap((b) => b.wounded)).toHaveLength(blesses);
    }
  });

  it('la brèche s’ouvre UNE fois, et seulement si le rapport dit qu’elle s’est ouverte', () => {
    let vues = 0;
    for (const seed of [3, 17, 29, 41, 53, 67]) {
      const { report, stage } = breche(seed);
      expect(stage.beats.filter((b) => b.opens)).toHaveLength(report.breached ? 1 : 0);
      if (report.breached) vues++;
    }
    expect(vues, 'le harnais doit produire des brèches, sinon il ne prouve rien').toBeGreaterThan(
      2,
    );
  });

  it('⚠️ ON SE BAT DANS LA COUR, et un intrus n’y frappe qu’une fois ENTRÉ', () => {
    let cour = 0;
    for (const seed of [3, 17, 29, 41]) {
      const { stage } = breche(seed);
      const entres = new Set<number>();
      for (const b of stage.beats) {
        if (b.kind === 'enter') b.attackers.forEach((a) => entres.add(a));
        if (b.kind !== 'yard') continue;
        cour++;
        for (const a of b.attackers)
          expect(entres.has(a), `corps ${a} frappe sans être entré`).toBe(true);
        for (const t of b.targets)
          expect(entres.has(t), `corps ${t} frappé sans être entré`).toBe(true);
      }
    }
    expect(cour).toBeGreaterThan(0);
  });

  it('la brèche ne se referme jamais, et ouvre un pan de plus en plus grand', () => {
    const { stage } = breche(17);
    for (let i = 1; i < stage.beats.length; i++) {
      expect(stage.beats[i]!.width).toBeGreaterThanOrEqual(stage.beats[i - 1]!.width);
    }
    expect(breachGap(0)).toBe(0);
    let prev = 0;
    for (let w = 1; w <= BATTLE.breachMaxWidth; w++) {
      const g = breachGap(w);
      expect(g).toBeGreaterThan(prev);
      expect(g).toBeLessThan(1); // il reste des chicots de mur
      prev = g;
    }
  });

  it('⚠️ LES POSTES DE LA COUR SONT DANS LA COUR — intrus comme défenseurs', () => {
    for (let pan = 0; pan < TURRET_SLOTS; pan++) {
      const a = panAngle(pan);
      for (let k = 0; k < 16; k++) {
        expect(insideYard(yardAttackerSpot(a, k)), `intrus ${k}, pan ${pan}`).toBe(true);
      }
      for (const n of [1, 4, 9]) {
        for (let j = 0; j < n; j++) {
          expect(insideYard(defenderSpot(a, j, n, 'yard')), `défenseur ${j}/${n}`).toBe(true);
          // Un tireur du rempart se tient SUR le mur, pas dans la cour.
          expect(insideYard(defenderSpot(a, j, n, 'rampart'))).toBe(false);
        }
      }
    }
  });

  it('⚠️ LES TIREURS DU REMPART FLANQUENT LA BRÈCHE, ils ne la cachent pas', () => {
    // Vu sur le banc : posés en éventail centré sur la trouée, ils la RECOUVRAIENT et le mur
    // avait l’air intact alors qu’il était ouvert.
    for (let pan = 0; pan < TURRET_SLOTS; pan++) {
      const a = panAngle(pan);
      for (const n of [1, 2, 5, 9]) {
        for (let j = 0; j < n; j++) {
          const p = defenderSpot(a, j, n, 'rampart');
          const ang = Math.atan2(p.y - 100, p.x - 100);
          expect(ecartAngle(ang, a), `tireur ${j}/${n}`).toBeGreaterThan(BREACH_HALF_ANGLE);
        }
      }
    }
  });

  it('⚠️ LA CAMÉRA DE BRÈCHE CADRE LA BRÈCHE ET LA COUR', () => {
    for (let pan = 0; pan < TURRET_SLOTS; pan++) {
      const a = panAngle(pan);
      const c = breachCamera(a);
      const cadre = (p: { x: number; y: number }) =>
        Math.abs(p.x - c.cx) <= c.field && Math.abs(p.y - c.cy) <= c.field;
      expect(cadre({ x: 100 + Math.cos(a) * 72, y: 100 + Math.sin(a) * 72 })).toBe(true);
      for (let k = 0; k < 8; k++) expect(cadre(yardAttackerSpot(a, k))).toBe(true);
      // Elle PLONGE : plus serrée que la vue d’approche.
      expect(c.field).toBeLessThan(SIEGE_STAGE.field);
    }
  });
});

describe('🏹 LES BALISTES VISENT CE QU’ELLES FRAPPENT', () => {
  it('⚠️ UN CORPS EST DESSINÉ SUR LE PAN QUE LE MOTEUR LUI A DONNÉ', () => {
    // Il était posé sur un arc à orientation tirée au sort : une baliste qui PIVOTE vers
    // sa cible se serait tournée vers la ville.
    for (const seed of [5, 111, 2024]) {
      const { raid, stage } = breche(seed);
      const first = raidFirstSector(raid.seed);
      for (const b of stage.bodies) {
        expect(ecartAngle(b.angle, sectorAngle(first + b.group))).toBeLessThanOrEqual(STEP / 2);
      }
    }
  });

  it('⚠️ LA BALISTE QUI TIRE A SA CIBLE DANS SON ARC — elle ne tire pas à travers la ville', () => {
    let tirs = 0;
    for (const seed of [5, 111, 2024, 9]) {
      const { stage } = breche(seed);
      for (const b of stage.beats) {
        if (b.kind !== 'turret') continue;
        tirs++;
        const cible = stage.bodies[b.targets[0]!]!;
        // ⚠️ Au TOUR du tir : un tireur sans cible longe l’enceinte (v0.800), son pan
        // d’arrivée ne dit plus où il se tient.
        const ecart = ecartAngle(sectorAngle(b.turret), bodyAngleAt(cible, b.round));
        expect(ecart).toBeLessThanOrEqual((BATTLE.turretArc + 0.5) * STEP + 1e-9);
      }
    }
    expect(tirs).toBeGreaterThan(50);
  });

  it('elle tourne par le PLUS COURT chemin, et finit sur le bon cap', () => {
    for (const [p, t] of [
      [170, -170],
      [-170, 170],
      [10, 350],
      [720, 5],
      [0, 180],
      [45, 45],
    ] as [number, number][]) {
      const r = turnToward(p, t);
      expect(Math.abs(r - p)).toBeLessThanOrEqual(180);
      expect(((((r - t) % 360) + 360) % 360) % 360).toBeCloseTo(0, 9);
    }
    // Le dessin pointe « vers le haut » : cap 0 vers le nord, 90 vers l’est.
    expect(aimDeg(0, 10, 0, 0)).toBeCloseTo(0, 9);
    expect(aimDeg(0, 0, 10, 0)).toBeCloseTo(90, 9);
  });

  it('⚠️ LE TRAIT PART AVANT QUE LA BALISTE NE VISE AILLEURS', () => {
    // La garantie demandée par l’utilisateur. Les temps se jouent l’un après l’autre et une
    // baliste ne vise qu’en DÉBUT de temps : il suffit que le lâcher ait lieu avant la fin
    // du temps. Vérifié sur de vrais sièges, à toutes les cadences.
    for (const L of [12, 28, 60, 90]) {
      for (const seed of [3, 17, 29]) {
        const { stage } = breche(seed, L);
        const n = stage.beats.length;
        for (const b of stage.beats) {
          const t = beatTiming(b, n);
          expect(t.impact).toBeLessThanOrEqual(t.total);
          if (b.kind === 'turret') {
            expect(t.launch, 'la baliste pivote AVANT de tirer').toBeGreaterThan(0);
            expect(t.launch).toBeLessThan(t.impact);
            expect(t.launch).toBeLessThan(t.total);
          } else {
            expect(t.launch).toBe(0);
          }
        }
      }
    }
  });

  it('la pause dramatique n’arrive qu’à l’OUVERTURE de la brèche, pas à chaque élargissement', () => {
    // ⚠️ Le siège témoin est CHERCHÉ, plus figé sur une graine : un réglage du moteur
    // change quel siège s’élargit, et une graine fixe cessait de tester quoi que ce soit.
    const stage = [17, 3, 5, 9, 29, 111, 2024, 41, 77, 88]
      .map((seed) => breche(seed).stage)
      .find((st) => st.beats.filter((b) => b.kind === 'breach').length > 1);
    expect(stage, 'un siège dont la brèche s’élargit').toBeDefined();
    const n = stage!.beats.length;
    const breches = stage!.beats.filter((b) => b.kind === 'breach');
    for (const b of breches) {
      const t = beatTiming(b, n).total;
      if (b.opens) expect(t).toBeGreaterThanOrEqual(SHOT.breachMs);
      else expect(t).toBeLessThan(SHOT.breachMs);
    }
  });

  it('⚠️ LE REJEU N’EST PAS PLUS LONG QU’AVANT d’y montrer le pivot, les traits et la cour', () => {
    // Avant ce changement : 44 à 68 s. À gestes fixes, montrer le pivot et la cour le
    // portait à 73-90 s de moyenne et 157 s au pire. Le regroupement par tour (mur, volées,
    // échauffourées) et le tempo qui se resserre le ramènent à 55-61 s avec une garnison
    // complète (mesuré) — on borne à « pas plus long qu’avant », pas à un chiffre flatteur.
    for (const L of [12, 28, 60, 90]) {
      let somme = 0;
      let pire = 0;
      const N = 12;
      for (let seed = 1; seed <= N; seed++) {
        const { stage } = breche(seed * 131, L);
        const ms = stage.beats.reduce((acc, b) => acc + beatTiming(b, stage.beats.length).total, 0);
        somme += ms;
        pire = Math.max(pire, ms);
      }
      expect(somme / N / 1000, `niveau ${L}, moyenne`).toBeLessThan(70);
      expect(pire / 1000, `niveau ${L}, pire cas`).toBeLessThan(120);
    }
  });
});

describe('🗃️ LES RAPPORTS D’AVANT SE REJOUENT AUSSI', () => {
  it('la graine se relit dans raidId quand le rapport ne la porte pas', () => {
    const { raid, report } = breche(4242);
    expect(reportSeed(report)).toBe(raid.seed);
    expect(reportSeed({ ...report, seed: undefined })).toBe(raid.seed);
  });

  it('⚠️ le rapport garde QUI DÉFENDAIT — plus le vivier d’aujourd’hui', () => {
    const { report, stage, lvl } = breche(29);
    const ids = new Set(
      report.log
        .flatMap((e) => [e.from, e.to])
        .filter((x): x is string => !!x && !/^[at]\d+$/.test(x)),
    );
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids)
      expect(
        stage.defenders.some((d) => d.id === id),
        id,
      ).toBe(true);
    // Sans la liste (rapport d’avant), on les RETROUVE dans le log.
    const ancien = buildSiegeStage({ ...report, defenders: undefined }, turretCount(lvl));
    for (const id of ids)
      expect(
        ancien.defenders.some((d) => d.id === id),
        id,
      ).toBe(true);
  });

  it('la barre du rempart ne remonte jamais', () => {
    const { stage } = breche(41);
    for (let i = 1; i < stage.beats.length; i++) {
      expect(stage.beats[i]!.basePv).toBeLessThanOrEqual(stage.beats[i - 1]!.basePv);
    }
  });
});
