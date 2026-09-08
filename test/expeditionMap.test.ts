import { describe, it, expect } from 'vitest';
import {
  travelFactor,
  TRAVEL_REF_H,
  TRAVEL_CAP_H,
  isClaimable,
  type ExpeditionMessage,
  haulPills,
  spawnWindow,
  createMap,
  advanceWorld,
  resolveOutcome,
  HARVEST_TYPES,
  HARVEST,
  EXPE,
  poiCombatant,
  ambushCombatant,
  rollTravelEncounters,
  startExpedition,
  TRAVEL,
  landRadius,
  type ExpeditionMap,
  type Poi,
  type PoiType,
} from '@/lib/expedition';
import { playerCombatant, mulberry32 } from '@/lib/combat';

const HOUR = 3_600_000;
const hero = playerCombatant('Héros', { puissance: 600, endurance: 500, agilite: 400 }, 26);

function poi(type: PoiType, level = 26, distNorm = 0.5): Poi {
  return {
    id: 'p',
    type,
    level,
    x: 100,
    y: 40,
    distNorm,
    spawnedAt: 0,
    expiresAt: 1e15,
  } as Poi;
}

describe('fenêtre de niveaux', () => {
  it('part du niveau du joueur et monte à +10 (plus de POI « en dessous »)', () => {
    for (const L of [1, 5, 26, 60]) {
      const w = spawnWindow(L);
      expect(w.min).toBe(Math.max(1, L));
      expect(w.max).toBe(Math.max(1, L) + 10);
    }
  });
});

describe('POI de récolte', () => {
  const types: PoiType[] = ['well', 'shrine', 'archive'];

  it('ne perdent jamais : il n’y a pas de combat au bout du voyage', () => {
    for (const t of types) {
      for (let s = 1; s < 60; s++) expect(resolveOutcome(hero, poi(t), s, 26).win, t).toBe(true);
    }
  });

  it('leur SEUL butin vient d’une rencontre de trajet, jamais de la récolte elle-même', () => {
    let avecObjet = 0;
    for (const t of types) {
      for (let s = 1; s < 120; s++) {
        const o = resolveOutcome(hero, poi(t), s, 26);
        if ((o.items?.length ?? 0) > 0) {
          avecObjet++;
          // Un objet ne peut apparaître QUE si le rapport mentionne l'embuscade qui l'a produit.
          expect(o.text, `${t}/${s}`).toMatch(/Embuscade repoussée/);
        }
      }
    }
    expect(avecObjet, 'aucune embuscade n’a jamais rapporté d’objet').toBeGreaterThan(0);
  });

  it('paient chacun SA ressource vivante, et rien d’autre', () => {
    const well = resolveOutcome(hero, poi('well'), 7, 26);
    expect(well.energy).toBeGreaterThan(0);
    expect(well.summonStones).toBe(0);

    const shrine = resolveOutcome(hero, poi('shrine'), 7, 26);
    expect(shrine.summonStones).toBeGreaterThanOrEqual(2);
    expect(shrine.energy).toBe(0);

    // ⚠️ RÉÉCRIT : ce test affirmait que l'archive paie en fragments 🧩 et encre 🖋️ —
    // il verrouillait donc précisément le défaut. Ces deux devises sont MORTES (plus
    // aucune fonction ne les dépense depuis le retrait des infusions de grade), ce que
    // le test voisin sur les « devises mortes » ne vérifiait pas : il ne connaissait
    // que la poussière et les parchemins. Les archives rendent des CLÉS.
    const arch = resolveOutcome(hero, poi('archive'), 7, 26);
    expect(arch.key).toBeGreaterThan(0);
    expect(arch.energy).toBe(0);
  });

  it('⚠️ le TYPE lui-même ne connaît plus aucune devise morte', () => {
    // Bien plus fort que d'affirmer « elles valent 0 » : ces champs N'EXISTENT PLUS sur
    // `ExpeditionOutcome`. Un test qui vérifiait des zéros a laissé passer la fuite de
    // l'arène pendant tout ce temps, faute d'énumérer le bon type — ici, produire une
    // devise morte ne compile même pas. On garde une vérification à l'exécution pour les
    // objets construits dynamiquement (anciens rapports relus depuis la base).
    for (const t of types) {
      const o = resolveOutcome(hero, poi(t), 3, 26) as unknown as Record<string, unknown>;
      for (const morte of [
        'dust',
        'enchantScrolls',
        'fragments',
        'inkDust',
        'stones',
        'parchemins',
      ])
        expect(o[morte], `${t} : ${morte}`).toBeUndefined();
    }
  });

  it("l'énergie reste un complément borné, jamais un substitut au sport", () => {
    // Même au niveau 100 et au bout du monde, une source reste sous le plafond.
    const o = resolveOutcome(hero, poi('well', 100, 1), 11, 100);
    expect(o.energy).toBeLessThanOrEqual(HARVEST.wellEnergyMax);
  });

  it('les pierres suivent le coût d’un boss (une visite ≈ une tentative)', () => {
    for (const L of [10, 26, 50]) {
      const o = resolveOutcome(hero, poi('shrine', L), 5, L);
      const coutBoss = 1 + Math.floor(L / 5);
      expect(o.summonStones).toBeGreaterThanOrEqual(Math.floor(coutBoss * 0.8));
      expect(o.summonStones).toBeLessThan(coutBoss * 3);
    }
  });

  it('un héros faible récolte quand même : il rentre écorné, jamais bredouille', () => {
    // La récolte elle-même n'a pas de combat. Depuis les rencontres de trajet, le butin
    // n'est plus indépendant du héros — mais le voyage ne peut pas ÉCHOUER pour autant.
    const faible = playerCombatant('Faible', { puissance: 1, endurance: 1, agilite: 1 }, 1);
    for (let s = 1; s < 60; s++) {
      const o = resolveOutcome(faible, poi('shrine'), s, 26);
      expect(o.win).toBe(true);
      expect(o.summonStones).toBeGreaterThan(0);
    }
  });
});

