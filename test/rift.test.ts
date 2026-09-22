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
  RIFT_RUN,
  riftDepth,
  riftRamp,
  riftFoe,
  incursionMana,
  type RiftLike,
} from '@/lib/rift';
import { EXPE, harvestYield, travelFactor, TRAVEL_CAP_H } from '@/lib/expedition';

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

  it('fermer paie un mana FIXE, prime du gardien comprise (v0.1047)', () => {
    const r = rift();
    const foes = riftMana(RIFT.manaFoesPaid, r.level);
    expect(riftClearMana(r)).toBe(Math.round(foes * (1 + RIFT.bossManaShare)));
    expect(riftClearMana(r)).toBeGreaterThan(foes);
  });

  it('⚠️ ATTENDRE NE PAIE PLUS : le mana ne dépend pas de l’âge — c’est l’URGENCE (v0.1047)', () => {
    // Avant, le mana suivait l'effectif (×6 entre l'ouverture et la maturité) et fermer une
    // faille par jour rendait plus que d'en fermer deux. Désormais la faille devient plus
    // DURE en vieillissant (l'effectif monte toujours) pour AUCUN gain : on la ferme vite.
    const r = rift();
    expect(riftClearMana({ level: r.level })).toBe(riftClearMana(r));
    expect(riftPopulation(r, riftOverflowAt(r))).toBeGreaterThan(riftPopulation(r, T0) * 3);
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
    expect(m.expiresAt).toBe(riftOverflowAt(r) + EXPE.lifespanMs.mana_mine);
    expect(m.expiresAt).toBeGreaterThan(m.spawnedAt);
  });

  it('hérite du NIVEAU de la faille — c’est lui qui décide de son rendement', () => {
    const r = rift({ level: 42 });
    expect(residualMineOf(r, riftOverflowAt(r))!.level).toBe(42);
  });

  it('⚠️ FERMER PAIE NETTEMENT MIEUX QU’IGNORER — la consolation n’est pas une stratégie', () => {
    // L'invariant qui protège le robinet du gacha : si ignorer payait presque autant,
    // l'optimum deviendrait « n'entrer nulle part et farmer les mines au convoi ».
    // ⚠️ MESURÉ AU PIRE CAS : le rendement d'une récolte est super-linéaire en trajet
    // (`travelFactor`, plafonné à `TRAVEL_CAP_H`), donc la mine la plus généreuse est celle
    // qu'on va chercher le plus loin. Comparer à un trajet moyen laisserait passer le cas
    // qui compte.
    // ⚠️ Et le rendement vient de `harvestYield`, la table de TOUTES les récoltes : c'est
    // la SEULE échelle. Elle a d'abord existé en double (une part de `riftClearMana` ici,
    // la table là-bas) — deux nombres pour la même chose finissent par se contredire.
    const tfMax = travelFactor(TRAVEL_CAP_H);
    for (const level of [5, 30, 60, 100]) {
      const r = rift({ level });
      const closed = riftClearMana(r, riftOverflowAt(r));
      const ignored = harvestYield('mana_mine', level, tfMax).mana;
      expect(ignored, `niv ${level}`).toBeGreaterThan(0);
      expect(closed / ignored, `niv ${level}`).toBeGreaterThan(2.5);
    }
  });

  it('rend quand même quelque chose au niveau 1 (une mine à 0 ne consolerait personne)', () => {
    expect(harvestYield('mana_mine', 1, 1).mana).toBeGreaterThanOrEqual(1);
  });
});

describe('🚪 la porte du boss', () => {
  it("s'ouvre quand tout est nettoyé, pas avant", () => {
    expect(riftDoorOpen(11, 12)).toBe(false);
    expect(riftDoorOpen(12, 12)).toBe(true);
    expect(riftDoorOpen(13, 12)).toBe(true);
  });
});

