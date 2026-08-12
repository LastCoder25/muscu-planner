import { describe, it, expect } from 'vitest';
import { playerCombatant } from '@/lib/combat';
import {
  EXPE,
  spawnWindow,
  goldCost,
  travelOneWayMin,
  createMap,
  advanceWorld,
  heroPosition,
  resolveOutcome,
  startExpedition,
  expeditionTerrain,
  type ActiveExpedition,
  type Poi,
} from '@/lib/expedition';

const H = 3600_000;

describe('expedition — éco & géométrie', () => {
  it('spawnWindow : [niveau−5, niveau+3], planché à 1', () => {
    expect(spawnWindow(10)).toEqual({ min: 5, max: 13 });
    expect(spawnWindow(2)).toEqual({ min: 1, max: 5 });
  });
  it('goldCost : croît avec le niveau et le type (mine < camp < repaire)', () => {
    expect(goldCost('mine', 10)).toBeLessThan(goldCost('camp', 10));
    expect(goldCost('camp', 10)).toBeLessThan(goldCost('lair', 10));
    expect(goldCost('lair', 20)).toBeGreaterThan(goldCost('lair', 5));
  });
  it('travelOneWayMin : croît avec distance et niveau', () => {
    expect(travelOneWayMin(10, 1)).toBeGreaterThan(travelOneWayMin(10, 0));
    expect(travelOneWayMin(20, 0.5)).toBeGreaterThan(travelOneWayMin(5, 0.5));
  });
});

describe('expedition — carte / monde', () => {
  it('createMap : POI d’entrée, niveaux dans la fenêtre, espacés', () => {
    const m = createMap(123, 0, 10, 3);
    expect(m.pois.length).toBeGreaterThanOrEqual(1);
    const w = spawnWindow(10);
    for (const p of m.pois) {
      expect(p.level).toBeGreaterThanOrEqual(w.min);
      expect(p.level).toBeLessThanOrEqual(w.max);
    }
    // Espacement mini entre paires.
    for (let i = 0; i < m.pois.length; i++)
      for (let j = i + 1; j < m.pois.length; j++) {
        const a = m.pois[i]!, b = m.pois[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(EXPE.minDistPoi - 0.001);
      }
  });
  it('déterministe : même seed/now/niveau → même carte', () => {
    expect(createMap(7, 0, 10)).toEqual(createMap(7, 0, 10));
  });
  it('advanceWorld : expire les POI périmés (sauf la cible protégée)', () => {
    const m = createMap(5, 0, 10, 2);
    const target = m.pois[0]!.id;
    // Tout est périmé après lifespan max.
    const later = EXPE.lifespanMs.lair + 1;
    const adv = advanceWorld(m, later, 10, target);
    expect(adv.pois.some((p) => p.id === target)).toBe(true); // protégé
    // Les non-protégés périmés sont retirés.
    for (const p of adv.pois) if (p.id !== target) expect(p.expiresAt).toBeGreaterThan(later);
  });
  it('advanceWorld : spawn quand l’heure est venue (sous le cap)', () => {
    const m = createMap(9, 0, 10, 1);
    const before = m.pois.length;
    const adv = advanceWorld(m, m.nextSpawnAt + 1, 10);
    expect(adv.pois.length).toBe(before + 1);
    expect(adv.nextSpawnAt).toBeGreaterThan(m.nextSpawnAt);
  });
});

describe('expedition — terrain (fond de carte)', () => {
  it('déterministe + biomes/glyphes non vides', () => {
    const t1 = expeditionTerrain(42);
    const t2 = expeditionTerrain(42);
    expect(t1).toEqual(t2); // même seed → même terrain
    expect(t1.biomes.length).toBeGreaterThan(0);
    expect(t1.glyphs.length).toBeGreaterThan(0);
    expect(t1.biomes[0]!.path.startsWith('M ')).toBe(true);
    // Seeds différents → terrains différents.
    expect(expeditionTerrain(1)).not.toEqual(expeditionTerrain(2));
  });
});

describe('expedition — héros / trajet', () => {
  const poi: Poi = {
    id: 'p', type: 'camp', level: 10, x: 20, y: 20, distNorm: 0.5,
    spawnedAt: 0, expiresAt: 999 * H,
  };
  const exp: ActiveExpedition = {
    poi, sentAt: 0, midAt: 2 * H, returnAt: 4 * H, goldCost: 100, seed: 1,
    outcome: { win: true, gold: 0, dust: 0, item: null, key: 0, reconBonus: 0, text: '' },
  };
  it('aller : part de la ville, arrive à l’objectif à mi-parcours', () => {
    const t = EXPE.town;
    const start = heroPosition(exp, 0);
    expect(start.phase).toBe('outbound');
    expect(start.x).toBeCloseTo(t.x, 5);
    const mid = heroPosition(exp, 2 * H - 1);
    expect(mid.x).toBeCloseTo(poi.x, 0);
  });
  it('retour : de l’objectif vers la ville ; compteurs cohérents', () => {
    const r = heroPosition(exp, 3 * H);
    expect(r.phase).toBe('return');
    expect(r.remainToObjectiveMs).toBe(0);
    expect(r.remainTotalMs).toBe(1 * H);
    const done = heroPosition(exp, 5 * H);
    expect(done.phase).toBe('done');
  });
});

describe('expedition — résolution', () => {
  const strong = playerCombatant('Fort', { puissance: 300, endurance: 260, agilite: 120 }, 20);
  const weak = playerCombatant('Faible', { puissance: 3, endurance: 1, agilite: 1 }, 1);
  const mine: Poi = { id: 'm', type: 'mine', level: 8, x: 30, y: 30, distNorm: 0.3, spawnedAt: 0, expiresAt: 999 * H };
  const lair: Poi = { id: 'l', type: 'lair', setId: 'dragon', level: 6, x: 40, y: 40, distNorm: 0.4, spawnedAt: 0, expiresAt: 999 * H };

  it('mine : toujours réussie + gain net d’or', () => {
    const o = resolveOutcome(strong, mine, 1);
    expect(o.win).toBe(true);
    expect(o.gold).toBeGreaterThan(goldCost('mine', mine.level) * 0.9);
  });
  it('repaire gagné (héros fort) : pièce de set du bon set', () => {
    const o = resolveOutcome(strong, lair, 3);
    expect(o.win).toBe(true);
    expect(o.item?.setId).toBe('dragon');
  });
  it('échec (héros faible vs repaire) : or rendu < coût, pas de prise, reconnaissance', () => {
    const hardLair: Poi = { ...lair, level: 25 };
    const o = resolveOutcome(weak, hardLair, 4);
    expect(o.win).toBe(false);
    expect(o.gold).toBeLessThan(goldCost('lair', 25)); // jamais un profit
    expect(o.item).toBeNull();
    expect(o.reconBonus).toBeGreaterThan(0);
    expect(o.text.length).toBeGreaterThan(0);
  });
  it('startExpedition : aller/retour symétriques, coût cohérent', () => {
    const e = startExpedition(strong, lair, 1000, 42);
    expect(e.midAt - e.sentAt).toBe(e.returnAt - e.midAt);
    expect(e.goldCost).toBe(goldCost('lair', lair.level));
    expect(e.outcome).toBeTruthy();
  });
});
