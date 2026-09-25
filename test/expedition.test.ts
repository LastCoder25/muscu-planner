import { describe, it, expect } from 'vitest';
import { playerCombatant, mulberry32 } from '@/lib/combat';
import {
  isQuotaPoi,
  heroRewardLevel,
  poiForceOf,
  poiRewardLevel,
  isRiftPoi,
  EXPE,
  spawnWindow,
  riftAboveSpan,
  goldCost,
  travelOneWayMin,
  createMap,
  mapQuota,
  advanceWorld,
  travelPosition,
  voyageProgress,
  resolveOutcome,
  startExpedition,
  expeditionTerrain,
  simulateArena,
  runArena,
  arenaEnergyCost,
  arenaRewards,
  ARENA_PLAY,
  ARENA,
  CAMP_FACTIONS,
  CAMP_SIZES,
  CAMP_TYPES,
  campSpecOf,
  buildMessage,
  depositMessages,
  dropSeenMessages,
  MESSAGES_CAP,
  keepMessages,
  type ActiveExpedition,
  type ExpeditionMessage,
  type Poi,
} from '@/lib/expedition';
import { poiDifficultyLevel } from '@/lib/poiRank';
// 🗺️ Avant-poste 7 = l'ancienne carte fixe (rayon 64, 16 lieux + 6 failles) : ces tests
// éprouvent la MÉCANIQUE de la carte, pas sa taille (cf. `revealRadius`, v0.1047).
const OUT = 7;

const H = 3600_000;

