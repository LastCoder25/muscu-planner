import { describe, expect, it } from 'vitest';
import { ISLAND_OUTPOST_LEVEL, archipelOn } from '@/lib/archipelago';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import {
  baseSendBlocker,
  controlFreeSeats,
  ensureControls,
  garrisonFreeSeats,
  militiaFreeSeats,
  reinforceBlocker,
} from '@/lib/controlPoints';
import { transferBlocker } from '@/lib/controlRoutes';
import { ensureIslandConquest, objectiveIdOf, takeObjective } from '@/lib/islandConquest';
import { reinfCanAdd, setReinfMilitia, emptyReinfSelection } from '@/lib/reinforceSelection';

const NOW = Date.UTC(2026, 9, 4, 12);
const LV = 18;

/** Île 1, l'objectif 0 pris par un champion, et la mine (point de production) prise aussi. */
function setup(): { m: ExpeditionMap; obj: string; mine: string } {
  let m = createMap(7, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1));
  m = ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
  const obj = objectiveIdOf(0);
  m = takeObjective(m, obj, ['a'], NOW);
  const minePoi = m.pois.find((p) => p.control?.kind === 'mine')!;
  m = {
    ...m,
    pois: m.pois.map((p) =>
      p.id === minePoi.id
        ? { ...p, control: { ...p.control!, owner: 'player' as const, garrison: ['b', 'c'] } }
        : p,
    ),
  };
  return { m, obj, mine: minePoi.id };
}
const ctl = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!.control!;

describe('🎯 un objectif pris garde ses places de champion', () => {
  it('4 places libres sur 5 pour des champions, aucune pour un milicien', () => {
    const { m, obj } = setup();
    const c = ctl(m, obj);
    expect(garrisonFreeSeats(c)).toBe(4);
    expect(controlFreeSeats(c)).toBe(4);
    expect(militiaFreeSeats(c)).toBe(0);
    expect(reinforceBlocker(c, 4)).toBeNull();
    expect(reinforceBlocker(c, 1, true)).toBe('full');
  });

  it('on y transfère un champion d’un autre lieu, jamais un milicien', () => {
    const { m, obj, mine } = setup();
    expect(transferBlocker(m, mine, obj, ['b'])).toBeNull();
    const withMil = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === mine ? { ...p, control: { ...p.control!, garrison: ['b', 'mil:1'] } } : p,
      ),
    };
    expect(transferBlocker(withMil, mine, obj, ['mil:1'])).toBe('full');
  });

  it('depuis la base : les champions partent, les miliciens sont refusés', () => {
    const { m, obj } = setup();
    const c = ctl(m, obj);
    expect(baseSendBlocker(c, 3, 0)).toBeNull();
    expect(baseSendBlocker(c, 1, 1)).toBe('full');
  });

  it('le renfort groupé accepte les champions et refuse les miliciens', () => {
    const { m, obj } = setup();
    const c = ctl(m, obj);
    const free = {
      champ: controlFreeSeats(c),
      total: garrisonFreeSeats(c),
      mil: militiaFreeSeats(c),
    };
    const s = emptyReinfSelection();
    expect(reinfCanAdd(s, 'champ', free)).toBe(true);
    expect(reinfCanAdd(s, 'mil', free)).toBe(false);
    expect(setReinfMilitia(s, 3, 10, free).militia).toBe(0);
  });
});