/** POI minimal pour les scénarios de carte périmée. */
function mkPoi(type: PoiType, x: number, y: number): Poi {
  return {
    id: `p_${type}_${x}_${y}`,
    type,
    level: 26,
    x,
    y,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 99 * HOUR,
  };
}

describe('rythme de la carte', () => {
  it('la carte reste PEUPLÉE en permanence — 20 POI, plancher = plafond', () => {
    // ⚠️ RENVERSEMENT ASSUMÉ d'une décision antérieure. On cherchait auparavant une carte
    // qui « respire » (elle se vidait un peu, ce qui créait un arbitrage de rareté). Ce
    // n'est plus le sujet depuis que le NIVEAU d'un POI découle de sa DISTANCE : c'est la
    // DENSITÉ qui rend le dégradé lisible — il faut du monde à toutes les distances pour
    // qu'on voie la pente, et l'arbitrage est devenu « près et facile » contre « loin et
    // payant », pas « en prendre un avant qu'il disparaisse ».
    expect(EXPE.poiFloor).toBe(EXPE.poiCap);
    let map = createMap(1234, 0, 26);
    for (let t = 0; t <= 7 * 24 * HOUR; t += 2 * HOUR) {
      map = advanceWorld(map, t, 26);
      expect(map.pois.length).toBe(EXPE.poiCap);
    }
  });

  it('⚠️ LE NIVEAU SE LIT SUR LA CARTE : près = faible, loin = fort', () => {
    // La règle qui donne son sens au choix d'un POI. Avant, le niveau était tiré
    // indépendamment : un repaire +10 pouvait se poser à deux pas de la ville, et la
    // carte ne disait rien de ce qu'elle proposait.
    let map = createMap(4242, 0, 26);
    for (let t = 0; t <= 3 * 24 * HOUR; t += 2 * HOUR) map = advanceWorld(map, t, 26);
    const pts = map.pois.map((p) => ({ d: p.distNorm, l: p.level }));
    expect(pts.length).toBeGreaterThan(10);
    // Corrélation de Pearson distance ↔ niveau : forte et positive.
    const md = pts.reduce((a, x) => a + x.d, 0) / pts.length;
    const ml = pts.reduce((a, x) => a + x.l, 0) / pts.length;
    const cov = pts.reduce((a, x) => a + (x.d - md) * (x.l - ml), 0);
    const sd = Math.sqrt(pts.reduce((a, x) => a + (x.d - md) ** 2, 0));
    const sl = Math.sqrt(pts.reduce((a, x) => a + (x.l - ml) ** 2, 0));
    const r = cov / (sd * sl || 1);
    expect(r, `corrélation distance/niveau = ${r.toFixed(2)}`).toBeGreaterThan(0.9);
    // Concrètement : le tiers le plus proche est strictement plus faible que le plus loin.
    const tri = [...pts].sort((a, b) => a.d - b.d);
    const n = Math.floor(tri.length / 3);
    const proche = tri.slice(0, n).reduce((a, x) => a + x.l, 0) / n;
    const loin = tri.slice(-n).reduce((a, x) => a + x.l, 0) / n;
    expect(loin, `proches ${proche.toFixed(1)} vs lointains ${loin.toFixed(1)}`).toBeGreaterThan(
      proche + 3,
    );
  });

  it('⚠️ l’ESPACEMENT suit la DENSITÉ : les POI ne s’empilent jamais', () => {
    // Couplage facile à casser en silence : monter `poiCap` sans toucher `minDistPoi`
    // sature la couronne, le placement échoue ses 6 essais et pose les POI les uns sur
    // les autres. À 20 POI avec l'ancien écart de 20, l'occupation atteignait 53 %.
    const aire = Math.PI * (EXPE.distMax ** 2 - EXPE.distMin ** 2);
    const occupe = EXPE.poiCap * Math.PI * (EXPE.minDistPoi / 2) ** 2;
    expect(occupe / aire, 'occupation de la couronne au plafond').toBeLessThan(0.35);

    // …et vérification sur le terrain : aucune paire ne se chevauche visuellement.
    let pires = 0;
    for (let s = 1; s <= 20; s++) {
      let map = createMap(s * 331, 0, 26);
      for (let t = 0; t <= 5 * 24 * HOUR; t += 3 * HOUR) {
        map = advanceWorld(map, t, 26);
        for (let i = 0; i < map.pois.length; i++) {
          for (let j = i + 1; j < map.pois.length; j++) {
            const a = map.pois[i]!;
            const b = map.pois[j]!;
            if (Math.hypot(a.x - b.x, a.y - b.y) < 10) pires++;
          }
        }
      }
    }
    expect(pires, 'paires de POI qui se chevauchent').toBe(0);
  });

  it('la carte offre TOUJOURS du proche, du moyen et du lointain', () => {
    // Un tirage de distance uniforme ne GARANTIT aucune répartition : avec ~6 POI à
    // l'écran, 10 % des cartes n'offraient aucune option proche et 22 % seulement deux
    // bandes sur trois — d'où l'impression que « tout est très loin ». Les spawns
    // parcourent donc les trois tiers à tour de rôle (cf. `placePoi`), ce qui ne change
    // PAS la moyenne (donc ni les temps de trajet ni l'économie) mais garantit le mélange.
    const T = EXPE.town;
    const third = (EXPE.distMax - EXPE.distMin) / 3;
    let snaps = 0;
    let sansProche = 0;
    let troisBandes = 0;
    for (let s = 1; s <= 30; s++) {
      let map = createMap(s * 7919, 0, 26);
      for (let t = 0; t <= 7 * 24 * HOUR; t += 3 * HOUR) {
        map = advanceWorld(map, t, 26);
        if (!map.pois.length) continue;
        snaps++;
        const bands = new Set(
          map.pois.map((p) =>
            Math.min(
              2,
              Math.max(0, Math.floor((Math.hypot(p.x - T.x, p.y - T.y) - EXPE.distMin) / third)),
            ),
          ),
        );
        if (!bands.has(0)) sansProche++;
        if (bands.size === 3) troisBandes++;
      }
    }
    expect(troisBandes / snaps, 'cartes offrant les trois bandes').toBeGreaterThan(0.9);
    expect(sansProche / snaps, 'cartes sans aucune option proche').toBeLessThan(0.05);
  });

  it('⚓ aucun POI ne finit à la MER : ils tiennent dans la terre ferme garantie', () => {
    // `distMax` valait 88 = le rayon NOMINAL du littoral. Or la côte est irrégulière et
    // pince par endroits : un POI tombé dans un renfoncement se retrouvait dessiné en
    // pleine mer. Le maxi est donc désormais borné par `landRadius()` — le rayon sous
    // lequel il y a de la terre quelle que soit la graine du terrain.
    const GLYPH = 6; // demi-largeur du pictogramme + sa pastille de niveau
    expect(EXPE.distMax + GLYPH).toBeLessThan(landRadius());
    for (let s = 1; s <= 25; s++) {
      let map = createMap(s * 613, 0, 26);
      for (let t = 0; t <= 5 * 24 * HOUR; t += 3 * HOUR) {
        map = advanceWorld(map, t, 26);
        for (const p of map.pois) {
          const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
          expect(d + GLYPH, `POI ${p.type} à ${d.toFixed(0)} du centre`).toBeLessThan(landRadius());
        }
      }
    }
  });

  it('une carte SAUVEGARDÉE avant le recadrage se soigne au chargement', () => {
    // Sans ça, un joueur garde jusqu'à 48 h des POI dessinés en pleine mer : ils sont
    // valides (non expirés), donc `advanceWorld` les conservait. On les périme au
    // chargement, comme on droppe un bâtiment dont le type a disparu du registre.
    const stale: ExpeditionMap = {
      seed: 1234,
      spawnCount: 200,
      nextSpawnAt: 10 * HOUR,
      pois: [
        // Placés à l'ancienne fenêtre (jusqu'à 88) → au large aujourd'hui.
        { ...mkPoi('mine', 20, 103), expiresAt: 99 * HOUR },
        { ...mkPoi('lair', 145, 48), expiresAt: 99 * HOUR },
        { ...mkPoi('mine', 131, 29), expiresAt: 99 * HOUR },
      ],
    };
    const fresh = advanceWorld(stale, HOUR, 26);
    for (const p of fresh.pois) {
      const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
      expect(d, 'aucun rescapé au large').toBeLessThanOrEqual(EXPE.distMax + 1);
    }
    // …et le plancher les remplace aussitôt : la carte ne se vide pas.
    expect(fresh.pois.length).toBeGreaterThanOrEqual(EXPE.poiFloor);
  });

  it('mais la cible d’une expédition EN COURS est préservée', () => {
    // Le héros y est physiquement : on ne la fait pas disparaître sous ses pieds.
    const target = { ...mkPoi('lair', 145, 48), id: 'cible', expiresAt: 99 * HOUR };
    const stale: ExpeditionMap = {
      seed: 7,
      spawnCount: 3,
      nextSpawnAt: 10 * HOUR,
      pois: [target],
    };
    const fresh = advanceWorld(stale, HOUR, 26, 'cible');
    expect(fresh.pois.some((p) => p.id === 'cible')).toBe(true);
  });

  it('la ville n’est plus entourée d’un trou : des POI existent tout près', () => {
    // `distMin` valait 30 tant que l'anneau de bâtiments occupait cette couronne ; son
    // départ pour l'écran « Ma base » y a laissé un vide et la ville semblait isolée.
    expect(EXPE.distMin).toBeLessThan(25);
    let map = createMap(4242, 0, 26);
    for (let t = 0; t <= 3 * 24 * HOUR; t += 3 * HOUR) map = advanceWorld(map, t, 26);
    const nearest = Math.min(
      ...map.pois.map((p) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y)),
    );
    expect(nearest).toBeLessThan(45);
  });
});

