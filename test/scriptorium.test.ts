import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  ensureControls,
  runeHoursFor,
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
  // 2026-09-28 (demandé : « comme les autres lieux fixes ») : jusqu'à 3 copistes, et la
  // copie va plus ou moins vite selon l'effectif.
  it('cinq places, comme les autres lieux qui produisent pour le joueur', () => {
    expect(seatsOf('scriptorium')).toBe(seatsOf('mine'));
    expect(seatsOf('scriptorium')).toBe(5);
    expect(pt(held()).control!.garrison).toEqual(['a', 'b', 'c']);
  });

  /** La copie à `h` heures avec `garrison` copistes, sans reprise ennemie. */
  const at = (garrison: string[], h: number) => {
    const p = pt(held());
    const q = { ...p, control: { ...p.control!, garrison, attackAt: 1e15 } };
    return { n: runeStock(q, h * H), prog: runeProgress(q, h * H) };
  };

  it('une rune en 24 h à trois copistes, 30 h à deux, 48 h à un seul', () => {
    expect(CONTROL.runeHoursPerItem).toBe(24);
    expect(runeHoursFor(3)).toBe(24);
    expect(runeHoursFor(2)).toBe(30);
    expect(runeHoursFor(1)).toBe(48);
    expect(runeHoursFor(0)).toBeNull();
    expect(at(['a', 'b', 'c'], 12)).toEqual({ n: 0, prog: 0.5 });
    expect(at(['a', 'b', 'c'], 24).n).toBe(1);
    expect(at(['a', 'b'], 29).n).toBe(0);
    expect(at(['a', 'b'], 30).n).toBe(1);
    // Un seul copiste : le rythme d'avant, inchangé.
    expect(at(['a'], 24)).toEqual({ n: 0, prog: 0.5 });
    expect(at(['a'], 48).n).toBe(1);
    expect(at([], 100).prog).toBe(0);
  });

  it('une seule rune attend d’être ramassée, quel que soit l’effectif', () => {
    // ⚠️ Sans la ramasser, la suivante ne commence pas — même à trois copistes.
    expect(at(['a', 'b', 'c'], 10 * 24)).toEqual({ n: 1, prog: 1 });
    expect(at(['a'], 10 * 48)).toEqual({ n: 1, prog: 1 });
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
