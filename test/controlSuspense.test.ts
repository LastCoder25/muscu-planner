import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  controlIdOf,
  ensureControls,
  garrisonHold,
  garrisonHoldChance,
  retakeBoost,
  retakeForce,
} from '@/lib/controlPoints';
import { createMap, type Poi } from '@/lib/expedition';
import { partyAllies, refChampionAdv } from '@/lib/caravan';

/** 🎲 SUSPENSE (demandé par l'utilisateur) : aucune garnison ne tient plus de 90 %. */
const gardenAt = (L: number): Poi => {
  const m = captureControl(
    ensureControls(createMap(3, 0, L, 1), 0, L),
    controlIdOf('garden'),
    ['a0'],
    0,
    7,
  );
  const p = m.pois.find((q) => q.id === controlIdOf('garden'))!;
  return { ...p, level: L };
};
const allies = (level: number, orient = 0) =>
  partyAllies([{ ...refChampionAdv(level, orient), id: 'a0' }], { advGear: [] }, null);

describe('🎲 une garnison ne repousse jamais plus de 90 % des reprises', () => {
  it('un champion bien au-dessus du lieu tenait presque tout : l’ennemi grossit pour y redescendre', () => {
    for (const L of [12, 30, 60]) {
      const p = gardenAt(L);
      // ⚠️ +20 et non +15 : ce champion est NU, et depuis que l'équipement des champions vaut
      // celui du héros (`ADV_GEAR.k` 1), un nu de +15 ne dépassait plus tout à fait 90 %.
      const strong = allies(L + 20, 2);
      const raw = garrisonHoldChance(p, strong);
      // Le cas existe vraiment — sinon le test ne prouverait rien.
      expect(raw).toBeGreaterThan(CONTROL.maxHold);
      expect(retakeBoost(p, strong)).toBeGreaterThan(1);
      const held = garrisonHold(p, strong);
      expect(held).toBeLessThanOrEqual(CONTROL.maxHold);
      // …mais il reste le meilleur choix : on ne le ramène pas au niveau d'un faible.
      expect(held).toBeGreaterThan(0.8);
    }
  }, 60_000);

  it('un champion qui ne tient pas plus de 90 % n’est jamais pénalisé', () => {
    for (const L of [12, 30, 60]) {
      const p = gardenAt(L);
      const weak = allies(L - 5, 0);
      expect(garrisonHoldChance(p, weak)).toBeLessThanOrEqual(CONTROL.maxHold);
      expect(retakeBoost(p, weak)).toBe(1);
      expect(garrisonHold(p, weak)).toBe(garrisonHoldChance(p, weak));
    }
  }, 60_000);

  it('le renfort s’applique à la troupe qui attaque vraiment', () => {
    const p = gardenAt(30);
    const a = retakeForce(p, 1);
    const b = retakeForce(p, 2.5);
    expect(b.faction).toBe(a.faction);
    expect(b.size).toBeCloseTo(a.size * 2.5, 9);
  });

  it('sans garnison, rien à estimer et aucun renfort', () => {
    const p = gardenAt(30);
    expect(garrisonHoldChance(p, [])).toBe(0);
    expect(retakeBoost(p, [])).toBe(1);
  });
});
