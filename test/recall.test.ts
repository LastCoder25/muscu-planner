// 🔙 Faire demi-tour à une troupe en route (demandé : « en cliquant dessus »).
import { describe, expect, it } from 'vitest';
import {
  recallBlocker,
  recallVoyage,
  settleParties,
  startParty,
  type ActiveParty,
} from '@/lib/party';
import {
  captureControl,
  controlIdOf,
  ensureControls,
  recallReinforcements,
  reinforceControl,
  returnsEnRoute,
} from '@/lib/controlPoints';
import { createMap, travelPosition, voyageTarget, type Poi } from '@/lib/expedition';

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
const outcome = {
  win: true,
  gold: 500,
  party: { escort: ['a', 'b'], hurt: ['a'], lightHurt: ['b'], xp: { a: 10 } },
} as never;
/** Une équipe partie à 0, 40 minutes d'aller. */
const trip = (over: Partial<ActiveParty> = {}): ActiveParty => ({
  ...startParty({ poi: poi(), seed: 1 } as never, 0, 40, outcome),
  id: 'g1',
  ...over,
});

describe('🔙 le demi-tour d’une équipe', () => {
  it('au quart du chemin, elle revient en autant de temps qu’elle a marché', () => {
    const v = recallVoyage(trip(), 10 * M)!;
    expect(v.midAt).toBe(10 * M);
    expect(v.returnAt).toBe(20 * M);
    expect(v.turnBack).toBeCloseTo(0.25);
    expect(v.recalled).toBe(true);
  });
  it('elle se dessine depuis là où elle a tourné, et rentre à la ville', () => {
    const v = recallVoyage(trip(), 10 * M)!;
    const turn = voyageTarget(v);
    const at = travelPosition(v, 10 * M);
    expect(at.phase).toBe('return');
    expect(at.x).toBeCloseTo(turn.x);
    expect(travelPosition(v, 20 * M).phase).toBe('done');
  });
  it('rien n’est gagné : aucun rapport à l’arrivée, ni au retour', () => {
    const v = recallVoyage(trip(), 10 * M)!;
    const mid = settleParties([v], [], 15 * M, 30);
    expect(mid.fresh).toEqual([]);
    const end = settleParties([v], [], 20 * M, 30);
    expect(end.fresh).toEqual([]);
    expect(end.parties).toEqual([]);
  });
  it('rien n’est perdu : les blessures de l’issue tirée au départ sont effacées', () => {
    const v = recallVoyage(trip(), 10 * M)!;
    expect(v.outcome.party!.hurt).toEqual([]);
    expect(v.outcome.party!.lightHurt).toEqual([]);
    expect(v.outcome.party!.escort).toEqual(['a', 'b']);
    // Une sortie d'un point fixe ne se répartit pas vers la base à l'arrivée.
    expect(v.baseSplit).toBe(true);
  });
  it('la fouille et le retour d’un assaut ne s’appliquent plus', () => {
    const v = recallVoyage(trip({ dwellMs: 5 * M, returnLegs: { won: 3, lost: 40 } }), 10 * M)!;
    expect(v.dwellMs).toBeUndefined();
    expect(v.returnLegs).toBeUndefined();
  });
  it('trop tard une fois arrivée (fouille comprise), ou si le rapport est tombé', () => {
    expect(recallBlocker(trip(), 40 * M)).toBe('arrived');
    const dwell = trip({ dwellMs: 5 * M, midAt: 45 * M });
    expect(recallBlocker(dwell, 39 * M)).toBeNull();
    expect(recallBlocker(dwell, 41 * M)).toBe('arrived');
    expect(recallBlocker(trip({ reported: true }), 5 * M)).toBe('arrived');
    expect(recallVoyage(trip(), 40 * M)).toBeNull();
  });
  it('pas deux fois, et jamais un groupe d’une attaque combinée', () => {
    const once = recallVoyage(trip(), 10 * M)!;
    expect(recallBlocker(once, 12 * M)).toBe('turned');
    expect(recallBlocker(trip({ turnBack: 0.5 }), 5 * M)).toBe('turned');
    expect(recallBlocker(trip({ wingOf: 'x' }), 5 * M)).toBe('combined');
    expect(recallBlocker(trip({ crew: ['a'] }), 5 * M)).toBe('combined');
  });
});

describe('🔙 le demi-tour des renforts', () => {
  const ID = controlIdOf('mine');
  const held = () => {
    const m = captureControl(ensureControls(createMap(3, 0, 30, 1), 0, 30), ID, ['g'], 0, 7);
    return reinforceControl(m, ID, ['r1', 'r2'], 40 * M, 0);
  };
  it('ils quittent les renforts et rentrent par le même chemin', () => {
    const r = recallReinforcements(held(), ID, ['r1'], 10 * M)!;
    const c = r.map.pois.find((p) => p.id === ID)!.control!;
    expect(c.reinforcing!.map((x) => x.id)).toEqual(['r2']);
    expect(c.returning).toEqual([{ id: 'r1', from: 10 * M, at: 20 * M, turnBack: 0.25 }]);
    expect(r.back).toEqual([{ id: 'r1', at: 20 * M }]);
    expect(c.garrison).toEqual(['g']);
  });
  it('la carte les dessine depuis là où ils ont tourné', () => {
    const r = recallReinforcements(held(), ID, ['r1', 'r2'], 10 * M)!;
    const [t] = returnsEnRoute(r.map, 12 * M);
    expect(t!.turnBack).toBeCloseTo(0.25);
    expect(t!.members).toEqual(['r1', 'r2']);
    const c = r.map.pois.find((p) => p.id === ID)!.control!;
    expect(c.reinforcing).toBeUndefined();
  });
  it('arrivés, sans départ connu, ou en transfert : impossible', () => {
    expect(recallReinforcements(held(), ID, ['r1'], 40 * M)).toBeNull();
    const m = captureControl(ensureControls(createMap(3, 0, 30, 1), 0, 30), ID, ['g'], 0, 7);
    expect(recallReinforcements(reinforceControl(m, ID, ['r'], 40 * M), ID, ['r'], 5 * M)).toBeNull();
    const via = reinforceControl(m, ID, ['r'], 40 * M, 0, 'autre');
    expect(recallReinforcements(via, ID, ['r'], 5 * M)).toBeNull();
    expect(recallReinforcements(held(), ID, ['inconnu'], 5 * M)).toBeNull();
  });
});
