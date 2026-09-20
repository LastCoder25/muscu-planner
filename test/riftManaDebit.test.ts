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
  let map = createMap(seed, T0, level);
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
    map = advanceWorld(map, t, level);
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
  it('⚠️ ACCÉLÈRE VRAIMENT : les 2 derniers jours pèsent plus que leur part du temps', () => {
    const r = { id: 'r', level: 30, spawnedAt: T0 };
    const mur = riftClearMana(r, T0 + LIFE);
    const cinq = riftClearMana(r, T0 + (5 * LIFE) / 7);
    const part = (mur - cinq) / mur;
    // 2 jours sur 7 = 28,6 % si la courbe était plate. Mesuré : ~42 %.
    expect(part).toBeGreaterThan(0.35);
    // …mais pas au point de rendre les 5 premiers jours stériles (cf. le test suivant).
    expect(part).toBeLessThan(0.5);
  });

  it('⚠️ À MI-VIE, une faille vaut déjà une part RÉELLE — c’est ce qui borne l’exposant', () => {
    // La borne « les 2 derniers jours » seule ne suffit pas : mesuré, un exposant de 3 ou
    // 4 la satisfait encore tout en VIDANT le milieu de la courbe (25 % à mi-vie au lieu
    // de 42 %). Une faille de 3-4 jours serait alors sans intérêt, et le joueur n'aurait
    // plus qu'un seul bon moment pour agir au lieu d'une fenêtre.
    const r = { id: 'r', level: 30, spawnedAt: T0 };
    const mi = riftClearMana(r, T0 + LIFE / 2) / riftClearMana(r, T0 + LIFE);
    expect(mi).toBeGreaterThan(0.3);
  });

  it('⚠️ FERMER TÔT PAIE QUAND MÊME — sinon le harcèlement contredirait le mana', () => {
    // Le harcèlement des convois (v0.934) pousse à fermer VITE ; le mana pousse à
    // ATTENDRE. Les deux ne peuvent coexister que si une faille jeune vaut quelque chose.
    const r = { id: 'r', level: 30, spawnedAt: T0 };
    const jeune = riftClearMana(r, T0);
    expect(jeune).toBeGreaterThan(0);
    expect(riftPopulation(r, T0)).toBeGreaterThanOrEqual(2);
    // Au moins un dixième de ce que vaut une faille mûre : petit, jamais nul.
    expect(jeune / riftClearMana(r, T0 + LIFE)).toBeGreaterThan(0.1);
  });
});

describe('⚠️ L’ARBITRAGE ATTENDRE / NETTOYER — une propriété, pas un défaut', () => {
  it('fermer VITE rend MOINS de mana que fermer au bon moment', () => {
    // Mesuré (niveau 30) : 1 fermeture/jour → ~91 💠/j ; 2/jour → ~66 💠/j. En fermant au
    // rythme de spawn on ne prend que des failles JEUNES, donc pauvres.
    // ⚠️ C'est exactement la tension voulue : le même geste (fermer vite) garde les routes
    // propres (v0.934 : 21 % → 1 % d'irradiation) et COÛTE du mana. Personne ne doit
    // « corriger » ça — c'est ce qui donne une décision au joueur.
    const lent = moy(1, 30, 'ferme');
    const rapide = moy(2, 30, 'ferme');
    expect(lent).toBeGreaterThan(rapide * 1.15);
  });

  it('…mais tout ignorer reste le PIRE des trois : la passivité ne nourrit pas le gacha', () => {
    const rien = moy(0, 30);
    expect(rien).toBeLessThan(moy(2, 30) * 0.5);
    expect(rien).toBeLessThan(moy(1, 30) * 0.3);
  });
});

describe('le débit, niveau par niveau', () => {
  it('monte avec le niveau, sans jamais s’emballer', () => {
    const d = [12, 30, 60, 100].map((l) => moy(1, l));
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThan(d[i - 1]!);
    // Du niveau 12 au 100 : mesuré ~63 → ~240 💠/j, soit ×3,8. Une croissance DOUCE —
    // le mana ne doit pas suivre la courbe de puissance (~L⁴), sinon le gacha
    // s'effondrerait en fin de partie.
    expect(d[3]! / d[0]!).toBeLessThan(6);
    expect(d[3]! / d[0]!).toBeGreaterThan(2);
  });

  it('⚠️ LA BANDE DE RÉFÉRENCE DU GACHA — à recalibrer ensemble si on la déplace', () => {
    // Joueur qui ferme une faille par jour : c'est le régime de référence.
    expect(moy(1, 12)).toBeGreaterThan(35);
    expect(moy(1, 12)).toBeLessThan(110);
    expect(moy(1, 100)).toBeGreaterThan(140);
    expect(moy(1, 100)).toBeLessThan(400);
  });

  it('un joueur PASSIF touche quand même un filet, par les mines résiduelles', () => {
    // La boucle « je ne combats pas » (convois) doit atteindre le gacha, lentement.
    for (const l of [12, 30, 60, 100]) expect(moy(0, l, 'mines')).toBeGreaterThan(5);
  });
});