describe('difficulté des POI de combat', () => {
  it('un adversaire de +10 niveaux reste défini (la fenêtre ne casse rien)', () => {
    const foe = poiCombatant(36, 'lair');
    expect(foe.pv).toBeGreaterThan(0);
    expect(foe.damage).toBeGreaterThan(0);
  });
  it('HARVEST_TYPES contient bien les récoltes et pas les combats', () => {
    // `wreck` (épave) rejoint la famille en v0.661 : c'est une récolte pure — aucun
    // combat, aucun échec — et l'UNIQUE source de ferraille (réparation de l'enceinte).
    expect([...HARVEST_TYPES].sort()).toEqual(['archive', 'mine', 'shrine', 'well', 'wreck']);
    expect(HARVEST_TYPES.has('lair')).toBe(false);
    expect(HARVEST_TYPES.has('arena')).toBe(false);
  });
});

describe('rencontres de trajet', () => {
  it('un rôdeur est calibré sur le HÉROS : franchissable quel que soit l’équipement', () => {
    // Le calibrage absolu (`poiCombatant`, PV ~L³) rendait l'embuscade arithmétiquement
    // imbattable sans stuff — un héros peu équipé rentrait écorné à TOUS les coups.
    const faible = playerCombatant('Faible', { puissance: 5, endurance: 5, agilite: 5 }, 3);
    const fort = playerCombatant('Fort', { puissance: 900, endurance: 700, agilite: 500 }, 40);
    for (const [nom, h] of [
      ['faible', faible],
      ['fort', fort],
    ] as const) {
      const foe = ambushCombatant(h, 26);
      // Le rôdeur meurt en ~2-3 tours de dégâts du héros, et mord une fraction de ses PV.
      expect(foe.pv, nom).toBeLessThan(h.damage * (h.strikes ?? 1) * 4);
      expect(foe.damage, nom).toBeLessThan(h.pv * 0.2);
      expect(foe.pv, nom).toBeGreaterThan(0);
    }
  });

  it('les deux jambes de trajet peuvent porter une rencontre', () => {
    const legs = new Set<string>();
    for (let s = 1; s < 200; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('well'), s, 26);
      for (const e of r.encounters) legs.add(e.leg);
    }
    expect([...legs].sort()).toEqual(['back', 'out']);
  });

  it('une embuscade repoussée enrichit, une embuscade subie écorne', () => {
    let vu = { win: false, lose: false };
    for (let s = 1; s < 300; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('well'), s, 26);
      const amb = r.encounters.filter((e) => e.kind === 'ambush');
      if (!amb.length || r.encounters.some((e) => e.kind !== 'ambush')) continue;
      if (amb.every((e) => e.won)) {
        expect(r.resMult).toBeGreaterThan(1);
        vu.win = true;
      } else if (amb.every((e) => !e.won)) {
        expect(r.resMult).toBeLessThan(1);
        vu.lose = true;
      }
    }
    expect(vu.win, 'aucune embuscade gagnée observée').toBe(true);
  });

  it('le multiplicateur reste dans des bornes saines (jamais de jackpot ni de ruine)', () => {
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('shrine'), s, 26);
      expect(r.resMult).toBeGreaterThan(0.2);
      expect(r.resMult).toBeLessThan(3);
      expect(r.goldMult).toBeGreaterThan(0.2);
      expect(r.returnMult).toBeGreaterThan(0.2);
      expect(r.returnMult).toBeLessThanOrEqual(1); // le retour n'est jamais RALENTI
    }
  });
});

