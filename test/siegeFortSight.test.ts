// 👁️ UN SIÈGE QUI PASSE PAR LE CERCLE D'UN FORT EST REPÉRÉ DÈS SON ENTRÉE (demandé,
// 2026-10-04 : « tout ce qui passe par un cercle de détection apparaît sur la carte »). Avant,
// l'armée d'un siège ne se voyait qu'au préavis de la Tour de guet, sans regarder les forts.
import { describe, expect, it } from 'vitest';
import {
  DETECT_FLOOR,
  FIELD_ARMY,
  siegeArmyPoi,
  siegeSightLeadMs,
  type DetectCircle,
} from '@/lib/fieldArmy';
import { advanceBase, emptyBase, rollRaid, type BaseState, type DefenseStructure } from '@/lib/raid';
import { EXPE } from '@/lib/expedition';
import { planPushes, type PushContext } from '@/lib/push';

const H = 3_600_000;
const T = EXPE.town;
const T0 = Date.UTC(2026, 9, 4, 8, 0, 0);
const REACH = 100;
const SEED = 4242;

/** La direction d'où vient le siège de cette graine : on la lit sur l'armée posée. */
function approachDir(seed: number): { x: number; y: number } {
  const raid = rollRaid(seed, 26, T0 + 10 * H, 9 * H);
  const p = siegeArmyPoi(raid, REACH, raid.detectedAt, 26)!;
  const d = Math.hypot(p.x - T.x, p.y - T.y);
  return { x: (p.x - T.x) / d, y: (p.y - T.y) / d };
}
const base: DetectCircle = { id: 'base', x: T.x, y: T.y, r: DETECT_FLOOR };
const fortAt = (dist: number, side = 0): DetectCircle => {
  const u = approachDir(SEED);
  return {
    id: 'fort',
    x: T.x + u.x * dist - u.y * side,
    y: T.y + u.y * dist + u.x * side,
    r: DETECT_FLOOR,
  };
};

describe('👁️ le préavis des forts', () => {
  it('rien sans fort : le cercle de la base ne compte pas (c’est la Tour qui le donne)', () => {
    expect(siegeSightLeadMs(SEED, [base], REACH)).toBe(0);
  });
  it('un fort sur sa route : repérée en entrant dans son cercle', () => {
    // Fort à 40 de la ville, cercle de 30 : elle y entre à 70 de la ville, soit 7 h de marche.
    const lead = siegeSightLeadMs(SEED, [base, fortAt(40)], REACH);
    expect(lead / H).toBeCloseTo(70 / FIELD_ARMY.speedPerHour, 6);
  });
  it('un fort loin de sa route ne voit rien', () => {
    expect(siegeSightLeadMs(SEED, [base, fortAt(40, 50)], REACH)).toBe(0);
  });
  it('jamais plus loin que le bord de la carte révélée', () => {
    const lead = siegeSightLeadMs(SEED, [base, fortAt(90)], REACH);
    expect(lead / H).toBeCloseTo((REACH - 1) / FIELD_ARMY.speedPerHour, 6);
  });
  it('l’armée apparaît sur la carte là où le fort l’a vue : au bord de son cercle', () => {
    const f = fortAt(40);
    const lead = siegeSightLeadMs(SEED, [base, f], REACH);
    const raid = rollRaid(SEED, 26, T0 + 10 * H, lead);
    expect(siegeArmyPoi(raid, REACH, raid.detectedAt - 1, 26)).toBeNull();
    const p = siegeArmyPoi(raid, REACH, raid.detectedAt, 26)!;
    expect(Math.hypot(p.x - f.x, p.y - f.y)).toBeCloseTo(DETECT_FLOOR, 4);
  });
});

describe('👁️ le tick de base prend le plus long des deux préavis', () => {
  const defs: DefenseStructure[] = [
    { typeId: 'wall', level: 26 },
    { typeId: 'turret', level: 26 },
  ];
  const ready = (): BaseState => ({
    ...emptyBase(7, T0),
    defenses: defs,
    nextRaidAt: T0 + 20 * H,
  });
  const ctx = (fort: number) => ({
    playerLevel: 26,
    activeDays7: 7,
    globalXp: 0,
    towerBoost: 0,
    pacified: false,
    levelBand: null,
    fortSightMs: () => fort,
  });

  it('un fort qui voit loin fait tirer le siège plus tôt', () => {
    const b = ready();
    // 10 h avant l'arrivée : sans Tour, rien n'est encore repéré.
    expect(advanceBase(b, ctx(0), b.nextRaidAt - 10 * H).detected).toBeNull();
    const t = advanceBase(b, ctx(12 * H), b.nextRaidAt - 10 * H);
    expect(t.detected).not.toBeNull();
    expect(t.detected!.detectedAt).toBe(b.nextRaidAt - 12 * H);
  });
  it('un fort qui voit moins loin que la Tour ne change rien', () => {
    const b = ready();
    const tour = advanceBase(b, ctx(0), b.nextRaidAt - 1);
    const fort = advanceBase(b, ctx(1), b.nextRaidAt - 1);
    expect(fort.detected!.detectedAt).toBe(tour.detected!.detectedAt);
  });
});

describe('🔔 la notification « armée repérée » suit le même préavis', () => {
  it('elle part quand un fort voit l’armée, pas seulement quand la Tour la voit', () => {
    const b: BaseState = {
      ...emptyBase(7, T0),
      defenses: [
        { typeId: 'wall', level: 26 },
        { typeId: 'turret', level: 26 },
      ],
      nextRaidAt: T0 + 30 * H,
    };
    const ctx = (fort: number): PushContext => ({
      base: b,
      expedition: null,
      parties: [],
      watchtowerLevel: 0,
      towerBoost: 0,
      fortSightMs: () => fort,
      activeDays7: 7,
      pacified: false,
      playerLevel: 26,
      plunder: null,
      controls: [],
    });
    const at = (fort: number) =>
      planPushes(ctx(fort), T0).find((p) => p.kind === 'siege')!.sendAt;
    expect(at(12 * H)).toBe(b.nextRaidAt - 12 * H);
    expect(at(12 * H)).toBeLessThan(at(0));
  });
});
