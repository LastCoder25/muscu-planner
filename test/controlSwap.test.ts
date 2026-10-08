// ⇄ L'échange d'une place de garnison : le remplacé et le remplaçant échangent leur lieu.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlIdOf,
  ensureControls,
  settleReinforcements,
  settleReturns,
} from '@/lib/controlPoints';
import { swapBlocker, swapGarrison } from '@/lib/controlRoutes';
import { createMap, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const MINE = controlIdOf('mine');
const CAMP = controlIdOf('training');
const pt = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!;
const far = (m: ExpeditionMap) => ({
  ...m,
  pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p)),
});
/** Force une garnison telle quelle (captureControl la coupe aux places de champion). */
const withGarrison = (m: ExpeditionMap, id: string, garrison: string[]): ExpeditionMap => ({
  ...m,
  pois: m.pois.map((p) => (p.id === id ? { ...p, control: { ...p.control!, garrison } } : p)),
});
const world = (mine: string[], camp: string[] = []) => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  if (mine.length) m = captureControl(m, MINE, mine, 0, 7);
  if (camp.length) m = captureControl(m, CAMP, camp, 0, 7);
  return far(m);
};

describe('⇄ swapBlocker', () => {
  it('un membre arrivé s’échange avec la base', () => {
    expect(swapBlocker(world(['a', 'mil:1']), MINE, 'mil:1', 'b', null)).toBeNull();
  });
  it('un membre en route ou absent ne s’échange pas', () => {
    expect(swapBlocker(world(['a']), MINE, 'zz', 'b', null)).toBe('notHere');
  });
  it('depuis la base, un membre déjà sur le point n’est pas un remplaçant', () => {
    expect(swapBlocker(world(['a', 'b']), MINE, 'a', 'b', null)).toBe('same');
  });
  it('entre deux points : il faut les deux tenus et le remplaçant arrivé', () => {
    const m = world(['a'], ['c']);
    expect(swapBlocker(m, MINE, 'a', 'c', CAMP)).toBeNull();
    expect(swapBlocker(m, MINE, 'a', 'zz', CAMP)).toBe('notHere');
    expect(swapBlocker(world(['a']), MINE, 'a', 'c', CAMP)).toBe('notHeld');
    expect(swapBlocker(m, MINE, 'a', 'c', MINE)).toBe('same');
  });
  it('les places comptent APRÈS l’échange : un champion ne remplace pas un milicien si le camp est plein de champions', () => {
    // Le camp garde 3 champions : un 4ᵉ champion n'y entre pas, même contre un milicien.
    const m = withGarrison(world(['a'], ['c1']), CAMP, ['c1', 'c2', 'c3', 'mil:9']);
    expect(swapBlocker(m, MINE, 'a', 'mil:9', CAMP)).toBe('full');
    // Un milicien contre un milicien, lui, passe.
    const m2 = withGarrison(world(['a', 'mil:1'], ['c1']), CAMP, ['c1', 'c2', 'c3', 'mil:9']);
    expect(swapBlocker(m2, MINE, 'mil:1', 'mil:9', CAMP)).toBeNull();
  });
  it('le héros compte pour 2 : héros + 1 champion au camp, un 2ᵉ champion n’entre pas contre un milicien', () => {
    const m0 = withGarrison(world(['a'], ['c1']), CAMP, ['c1', 'mil:8', 'mil:9']);
    const m = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === CAMP ? { ...p, control: { ...p.control!, hero: true } } : p,
      ),
    };
    expect(swapBlocker(m, CAMP, 'mil:9', 'b', null)).toBe('full');
    expect(swapBlocker(m0, CAMP, 'mil:9', 'b', null)).toBeNull();
  });
  it('une place gardée à un sortant reste prise', () => {
    const m0 = withGarrison(world(['a'], ['c1']), CAMP, ['c1', 'c2', 'mil:9']);
    const m = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === CAMP ? { ...p, control: { ...p.control!, away: ['c3'] } } : p,
      ),
    };
    expect(swapBlocker(m, CAMP, 'mil:9', 'b', null)).toBe('full');
  });
});

describe('⇄ swapGarrison', () => {
  it('depuis la base : le remplacé rentre, le remplaçant prend sa place à son arrivée', () => {
    const m = swapGarrison(world(['a', 'mil:1']), {
      pointId: MINE,
      outId: 'mil:1',
      outAt: 2 * H,
      inId: 'b',
      inAt: 3 * H,
      now: 0,
      playerLevel: L,
    });
    const c = pt(m, MINE).control!;
    expect(c.garrison).toEqual(['a']);
    expect(c.returning?.map((r) => r.id)).toEqual(['mil:1']);
    expect(c.reinforcing?.map((r) => r.id)).toEqual(['b']);
    const after = settleReinforcements(m, 3 * H, L);
    expect(pt(after, MINE).control!.garrison).toEqual(['a', 'b']);
    expect(settleReturns(after, 3 * H).militiaHome).toBe(1);
  });
  it('entre deux points : chacun rejoint la garnison de l’autre', () => {
    const m = swapGarrison(world(['a', 'mil:1'], ['c']), {
      pointId: MINE,
      outId: 'mil:1',
      outAt: 2 * H,
      inId: 'c',
      inAt: 3 * H,
      now: 0,
      playerLevel: L,
      fromId: CAMP,
    });
    const after = settleReinforcements(m, 3 * H, L);
    expect(pt(after, MINE).control!.garrison.sort()).toEqual(['a', 'c']);
    expect(pt(after, CAMP).control!.garrison).toEqual(['mil:1']);
    // Et personne ne rentre à la base.
    expect(pt(after, MINE).control!.returning ?? []).toEqual([]);
  });
});
