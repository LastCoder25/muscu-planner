// ⬆️ LE RYTHME DES ASCENSIONS — mesuré (v0.1017, étape E). Un champion bloqué au ★5 du rang
// précédent ne gagne que 0 à 26 % de ses embuscades (contre 75-91 % à niveau) : si les sceaux
// n'arrivent pas à temps, les convois du joueur s'effondrent. Cette sonde simule deux ans de
// jeu avec les VRAIES règles (courbe de niveaux, coût en sceaux, rang des failles uniforme
// entre Bronze et celui du joueur, 1 ou 2 sceaux par faille).
import { describe, expect, it } from 'vitest';
import { computeLevel } from '@/lib/levels';
import { CHARACTER_RANKS, characterRank, rankStartLevel } from '@/lib/characterRank';
import { ascensionCost } from '@/lib/ascension';
import { RUINS_SEALS } from '@/lib/expedition';
import { mulberry32 } from '@/lib/combat';
import { PROFILS, yearOfPlay } from './helpers/buildSim';

const LAST = CHARACTER_RANKS.length - 1;
const capOf = (rank: number) => (rank >= LAST ? 100 : rankStartLevel(rank + 1) - 1);

/** Part des jours où le trio de tête a 5 niveaux de retard ou plus sur le joueur. */
// 🏛️ Depuis le 2026-09-27, les sceaux de champion viennent des RUINES ANCIENNES (une ruine
// sur deux), `RUINS_SEALS.championPerRank` × (1 + rang du lieu) depuis la v1.89.0. `ruinsPerDay` compte ces ruines-là, et
// peut être fractionnaire (0,5 = une tous les deux jours). ⚠️ Les mesures d'avant parlaient
// de failles (1,5 sceau en moyenne) : à 3 sceaux par ruine, 0,5 ruine/jour vaut une faille
// par jour d'avant, 1 ruine/jour deux failles.
// ⚠️ SANS RANG depuis la v1.50 : tout sceau sert à toute ascension, d'où une RÉSERVE unique
// (avant : un compte par rang, et seul le rang exact payait).
function trioStuckShare(xpDay: number, ruinsPerDay: number, seed: number): number {
  const rng = mulberry32(seed);
  let seals = 0;
  const ranks = [0, 0, 0, 0];
  let xp = 0;
  let stuck = 0;
  let days = 0;
  for (let d = 0; d < 730; d++) {
    xp += xpDay;
    const L = Math.min(100, computeLevel(xp).level);
    const r = characterRank(L).rankIndex;
    const visits = Math.floor(ruinsPerDay) + (rng() < ruinsPerDay % 1 ? 1 : 0);
    // 🔱 v1.89.0 : le rang de la ruine (tiré entre Bronze et celui du joueur) fixe ses sceaux.
    for (let i = 0; i < visits; i++) {
      const rank = Math.floor(rng() * (r + 1));
      seals += RUINS_SEALS.championPerRank * (1 + rank);
    }
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < ranks.length; i++) {
        if (L <= capOf(ranks[i]!) || ranks[i]! >= r) continue;
        const t = ranks[i]! + 1;
        const need = ascensionCost(t).seals;
        if (seals >= need) {
          seals -= need;
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
  it('une ruine tous les deux jours : le trio n’est bloqué que rarement', () => {
    for (const [, xpd] of PROFILS)
      expect(mean((s) => trioStuckShare(xpd, 0.5, s))).toBeLessThan(0.18);
  });
  it('une ruine par jour : quasiment jamais', () => {
    for (const [, xpd] of PROFILS)
      expect(mean((s) => trioStuckShare(xpd, 1, s))).toBeLessThan(0.04);
  });
  it('mais l’ascension n’est pas une formalité : sans ruine, le trio reste bloqué', () => {
    expect(mean((s) => trioStuckShare(1066, 0, s))).toBeGreaterThan(0.5);
  });
});

// 🔱 LE VIVIER ENTIER (v1.89.0, demandé : « on a pas mal de champions, et plus on avance plus
// on en a »). Le trio de tête ne dit rien du reste : 1 + niveau/2 champions à monter, à une
// ruine de sceaux de champion toutes les 1,2 jours (le débit mesuré sur de vraies cartes).
// Part des champions-jours bloqués de 5 niveaux ou plus. Mesuré : 3 sceaux fixes → 72 / 96 /
// 99 % (tranquille / régulier / très actif) ; 3 × (1 + rang) → 0 / 42 / 74 % ; 4 × (1 + rang)
// → 0 / 1 / 37 % ; 5 → 0 / 0 / 15 % ; 6 → 0 / 0 / 1 % ; 9 → 0 / 0 / 0 %.
// ⚖️ 2026-10-08 (décision de l'utilisateur, « champion = objet ») : 9 × (1 + rang), comme les
// sceaux d'objet — le même besoin appelle la même offre. Les sceaux de champion ne freinent
// donc PLUS le vivier ; ce qui borne la montée, c'est le niveau du joueur (le sport).
function rosterBlockedShare(xpDay: number, seed: number): number {
  const rng = mulberry32(seed);
  let seals = 0;
  const ranks: number[] = [];
  let xp = 0;
  let blocked = 0;
  let total = 0;
  for (let d = 0; d < 730; d++) {
    xp += xpDay;
    const L = Math.min(100, computeLevel(xp).level);
    const r = characterRank(L).rankIndex;
    while (ranks.length < 1 + Math.floor(L / 2)) ranks.push(0);
    if (rng() < 0.83) seals += RUINS_SEALS.championPerRank * (1 + Math.floor(rng() * (r + 1)));
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < ranks.length; i++) {
        if (L <= capOf(ranks[i]!) || ranks[i]! >= r) continue;
        const need = ascensionCost(ranks[i]! + 1).seals;
        if (seals >= need) {
          seals -= need;
          ranks[i] = ranks[i]! + 1;
        }
      }
    if (d < 30) continue;
    for (const k of ranks) {
      total++;
      if (L - Math.min(L, capOf(k)) >= 5) blocked++;
    }
  }
  return blocked / total;
}

describe('🔱 le vivier entier suit le rythme des sceaux de ruine', () => {
  const m = (xpd: number) =>
    Array.from({ length: 10 }, (_, i) => rosterBlockedShare(xpd, i + 1)).reduce(
      (a, b) => a + b,
      0,
    ) / 10;
  it('un joueur tranquille ne bute pas, un joueur régulier en garde moins de la moitié bloqués', () => {
    expect(m(PROFILS[0]![1])).toBeLessThan(0.1);
    expect(m(PROFILS[1]![1])).toBeLessThan(0.6);
  });
  it('⚖️ offre = besoin (2026-10-08) : même le joueur très actif n’est plus bloqué par les sceaux', () => {
    expect(m(PROFILS[2]![1])).toBeLessThan(0.05);
  });
});

describe('💰 l’or des ascensions tient dans le puits', () => {
  it('10 champions montés avec leurs 4 pièces : la part du plafond reste dans 55-90 %', () => {
    for (const [, xpd] of PROFILS) {
      const p = yearOfPlay(xpd, undefined, 10).part;
      expect(p).toBeGreaterThan(0.55);
      expect(p).toBeLessThan(0.9);
    }
  }, 180_000); // ⚠️ le modèle de revenu échantillonne de vraies cartes (v0.1153)
  it('et elles COÛTENT : la part baisse face à un joueur qui n’en fait aucune', () => {
    for (const [, xpd] of PROFILS)
      expect(yearOfPlay(xpd, undefined, 10).part).toBeLessThan(yearOfPlay(xpd).part);
  });
});
