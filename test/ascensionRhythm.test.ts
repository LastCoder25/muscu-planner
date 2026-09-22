// ⬆️ LE RYTHME DES ASCENSIONS — mesuré (v0.1017, étape E). Un champion bloqué au ★5 du rang
// précédent ne gagne que 0 à 26 % de ses embuscades (contre 75-91 % à niveau) : si les sceaux
// n'arrivent pas à temps, les convois du joueur s'effondrent. Cette sonde simule deux ans de
// jeu avec les VRAIES règles (courbe de niveaux, coût en sceaux, rang des failles uniforme
// entre Bronze et celui du joueur, 1 ou 2 sceaux par faille).
import { describe, expect, it } from 'vitest';
import { computeLevel } from '@/lib/levels';
import { CHARACTER_RANKS, characterRank, rankStartLevel } from '@/lib/characterRank';
import { ascensionCost } from '@/lib/ascension';
import { RIFT } from '@/lib/rift';
import { mulberry32 } from '@/lib/combat';
import { PROFILS, yearOfPlay } from './helpers/buildSim';

const LAST = CHARACTER_RANKS.length - 1;
const capOf = (rank: number) => (rank >= LAST ? 100 : rankStartLevel(rank + 1) - 1);

/** Part des jours où le trio de tête a 5 niveaux de retard ou plus sur le joueur. */
function trioStuckShare(xpDay: number, riftsPerDay: number, seed: number): number {
  const rng = mulberry32(seed);
  const seals: number[] = Array(CHARACTER_RANKS.length).fill(0);
  const ranks = [0, 0, 0, 0];
  let xp = 0;
  let stuck = 0;
  let days = 0;
  for (let d = 0; d < 730; d++) {
    xp += xpDay;
    const L = Math.min(100, computeLevel(xp).level);
    const r = characterRank(L).rankIndex;
    for (let i = 0; i < riftsPerDay; i++)
      // Une faille sur deux est refermée avant la moitié de sa maturation (2 sceaux, v0.1047).
      seals[Math.floor(rng() * (r + 1))]! += rng() < RIFT.secondSealAt ? 2 : 1;
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < ranks.length; i++) {
        if (L <= capOf(ranks[i]!) || ranks[i]! >= r) continue;
        const t = ranks[i]! + 1;
        const need = ascensionCost(t).seals;
        if (seals[t]! >= need) {
          seals[t]! -= need;
          ranks[i] = t;
        }
      }
    if (d < 30) continue;
    days++;
    if (ranks.slice(0, 3).some((k) => L - Math.min(L, capOf(k)) >= 5)) stuck++;
  }
  return stuck / days;
}

const mean = (f: (s: number) => number) =>
  Array.from({ length: 20 }, (_, i) => f(i + 1)).reduce((a, b) => a + b, 0) / 20;

describe('⬆️ les sceaux arrivent à temps pour le trio de tête', () => {
  it('une faille par jour : le trio n’est bloqué que rarement', () => {
    for (const [, xpd] of PROFILS)
      expect(mean((s) => trioStuckShare(xpd, 1, s))).toBeLessThan(0.18);
  });
  it('deux failles par jour : quasiment jamais', () => {
    for (const [, xpd] of PROFILS)
      expect(mean((s) => trioStuckShare(xpd, 2, s))).toBeLessThan(0.04);
  });
  it('mais l’ascension n’est pas une formalité : sans faille, le trio reste bloqué', () => {
    expect(mean((s) => trioStuckShare(1066, 0, s))).toBeGreaterThan(0.5);
  });
  it('…et un joueur très actif qui n’en ferme qu’une par jour sent le frein', () => {
    // Mesuré : 14 % à 1 + ⌊rang/4⌋ ; un coût de 1 fixe tombait à 1 % (formalité).
    expect(mean((s) => trioStuckShare(1066, 1, s))).toBeGreaterThan(0.05);
  });
});

describe('💰 l’or des ascensions tient dans le puits', () => {
  it('10 champions montés avec leurs 4 pièces : la part du plafond reste dans 55-90 %', () => {
    for (const [, xpd] of PROFILS) {
      const p = yearOfPlay(xpd, undefined, 10).part;
      expect(p).toBeGreaterThan(0.55);
      expect(p).toBeLessThan(0.9);
    }
  });
  it('et elles COÛTENT : la part baisse face à un joueur qui n’en fait aucune', () => {
    for (const [, xpd] of PROFILS)
      expect(yearOfPlay(xpd, undefined, 10).part).toBeLessThan(yearOfPlay(xpd).part);
  });
});
