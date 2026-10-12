import { describe, expect, it } from 'vitest';
import { adviceLevels, crossingAdvice, type CrossingAdviceInput } from '@/lib/crossingAdvice';
import { ISLANDS } from '@/lib/archipelago';
import { refAdvGear, refChampionAdv } from '@/lib/caravan';

/** 🧭 Le conseil de traversée : prendre, tenir, rapporter. */
function input(
  current: number,
  hero: number,
  n: number,
  lag = 0,
  over: Partial<CrossingAdviceInput> = {},
): CrossingAdviceInput {
  const champions = Array.from({ length: n }, (_, k) => ({
    ...refChampionAdv(Math.max(1, hero - lag), k),
    id: `c${k}`,
  }));
  const advGear = champions.flatMap((c) => refAdvGear(c.level));
  return {
    current,
    heroLevel: hero,
    champions,
    kit: { advGear },
    engage: n,
    militia: 5,
    fort: 1.3,
    ...over,
  };
}

describe('🧭 les niveaux des lieux de l’île suivante', () => {
  it('du plancher de l’île au haut de TON rang, jamais au-delà du plafond', () => {
    const two = ISLANDS[1]!;
    expect(adviceLevels(two, 20)).toEqual({ lo: 21, hi: 21 });
    expect(adviceLevels(two, 25)).toEqual({ lo: 21, hi: 30 });
    expect(adviceLevels(two, 38)).toEqual({ lo: 21, hi: 40 });
    expect(adviceLevels(ISLANDS[4]!, 100)).toEqual({ lo: ISLANDS[4]!.minLevel, hi: 100 });
  });
});

describe('🧭 partir ou rester', () => {
  it('pas d’île après la dernière', () => {
    expect(crossingAdvice(input(5, 100, 6))).toBeNull();
  });
  it('dix champions à niveau : on peut partir', () => {
    const a = crossingAdvice(input(1, 25, 10))!;
    expect(a.verdict).toBe('go');
    expect(a.need).not.toBeNull();
    expect(a.need!).toBeLessThanOrEqual(5);
    expect(a.missing).toEqual([]);
  });
  it('des champions en retard d’un rang : reste et entraîne', () => {
    const a = crossingAdvice(input(1, 25, 10, 10))!;
    expect(a.verdict).toBe('train');
    expect(a.missing.join(' ')).toMatch(/champions/);
  });
  it('s’il faut toute l’équipe pour prendre un lieu, ça ne vaut pas le coup', () => {
    const a = crossingAdvice(input(1, 25, 3))!;
    expect(a.need).toBe(3);
    expect(a.verdict).toBe('train');
    expect(a.missing[0]).toContain('3 champions sur 3');
  });
  it('la moitié du vivier suffit : on part (3 sur 6)', () => {
    expect(crossingAdvice(input(1, 25, 6))!.verdict).toBe('go');
  });
  it('le Panthéon borne ce qu’on engage', () => {
    const a = crossingAdvice(input(1, 25, 10, 0, { engage: 2 }))!;
    expect(a.pool).toBe(2);
    expect(a.verdict).toBe('train');
  });
  it('sans milice à faire venir, on ne tiendra rien : en amener', () => {
    const a = crossingAdvice(input(1, 25, 10, 0, { militia: 0 }))!;
    expect(a.holdPct).toBe(0);
    expect(a.verdict).toBe('bring');
    expect(a.missing.join(' ')).toContain('5 miliciens de plus');
  });
  it('plus de milice et une enceinte plus haute tiennent mieux', () => {
    const few = crossingAdvice(input(1, 25, 10, 0, { militia: 2 }))!.holdPct;
    const full = crossingAdvice(input(1, 25, 10, 0, { militia: 5 }))!.holdPct;
    const walls = crossingAdvice(input(1, 25, 10, 0, { militia: 2, fort: 2 }))!.holdPct;
    expect(full).toBeGreaterThan(few);
    expect(walls).toBeGreaterThan(few);
  });
  // 🛡️ 2026-10-12 : champions et miliciens défendent ensemble — garder ceux qui ont pris le
  // lieu en garnison tient mieux, et c'est un choix (le conseil chiffre les deux).
  it('laisser en garnison les champions qui ont pris le lieu tient mieux que la milice seule', () => {
    const a = crossingAdvice(input(1, 25, 6, 0, { militia: 2 }))!;
    expect(a.keep).toBe(a.need);
    expect(a.holdKeepPct).not.toBeNull();
    expect(a.holdKeepPct!).toBeGreaterThan(a.holdPct);
  });
  it('sans champion capable de prendre, aucun à laisser', () => {
    const a = crossingAdvice(input(1, 25, 0))!;
    expect(a.keep).toBe(0);
    expect(a.holdKeepPct).toBeNull();
  });
  it('au-delà d’une garnison pleine, la milice ne compte plus', () => {
    const a = crossingAdvice(input(1, 25, 10, 0, { militia: 40 }))!;
    expect(a.militia).toBe(5);
  });
  it('l’île suivante rapporte plus quand le héros dépasse le plafond de la sienne', () => {
    const a = crossingAdvice(input(1, 25, 10))!;
    expect(a.gold.there).toBeGreaterThan(a.gold.here);
    expect(a.xp.there).toBeGreaterThan(a.xp.here);
  });
  it('les meilleurs d’abord : ajouter des recrues ne change pas ce qu’il faut', () => {
    const base = input(1, 25, 6);
    const extra = Array.from({ length: 4 }, (_, k) => ({
      ...refChampionAdv(1, k),
      id: `z${k}`,
    }));
    const a = crossingAdvice({
      ...base,
      champions: [...extra, ...base.champions],
      engage: 10,
    })!;
    expect(a.need).toBe(crossingAdvice(base)!.need);
  });
});
