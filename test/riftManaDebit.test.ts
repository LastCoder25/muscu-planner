import { describe, it, expect } from 'vitest';
import {
  EXPE,
  createMap,
  advanceWorld,
  isRiftPoi,
  harvestYield,
  travelFactor,
  travelOneWayMin,
} from '@/lib/expedition';
import { riftClearMana, riftPopulation } from '@/lib/rift';

const H = 3600_000;
const DAY = 24 * H;
const T0 = 1_700_000_000_000;
const LIFE = EXPE.lifespanMs.rift;

/**
 * 💠 LE DÉBIT DE MANA — l'entrée du gacha de champions.
 *
 * ⚠️ Ces bornes ne sont pas cosmétiques : le mana n'a qu'UN puits (le gacha), donc ce
 * fichier fixe le rythme auquel on y accède. Les coûts du gacha se calibreront SUR ces
 * chiffres — les déplacer sans re-calibrer le gacha romprait le lien.
 */
function debit(perDay: number, level: number, seed: number, days = 30) {
  let map = createMap(seed, T0, level, level);
  let budget = 0;
  let ferme = 0;
  let mines = 0;
  for (let t = T0 + H; t <= T0 + days * DAY; t += H) {
    budget += perDay * (H / DAY);
    while (budget >= 1) {
      const rifts = map.pois.filter(isRiftPoi).sort((a, b) => a.spawnedAt - b.spawnedAt);
      if (!rifts.length) break;
      const cible = rifts[0]!;
      ferme += riftClearMana(cible, t);
      map = { ...map, pois: map.pois.filter((p) => p.id !== cible.id) };
      budget -= 1;
    }
    const avant = new Set(map.pois.filter((p) => p.type === 'mana_mine').map((p) => p.id));
    map = advanceWorld(map, t, level, level);
    // Toute mine NOUVELLE est réputée récoltée par un convoi — c'est sa raison d'être.
    for (const p of map.pois) {
      if (p.type === 'mana_mine' && !avant.has(p.id)) {
        const ar = (2 * travelOneWayMin(p.level, p.distNorm)) / 60;
        mines += harvestYield('mana_mine', p.level, travelFactor(ar)).mana ?? 0;
      }
    }
  }
  return { ferme: ferme / days, mines: mines / days, total: (ferme + mines) / days };
}
const moy = (perDay: number, level: number, k: 'ferme' | 'mines' | 'total' = 'total') =>
  [1, 2, 3, 4].reduce((a, s) => a + debit(perDay, level, s * 7919)[k], 0) / 4;

describe('la courbe de population', () => {
  it('⚠️ LA FAILLE SE PEUPLE EN VIEILLISSANT : plus dure, pour AUCUN mana de plus (v0.1047)', () => {
    // C'est ce qui crée l'urgence : l'effectif (donc la difficulté) accélère sur la fin, et
    // le mana, lui, est fixe. Attendre ne coûte que du risque.
    const r = { id: 'r', level: 30, spawnedAt: T0 };
    expect(riftPopulation(r, T0 + LIFE)).toBeGreaterThan(riftPopulation(r, T0) * 3);
    expect(riftClearMana(r)).toBe(riftClearMana({ level: 30 }));
  });
});

describe('⚠️ FERMER VITE PAIE — l’effort, pas l’attente (v0.1047)', () => {
  it('le mana suit le NOMBRE de failles fermées', () => {
    // Avant (mana selon l'âge), 1 fermeture/jour rendait PLUS que 2 : attendre payait. Mesuré
    // désormais au niveau 30 : 57 / 108 / 161 💠/j pour 1 / 2 / 3 fermetures par jour.
    const un = moy(1, 30, 'ferme');
    const deux = moy(2, 30, 'ferme');
    const trois = moy(3, 30, 'ferme');
    expect(deux).toBeGreaterThan(un * 1.6);
    expect(trois).toBeGreaterThan(deux * 1.3);
  });

  it('…mais tout ignorer reste le PIRE des trois : la passivité ne nourrit pas le gacha', () => {
    const rien = moy(0, 30);
    expect(rien).toBeLessThan(moy(2, 30) * 0.5);
    expect(rien).toBeLessThan(moy(1, 30) * 0.3);
  });
});

describe('le débit, niveau par niveau', () => {
  it('monte avec le niveau, sans jamais s’emballer', () => {
    const d = [12, 30, 60, 100].map((l) => moy(2, l));
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThan(d[i - 1]!);
    // Du niveau 12 au 100 : mesuré ~66 → ~255 💠/j (2 fermetures/j), ×3,9. Une croissance DOUCE —
    // le mana ne doit pas suivre la courbe de puissance (~L⁴), sinon le gacha
    // s'effondrerait en fin de partie.
    expect(d[3]! / d[0]!).toBeLessThan(6);
    expect(d[3]! / d[0]!).toBeGreaterThan(2);
  });

  it('⚠️ LA BANDE DE RÉFÉRENCE DU GACHA — à recalibrer ensemble si on la déplace', () => {
    // ⚠️ RÉGIME DE RÉFÉRENCE : DEUX fermetures par jour (v0.1047). Le mana étant fixe par
    // faille, c'est ce rythme qui retrouve le débit d'avant (une par jour, au mana d'âge) :
    // mesuré 66 / 108 / 170 / 255 💠/j aux niveaux 12 / 30 / 60 / 100, contre 71 / 117 / 189 /
    // 240 avant — environ un tirage (110 💠) par jour.
    expect(moy(2, 12)).toBeGreaterThan(35);
    expect(moy(2, 12)).toBeLessThan(110);
    expect(moy(2, 100)).toBeGreaterThan(140);
    expect(moy(2, 100)).toBeLessThan(400);
  });

  it('un joueur PASSIF touche quand même un filet, par les mines résiduelles', () => {
    // La boucle « je ne combats pas » (convois) doit atteindre le gacha, lentement.
    // ⚠️ Plus mince depuis la v0.1047 (mine ÷~3 pour que fermer vaille ~3× l'ignorer) :
    // mesuré 3,7 / 13 / 33 / 56 💠/j aux niveaux 12 / 30 / 60 / 100 — un filet, jamais nul.
    for (const l of [12, 30, 60, 100]) expect(moy(0, l, 'mines')).toBeGreaterThan(2);
  });
});
