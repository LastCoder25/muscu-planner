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
  simulateArena,
  ARENA,
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
        const a = m.pois[i]!,
          b = m.pois[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(EXPE.minDistPoi - 0.001);
      }
  });
  it('déterministe : même seed/now/niveau → même carte', () => {
    expect(createMap(7, 0, 10)).toEqual(createMap(7, 0, 10));
  });
  it('AU PLUS UNE arène sur la carte (rare, placée loin)', () => {
    for (const seed of [1, 7, 42, 123, 999]) {
      const m = createMap(seed, 0, 20, 12);
      const arenas = m.pois.filter((p) => p.type === 'arena');
      expect(arenas.length).toBeLessThanOrEqual(1);
      for (const a of arenas) expect(a.distNorm).toBeGreaterThan(0.7); // spawn loin
    }
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
  it('createMap : démarre au PLANCHER par défaut (~une dizaine d’activités)', () => {
    const m = createMap(9, 0, 10);
    expect(m.pois.length).toBe(EXPE.poiFloor);
    expect(m.pois.length).toBeLessThanOrEqual(EXPE.poiCap);
  });
  it('advanceWorld : maintient le PLANCHER + avance l’horloge de spawn', () => {
    // Carte volontairement sous le plancher (1 POI) → advanceWorld doit la recompléter.
    const m = createMap(9, 0, 10, 1);
    const adv = advanceWorld(m, m.nextSpawnAt + 1, 10);
    expect(adv.pois.length).toBeGreaterThanOrEqual(EXPE.poiFloor);
    expect(adv.pois.length).toBeLessThanOrEqual(EXPE.poiCap);
    expect(adv.nextSpawnAt).toBeGreaterThan(m.nextSpawnAt);
  });
  it('advanceWorld : rattrape les spawns manqués après une longue absence (jusqu’au cap)', () => {
    const m = createMap(3, 0, 10, 1);
    // Très loin dans le futur → beaucoup d’intervalles écoulés, mais jamais > cap.
    const adv = advanceWorld(m, 500 * H, 10);
    expect(adv.pois.length).toBeLessThanOrEqual(EXPE.poiCap);
    expect(adv.pois.length).toBeGreaterThanOrEqual(EXPE.poiFloor);
  });
});

describe('expedition — terrain (fond de carte)', () => {
  it('déterministe + côte/reliefs non vides', () => {
    const t1 = expeditionTerrain(42);
    const t2 = expeditionTerrain(42);
    expect(t1).toEqual(t2); // même seed → même terrain
    expect(t1.coast.startsWith('M ')).toBe(true);
    expect(t1.features.length).toBeGreaterThan(0);
    expect(t1.features[0]!.d.startsWith('M ')).toBe(true);
    // Seeds différents → terrains différents.
    expect(expeditionTerrain(1)).not.toEqual(expeditionTerrain(2));
  });
});

