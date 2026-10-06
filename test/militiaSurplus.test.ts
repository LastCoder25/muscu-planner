// 🛡️ Des miliciens partent vers un lieu fixe même s'il est plein (2026-10-06, demandé :
// « envoyer les miliciens avant que les champions ne partent pour réduire la fenêtre où le lieu
// sera vide ») : à l'arrivée, ils s'installent s'il y a de la place (sortie partie, places
// libres), sinon ils font demi-tour.
import { describe, expect, it } from 'vitest';
import {
  acceptsMilitia,
  baseSendBlocker,
  captureControl,
  controlFreeSeats,
  controlIdOf,
  ensureControls,
  reinforceBlocker,
  reinforceControl,
  seatsOf,
  settleReinforcements,
  sortieLeaves,
} from '@/lib/controlPoints';
import { createMap, type ControlState, type ExpeditionMap } from '@/lib/expedition';
import {
  emptyReinfSelection,
  reinfCanAdd,
  reinfMilitiaOver,
  setReinfMilitia,
  toggleReinfChamp,
} from '@/lib/reinforceSelection';

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

describe('🛡️ partir vers un lieu plein', () => {
  it('des miliciens peuvent partir vers un lieu plein, pas des champions', () => {
    const c = ctl(world(full()));
    expect(reinforceBlocker(c, 3, true)).toBeNull();
    expect(baseSendBlocker(c, 0, 3)).toBeNull();
    expect(reinforceBlocker(c, 1)).toBe('full');
  });
  it('jamais vers un objectif, la forteresse ou la citadelle', () => {
    for (const kind of ['objective', 'fortress', 'citadel'] as const) {
      const c = { owner: 'player', kind, garrison: [] } as unknown as ControlState;
      expect(acceptsMilitia(c)).toBe(false);
      expect(reinforceBlocker(c, 1, true)).toBe('noMilitia');
      expect(baseSendBlocker(c, 0, 1)).toBe('noMilitia');
    }
  });
  it('toujours plein à l’arrivée : demi-tour, à pied vers la base', () => {
    const m = settle(reinforceControl(world(full()), MINE, ['mil:1'], 2 * H, H), 2 * H);
    expect(ctl(m).garrison).toEqual(full());
    expect(ctl(m).returning).toEqual([{ id: 'mil:1', from: 2 * H, at: 2 * H + LEG }]);
  });
  it('les champions sont partis en sortie entre-temps : ils s’installent', () => {
    let m = reinforceControl(world(full()), MINE, ['mil:1', 'mil:2'], 2 * H, 0);
    m = sortieLeaves(m, MINE, ['g0', 'g1'], H, L);
    m = settle(m, 2 * H);
    expect(ctl(m).garrison).toEqual(['g2', 'g3', 'g4', 'mil:1', 'mil:2']);
    expect(ctl(m).returning).toBeUndefined();
  });
  it('autant s’installent qu’il y a de places, les autres font demi-tour', () => {
    const m = settle(
      reinforceControl(world(['a', 'b', 'c']), MINE, ['mil:1', 'mil:2', 'mil:3', 'mil:4'], H, 0),
      H,
    );
    expect(ctl(m).garrison).toEqual(['a', 'b', 'c', 'mil:1', 'mil:2']);
    expect(ctl(m).returning?.map((r) => r.id)).toEqual(['mil:3', 'mil:4']);
  });
  it('des miliciens en route ne prennent la place d’aucun champion', () => {
    const m = reinforceControl(world(['a', 'b', 'c', 'd']), MINE, ['mil:1'], 2 * H, 0);
    expect(controlFreeSeats(ctl(m))).toBe(1);
  });
  it('un champion qui arrive après eux reprend la place : le dernier milicien rentre à pied', () => {
    let m = reinforceControl(world(['a', 'b', 'c', 'd']), MINE, ['mil:1'], H, 0);
    m = reinforceControl(m, MINE, ['e'], 2 * H, 0);
    m = settle(m, 3 * H);
    expect(ctl(m).garrison).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ctl(m).returning).toEqual([{ id: 'mil:1', from: 2 * H, at: 2 * H + LEG }]);
  });
});

describe('➕ le renfort rapide : les miliciens de la base au-delà des places', () => {
  const free = { champ: 1, total: 2, mil: 2, milAnyway: true };
  it('le nombre de miliciens n’est borné que par la base', () => {
    expect(setReinfMilitia(emptyReinfSelection(), 9, 6, free).militia).toBe(6);
    expect(
      setReinfMilitia(emptyReinfSelection(), 9, 6, { ...free, milAnyway: false }).militia,
    ).toBe(2);
  });
  it('ils ne prennent pas la place d’un champion de la sélection', () => {
    const s = setReinfMilitia(emptyReinfSelection(), 5, 6, free);
    expect(reinfCanAdd(s, 'champ', free)).toBe(true);
    expect(toggleReinfChamp(s, 'a', free).champs).toEqual(['a']);
  });
  it('dit combien partent au-delà des places libres d’aujourd’hui', () => {
    let s = setReinfMilitia(emptyReinfSelection(), 5, 6, free);
    expect(reinfMilitiaOver(s, free)).toBe(3);
    s = toggleReinfChamp(s, 'a', free);
    expect(reinfMilitiaOver(s, free)).toBe(4);
    expect(reinfMilitiaOver(setReinfMilitia(emptyReinfSelection(), 2, 6, free), free)).toBe(0);
  });
});
