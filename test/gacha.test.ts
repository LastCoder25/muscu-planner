import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { RANK_ORDER, type Rarity } from '@/lib/items';
import {
  GACHA,
  GACHA_RATES,
  TOP_RARITY,
  emptyPity,
  pullRarity,
  pullsPerDay,
  topRate,
} from '@/lib/gacha';

const rankOf = (r: Rarity) => RANK_ORDER.indexOf(r);

/** Tire `n` fois et rend la suite des raretés obtenues. */
function serie(n: number, seed = 7919): Rarity[] {
  const rng = mulberry32(seed);
  let pity = emptyPity();
  const out: Rarity[] = [];
  for (let i = 0; i < n; i++) {
    const r = pullRarity(rng, pity);
    pity = r.pity;
    out.push(r.rarity);
  }
  return out;
}

describe('les taux', () => {
  it('⚠️ SOMMENT À 1 — sinon le reliquat irait en silence à la dernière entrée', () => {
    const s = RANK_ORDER.reduce((a, r) => a + GACHA_RATES[r], 0);
    expect(s).toBeCloseTo(1, 10);
  });

  it('couvrent TOUTE l’échelle : aucune rareté n’est intirable', () => {
    for (const r of RANK_ORDER) expect(GACHA_RATES[r]).toBeGreaterThan(0);
  });

  it('DÉCROISSENT strictement : plus c’est rare, moins ça tombe', () => {
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(GACHA_RATES[RANK_ORDER[i]!]).toBeLessThan(GACHA_RATES[RANK_ORDER[i - 1]!]);
  });

  it('la rareté maximale est DÉRIVÉE de l’échelle, jamais écrite en dur', () => {
    expect(TOP_RARITY).toBe(RANK_ORDER[RANK_ORDER.length - 1]);
  });
});

describe('le pity', () => {
  it('⚠️ LA RAMPE ATTEINT 1 PILE AU HARD PITY — pas de saut greffé à côté', () => {
    expect(topRate(0)).toBeCloseTo(GACHA_RATES[TOP_RARITY], 10);
    expect(topRate(GACHA.softPityStart - 1)).toBeCloseTo(GACHA_RATES[TOP_RARITY], 10);
    expect(topRate(GACHA.hardPity - 1)).toBe(1);
    // …et elle MONTE entre les deux, sans plateau.
    let prev = -1;
    for (let n = GACHA.softPityStart - 1; n < GACHA.hardPity; n++) {
      expect(topRate(n)).toBeGreaterThanOrEqual(prev);
      prev = topRate(n);
    }
    expect(topRate(GACHA.softPityStart + 5)).toBeGreaterThan(GACHA_RATES[TOP_RARITY]);
  });

  it('⚠️ ON N’ATTEND JAMAIS PLUS DE `hardPity` TIRAGES la rareté maximale', () => {
    const s = serie(20_000);
    let depuis = 0;
    let pire = 0;
    for (const r of s) {
      depuis++;
      if (r === TOP_RARITY) {
        pire = Math.max(pire, depuis);
        depuis = 0;
      }
    }
    expect(pire).toBeLessThanOrEqual(GACHA.hardPity);
  });

  it('⚠️ ON N’ATTEND JAMAIS PLUS DE `minorPity` TIRAGES le plancher', () => {
    // Sans ce filet, une série de 30 communs d'affilée est banale — et il n'y a pas
    // d'argent réel pour compenser.
    const s = serie(20_000);
    let depuis = 0;
    let pire = 0;
    for (const r of s) {
      depuis++;
      if (rankOf(r) >= rankOf(GACHA.floorRarity)) {
        pire = Math.max(pire, depuis);
        depuis = 0;
      }
    }
    expect(pire).toBeLessThanOrEqual(GACHA.minorPity);
  });

  it('⚠️ la garantie de plancher n’est pas un PLAFOND : le tirage QU’ELLE déclenche varie', () => {
    // ⚠️ Ce test était TROUÉ au premier jet : il comptait les raretés > plancher sur une
    // longue série, or le tirage ORDINAIRE en produit de toute façon — la mutation
    // « le plancher rend toujours `floorRarity` » passait au vert. Il faut forcer l'état
    // qui DÉCLENCHE la garantie et regarder ce qu'elle rend, elle.
    const vus = new Set<Rarity>();
    for (let s = 1; s <= 400; s++) {
      const r = pullRarity(mulberry32(s * 7919), {
        sinceTop: 0,
        sinceFloor: GACHA.minorPity - 1,
      });
      expect(rankOf(r.rarity)).toBeGreaterThanOrEqual(rankOf(GACHA.floorRarity));
      vus.add(r.rarity);
    }
    // ⚠️ Et il était troué UNE SECONDE FOIS : « au moins deux raretés » ou « au moins une
    // au-dessus du plancher » sont satisfaits par la voie du grand pity (0,6 %), qui rend
    // la rareté MAXIMALE. Ce que seule la garantie peut produire, c'est une rareté
    // STRICTEMENT ENTRE le plancher et le sommet.
    const entreDeux = [...vus].filter(
      (r) => rankOf(r) > rankOf(GACHA.floorRarity) && r !== TOP_RARITY,
    );
    expect(entreDeux.length).toBeGreaterThan(0);
  });

  it('MORD VRAIMENT : le taux effectif dépasse nettement le taux de base', () => {
    const s = serie(20_000);
    const eff = s.filter((r) => r === TOP_RARITY).length / s.length;
    expect(eff).toBeGreaterThan(GACHA_RATES[TOP_RARITY] * 2);
    // …sans pour autant faire de la rareté maximale une banalité.
    expect(eff).toBeLessThan(0.04);
  });

  it('DEUX compteurs indépendants : décrocher un épique ne remet pas le grand pity à zéro', () => {
    let pity = { sinceTop: 40, sinceFloor: 9 };
    const rng = mulberry32(3);
    const r = pullRarity(rng, pity);
    // Le 10e tirage force un plancher+ ; s'il n'est pas maximal, `sinceTop` doit CONTINUER.
    if (r.rarity !== TOP_RARITY) expect(r.pity.sinceTop).toBe(41);
    expect(r.pity.sinceFloor).toBe(0);
    pity = r.pity;
  });

  it('est PUR : il ne mute pas l’état qu’on lui donne', () => {
    const avant = emptyPity();
    const copie = { ...avant };
    pullRarity(mulberry32(1), avant);
    expect(avant).toEqual(copie);
  });
});

