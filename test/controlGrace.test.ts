import { describe, expect, it } from 'vitest';
import {
  GRACE,
  captureControl,
  dueRetakes,
  graceInfo,
  graceOnCapture,
  holdGrace,
} from '@/lib/controlPoints';
import { archipelOn } from '@/lib/archipelago';
import { createMap, type ControlState, type ExpeditionMap, type Poi } from '@/lib/expedition';

const H = 3600_000;
const T0 = Date.UTC(2026, 9, 12, 10, 0, 0);

const point = (control: Partial<ControlState>): Poi =>
  ({
    id: 'ctl_mine',
    type: 'control',
    level: 21,
    x: 60,
    y: 60,
    distNorm: 0.3,
    spawnedAt: T0 - 48 * H,
    expiresAt: 9e15,
    control: {
      kind: 'mine',
      owner: 'player',
      faction: 'bandits',
      size: 1,
      garrison: ['mil:1'],
      retakes: 0,
      since: T0,
      collectedAt: T0,
      grace: { from: T0 },
      ...control,
    },
  }) as Poi;

function isle2(control: Partial<ControlState> = {}, extra: Partial<ExpeditionMap> = {}) {
  const m = createMap(7, T0, 21, 3, undefined, archipelOn(2));
  return { ...m, pois: [point(control)], ...extra } as ExpeditionMap;
}
const ctl = (m: ExpeditionMap) => m.pois[0]!.control!;

describe('🕊️ la trêve d’un lieu pris sur une île', () => {
  it('posée à la prise sur une île disputée, jamais hors archipel ni sur une île pacifiée', () => {
    expect(graceOnCapture({ archipel: archipelOn(2) }, T0)).toEqual({ from: T0 });
    expect(graceOnCapture({}, T0)).toBeUndefined();
    const pacified = { ...archipelOn(2), pacifiedAt: T0 - H };
    expect(graceOnCapture({ archipel: pacified }, T0)).toBeUndefined();
    const enemy = isle2({ owner: 'enemy', grace: undefined, garrison: [] });
    expect(ctl(captureControl(enemy, 'ctl_mine', ['mil:1'], T0, 7)).grace).toEqual({ from: T0 });
  });

  it('une attaque avancée pendant la trêve est repoussée à sa fin, et retenue', () => {
    const m = holdGrace(isle2({ attackAt: T0 + H }), T0 + 10 * 60_000);
    expect(ctl(m).attackAt).toBe(T0 + GRACE.maxMs);
    expect(ctl(m).grace!.held).toBe(T0 + H);
    // Rien ne change au tick suivant.
    expect(holdGrace(m, T0 + 20 * 60_000)).toBe(m);
  });

  it('les départs faits AVANT la prise, ou pas encore arrivés, ne comptent pas', () => {
    const deps = [T0 - H, T0 + H, T0 + 2 * H, T0 + 30 * H];
    const g = graceInfo(ctl(isle2()), { departures: deps }, T0 + 3 * H)!;
    expect(g.departuresLeft).toBe(1);
  });

  it(`elle tombe au ${GRACE.departures}ᵉ départ : l’attaque retenue tombe alors, jamais avant`, () => {
    const m0 = holdGrace(isle2({ attackAt: T0 + H }), T0 + 10 * 60_000);
    const deps = [T0 + H, T0 + 2 * H, T0 + 3 * H];
    const m = holdGrace({ ...m0, departures: deps }, T0 + 4 * H);
    expect(ctl(m).grace).toBeUndefined();
    expect(ctl(m).attackAt).toBe(T0 + 4 * H);
    // Une attaque retenue PLUS TARD que la fin garde son heure.
    const late = holdGrace(
      { ...isle2({ attackAt: T0 + GRACE.maxMs, grace: { from: T0, held: T0 + 9 * H } }) },
      T0 + 4 * H,
    );
    const done = holdGrace({ ...late, departures: deps }, T0 + 4 * H);
    expect(ctl(done).attackAt).toBe(T0 + 9 * H);
  });

  it('des miliciens en route vers le lieu, ou en mer vers l’île, la prolongent', () => {
    const deps = [T0 + H, T0 + 2 * H, T0 + 3 * H];
    const road = isle2({ reinforcing: [{ id: 'mil:9', at: T0 + 6 * H }] }, { departures: deps });
    expect(graceInfo(ctl(road), road, T0 + 4 * H)!.militiaComing).toBe(true);
    expect(graceInfo(ctl(road), road, T0 + 7 * H)).toBeNull();
    // Un champion en route ne la prolonge pas : seuls les miliciens défendent.
    const champ = isle2({ reinforcing: [{ id: 'adv1', at: T0 + 6 * H }] }, { departures: deps });
    expect(graceInfo(ctl(champ), champ, T0 + 4 * H)).toBeNull();
    const sea = isle2(
      {},
      {
        departures: deps,
        sailings: [
          { from: 1, to: 2, bookedAt: T0, departAt: T0, arriveAt: T0 + 6 * H, ids: [], militia: 3 },
        ],
      },
    );
    expect(graceInfo(ctl(sea), sea, T0 + 4 * H)!.militiaComing).toBe(true);
  });

  it(`elle ne dure jamais plus de ${GRACE.maxMs / H} h, même sans aucun départ`, () => {
    expect(graceInfo(ctl(isle2()), {}, T0 + GRACE.maxMs - 1)).not.toBeNull();
    expect(graceInfo(ctl(isle2()), {}, T0 + GRACE.maxMs)).toBeNull();
  });

  it('un lieu en trêve n’est jamais dû, même si son attaque est passée', () => {
    const m = isle2({ attackAt: T0 + H });
    expect(dueRetakes(m, T0 + 2 * H)).toEqual([]);
    const free = isle2({ attackAt: T0 + H, grace: undefined });
    expect(dueRetakes(free, T0 + 2 * H).map((p) => p.id)).toEqual(['ctl_mine']);
  });
});
