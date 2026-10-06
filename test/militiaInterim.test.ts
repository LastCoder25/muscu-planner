// 🛡️⚔️ Des miliciens tiennent en intérim les places gardées des champions en sortie
// (2026-10-06, demandé : « défendre des lieux fixes vides avec ses miliciens même si les
// champions en poste sont en attaque à l'extérieur » ; « les miliciens délogés retournent à la
// base à pied »).
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlFreeSeats,
  controlIdOf,
  ensureControls,
  garrisonFreeSeats,
  interimSeats,
  militiaFreeSeats,
  reinforceBlocker,
  reinforceControl,
  seatsOf,
  settleReinforcements,
  settleReturns,
  sortieLeaves,
} from '@/lib/controlPoints';
import { rejoinHome } from '@/lib/controlRoutes';
import { createMap, type ControlState, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const LEG = 1000;
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
const settle = (m: ExpeditionMap, t: number) => settleReinforcements(m, t, L, () => LEG);
/** Tous les champions de la mine partent en sortie, deux miliciens arrivent à 2 h. */
const covered = () => {
  const out = sortieLeaves(world(full()), MINE, full(), H, L);
  return settle(reinforceControl(out, MINE, ['mil:1', 'mil:2'], 2 * H, H), 2 * H);
};

describe('🛡️ interimSeats : une place gardée s’ouvre aux miliciens', () => {
  it('le lieu vidé par la sortie accepte des miliciens, pas d’autres champions', () => {
    const c = ctl(sortieLeaves(world(full()), MINE, full(), H, L));
    expect(interimSeats(c)).toBe(seatsOf('mine'));
    expect(militiaFreeSeats(c)).toBe(seatsOf('mine'));
    expect(controlFreeSeats(c)).toBe(0);
    expect(reinforceBlocker(c, 1)).toBe('full');
    expect(reinforceBlocker(c, 2, true)).toBeNull();
  });
  it('les miliciens arrivés défendent la place (ils sont en garnison)', () => {
    expect(ctl(covered()).garrison).toEqual(['mil:1', 'mil:2']);
  });
  it('jamais plus de places que la garnison de 5, intérim compris', () => {
    const c = ctl(covered());
    expect(garrisonFreeSeats(c)).toBe(seatsOf('mine') - 2);
  });
  it('rien sans sortie', () => {
    expect(interimSeats(ctl(world(['a'])))).toBe(0);
  });
  it('jamais dans un objectif, la forteresse ou la citadelle', () => {
    for (const kind of ['objective', 'fortress', 'citadel'] as const) {
      const c = { owner: 'player', kind, garrison: [], away: ['a'] } as unknown as ControlState;
      expect(interimSeats(c)).toBe(0);
      expect(militiaFreeSeats(c)).toBe(0);
    }
  });
});

describe('🏠 au retour, le champion reprend sa place et déloge le milicien', () => {
  it('tous les sortants reprennent leur poste, même si des miliciens tiennent les places', () => {
    const r = rejoinHome(covered(), MINE, full(), 5 * H);
    expect(r.back).toEqual(full());
    expect(r.out).toEqual([]);
  });
  it('les miliciens délogés rentrent à pied, les derniers arrivés d’abord', () => {
    const m = settle(rejoinHome(covered(), MINE, full(), 5 * H).map, 5 * H);
    expect(ctl(m).garrison).toEqual(full());
    expect(ctl(m).returning).toEqual([
      { id: 'mil:2', from: 5 * H, at: 5 * H + LEG },
      { id: 'mil:1', from: 5 * H, at: 5 * H + LEG },
    ]);
  });
  it('arrivés à la base, ils y redeviennent disponibles', () => {
    const m = settle(rejoinHome(covered(), MINE, full(), 5 * H).map, 5 * H);
    expect(settleReturns(m, 5 * H + LEG).militiaHome).toBe(2);
  });
  it('personne n’est délogé tant que la garnison de 5 n’est pas pleine', () => {
    let m = sortieLeaves(world(['a', 'b', 'c']), MINE, ['c'], H, L);
    m = settle(reinforceControl(m, MINE, ['mil:1'], 2 * H, H), 2 * H);
    m = settle(rejoinHome(m, MINE, ['c'], 5 * H).map, 5 * H);
    expect(ctl(m).garrison).toEqual(['a', 'b', 'mil:1', 'c']);
    expect(ctl(m).returning).toBeUndefined();
  });
  it('un milicien qui arrive après le retour du champion rentre à pied, il ne disparaît pas', () => {
    let m = sortieLeaves(world(full()), MINE, ['g0'], H, L);
    m = reinforceControl(m, MINE, ['mil:1'], 6 * H, H);
    m = settle(rejoinHome(m, MINE, ['g0'], 5 * H).map, 7 * H);
    expect(ctl(m).garrison).toHaveLength(seatsOf('mine'));
    expect(ctl(m).garrison).not.toContain('mil:1');
    expect(ctl(m).returning).toEqual([{ id: 'mil:1', from: 6 * H, at: 6 * H + LEG }]);
  });
  it('déloger un milicien ne crée pas de place de champion : aucun milicien n’est renvoyé pour rien', () => {
    const G = controlIdOf('training');
    let m = ensureControls(createMap(3, 0, L, 1), 0, L);
    m = captureControl(m, G, ['a', 'b', 'c'], 0, 7);
    m = reinforceControl(m, G, ['mil:1', 'mil:2'], H, 0);
    m = reinforceControl(m, G, ['d'], 2 * H, 0); // le camp n'a que 3 places de champion
    expect(seatsOf('training')).toBe(3);
    const c = settle(
      {
        ...m,
        pois: m.pois.map((p) =>
          p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p,
        ),
      },
      3 * H,
    ).pois.find((p) => p.id === G)!.control!;
    expect(c.garrison).toEqual(['a', 'b', 'c', 'mil:1', 'mil:2']);
    expect(c.returning).toBeUndefined();
  });
  it('un champion sans place gardée ne déloge personne : il rentre à la base', () => {
    const r = rejoinHome(covered(), MINE, [...full(), 'x'], 5 * H);
    expect(r.out).toEqual(['x']);
  });
});
