// 🏰 Points de contrôle : voir qui l'occupe, en ramener une partie, envoyer des renforts.
import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  controlFreeSeats,
  controlIdOf,
  controlSeats,
  controlStock,
  ensureControls,
  reinforceBlocker,
  reinforceControl,
  releaseFromControl,
  settleReinforcements,
} from '@/lib/controlPoints';
import { createMap, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const ID = controlIdOf('mine');
const L = 30;
const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === ID)!;
/** Tenu par `g` depuis 0, attaque repoussée très loin (on teste la production). */
const held = (g: string[]) => {
  const m = captureControl(ensureControls(createMap(3, 0, L, 1), 0, L), ID, g, 0);
  return {
    ...m,
    pois: m.pois.map((p) =>
      p.id === ID ? { ...p, control: { ...p.control!, attackAt: 9e15 } } : p,
    ),
  };
};

describe('🏰 renforts', () => {
  it('les places libres comptent la garnison ET les renforts en route', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 2 * H);
    expect(controlSeats(ctl(m).control)).toBe(2);
    expect(controlFreeSeats(ctl(m).control)).toBe(CONTROL.maxGarrison - 2);
    expect(reinforceBlocker(ctl(m).control, 1)).toBeNull();
    expect(reinforceBlocker(ctl(m).control, 2)).toBe('full');
    expect(reinforceBlocker(ctl(m).control, 0)).toBe('empty');
  });
  it('un point ennemi ne reçoit aucun renfort', () => {
    const enemy = ensureControls(createMap(3, 0, L, 1), 0, L);
    expect(controlFreeSeats(ctl(enemy).control)).toBe(0);
    expect(reinforceBlocker(ctl(enemy).control, 1)).toBe('notHeld');
  });
  it('un renfort ne rejoint la garnison qu’à son arrivée', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 2 * H);
    expect(settleReinforcements(m, H, L)).toBe(m); // rien n'arrive : même carte
    const s = ctl(settleReinforcements(m, 2 * H, L)).control!;
    expect(s.garrison).toEqual(['a', 'b']);
    expect(s.reinforcing).toEqual([]);
  });
  it('en route, il ne combat pas : pas d’arrivée après une attaque due', () => {
    const m0 = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    const m = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, attackAt: 3 * H } } : p,
      ),
    };
    expect(ctl(settleReinforcements(m, 10 * H, L)).control!.garrison).toEqual(['a']);
  });
  it('la production garde le passé au débit d’avant, puis suit le nouvel effectif', () => {
    const solo = held(['a']);
    const m = settleReinforcements(reinforceControl(solo, ID, ['b'], 4 * H), 4 * H, L);
    const before = controlStock(ctl(solo), 4 * H, L);
    // À l'arrivée : exactement ce que le solo avait produit.
    expect(controlStock(ctl(m), 4 * H, L)).toBe(before);
    // Ensuite, deux produisent plus vite qu'un.
    const gainDuo = controlStock(ctl(m), 8 * H, L) - before;
    const gainSolo = controlStock(ctl(solo), 8 * H, L) - before;
    expect(gainDuo).toBeGreaterThan(gainSolo);
  });
});

describe('🏰 ramener une partie de la garnison', () => {
  it('ramène les choisis, garde les autres et l’or produit', () => {
    const m = held(['a', 'b', 'c']);
    const stock = controlStock(ctl(m), 6 * H, L);
    const r = releaseFromControl(m, ID, ['b'], 6 * H, L);
    expect(r.emptied).toBe(false);
    expect(ctl(r.map).control!.garrison).toEqual(['a', 'c']);
    expect(controlStock(ctl(r.map), 6 * H, L)).toBe(stock);
    expect(controlFreeSeats(ctl(r.map).control)).toBe(1); // la place se libère
  });
  it('peut ramener un renfort encore en route', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    const r = releaseFromControl(m, ID, ['b'], H, L);
    expect(ctl(r.map).control!.reinforcing).toEqual([]);
    expect(r.emptied).toBe(false);
  });
  it('ramener le dernier vide le point (le store le rend à l’ennemi)', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    expect(releaseFromControl(m, ID, ['a'], H, L).emptied).toBe(false);
    expect(releaseFromControl(m, ID, ['a', 'b'], H, L).emptied).toBe(true);
  });
});
