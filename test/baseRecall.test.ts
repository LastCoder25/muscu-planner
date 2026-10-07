// 🔙 Rappeler à la base, depuis la base (demandé : « pour la défense par exemple »).
import { describe, expect, it } from 'vitest';
import { homeRecallLines, usefulRecalls, type HomeRecallInput } from '@/lib/baseRecall';
import { recallVoyage, startParty, type ActiveParty } from '@/lib/party';
import type { ExpeditionMap, Poi } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const M = 60_000;
const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'p1',
  type: 'mine',
  level: 20,
  x: 100,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const outcome = { win: true, gold: 0, party: { escort: ['a'], hurt: [], lightHurt: [] } } as never;
/** Une équipe partie à 0, 40 minutes d'aller (donc de retour à 80). */
const trip = (over: Partial<ActiveParty> = {}): ActiveParty => ({
  ...startParty({ poi: poi(), seed: 1 } as never, 0, 40, outcome),
  id: 'g1',
  ...over,
});
const ctlPoi = (over: Record<string, unknown> = {}): Poi =>
  poi({
    id: 'c1',
    type: 'control',
    control: { owner: 'player', kind: 'mine', garrison: ['b'], ...over },
  } as never);
const adv = (id: string, posted?: string) => ({ id, name: id, posted }) as unknown as Adventurer;

const base = (over: Partial<HomeRecallInput> = {}): HomeRecallInput => ({
  now: 10 * M,
  raidAt: null,
  expedition: null,
  parties: [],
  map: null,
  advs: [],
  postArrival: () => null,
  heroPostArrival: () => null,
  ...over,
});

describe('homeRecallLines', () => {
  it('une équipe en route : rappelée, elle rentre en autant de temps qu’elle a marché', () => {
    const g = trip();
    const [l] = homeRecallLines(base({ parties: [g] }));
    expect(l!.backAt).toBe(recallVoyage(g, 10 * M)!.returnAt);
    expect(l!.backAt).toBe(20 * M);
    expect(l!.homeAt).toBe(g.returnAt);
    expect(l!.action).toEqual({ kind: 'trip', target: { kind: 'party', id: 'g1' } });
  });

  it('une équipe déjà sur le retour ne se rappelle pas, mais se montre', () => {
    const [l] = homeRecallLines(base({ now: 50 * M, parties: [trip()] }));
    expect(l!.state).toBe('returning');
    expect(l!.action).toBeNull();
    expect(l!.why).toBeUndefined();
  });

  it('une sortie d’un lieu fixe ne rentre pas à la base : pas de rappel ici', () => {
    const [l] = homeRecallLines(base({ parties: [trip({ homeId: 'c1' })] }));
    expect(l!.action).toBeNull();
    expect(l!.homeAt).toBeNull();
    expect(l!.why).toMatch(/poste/);
  });

  it('le héros en expédition passe en tête', () => {
    const lines = homeRecallLines(
      // L'équipe, partie plus tard, rentrerait AVANT lui : il reste quand même en tête.
      base({ parties: [trip({ sentAt: 5 * M })], expedition: { ...trip(), id: 'h' } as never }),
    );
    expect(lines[1]!.backAt!).toBeLessThan(lines[0]!.backAt!);
    expect(lines[0]!.hero).toBe(true);
    expect(lines[0]!.action).toEqual({ kind: 'trip', target: { kind: 'hero' } });
  });

  it('un champion posté : l’arrivée vient de l’appelant, un transfert ne rentre pas à la base', () => {
    const map = { pois: [ctlPoi()] } as unknown as ExpeditionMap;
    const at = 30 * M;
    const [l] = homeRecallLines(
      base({ map, advs: [adv('b', 'c1')], postArrival: () => ({ at, toBase: true }) }),
    );
    expect(l!.backAt).toBe(at);
    expect(l!.action).toEqual({ kind: 'post', pointId: 'c1', advId: 'b' });
    const [t] = homeRecallLines(
      base({ map, advs: [adv('b', 'c1')], postArrival: () => ({ at, toBase: false }) }),
    );
    expect(t!.action).toBeNull();
    expect(t!.backAt).toBeNull();
  });

  it('le héros posté se rappelle par son poste', () => {
    const map = { pois: [ctlPoi({ hero: true })] } as unknown as ExpeditionMap;
    const [l] = homeRecallLines(base({ map, heroPostArrival: () => 25 * M }));
    expect(l!.hero).toBe(true);
    expect(l!.backAt).toBe(25 * M);
    expect(l!.action).toEqual({ kind: 'heroPost' });
  });

  it('une armée en vue : on dit qui serait là à temps, rappelé ou non', () => {
    const g = trip(); // rappelé à 20, sinon à 80
    const [l] = homeRecallLines(base({ parties: [g], raidAt: 30 * M }));
    expect(l!.inTime).toBe(true);
    expect(l!.inTimeAnyway).toBe(false);
    expect(usefulRecalls([l!])).toHaveLength(1);
    const [late] = homeRecallLines(base({ parties: [g], raidAt: 15 * M }));
    expect(late!.inTime).toBe(false);
    expect(usefulRecalls([late!])).toHaveLength(0);
    // Rentré avant l'assaut de toute façon : rien d'utile à rappeler.
    const [anyway] = homeRecallLines(base({ parties: [g], raidAt: 90 * M }));
    expect(anyway!.inTimeAnyway).toBe(true);
    expect(usefulRecalls([anyway!])).toHaveLength(0);
  });

  it('sans armée, aucun verdict', () => {
    const [l] = homeRecallLines(base({ parties: [trip()] }));
    expect(l!.inTime).toBeNull();
    expect(l!.inTimeAnyway).toBeNull();
  });
});