describe('rencontres qui jouent sur le TEMPS', () => {
  it('un passage ou un contretemps RACCOURCIT le retour, jamais l’aller', () => {
    let vuCourt = false;
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('well'), s, 26);
      const temps = r.encounters.filter((e) => e.kind === 'shortcut' || e.kind === 'setback');
      if (!temps.length) {
        expect(r.returnMult).toBe(1);
      } else {
        expect(r.returnMult).toBeLessThan(1);
        vuCourt = true;
      }
    }
    expect(vuCourt, 'aucun raccourci observé').toBe(true);
  });

  it('le décalage arrive jusqu’au calendrier de l’expédition', () => {
    // De bout en bout : l'aller (midAt) ne bouge JAMAIS, seul le retour se resserre.
    let vuDecale = false;
    for (let s = 1; s < 300; s++) {
      const p = poi('well');
      const exp = startExpedition(hero, p, 0, s, 1, 26);
      const aller = exp.midAt - exp.sentAt;
      const retour = exp.returnAt - exp.midAt;
      expect(aller).toBeGreaterThan(0);
      expect(retour).toBeLessThanOrEqual(aller + 1);
      if (retour < aller * 0.95) vuDecale = true;
      // Le retour reste cohérent avec le multiplicateur annoncé par l'issue.
      expect(Math.abs(retour - aller * exp.outcome.returnMult)).toBeLessThanOrEqual(2);
    }
    expect(vuDecale, 'aucune expédition écourtée sur 300 tirages').toBe(true);
  });

  it('un contretemps coûte la moitié de la cargaison — le temps se paie', () => {
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('shrine'), s, 26);
      if (r.encounters.length === 1 && r.encounters[0]!.kind === 'setback') {
        expect(r.resMult).toBeCloseTo(TRAVEL.setbackHaulMult, 5);
        expect(r.returnMult).toBeCloseTo(TRAVEL.setbackReturnMult, 5);
        return;
      }
    }
  });

  it('le marchand ÉCHANGE : moins d’or, plus de ressources', () => {
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('archive'), s, 26);
      if (r.encounters.length === 1 && r.encounters[0]!.kind === 'merchant') {
        expect(r.goldMult).toBeLessThan(1);
        expect(r.resMult).toBeGreaterThan(1);
        expect(r.returnMult).toBe(1); // il ne fait pas gagner de temps
        return;
      }
    }
  });
});

