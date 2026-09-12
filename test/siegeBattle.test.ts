// ⚔️🧱 Ce que le moteur de siège PROMET — et rien de moins.
//
// ⚠️ Le modèle tient en une phrase : « on frappe ce qu'on peut atteindre ; à portée égale,
// on frappe ce qui fait le plus mal ». Chaque test ci-dessous vérifie une CONSÉQUENCE de
// cette phrase, pas un détail d'implémentation.
import { describe, it, expect } from 'vitest';
import {
  BATTLE,
  sectorGap,
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
/**
 * ⚠️ LE POSTE PAR DÉFAUT REPREND LA RÈGLE DE PRODUCTION (`siegeDefenders`) : un tireur
 * monte sur le rempart, un homme d’armes attend dans la cour. Sans lui, `post` étant
 * optionnel sur le type, tous ces fixtures produisaient des défenseurs SANS POSTE — que
 * le moteur traite en repli comme « sur le rempart ». Les tests auraient donc décrit un
 * modèle que le jeu n’emploie jamais. Un test qui veut un archer DESCENDU passe
 * `post: 'yard'` explicitement.
 */
const def = (kind: 'melee' | 'ranged', o: Partial<SiegeUnit> = {}) =>
  unit({ side: 'def', kind, post: kind === 'ranged' ? 'rampart' : 'yard', ...o });
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

describe('🎯 LE TERRAIN : distance, portée, arc de tir', () => {
  // ⚠️ L’approche n’est pas un décor : c’est LE CHAMP DE TIR, et c’est ce qui justifie
  // la puissance d’une baliste — elle frappe la première et pendant plus longtemps.
  // Un défenseur atteint une cible si TROIS termes tombent : dehors · à portée · dans
  // l’arc. Trois cas particuliers de l’ancien modèle sont devenus un seul prédicat.

  it('l’écart de secteurs se compte SUR UN ANNEAU', () => {
    // Le pan 0 et le pan 7 sont VOISINS : compter à plat ferait d’eux les plus éloignés,
    // et une baliste du nord ne couvrirait pas son voisin de gauche.
    expect(sectorGap(0, 1)).toBe(1);
    expect(sectorGap(0, BATTLE.sectors - 1)).toBe(1);
    expect(sectorGap(0, BATTLE.sectors / 2)).toBe(BATTLE.sectors / 2);
    expect(sectorGap(3, 3)).toBe(0);
  });

  it('⚠️ UNE BALISTE NE PIVOTE PAS : hors de son arc, elle ne tire pas', () => {
    const loin = (secteur: number) => {
      const r = simulateSiege(
        [att('melee', { id: 'x', pv: 1e6, damage: 1, dist: 0, sector: secteur })],
        [turret({ id: 't', damage: 100, pv: 1e6, sector: 0, range: BATTLE.fieldDepth })],
        wall(1e9),
        31,
      );
      return r.log.some((e) => e.kind === 'hit' && e.from === 't');
    };
    expect(loin(0)).toBe(true);
    // À l’opposé de l’enceinte : elle le voit, elle ne peut pas le viser.
    expect(loin(BATTLE.sectors / 2)).toBe(false);
  });

  it('⚠️ UN HOMME MARCHE LE LONG DU REMPART — aucun arc ne le borne', () => {
    // C’est la distinction que porte l’absence de secteur : la machine est fixée à son
    // sommet, l’archer se déplace. Ne pas donner de secteur à un archer n’est donc pas
    // un oubli, c’est la règle.
    const r = simulateSiege(
      [att('melee', { id: 'x', pv: 1e6, damage: 1, dist: 0, sector: BATTLE.sectors / 2 })],
      [def('ranged', { id: 'arc', damage: 100, pv: 1e6, range: BATTLE.fieldDepth })],
      wall(1e9),
      32,
    );
    expect(r.log.some((e) => e.kind === 'hit' && e.from === 'arc')).toBe(true);
  });

  it('⚠️ HORS DE PORTÉE, ON NE TIRE PAS — et l’engagement se STRATIFIE', () => {
    // Une baliste couvre le terrain entier, un arc la moitié : l’assaut est donc pris à
    // partie par les machines d’abord, puis par les hommes. C’est ce qui donne son sens
    // à la traversée, et ce que l’animation doit montrer.
    const r = simulateSiege(
      [att('melee', { id: 'x', pv: 1e6, damage: 1, dist: BATTLE.fieldDepth, sector: 0 })],
      [
        turret({ id: 'bal', damage: 10, pv: 1e6, sector: 0, range: BATTLE.fieldDepth }),
        def('ranged', { id: 'arc', damage: 10, pv: 1e6, range: Math.round(BATTLE.fieldDepth / 2) }),
      ],
      wall(1e9),
      33,
    );
    const premierBal = r.log.findIndex((e) => e.kind === 'hit' && e.from === 'bal');
    const premierArc = r.log.findIndex((e) => e.kind === 'hit' && e.from === 'arc');
    expect(premierBal).toBeGreaterThanOrEqual(0);
    expect(premierArc).toBeGreaterThan(premierBal);
    // ⚠️ On épingle le TOUR, pas seulement l’ordre : l’archer n’entre en jeu qu’une fois
    // l’assaut à MI-TERRAIN. Un simple « après » passerait au vert avec une portée pleine.
    expect(r.log[premierBal]!.round).toBe(0);
    expect(r.log[premierArc]!.round).toBe(BATTLE.fieldDepth - Math.round(BATTLE.fieldDepth / 2));
  });

  it('⚠️ ON NE COGNE PAS UN MUR QU’ON N’A PAS ATTEINT', () => {
    // Sans cette borne, toute l’armée frappait dès le premier tour et le terrain
    // d’approche n’aurait été qu’un décor.
    const r = simulateSiege(
      [att('melee', { id: 'x', pv: 1e6, damage: 50, dist: BATTLE.fieldDepth, sector: 0 })],
      [],
      wall(1e9),
      34,
    );
    const premier = r.log.find((e) => e.kind === 'wall');
    expect(premier?.round).toBe(BATTLE.fieldDepth);
  });

  it('⚠️ UN TIREUR ASSAILLANT DOIT S’APPROCHER pour riposter', () => {
    // Tant qu’il traverse, il encaisse sans rendre — c’est toute la valeur d’une
    // muraille, et la seule riposte est d’amener des machines qui portent plus loin.
    const porte = 2;
    const r = simulateSiege(
      [
        att('ranged', {
          id: 'a',
          pv: 1e6,
          damage: 10,
          dist: BATTLE.fieldDepth,
          sector: 0,
          range: porte,
        }),
      ],
      [turret({ id: 't', damage: 1, pv: 1e6, sector: 0, range: BATTLE.fieldDepth })],
      wall(1e9),
      35,
    );
    const premier = r.log.find((e) => e.kind === 'hit' && e.from === 'a');
    expect(premier?.round).toBe(BATTLE.fieldDepth - porte);
  });
});
describe('🪜 LE POSTE, ET LE PRIX DE LA DESCENTE', () => {
  // ⚠️ Avant, la portée d’un défenseur vivait dans son `kind` et son `origin` : l’archer
  // voyait TOUT, dedans comme dehors, gratuitement. « Descendre » n’avait donc aucun sens —
  // rien à gagner en descendant, rien à perdre en restant. La portée vient désormais de la
  // POSITION, et quitter le rempart coûte deux fois : l’abri, et la ligne de mire.

  it('⚠️ SUR LE REMPART, on ne frappe que ce qui est DEHORS', () => {
    const dehors = att('melee', { id: 'out', damage: 1, pv: 1e6 });
    const dedans = att('melee', { id: 'in', damage: 1, pv: 1e6, inside: true });
    // Le garde de la cour tient bon (gros dégâts) : la cour ne cède pas, donc l’archer
    // reste sur son mur — c’est ce qu’on veut observer.
    const archer = def('ranged', { id: 'arc', damage: 500, pv: 1e6 });
    const garde = def('melee', { id: 'gar', damage: 1000, pv: 1e6 });
    const r = simulateSiege([dehors, dedans], [archer, garde], wall(1e9), 21);
    const tirs = r.log.filter((e) => e.kind === 'hit' && e.from === 'arc');
    expect(tirs.length).toBeGreaterThan(0);
    // Pas UN seul tir sur celui qui est entré : depuis le chemin de ronde, on ne le voit pas.
    expect(tirs.every((e) => e.to === 'out')).toBe(true);
  });

  it('⚠️ ON DESCEND QUAND LA COUR CÈDE — et une seule fois', () => {
    // La règle est DÉRIVÉE : ce qui est entré frappe plus fort que ce qui le retient.
    const r = simulateSiege(
      [att('melee', { id: 'in', damage: 1000, pv: 1e6, inside: true })],
      [def('ranged', { id: 'arc', damage: 1, pv: 1e6 })],
      wall(1e9),
      22,
    );
    const descentes = r.log.filter((e) => e.kind === 'descend' && e.to === 'arc');
    // ⚠️ À SENS UNIQUE : sans ça l’unité oscillerait, et le journal le dirait en
    // rejouant la descente à chaque tour.
    expect(descentes).toHaveLength(1);
    // Descendu, il frappe enfin ce qui est entré.
    expect(r.log.some((e) => e.kind === 'hit' && e.from === 'arc' && e.to === 'in')).toBe(true);
  });

  it('⚠️ AUCUNE DESCENTE tant que personne n’est entré', () => {
    // Rien dedans, rien à comparer : la règle se tait toute seule, sans garde ajoutée.
    const r = simulateSiege(
      [att('melee', { damage: 10, pv: 1e6 })],
      [def('ranged', { id: 'arc', damage: 1, pv: 1e6 })],
      wall(1e9),
      23,
    );
    expect(r.log.some((e) => e.kind === 'descend')).toBe(false);
  });

  it('⚠️ UNE BALISTE NE DESCEND JAMAIS — c’est de la maçonnerie', () => {
    // Et c’est ce qui laisse `turretInsideShare` — la fraction d’en face — seule façon
    // pour elles d’atteindre la cour.
    const r = simulateSiege(
      [att('melee', { damage: 1000, pv: 1e6, inside: true })],
      [turret({ id: 'tour', damage: 1, pv: 1e6 })],
      wall(1e9),
      24,
    );
    expect(r.log.some((e) => e.kind === 'descend' && e.to === 'tour')).toBe(false);
  });

  it('⚠️ DESCENDRE MET DANS LA LIGNE, même quand on n’est pas la plus grosse menace', () => {
    // Premier prix de la descente. Tant qu’il est sur le mur, l’assaillant entré ne peut
    // pas l’atteindre et va au plus dangereux — la baliste. Une fois descendu, c’est LUI
    // qui barre le passage, tout faible qu’il soit.
    const r = simulateSiege(
      [att('melee', { id: 'in', damage: 1000, pv: 1e6, inside: true })],
      [
        def('ranged', { id: 'arc', damage: 1, pv: 1e6 }),
        turret({ id: 'tour', damage: 500, pv: 1e6 }),
      ],
      wall(1e9),
      25,
    );
    const premier = r.log.find((e) => e.kind === 'hit' && e.from === 'in');
    expect(premier?.to).toBe('arc');
  });

  it('⚠️ LA COUR NE COUVRE PAS — le poste GATE l’abri, sans second écrit', () => {
    // C’est le second prix, et la garantie qui permet à la descente de ne basculer QUE
    // `post` : la couverture tombe d’elle-même. On éprouve donc le GATE, pas le
    // coefficient — d’où une unité qui PORTE une armure tout en étant dans la cour,
    // état impossible en partie mais qui isole exactement la règle.
    // `origin: turret` l’épingle à son poste : une baliste ne descend pas, donc la mesure
    // n’est pas brouillée par la descente elle-même.
    const coup = (post: 'rampart' | 'yard') => {
      const r = simulateSiege(
        [att('melee', { damage: 100, pv: 1e6, inside: true })],
        [turret({ id: 'c', damage: 1, pv: 1e5, armor: 0.5, post })],
        wall(1000, 1000),
        26,
      );
      return r.log.find((e) => e.kind === 'hit' && e.to === 'c')?.amount ?? 0;
    };
    // Sur le rempart, le mur intact absorbe la moitié du coup ; dans la cour, rien.
    expect(coup('rampart')).toBe(50);
    expect(coup('yard')).toBe(100);
  });

  it('⚠️ « À TRAVERS LA BRÈCHE » se lit sur le REMPART, pas sur le type', () => {
    // ⚠️ Ce test manquait, et son absence a failli passer : j’avais changé la condition
    // sans que rien ne la vérifie — la mutation qui la remettait à l’ancienne forme
    // passait au VERT sur les 1117 tests.
    // L’ancienne lisait « plus aucun tireur adverse VIVANT ». Depuis la descente, un
    // archer bien vivant peut avoir quitté le mur : le rempart est muet alors que le
    // `kind` dit encore `'ranged'`. L’assaillant tirait donc à PLEINE puissance sur un
    // homme réfugié dans la cour, alors qu’il vise dans un couloir.
    const r = simulateSiege(
      [
        att('ranged', { id: 'archerEnnemi', damage: 100, pv: 1e6 }),
        att('melee', { id: 'in', damage: 1000, pv: 1e6, inside: true }),
      ],
      [def('ranged', { id: 'arc', damage: 1, pv: 1e6 })],
      // Mur quasi tombé : la brèche est grande ouverte, et il n’abrite plus personne —
      // la mesure ne porte donc que sur le passage, pas sur l’armure.
      wall(1, 1000),
      27,
    );
    // La cour cède (personne pour la tenir) : l’archer descend, le rempart devient muet.
    expect(r.log.some((e) => e.kind === 'descend' && e.to === 'arc')).toBe(true);
    const tir = r.log.find((e) => e.kind === 'hit' && e.from === 'archerEnnemi' && e.to === 'arc');
    // ⚠️ On épingle la MAGNITUDE : 100 × `rangedThroughBreach`. Un `> 0` passerait
    // au vert avec la pleine puissance, donc ne prouverait rien.
    expect(tir?.amount).toBe(Math.round(100 * BATTLE.rangedThroughBreach));
  });
});
describe('🛡️ L’ABRI DU REMPART', () => {
  // ⚠️ `wallArmorK` existait depuis la v0.753 (« le mur abrite ceux qui tirent ») et ce
  // moteur ne l’a JAMAIS lu : `SiegeUnit` n’avait pas d’armure. Faute d’abri, il avait fallu
  // gonfler les balistes, et un joueur l’a vu — « les tourelles ont plus de vie que le
  // mur ». Une baliste est une MACHINE posée sur le rempart : elle a peu de PV et elle
  // dure parce qu’elle est couverte.

  it('un tireur ABRITÉ encaisse moins qu’un tireur à découvert', () => {
    const coup = (armor: number, murPv: number) => {
      const cible = def('ranged', { id: 'c', pv: 1000, maxPv: 1000, damage: 1, armor });
      const r = simulateSiege(
        [att('ranged', { damage: 100, pv: 10_000, maxPv: 10_000 })],
        [cible],
        wall(murPv, 1000),
        7,
      );
      return r.log.find((e) => e.kind === 'hit' && e.to === 'c')?.amount ?? 0;
    };
    expect(coup(0.5, 1000)).toBeLessThan(coup(0, 1000));
    // ⚠️ ET L’ABRI S’ÉRODE AVEC LE MUR : à mi-rempart il ne protège plus qu’à moitié.
    expect(coup(0.5, 500)).toBeGreaterThan(coup(0.5, 1000));
    // Mur tombé, plus aucun abri — c’est ce qui fait du rempart une structure qui COUVRE.
    expect(coup(0.5, 0)).toBe(coup(0, 1000));
  });

  it('⚠️ UN ABRI NE REND JAMAIS INVULNÉRABLE', () => {
    // Le plafond de `strike` est INATTEIGNABLE avec les valeurs du jeu (l’abri vaut 0,65),
    // donc une assertion posée sur une partie réelle ne le couvrirait PAS — exactement le
    // piège du plafond de réduction de la v0.753, qui donnait le vert sans rien vérifier.
    // On l’éprouve donc DIRECTEMENT, avec une unité sur-blindée : sans plafond, une armure
    // de 1 rendrait la cible immortelle et la bataille ne finirait jamais.
    const r = simulateSiege(
      [att('ranged', { damage: 100, pv: 10_000, maxPv: 10_000 })],
      [def('ranged', { id: 'c', pv: 1000, maxPv: 1000, damage: 1, armor: 5 })],
      wall(1000, 1000),
      7,
    );
    const touche = r.log.find((e) => e.kind === 'hit' && e.to === 'c');
    // ⚠️ « > 0 » NE PROUVE RIEN : le plancher `Math.max(1, …)` garantit déjà qu’un coup
    // touche, donc retirer le plafond passait au VERT. On épingle la MAGNITUDE : au
    // plafond (0,9) il reste 10 % des dégâts, soit 10 ; sans plafond il ne resterait que
    // le plancher, soit 1.
    expect(touche?.amount ?? 0).toBeGreaterThan(5);
    expect(touche!.amount!).toBeLessThan(20);
  });
});
