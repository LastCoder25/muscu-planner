import { describe, expect, it } from 'vitest';
import {
  advGearLevelBand,
  advGearProgress,
  advGearStatus,
  advGearRankStar,
  makeAdvGear,
  trainWornGear,
  withGearTracks,
  type AdvGear,
} from '@/lib/advGear';
import {
  advXpToNext,
  advXpTracks,
  grantAdvXp,
  starSegments,
  type Adventurer,
} from '@/lib/adventurers';

// 📊 La barre d'une pièce vers l'étoile suivante (v0.1129) : son niveau est caché comme celui
// d'un champion, donc sans elle une pièce apprend plusieurs missions sans que rien ne bouge.

const piece = (id: string, over: Partial<AdvGear> = {}): AdvGear => ({
  id,
  ...makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'commun', grade: 'B' }),
  ...over,
});
const adv = (id: string, level: number, gear?: Adventurer['gear']): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path: ['guerrier'],
  level,
  xp: 0,
  ...(gear ? { gear } : {}),
});

describe('l’avancement d’une pièce dans son étoile', () => {
  const band = advGearLevelBand('commun'); // 1..10 : deux niveaux par étoile

  it('part de zéro au début d’une étoile', () => {
    expect(advGearProgress(piece('p', { level: band.min }))).toBe(0);
    expect(advGearProgress(piece('p', { level: band.min + 2 }))).toBe(0);
  });

  it('avance avec l’XP du niveau en cours, pas seulement au passage de niveau', () => {
    const half = Math.floor(advXpToNext(1) / 2);
    const p = advGearProgress(piece('p', { level: 1, xp: half }));
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(0.3);
  });

  it('le niveau suivant de la même étoile vaut la moitié du chemin', () => {
    expect(advGearProgress(piece('p', { level: 2 }))).toBeCloseTo(0.5);
  });

  it('ne revient jamais en arrière à l’intérieur d’une étoile, et reste dans [0, 1]', () => {
    let last = -1;
    let star = 1;
    for (let l = band.min; l <= band.max; l++)
      for (const xp of [0, advXpToNext(l) - 1]) {
        const g = piece('p', { level: l, xp });
        const s = advGearRankStar(g).star;
        const p = advGearProgress(g);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        if (s === star) expect(p).toBeGreaterThanOrEqual(last);
        star = s;
        last = p;
      }
  });

  it('est pleine au ★5 de son rang : seule l’ascension la fera avancer', () => {
    expect(advGearProgress(piece('p', { level: band.max }))).toBe(1);
  });
});

describe('ce que dit une pièce quand on la touche', () => {
  it('dit ce qui reste vers l’étoile suivante', () => {
    expect(advGearStatus(piece('p', { level: 2 }), 20)).toContain('50 % vers ★2');
  });

  it('au stock, elle dit qu’elle n’apprend rien', () => {
    expect(advGearStatus(piece('p'), undefined)).toContain('Au stock');
  });

  it('bloquée par son porteur, elle le dit — pas « à 50 % »', () => {
    expect(advGearStatus(piece('p', { level: 4 }), 4)).toContain('rattrapé');
  });

  it('au ★5, elle renvoie à l’ascension', () => {
    const band = advGearLevelBand('commun');
    expect(advGearStatus(piece('p', { level: band.max }), 50)).toContain('ascension');
  });

  it('ne dit jamais son niveau', () => {
    expect(advGearStatus(piece('p', { level: 7, xp: 3 }), 20)).not.toMatch(/niveau|niv\.?\s*\d/i);
  });
});

describe('le découpage étoile par étoile', () => {
  it('un seul segment quand rien ne tombe', () => {
    const s = starSegments(3, 3, 0.2, 0.6);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ from: 0.2, to: 0.6, starUp: false, star: 4 });
  });

  it('une étoile gagnée remplit la barre puis repart de zéro', () => {
    const s = starSegments(3, 4, 0.7, 0.2);
    expect(s.map((x) => [x.from, x.to, x.starUp])).toEqual([
      [0.7, 1, true],
      [0, 0.2, false],
    ]);
  });

  it('le passage de ★5 à ★1 du rang suivant est un rang gagné', () => {
    const s = starSegments(4, 5, 0.9, 0.1);
    expect(s[0]!.rankUp).toBe(true);
    expect(s[1]!.rankName).not.toBe(s[0]!.rankName);
  });
});

describe('au retour de mission, les pièces du champion ont leur barre', () => {
  const stock = [
    piece('p1'),
    piece('p2', { slot: 'armor' }),
    piece('libre', { slot: 'accessory' }),
  ];
  const before = [adv('a', 1, { weapon: 'p1', armor: 'p2' })];
  const gain = advXpToNext(1) + advXpToNext(2) + 5;
  const after = before.map((a) => grantAdvXp(a, gain, 100));
  const next = trainWornGear(before, after, stock);
  const tracks = withGearTracks(advXpTracks(before, after), stock, next, after);

  it('chaque pièce PORTÉE qui a appris est rattachée à son porteur', () => {
    expect(tracks[0]!.gear?.map((g) => g.id).sort()).toEqual(['p1', 'p2']);
  });

  it('la pièce au stock n’apparaît pas', () => {
    expect(tracks[0]!.gear?.some((g) => g.id === 'libre')).toBe(false);
  });

  it('sa barre part de son avancement AVANT et gagne une étoile avec lui', () => {
    const bar = tracks[0]!.gear!.find((g) => g.id === 'p1')!;
    expect(bar.segments[0]!.from).toBe(advGearProgress(stock[0]!));
    expect(bar.segments.at(-1)!.to).toBeCloseTo(advGearProgress(next[0]!));
    expect(bar.segments[0]!.starUp).toBe(true);
  });

  it('chaque champion n’a QUE ses pièces, pas celles de son voisin', () => {
    const b2 = [adv('a', 1, { weapon: 'p1' }), adv('b', 1, { armor: 'p2' })];
    const a2 = b2.map((a) => grantAdvXp(a, gain, 100));
    const n2 = trainWornGear(b2, a2, stock);
    const t2 = withGearTracks(advXpTracks(b2, a2), stock, n2, a2);
    expect(t2.find((t) => t.id === 'a')!.gear!.map((g) => g.id)).toEqual(['p1']);
    expect(t2.find((t) => t.id === 'b')!.gear!.map((g) => g.id)).toEqual(['p2']);
  });

  it('rien ne bouge, rien n’est rattaché', () => {
    const t = withGearTracks(advXpTracks(before, after), stock, stock, after);
    expect(t[0]!.gear).toBeUndefined();
  });

  it('elle annonce l’ascension quand elle bute sur son ★5', () => {
    const big = before.map((a) => grantAdvXp(a, 1_000_000, 100));
    const n = trainWornGear(before, big, stock);
    const t = withGearTracks(advXpTracks(before, big), stock, n, big);
    expect(t[0]!.gear!.every((g) => g.ascendReady)).toBe(true);
  });
});
