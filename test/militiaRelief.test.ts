import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { militiaRelief, oweMilitia } from '@/lib/militiaRelief';
import { MILITIA, emptyMilitia, type MilitiaState } from '@/lib/militia';
import type { ControlState, ExpeditionMap, Poi } from '@/lib/expedition';

const NOW = 1_000_000;
const LEG = 600_000;

const point = (id: string, control: Partial<ControlState> = {}): Poi =>
  ({
    id,
    type: 'control',
    level: 30,
    x: 0,
    y: 0,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 0,
    control: {
      kind: 'mine',
      owner: 'player',
      garrison: [],
      retakes: 0,
      faction: 'bandits',
      size: 1,
      ...control,
    },
  }) as unknown as Poi;
const mapOf = (...pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const home = (n: number, seq = 10): MilitiaState => ({ ...emptyMilitia(0), home: n, seq });
const ctl = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!.control!;
const relief = (m: ExpeditionMap, s: MilitiaState) => militiaRelief(m, s, NOW, () => LEG);

describe('🛡️ oweMilitia : un point tenu note les miliciens tombés à remplacer', () => {
  it('ajoute aux miliciens déjà dus', () => {
    const m = oweMilitia(mapOf(point('a', { militiaOwed: 1 })), 'a', 2);
    expect(ctl(m, 'a').militiaOwed).toBe(3);
  });
  it('rien sur un point qui n’est pas à nous, rien pour zéro mort', () => {
    const m0 = mapOf(point('a', { owner: 'enemy' }), point('b'));
    expect(oweMilitia(m0, 'a', 2)).toBe(m0);
    expect(oweMilitia(m0, 'b', 0)).toBe(m0);
  });
});

describe('🛡️ militiaRelief : la base renvoie d’elle-même la relève', () => {
  it('les miliciens dus partent de la base vers leur point, à l’heure du trajet', () => {
    const r = relief(mapOf(point('a', { garrison: ['mil:1'], militiaOwed: 2 })), home(3));
    expect(r).not.toBeNull();
    expect(r!.militia.home).toBe(1);
    expect(r!.militia.seq).toBe(12);
    expect(ctl(r!.map, 'a').militiaOwed).toBeUndefined();
    expect(ctl(r!.map, 'a').reinforcing).toEqual([
      { id: 'mil:11', at: NOW + LEG, from: NOW },
      { id: 'mil:12', at: NOW + LEG, from: NOW },
    ]);
    expect(r!.sent).toEqual([{ id: 'a', n: 2 }]);
  });
  it('pas assez à la base : ceux qui sont là partent, le reste attend la Caserne', () => {
    const r = relief(mapOf(point('a', { militiaOwed: 2 })), home(1));
    expect(r!.sent).toEqual([{ id: 'a', n: 1 }]);
    expect(ctl(r!.map, 'a').militiaOwed).toBe(1);
    // Base vide : rien ne bouge, la dette reste.
    expect(relief(r!.map, r!.militia)).toBeNull();
  });
  it('une place reprise à la main entre-temps n’est plus due', () => {
    const full = Array.from({ length: MILITIA.perPoint - 1 }, (_, i) => `mil:${i + 1}`);
    const r = relief(mapOf(point('a', { garrison: full, militiaOwed: 3 })), home(5, 20));
    expect(r!.sent).toEqual([{ id: 'a', n: 1 }]);
    expect(ctl(r!.map, 'a').militiaOwed).toBeUndefined();
  });
  it('point plein : la dette s’efface sans envoyer personne', () => {
    const full = Array.from({ length: MILITIA.perPoint }, (_, i) => `mil:${i + 1}`);
    const s = home(4, 20);
    const r = relief(mapOf(point('a', { garrison: full, militiaOwed: 2 })), s);
    expect(r!.sent).toEqual([]);
    expect(r!.militia).toBe(s);
    expect(ctl(r!.map, 'a').militiaOwed).toBeUndefined();
  });
  it('rien n’est dû : rien ne change', () => {
    expect(relief(mapOf(point('a'), point('b', { owner: 'enemy' })), home(4))).toBeNull();
  });
  it('plusieurs points : chacun reçoit sa part, dans l’ordre de la carte', () => {
    const r = relief(
      mapOf(point('a', { militiaOwed: 1 }), point('b', { militiaOwed: 2 })),
      home(2),
    );
    expect(r!.sent).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 1 },
    ]);
    expect(ctl(r!.map, 'b').militiaOwed).toBe(1);
    expect(r!.militia.home).toBe(0);
  });
});

// Test de CÂBLAGE : le store est hors harnais, on vérifie qu'il appelle les règles ci-dessus.
describe('🛡️ le store branche la relève', () => {
  const src = readFileSync('src/stores/character.ts', 'utf-8');
  const at = src.indexOf('async function controlTick(');
  const tick = src.slice(at, src.indexOf('\n  async function ', at + 10));
  it('une défense tenue note les miliciens tombés à remplacer', () => {
    expect(tick).toMatch(
      /if \(held && dead\.length\)\s*map = oweMilitia\(releaseFromControl\(map, p\.id, dead, at, playerLevel\), p\.id, dead\.length\);/,
    );
  });
  it('le tick fait partir la relève et écrit la carte ET la base ensemble', () => {
    expect(tick).toMatch(/militiaRelief\(\s*settled0,/);
    expect(tick).toMatch(
      /expedition_map: relief\.map,\s*base: \{ \.\.\.cur\.base, militia: relief\.militia \}/,
    );
  });
});
