import { describe, expect, it } from 'vitest';
import { archipelOn, islandPacified, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  captureControl,
  collectControl,
  controlIdOf,
  controlLootMessage,
  ensureControls,
} from '@/lib/controlPoints';
import {
  FORTRESS_ID,
  RISE,
  ensureIslandConquest,
  islandConquest,
  islandTargetLabel,
  nextRiseAt,
  razeIslandTarget,
} from '@/lib/islandConquest';
import { bossSummonCost } from '@/data/bosses';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const DAY = 24 * H;
const LV = 50;

function islandMap(id = 3, L = LV): ExpeditionMap {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
const objectives = (m: ExpeditionMap): Poi[] =>
  m.pois.filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy');
const KEY = 'isl_obj_2';

describe('🪦 l’île 3 : les morts se relèvent', () => {
  it('deux cimetières et la citadelle des morts (troupe 4)', () => {
    const o = objectives(islandMap());
    expect(o.map((p) => p.control!.name)).toEqual([
      'Cimetière',
      'Cimetière',
      'Citadelle des morts',
    ]);
    expect(o.find((p) => p.id === KEY)!.control!.size).toBe(4);
    expect(o.filter((p) => p.id !== KEY).every((p) => p.control!.size === 3)).toBe(true);
  });
  it('un cimetière abattu se relève 3 jours plus tard tant que la citadelle tient', () => {
    let m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H);
    m = tick(m, NOW + H);
    expect(objectives(m)).toHaveLength(2);
    expect(nextRiseAt(m)).toBe(NOW + H + RISE.riseMs);
    m = tick(m, NOW + H + RISE.riseMs - 1);
    expect(objectives(m)).toHaveLength(2);
    m = tick(m, NOW + H + RISE.riseMs);
    expect(objectives(m)).toHaveLength(3);
    expect(islandConquest(m)!.objectivesDown).toBe(0);
    // Rend la même carte au tick suivant.
    expect(tick(m, NOW + H + RISE.riseMs)).toBe(m);
  });
  it('la citadelle abattue, plus rien ne se relève', () => {
    let m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H);
    m = razeIslandTarget(m, KEY, NOW + 2 * H);
    expect(nextRiseAt(m)).toBeNull();
    m = tick(m, NOW + 30 * DAY);
    expect(objectives(m).map((p) => p.id)).toEqual(['isl_obj_1']);
  });
  it('les trois abattus en moins de 3 jours : pacifiable, rien ne revient', () => {
    let m = islandMap();
    for (const id of ['isl_obj_0', 'isl_obj_1', KEY]) m = razeIslandTarget(m, id, NOW + DAY);
    m = razeIslandTarget(m, FORTRESS_ID, NOW + 2 * DAY);
    expect(islandPacified(m)).toBe(true);
    m = tick(m, NOW + 30 * DAY);
    expect(objectives(m)).toHaveLength(0);
  });
  it('les autres îles ne relèvent rien', () => {
    let m = razeIslandTarget(islandMap(1, 20), 'isl_obj_0', NOW + H);
    m = tick(m, NOW + 30 * DAY);
    expect(m.archipel!.destroyed).toContain('isl_obj_0');
    expect(m.archipel!.razedAt).toBeUndefined();
  });
  it('la fiche le dit', () => {
    const m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H);
    expect(islandTargetLabel(m, 'isl_obj_1')!.detail).toContain('se relève 3 jours');
    expect(islandTargetLabel(m, KEY)!.detail).toContain('plus aucun cimetière');
  });
});

describe('⚱️ l’ossuaire de l’île 3', () => {
  it('l’île 3 porte socle + tour de guet + jardin + ossuaire', () => {
    const k = islandMap().pois.flatMap((p) => (p.control ? [p.control.kind] : []));
    for (const x of ['mine', 'training', 'mana', 'tower', 'garden', 'ossuary'])
      expect(k).toContain(x);
    expect(k).not.toContain('archives');
    expect(k).not.toContain('scriptorium');
  });
  it('tenu au complet, une tentative de boss de l’île toutes les 48 h', () => {
    const id = controlIdOf('ossuary');
    let m = islandMap();
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Ossuaire');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const price = bossSummonCost(LV);
    const got = collectControl(m, id, NOW + 48 * H, LV);
    expect(got.summon).toBeGreaterThanOrEqual(price);
    expect(got.summon).toBeLessThanOrEqual(Math.ceil(price * 1.6));
    expect(got.gold + got.mana + got.keys + got.runes).toBe(0);
    const one = captureControl(islandMap(), id, ['a'], NOW, 7);
    expect(collectControl(one, id, NOW + 48 * H, LV).summon).toBeLessThan(got.summon);
  });
  it('le rapport dit les pierres', () => {
    const p = islandMap().pois.find((q) => q.id === controlIdOf('ossuary'))!;
    expect(controlLootMessage(p, NOW, {}, 0, 0, 3)!.title).toContain('3 pierres d’invocation');
  });
});
