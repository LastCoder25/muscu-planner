import { describe, expect, it } from 'vitest';
import { CHAMP_SHOW_SHARE, champShowK, champStat, fmtChampDelta } from '@/lib/champDisplay';
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
