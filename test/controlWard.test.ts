import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  controlIdOf,
  ensureControls,
  garrisonHold,
  garrisonHoldChance,
  retakeBoost,
  wardedBoost,
} from '@/lib/controlPoints';
import { retakeBattle } from '@/lib/fieldArmy';
import { createMap, type Poi } from '@/lib/expedition';
import { partyAllies, refChampionAdv } from '@/lib/caravan';
import {
  WARD,
  WARD_CUT,
  activeWards,
  placeWard,
  wardBlocker,
  wardCut,
  wardMult,
  wardedControlKey,
  type Ward,
} from '@/lib/controlWard';
import { CONSUMABLE_IDS, SUPPLIES, supplyUselessWhy } from '@/lib/supplies';

const H = 3_600_000;
const ATTACK = 24 * H;

/** Une mine tenue, attaquée à 24 h. */
const mineAt = (L: number): Poi => {
  const m = captureControl(
    ensureControls(createMap(3, 0, L, 1), 0, L),
    controlIdOf('mine'),
    ['a0'],
    0,
    7,
  );
  const p = m.pois.find((q) => q.id === controlIdOf('mine'))!;
  return { ...p, level: L, control: { ...p.control!, attackAt: ATTACK } };
};
const allies = (level: number, n: number) =>
  partyAllies(
    Array.from({ length: n }, (_, i) => ({ ...refChampionAdv(level, i), id: `a${i}` })),
    { advGear: [] },
    null,
  );
const warded = (p: Poi, ids: ('palissade' | 'bastion')[], at = 0): Poi => {
  let c = p.control!;
  for (const id of ids) c = placeWard(c, id, at);
  return { ...p, control: c };
};

describe('🪵 palissades : règles de pose', () => {
  const held: { owner: 'player'; wards: Ward[] } = { owner: 'player', wards: [] };

  it('10 + 20 passe, 20 + 20 non : 30 % au plus par lieu', () => {
    let c = placeWard(held, 'palissade', 0);
    expect(wardBlocker(c, 'bastion', true, 0)).toBeNull();
    c = placeWard(c, 'bastion', 0);
    expect(wardCut(c, 0)).toBeCloseTo(0.3, 9);
    expect(wardBlocker(c, 'palissade', true, 0)).toBe('full');
    const two = placeWard(held, 'bastion', 0);
    expect(wardBlocker(two, 'bastion', true, 0)).toBe('full');
    // Trois petites passent pile au plafond.
    let three = held;
    for (let i = 0; i < 3; i++) {
      expect(wardBlocker(three, 'palissade', true, 0)).toBeNull();
      three = placeWard(three, 'palissade', 0);
    }
    expect(wardBlocker(three, 'palissade', true, 0)).toBe('full');
  });

  it('chacune dure 24 h, et une expirée libère la place', () => {
    const c = placeWard(held, 'bastion', 0);
    expect(wardCut(c, WARD.durationMs - 1)).toBeCloseTo(0.2, 9);
    expect(wardCut(c, WARD.durationMs)).toBe(0);
    // Bastion à 0 h (fin à 24 h), palissade à 10 h (fin à 34 h), bastion à 30 h.
    const d = placeWard(placeWard(c, 'palissade', 10 * H), 'bastion', 30 * H);
    // À 30 h la première a expiré : elle est retirée à la pose.
    expect(d.wards.length).toBe(2);
    expect(activeWards(d, 30 * H).map((w) => w.id)).toEqual(['palissade', 'bastion']);
    expect(wardCut(d, 30 * H)).toBeCloseTo(0.3, 9);
  });

  it('seulement sur un lieu tenu qui se défend', () => {
    expect(wardBlocker({ owner: 'enemy', wards: [] }, 'palissade', true, 0)).toBe('notHeld');
    expect(wardBlocker(undefined, 'palissade', true, 0)).toBe('notHeld');
    expect(wardBlocker(held, 'palissade', false, 0)).toBe('noDefense');
  });

  it('la somme est plafonnée même si des données en portent trop', () => {
    const c = { wards: [0, 1, 2].map(() => ({ id: 'bastion' as const, until: 9e15 })) };
    expect(wardCut(c, 0)).toBe(WARD.max);
    expect(wardMult(c, 0)).toBeCloseTo(1 - WARD.max, 9);
  });

  it('ce sont des consommables de butin qui ne partent pas en voyage', () => {
    for (const id of ['palissade', 'bastion'] as const) {
      expect(CONSUMABLE_IDS).toContain(id);
      expect(SUPPLIES[id].voyage).toBe(false);
      expect(SUPPLIES[id].what).toContain(`${Math.round(WARD_CUT[id] * 100)} %`);
      expect(
        supplyUselessWhy(id, { type: 'camp', fights: true, harvest: false, hero: true, escort: 1 }),
      ).not.toBeNull();
    }
  });
});

