// 🏰🛡️ Deux réserves de places séparées (2026-10-08, décision de l'utilisateur : « seuls les
// miliciens défendent les lieux fixes ») : les champions et le héros ont leurs places
// (`seatsOf`), les miliciens les leurs (`militiaSeatsOf`). Un lieu plein de miliciens reste
// donc ouvert aux champions et au héros, PERSONNE n'est délogé, et le milicien en trop fait
// demi-tour à pied vers la base — c'est annoncé dans la boîte.
import { describe, expect, it } from 'vitest';
import {
  baseSendBlocker,
  captureControl,
  controlFreeSeats,
  controlIdOf,
  ensureControls,
  garrisonCap,
  heroPostBlocker,
  militiaFreeSeats,
  militiaSeatsOf,
  reinforceBlocker,
  reinforceControl,
  seatsOf,
  sendHeroToControl,
  settleReinforcements,
  militiaSentBackMessages,
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
const MIL = Array.from({ length: MILITIA.perPoint }, (_, i) => `mil:${i + 1}`);

/** La mine tenue par 2 champions et une milice COMPLÈTE : ses places de milice sont pleines. */
const world = (): ExpeditionMap => {
  let m = ensureControls(createMap(3, 0, 30, 1), 0, 30);
  m = captureControl(m, MINE, ['g0', 'g1'], 0, 7);
  m = {
    ...m,
    pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p)),
  };
  m = reinforceControl(m, MINE, MIL, NOW - 2 * MIN, NOW - 2 * MIN);
  return settle(m, NOW - MIN);
};

describe('🏰 deux réserves : un lieu plein de miliciens reste ouvert aux champions', () => {
  it('la milice est complète, les places de champion restent libres', () => {
    const c = ctl(world());
    expect(militiaSeatsOf('mine')).toBe(MILITIA.perPoint);
    expect(garrisonCap('mine')).toBe(seatsOf('mine') + MILITIA.perPoint);
    expect(c.garrison).toEqual(['g0', 'g1', ...MIL]);
    expect(militiaFreeSeats(c)).toBe(0);
    expect(controlFreeSeats(c)).toBe(seatsOf('mine') - 2);
    expect(reinforceBlocker(c, 1)).toBeNull();
    expect(heroPostBlocker(c)).toBeNull();
    expect(baseSendBlocker(c, 1, 0, true)).toBeNull();
  });

  it('un champion arrive : il prend une place de champion, aucun milicien ne part', () => {
    const m = reinforceControl(world(), MINE, ['x'], NOW + 10 * MIN, NOW);
    const c = ctl(settle(m, NOW + 10 * MIN));
    expect(c.garrison).toEqual(['g0', 'g1', ...MIL, 'x']);
    expect(c.returning ?? []).toEqual([]);
  });

  it('le héros arrive : il prend ses deux places de champion, personne n’est délogé', () => {
    const m = sendHeroToControl(world(), MINE, NOW, NOW + 10 * MIN, unit);
    const c = ctl(settle(m, NOW + 10 * MIN));
    expect(c.hero).toBe(true);
    expect(c.garrison).toEqual(['g0', 'g1', ...MIL]);
    expect(c.returning ?? []).toEqual([]);
    expect(controlFreeSeats(c)).toBe(seatsOf('mine') - 2 - MILITIA.heroSeats);
  });

  it('un milicien de plus, lui, fait demi-tour à pied vers la base', () => {
    const m = reinforceControl(world(), MINE, ['mil:9'], NOW + 10 * MIN, NOW);
    const c = ctl(settle(m, NOW + 10 * MIN));
    expect(c.garrison).not.toContain('mil:9');
    expect(c.returning).toEqual([{ id: 'mil:9', from: NOW + 10 * MIN, at: NOW + 10 * MIN + LEG }]);
  });

  it('les champions, eux, ne cèdent jamais leur place', () => {
    let m = ensureControls(createMap(3, 0, 30, 1), 0, 30);
    const full = Array.from({ length: seatsOf('mine') }, (_, i) => `g${i}`);
    m = captureControl(m, MINE, full, 0, 7);
    expect(reinforceBlocker(ctl(m), 1)).toBe('full');
    // …et leurs places pleines laissent toute la réserve de milice libre.
    expect(militiaFreeSeats(ctl(m))).toBe(MILITIA.perPoint);
  });

  it('un transfert de champion vers le lieu plein de miliciens passe aussi', () => {
    let m = world();
    m = captureControl(m, controlIdOf('garden'), ['t1'], 0, 7);
    expect(transferBlocker(m, controlIdOf('garden'), MINE, ['t1'])).toBeNull();
  });

  it('la sélection de renfort accepte un champion même sans place de milice', () => {
    const free = { champ: 3, total: 0, mil: 0, milAnyway: true };
    expect(reinfCanAdd(emptyReinfSelection(), 'champ', free)).toBe(true);
    expect(reinfCanAdd({ champs: ['a', 'b', 'c'], militia: 0, transfers: [] }, 'champ', free)).toBe(
      false,
    );
  });
});

describe('📬 un mot dans la boîte pour les miliciens renvoyés (revue 2026-10-08)', () => {
  it('un milicien arrivé sans place de milice fait demi-tour, et c’est dit', () => {
    const before = reinforceControl(world(), MINE, ['mil:9'], NOW + 10 * MIN, NOW);
    const msgs = militiaSentBackMessages(before, settle(before, NOW + 10 * MIN));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toContain('1 milicien arrivé sans place libre fait demi-tour');
    expect(msgs[0]!.id).toBe(`milback_${MINE}_${NOW + 10 * MIN}`);
  });
  it('un champion qui arrive ne renvoie personne : aucun message', () => {
    const before = reinforceControl(world(), MINE, ['x'], NOW + 10 * MIN, NOW);
    expect(militiaSentBackMessages(before, settle(before, NOW + 10 * MIN))).toEqual([]);
  });
  it('rien quand personne ne repart', () => {
    const before = world();
    expect(militiaSentBackMessages(before, settle(before, NOW))).toEqual([]);
  });
});
