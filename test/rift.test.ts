import { describe, it, expect } from 'vitest';
import {
  RIFT,
  riftClearMana,
  riftDoorOpen,
  riftMana,
  riftMaturity,
  riftOverflowAt,
  riftOverflowed,
  riftPopulation,
  residualMineOf,
  riftSpecOf,
  type RiftLike,
} from '@/lib/rift';

const T0 = Date.UTC(2026, 8, 19, 8, 0, 0);
const DAY = 24 * 3_600_000;

function rift(over: Partial<RiftLike> = {}): RiftLike {
  return { id: 'poi_rift_1', level: 30, spawnedAt: T0, ...over };
}

describe('⚡ une faille engendre : son effectif est une fonction de son ÂGE', () => {
  it("part du PLANCHER à l'apparition et atteint le MAX à maturité", () => {
    const r = rift();
    expect(riftPopulation(r, T0)).toBe(Math.round(RIFT.maxFoes * RIFT.popFloor));
    expect(riftPopulation(r, riftOverflowAt(r))).toBe(RIFT.maxFoes);
  });

  it("⚠️ n'est JAMAIS vide : aucun jour mort, même à l'instant de l'apparition", () => {
    // Le plancher est la règle « aucun niveau mort du 0 au 100 » appliquée aux jours.
    for (const level of [1, 5, 30, 90]) {
      expect(riftPopulation(rift({ level }), T0)).toBeGreaterThanOrEqual(1);
    }
  });

  it('⚠️ le PLANCHER ne peut pas s’arrondir à zéro — la garantie porte sur les CONSTANTES', () => {
    // Une faille vide ouvrirait la porte du boss GRATUITEMENT. Un `Math.max(1, …)` dans
    // `riftPopulation` ne pourrait jamais mordre (mutation survivante mesurée) : c'est donc
    // le réglage lui-même qu'on verrouille, pas un garde décoratif à l'exécution.
    expect(RIFT.maxFoes * RIFT.popFloor).toBeGreaterThanOrEqual(1);
  });

  it('croît sans jamais redescendre', () => {
    const r = rift();
    let prev = 0;
    for (let h = 0; h <= 7 * 24; h++) {
      const n = riftPopulation(r, T0 + h * 3_600_000);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('⚠️ ACCÉLÈRE : à mi-parcours elle est bien en dessous de la moitié du chemin', () => {
    // LA propriété décidée (exposant > 1), pas une valeur : une courbe LINÉAIRE rendrait
    // chaque jour équivalent, donc « attendre » ne serait plus un arbitrage.
    const r = rift();
    const floor = RIFT.maxFoes * RIFT.popFloor;
    const mid = riftPopulation(r, T0 + 3.5 * DAY);
    const linear = floor + (RIFT.maxFoes - floor) * 0.5;
    expect(mid).toBeLessThan(linear - 1);
    // …et le dernier quart de la durée apporte plus que le premier quart.
    const q1 = riftPopulation(r, T0 + 1.75 * DAY) - riftPopulation(r, T0);
    const q4 = riftPopulation(r, T0 + 7 * DAY) - riftPopulation(r, T0 + 5.25 * DAY);
    expect(q4).toBeGreaterThan(q1 * 2);
  });

  it('⚠️ PLAFONNE à maturité : une absence longue ne produit pas une faille imbattable', () => {
    const r = rift();
    const max = riftPopulation(r, riftOverflowAt(r));
    for (const d of [8, 15, 60, 400]) {
      expect(riftPopulation(r, T0 + d * DAY)).toBe(max);
    }
    expect(riftMaturity(r, T0 + 400 * DAY)).toBe(1);
  });

  it("la maturité est bornée en bas aussi (horloge qui recule, POI d'une carte future)", () => {
    expect(riftMaturity(rift(), T0 - 10 * DAY)).toBe(0);
  });

  it('déborde exactement à 7 jours', () => {
    const r = rift();
    expect(riftOverflowAt(r) - T0).toBe(7 * DAY);
    expect(riftOverflowed(r, riftOverflowAt(r) - 1)).toBe(false);
    expect(riftOverflowed(r, riftOverflowAt(r))).toBe(true);
  });
});

describe('⚡ la faction est DÉRIVÉE de l’id, jamais stockée', () => {
  it('est stable pour un id donné', () => {
    expect(riftSpecOf({ id: 'poi_x' }).faction).toBe(riftSpecOf({ id: 'poi_x' }).faction);
  });

  it('⚠️ ne dépend QUE de l’id — ni du niveau, ni de la date (patron de `campSpecOf`)', () => {
    // C'est ce qui permet à une faille d'une carte déjà sauvegardée d'en avoir une, sans
    // migration : rien d'autre que l'id n'entre dans le tirage. ⚠️ Comparer deux fois le
    // MÊME objet ne prouverait rien — il faut faire varier tout le reste.
    const jeune: RiftLike = { id: 'poi_same', level: 1, spawnedAt: 0 };
    const vieille: RiftLike = { id: 'poi_same', level: 99, spawnedAt: 9e12 };
    expect(riftSpecOf(jeune)).toEqual(riftSpecOf(vieille));
  });

  it('varie d’un id à l’autre (les trois factions sortent)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(riftSpecOf({ id: `poi_${i}` }).faction);
    expect(seen.size).toBe(3);
  });
});

describe('💎 le mana : ce que paient une incursion, une fermeture, et la mine', () => {
  it('croît avec le nombre de monstres et avec le niveau de la faille', () => {
    expect(riftMana(10, 30)).toBeGreaterThan(riftMana(5, 30));
    expect(riftMana(10, 60)).toBeGreaterThan(riftMana(10, 30));
  });

  it('fermer paie le boss EN PLUS des monstres', () => {
    const r = rift();
    const at = riftOverflowAt(r);
    const foes = riftMana(riftPopulation(r, at), r.level);
    expect(riftClearMana(r, at)).toBe(Math.round(foes * (1 + RIFT.bossManaShare)));
    expect(riftClearMana(r, at)).toBeGreaterThan(foes);
  });

  it('une faille mûre paie bien plus qu’une faille jeune (c’est l’arbitraire tôt/tard)', () => {
    const r = rift();
    expect(riftClearMana(r, riftOverflowAt(r))).toBeGreaterThan(riftClearMana(r, T0) * 3);
  });
});

describe('⛏️ la mine de mana résiduel', () => {
  it("n'existe pas avant le débordement", () => {
    const r = rift();
    expect(residualMineOf(r, T0)).toBeNull();
    expect(residualMineOf(r, riftOverflowAt(r) - 1)).toBeNull();
    expect(residualMineOf(r, riftOverflowAt(r))).not.toBeNull();
  });

  it('naît à l’instant du débordement et expire (elle ne reste pas à vie)', () => {
    const r = rift();
    const m = residualMineOf(r, riftOverflowAt(r) + DAY)!;
    expect(m.spawnedAt).toBe(riftOverflowAt(r));
    expect(m.expiresAt).toBe(riftOverflowAt(r) + RIFT.mineLifeMs);
    expect(m.expiresAt).toBeGreaterThan(m.spawnedAt);
  });

  it('⚠️ est calculée sur la faille À MATURITÉ, pas sur l’instant où on la regarde', () => {
    const r = rift();
    const a = residualMineOf(r, riftOverflowAt(r))!;
    const b = residualMineOf(r, riftOverflowAt(r) + 30 * DAY)!;
    expect(a.mana).toBe(b.mana);
  });

  it('⚠️ FERMER PAIE NETTEMENT MIEUX QU’IGNORER — la consolation n’est pas une stratégie', () => {
    // L'invariant qui protège le robinet du gacha : si ignorer payait presque autant,
    // l'optimum deviendrait « n'entrer nulle part et farmer les mines au convoi ».
    for (const level of [5, 30, 60, 100]) {
      const r = rift({ level });
      const at = riftOverflowAt(r);
      const closed = riftClearMana(r, at);
      const ignored = residualMineOf(r, at)!.mana;
      expect(closed / ignored).toBeGreaterThan(2.5);
    }
  });

  it('rend quand même quelque chose (une mine à 0 ne consolerait personne)', () => {
    const r = rift({ level: 1 });
    expect(residualMineOf(r, riftOverflowAt(r))!.mana).toBeGreaterThanOrEqual(1);
  });
});

describe('🚪 la porte du boss', () => {
  it("s'ouvre quand tout est nettoyé, pas avant", () => {
    expect(riftDoorOpen(11, 12)).toBe(false);
    expect(riftDoorOpen(12, 12)).toBe(true);
    expect(riftDoorOpen(13, 12)).toBe(true);
  });
});
