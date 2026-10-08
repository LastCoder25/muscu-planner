// 🛡️🏠 Quand des champions ou le héros REVIENNENT sur leur lieu fixe et qu'il manque des
// places, les derniers miliciens arrivés rentrent à pied à la base — juste le nombre
// nécessaire (2026-10-07, demandé par l'utilisateur).
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlFreeSeats,
  controlIdOf,
  controlReturnSeats,
  ensureControls,
  garrisonCap,
  heroReturnBlocker,
  reinforceControl,
  seatsOf,
  settleReinforcements,
} from '@/lib/controlPoints';
import { rejoinHome } from '@/lib/controlRoutes';
import { heroBackToPost } from '@/lib/islandConquest';
import { EXPE, createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';

const NOW = 5_000_000;
const MIN = 60_000;
const LEG = 7 * MIN;
const unit = { name: 'Last', level: 38, combatant: {} } as never;

describe('🧝 le héros revient à son poste', () => {
  const ossuary = (garrison: string[]): Poi =>
    ({
      id: 'ctl_ossuary',
      type: 'control',
      x: EXPE.town.x + 40,
      y: EXPE.town.y,
      control: { kind: 'ossuary', owner: 'player', garrison },
    }) as unknown as Poi;
  const map = (p: Poi) => ({ pois: [p] }) as unknown as ExpeditionMap;

  it('garnison pleine de miliciens : il reprend sa place, juste assez de miliciens rentrent', () => {
    const p = ossuary(['a', 'b', 'mil:1', 'mil:2', 'mil:3']);
    // 🛡️ 2026-10-08 : les miliciens cèdent aussi leur place à un nouvel envoi.
    expect(controlFreeSeats(p.control)).toBe(
      Math.min(seatsOf('ossuary'), garrisonCap('ossuary')) - 2,
    );
    expect(heroReturnBlocker(p.control)).toBeNull();
    const c = heroBackToPost(map(p), 'ctl_ossuary', unit, NOW, 20, () => LEG).pois[0]!.control!;
    expect(c.hero).toBe(true);
    // 2 champions + le héros (2 places) + 1 milicien = 5 : deux miliciens cèdent leur place,
    // les DERNIERS arrivés.
    expect(c.garrison).toEqual(['a', 'b', 'mil:1']);
    expect(c.returning).toEqual([
      { id: 'mil:3', from: NOW, at: NOW + LEG },
      { id: 'mil:2', from: NOW, at: NOW + LEG },
    ]);
  });

  it('assez de place : aucun milicien ne bouge', () => {
    const p = ossuary(['a', 'mil:1']);
    const c = heroBackToPost(map(p), 'ctl_ossuary', unit, NOW, 20, () => LEG).pois[0]!.control!;
    expect(c.garrison).toEqual(['a', 'mil:1']);
    expect(c.returning).toBeUndefined();
  });

  it('les CHAMPIONS ne cèdent jamais leur place : sans place de champion, il rentre', () => {
    const p = ossuary(['a', 'b', 'c', 'd']);
    expect(heroReturnBlocker(p.control)).toBe('full');
    const m = heroBackToPost(map(p), 'ctl_ossuary', unit, NOW, 20, () => LEG);
    expect(m.pois[0]!.control!.hero).toBeUndefined();
    expect(m.heroReturnAt).toBe(NOW + 20 * MIN);
  });
});

describe('⚔️ une sortie revient à son point', () => {
  const MINE = controlIdOf('mine');
  const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === MINE)!.control!;
  const world = (): ExpeditionMap => {
    let m = ensureControls(createMap(3, 0, 30, 1), 0, 30);
    m = captureControl(m, MINE, ['g0', 'g1'], 0, 7);
    m = {
      ...m,
      pois: m.pois.map((p) =>
        p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p,
      ),
    };
    // Trois miliciens arrivent : la garnison de 5 est pleine.
    m = reinforceControl(m, MINE, ['mil:1', 'mil:2', 'mil:3'], NOW - 2 * MIN, NOW - 2 * MIN);
    return settleReinforcements(m, NOW - MIN, 30, () => LEG);
  };

  it('la garnison est pleine de miliciens avant le retour', () => {
    const c = ctl(world());
    expect(c.garrison).toHaveLength(garrisonCap('mine'));
    expect(controlFreeSeats(c)).toBe(controlReturnSeats(c));
    expect(controlReturnSeats(c)).toBe(Math.min(seatsOf('mine'), garrisonCap('mine')) - 2);
  });

  it('un champion qui rentre reprend une place, un seul milicien rentre à la base', () => {
    const r = rejoinHome(world(), MINE, ['x'], NOW);
    expect(r.back).toEqual(['x']);
    expect(r.out).toEqual([]);
    const c = ctl(settleReinforcements(r.map, NOW, 30, () => LEG));
    expect(c.garrison).toEqual(['g0', 'g1', 'mil:1', 'mil:2', 'x']);
    expect(c.returning?.map((x) => x.id)).toEqual(['mil:3']);
  });
});
