// 🏚️🐺 La fouille qui dure, et ce que les rapports gardent pour leurs rejeux (v0.1212).
import { describe, expect, it } from 'vitest';
import {
  FALLEN_DWELL_MS,
  campSpecOf,
  travelPosition,
  tripTimeLabel,
  type ExpeditionMessage,
  type Poi,
} from '@/lib/expedition';
import { startParty } from '@/lib/party';
import { resolveCamp } from '@/lib/camp';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { riftAutoReplay } from '@/lib/riftStage';
import { refAdvGear, refChampionAdv } from '@/lib/caravan';
import { fallenSupplyCount } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const poi = (type: Poi['type'], over: Partial<Poi> = {}): Poi => ({
  id: 'p_' + type,
  type,
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const team = (n: number, L = 26): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(L, i),
    id: `a${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = { advGear: refAdvGear(26, 3) };
const outcome = { win: true } as never;

describe('🔍 on reste fouiller les ruines d’un héros tombé', () => {
  const leg = 30; // minutes
  it('le rapport tombe APRÈS la fouille, et le retour aussi', () => {
    const v = startParty({ poi: poi('fallen'), seed: 1 } as never, 0, leg, outcome);
    expect(v.dwellMs).toBe(FALLEN_DWELL_MS);
    expect(v.midAt).toBe(leg * 60_000 + FALLEN_DWELL_MS);
    expect(v.returnAt).toBe(2 * leg * 60_000 + FALLEN_DWELL_MS);
  });
  it('ailleurs, rien ne change', () => {
    const v = startParty({ poi: poi('mine'), seed: 1 } as never, 0, leg, outcome);
    expect(v.dwellMs).toBeUndefined();
    expect(v.midAt).toBe(leg * 60_000);
  });
  it('pendant la fouille, l’équipe est SUR PLACE et la tuile le dit', () => {
    const v = startParty({ poi: poi('fallen'), seed: 1 } as never, 0, leg, outcome);
    const avant = travelPosition(v, leg * 60_000 - 60_000);
    expect(avant.searching).toBe(false);
    const pendant = travelPosition(v, leg * 60_000 + FALLEN_DWELL_MS / 2);
    expect(pendant.searching).toBe(true);
    expect(pendant.x).toBe(v.poi.x);
    expect(pendant.y).toBe(v.poi.y);
    expect(tripTimeLabel(pendant).time.startsWith('🔍')).toBe(true);
    expect(tripTimeLabel(pendant).untilHome).toContain('fouille encore');
  });
});

describe('🎬 ce que les rapports gardent pour leurs rejeux', () => {
  it('🐺 une tanière garde son duel, et il finit comme le combat', () => {
    for (let s = 1; s <= 10; s++) {
      const p = poi('den', { id: `d${s}` });
      const o = resolveCamp({
        poi: p,
        spec: campSpecOf(p)!,
        escort: team(2),
        road,
        hero: null,
        seed: s,
        playerLevel: 26,
        pantheonLevel: 26,
      });
      const den = o.party!.den!;
      expect(den.steps.length).toBeGreaterThan(0);
      const last = den.steps[den.steps.length - 1]!;
      if (o.win) expect(last.bossPv).toBe(0);
      else expect(last.pv).toBe(0);
    }
  });
  it('⛺ un camp, non', () => {
    const p = poi('camp', { id: 'c1' });
    const o = resolveCamp({
      poi: p,
      spec: campSpecOf(p)!,
      escort: team(3),
      road,
      hero: null,
      seed: 1,
      playerLevel: 26,
      pantheonLevel: 26,
    });
    expect(o.party!.den).toBeUndefined();
  });
  it('🏚️ la fouille garde SES trouvailles, à part de celles de la route', () => {
    const o = resolveHarvestParty({
      poi: poi('fallen', { id: 'f1', level: 45 }),
      escort: team(1),
      road,
      hero: null,
      seed: 3,
      playerLevel: 45,
      pantheonLevel: 45,
    });
    const found = o.party!.fallen!.supplies;
    expect(Object.values(found).reduce((a, b) => a + (b ?? 0), 0)).toBe(fallenSupplyCount(45));
  });
  it('▶️ le rejeu automatique les prend aussi', () => {
    const msg = (id: string, party: object) =>
      ({ id, resolvedAt: 1000, party }) as unknown as ExpeditionMessage;
    const t = riftAutoReplay(
      [msg('a', { den: { steps: [] } }), msg('b', { fallen: { supplies: {} } }), msg('c', {})],
      new Set(),
      2000,
    );
    expect(t.play).not.toBeNull();
    expect(t.seen.sort()).toEqual(['a', 'b']);
  });
});
