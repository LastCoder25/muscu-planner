import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { militiaOwedOn, militiaRelief, noteStoredLosses } from '@/lib/militiaRelief';
import { produceIslandMilitia } from '@/lib/crossing';
import { militiaFreeSeats } from '@/lib/controlPoints';
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

// ⛵ Les miliciens tombés sur une île RANGÉE : refaits à la base de l'île en cours, puis en mer.
describe('⛵ la relève traverse vers le lieu tenu d’une île rangée', () => {
  const stored = (owed?: number): ExpeditionMap =>
    ({
      pois: [],
      archipel: { island: 2 },
      islands: {
        '1': {
          pois: [point('m1', { garrison: ['mil:9'], ...(owed ? { militiaOwed: owed } : {}) })],
          militia: { ...emptyMilitia(0), home: 0 },
        },
      },
    }) as unknown as ExpeditionMap;
  const onStored = (m: ExpeditionMap) => m.islands!['1']!;

  it('les morts d’une île rangée sont dus (et comptés par la Caserne de l’île en cours)', () => {
    const m = noteStoredLosses(onStored(stored()) as ExpeditionMap, 'm1', 2, 'r7');
    expect(m.pois[0]!.control!.militiaOwed).toBe(2);
    expect(m.pois[0]!.control!.reliefSeen).toBe('r7');
    expect(militiaOwedOn(stored(3))).toBe(3);
  });
  it('un lieu qui n’est plus à nous ne doit rien', () => {
    const m = onStored(stored()) as ExpeditionMap;
    m.pois[0]!.control!.owner = 'enemy' as never;
    expect(noteStoredLosses(m, 'm1', 2, 'r7')).toBe(m);
  });
  it('ils partent de la base de l’île en cours, 2 h de mer, vers le lieu où ils sont morts', () => {
    const r = relief(stored(2), home(5));
    expect(r!.sent).toEqual([{ id: 'm1', n: 2 }]);
    expect(r!.militia.home).toBe(3);
    const sail = r!.map.sailings![0]!;
    expect(sail).toMatchObject({ from: 2, to: 1, militia: 2, militiaTo: 'm1' });
    expect(sail.arriveAt - sail.departAt).toBe(2 * 3600_000);
    expect(ctl(onStored(r!.map) as ExpeditionMap, 'm1').militiaOwed).toBeUndefined();
  });
  it('sans milicien à la base, la dette attend ; en mer, la place est gardée', () => {
    expect(relief(stored(2), home(0))).toBeNull();
    const r = relief(stored(2), home(1))!;
    expect(r.sent).toEqual([{ id: 'm1', n: 1 }]);
    expect(ctl(onStored(r.map) as ExpeditionMap, 'm1').militiaOwed).toBe(1);
  });
  it('un milicien en mer garde sa place : la relève suivante ne promet que le reste', () => {
    const free = militiaFreeSeats(point('m1', { garrison: ['mil:9'] }).control);
    const m = stored(free + 3);
    const first = relief(m, home(free + 3))!;
    expect(first.sent).toEqual([{ id: 'm1', n: free }]);
    // Les places sont toutes gardées pour ceux en mer : il n'en part pas d'autres.
    expect(relief(first.map, home(9))).toBeNull();
  });
  it('les places gardées pour ceux déjà en mer ne sont pas promises deux fois', () => {
    const free = militiaFreeSeats(point('m1', { garrison: ['mil:9'] }).control);
    const m = {
      ...stored(3),
      sailings: [{ from: 2, to: 1, militia: free - 1, militiaTo: 'm1', arriveAt: 9e9 }],
    } as unknown as ExpeditionMap;
    const r = relief(m, home(9))!;
    expect(r.sent).toEqual([{ id: 'm1', n: 1 }]);
  });
  it('l’île en cours n’est jamais traversée, même si une copie traîne dans les îles', () => {
    const m = stored(2);
    (m as unknown as { archipel: { island: number } }).archipel.island = 1;
    expect(relief(m, home(5))).toBeNull();
  });
  it('la réserve d’une île rangée ne refait pas ses morts d’elle-même', () => {
    const m = stored(0);
    const dead = stored(2);
    const H = 3600_000;
    const live = produceIslandMilitia(m, 10, 48 * H);
    const owed = produceIslandMilitia(dead, 10, 48 * H);
    expect(live.islands!['1']!.militia!.home).toBeGreaterThan(owed.islands!['1']!.militia!.home);
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
  it('une île quittée note ses morts : leur relève traversera depuis l’île en cours', () => {
    const at = src.indexOf('  function abandonedRetakes(');
    expect(src.slice(at, at + 30000)).toMatch(
      /releaseFromControl\(map, p\.id, dead, at, lvl\);[^}]*noteStoredLosses\(map, p\.id, dead\.length, msg\.id\)/,
    );
  });
  it('la Caserne de l’île en cours produit la dette, plafond ou non', () => {
    expect(body('baseTickInner')).toMatch(
      /produceMilitia\(\s*m0,\s*barracks,\s*militiaOnMap\(cur\.expedition_map\),\s*now,\s*islandMilitiaOf\(cur\.expedition_map\),\s*(?:\/\/[^\n]*\s*)?militiaOwedOn\(cur\.expedition_map\),?\s*\)/,
    );
  });
});
