import { describe, it, expect } from 'vitest';
import {
  approachAt,
  arrivalRadius,
  assaultRadius,
  battlefieldDecor,
  beatMs,
  buildSiegeStage,
  placeBodies,
  cutsFor,
  nearestTurret,
  SIEGE_STAGE,
} from '@/lib/siegeStage';
import { BATTLE } from '@/lib/siegeBattle';
import {
  rollRaid,
  baseCombatant,
  resolveRaid,
  turretCount,
  TURRET_SLOTS,
  type DefenseStructure,
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

  it('chaque tir part d’une tourelle EXISTANTE ; les assaillants, eux, frappent le mur', () => {
    const { stage } = siege(88);
    const n = turretCount(26);
    for (const b of stage.beats) {
      expect(b.body).toBeGreaterThanOrEqual(0);
      expect(b.body).toBeLessThan(stage.bodies.length);
      if (b.kind === 'turret') {
        expect(b.turret).toBeGreaterThanOrEqual(0);
        expect(b.turret).toBeLessThan(n);
      }
    }
    expect(stage.beats.some((b) => b.kind === 'turret')).toBe(true);
    expect(stage.beats.some((b) => b.kind === 'foe')).toBe(true);
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

  it('⚠️ CHAQUE TEMPS PORTE SON TOUR, recopié du log et jamais recalculé', () => {
    // C’est ce tour qui place les corps. S’il était inventé ici, le rejeu montrerait une
    // armée qui arrive avant ou après qu’elle ne frappe.
    const { stage, report } = siege(4242);
    const attendus = report.log
      .filter((e) => e.kind === 'hit' || e.kind === 'wall')
      .map((e) => e.round);
    expect(stage.beats.map((b) => b.round)).toEqual(attendus);
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
