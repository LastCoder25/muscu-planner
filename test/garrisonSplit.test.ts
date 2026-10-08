// 🛡️🏰 DEUX RÉSERVES SÉPARÉES dans un lieu fixe (2026-10-08, décision de l'utilisateur : « seuls
// les miliciens défendent les lieux fixes ; champions et héros y restent postés, produisent, et
// interceptent »). Les champions et le héros prennent les places du point (`seatsOf`, le héros
// en prend 2), les miliciens les leurs (`militiaSeatsOf`) : personne ne déloge personne.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  champsDefend,
  defenderCount,
  memberDefends,
  controlAllies,
  controlFreeSeats,
  controlIdOf,
  ensureControls,
  garrisonCap,
  garrisonFreeSeats,
  militiaFreeSeats,
  militiaSeatsOf,
  reinforceBlocker,
  reinforceControl,
  seatsOf,
  sendHeroToControl,
  settleReinforcements,
  sortieLeaves,
} from '@/lib/controlPoints';
import { rejoinHome } from '@/lib/controlRoutes';
import { HERO_UNIT_ID, refChampionAdv } from '@/lib/caravan';
import { MILITIA } from '@/lib/militia';
import { refFighter } from '@/lib/proceduralContent';
import {
  emptyReinfSelection,
  reinfCanAdd,
  setReinfMilitia,
  toggleReinfChamp,
} from '@/lib/reinforceSelection';
import {
  createMap,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type PostedHero,
} from '@/lib/expedition';

const H = 3_600_000;
const L = 30;
const LEG = 1000;
const MINE = controlIdOf('mine');
const CAMP = controlIdOf('training');
const HERO: PostedHero = { name: 'Toi', level: L, combatant: refFighter(L) };
const ctlOf = (m: ExpeditionMap, id = MINE) => m.pois.find((p) => p.id === id)!.control!;
const ctl = (c: Partial<ControlState>): ControlState =>
  ({ kind: 'mine', owner: 'player', garrison: [], collectedAt: 0, ...c }) as ControlState;
const mil = (n: number, tag = 'm') => Array.from({ length: n }, (_, i) => `mil:${tag}${i}`);
const champs = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
/** Une carte où MINE (et le camp) sont à nous, avec ces garnisons, sans attaque prévue. */
const world = (mine: string[], camp?: string[]): ExpeditionMap => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  m = captureControl(m, MINE, ['seed'], 0, 7);
  if (camp) m = captureControl(m, CAMP, ['seed'], 0, 7);
  return {
    ...m,
    pois: m.pois.map((p) => {
      if (!p.control) return p;
      const garrison = p.id === MINE ? mine : p.id === CAMP && camp ? camp : p.control.garrison;
      return { ...p, control: { ...p.control, garrison, attackAt: 9e15 } };
    }),
  };
};
const settle = (m: ExpeditionMap, t: number) => settleReinforcements(m, t, L, () => LEG);

describe('🏰 (a) deux réserves de places', () => {
  it('une mine tient 5 champions ET 5 miliciens', () => {
    expect(seatsOf('mine')).toBe(5);
    expect(militiaSeatsOf('mine')).toBe(MILITIA.perPoint);
    expect(garrisonCap('mine')).toBe(10);
    const c = ctl({ garrison: [...champs(5), ...mil(5)] });
    expect(controlFreeSeats(c)).toBe(0);
    expect(militiaFreeSeats(c)).toBe(0);
    expect(garrisonFreeSeats(c)).toBe(0);
  });
  it('les champions ne prennent jamais une place de milice, ni l’inverse', () => {
    const c = ctl({ garrison: champs(5) });
    expect(militiaFreeSeats(c)).toBe(5);
    expect(reinforceBlocker(c, 1)).toBe('full');
    const d = ctl({ garrison: mil(5) });
    expect(controlFreeSeats(d)).toBe(5);
    expect(reinforceBlocker(d, 1)).toBeNull();
  });
  it('le camp d’entraînement : 3 champions + 5 miliciens', () => {
    expect(seatsOf('training')).toBe(3);
    expect(militiaSeatsOf('training')).toBe(5);
    expect(garrisonCap('training')).toBe(8);
    const c = ctl({ kind: 'training', garrison: [...champs(3), ...mil(2)] });
    expect(controlFreeSeats(c)).toBe(0);
    expect(militiaFreeSeats(c)).toBe(3);
    expect(garrisonFreeSeats(c)).toBe(3);
  });
  it('les miliciens en route prennent une place de milice, pas de champion', () => {
    const c = ctl({ garrison: champs(2), reinforcing: [{ id: 'mil:r0', at: 1 }] });
    expect(militiaFreeSeats(c)).toBe(4);
    expect(controlFreeSeats(c)).toBe(3);
  });
  it('le héros posté prend 2 places de champion, aucune de milice', () => {
    const c = ctl({ garrison: champs(1), hero: true });
    expect(controlFreeSeats(c)).toBe(5 - 1 - MILITIA.heroSeats);
    expect(militiaFreeSeats(c)).toBe(5);
  });
  it('aucun milicien sur un objectif, la forteresse ni le lapidaire', () => {
    for (const kind of ['objective', 'fortress', 'lapidary', 'citadel'] as const) {
      expect(militiaSeatsOf(kind)).toBe(0);
      expect(militiaFreeSeats(ctl({ kind }))).toBe(0);
    }
    expect(garrisonCap('objective')).toBe(seatsOf('objective'));
    expect(garrisonCap('lapidary')).toBe(1);
    expect(garrisonCap('fortress')).toBe(Infinity);
  });
  it('la sélection d’un renfort : des champions n’entament pas la place des miliciens', () => {
    // Camp vide : 3 places de champion, 5 de milice (8 au total).
    const free = { champ: 3, total: 8, mil: 5 };
    let s = emptyReinfSelection();
    for (const id of ['a', 'b', 'c']) s = toggleReinfChamp(s, id, free);
    expect(s.champs).toEqual(['a', 'b', 'c']);
    expect(setReinfMilitia(s, 9, 9, free).militia).toBe(5);
    expect(reinfCanAdd(setReinfMilitia(s, 5, 9, free), 'mil', free)).toBe(false);
  });
});

