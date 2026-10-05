import { describe, expect, it } from 'vitest';
import { heroWalk } from '@/lib/islandConquest';
import type { ExpeditionMap, Poi } from '@/lib/expedition';

// 🧭 Signalé : la ligne des disponibilités disait le héros « dispo » pendant qu'il marchait
// vers l'Ossuaire. `heroWalk` dit quand il arrive, qu'il aille se poster ou rentre à la base.
const NOW = 1_000_000;
const unit = { name: 'Last', level: 38, combatant: {} } as never;

function post(coming?: { at: number }, owner: 'player' | 'enemy' = 'player'): Poi {
  return {
    id: 'ctl_ossuary',
    type: 'control',
    control: {
      kind: 'ossuary',
      owner,
      garrison: [],
      ...(coming ? { heroComing: { at: coming.at, from: NOW - 1000, unit } } : {}),
    },
  } as unknown as Poi;
}
const map = (pois: Poi[], heroReturnAt?: number) =>
  ({ pois, ...(heroReturnAt !== undefined ? { heroReturnAt } : {}) }) as unknown as ExpeditionMap;

describe('heroWalk', () => {
  it('en route vers un lieu tenu : arrivée et lieu', () => {
    const w = heroWalk(map([post({ at: NOW + 60_000 })]), NOW);
    expect(w?.at).toBe(NOW + 60_000);
    expect(w?.to?.id).toBe('ctl_ossuary');
  });

  it('rentre à pied à la base', () => {
    const w = heroWalk(map([post()], NOW + 30_000), NOW);
    expect(w).toEqual({ at: NOW + 30_000, to: null });
  });

  it('arrivé, ou rien en cours : il ne marche pas', () => {
    expect(heroWalk(map([post({ at: NOW - 1 })]), NOW)).toBeNull();
    expect(heroWalk(map([post()], NOW - 1), NOW)).toBeNull();
    expect(heroWalk(map([post()]), NOW)).toBeNull();
    expect(heroWalk(null, NOW)).toBeNull();
  });

  it("un lieu repris par l'ennemi ne compte pas", () => {
    expect(heroWalk(map([post({ at: NOW + 60_000 }, 'enemy')]), NOW)).toBeNull();
  });
});
