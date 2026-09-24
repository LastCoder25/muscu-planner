import { describe, expect, it } from 'vitest';
import {
  CHAMP_SHOW_SHARE,
  champShowK,
  champStat,
  fmtChampDelta,
  realGearTexts,
} from '@/lib/champDisplay';
import { refChampionAdv } from '@/lib/caravan';
import { adventurerPowers } from '@/lib/raid';
import { refFighter } from '@/lib/proceduralContent';
import { combatPower } from '@/lib/combat';
import { gearedFighter } from './helpers/gearedFighter';

const champAt = (L: number) => {
  const a = refChampionAdv(L);
  return adventurerPowers([a]).get(a.id)!;
};

describe('🏅 l’échelle d’affichage des champions', () => {
  it('un champion à ton niveau s’affiche à 40 % du héros NU (dès que l’échelle dépasse 1)', () => {
    for (const L of [10, 30, 50, 80, 100]) {
      const shown = champAt(L) * champShowK(L);
      expect(shown / combatPower(refFighter(L)), `niveau ${L}`).toBeGreaterThanOrEqual(CHAMP_SHOW_SHARE - 1e-9);
    }
  });

  it('il reste BIEN SOUS le héros équipé à tout niveau (demandé : « bien moins que le héros »)', () => {
    for (const L of [5, 10, 20, 30, 50, 80]) {
      const shown = champAt(L) * champShowK(L);
      expect(shown, `niveau ${L}`).toBeLessThan(combatPower(gearedFighter(L)) * 0.6);
    }
  }, 120_000);

  it('l’échelle ne fait jamais PERDRE de valeur, et monte avec le joueur', () => {
    let prev = 0;
    for (let L = 1; L <= 100; L++) {
      const k = champShowK(L);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k, `niveau ${L}`).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });

  it('un +5 % d’ascension se VOIT : à l’échelle du niveau 30, bien plus que « +1 »', () => {
    const p = champAt(30);
    const d = fmtChampDelta(p, p * 1.05, champShowK(30));
    expect(Number(d.replace(/[^\d]/g, ''))).toBeGreaterThan(20);
  });

  it('les stats suivent la MÊME échelle que la puissance', () => {
    const k = champShowK(40);
    expect(champStat(21, k)).toBe(Math.round(21 * k));
  });

  it('la puissance d’un champion n’est plus arrondie (sinon l’écran perd les petits gains)', () => {
    expect(Number.isInteger(champAt(10))).toBe(false);
  });
});

describe('🗡️ les stats d’une pièce en valeur réelle', () => {
  const base = { damage: 485, pv: 1260 };
  const g = (type: 'damage_pct' | 'max_pv_pct' | 'crit_pct', value: number, level = 1) =>
    ({ effect: { type, value }, level }) as Parameters<typeof realGearTexts>[0];

  it('dégâts et PV : ce qu’ils AJOUTENT au porteur, à l’échelle d’affichage', () => {
    // 1,4 % de 485 dégâts, ×10 à l'affichage = +68.
    expect(realGearTexts(g('damage_pct', 1.4), base, 10)).toEqual(['+68 dégâts']);
    expect(realGearTexts(g('max_pv_pct', 2), base, 1)).toEqual(['+25 PV']);
  });

  it('suit le multiplicateur du COMBAT (niveau d’objet) — jamais une seconde formule', () => {
    const plain = realGearTexts(g('damage_pct', 10, 1), base, 1)[0];
    const leveled = realGearTexts(g('damage_pct', 10, 60), base, 1)[0];
    expect(leveled).not.toBe(plain);
  });

  it('une chance reste en % : on n’invente pas d’unité', () => {
    expect(realGearTexts(g('crit_pct', 0.7), base, 10)[0]).toContain('%');
  });

  it('la seconde stat suit la même règle', () => {
    const two = { effect: { type: 'damage_pct', value: 1 }, effect2: { type: 'crit_pct', value: 0.5 }, level: 1 } as Parameters<typeof realGearTexts>[0];
    expect(realGearTexts(two, base, 1)).toHaveLength(2);
  });
});
