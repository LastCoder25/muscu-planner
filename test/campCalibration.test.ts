import { describe, it, expect } from 'vitest';
import { simulateCombat, playerCombatant } from '@/lib/combat';
import {
  caravanWages,
  refAdvGear,
  refAdventurer,
  refCompanions,
  roadPairs,
  roadUnits,
} from '@/lib/caravan';
import { fuseUnits, type SkirmishUnit } from '@/lib/skirmish';
import { HERO_UNIT_ID, campFoe, campGroupHaul } from '@/lib/camp';
import { CAMP_SIZES, resolveOutcome, type Poi } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';
import { gearedFighter } from './helpers/gearedFighter';

/** La CALIBRATION des camps de faction, mesurée (cf. `CAMP.pvTurns`). Les bandes ne se
 *  relâchent pas : si une retouche les casse, c'est la retouche qu'on revoit. */

const poiAt = (L: number, type: Poi['type'] = 'camp'): Poi => ({
  id: 'p',
  type,
  level: L,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});
/** N aventuriers de référence, chacun ÉQUIPÉ de ses 4 pièces et ACCOMPAGNÉ de SON familier.
 *  ⚠️ Un familier PAR aventurier (les 3 espèces de référence en boucle, ids distincts) : avec
 *  les 3 seuls `refCompanions`, les membres au-delà du 3ᵉ partiraient sans compagnon et un
 *  gros groupe serait mesuré plus faible par tête qu'il ne l'est. */
const team = (n: number, L: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    familiarId: `refFam${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const familiars = (n: number, L: number) => {
  const base = refCompanions(L);
  return Array.from({ length: n }, (_, i) => ({ ...base[i % base.length]!, id: `refFam${i}` }));
};
const units = (n: number, L: number): SkirmishUnit[] => {
  const escort = team(n, L);
  return roadUnits(
    escort,
    roadPairs(escort, { familiars: familiars(n, L), talents: [], advGear: refAdvGear(L, n) }),
  );
};
function win(allies: SkirmishUnit[], L: number, size: number, n = 300) {
  const g = fuseUnits(allies, 'g');
  const f = campFoe(poiAt(L), { faction: 'bandits', size });
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(g, f, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
  return w / n;
}
const NIV = [12, 26, 45, 70];
const SIZES = [...CAMP_SIZES.camp, ...CAMP_SIZES.lair];

describe('🏕️ LA TAILLE D’UN CAMP SE LIT EN AVENTURIERS', { timeout: 120_000 }, () => {
  it('⚠️ B1 : autant d’aventuriers de référence que la taille → un camp qui se prend, sans être donné', () => {
    for (const L of NIV)
      for (const s of SIZES) {
        const t = win(units(s, L), L, s);
        expect(t, `niveau ${L}, taille ${s}`).toBeGreaterThanOrEqual(0.65);
        expect(t, `niveau ${L}, taille ${s}`).toBeLessThanOrEqual(0.95);
      }
  });
  it('⚠️ B2 : un aventurier de moins se SENT', () => {
    for (const L of NIV)
      for (const s of SIZES.filter((x) => x > 1))
        expect(win(units(s - 1, L), L, s), `niveau ${L}, taille ${s}`).toBeLessThanOrEqual(
          win(units(s, L), L, s) - 0.12,
        );
  });
  it('⚠️ B3 : un gros camp demande NETTEMENT plus que trois aventuriers', () => {
    for (const L of NIV)
      for (const s of SIZES.filter((x) => x >= 5))
        expect(win(units(3, L), L, s), `niveau ${L}, taille ${s}`).toBeLessThan(0.1);
  });
  it('B4 : le héros seul, équipé, prend encore un petit camp de son niveau', () => {
    for (const L of [26, 45, 70]) {
      const h: SkirmishUnit = {
        id: HERO_UNIT_ID,
        name: 'h',
        emoji: '🧝',
        level: L,
        combatant: gearedFighter(L),
      };
      expect(win([h], L, 2), `niveau ${L}`).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('💰 le butin d’un camp de groupe ne détrône pas les sources dédiées', () => {
  it('⚠️ E2 : l’or NET d’un camp de groupe reste sous celui d’une mine', () => {
    for (const L of [20, 26, 40, 60, 100]) {
      const hero = playerCombatant('h', { puissance: 9e4, endurance: 9e4, agilite: 9e4 }, L);
      let mine = 0;
      for (let s = 1; s <= 40; s++)
        mine += resolveOutcome(hero, { ...poiAt(L), type: 'mine' }, s, L).gold;
      mine /= 40;
      for (const s of [3, Math.max(...CAMP_SIZES.lair)]) {
        const net =
          campGroupHaul(poiAt(L), { faction: 'bandits', size: s }).gold -
          caravanWages(team(s, L), poiAt(L));
        expect(net, `niveau ${L}, taille ${s}`).toBeLessThanOrEqual(mine);
      }
    }
  });
});
