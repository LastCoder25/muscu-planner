// 🛡️⚔️ Des miliciens envoyés À L'AVANCE vers un lieu ENNEMI (demandé : « pré-envoyer une
// garnison si une attaque arrivera entre-temps ») : pris à leur arrivée, ils occupent les
// places libres ; toujours ennemi (ou pris après leur arrivée), demi-tour vers la base.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlIdOf,
  ensureControls,
  militiaMayHead,
  reinforceBlocker,
  reinforceControl,
  reinforcementsEnRoute,
  settleReinforcements,
} from '@/lib/controlPoints';
import { createMap, RAZE_KINDS, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const ID = controlIdOf('mine');
const L = 30;
const LEG = 2 * H;
const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === ID)!.control!;
const enemy = () => ensureControls(createMap(3, 0, L, 1), 0, L);
const settle = (m: ExpeditionMap, t: number) => settleReinforcements(m, t, L, () => LEG);
/** Pris à `at` par `g`, prochaine reprise très loin. */
const take = (m: ExpeditionMap, at: number, g: string[] = ['c1']) => {
  const t = captureControl(m, ID, g, at, 7);
  return {
    ...t,
    pois: t.pois.map((p) =>
      p.id === ID ? { ...p, control: { ...p.control!, attackAt: 9e15 } } : p,
    ),
  };
};

describe('🛡️⚔️ miliciens à l’avance vers un lieu ennemi', () => {
  it('des miliciens peuvent partir vers un lieu ennemi, pas des champions', () => {
    const c = ctl(enemy());
    expect(c.owner).toBe('enemy');
    expect(militiaMayHead(c)).toBe(true);
    expect(reinforceBlocker(c, 2, true)).toBeNull();
    expect(reinforceBlocker(c, 0, true)).toBe('empty');
    expect(reinforceBlocker(c, 1)).toBe('notHeld');
  });
  it('jamais vers un objectif, la forteresse ni la citadelle', () => {
    for (const kind of RAZE_KINDS)
      expect(reinforceBlocker({ ...ctl(enemy()), kind }, 1, true)).toBe('noMilitia');
  });
  it('toujours ennemi à l’arrivée : demi-tour vers la base, depuis leur arrivée', () => {
    const m = reinforceControl(enemy(), ID, ['mil:1', 'mil:2'], 3 * H, H);
    expect(settle(m, 2 * H)).toBe(m); // pas encore arrivés
    const c = ctl(settle(m, 4 * H));
    expect(c.reinforcing ?? []).toEqual([]);
    expect(c.garrison).toEqual([]);
    expect(c.returning).toEqual([
      { id: 'mil:1', from: 3 * H, at: 3 * H + LEG },
      { id: 'mil:2', from: 3 * H, at: 3 * H + LEG },
    ]);
  });
  it('pris AVANT leur arrivée : ils occupent les places libres', () => {
    const m = take(reinforceControl(enemy(), ID, ['mil:1'], 3 * H, H), 2 * H);
    const c = ctl(settle(m, 4 * H));
    expect(c.garrison).toEqual(['c1', 'mil:1']);
    expect(c.returning ?? []).toEqual([]);
  });
  it('pris APRÈS leur arrivée (tick en retard) : demi-tour quand même', () => {
    const m = take(reinforceControl(enemy(), ID, ['mil:1'], 3 * H, H), 5 * H);
    const c = ctl(settle(m, 6 * H));
    expect(c.garrison).toEqual(['c1']);
    expect(c.returning).toEqual([{ id: 'mil:1', from: 3 * H, at: 3 * H + LEG }]);
  });
  it('un assaut y marche encore : on attend son issue avant de les renvoyer', () => {
    const m0 = reinforceControl(enemy(), ID, ['mil:1'], 3 * H, H);
    const m = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, assault: true } } : p,
      ),
    };
    expect(settle(m, 4 * H)).toBe(m);
  });
  it('ils se voient en route sur la carte', () => {
    const m = reinforceControl(enemy(), ID, ['mil:1'], 3 * H, H);
    expect(reinforcementsEnRoute(m, 2 * H).length).toBe(1);
  });
});