describe('🪵 palissades : la bataille', () => {
  it('sans palissade, rien ne change (exactement `retakeBoost`)', () => {
    const p = mineAt(30);
    const a = allies(30, 3);
    expect(wardedBoost(p, a, 1, 1)).toBe(retakeBoost(p, a, 1));
    expect(garrisonHold(p, a, 1, 0)).toBe(garrisonHold(p, a, 1, null));
  });

  it('une garnison moyenne repousse nettement plus d’attaques', () => {
    for (const L of [12, 30, 60]) {
      const p = mineAt(L);
      const a = allies(L, 2);
      const none = garrisonHold(p, a, 1, 0);
      const p30 = warded(p, ['palissade', 'bastion']);
      const with30 = garrisonHold(p30, a, 1, 0);
      expect(with30).toBeGreaterThan(none + 0.1);
      const p10 = warded(p, ['palissade']);
      const with10 = garrisonHold(p10, a, 1, 0);
      expect(with10).toBeGreaterThan(none);
      expect(with30).toBeGreaterThan(with10);
    }
  }, 60_000);

  it('par-dessus le plafond de 90 %, jamais au-delà de 95 %', () => {
    for (const L of [12, 30, 60]) {
      const p = mineAt(L);
      const strong = allies(L + 20, 3);
      // Le cas existe : sans palissade, ce sont les 90 % de suspense qui mordent.
      expect(garrisonHoldChance(p, strong)).toBeGreaterThan(CONTROL.maxHold);
      const capped = garrisonHold(p, strong, 1, 0);
      expect(capped).toBeLessThanOrEqual(CONTROL.maxHold);
      const up = garrisonHold(warded(p, ['palissade', 'bastion']), strong, 1, 0);
      expect(up).toBeGreaterThan(capped);
      expect(up).toBeLessThanOrEqual(WARD.holdCap);
    }
  }, 120_000);

  it('jugée à l’heure de l’assaut : expirée avant, elle ne compte pas', () => {
    const p = mineAt(30);
    const a = allies(30, 2);
    const late = warded(p, ['bastion'], 0); // jusqu'à 24 h — l'assaut tombe à 24 h pile
    expect(retakeBattle({ seed: 1 }, late, a, 30, 1).force.size).toBe(
      retakeBattle({ seed: 1 }, p, a, 30, 1).force.size,
    );
    const inTime = warded(p, ['bastion'], 1);
    expect(retakeBattle({ seed: 1 }, inTime, a, 30, 1).force.size).toBeLessThan(
      retakeBattle({ seed: 1 }, p, a, 30, 1).force.size,
    );
  }, 60_000);

  it('la bataille et le pronostic appliquent la même troupe réduite', () => {
    const p = warded(mineAt(30), ['palissade', 'bastion'], 1);
    const a = allies(30, 2);
    const plain = retakeBattle({ seed: 1 }, mineAt(30), a, 30, 1).force.size;
    const cut = retakeBattle({ seed: 1 }, p, a, 30, 1).force.size;
    expect(cut / plain).toBeCloseTo(1 - WARD.max, 6);
  }, 60_000);
});

describe('🪵 palissades : la carte', () => {
  it('ne signale que les lieux TENUS sous palissade encore debout', () => {
    const held = mineAt(30);
    const lost = { ...held, id: 'x', control: { ...held.control!, owner: 'enemy' as const } };
    const w = warded(held, ['palissade'], 0);
    const map = { pois: [w, warded(lost, ['palissade'], 0), mineAt(30)] };
    expect(wardedControlKey(map, 1)).toBe(w.id);
    expect(wardedControlKey(map, WARD.durationMs)).toBe('');
    expect(wardedControlKey(null, 1)).toBe('');
  });
});