describe('route dangereuse (télégraphiée)', () => {
  it('double les embuscades ET renforce le gain quand on les repousse', () => {
    const calme = poi('well');
    const risque = { ...poi('well'), perilous: true } as Poi;
    let nCalme = 0;
    let nRisque = 0;
    let gainCalme = 0;
    let gainRisque = 0;
    for (let s = 1; s < 600; s++) {
      const a = rollTravelEncounters(mulberry32(s), hero, calme, s, 26);
      const b = rollTravelEncounters(mulberry32(s), hero, risque, s, 26);
      nCalme += a.encounters.filter((e) => e.kind === 'ambush').length;
      nRisque += b.encounters.filter((e) => e.kind === 'ambush').length;
      gainCalme += a.resMult;
      gainRisque += b.resMult;
    }
    expect(nRisque).toBeGreaterThan(nCalme * 1.5);
    expect(gainRisque).toBeGreaterThan(gainCalme); // le risque PAIE en moyenne
  });

  it('est posée au spawn, donc annonçable avant l’envoi', () => {
    let map = createMap(4242, 0, 26);
    let vu = 0;
    for (let t = 0; t <= 30 * 24 * HOUR; t += 3 * HOUR) {
      map = advanceWorld(map, t, 26);
      vu += map.pois.filter((p) => p.perilous).length;
    }
    expect(vu, 'aucun POI dangereux généré en 30 jours').toBeGreaterThan(0);
  });
});

