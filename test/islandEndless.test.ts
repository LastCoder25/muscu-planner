import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '@/lib/archipelago';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  ENDLESS,
  ENDLESS_ID,
  FORTRESS_ID,
  endlessSize,
  ensureIslandConquest,
  islandTargetLabel,
  objectiveIdOf,
  razeIslandTarget,
} from '@/lib/islandConquest';
import { endlessReward } from '@/lib/crossing';
import { characterRank } from '@/lib/characterRank';

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 24 * 3600_000;
const LV = 95;

function islandMap(id = 5): ExpeditionMap {
  const m = createMap(5, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
/** L'île pacifiée : tous ses objectifs puis sa forteresse abattus. */
function pacified(id = 5): ExpeditionMap {
  let m = islandMap(id);
  const isl = ISLANDS.find((i) => i.id === id)!;
  for (let i = 0; i < isl.objectives; i++) m = razeIslandTarget(m, objectiveIdOf(i), NOW);
  return razeIslandTarget(m, FORTRESS_ID, NOW);
}
const breach = (m: ExpeditionMap) => m.pois.find((p) => p.id === ENDLESS_ID);

describe('🌀 l’île 5, puis sans fin', () => {
  it('aucune brèche tant que la citadelle tient', () => {
    expect(breach(islandMap())).toBeUndefined();
  });

  it('la citadelle prise, la brèche s’ouvre sans défaire la pacification', () => {
    const m = ensureIslandConquest(pacified(), NOW + 1, LV);
    const b = breach(m)!;
    expect(b.control!.owner).toBe('enemy');
    expect(b.control!.size).toBe(endlessSize(0));
    expect(m.archipel!.pacifiedAt).toBeDefined();
    expect(islandTargetLabel(m, ENDLESS_ID)!.title).toContain('Brèche maudite');
  });

  it('abattue, elle se rouvre 3 jours plus tard, plus forte d’un cran', () => {
    let m = ensureIslandConquest(pacified(), NOW + 1, LV);
    m = razeIslandTarget(m, ENDLESS_ID, NOW + 2);
    expect(m.archipel!.endless).toEqual({ tier: 1, at: NOW + 2 });
    expect(m.archipel!.destroyed).not.toContain(ENDLESS_ID);
    expect(breach(ensureIslandConquest(m, NOW + 2 + ENDLESS.respawnMs - 1, LV))).toBeUndefined();
    const back = breach(ensureIslandConquest(m, NOW + 2 + ENDLESS.respawnMs, LV))!;
    expect(back.control!.size).toBe(endlessSize(1));
    expect(endlessSize(1)).toBe(endlessSize(0) + ENDLESS.perTier);
  });

  it('un coffre par victoire, une seule fois, plus riche à chaque cran', () => {
    let m = ensureIslandConquest(pacified(), NOW + 1, LV);
    expect(endlessReward(m, NOW + 2)).toBeNull();
    m = razeIslandTarget(m, ENDLESS_ID, NOW + 2);
    m = razeIslandTarget(m, ENDLESS_ID, NOW + 3 * DAY + 3);
    const r = endlessReward(m, NOW + 4 * DAY)!;
    expect(r.msgs.map((x) => x.runes)).toEqual([ENDLESS.runesBase + 1, ENDLESS.runesBase + 2]);
    expect(r.msgs[0]!.seals).toEqual({
      kind: 'champion',
      rank: characterRank(100).rankIndex,
      n: ENDLESS.seals,
    });
    expect(new Set(r.msgs.map((x) => x.id)).size).toBe(2);
    expect(endlessReward(r.map, NOW + 4 * DAY)).toBeNull();
    const far = { ...m, archipel: { ...m.archipel!, endless: { tier: 40, at: NOW } } };
    expect(Math.max(...endlessReward(far, NOW)!.msgs.map((x) => x.runes ?? 0))).toBe(
      ENDLESS.runesMax,
    );
  });

  it('seulement sur l’île 5', () => {
    for (const id of [1, 2, 3, 4]) {
      const m = ensureIslandConquest(pacified(id), NOW + 1, LV);
      expect(breach(m)).toBeUndefined();
    }
  });
});