describe('📈 la rampe de profondeur — ce qui a remplacé la falaise par une pente', () => {
  it('la profondeur est ABSOLUE : rapportée au fond de la faille, pas à l’effectif du jour', () => {
    // ⚠️ C'est ce qui fait qu'une faille jeune ne contient que ses PREMIERS monstres — les
    // faibles — au lieu d'un échantillon complet de la rampe. Sans ça, l'âge ne changerait
    // que le butin (mesuré : la mutation « profondeur relative » fait tomber la calibration).
    expect(riftDepth(0)).toBe(0);
    expect(riftDepth(RIFT.maxFoes - 1)).toBe(1);
    expect(riftDepth(1)).toBeLessThan(0.2);
    expect(riftDepth(999)).toBe(1); // bornée
  });

  it('la force monte avec la profondeur, et vaut ~1 en moyenne', () => {
    expect(riftRamp(0)).toBe(RIFT_RUN.rampFrom);
    expect(riftRamp(1)).toBe(RIFT_RUN.rampTo);
    expect(riftRamp(0)).toBeLessThan(riftRamp(0.5));
    expect(riftRamp(0.5)).toBeLessThan(riftRamp(1));
    // Moyenne ≈ 1 : la rampe REDISTRIBUE la difficulté, elle ne l'ajoute pas.
    expect(riftRamp(0.5)).toBeCloseTo(1, 1);
  });

  it('un monstre du fond est plus dur qu’un monstre de l’entrée', () => {
    const entree = riftFoe(30, 'bandits', 0, false);
    const fond = riftFoe(30, 'bandits', RIFT.maxFoes - 1, false);
    expect(fond.pv).toBeGreaterThan(entree.pv);
    expect(fond.damage).toBeGreaterThan(entree.damage);
  });

  it('⚠️ le GARDIEN n’est pas rampé : sa force, c’est son poids', () => {
    // Deux multiplicateurs sur le même adversaire, c'est un de trop — mesuré, il se
    // retrouvait à 5,8× un monstre de base et décidait de tout (faille jeune 0,97 → 0,15).
    const fond = riftFoe(30, 'bandits', RIFT.maxFoes - 1, false);
    const boss = riftFoe(30, 'bandits', RIFT.maxFoes, true);
    // Le gardien vaut `bossWeight` monstres de force NOMINALE (rampe 1), donc moins que
    // `bossWeight` × le monstre du fond (qui est rampé à 1,45).
    expect(boss.pv).toBeLessThan(fond.pv * RIFT_RUN.bossWeight);
    expect(boss.pv).toBeGreaterThan(fond.pv);
    expect(boss.name).toContain('gardien');
  });
});

describe('💎 le mana d’une incursion', () => {
  it('⚠️ une incursion RATÉE paie quand même les monstres abattus', () => {
    // La promesse « une incursion ratée n'est jamais perdue » : elle ne prépare plus la
    // défense (simplification demandée), c'est le mana qui la remplace.
    const rate = {
      cleared: false,
      killed: 5,
      population: 12,
      bossDown: false,
      finalPv: 0,
      journal: [],
    };
    // ⚠️ La PART abattue du mana fixe (v0.1047), pas un compte de monstres : payée au
    // monstre, une faille mûre (plus peuplée) rapporterait plus en échouant qu'une jeune
    // en réussissant — l'attente reviendrait par la bande.
    expect(incursionMana(rate, 30)).toBe(riftMana((RIFT.manaFoesPaid * 5) / 12, 30));
    expect(incursionMana(rate, 30)).toBeGreaterThan(0);
    const jeune = { ...rate, killed: 1, population: 2 };
    const mure = { ...rate, killed: 6, population: 12 };
    expect(incursionMana(jeune, 30)).toBe(incursionMana(mure, 30));
  });

  it('fermer ajoute la prime du gardien', () => {
    const done = {
      cleared: true,
      killed: 12,
      population: 12,
      bossDown: true,
      finalPv: 40,
      journal: [],
    };
    const partial = { ...done, cleared: false, bossDown: false };
    expect(incursionMana(done, 30)).toBeGreaterThan(incursionMana(partial, 30));
    expect(incursionMana(done, 30)).toBe(riftClearMana({ level: 30 })); // le mana fixe, gardien compris
  });

  it('rien d’abattu, rien de payé', () => {
    const none = {
      cleared: false,
      killed: 0,
      population: 12,
      bossDown: false,
      finalPv: 0,
      journal: [],
    };
    expect(incursionMana(none, 30)).toBe(0);
  });
});