describe('butin affiché — source unique des deux écrans', () => {
  it('⚠️ une ÉPAVE ne doit plus afficher un butin VIDE', () => {
    // Le défaut réel : la modale de collecte et la boîte 📬 listaient leurs devises à la
    // main (or / énergie / clé) et n'ont pas suivi l'ajout des POI de RÉCOLTE (v0.658).
    // Une épave — seule source de ferraille du jeu — ne montrait donc RIEN.
    expect(haulPills({ scrap: 87 })).toEqual([{ emoji: '🔩', n: 87 }]);
    expect(haulPills({ summonStones: 6 })).toEqual([{ emoji: '🔮', n: 6 }]);
    // ⚠️ RÉÉCRIT : ce test exigeait que les pastilles AFFICHENT fragments et encre — il
    // verrouillait donc la promesse faite au joueur d'une monnaie qu'il ne peut pas
    // dépenser. `haulPills` ne connaît plus ces devises.
    expect(haulPills({ summonStones: 6, key: 2 })).toEqual([
      { emoji: '🔮', n: 6 },
      { emoji: '🗝️', n: 2 },
    ]);
  });
  it('n’affiche que ce qui a VRAIMENT été gagné, dans un ordre stable', () => {
    expect(haulPills({ gold: 0, energy: 12, key: 1 })).toEqual([
      { emoji: '⚡', n: 12 },
      { emoji: '🗝️', n: 1 },
    ]);
    expect(haulPills({})).toEqual([]);
  });
});