describe('expedition — éco & géométrie', () => {
  it('spawnWindow : [niveau, niveau+10] — plus rien EN DESSOUS du joueur', () => {
    // L'ancienne fenêtre descendait à niveau−5, ce qui remplissait la carte de POI qu'un
    // joueur équipé écrase sans y penser (100 % de victoire mesuré jusqu'à +10).
    expect(spawnWindow(10)).toEqual({ min: 10, max: 20 });
    expect(spawnWindow(2)).toEqual({ min: 2, max: 12 });
    expect(spawnWindow(0).min).toBe(1); // planché à 1
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
  it('createMap : POI d’entrée, rang tiré, récompense = difficulté, espacés', () => {
    const m = createMap(123, 0, 10, OUT, 3);
    expect(m.pois.length).toBeGreaterThanOrEqual(1);
    // 🏅 Depuis la v0.1028 TOUS les lieux tirent leur RANG, comme les failles
    // (`riftLevelFor`) : entre le niveau 1 et le joueur, plus la place « au-dessus ».
    // 🎯 Depuis la v0.1153 la RÉCOMPENSE suit cette difficulté (`poiRewardLevel`), plus une
    // fenêtre tirée à part.
    // ⚠️ RÉÉCRIT (v0.1108) : c’est la DIFFICULTÉ qui est bornée, plus le niveau des
    // ennemis. Depuis que le rang tiré est celui de la difficulté, le niveau en est
    // DÉRIVÉ — un lieu qui n’aligne qu’un ennemi lui donne un niveau plus élevé pour peser
    // le même rang. Borner `p.level` interdirait précisément « peu d’ennemis très forts ».
    for (const p of m.pois.filter(isQuotaPoi)) {
      expect(p.level).toBeGreaterThanOrEqual(1);
      expect(poiDifficultyLevel(p)).toBeLessThanOrEqual(10 + riftAboveSpan(10));
      expect(poiRewardLevel(p)).toBe(poiDifficultyLevel(p));
      expect(p.rewardLevel).toBeUndefined();
    }
    // …et une faille, elle, ne dépasse jamais l'écart « au-dessus » (v0.980).
    for (const p of m.pois.filter(isRiftPoi))
      expect(p.level).toBeLessThanOrEqual(10 + riftAboveSpan(10));
    // Espacement mini entre paires.
    for (let i = 0; i < m.pois.length; i++)
      for (let j = i + 1; j < m.pois.length; j++) {
        const a = m.pois[i]!,
          b = m.pois[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(EXPE.minDistPoi - 0.001);
      }
  });
  it('déterministe : même seed/now/niveau → même carte', () => {
    expect(createMap(7, 0, 10, OUT)).toEqual(createMap(7, 0, 10, OUT));
  });
  it('AU PLUS UNE arène sur la carte (rare, placée loin)', () => {
    for (const seed of [1, 7, 42, 123, 999]) {
      const m = createMap(seed, 0, 20, OUT, 12);
      const arenas = m.pois.filter((p) => p.type === 'arena');
      expect(arenas.length).toBeLessThanOrEqual(1);
      for (const a of arenas) expect(a.distNorm).toBeGreaterThan(0.7); // spawn loin
    }
  });
  it('advanceWorld : expire les POI périmés (sauf la cible protégée)', () => {
    const m = createMap(5, 0, 10, OUT, 2);
    const target = m.pois[0]!.id;
    // Tout est périmé après lifespan max.
    const later = EXPE.lifespanMs.lair + 1;
    const adv = advanceWorld(m, later, 10, OUT, target);
    expect(adv.pois.some((p) => p.id === target)).toBe(true); // protégé
    // Les non-protégés périmés sont retirés.
    for (const p of adv.pois) if (p.id !== target) expect(p.expiresAt).toBeGreaterThan(later);
  });
  it('createMap : démarre au PLANCHER par défaut (~une dizaine d’activités)', () => {
    const m = createMap(9, 0, 10, OUT);
    expect(m.pois.filter(isQuotaPoi).length).toBe(mapQuota(OUT).pois);
    expect(m.pois.filter(isQuotaPoi).length).toBeLessThanOrEqual(mapQuota(OUT).pois);
  });
  it('advanceWorld : maintient le PLANCHER + avance l’horloge de spawn', () => {
    // Carte volontairement sous le plancher (1 POI) → advanceWorld doit la recompléter.
    const m = createMap(9, 0, 10, OUT, 1);
    const adv = advanceWorld(m, m.nextSpawnAt + 1, 10, OUT);
    expect(adv.pois.filter(isQuotaPoi).length).toBeGreaterThanOrEqual(mapQuota(OUT).pois);
    expect(adv.pois.filter(isQuotaPoi).length).toBeLessThanOrEqual(mapQuota(OUT).pois);
    expect(adv.nextSpawnAt).toBeGreaterThan(m.nextSpawnAt);
  });
  it('advanceWorld : rattrape les spawns manqués après une longue absence (jusqu’au cap)', () => {
    const m = createMap(3, 0, 10, OUT, 1);
    // Très loin dans le futur → beaucoup d’intervalles écoulés, mais jamais > cap.
    const adv = advanceWorld(m, 500 * H, 10, OUT);
    expect(adv.pois.filter(isQuotaPoi).length).toBeLessThanOrEqual(mapQuota(OUT).pois);
    expect(adv.pois.filter(isQuotaPoi).length).toBeGreaterThanOrEqual(mapQuota(OUT).pois);
  });
});

describe('expedition — terrain (fond de carte)', () => {
  it('déterministe + côte/reliefs non vides', () => {
    const t1 = expeditionTerrain(42);
    const t2 = expeditionTerrain(42);
    expect(t1).toEqual(t2); // même seed → même terrain
    // Plus d'île (v0.1047) : le relief couvre toute la fenêtre, au-delà de l'ancienne côte.
    expect(t1.features.some((f) => Math.hypot(f.x - EXPE.town.x, f.y - EXPE.town.y) > 90)).toBe(
      true,
    );
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
    const start = travelPosition(exp, 0);
    expect(start.phase).toBe('outbound');
    expect(start.x).toBeCloseTo(t.x, 5);
    const mid = travelPosition(exp, 2 * H - 1);
    expect(mid.x).toBeCloseTo(poi.x, 0);
  });
  it('retour : de l’objectif vers la ville ; compteurs cohérents', () => {
    const r = travelPosition(exp, 3 * H);
    expect(r.phase).toBe('return');
    expect(r.remainToObjectiveMs).toBe(0);
    expect(r.remainTotalMs).toBe(1 * H);
    const done = travelPosition(exp, 5 * H);
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

  it('mine : toujours réussie + gain NET d’or + énergie', () => {
    // ⚠️ RÉÉCRIT : ce test exigeait de la poussière ✨ et des parchemins d'enchant 📜 — il
    // verrouillait donc la PRODUCTION de deux devises qu'aucune fonction ne dépense plus.
    // La mine paie en or et en énergie, point.
    const o = resolveOutcome(strong, mine, 1);
    expect(o.win).toBe(true);
    // Vrai gain net : la mine rend NETTEMENT plus que son coût (investissement + temps).
    expect(o.gold).toBeGreaterThan(goldCost('mine', mine.level) * 2);
    expect(o.energy).toBeGreaterThan(0); // les mines rendent un peu d'énergie
  });
  it('énergie de mine BORNÉE : jamais plus de mineEnergyMax même profonde/lointaine (ticket a0d16472)', () => {
    const deepFar: Poi = { ...mine, level: 80, distNorm: 0.99 };
    const o = resolveOutcome(strong, deepFar, 7);
    expect(o.energy).toBeLessThanOrEqual(EXPE.mineEnergyMax);
  });
  it('⚠️ un CAMP ne se résout plus par resolveOutcome : son seul chemin est resolveCamp', () => {
    // `expeSend` refuse les camps, et une expédition d'avant porte son issue tirée au départ :
    // l'ancienne branche (gardien `poiCombatant`) n'avait plus aucun chemin — retirée.
    expect(() => resolveOutcome(strong, lair, 3)).toThrow();
    expect(() => startExpedition(strong, { ...lair, type: 'camp' }, 0, 3)).toThrow();
  });
  it('🎯 la récolte suit la DIFFICULTÉ, jamais la distance (v0.1153)', () => {
    // Demandé : « les ressources proportionnelles à la difficulté et pas à la distance ».
    // Aller loin ne coûte plus que du TEMPS.
    const near: Poi = { ...mine, distNorm: 0.1 };
    const far: Poi = { ...mine, distNorm: 0.95 };
    expect(resolveOutcome(strong, far, 2).gold).toBe(resolveOutcome(strong, near, 2).gold);
    // …et une mine plus DURE (même distance, niveau plus haut) rend plus.
    const dure: Poi = { ...mine, level: mine.level + 20 };
    expect(poiRewardLevel(dure)).toBeGreaterThan(poiRewardLevel(mine));
    expect(resolveOutcome(strong, dure, 2).gold).toBeGreaterThan(
      resolveOutcome(strong, mine, 2).gold,
    );
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

  it('startExpedition : l’ALLER est fixe, le RETOUR peut être écourté, coût cohérent', () => {
    // Une rencontre de trajet (passage découvert / contretemps) raccourcit la jambe
    // retour — jamais l'aller, sinon le héros n'aurait pas atteint l'objectif et le
    // rapport déposé à `midAt` n'aurait aucun sens.
    for (const seed of [42, 7, 1234, 99, 5150]) {
      const e = startExpedition(strong, mine, 1000, seed);
      const aller = e.midAt - e.sentAt;
      const retour = e.returnAt - e.midAt;
      expect(aller).toBeGreaterThan(0);
      expect(retour).toBeLessThanOrEqual(aller + 1); // jamais RALENTI
      expect(Math.abs(retour - aller * e.outcome.returnMult)).toBeLessThanOrEqual(2);
      expect(e.goldCost).toBe(0); // plus de coût d’envoi (v0.1069)
      expect(e.outcome).toBeTruthy();
    }
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
  // ⚠️ Un POI de RÉCOLTE : un camp ne passe plus par `resolveOutcome`, et les rencontres de
  // trajet sont le même helper pour toutes les récoltes.
  const camp: Poi = {
    id: 'c2',
    type: 'well',
    level: 8,
    x: 30,
    y: 30,
    distNorm: 0.3,
    spawnedAt: 0,
    expiresAt: 999 * H,
  };

  it('🔮 le butin de la CARTE honore l affinite de relique (elle y etait morte)', () => {
    // La relique portee voyage avec le heros : 1 drop de relique sur 3 doit reprendre SON
    // pouvoir, sinon ameliorer sa relique a pouvoir egal y est 3 fois moins probable
    // qu'ailleurs (mesure du defaut : le parametre n'etait pas passe).
    const porte = { ...hero, relic: { id: 'carapace' as const, force: 1 } };
    const part = (h: typeof hero, lieu: Poi, n: number): number => {
      let meme = 0;
      let total = 0;
      for (let seed = 1; seed <= n; seed++)
        for (const it of resolveOutcome(h, lieu, seed, 20).items ?? []) {
          if (it.slot !== 'relic') continue;
          total++;
          if (it.power === 'carapace') meme++;
        }
      expect(total).toBeGreaterThan(20); // sinon on ne mesure rien
      return meme / total;
    };
    // ⚠️ LES DEUX SOURCES SEPAREMENT : l arene tire un objet par vague et noyait le butin
    // d EMBUSCADE, qui est la seule voie par laquelle un lieu de RECOLTE lache un objet.
    for (const [lieu, n] of [
      [arena, 300],
      [camp, 4000],
    ] as const) {
      // Sans affinite, un pouvoir sur douze. Avec, un bon tiers.
      expect(part(porte, lieu, n)).toBeGreaterThan(0.25);
      expect(part(porte, lieu, n)).toBeGreaterThan(part(hero, lieu, n) * 1.8);
    }
  });
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

describe('arene jouable', () => {
  const hero = playerCombatant('H', { puissance: 220, endurance: 220, agilite: 160 }, 20);

  it('runArena est la SEULE simulation : simulateArena en derive exactement', () => {
    for (const seed of [1, 42, 777]) {
      expect(simulateArena(hero, 8, seed)).toBe(runArena(hero, 8, seed).waves);
    }
  });

  it('conserve un combat par vague livree, la derniere etant PERDUE', () => {
    const r = runArena(hero, 8, 42);
    expect(r.fights.length).toBe(r.waves + 1); // les vagues tenues + celle qui tue
    expect(r.fights.at(-1)!.win).toBe(false);
    expect(r.fights.slice(0, -1).every((f) => f.win)).toBe(true);
    expect(r.fights.map((f) => f.wave)).toEqual(r.fights.map((_, i) => i + 1));
  });

  it('chaque vague porte de quoi la rejouer', () => {
    const f = runArena(hero, 8, 42).fights[0]!;
    expect(f.log.length).toBeGreaterThan(0);
    expect(f.maxPv).toBeGreaterThan(0);
    expect(f.startPv).toBeGreaterThan(0);
    expect(f.monster).toContain('vague');
  });

  it('les vagues sont de plus en plus dures (PV du monstre croissants)', () => {
    const f = runArena(hero, 8, 42).fights;
    if (f.length > 1) expect(f.at(-1)!.maxPv).toBeGreaterThan(f[0]!.maxPv);
  });

  it('finit toujours par la mort (jamais le cap de securite)', () => {
    expect(runArena(hero, 1, 5).fights.length).toBeLessThan(ARENA.maxWaves);
  });

  it('cout d entree croissant mais PLAFONNE', () => {
    expect(arenaEnergyCost(1)).toBeLessThan(arenaEnergyCost(20));
    expect(arenaEnergyCost(500)).toBe(ARENA_PLAY.energyCap);
  });

  it('recompenses : rien sans vague, un drop tous les N paliers, luck croissante', () => {
    expect(arenaRewards(0, 20)).toMatchObject({ gold: 0, drops: 0 });
    expect(arenaRewards(ARENA_PLAY.dropEvery - 1, 20).drops).toBe(0);
    expect(arenaRewards(ARENA_PLAY.dropEvery, 20).drops).toBe(1);
    expect(arenaRewards(ARENA_PLAY.dropEvery * 3, 20).drops).toBe(3);
    expect(arenaRewards(10, 20).gold).toBeGreaterThan(arenaRewards(5, 20).gold);
    expect(arenaRewards(10, 40).gold).toBeGreaterThan(arenaRewards(10, 10).gold);
    expect(arenaRewards(100, 20).luck).toBeLessThanOrEqual(1);
  });
});

describe('⚠️ avancement d’un voyage sur sa durée TOTALE', () => {
  const v = { poi: { x: 10, y: 10 } as never, sentAt: 0, midAt: 2 * H, returnAt: 5 * H };

  it('la barre ne RECULE JAMAIS, même au demi-tour', () => {
    // `travelPosition().frac` repart à zéro quand la phase change : une barre pilotée
    // par lui reculerait en plein milieu du trajet, ce qui se lit comme un bug.
    let prev = -1;
    for (let t = 0; t <= 5 * H; t += H / 4) {
      const p = voyageProgress(v, t).overall;
      expect(p, `t=${t / H} h`).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('l’objectif tombe au bon endroit de la barre', () => {
    expect(voyageProgress(v, 0).mid).toBeCloseTo(0.4, 6); // 2 h sur 5 h
    expect(voyageProgress(v, 2 * H).overall).toBeCloseTo(0.4, 6); // on y est
  });

  it('reste borné à [0,1]', () => {
    expect(voyageProgress(v, -H).overall).toBe(0);
    expect(voyageProgress(v, 99 * H).overall).toBe(1);
  });
});

describe('🏕️ campSpecOf — faction et taille d’un camp', () => {
  const p = (id: string, type: Poi['type']) => ({ id, type });

  it('seuls les camps et repaires en ont une', () => {
    expect(campSpecOf(p('x', 'mine'))).toBeNull();
    expect(campSpecOf(p('x', 'wreck'))).toBeNull();
    expect(CAMP_TYPES.has('camp') && CAMP_TYPES.has('lair')).toBe(true);
    expect(campSpecOf(p('x', 'camp'))).not.toBeNull();
  });

  it('⚠️ ne dépend QUE de l’id et du type : niveau, distance et position n’y sont pour rien', () => {
    const a = campSpecOf({ id: 'poi_9_4', type: 'lair' });
    const full: Poi = {
      id: 'poi_9_4',
      type: 'lair',
      level: 80,
      x: 3,
      y: 7,
      distNorm: 0.99,
      spawnedAt: 0,
      expiresAt: 1,
    };
    expect(campSpecOf(full)).toEqual(a);
  });

  it('la taille appartient au palier : un camp reste un camp, un repaire un repaire', () => {
    for (let i = 0; i < 300; i++) {
      expect(CAMP_SIZES.camp).toContain(campSpecOf(p(`poi_1_${i}`, 'camp'))!.size);
      expect(CAMP_SIZES.lair).toContain(campSpecOf(p(`poi_1_${i}`, 'lair'))!.size);
    }
  });

  it('⚠️ UNIFORME : chaque faction et chaque taille sortent à parts égales', () => {
    const N = 3000;
    const fac = new Map<string, number>();
    const size = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const s = campSpecOf(p(`poi_${(i * 7919) % 100003}_${i}`, 'camp'))!;
      fac.set(s.faction, (fac.get(s.faction) ?? 0) + 1);
      size.set(s.size, (size.get(s.size) ?? 0) + 1);
    }
    for (const f of CAMP_FACTIONS) expect((fac.get(f) ?? 0) / N).toBeGreaterThan(0.29);
    for (const f of CAMP_FACTIONS) expect((fac.get(f) ?? 0) / N).toBeLessThan(0.38);
    // Parts égales, quel que soit le nombre de tailles (1-2 depuis les équipes de 3).
    const part = 1 / CAMP_SIZES.camp.length;
    for (const s of CAMP_SIZES.camp) expect((size.get(s) ?? 0) / N).toBeGreaterThan(part - 0.05);
    for (const s of CAMP_SIZES.camp) expect((size.get(s) ?? 0) / N).toBeLessThan(part + 0.05);
  });

  it('⚠️ la carte ne change pas : createMap ne porte aucun champ de camp', () => {
    const m = createMap(42, 0, 20, OUT);
    for (const q of m.pois) expect(Object.keys(q)).not.toContain('camp');
    expect(createMap(42, 0, 20, OUT)).toEqual(m);
  });
});

describe('📬 le rapport de groupe et la boîte', () => {
  const base = (id: string, claimed?: boolean): ExpeditionMessage => ({
    id,
    level: 1,
    win: true,
    text: '',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: 0,
    read: false,
    ...(claimed === undefined ? {} : { claimed }),
  });
  it('⚠️ keepMessages ne jette JAMAIS un butin à récupérer', () => {
    const list = [
      base('m0', true),
      base('m1', false),
      base('m2'),
      base('m3', false),
      base('m4', true),
    ];
    const kept = keepMessages(list, 2);
    expect(kept.map((m) => m.id)).toEqual(['m0', 'm1', 'm3']);
    expect(keepMessages(list, 10)).toEqual(list);
  });

  describe('⚠️ depositMessages — le double encaissement (revue finale des camps)', () => {
    it('un rapport DÉJÀ encaissé n’est jamais remplacé par sa version « à encaisser »', () => {
      // Le défaut : `expeSettle` remplaçait le rapport par `buildMessage(...)` (claimed: false),
      // et un butin encaissé entre le retour et ce tick redevenait encaissable.
      const box = [base('r', true), base('x', false)];
      const out = depositMessages(box, [base('r', false)], 20);
      expect(out.find((m) => m.id === 'r')!.claimed).toBe(true);
      expect(out.filter((m) => m.id === 'r')).toHaveLength(1);
      // Rien de neuf : la MÊME référence — le store n'écrit pas à vide.
      expect(out).toBe(box);
    });
    it('un encaissement PARTI (pas encore relu) reste encaissé, même si la boîte dit false', () => {
      const box = [base('r', false), base('x', false)];
      const out = depositMessages(box, [], 20, new Set(['r']));
      expect(out.find((m) => m.id === 'r')).toMatchObject({ claimed: true, read: true });
      expect(out.find((m) => m.id === 'x')!.claimed).toBe(false);
      expect(out).not.toBe(box);
      // Un message legacy (claimed absent = déjà crédité) n'est pas touché.
      const legacy = [base('old')];
      expect(depositMessages(legacy, [], 20, new Set(['old']))).toBe(legacy);
    });
    it('un nouveau rapport est ajouté UNE fois, devant ; doublons de `fresh` ignorés', () => {
      const box = [base('a', true)];
      const out = depositMessages(box, [base('n', false), base('n', false)], 20);
      expect(out.map((m) => m.id)).toEqual(['n', 'a']);
      const twice = depositMessages(out, [base('n', false)], 20);
      expect(twice).toBe(out);
      // Plusieurs nouveaux : le dernier déposé passe devant, comme `[msg, ...box]` enchaînés.
      expect(depositMessages([], [base('p'), base('q')], 20).map((m) => m.id)).toEqual(['q', 'p']);
    });
    it('la boîte reste taillée par keepMessages — jamais un butin à récupérer jeté', () => {
      const box = [base('lu1', true), base('lu2', true), base('attend', false)];
      const out = depositMessages(box, [base('n', false)], 2);
      expect(out.map((m) => m.id)).toEqual(['n', 'lu1', 'attend']);
    });
    it('📬 une boîte trop pleine se taille SANS rien de neuf — les butins à prendre restent', () => {
      // Une boîte d'avant (plafond 30) redescend au prochain passage (lecture, encaissement).
      const box = [
        base('a', true),
        base('b', true),
        base('c', true),
        base('d', true),
        base('attend', false),
        base('e', true),
      ];
      const out = depositMessages(box, [], MESSAGES_CAP);
      expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'attend']);
      // Déjà à la bonne taille : la MÊME référence (le store n'écrit pas à vide).
      expect(depositMessages(out, [], MESSAGES_CAP)).toBe(out);
    });
    it('📬 la boîte garde les 3 derniers rapports', () => {
      expect(MESSAGES_CAP).toBe(3);
    });
    it('📬 à la fermeture, les messages vus partent — sauf un butin à prendre', () => {
      const box = [
        base('lu', true), // encaissé
        base('legacy'), // claimed absent = déjà crédité
        base('attend', false), // récompense à prendre : reste
        base('neuf', true), // arrivé après l'affichage : pas vu, reste
      ];
      const out = dropSeenMessages(box, new Set(['lu', 'legacy', 'attend']));
      expect(out.map((m) => m.id)).toEqual(['attend', 'neuf']);
      // Rien à retirer : la MÊME référence (le store n'écrit pas à vide).
      expect(dropSeenMessages(out, new Set(['attend']))).toBe(out);
      expect(dropSeenMessages(box, new Set())).toBe(box);
    });
  });

  it('buildMessage recopie ce que le groupe a vécu', () => {
    const party = {
      hero: false,
      faction: 'betes' as const,
      size: 3,
      escort: ['a'],
      win: true,
      foes: 4,
      slain: 4,
      kills: { a: 4 },
      heroKills: 0,
      xp: { a: 30 },
      hurt: [],
      advGear: [],
      journal: ['x'],
    };
    const exp: ActiveExpedition = {
      poi: {
        id: 'c',
        type: 'camp',
        level: 5,
        x: 0,
        y: 0,
        distNorm: 0.2,
        spawnedAt: 0,
        expiresAt: 1,
      },
      sentAt: 1,
      midAt: 2,
      returnAt: 3,
      goldCost: 0,
      seed: 1,
      outcome: {
        win: true,
        gold: 1,
        energy: 0,
        summonStones: 0,
        scrap: 0,
        item: null,
        key: 0,
        reconBonus: 0,
        returnMult: 1,
        text: 't',
        party,
      },
    };
    const m = buildMessage(exp);
    expect(m.party).toEqual(party);
    expect(m.claimed).toBe(false);
    expect(m.claimAt).toBe(3);
    // ⚠️ Un camp ne rend AUCUNE ferraille : le rapport n'en porte pas.
    expect('scrap' in m).toBe(false);
  });
});

describe('🌱 le début de partie reste jouable (v0.1153)', () => {
  it('sous le niveau 10, aucun lieu n’apparaît plus DUR que le joueur', () => {
    // ⚠️ La force d'un groupe de gardes saute par paliers en début de partie : sans le garde
    // du spawn, un lieu visé « difficulté 4 » sortait à 7 au niveau 5, donc imprenable.
    for (const L of [2, 3, 5, 8]) {
      let checked = 0;
      for (let seed = 1; seed <= 15; seed++) {
        const map = advanceWorld(createMap(seed * 97, 0, L, L), 2 * 24 * 3600_000, L, L);
        for (const p of map.pois) {
          if (!poiForceOf(p) || p.type === 'arena') continue;
          expect(
            poiDifficultyLevel(p),
            `niveau ${L} : ${p.type} niv ${p.level}`,
          ).toBeLessThanOrEqual(L);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(20);
    }
  });
  it('une récolte du héros paie au moins le niveau du joueur, plafonné à 10', () => {
    const p = { id: 'x', type: 'mine' as const, level: 1 };
    expect(heroRewardLevel(p, 3)).toBe(3);
    expect(heroRewardLevel(p, 40)).toBe(EXPE.earlySpawnCapLevel);
    expect(heroRewardLevel(p)).toBe(poiRewardLevel(p));
    const dur = { id: 'x', type: 'mine' as const, level: 60 };
    expect(heroRewardLevel(dur, 3)).toBe(poiRewardLevel(dur));
  });
});
