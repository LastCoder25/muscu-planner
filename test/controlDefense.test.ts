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
  militiaSeatsOf,
} from '@/lib/controlPoints';
import { createMap, type ControlState, type Poi, type PostedHero } from '@/lib/expedition';
import { partyAllies, refChampionAdv } from '@/lib/caravan';
import { militiaUnits } from '@/lib/militia';
import { refFighter } from '@/lib/proceduralContent';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { ensureIslandConquest, objectiveIdOf, takeObjective } from '@/lib/islandConquest';

const H = 3_600_000;
const NOW = 1_000 * H;
const HERO: PostedHero = { name: 'Toi', level: 30, combatant: refFighter(30) };
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
  // 🛡️ 2026-10-08 (décision de l'utilisateur) : sur un lieu de production, SEULS LES
  // MILICIENS défendent. Champions et héros y restent postés et produisent, sans combattre.
  it('vaut exactement `garrisonHold` au niveau du héros, sur ses seuls miliciens', () => {
    const ids = ['a0', 'mil:1', 'mil:2'];
    const want = garrisonHold({ ...p, level: L }, militiaUnits(ids, L), 1);
    expect(want).toBeGreaterThan(0);
    expect(controlDefenseHold(p, ids, advs, kit, L, 1, null)).toBe(want);
  });
  it('un champion ou le héros posté n’ajoute RIEN à la tenue d’un lieu de production', () => {
    const mil = controlDefenseHold(p, ['mil:1'], advs, kit, L, 1, null);
    expect(controlDefenseHold(p, ['a0', 'a1', 'mil:1'], advs, kit, L, 1, null)).toBe(mil);
    expect(controlDefenseHold(p, ['mil:1'], advs, kit, L, 1, HERO)).toBe(mil);
    // Sans milicien, personne ne la défend : champions et héros compris.
    expect(controlDefenseHold(p, ['a0', 'a1'], advs, kit, L, 1, HERO)).toBe(0);
  });
  it('un milicien de plus ne fait jamais baisser la tenue, personne = 0', () => {
    const one = controlDefenseHold(p, ['mil:1'], advs, kit, L, 1, null);
    const two = controlDefenseHold(p, ['mil:1', 'mil:2'], advs, kit, L, 1, null);
    expect(two).toBeGreaterThanOrEqual(one);
    expect(controlDefenseHold(p, [], advs, kit, L, 1, null)).toBe(0);
  });
});

describe('controlDefenseHold — là où aucune milice ne va, les champions défendent', () => {
  // 🏝️ Un objectif d'île pris : aucun milicien n'y va (`militiaSeatsOf` = 0), donc sa
  // garnison de champions (et le héros) le défend toujours.
  const lv = archipelOn(1).levelCap;
  const isl = ensureIslandConquest(
    ensureControls(
      createMap(7, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1)),
      NOW,
      lv,
      ISLAND_OUTPOST_LEVEL,
    ),
    NOW,
    lv,
  );
  const OBJ = objectiveIdOf(0);
  const o = takeObjective(isl, OBJ, ['a0'], NOW).pois.find((q) => q.id === OBJ)!;
  const advs = [0, 1].map((i) => ({ ...refChampionAdv(lv, i), id: `a${i}` }));
  const kit = { advGear: [] };
  it('les champions postés comptent : exactement `garrisonHold` sur `partyAllies`', () => {
    expect(militiaSeatsOf('objective')).toBe(0);
    const want = garrisonHold({ ...o, level: lv }, partyAllies([advs[0]!], kit, null), 1);
    expect(want).toBeGreaterThan(0);
    expect(controlDefenseHold(o, ['a0'], advs, kit, lv, 1, null)).toBe(want);
  });
  it('le héros posté y compte aussi', () => {
    const hero: PostedHero = { name: 'Toi', level: lv, combatant: refFighter(lv) };
    const withHero = controlDefenseHold(o, ['a0'], advs, kit, lv, 1, hero);
    expect(withHero).toBe(garrisonHold({ ...o, level: lv }, partyAllies([advs[0]!], kit, hero), 1));
    expect(withHero).toBeGreaterThan(controlDefenseHold(o, ['a0'], advs, kit, lv, 1, null));
    // Le héros seul, sans champion, le tient aussi.
    expect(controlDefenseHold(o, [], advs, kit, lv, 1, hero)).toBeGreaterThan(0);
  });
});
