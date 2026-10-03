// 🛡️ La tenue d'un lieu fixe se juge sur ceux qui seront LÀ à l'heure de l'attaque : la
// garnison, plus les renforts arrivés avant — la règle de `settleReinforcements`.
import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  controlDefenseHold,
  controlIdOf,
  defendersAtAttack,
  ensureControls,
  garrisonHold,
  knownAttackAt,
} from '@/lib/controlPoints';
import { createMap, type ControlState, type Poi } from '@/lib/expedition';
import { partyAllies, refChampionAdv } from '@/lib/caravan';
import { militiaUnits } from '@/lib/militia';

const H = 3_600_000;
const NOW = 1_000 * H;
const ctl = (c: Partial<ControlState>): ControlState =>
  ({ kind: 'mine', owner: 'player', garrison: [], collectedAt: 0, ...c }) as ControlState;

describe('defendersAtAttack', () => {
  it('garde la garnison, compte les renforts arrivés à temps, écarte les retardataires', () => {
    const c = ctl({
      garrison: ['a'],
      reinforcing: [
        { id: 'b', at: NOW + H },
        { id: 'c', at: NOW + 3 * H },
      ],
    });
    const r = defendersAtAttack(c, NOW + 2 * H, [{ id: 'd', at: NOW + 2 * H }]);
    expect(r.present).toEqual(['a', 'b', 'd']);
    expect(r.late).toEqual(['c']);
  });
  it('heure inconnue : tous les renforts comptent (sinon le retard trahirait l’heure)', () => {
    const c = ctl({ garrison: ['a'], reinforcing: [{ id: 'b', at: NOW + 99 * H }] });
    expect(defendersAtAttack(c, null).present).toEqual(['a', 'b']);
  });
});

describe('knownAttackAt', () => {
  const p = (attackAt: number) => ({ id: 'x', control: ctl({ attackAt }) }) as unknown as Poi;
  it('ne révèle l’heure que dans la fenêtre imminente', () => {
    expect(knownAttackAt(p(NOW + H), NOW)).toBe(NOW + H);
    expect(knownAttackAt(p(NOW + CONTROL.imminentMs + 1), NOW)).toBeNull();
  });
});

describe('controlDefenseHold', () => {
  const L = 30;
  const m = captureControl(
    ensureControls(createMap(3, 0, L, 1), 0, L),
    controlIdOf('garden'),
    ['a0'],
    0,
    7,
  );
  const p = { ...m.pois.find((q) => q.id === controlIdOf('garden'))!, level: 1 };
  const advs = [0, 1].map((i) => ({ ...refChampionAdv(L, i), id: `a${i}` }));
  const kit = { advGear: [] };
  it('vaut exactement `garrisonHold` au niveau du héros, miliciens compris', () => {
    const ids = ['a0', 'mil:1', 'mil:2'];
    const want = garrisonHold(
      { ...p, level: L },
      [...partyAllies([advs[0]!], kit, null), ...militiaUnits(ids, L)],
      1,
    );
    expect(controlDefenseHold(p, ids, advs, kit, L, 1)).toBe(want);
  });
  it('un renfort de plus ne fait jamais baisser la tenue, personne = 0', () => {
    const one = controlDefenseHold(p, ['a0'], advs, kit, L, 1);
    const two = controlDefenseHold(p, ['a0', 'a1'], advs, kit, L, 1);
    expect(two).toBeGreaterThanOrEqual(one);
    expect(controlDefenseHold(p, [], advs, kit, L, 1)).toBe(0);
    expect(controlDefenseHold(p, ['a0', 'mil:1', 'mil:2'], advs, kit, L, 1)).toBeGreaterThanOrEqual(
      one,
    );
  });
});