describe('expedition — héros / trajet', () => {
  const poi: Poi = {
    id: 'p',
    type: 'camp',
    level: 10,
    x: 20,
    y: 20,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 999 * H,
  };
  const exp: ActiveExpedition = {
    poi,
    sentAt: 0,
    midAt: 2 * H,
    returnAt: 4 * H,
    goldCost: 100,
    seed: 1,
    outcome: {
      win: true,
      gold: 0,
      dust: 0,
      energy: 0,
      enchantScrolls: 0,
      item: null,
      key: 0,
      reconBonus: 0,
      text: '',
    },
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
  const mine: Poi = {
    id: 'm',
    type: 'mine',
    level: 8,
    x: 30,
    y: 30,
    distNorm: 0.3,
    spawnedAt: 0,
    expiresAt: 999 * H,
  };
  const lair: Poi = {
    id: 'l',
    type: 'lair',
    setId: 'dragon',
    level: 6,
    x: 40,
    y: 40,
    distNorm: 0.4,
    spawnedAt: 0,
    expiresAt: 999 * H,
  };

  it('mine : toujours réussie + gain NET d’or + poussière + parchemins + énergie', () => {
    const o = resolveOutcome(strong, mine, 1);
    expect(o.win).toBe(true);
    // Vrai gain net : la mine rend NETTEMENT plus que son coût (investissement + temps).
    expect(o.gold).toBeGreaterThan(goldCost('mine', mine.level) * 2);
    expect(o.dust).toBeGreaterThan(0);
    expect(o.enchantScrolls).toBeGreaterThan(0);
    expect(o.energy).toBeGreaterThan(0); // les mines rendent un peu d'énergie
  });
  it('énergie de mine BORNÉE : jamais plus de mineEnergyMax même profonde/lointaine (ticket a0d16472)', () => {
    const deepFar: Poi = { ...mine, level: 80, distNorm: 0.99 };
    const o = resolveOutcome(strong, deepFar, 7);
    expect(o.energy).toBeLessThanOrEqual(EXPE.mineEnergyMax);
  });
  it('camp/repaire : PAS d’énergie (mines uniquement)', () => {
    expect(resolveOutcome(strong, lair, 3).energy).toBe(0);
  });
  it('haul scalé au TEMPS de trajet : un POI plus loin rend plus (même niveau)', () => {
    const near: Poi = { ...mine, distNorm: 0.1 };
    const far: Poi = { ...mine, distNorm: 0.95 };
    expect(resolveOutcome(strong, far, 2).dust).toBeGreaterThan(
      resolveOutcome(strong, near, 2).dust,
    );
    expect(resolveOutcome(strong, far, 2).gold).toBeGreaterThan(
      resolveOutcome(strong, near, 2).gold,
    );
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
  it('arène : renvoie un nombre de vagues, butin croissant avec les vagues tenues', () => {
    const arenaP: Poi = {
      id: 'a',
      type: 'arena',
      level: 6,
      x: 40,
      y: 40,
      distNorm: 0.4,
      spawnedAt: 0,
      expiresAt: 999 * H,
    };
    const oStrong = resolveOutcome(strong, arenaP, 5);
    const oWeak = resolveOutcome(weak, arenaP, 5);
    expect(oStrong.waves).toBeGreaterThanOrEqual(0);
    expect(oWeak.waves).toBeGreaterThanOrEqual(0);
    // un héros FORT tient plus de vagues → plus de butin qu'un faible.
    expect(oStrong.waves!).toBeGreaterThan(oWeak.waves!);
    expect(oStrong.gold).toBeGreaterThan(oWeak.gold);
  });
  it('arène : simulateArena est bornée au cap de vagues et déterministe', () => {
    expect(simulateArena(strong, 6, 9)).toBe(simulateArena(strong, 6, 9));
    expect(simulateArena(strong, 1, 9)).toBeLessThanOrEqual(ARENA.maxWaves);
  });

  it('startExpedition : aller/retour symétriques, coût cohérent', () => {
    const e = startExpedition(strong, lair, 1000, 42);
    expect(e.midAt - e.sentAt).toBe(e.returnAt - e.midAt);
    expect(e.goldCost).toBe(goldCost('lair', lair.level));
    expect(e.outcome).toBeTruthy();
  });
});

describe('expedition — butin par ennemi vaincu (arene / embuscade)', () => {
  const hero = playerCombatant('Heros', { puissance: 300, endurance: 260, agilite: 120 }, 20);
  const arena: Poi = {
    id: 'a',
    type: 'arena',
    level: 10,
    x: 50,
    y: 50,
    distNorm: 0.9,
    spawnedAt: 0,
    expiresAt: 999 * H,
  };
  const camp: Poi = {
    id: 'c2',
    type: 'camp',
    level: 8,
    x: 30,
    y: 30,
    distNorm: 0.3,
    spawnedAt: 0,
    expiresAt: 999 * H,
  };

  it('arene : le butin suit les VAGUES tenues (plus de vagues -> plus d objets, en moyenne)', () => {
    // Moyenne sur plusieurs graines : le lien vagues -> objets doit ressortir du bruit.
    let lowWaves = 0;
    let lowItems = 0;
    let hiWaves = 0;
    let hiItems = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const o = resolveOutcome(hero, arena, seed, 20);
      const n = o.items?.length ?? 0;
      if ((o.waves ?? 0) <= 4) {
        lowWaves++;
        lowItems += n;
      } else {
        hiWaves++;
        hiItems += n;
      }
    }
    // Il faut des cas dans les deux groupes pour que la comparaison ait un sens.
    if (lowWaves > 0 && hiWaves > 0) {
      expect(hiItems / hiWaves).toBeGreaterThan(lowItems / lowWaves);
    }
  });

  it('arene : jamais plus que le plafond d inventaire', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const o = resolveOutcome(hero, arena, seed, 20);
      expect(o.items?.length ?? 0).toBeLessThanOrEqual(EXPE.arenaMaxItems);
    }
  });

  it('arene : 0 vague tenue -> aucun objet', () => {
    const feeble = playerCombatant('Faiblard', { puissance: 1, endurance: 1, agilite: 1 }, 1);
    const hard: Poi = { ...arena, level: 90 };
    const o = resolveOutcome(feeble, hard, 5, 1);
    expect(o.waves).toBe(0);
    expect(o.items?.length ?? 0).toBe(0);
  });

  it('embuscade repoussee : un objet EN PLUS de la prise principale', () => {
    // On cherche une graine ou le rapport mentionne une embuscade repoussee.
    let withSpoil = 0;
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const o = resolveOutcome(hero, camp, seed, 20);
      if (!o.text.includes('Embuscade repoussée')) continue;
      seen++;
      // items contient TOUT le butin ; item reste la prise principale.
      expect(o.items).toBeDefined();
      expect(o.item).toBe(o.items![0] ?? null);
      if (o.text.includes('sur la dépouille')) {
        withSpoil++;
        // La dépouille est le DERNIER objet ajouté au butin (la prise principale du camp,
        // elle, peut être nulle : rollDrop ne rend pas toujours un objet).
        const last = o.items![o.items!.length - 1]!;
        expect(o.text).toContain(last.name);
      }
    }
    expect(seen).toBeGreaterThan(0); // les embuscades arrivent (~35 %)
    expect(withSpoil).toBeGreaterThan(0); // et certaines laissent une dépouille
  });
});
