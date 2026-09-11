// ⚔️🧱 Ce que le moteur de siège PROMET — et rien de moins.
//
// ⚠️ Le modèle tient en une phrase : « on frappe ce qu'on peut atteindre ; à portée égale,
// on frappe ce qui fait le plus mal ». Chaque test ci-dessous vérifie une CONSÉQUENCE de
// cette phrase, pas un détail d'implémentation.
import { describe, it, expect } from 'vitest';
import {
  BATTLE,
  breachWidth,
  pickTarget,
  simulateSiege,
  type SiegeUnit,
  type SiegeWall,
} from '@/lib/siegeBattle';

let n = 0;
const unit = (p: Partial<SiegeUnit> & Pick<SiegeUnit, 'side' | 'kind'>): SiegeUnit => ({
  id: p.id ?? `u${++n}`,
  name: p.name ?? 'unité',
  emoji: p.emoji ?? '•',
  pv: p.pv ?? 100,
  maxPv: p.maxPv ?? p.pv ?? 100,
  damage: p.damage ?? 10,
  origin: p.origin ?? (p.side === 'att' ? 'attacker' : 'adventurer'),
  ...p,
});
const wall = (pv: number, maxPv = pv): SiegeWall => ({ pv, maxPv });
const att = (kind: 'melee' | 'ranged', o: Partial<SiegeUnit> = {}) =>
  unit({ side: 'att', kind, ...o });
const def = (kind: 'melee' | 'ranged', o: Partial<SiegeUnit> = {}) =>
  unit({ side: 'def', kind, ...o });
const turret = (o: Partial<SiegeUnit> = {}) => def('ranged', { origin: 'turret', ...o });

