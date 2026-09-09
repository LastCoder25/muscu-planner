import { describe, it, expect } from 'vitest';
import {
  comboChestReward,
  chestEffortMult,
  sessionStones,
  sessionGold,
  CHEST_REF_SETS,
  CHEST_MIN_MULT,
  CHEST_MAX_MULT,
} from '@/lib/comboChest';
import { HARVEST, travelOneWayMin, travelFactor } from '@/lib/expedition';

const LEVELS = [5, 12, 26, 40, 60, 100];
/** Une épave, mesurée avec la vraie formule — le repère de la ferraille. */
const wreck = (L: number) => {
  const rtH = (2 * travelOneWayMin(L, 0.5)) / 60;
  return Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * travelFactor(rtH));
};

describe('coffre de fin de Défi 360', () => {
  it('⚠️ LE NOMBRE D’EXERCICES N’ENTRE PAS DANS LE CALCUL — seules les séries comptent', () => {
    // Mesuré sur le générateur : « débutant intense » vaut 74 séries qu'il les répartisse
    // sur 6 ou 16 exercices. Payer les exercices reviendrait à payer un réglage de variété.
    // Le contrat est structurel : la fonction ne reçoit QUE des séries et un niveau.
    expect(comboChestReward(74, 26)).toEqual(comboChestReward(74, 26));
    expect(comboChestReward.length).toBe(2); // (sets, playerLevel) — aucun paramètre d'exos
  });

  it('⚠️ la bande reste BORNÉE sur tout l’éventail réel des 360 (29 → 135 séries)', () => {
    // Sans borne, l'écart ×4,66 du générateur se reporterait tel quel : à niveau égal,
    // cinq fois moins pour qui s'entraîne posément. C'est un rythme, pas une faute.
    for (const L of LEVELS) {
      const petit = comboChestReward(29, L);
      const gros = comboChestReward(135, L);
      const ratio = gros.scrap / petit.scrap;
      expect(ratio, `niveau ${L} : ×${ratio.toFixed(2)}`).toBeLessThanOrEqual(
        CHEST_MAX_MULT / CHEST_MIN_MULT + 0.01,
      );
      expect(ratio, `niveau ${L}`).toBeGreaterThan(1.5); // …mais l'écart reste NET
    }
  });

  it('le facteur d’effort vaut 1 sur un 360 moyen, et sature aux deux bouts', () => {
    expect(chestEffortMult(CHEST_REF_SETS)).toBeCloseTo(1, 5);
    expect(chestEffortMult(0)).toBe(CHEST_MIN_MULT);
    expect(chestEffortMult(9999)).toBe(CHEST_MAX_MULT);
    // Monotone : plus de séries ne peut jamais rapporter moins.
    let prev = 0;
    for (let s = 0; s <= 200; s += 5) {
      const v = chestEffortMult(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('⚠️ la FERRAILLE vaut ~2 épaves : sensible, sans détrôner la source de pointe', () => {
    for (const L of LEVELS) {
      const r = comboChestReward(CHEST_REF_SETS, L).scrap / wreck(L);
      expect(r, `niveau ${L} : ${r.toFixed(2)} épave(s)`).toBeGreaterThan(1);
      expect(r, `niveau ${L} : ${r.toFixed(2)} épave(s)`).toBeLessThan(3.5);
    }
  });

  it('⚠️ les PIERRES et l’OR valent ~UNE SÉANCE — réécrit après mesure', () => {
    // RÉÉCRIT. La version précédente calait les pierres sur « une tentative de boss » (6 🔮
    // au niveau 26) et l'or sur « symbolique ». Mesuré ensuite : UNE séance de sport donne
    // ~400 ⚡ → 10 donjons → **40 🔮** et 99 000 🪙. Le coffre pesait donc 15 % d'une
    // séance pour une SEMAINE de travail — invisible. L'ancien test verrouillait
    // précisément ce défaut ; il est réécrit, pas supprimé.
    for (const L of LEVELS) {
      const c = comboChestReward(CHEST_REF_SETS, L);
      const pS = c.summonStones / sessionStones(L);
      const pG = c.gold / sessionGold(L);
      expect(pS, `niveau ${L} : ${(pS * 100).toFixed(0)} % d'une séance en 🔮`).toBeGreaterThan(
        0.6,
      );
      expect(pS, `niveau ${L}`).toBeLessThanOrEqual(1);
      expect(pG, `niveau ${L} : ${(pG * 100).toFixed(0)} % d'une séance en 🪙`).toBeGreaterThan(
        0.6,
      );
      expect(pG, `niveau ${L}`).toBeLessThanOrEqual(1);
    }
  });

  it('⚠️ mais JAMAIS plus qu’une semaine de jeu : le coffre complète, il ne remplace pas', () => {
    // Le garde-fou qui compte maintenant qu'on a monté les montants. Une semaine ≈ 4
    // séances : si un coffre hebdomadaire les valait, farmer n'aurait plus d'objet.
    const SEANCES_PAR_SEMAINE = 4;
    for (const L of LEVELS) {
      const c = comboChestReward(135, L); // le plus gros 360 possible
      expect(c.summonStones).toBeLessThan(sessionStones(L) * SEANCES_PAR_SEMAINE);
      expect(c.gold).toBeLessThan(sessionGold(L) * SEANCES_PAR_SEMAINE);
    }
  });

  it('⚠️ la CLÉ reste le vrai luxe : plus d’une semaine de donjons à elle seule', () => {
    // Mesuré : un donjon nettoyé donne une clé ~2 % du temps, soit 0,2 par séance et 0,8
    // par semaine. Une clé par coffre dépasse donc déjà une semaine entière de farm —
    // c'est voulu, le Labyrinthe est la SEULE source de familiers.
    const CLES_PAR_SEMAINE = 0.02 * 10 * 4;
    expect(comboChestReward(CHEST_REF_SETS, 26).keys).toBeGreaterThan(CLES_PAR_SEMAINE);
  });

  it('⚠️ l’ÉNERGIE reste un complément, jamais un substitut au sport', () => {
    // Même invariant que les puits de la carte : plafonnée, et loin d'une séance.
    for (const L of LEVELS) expect(comboChestReward(999, L).energy).toBeLessThanOrEqual(180);
  });

  it('la clé récompense un défi VRAIMENT bouclé, pas un défi effleuré', () => {
    expect(comboChestReward(20, 26).keys).toBe(0);
    expect(comboChestReward(CHEST_REF_SETS, 26).keys).toBe(1);
    expect(comboChestReward(200, 26).keys).toBe(1); // jamais plus : la clé reste rare
  });

  it('tout croît avec le niveau, et rien n’est jamais négatif', () => {
    for (const k of ['gold', 'scrap', 'summonStones', 'energy'] as const) {
      let prev = -1;
      for (const L of LEVELS) {
        const v = comboChestReward(CHEST_REF_SETS, L)[k];
        expect(v, `${k} au niveau ${L}`).toBeGreaterThanOrEqual(prev);
        expect(v).toBeGreaterThanOrEqual(0);
        prev = v;
      }
    }
  });
});
