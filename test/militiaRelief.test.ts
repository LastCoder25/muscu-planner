import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { militiaOwedOn, militiaRelief } from '@/lib/militiaRelief';
import { MILITIA, emptyMilitia, type MilitiaState } from '@/lib/militia';
import type { ControlState, ExpeditionMap, ExpeditionMessage, Poi } from '@/lib/expedition';

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
      since: 100,
      ...control,
    },
  }) as unknown as Poi;
/** Le rapport d'une défense, tel que `withLastAttack` le garde sur le lieu. */
const report = (
  id: string,
  lost: string[],
  extra: { win?: boolean; resolvedAt?: number } = {},
): ExpeditionMessage =>
  ({
    id,
    win: extra.win ?? true,
    resolvedAt: extra.resolvedAt ?? 500,
    claimed: true,
    party: { defense: true, controlId: 'a', militiaLost: lost },
  }) as unknown as ExpeditionMessage;
const mapOf = (...pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const home = (n: number, seq = 10): MilitiaState => ({ ...emptyMilitia(0), home: n, seq });
const ctl = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!.control!;
const relief = (m: ExpeditionMap, s: MilitiaState) => militiaRelief(m, s, NOW, () => LEG);

describe('🛡️ la dette de relève vient du dernier rapport de défense gardé sur le lieu', () => {
  it('une défense tenue avec des miliciens tombés : ils sont dus, et le rapport est marqué vu', () => {
    const r = relief(
      mapOf(point('a', { garrison: ['mil:1'], lastAttack: report('r1', ['mil:2', 'mil:3']) })),
      home(0),
    );
    expect(ctl(r!.map, 'a').militiaOwed).toBe(2);
    expect(ctl(r!.map, 'a').reliefSeen).toBe('r1');
    expect(r!.sent).toEqual([]);
    // Déjà vu : il ne compte pas deux fois.
    expect(relief(r!.map, home(0))).toBeNull();
  });
  it('les pertes d’AVANT la mise à jour sont rattrapées (rien de noté sur le point)', () => {
    // Cas réel du 2026-10-20 : distillerie 3 morts, arsenal 2, aucune dette notée.
    const r = relief(
      mapOf(
        point('d', {
          garrison: ['mil:13', 'mil:14'],
          lastAttack: report('d1', ['m15', 'm16', 'm17']),
        }),
        point('x', {
          garrison: ['mil:7', 'mil:10', 'mil:11'],
          lastAttack: report('x1', ['m8', 'm9']),
        }),
      ),
      home(5, 17),
    );
    expect(r!.sent).toEqual([
      { id: 'd', n: 3 },
      { id: 'x', n: 2 },
    ]);
  });
  it('une attaque PERDUE ne crée aucune dette', () => {
    const m = mapOf(point('a', { lastAttack: report('r1', ['mil:2'], { win: false }) }));
    expect(relief(m, home(3))).toBeNull();
  });
  it('un rapport d’avant la prise du lieu (reprise puis repris) ne compte pas', () => {
    const m = mapOf(
      point('a', { since: 900, lastAttack: report('r1', ['mil:2'], { resolvedAt: 500 }) }),
    );
    expect(relief(m, home(3))).toBeNull();
  });
  it('une défense sans mort ne crée aucune dette', () => {
    expect(relief(mapOf(point('a', { lastAttack: report('r1', []) })), home(3))).toBeNull();
  });
  it('un nouveau rapport s’ajoute à la dette restante', () => {
    const r = relief(
      mapOf(point('a', { militiaOwed: 1, reliefSeen: 'r1', lastAttack: report('r2', ['mil:5']) })),
      home(0),
    );
    expect(ctl(r!.map, 'a').militiaOwed).toBe(2);
  });
  it('un point ennemi ne doit rien', () => {
    const m = mapOf(point('a', { owner: 'enemy', lastAttack: report('r1', ['mil:2']) }));
    expect(relief(m, home(3))).toBeNull();
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
  it('militiaOwedOn : le total dû sur les points tenus de la carte (ce que la Caserne refait)', () => {
    const m = mapOf(
      point('a', { militiaOwed: 2 }),
      point('b', { militiaOwed: 1 }),
      point('c', { owner: 'enemy', militiaOwed: 4 }),
    );
    expect(militiaOwedOn(m)).toBe(3);
    expect(militiaOwedOn(null)).toBe(0);
  });
});

// Test de CÂBLAGE : le store est hors harnais, on vérifie qu'il appelle les règles ci-dessus.
describe('🛡️ le store branche la relève', () => {
  const src = readFileSync('src/stores/character.ts', 'utf-8');
  const body = (name: string) => {
    const at = src.indexOf(`async function ${name}(`);
    return src.slice(at, src.indexOf('\n  async function ', at + 10));
  };
  it('le tick des points fait partir la relève et écrit la carte ET la base ensemble', () => {
    const tick = body('controlTick');
    expect(tick).toMatch(/militiaRelief\(\s*settled0,/);
    expect(tick).toMatch(
      /expedition_map: relief\.map,\s*base: \{ \.\.\.cur\.base, militia: relief\.militia \}/,
    );
  });
  it('la Caserne de l’île en cours produit la dette, plafond ou non', () => {
    expect(body('baseTickInner')).toMatch(
      /produceMilitia\(\s*m0,\s*barracks,\s*militiaOnMap\(cur\.expedition_map\),\s*now,\s*islandMilitiaOf\(cur\.expedition_map\),\s*(?:\/\/[^\n]*\s*)?militiaOwedOn\(cur\.expedition_map\),?\s*\)/,
    );
  });
});