describe('🏠 (b) un champion ou le héros qui arrive ne déloge jamais un milicien', () => {
  it('un champion arrive sur une mine aux places de milice pleines : tout le monde reste', () => {
    let m = reinforceControl(world([...champs(2), ...mil(5)]), MINE, ['x'], H, 0);
    m = settle(m, 2 * H);
    expect(ctlOf(m).garrison).toEqual([...champs(2), ...mil(5), 'x']);
    expect(ctlOf(m).returning).toBeUndefined();
  });
  it('le héros arrive : il prend ses 2 places de champion, aucun milicien ne rentre', () => {
    let m = sendHeroToControl(world([...champs(2), ...mil(5)]), MINE, H, 2 * H, HERO);
    m = settle(m, 3 * H);
    expect(ctlOf(m).hero).toBe(true);
    expect(ctlOf(m).garrison).toEqual([...champs(2), ...mil(5)]);
    expect(ctlOf(m).returning).toBeUndefined();
  });
  it('des champions en sortie qui rentrent reprennent leur poste, aucun milicien ne bouge', () => {
    let m = sortieLeaves(world([...champs(5), ...mil(5)]), MINE, champs(5), H, L);
    // Leurs places de champion restent gardées : aucun autre champion ne peut les prendre.
    expect(controlFreeSeats(ctlOf(m))).toBe(0);
    expect(reinforceBlocker(ctlOf(m), 1)).toBe('full');
    const r = rejoinHome(m, MINE, champs(5), 5 * H);
    expect(r.back).toEqual(champs(5));
    m = settle(r.map, 5 * H);
    expect(ctlOf(m).garrison).toEqual([...mil(5), ...champs(5)]);
    expect(ctlOf(m).returning).toBeUndefined();
  });
  it('un champion sans place gardée rentre à la base : il ne déloge personne', () => {
    const m = sortieLeaves(world([...champs(5), ...mil(5)]), MINE, champs(5), H, L);
    expect(rejoinHome(m, MINE, [...champs(5), 'x'], 5 * H).out).toEqual(['x']);
  });
  it('un milicien qui arrive sans place de milice fait demi-tour, à pied vers la base', () => {
    let m = reinforceControl(world([...champs(1), ...mil(5)]), MINE, ['mil:n'], H, 0);
    m = settle(m, H);
    expect(ctlOf(m).garrison).not.toContain('mil:n');
    expect(ctlOf(m).returning).toEqual([{ id: 'mil:n', from: H, at: H + LEG }]);
  });
});

describe('🛡️ (c) qui défend la reprise', () => {
  const kit = { advGear: [] };
  const advs = [refChampionAdv(L, 0), refChampionAdv(L, 1)];
  const ids = [...advs.map((a) => a.id), 'mil:a', 'mil:b'];
  const allyIds = (kind: ControlKind, hero: PostedHero | null = null) =>
    controlAllies(kind, advs, kit, hero, ids, L).map((u) => u.id);

  it('sur un lieu de production, seuls les miliciens défendent', () => {
    for (const kind of ['mine', 'training', 'garden', 'tower'] as const) {
      expect(champsDefend(kind)).toBe(false);
      expect(allyIds(kind, HERO)).toEqual(['mil:a', 'mil:b']);
    }
  });
  it('sur un objectif et la forteresse, les champions et le héros défendent', () => {
    for (const kind of ['objective', 'fortress'] as const) {
      expect(champsDefend(kind)).toBe(true);
      const got = allyIds(kind, HERO);
      expect(got).toEqual(expect.arrayContaining([...advs.map((a) => a.id), HERO_UNIT_ID]));
      expect(got).not.toContain('mil:a');
    }
  });
  it('au lapidaire, personne', () => {
    expect(champsDefend('lapidary')).toBe(false);
    expect(allyIds('lapidary', HERO)).toEqual([]);
  });
});

describe('🛡️ qui compte comme défenseur (memberDefends, defenderCount)', () => {
  it('sur un lieu de production : la milice seule, jamais un champion ni le héros', () => {
    expect(memberDefends('mine', 'mil:1')).toBe(true);
    expect(memberDefends('mine', 'a')).toBe(false);
    expect(defenderCount('mine', ['a', 'b', 'mil:1'], true)).toBe(1);
  });
  it('sur un objectif tenu : les champions et le héros', () => {
    expect(memberDefends('objective', 'a')).toBe(true);
    expect(defenderCount('objective', ['a', 'b'], true)).toBe(3);
  });
  it('au lapidaire : personne', () => {
    expect(defenderCount('lapidary', ['a', 'mil:1'], true)).toBe(0);
  });
});