describe('butin à RÉCUPÉRER (et pas deux fois)', () => {
  const msg = (over: Partial<ExpeditionMessage> = {}): ExpeditionMessage =>
    ({
      id: 'm1',
      poiType: 'wreck',
      level: 26,
      win: true,
      text: '',
      gold: 0,
      dust: 0,
      energy: 0,
      enchantScrolls: 0,
      scrap: 90,
      key: 0,
      resolvedAt: 1000,
      claimAt: 5000,
      claimed: false,
      read: false,
      ...over,
    }) as ExpeditionMessage;

  it('⚠️ un rapport d’AVANT la récupération manuelle est déjà crédité — jamais réclamable', () => {
    // La propriété qui protège le joueur ET l'économie : `claimed` absent signifie
    // « déjà encaissé automatiquement ». Le traiter comme « à récupérer » offrirait une
    // seconde fois le butin de chaque expédition déjà faite.
    const legacy = msg();
    delete (legacy as { claimed?: boolean }).claimed;
    expect(isClaimable(legacy, 9e9)).toBe(false);
  });

  it('rien à prendre tant que le héros est sur la route du retour', () => {
    expect(isClaimable(msg(), 4999)).toBe(false); // rapport lu, héros pas rentré
    expect(isClaimable(msg(), 5000)).toBe(true);
  });

  it('une fois encaissé, il ne l’est plus jamais', () => {
    expect(isClaimable(msg({ claimed: true }), 9e9)).toBe(false);
  });

  it('un vieux rapport sans claimAt retombe sur l’heure de résolution', () => {
    const m = msg({ claimAt: undefined });
    expect(isClaimable(m, 999)).toBe(false);
    expect(isClaimable(m, 1000)).toBe(true);
  });
});