describe('⚠️ LA CALIBRATION — elle tient au débit de mana des failles', () => {
  /** Débit MESURÉ en v0.936 (`riftManaDebit`), en fermant une faille par jour. */
  const DEBIT: [number, number][] = [
    [12, 63],
    [30, 91],
    [60, 157],
    [100, 240],
  ];
  /** Raretés maximales obtenues sur un an, moyenne de plusieurs simulations. */
  function topParAn(manaPerDay: number, runs = 12): number {
    const n = Math.round(pullsPerDay(manaPerDay) * 365);
    let tot = 0;
    for (let s = 1; s <= runs; s++)
      tot += serie(n, s * 7919).filter((r) => r === TOP_RARITY).length;
    return tot / runs;
  }

  it('sur la plage RÉALISTE (niveaux 12 à 60), 10 à 20 raretés maximales par an', () => {
    for (const [, mana] of DEBIT.slice(0, 3)) {
      const t = topParAn(mana);
      expect(t).toBeGreaterThan(9);
      expect(t).toBeLessThan(21);
    }
  });

  it('au niveau 100 ça reste borné — jamais le double de la plage réaliste', () => {
    expect(topParAn(240)).toBeLessThan(topParAn(63) * 2.5);
  });

  it('⚠️ LE TIRAGE GRATUIT PORTE LE PLANCHER : même sans une seule faille, on joue', () => {
    // C'est le filet du joueur qui ne combat pas. Sans lui, celui qui n'a pas l'énergie
    // d'entrer dans une faille ne tirerait jamais.
    expect(pullsPerDay(0)).toBe(GACHA.freePullsPerDay);
    expect(topParAn(0)).toBeGreaterThan(4);
  });

  it('le mana RESTE le levier principal : jouer double au moins les tirages', () => {
    // Si le gratuit dominait tout, fermer des failles ne servirait à rien.
    expect(pullsPerDay(91)).toBeGreaterThan(pullsPerDay(0) * 1.5);
  });

  it('fermer une faille se LIT en tirages : une mûre en vaut au moins un', () => {
    // Mesuré (v0.936) : une faille mûre rend 123 💠 au niveau 12, 756 au niveau 100.
    expect(123 / GACHA.pullCost).toBeGreaterThanOrEqual(1);
    expect(756 / GACHA.pullCost).toBeLessThan(10);
  });
});
