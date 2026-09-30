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
  TIER,
  tierYieldMult,
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

  it('une rune en 16 h à trois copistes, 20 h à deux, 32 h à un seul (bascule des runes, spec § 3)', () => {
    expect(CONTROL.runeHoursPerItem).toBe(16);
    expect(runeHoursFor(3)).toBe(16);
    expect(runeHoursFor(2)).toBe(20);
    expect(runeHoursFor(1)).toBe(32);
    expect(runeHoursFor(0)).toBeNull();
    expect(at(['a', 'b', 'c'], 8)).toEqual({ n: 0, prog: 0.5 });
    expect(at(['a', 'b', 'c'], 16).n).toBe(1);
    expect(at(['a', 'b'], 19).n).toBe(0);
    expect(at(['a', 'b'], 20).n).toBe(1);
    expect(at(['a'], 16)).toEqual({ n: 0, prog: 0.5 });
    expect(at(['a'], 32).n).toBe(1);
    expect(at([], 100).prog).toBe(0);
  });

  it('sans plafond : dix jours d’absence rendent dix jours de copie', () => {
    // ⚠️ 2026-09-29 (demandé : « supprime le plafond de 24 h ») : les runes ne s’arrêtent
    // plus à une seule en attente — tout ce qui a été copié arrive au retour.
    // 🏅 Chaque jour tenu à SON cran (+1 par 24 h, plafond 10 — 2026-09-30).
    const days = (n: number) =>
      Array.from({ length: n }, (_, d) => tierYieldMult(Math.min(TIER.max, d))).reduce(
        (x, y) => x + y,
        0,
      );
    const perDay = (k: number) => 24 / runeHoursFor(k)!;
    expect(at(['a', 'b', 'c'], 10 * 24).n).toBe(Math.floor(days(10) * perDay(3) + 1e-9));
    expect(at(['a'], 20 * 24).n).toBe(Math.floor(days(20) * perDay(1) + 1e-9));
  });

  it('ramasser rend une rune MULTICOLORE (sa couleur se tire à l’ouverture)', () => {
    const m0 = held();
    const m = {
      ...m0,
      pois: m0.pois.map((q) =>
        q.id === ID ? { ...q, control: { ...q.control!, attackAt: 1e15 } } : q,
      ),
    };
    expect(collectControl(m, ID, CONTROL.runeHoursPerItem * H, 30).runes).toBe(1);
  });

  it('la récolte remet la copie à zéro, et un autre point ne rend jamais de rune', () => {
    const m = held();
    const q = { ...pt(m), control: { ...pt(m).control!, attackAt: 1e15 } };
    const mm = { ...m, pois: m.pois.map((x) => (x.id === ID ? q : x)) };
    const c = collectControl(mm, ID, CONTROL.runeHoursPerItem * H, 30);
    expect(runeStock(pt(c.map), CONTROL.runeHoursPerItem * H)).toBe(0);
    const mine = captureControl(mm, controlIdOf('mine'), ['z'], 0, 7);
    expect(collectControl(mine, controlIdOf('mine'), 20 * H, 30).runes).toBe(0);
  });
});
