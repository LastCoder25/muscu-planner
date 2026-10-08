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
import { transferBlocker, transferGarrison } from '@/lib/controlRoutes';
import { createMap, type ControlState, type ExpeditionMap } from '@/lib/expedition';
import {
  emptyReinfSelection,
  reinfCanAdd,
  reinfMilitiaOver,
  setReinfMilitia,
  toggleReinfChamp,
  toggleReinfTransfer,
} from '@/lib/reinforceSelection';
import { MILITIA } from '@/lib/militia';

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
/** Remplace la garnison d'un point (miliciens compris). */
const withGarrison = (m: ExpeditionMap, id: string, garrison: string[]): ExpeditionMap => ({
  ...m,
  pois: m.pois.map((p) => (p.id === id ? { ...p, control: { ...p.control!, garrison } } : p)),
});
/** Les places de milice d'une mine, toutes prises. */
const fullMil = () => Array.from({ length: MILITIA.perPoint }, (_, i) => `mil:m${i}`);

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
  it('places de milice toujours pleines à l’arrivée : demi-tour, à pied vers la base', () => {
    const start = withGarrison(world(full()), MINE, [...full(), ...fullMil()]);
    const m = settle(reinforceControl(start, MINE, ['mil:1'], 2 * H, H), 2 * H);
    expect(ctl(m).garrison).toEqual([...full(), ...fullMil()]);
    expect(ctl(m).returning).toEqual([{ id: 'mil:1', from: 2 * H, at: 2 * H + LEG }]);
  });
  it('une mine pleine de CHAMPIONS : les miliciens s’installent quand même (places à part)', () => {
    let m = reinforceControl(world(full()), MINE, ['mil:1', 'mil:2'], 2 * H, 0);
    m = settle(m, 2 * H);
    expect(ctl(m).garrison).toEqual([...full(), 'mil:1', 'mil:2']);
    expect(ctl(m).returning).toBeUndefined();
  });
  it('une sortie des champions ne change rien aux places de milice', () => {
    let m = reinforceControl(world(full()), MINE, ['mil:1', 'mil:2'], 2 * H, 0);
    m = sortieLeaves(m, MINE, ['g0', 'g1'], H, L);
    m = settle(m, 2 * H);
    expect(ctl(m).garrison).toEqual(['g2', 'g3', 'g4', 'mil:1', 'mil:2']);
    expect(ctl(m).returning).toBeUndefined();
  });
  it('autant s’installent qu’il y a de places de milice, les autres font demi-tour', () => {
    const start = withGarrison(world(['a', 'b', 'c']), MINE, [
      'a',
      'b',
      'c',
      'mil:x',
      'mil:y',
      'mil:z',
    ]);
    const m = settle(reinforceControl(start, MINE, ['mil:1', 'mil:2', 'mil:3', 'mil:4'], H, 0), H);
    expect(ctl(m).garrison).toEqual(['a', 'b', 'c', 'mil:x', 'mil:y', 'mil:z', 'mil:1', 'mil:2']);
    expect(ctl(m).returning?.map((r) => r.id)).toEqual(['mil:3', 'mil:4']);
  });
  it('des miliciens en route ne prennent la place d’aucun champion', () => {
    const m = reinforceControl(world(['a', 'b', 'c', 'd']), MINE, ['mil:1'], 2 * H, 0);
    expect(controlFreeSeats(ctl(m))).toBe(1);
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

// ⇄ Depuis la garnison d'un AUTRE lieu (2026-10-06, demandé : « depuis la garnison du lieu en
// question aussi ») : même règle que depuis la base.
describe('⇄ transférer des miliciens vers un lieu plein', () => {
  const CAMP = controlIdOf('training');
  const two = (mine: string[], camp: string[]) => captureControl(world(mine), CAMP, camp, 0, 7);
  const campOf = (m: ExpeditionMap) => m.pois.find((p) => p.id === CAMP)!.control!;
  const campFull = () => Array.from({ length: seatsOf('training') }, (_, i) => `c${i}`);
  it('des miliciens partent vers un lieu plein, pas des champions', () => {
    const m = two(['a', 'mil:1', 'mil:2'], campFull());
    expect(transferBlocker(m, MINE, CAMP, ['mil:1', 'mil:2'])).toBeNull();
    expect(transferBlocker(m, MINE, CAMP, ['a'])).toBe('full');
    expect(transferBlocker(m, MINE, CAMP, ['a', 'mil:1'])).toBe('full');
  });
  it('les miliciens transférés font demi-tour vers la base si c’est encore plein', () => {
    let m = two(['a', 'mil:1'], campFull());
    m = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === CAMP
          ? { ...p, control: { ...p.control!, garrison: [...campFull(), ...fullMil()] } }
          : p,
      ),
    };
    m = transferGarrison(m, {
      fromId: MINE,
      toId: CAMP,
      now: 0,
      playerLevel: L,
      champs: { ids: [], at: 0 },
      militia: { ids: ['mil:1'], at: H },
    });
    expect(ctl(m).garrison).toEqual(['a']);
    m = settle(m, H);
    expect(campOf(m).garrison).not.toContain('mil:1');
    expect(campOf(m).returning).toEqual([{ id: 'mil:1', from: H, at: H + LEG }]);
  });
  it('le renfort rapide les laisse partir et les compte en trop', () => {
    const free = { champ: 0, total: 0, mil: 0, milAnyway: true };
    const s = toggleReinfTransfer(emptyReinfSelection(), MINE, 'mil:1', free);
    expect(s.transfers).toEqual([{ fromId: MINE, id: 'mil:1' }]);
    expect(reinfMilitiaOver(s, free)).toBe(1);
    expect(toggleReinfTransfer(emptyReinfSelection(), MINE, 'a', free).transfers).toEqual([]);
  });
  it('sans `milAnyway`, un milicien transféré prend une place aux miliciens de la base', () => {
    const free = { champ: 2, total: 2, mil: 2 };
    const s = toggleReinfTransfer(emptyReinfSelection(), MINE, 'mil:1', free);
    expect(setReinfMilitia(s, 5, 6, free).militia).toBe(1);
  });
});
