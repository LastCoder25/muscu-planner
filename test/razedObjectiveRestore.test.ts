import { describe, expect, it } from 'vitest';
import { ISLAND_OUTPOST_LEVEL, archipelOn, islandPacified } from '@/lib/archipelago';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  ensureIslandConquest,
  objectiveIdOf,
  razeIslandTarget,
  takeFortress,
  takeObjective,
} from '@/lib/islandConquest';

/**
 * 🏳️ Signalé : « un avant-poste ennemi que j'ai pris hier a disparu de la carte ». Pris avant
 * la v1.31, un objectif était RASÉ (il quittait la carte) ; il revient, tenu par le joueur.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const LV = 18;
function island1(): ExpeditionMap {
  const m = createMap(7, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const obj = (m: ExpeditionMap, i: number) => m.pois.find((p) => p.id === objectiveIdOf(i));

describe('🏳️ un objectif rasé sous l’ancienne règle revient, tenu', () => {
  it('le cas signalé : obj 0 rasé (ancien), obj 1 tenu, forteresse prise — obj 0 revient à nous', () => {
    let m = island1();
    const spot = { x: obj(m, 0)!.x, y: obj(m, 0)!.y };
    m = razeIslandTarget(m, objectiveIdOf(0), NOW); // ⚠️ l'ancienne prise : rasé
    expect(obj(m, 0)).toBeUndefined();
    m = takeObjective(m, objectiveIdOf(1), ['b'], NOW + 1000);
    m = takeFortress(m, ['c'], false, NOW + 2000);
    expect(islandPacified(m)).toBe(true);
    const healed = ensureIslandConquest(m, NOW + 3000, LV);
    const o = obj(healed, 0)!;
    expect(o).toBeDefined();
    expect(o.control!.owner).toBe('player');
    expect(o.control!.garrison).toEqual([]);
    expect(o.control!.attackAt).toBeUndefined();
    expect({ x: o.x, y: o.y }).toEqual(spot);
    // Toujours compté abattu : l'île reste pacifiée.
    expect(islandPacified(healed)).toBe(true);
    expect(obj(healed, 1)!.control!.garrison).toEqual(['b']);
    // Idempotent : un second passage ne le duplique pas.
    const again = ensureIslandConquest(healed, NOW + 4000, LV);
    expect(again.pois.filter((p) => p.id === objectiveIdOf(0))).toHaveLength(1);
  });
  it('rien à restaurer quand l’objectif est tenu ou encore ennemi', () => {
    const m = island1();
    const n = m.pois.length;
    expect(ensureIslandConquest(m, NOW + 1000, LV).pois.length).toBe(n);
    const t = takeObjective(m, objectiveIdOf(0), ['a'], NOW);
    const h = ensureIslandConquest(t, NOW + 1000, LV);
    expect(h.pois.filter((p) => p.id === objectiveIdOf(0))).toHaveLength(1);
    expect(obj(h, 0)!.control!.garrison).toEqual(['a']);
  });
});
