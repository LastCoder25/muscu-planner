// 🛡️🏠 Quand des champions ou le héros REVIENNENT sur leur lieu fixe, ils reprennent une place
// de CHAMPION. Depuis le 2026-10-08 les miliciens ont leurs places à part (`militiaSeatsOf`) :
// personne ne leur cède la sienne, aucun milicien ne rentre à la base pour leur faire de la place
// (le délogement de la 2026-10-07 est retiré).
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlFreeSeats,
  controlIdOf,
  ensureControls,
  militiaFreeSeats,
  heroPostBlocker,
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

  it('places de milice pleines : il reprend sa place de champion, aucun milicien ne bouge', () => {
    const mil = ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'];
    const p = ossuary(['a', 'b', ...mil]);
    expect(militiaFreeSeats(p.control)).toBe(0);
    expect(controlFreeSeats(p.control)).toBe(seatsOf('ossuary') - 2);
    expect(heroPostBlocker(p.control)).toBeNull();
    const c = heroBackToPost(map(p), 'ctl_ossuary', unit, NOW, 20).pois[0]!.control!;
    expect(c.hero).toBe(true);
    expect(c.garrison).toEqual(['a', 'b', ...mil]);
    expect(c.returning).toBeUndefined();
  });

  it('assez de place : aucun milicien ne bouge', () => {
    const p = ossuary(['a', 'mil:1']);
    const c = heroBackToPost(map(p), 'ctl_ossuary', unit, NOW, 20).pois[0]!.control!;
    expect(c.garrison).toEqual(['a', 'mil:1']);
    expect(c.returning).toBeUndefined();
  });

  it('les CHAMPIONS ne cèdent jamais leur place : sans place de champion, il rentre', () => {
    const p = ossuary(['a', 'b', 'c', 'd']);
    expect(heroPostBlocker(p.control)).toBe('full');
    const m = heroBackToPost(map(p), 'ctl_ossuary', unit, NOW, 20);
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
    // Cinq miliciens arrivent : leurs places sont toutes prises.
    m = reinforceControl(
      m,
      MINE,
      ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'],
      NOW - 2 * MIN,
      NOW - 2 * MIN,
    );
    return settleReinforcements(m, NOW - MIN, 30, () => LEG);
  };

  it('les places de milice sont pleines avant le retour, celles de champion non', () => {
    const c = ctl(world());
    expect(militiaFreeSeats(c)).toBe(0);
    expect(controlFreeSeats(c)).toBe(seatsOf('mine') - 2);
  });

  it('un champion qui rentre reprend une place de champion, aucun milicien ne rentre', () => {
    const r = rejoinHome(world(), MINE, ['x'], NOW);
    expect(r.back).toEqual(['x']);
    expect(r.out).toEqual([]);
    const c = ctl(settleReinforcements(r.map, NOW, 30, () => LEG));
    expect(c.garrison).toEqual(['g0', 'g1', 'mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5', 'x']);
    expect(c.returning).toBeUndefined();
  });
});
