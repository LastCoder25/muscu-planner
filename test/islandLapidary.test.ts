import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap } from '@/lib/expedition';
import {
  applyLapis,
  captureControl,
  collectControl,
  controlIdOf,
  controlKindsOf,
  defendsControl,
  ensureControls,
  garrisonCap,
  garrisonHold,
  lapidaryHours,
  seatsOf,
  setLapisSkill,
} from '@/lib/controlPoints';
import { controlAttackHold } from '@/lib/fieldArmy';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { refEscortUnits } from '@/lib/caravan';
import { refChampionAdv } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';

const NOW = Date.UTC(2026, 9, 3, 12);
const H = 3600_000;
const LV = 50;
const id = controlIdOf('lapidary');

function island3(): ExpeditionMap {
  const m = createMap(3, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(3));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const adv = (over: Partial<Adventurer> = {}): Adventurer =>
  ({
    id: 'a',
    name: 'A',
    seed: 1,
    path: [],
    level: 20,
    xp: 0,
    skills: [
      { id: 'speed', level: 1 },
      { id: 'plunder', level: 4 },
      { id: 'care', level: 5 },
    ],
    ...over,
  }) as Adventurer;

describe('💎 le lapidaire de l’île 3', () => {
  it('l’île 3 : camp, lapidaire, arsenal', () => {
    expect([...controlKindsOf({ archipel: archipelOn(3) })].sort()).toEqual([
      'arsenal',
      'lapidary',
      'training',
    ]);
    expect(poiLabel(island3().pois.find((p) => p.id === id)!)).toContain('Lapidaire');
  });

  it('un seul champion, aucun milicien, et personne pour le défendre', () => {
    expect(seatsOf('lapidary')).toBe(1);
    expect(garrisonCap('lapidary')).toBe(1);
    expect(defendsControl('lapidary')).toBe(false);
    expect(defendsControl('mine')).toBe(true);
    const m = captureControl(island3(), id, ['a', 'b'], NOW, 7);
    const p = m.pois.find((q) => q.id === id)!;
    expect(p.control!.garrison).toEqual(['a']);
    expect(garrisonHold(p, refEscortUnits(LV), 1)).toBe(0);
    // Les mêmes défenseurs tiendraient une mine : c'est bien le lapidaire qui ne se défend pas.
    const champs = [0, 1, 2].map((k) => refChampionAdv(LV + 20, k));
    const ids = champs.map((c) => c.id);
    const asMine = { ...p, control: { ...p.control!, kind: 'mine' as const, garrison: ids } };
    expect(controlAttackHold(m, asMine, ids, champs, { advGear: [] }, LV, 1)).toBeGreaterThan(0);
    expect(controlAttackHold(m, p, ids, champs, { advGear: [] }, LV, 1)).toBe(0);
  });

  it('le temps dépend de la couleur et du niveau', () => {
    expect(lapidaryHours('speed', 1)).toBeLessThan(lapidaryHours('plunder', 1));
    expect(lapidaryHours('speed', 1)).toBeLessThan(lapidaryHours('speed', 3));
  });

  it('les heures font monter la compétence d’un niveau, 5 au plus', () => {
    const need = lapidaryHours('speed', 1);
    const a = applyLapis([adv()], { advId: 'a', skill: 'speed', hours: need });
    expect(a.up).toBe(1);
    expect(a.advs[0]!.skills!.find((s) => s.id === 'speed')!.level).toBe(2);
    const big = applyLapis([adv()], { advId: 'a', skill: 'plunder', hours: 1e6 });
    expect(big.advs[0]!.skills!.find((s) => s.id === 'plunder')!.level).toBe(5);
    const maxed = [adv()];
    expect(applyLapis(maxed, { advId: 'a', skill: 'care', hours: 1e6 }).advs).toBe(maxed);
  });

  it('le travail est GARDÉ sur le champion, et s’additionne', () => {
    const half = lapidaryHours('speed', 1) / 2;
    const one = applyLapis([adv()], { advId: 'a', skill: 'speed', hours: half });
    expect(one.up).toBe(0);
    expect(one.advs[0]!.lapisHours!.speed).toBeCloseTo(half, 6);
    const two = applyLapis(one.advs, { advId: 'a', skill: 'speed', hours: half });
    expect(two.up).toBe(1);
  });

  it('le lieu polit depuis le choix de la compétence, fraction comprise', () => {
    let m = captureControl(island3(), id, ['a'], NOW, 7);
    expect(collectControl(m, id, NOW + 10 * H, LV).lapis).toBeUndefined();
    m = setLapisSkill(m, id, 'speed', NOW + 10 * H);
    const got = collectControl(m, id, NOW + 15.5 * H, LV).lapis!;
    expect(got.advId).toBe('a');
    expect(got.skill).toBe('speed');
    expect(got.hours).toBeCloseTo(5.5, 6);
  });
});