describe('aller loin doit VRAIMENT payer', () => {
  it('⚠️ le rendement par HEURE croît avec la durée du trajet (super-linéaire)', () => {
    // La règle : tant que la récompense montait proportionnellement au trajet, la
    // distance n'était qu'une taxe de temps — deux POI proches rapportaient autant qu'un
    // lointain dans le même délai, et rien ne justifiait jamais d'aller loin.
    const perHour = (h: number) => travelFactor(h) / h;
    const near = perHour(2);
    const mid = perHour(4);
    const far = perHour(8);
    expect(mid, `2 h → ${near.toFixed(2)}/h, 4 h → ${mid.toFixed(2)}/h`).toBeGreaterThan(near);
    expect(far, `4 h → ${mid.toFixed(2)}/h, 8 h → ${far.toFixed(2)}/h`).toBeGreaterThan(mid);
    expect(far / near, `loin/proche = ${(far / near).toFixed(2)}×`).toBeGreaterThan(1.3);
  });

  it('⚠️ SANS INFLATER l’économie : au voyage de référence, la valeur est l’ancienne', () => {
    // Le facteur est CALÉ sur `TRAVEL_REF_H` : en deçà on gagne un peu moins, au-delà
    // nettement plus. C'est un arbitrage qu'on crée, pas un cadeau — sinon toute
    // l'économie (ferraille comprise, qu'on vient de calibrer) dériverait d'un coup.
    expect(travelFactor(TRAVEL_REF_H)).toBeCloseTo(0.5 + TRAVEL_REF_H, 6);
    expect(travelFactor(1.5)).toBeLessThan(0.5 + 1.5);
    expect(travelFactor(6)).toBeGreaterThan(0.5 + 6);
  });

  it('reste borné : un trajet interminable ne multiplie pas tout', () => {
    expect(travelFactor(50)).toBe(travelFactor(TRAVEL_CAP_H));
  });
});

describe('la carte ne paie JAMAIS en monnaie morte', () => {
  // ⚠️ Le défaut réel, signalé par l'utilisateur : les ARCHIVES 📖 versaient des
  // fragments 🧩 et de la poussière d'encre 🖋️, et la MINE des fragments — or plus
  // aucune fonction ne dépense ces devises depuis le retrait des infusions de grade.
  // Un POI entier payait donc en monnaie de singe, ce que la v0.658 prétendait avoir
  // corrigé (elle avait retiré la poussière ✨ et les parchemins 📜, puis introduit
  // l'archive avec le même défaut). Les archives rendent désormais des CLÉS 🗝️.
  const hero = {
    name: 'h',
    pv: 5000,
    maxPv: 5000,
    damage: 400,
    crit: 0.1,
    dodge: 0.05,
    initiative: 10,
    strikes: 1,
  } as never;

  it('AUCUN type de POI ne verse fragments 🧩 ni encre 🖋️', () => {
    // ⚠️ 'arena' EST DANS LA LISTE, et il n'y était pas : c'est très exactement par là que
    // la fuite passait (l'arène versait fragments + encre, seule production non nulle qui
    // restait). Un filet troué est pire qu'aucun filet — il rassure.
    const types: PoiType[] = [
      'mine',
      'well',
      'shrine',
      'archive',
      'wreck',
      'camp',
      'lair',
      'arena',
    ];
    for (const type of types) {
      for (let s = 1; s <= 30; s++) {
        const poi = {
          id: 'p',
          type,
          level: 26,
          x: 100,
          y: 60,
          distNorm: 0.5,
          spawnedAt: 0,
          expiresAt: 9e15,
        } as never;
        const o = resolveOutcome(hero, poi, s * 97 + 3, 26) as unknown as Record<string, unknown>;
        // Les champs n’existent plus sur le type : on vérifie qu’aucun ne réapparaît.
        expect(o.fragments, `${type} verse des fragments`).toBeUndefined();
        expect(o.inkDust, `${type} verse de l’encre`).toBeUndefined();
      }
    }
  });

  it('les ARCHIVES rendent des CLÉS, et davantage quand on va loin', () => {
    const at = (distNorm: number) => {
      let total = 0;
      for (let s = 1; s <= 40; s++) {
        const poi = {
          id: 'p',
          type: 'archive' as PoiType,
          level: 26,
          x: 100,
          y: 60,
          distNorm,
          spawnedAt: 0,
          expiresAt: 9e15,
        } as never;
        total += resolveOutcome(hero, poi, s * 61 + 7, 26).key;
      }
      return total / 40;
    };
    const proche = at(0.1);
    const loin = at(1);
    expect(proche, `archive proche : ${proche.toFixed(2)} clé(s)`).toBeGreaterThanOrEqual(1);
    expect(loin, `proche ${proche.toFixed(2)} vs loin ${loin.toFixed(2)}`).toBeGreaterThan(proche);
  });
});