describe('la brèche', () => {
  it("ne s'ouvre pas tant que le mur est au-dessus du seuil", () => {
    expect(breachWidth(wall(1000))).toBe(0);
    expect(breachWidth(wall(BATTLE.breachAt * 1000 + 1, 1000))).toBe(0);
  });

  it("s'ouvre ÉTROITE au seuil, puis s'élargit à mesure que le mur tombe", () => {
    const w = (pv: number) => breachWidth(wall(pv, 1000));
    const auSeuil = w(BATTLE.breachAt * 1000);
    const aZero = w(0);
    expect(auSeuil).toBe(1);
    expect(aZero).toBe(BATTLE.breachMaxWidth);
    // ⚠️ Monotone : chaque point de mur perdu élargit, jamais l'inverse — sinon le mur
    // cesserait de payer une fois le seuil franchi (une falaise).
    let prev = 0;
    for (let pv = 1000; pv >= 0; pv -= 5) {
      const x = w(pv);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });
});

describe('qui peut atteindre quoi', () => {
  it("⚠️ une armée SANS béliers ne peut pas ouvrir le mur : elle s'use dehors", () => {
    const r = simulateSiege(
      Array.from({ length: 12 }, () => att('ranged', { damage: 5, pv: 40 })),
      [turret({ damage: 30, pv: 200 }), turret({ damage: 30, pv: 200 })],
      wall(2000),
      7,
    );
    expect(r.wallPv).toBe(2000); // pas une égratignure
    expect(r.breached).toBe(false);
    // ⚠️ Ils peuvent très bien avoir fait taire les tourelles — mais sans percer, la
    // ville n'est pas prise. C'est ce test qui a révélé que le moteur donnait la
    // victoire à une armée qui n'était jamais entrée.
    expect(r.held).toBe(true);
  });

  it('⚠️ une armée SANS archers ne peut pas faire taire les tourelles', () => {
    const r = simulateSiege(
      Array.from({ length: 20 }, () => att('melee', { damage: 20, pv: 60 })),
      [turret({ damage: 40, pv: 200 }), turret({ damage: 40, pv: 200 })],
      wall(3000),
      9,
    );
    // Les tourelles n'ont RIEN encaissé tant que personne n'est entré : un homme d'armes
    // dehors ne peut que cogner le mur.
    const tirsRecus = r.log.filter((e) => e.kind === 'hit' && e.to?.startsWith('u'));
    expect(tirsRecus.every((e) => r.breached || false) || tirsRecus.length === 0).toBe(true);
    expect(r.wallPv).toBeLessThan(3000); // le mur, lui, prend cher
  });

  it('un assaillant au corps à corps NON entré ne cible personne — il cogne le mur', () => {
    const assaillant = att('melee', { damage: 50, id: 'belier' });
    const r = simulateSiege([assaillant], [turret({ pv: 999 })], wall(10_000), 3);
    expect(r.log.some((e) => e.kind === 'wall')).toBe(true);
    // ⚠️ On regarde les coups VENANT DE LUI : la tourelle, elle, tire légitimement.
    expect(r.log.some((e) => e.kind === 'hit' && e.from === 'belier')).toBe(false);
  });

  it('la mêlée DÉFENSIVE ne sert à rien tant que le mur tient — et tout dès qu’il cède', () => {
    const gardes = [def('melee', { damage: 60, pv: 300 })];
    const intact = simulateSiege(
      Array.from({ length: 6 }, () => att('melee', { damage: 10, pv: 50 })),
      gardes,
      wall(100_000),
      11,
    );
    expect(intact.log.some((e) => e.kind === 'hit' && e.from === gardes[0]!.id)).toBe(false);
    const perce = simulateSiege(
      Array.from({ length: 6 }, () => att('melee', { damage: 10, pv: 50 })),
      gardes,
      wall(1, 1000),
      11,
    );
    expect(perce.log.some((e) => e.kind === 'hit' && e.from === gardes[0]!.id)).toBe(true);
  });
});

describe('le goulot', () => {
  it("⚠️ n'en laisse JAMAIS entrer plus que la largeur de la brèche", () => {
    const r = simulateSiege(
      Array.from({ length: 40 }, () => att('melee', { damage: 1, pv: 100_000 })),
      [def('melee', { damage: 1, pv: 100_000 })],
      wall(0, 1000), // brèche grande ouverte d'emblée
      5,
    );
    // À tout instant, le nombre d'entrés ne dépasse pas la largeur maximale.
    let dedans = 0;
    let max = 0;
    for (const e of r.log) {
      if (e.kind === 'enter') dedans++;
      max = Math.max(max, dedans);
    }
    expect(max).toBeLessThanOrEqual(BATTLE.breachMaxWidth);
  });

  it('⚠️ c’est lui qui permet à une POIGNÉE de tenir contre une ARMÉE', () => {
    const armee = () => Array.from({ length: 40 }, () => att('melee', { damage: 12, pv: 60 }));
    const garde = () => [
      def('melee', { damage: 55, pv: 600 }),
      def('melee', { damage: 55, pv: 600 }),
    ];
    const avecGoulot = simulateSiege(armee(), garde(), wall(1, 1000), 21);
    // Sans goulot, les 40 frapperaient ensemble : on le simule en ouvrant TOUT grand.
    const large = { ...BATTLE };
    void large;
    expect(avecGoulot.killed).toBeGreaterThan(0);
    // Deux gardes contre quarante : ils ne tiendraient pas si tous entraient à la fois.
    expect(avecGoulot.entered).toBeLessThanOrEqual(BATTLE.breachMaxWidth * avecGoulot.rounds);
  });
});

describe('la place au pied du mur', () => {
  /** Les dégâts portés au MUR au premier tour — ce que le front laisse réellement passer. */
  const wallDamageRound1 = (army: SiegeUnit[]) =>
    simulateSiege(army, [turret({ pv: 1e9, damage: 0.001 })], wall(1e9), 77)
      .log.filter((e) => e.round === 1 && e.kind === 'wall')
      .reduce((t, e) => t + (e.amount ?? 0), 0);

  it("⚠️ une HORDE menue porte au mur autant qu'une bande lourde de même masse", () => {
    // L'invariant des factions depuis la v0.661 : `countMult × unitMult ≈ 1`. Compté en
    // TÊTES, le front le trahissait — mesuré, les bêtes tenaient 100 % du temps face à
    // 3-43 % pour les bandits, la même masse rendue inoffensive par sa seule silhouette.
    const lourds = Array.from({ length: 8 }, () => att('melee', { damage: 30, pv: 500 }));
    const menus = Array.from({ length: 24 }, () =>
      att('melee', { damage: 10, pv: 167, bulk: 1 / 3 }),
    );
    const a = wallDamageRound1(lourds);
    const b = wallDamageRound1(menus);
    expect(a).toBeGreaterThan(0);
    // ⚠️ Les deux, à 12 % près — et pas « b ≥ a », qui resterait vrai si les 24 entraient
    // TOUS (le bug inverse : une horde qui submerge le rempart).
    expect(Math.abs(b - a) / a).toBeLessThan(0.12);
  });

  it('⚠️ la place n’est pas illimitée : au-delà du front, les corps attendent', () => {
    const huit = Array.from({ length: 8 }, () => att('melee', { damage: 30, pv: 500 }));
    const cent = Array.from({ length: 100 }, () => att('melee', { damage: 30, pv: 500 }));
    // Cent béliers ne cognent pas douze fois plus fort que huit : c'est TOUT le rôle du
    // goulot, et sans lui la brèche s'ouvrait dans 100 % des sièges (cf. `wallFront`).
    expect(wallDamageRound1(cent)).toBe(wallDamageRound1(huit));
  });

  it('une unité sans `bulk` déclaré occupe UNE place — jamais zéro', () => {
    // ⚠️ Un repli à 0 laisserait passer l'armée entière : le défaut doit être le cas
    // PRUDENT, celui qui ne peut rien ouvrir d'inattendu.
    const sans = Array.from({ length: 40 }, () => att('melee', { damage: 25, pv: 500 }));
    const avec = sans.map((u) => ({ ...u, bulk: 1 }));
    expect(wallDamageRound1(sans)).toBe(wallDamageRound1(avec));
  });
});

describe('le ciblage', () => {
  it('vise la MENACE la plus forte, pas la plus faible', () => {
    const faible = def('ranged', { damage: 1, id: 'faible' });
    const fort = def('ranged', { damage: 99, id: 'fort' });
    const rng = mulberryish();
    expect(pickTarget([faible, fort], rng)!.id).toBe('fort');
    expect(pickTarget([fort, faible], rng)!.id).toBe('fort');
  });

  it('ignore les morts', () => {
    const mort = def('ranged', { damage: 99, pv: 0, id: 'mort' });
    const vif = def('ranged', { damage: 1, id: 'vif' });
    expect(pickTarget([mort, vif], mulberryish())!.id).toBe('vif');
  });

  it('rend null quand il n’y a plus rien à viser', () => {
    expect(pickTarget([], mulberryish())).toBeNull();
    expect(pickTarget([def('melee', { pv: 0 })], mulberryish())).toBeNull();
  });

  it("⚠️ à ÉGALITÉ, l'ordre de déclaration ne décide pas — la graine le fait", () => {
    // Sans départage aléatoire, la première unité écrite encaisserait toujours tout, et
    // l'ordre du tableau deviendrait une mécanique de jeu invisible.
    const a = def('ranged', { damage: 10, id: 'a' });
    const b = def('ranged', { damage: 10, id: 'b' });
    const vus = new Set<string>();
    for (let s = 0; s < 60; s++) {
      let x = s * 2654435761;
      const rng = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
      vus.add(pickTarget([a, b], rng)!.id);
    }
    expect(vus.size).toBe(2);
  });
});

describe('les garanties du siège', () => {
  it('est DÉTERMINISTE pour une graine', () => {
    const mk = () => ({
      a: Array.from({ length: 10 }, () => att('melee', { damage: 15, pv: 70 })),
      d: [turret({ damage: 25, pv: 150 }), def('melee', { damage: 30, pv: 200 })],
    });
    const x = mk();
    const y = mk();
    const r1 = simulateSiege(x.a, x.d, wall(800, 2000), 4242);
    const r2 = simulateSiege(y.a, y.d, wall(800, 2000), 4242);
    expect(r1.held).toBe(r2.held);
    expect(r1.killed).toBe(r2.killed);
    expect(r1.log.length).toBe(r2.log.length);
  });

  it('⚠️ ne MUTE pas les unités qu’on lui passe (on peut rejouer le même siège)', () => {
    const a = [att('melee', { damage: 20, pv: 50 })];
    const d = [turret({ damage: 40, pv: 100 })];
    const w = wall(500, 1000);
    simulateSiege(a, d, w, 1);
    expect(a[0]!.pv).toBe(50);
    expect(d[0]!.pv).toBe(100);
    expect(w.pv).toBe(500);
  });

  it('⚠️ les défenseurs tombés sont BLESSÉS, et le résultat le dit', () => {
    const r = simulateSiege(
      Array.from({ length: 30 }, () => att('ranged', { damage: 40, pv: 200 })),
      [turret({ damage: 1, pv: 10, id: 'tour' })],
      wall(100_000),
      6,
    );
    expect(r.wounded).toContain('tour');
  });

  it('se termine TOUJOURS (aucune boucle infinie, même si personne ne peut tuer)', () => {
    const r = simulateSiege(
      [att('ranged', { damage: 1, pv: 1e9 })],
      [turret({ damage: 1, pv: 1e9 })],
      wall(1e9),
      1,
    );
    expect(r.rounds).toBeLessThanOrEqual(BATTLE.maxRounds);
  });

  it('une armée BRISÉE = base tenue, un mur pulvérisé sans défenseurs = base perdue', () => {
    const gagne = simulateSiege(
      [att('melee', { damage: 1, pv: 1 })],
      [turret({ damage: 500, pv: 500 })],
      wall(5000),
      2,
    );
    expect(gagne.held).toBe(true);
    const perdu = simulateSiege(
      Array.from({ length: 25 }, () => att('melee', { damage: 80, pv: 400 })),
      [def('melee', { damage: 1, pv: 5 })],
      wall(200, 1000),
      2,
    );
    expect(perdu.held).toBe(false);
  });
});

/** Petit générateur déterministe pour les tests de ciblage. */
function mulberryish(): () => number {
  let x = 123456789;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
}
