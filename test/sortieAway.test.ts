// ⚔️🏰 Une sortie garde sa place sur son point fixe (2026-09-30, demandé : « leur garder leur
// slot avec un affichage adapté »).
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlFreeSeats,
  controlIdOf,
  controlRoster,
  ensureControls,
  freeAway,
  loseControl,
  pruneAway,
  reinforceBlocker,
  seatsOf,
  sortieLeaves,
} from '@/lib/controlPoints';
import { rejoinHome, sortieAwayKeeper } from '@/lib/controlRoutes';
import { createMap, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const MINE = controlIdOf('mine');
const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === MINE)!.control!;
const world = (ids: string[]) => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  m = captureControl(m, MINE, ids, 0, 7);
  return {
    ...m,
    pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p)),
  };
};
const full = () => Array.from({ length: seatsOf('mine') }, (_, i) => `g${i}`);

describe('⚔️🏰 sortieLeaves : la place reste prise', () => {
  it('le sortant quitte la garnison mais garde sa place', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    expect(ctl(m).garrison).not.toContain('g0');
    expect(ctl(m).away).toEqual(['g0']);
    expect(controlFreeSeats(ctl(m))).toBe(0);
    expect(reinforceBlocker(ctl(m), 1)).toBe('full');
  });
  it('sans la règle, sa place serait libre (témoin)', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    expect(controlFreeSeats(ctl(freeAway(m, MINE, ['g0'])))).toBe(1);
  });
  it('au retour, il reprend SA place même si tout le reste est plein', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    const r = rejoinHome(m, MINE, ['g0'], 5 * H);
    expect(r.back).toEqual(['g0']);
    expect(r.out).toEqual([]);
    expect(ctl(r.map).away).toBeUndefined();
  });
  it('un point perdu efface les places gardées', () => {
    const m = loseControl(sortieLeaves(world(full()), MINE, ['g0'], H, L), MINE, L, 2 * H);
    expect(ctl(m).away).toBeUndefined();
  });
  it('la liste des places fortes montre le sortant, pas une place libre', () => {
    const m = sortieLeaves(world(['a', 'b']), MINE, ['a'], H, L);
    const row = controlRoster(m, [], 2 * H, L).find((r) => r.poi.id === MINE)!;
    expect(row.away).toEqual(['a']);
    expect(row.garrison).toEqual(['b']);
  });
});

describe('⚔️🏰 pruneAway : seule une place attendue reste gardée', () => {
  const trip = (homeId: string, returnAt: number, escort: string[]) => ({
    homeId,
    returnAt,
    outcome: { party: { escort } },
  });
  it('garde qui revient, libère le blessé parti à la base et le posté ailleurs', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0', 'g1', 'g2'], H, L);
    const keeper = sortieAwayKeeper(
      [trip(MINE, 9 * H, ['g0', 'g1', 'g2'])],
      [],
      [
        { id: 'g0', busyUntil: 9 * H },
        { id: 'g1', busyUntil: 7 * H }, // renvoyé à la base : son retour n'est plus celui du voyage
        { id: 'g2', busyUntil: 9 * H, posted: 'ailleurs' },
      ],
    );
    expect(ctl(pruneAway(m, keeper)).away).toEqual(['g0']);
  });
  it('un groupe d’attaque combinée déjà parti garde sa place avant que le voyage existe', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    const keeper = sortieAwayKeeper(
      [],
      [{ originId: MINE, state: 'gone', gone: ['g0'] }],
      [{ id: 'g0', busyUntil: 9 * H }],
    );
    expect(ctl(pruneAway(m, keeper)).away).toEqual(['g0']);
  });
  it('plus aucun voyage : la place se libère', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    expect(ctl(pruneAway(m, sortieAwayKeeper([], [], [{ id: 'g0' }]))).away).toBeUndefined();
  });
  it('rien à retirer : la MÊME carte (le store n’écrit pas à vide)', () => {
    const m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    const keeper = sortieAwayKeeper(
      [trip(MINE, 9 * H, ['g0'])],
      [],
      [{ id: 'g0', busyUntil: 9 * H }],
    );
    expect(pruneAway(m, keeper)).toBe(m);
    expect(freeAway(m, MINE, ['zz'])).toBe(m);
  });
});
