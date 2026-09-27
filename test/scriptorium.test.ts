import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  ensureControls,
  runeProgress,
  runeStock,
  seatsOf,
} from '@/lib/controlPoints';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { placeRuneOdds, type RuneTier } from '@/lib/skillRunes';
import { characterRank } from '@/lib/characterRank';

const H = 3600_000;
const ID = controlIdOf('scriptorium');
const held = (seed = 3, L = 30): ExpeditionMap =>
  captureControl(ensureControls(createMap(seed, 0, L, 1), 0, L), ID, ['a', 'b', 'c'], 0, 7);
const pt = (m: ExpeditionMap) => m.pois.find((p) => p.id === ID)!;

describe('📜 le Scriptorium', () => {
  it('un point fixe à UNE place, comme le jardin', () => {
    expect(seatsOf('scriptorium')).toBe(1);
    // L'équipe qui le prend peut être plus nombreuse : un seul copiste reste.
    expect(pt(held()).control!.garrison).toEqual(['a']);
  });

  it('une rune toutes les 48 h, et une seule attend d’être ramassée', () => {
    const p = pt(held());
    const at = (h: number) => {
      // L'attaque ennemie arrête la production : on la repousse pour mesurer la copie seule.
      const q = { ...p, control: { ...p.control!, attackAt: 1e15 } };
      return { n: runeStock(q, h * H), prog: runeProgress(q, h * H) };
    };
    expect(at(24)).toEqual({ n: 0, prog: 0.5 });
    expect(at(CONTROL.runeHoursPerItem).n).toBe(1);
    // ⚠️ La réserve ne tient qu'une rune : sans la ramasser, la suivante ne commence pas.
    expect(at(10 * CONTROL.runeHoursPerItem).n).toBe(1);
  });

  it('ramasser rend la rune, à la couleur que permet le rang du lieu', () => {
    const counts: Record<RuneTier, number> = { green: 0, blue: 0, violet: 0, gold: 0 };
    let odds: Record<RuneTier, number> | null = null;
    for (let seed = 1; seed <= 400; seed++) {
      const m0 = held(seed);
      const p = pt(m0);
      const m = {
        ...m0,
        pois: m0.pois.map((q) =>
          q.id === ID ? { ...q, control: { ...q.control!, attackAt: 1e15 } } : q,
        ),
      };
      const c = collectControl(m, ID, CONTROL.runeHoursPerItem * H, 30);
      expect(c.runes).toHaveLength(1);
      counts[c.runes[0]!]++;
      odds = placeRuneOdds({
        place: 'control',
        placeRankIndex: characterRank(p.level).rankIndex,
        playerRankIndex: characterRank(30).rankIndex,
      });
      // Une couleur que CE rang ne donne jamais ne sort jamais (rang du point, carte par carte).
      expect(odds[c.runes[0]!]).toBeGreaterThan(0);
    }
    // Les couleurs rares le restent : il y a plus de vertes que de dorées.
    expect(counts.green).toBeGreaterThan(counts.gold);
    expect(odds).not.toBeNull();
  });

  it('la récolte remet la copie à zéro, et un autre point ne rend jamais de rune', () => {
    const m = held();
    const q = { ...pt(m), control: { ...pt(m).control!, attackAt: 1e15 } };
    const mm = { ...m, pois: m.pois.map((x) => (x.id === ID ? q : x)) };
    const c = collectControl(mm, ID, CONTROL.runeHoursPerItem * H, 30);
    expect(runeStock(pt(c.map), CONTROL.runeHoursPerItem * H)).toBe(0);
    const mine = captureControl(mm, controlIdOf('mine'), ['z'], 0, 7);
    expect(collectControl(mine, controlIdOf('mine'), 20 * H, 30).runes).toEqual([]);
  });
});
