// 🏰🛡️ On envoie des champions et/ou le héros sur un lieu fixe plein de miliciens : à leur
// arrivée, juste assez de miliciens (les derniers arrivés) rentrent à pied à la base
// (2026-10-08, demandé par l'utilisateur).
import { describe, expect, it } from 'vitest';
import {
  baseSendBlocker,
  captureControl,
  controlFreeSeats,
  controlIdOf,
  ensureControls,
  garrisonCap,
  heroPostBlocker,
  reinforceBlocker,
  reinforceControl,
  seatsOf,
  sendHeroToControl,
  settleReinforcements,
} from '@/lib/controlPoints';
import { transferBlocker } from '@/lib/controlRoutes';
import { MILITIA } from '@/lib/militia';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { emptyReinfSelection, reinfCanAdd } from '@/lib/reinforceSelection';

const MIN = 60_000;
const NOW = 5_000_000;
const LEG = 7 * MIN;
const MINE = controlIdOf('mine');
const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === MINE)!.control!;
const settle = (m: ExpeditionMap, t: number) => settleReinforcements(m, t, 30, () => LEG);
const unit = { name: 'Last', level: 30, combatant: {} } as never;

/** La mine tenue par 2 champions et 3 miliciens : la garnison de 5 est pleine. */
const world = (): ExpeditionMap => {
  let m = ensureControls(createMap(3, 0, 30, 1), 0, 30);
  m = captureControl(m, MINE, ['g0', 'g1'], 0, 7);
  m = {
    ...m,
    pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p)),
  };
  m = reinforceControl(m, MINE, ['mil:1', 'mil:2', 'mil:3'], NOW - 2 * MIN, NOW - 2 * MIN);
  return settle(m, NOW - MIN);
};

describe('🏰 un lieu plein de miliciens reste ouvert aux champions et au héros', () => {
  it('la garnison est pleine, mais les places de champion restent libres', () => {
    const c = ctl(world());
    expect(c.garrison).toHaveLength(garrisonCap('mine'));
    expect(controlFreeSeats(c)).toBe(Math.min(seatsOf('mine'), garrisonCap('mine')) - 2);
    expect(reinforceBlocker(c, 1)).toBeNull();
    expect(heroPostBlocker(c)).toBeNull();
    expect(baseSendBlocker(c, 1, 0, true)).toBeNull();
  });

  it('un champion arrive : le dernier milicien arrivé rentre à la base', () => {
    const m = reinforceControl(world(), MINE, ['x'], NOW + 10 * MIN, NOW);
    expect(ctl(m).garrison).toHaveLength(garrisonCap('mine')); // en route, personne ne bouge
    const c = ctl(settle(m, NOW + 10 * MIN));
    expect(c.garrison).toEqual(['g0', 'g1', 'mil:1', 'mil:2', 'x']);
    expect(c.returning).toEqual([{ id: 'mil:3', from: NOW + 10 * MIN, at: NOW + 10 * MIN + LEG }]);
  });

  it('le héros arrive : deux miliciens lui cèdent ses deux places', () => {
    const m = sendHeroToControl(world(), MINE, NOW, NOW + 10 * MIN, unit);
    const c = ctl(settle(m, NOW + 10 * MIN));
    expect(c.hero).toBe(true);
    expect(c.garrison).toEqual(['g0', 'g1', 'mil:1']);
    expect(c.returning?.map((r) => r.id)).toEqual(['mil:3', 'mil:2']);
    expect(c.garrison.length + MILITIA.heroSeats).toBe(garrisonCap('mine'));
  });

  it('les champions, eux, ne cèdent jamais leur place', () => {
    let m = ensureControls(createMap(3, 0, 30, 1), 0, 30);
    const full = Array.from({ length: seatsOf('mine') }, (_, i) => `g${i}`);
    m = captureControl(m, MINE, full, 0, 7);
    expect(reinforceBlocker(ctl(m), 1)).toBe('full');
  });

  it('un transfert de champion vers le lieu plein de miliciens passe aussi', () => {
    let m = world();
    m = captureControl(m, controlIdOf('garden'), ['t1'], 0, 7);
    expect(transferBlocker(m, controlIdOf('garden'), MINE, ['t1'])).toBeNull();
  });

  it('la sélection de renfort accepte un champion même sans place « au total »', () => {
    const free = { champ: 3, total: 0, mil: 0, milAnyway: true };
    expect(reinfCanAdd(emptyReinfSelection(), 'champ', free)).toBe(true);
    expect(reinfCanAdd({ champs: ['a', 'b', 'c'], militia: 0, transfers: [] }, 'champ', free)).toBe(
      false,
    );
  });
});
