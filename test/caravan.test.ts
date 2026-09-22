import { describe, it, expect } from 'vitest';
const NUS = { advGear: [] };
import {
  CARAVAN,
  canSendCaravan,
  caravanClaimRoster,
  caravanHurtMs,
  caravanLegMin,
  caravanSlots,
  convoySlotsFree,
  poiOffers,
  caravanWages,
  escortCombatant,
  ambushChance,
  heroEquivalentFactor,
  isCaravanClaimable,
  pruneCaravans,
  CARAVAN_KEEP_CLAIMED,
  escortShare,
  suggestEscort,
  convoyHurt,
  missionXp,
  refAdventurer,
  refChampionAdv,
  refEscortUnits,
  resolveCaravan,
  roadGearEffects,
  roadFoe,
  escortGear,
  roadUnits,
  roadTroop,
  unitEffects,
  startCaravan,
  caravanReport,
  claimedCaravans,
  caravanHaulMult,
  refAdvGear,
  type Caravan,
} from '@/lib/caravan';
import { trialXpBase } from '@/lib/skirmish';
import {
  advGearEffects,
  advGearHasSecondAffix,
  advGearRoles,
  advGearValue,
  makeAdvGear,
  ADV_GEAR_SLOTS,
  LINEAGE_GEAR,
  lineageOf,
  wornGear,
  type AdvGear,
} from '@/lib/advGear';
import {
  advRarity,
  advRoles,
  grantAdvXp,
  engageCap,
  PROMO_LEVELS,
  type Adventurer,
  type AdvRole,
} from '@/lib/adventurers';
import { CHAMPIONS } from '@/data/champions';
import {
  TALENTS,
  talentTierFloor,
  talentValue,
  talentByCode,
  talentRollOf,
  type TalentInstance,
} from '@/lib/talents';
import { mulberry32, offenseOf, simulateCombat, survivalOf } from '@/lib/combat';
import {
  famXpForLevel,
  aggregateEffects,
  mergeEffects,
  FAMILIAR_SLOT,
  RANK_ORDER,
  RARITY_RANK,
  prestigeRankIndex,
  type AggregatedEffects,
  type Item,
} from '@/lib/items';
import {
  EXPE,
  travelPosition,
  harvestYield,
  spawnWindow,
  travelFactor,
  travelOneWayMin,
  type Poi,
  type PoiType,
} from '@/lib/expedition';

const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'p',
  type: 'well',
  level: 20,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
/** ⚠️ Une escorte ÉQUIPÉE (pièces de référence, `refAdvGear`) : la route se calibre sur un
 *  vivier équipé. `sansGear` garde la mesure SANS équipement. Plus de compagnon (v0.996). */
const team = (
  n: number,
  level = 20,
  // ⚠️ LE RÔLE, PLUS UN CHEMIN DE CLASSES (v0.952) : un champion a une IDENTITÉ, et son
  // rôle est écrit dessus — un `path` ne décide plus de rien. ⚠️ Et il n'existe AUCUN
  // champion SANS rôle (le roster en pose un par rôle à chaque rareté), donc « sans le
  // rôle X » se mesure avec un champion qui en porte un AUTRE : c'est même plus propre,
  // ça isole ce qu'on mesure au lieu de comparer à une escorte sans aucune compétence.
  role?: AdvRole,
  sansGear = false,
): Adventurer[] => {
  // ⚠️ Forcer un rôle force un CHAMPION, donc une lignée qui n’est pas celle des pièces
  // de référence du slot : on les retire plutôt que de les laisser être ignorées en
  // silence par `wornGear` (ces tests-là mesurent le rôle, pas l’équipement).
  const force = role ? CHAMPIONS.find((c) => c.role === role) : undefined;
  const sansPieces = sansGear || !!force;
  return Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(level, i),
    id: `a${i}`,
    ...(force ? { championId: force.id, name: force.name } : {}),
    ...(sansPieces
      ? {}
      : {
          // ⚠️ LES QUATRE EMPLACEMENTS, relique comprise : elle est devenue le 4ᵉ en v0.881
          // et cette fixture ne l'avait jamais suivie. Les bandes d'embuscade se mesuraient
          // donc avec 3 pièces sur 4 face à un `roadFoe` calibré sur une référence qui en
          // porte QUATRE — l'escorte du test était structurellement sous-équipée.
          gear: {
            weapon: `refGear${i}weapon`,
            armor: `refGear${i}armor`,
            accessory: `refGear${i}accessory`,
            relic: `refGear${i}relic`,
          },
        }),
  }));
};
function winPct(escort: Adventurer[], p: Poi, n = 150) {
  const lvl = escort[0]?.level ?? p.level;
  const g = escortCombatant(
    escort,
    'Escorte',
    roadGearEffects(escort, { advGear: refAdvGear(lvl, escort.length) }),
  );
  const f = roadFoe(p);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(g, { ...f }, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
  return w / n;
}
const avgOf = (p: Poi, esc: Adventurer[], key: 'gold' | 'energy', n = 200) =>
  Array.from({ length: n }, (_, i) => resolveCaravan(p, esc, i * 7919 + 3, NUS, 100)[key]).reduce(
    (a, b) => a + b,
    0,
  ) / n;

describe('⚠️ le DANGER DE LA ROUTE est ABSOLU', () => {
  it('les bandits ne dépendent PAS de l’escorte qu’on envoie', () => {
    // C'est LA décision de la feature. `ambushCombatant` (héros) est calibré RELATIVEMENT
    // au combattant qu'on lui passe ; le réutiliser ferait s'adapter les bandits à
    // l'escorte, et « combien d'aventuriers j'envoie » ne voudrait plus rien dire.
    const p = poi();
    const a = roadFoe(p);
    const b = roadFoe(p);
    expect(a).toEqual(b); // il ne dépend que du POI
    expect(a.pv).toBeGreaterThan(0);
  });
  it('⚠️ L’ÉTALON est une escorte ÉQUIPÉE, sans compagnon (v0.996)', () => {
    // Familiers et talents sont réservés au héros : la référence ne porte plus que ses
    // pièces, et ce que son compagnon lui apportait est dans sa base de stats
    // (`CHAMPION_SOLO`) — c'est ce qui garde les bandes d'embuscade en place.
    const L = 35;
    const esc = [0, 1, 2].map((i) => refChampionAdv(L, i));
    const e = advGearEffects(refAdvGear(L));
    const tiers = Object.fromEntries(
      Object.entries(e).map(([k, v]) => [k, v * (1 / esc.length)]),
    ) as unknown as AggregatedEffects;
    const ref = escortCombatant(esc, 'Référence', tiers);
    const f = roadFoe(poi({ level: L }));
    expect(f.pv).toBe(Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * CARAVAN.foePvTurns)));
    expect(f.damage).toBe(Math.max(1, Math.round(survivalOf(ref) * 100 * CARAVAN.foeDmgPctPv)));
  });
  it('envoyer PLUS d’aventuriers change réellement l’issue', () => {
    const p = poi();
    const un = winPct(team(1), p);
    const trois = winPct(team(3), p);
    const quatre = winPct(team(4), p);
    expect(trois).toBeGreaterThan(un + 0.3);
    expect(quatre).toBeGreaterThanOrEqual(trois);
    expect(trois).toBeGreaterThan(0.4);
    expect(trois).toBeLessThan(1); // ça reste un risque, pas une formalité
  });
  it('⚠️ LA RÉFÉRENCE DE ROUTE COUVRE LES 8 STRATES', () => {
    // ⚠️ Sa lignée s’arrêtait à 4 classes : la route cessait donc de monter à la strate 3
    // pendant qu’une escorte réelle, elle, continue — depuis que le vivier va jusqu’au
    // primordial, les convois seraient devenus triviaux dès le niveau 8. Le danger de la
    // route est ABSOLU : il doit suivre l’échelle ENTIÈRE de ce qu’on peut aligner.
    expect(refAdventurer(99).path).toHaveLength(PROMO_LEVELS.length);
  });

  it('⚠️ LA DÉCISION D’ESCORTE SURVIT AUX HAUTES STRATES', () => {
    // Les strates 4-7 rendent un aventurier ~3,2 fois plus fort à niveau égal. Le seul
    // vrai choix de la feature — « combien j’en envoie » — doit y résister, sinon élever
    // son vivier le supprime. On le mesure là où il compte : sur une route PÉRILLEUSE,
    // avec des aventuriers promus autant que leur niveau l’autorise.
    // ⚠️ Mesuré sur route CALME au niveau 70, un trio promu monte à 99 % : là, le choix
    // se déplace de « 3 ou 4 » vers « 2 ou 3 ». C’est assumé — c’est le paiement d’un long
    // investissement — mais il ne doit PAS disparaître aussi sur les routes dangereuses.
    for (const L of [26, 70]) {
      const p2 = poi({ level: L, perilous: true });
      const un = winPct(team(1, L), p2);
      const trois = winPct(team(3, L), p2);
      const quatre = winPct(team(4, L), p2);
      // ⚠️ La borne épinglait 0,5 — un NOMBRE, alors que la bande documentée d'un trio
      // sur route périlleuse est 8-68 %. Ce qui compte, et qui reste vérifié partout :
      // seul on ne passe pas, et le quatrième aventurier compte encore.
      expect(un, `niveau ${L}, seul`).toBeLessThan(0.15);
      expect(trois, `niveau ${L}, trois`).toBeGreaterThan(0.08);
      expect(quatre, `niveau ${L}, quatre`).toBeGreaterThanOrEqual(trois);
    }
    // ⚠️ EN MILIEU DE PARTIE — là où cette feature vit — un trio n'est JAMAIS acquis.
    expect(winPct(team(3, 26), poi({ level: 26, perilous: true }))).toBeLessThan(0.7);
  });

  it('⚠️ LA DIFFICULTÉ DE LA ROUTE EST PLATE, du niveau 12 au 85', () => {
    // ⚠️ ELLE NE L'ÉTAIT PAS, et ce test remplace celui qui documentait la dérive.
    // Mesuré avant : un trio passait de **76 % à 100 %** de victoires entre les niveaux
    // 12 et 85 — la route devenait une formalité exactement là où l'on a le plus
    // d'aventuriers à occuper.
    //
    // ⚠️ DEUX CAUSES, la même à chaque fois : `roadFoe` se dimensionnait sur des
    // ESTIMATEURS LOCAUX qui ignoraient la moitié de ce que `simulateCombat` applique.
    // L'offense oubliait les SIGNATURES (une par strate haute : 0 au niveau 20, 10 au
    // niveau 85), la survie oubliait l'ESQUIVE (qui monte avec l'agilité). Chaque cran
    // gagné par l'escorte la renforçait donc **sans renforcer la route**. Les deux
    // délèguent maintenant à `offenseOf`/`survivalOf`, les formules de `combatPower` —
    // l'arbitre unique du jeu.
    //
    // Mesuré après : 80 / 83 / 75 / 88 / 92 / 93 %. ⚠️ Re-mesuré quand la référence est
    // devenue ÉQUIPÉE (`ADV_GEAR.k` 0,15, foePvTurns 2,58, foeDmgPctPv 0,275) : trio équipé
    // sur 2000 convois `resolveCaravan`, 92 / 89 / 76 / 74 / 85 / 89 % en calme et
    // 26 / 27 / 35 / 25 / 29 / 34 % en périlleux.
    //
    // ⚠️ LES BANDES DOCUMENTÉES SONT BORNÉES ICI, pas seulement leur écart : calme dans
    // 73-94 %, périlleux dans 8-40 %. Le plancher calme est posé à 0,70 (et non 0,73) pour
    // absorber le bruit d'un jeu de graines fixe ; 600 graines pour que les valeurs le
    // passent d'au moins 2 points. Mesuré sur CES 600 graines :
    //   calme      88,8 / 83,2 / 73,3 / 75,7 / 86,8 / 87,2 %
    //   périlleux  21,0 / 23,5 / 32,7 / 25,0 / 31,0 / 28,3 %
    const NIV = [12, 20, 26, 45, 70, 85];
    const calme = NIV.map((L) => winPct(team(3, L), poi({ level: L }), 600));
    for (const [i, t] of calme.entries()) {
      expect(t, `calme niveau ${NIV[i]}`).toBeGreaterThanOrEqual(0.7);
      expect(t, `calme niveau ${NIV[i]}`).toBeLessThanOrEqual(0.94);
    }
    expect(Math.max(...calme) - Math.min(...calme)).toBeLessThan(0.3);

    // ⚠️ C’EST LA ROUTE PÉRILLEUSE QUI DISCRIMINE, et c’est là que le choix doit survivre.
    // Sur route DANGEREUSE un trio doit rester un pari à tout niveau — avant l’équipement,
    // mesuré 8 / 16 / 28 / 34 / 34 / 35 %, contre 8 / 16 / 28 / **45 / 48 / 48** avec
    // l’offense amputée de ses signatures : c’est exactement là que la fin de partie
    // basculait de « pari » à « formalité ».
    const peril = NIV.map((L) => winPct(team(3, L), poi({ level: L, perilous: true }), 600));
    for (const [i, t] of peril.entries()) {
      expect(t, `périlleux niveau ${NIV[i]}`).toBeGreaterThanOrEqual(0.08);
      expect(t, `périlleux niveau ${NIV[i]}`).toBeLessThanOrEqual(0.4);
    }
  });

  it('⚠️ « COMBIEN J’EN ENVOIE » RESTE UNE DÉCISION : seul on ne passe pas, à deux on est loin', () => {
    // Le duo a quitté sa bande historique (8-33 %) : mesuré 48,8 / 35,5 % aux niveaux 12 / 20
    // sur ces graines. Accepté comme nouvelle bande — ce qui compte est l'ÉCART au trio, qui
    // porte la décision. Mesuré (600 graines, calme) : trio − duo = 40 / 48 / 61 / 48 / 65 /
    // 67 points. Solo : 0 victoire sauf 1 sur 600 au niveau 26 (2 sur 941 embuscades via
    // `resolveCaravan`) — un coup de chance d'esquive, pas une stratégie.
    const NIV = [12, 20, 26, 45, 70, 85];
    for (const L of NIV) {
      const p = poi({ level: L });
      const solo = winPct(team(1, L), p, 600);
      const duo = winPct(team(2, L), p, 600);
      const trio = winPct(team(3, L), p, 600);
      expect(solo, `solo niveau ${L}`).toBeLessThan(0.01);
      expect(duo, `duo niveau ${L}`).toBeLessThanOrEqual(trio - 0.25);
    }
  });

  it('⚠️ L’ÉQUIPEMENT EST UN BONUS, PAS UN PÉAGE — la référence porte ses pièces', () => {
    // Un gain modeste. ⚠️ À `ADV_GEAR.k` = 1 un trio
    // sans pièces tombait à 22-28 % de ses embuscades calmes dès le niveau 26 — la plupart
    // des joueurs, équipés partiellement pendant des semaines, auraient payé l'absence
    // d'équipement. Mesuré à 0,15 (2000 graines) : sans pièces 90/86/72/63/67/65 %, équipé
    // 92/89/76/74/85/89 %.
    const NIV = [12, 20, 26, 45, 70, 85];
    for (const L of NIV) {
      const sans = winPct(team(3, L, undefined, true), poi({ level: L }), 200);
      expect(sans, `sans pièces, niveau ${L}`).toBeGreaterThanOrEqual(0.5);
    }
    // …mais un bonus RÉEL. ⚠️ RE-MESURÉ sur l’étalon en champions (3000 graines) : le gain
    // vaut +9,3 points au niveau 12, +3,2 au 26, +5,5 au 45, +6,1 au 70 et +21,6 au 85.
    // Le seuil de +10 points datait de l’étalon en aventuriers ; on borne donc sur ce qui
    // est vrai — un gain qui ne peut pas être du bruit, à 600 tirages.
    for (const L of [70, 85]) {
      const p = poi({ level: L });
      const avec = winPct(team(3, L), p, 600);
      const sans = winPct(team(3, L, undefined, true), p, 600);
      expect(avec, `niveau ${L}`).toBeGreaterThan(sans + 0.04);
    }
  });

  it('une route PÉRILLEUSE est réellement plus dure — le drapeau n’est pas décoratif', () => {
    const esc = team(3);
    expect(winPct(esc, poi({ perilous: true }))).toBeLessThan(winPct(esc, poi()));
  });
  it('un POI plus profond envoie des bandits plus forts', () => {
    expect(roadFoe(poi({ level: 40 })).pv).toBeGreaterThan(roadFoe(poi({ level: 10 })).pv);
  });
});

describe('⚠️ la cargaison se paie sur la durée qu’un HÉROS aurait mise', () => {
  it('une équipe va au pas du HÉROS sans Avant-poste (v0.1033)', () => {
    // Avant : ×1,5 le temps du héros, ×1,27 au mieux avec l'Avant-poste. Les convois ont
    // disparu : plus de lenteur propre. Sans rôle 🧭, exactement le trajet du héros ; les
    // rôles 🧭 la rendent plus rapide.
    for (const level of [5, 20, 40, 80]) {
      const p = poi({ level });
      const hero = travelOneWayMin(p.level, p.distNorm);
      expect(caravanLegMin(p, [], 0), `niveau ${level}`).toBe(Math.max(1, Math.round(hero)));
      expect(caravanLegMin(p, team(3), 0), `niveau ${level}`).toBeLessThanOrEqual(Math.round(hero));
    }
  });
  it('…et la paie est celle du trajet du héros', () => {
    // `travelFactor` est SUPER-LINÉAIRE : payer sur le temps réel ferait de la vitesse
    // (rôles 🧭) une PÉNALITÉ par voyage. La paie ne dépend que du lieu.
    const p = poi();
    const heroH = (2 * travelOneWayMin(p.level, p.distNorm)) / 60;
    expect(heroEquivalentFactor(p)).toBeCloseTo(travelFactor(heroH), 6);
  });
});

describe('⚠️ ce qu’une caravane rapporte — et ce qu’elle ne rapportera JAMAIS', () => {
  it('aucun ÉQUIPEMENT : ce n’est pas une source de butin', () => {
    // « Le sport est le plafond » : la carte ne doit pas devenir un raccourci vers du
    // stuff hors de sa ligue. Une caravane paie en LOGISTIQUE, point.
    const o = resolveCaravan(poi(), team(3), 42, NUS, 100);
    expect(Object.keys(o)).not.toContain('item');
    expect(Object.keys(o)).not.toContain('items');
  });
  it('elle rend une PART mesurée d’une visite du héros — elle complète, elle ne remplace pas', () => {
    // ⚠️ Borne SERRÉE autour de `yieldShare` : un « simplement moins que le héros » laissait
    // passer la suppression de la part (les multiplicateurs de rencontre suffisaient à
    // rester sous la barre). ⚠️ Mesuré sur l'ÉNERGIE d'une source (la ferraille, qui
    // servait de mesure, est retirée v0.998) : c'est une récolte pure, sans filet d'or qui
    // brouillerait la part.
    const p = poi({ type: 'well' });
    const heros = harvestYield(p.type, p.level, heroEquivalentFactor(p)).energy;
    // ⚠️ Une escorte SANS RÔLE : le sujet du test est `yieldShare`, pas la cargaison
    // qu'un 🐫 ajoute. Depuis que la référence est mixte, elle porte un rôle de haul —
    // le test mesurait donc les deux à la fois et est tombé pour la mauvaise raison.
    const part = avgOf(p, team(3, 20, 'heal'), 'energy') / heros;
    expect(part).toBeGreaterThan(CARAVAN.yieldShare * 0.75);
    expect(part).toBeLessThan(CARAVAN.yieldShare * 1.25);
  });
  it('le plafond d’ÉNERGIE tient APRÈS les multiplicateurs', () => {
    // « complément, jamais substitut au sport » est un invariant, pas une base qu'un
    // bon voyage pourrait dépasser.
    // ⚠️ Il faut FORCER un multiplicateur > 1, sinon le test passe même sans plafond :
    // une escorte 🐫 (cargaison) et des embuscades gagnées poussent `k` au-dessus de 1.
    const p = poi({ type: 'well', level: 90, distNorm: 1 });
    const cap = harvestYield('well', 90, heroEquivalentFactor(p)).energy * CARAVAN.yieldShare;
    const cargo = team(4, 90, 'haul');
    let vu = false;
    for (let s = 0; s < 200; s++) {
      const o = resolveCaravan(p, cargo, s * 977 + 1, NUS, 100);
      expect(o.energy).toBeLessThanOrEqual(Math.round(cap) + 1);
      if (o.energy >= Math.round(cap) - 1) vu = true;
    }
    expect(vu, 'aucun voyage n’a approché le plafond : le test ne prouve rien').toBe(true);
  });
  it('elle ne va que sur les POI de RÉCOLTE', () => {
    for (const t of ['camp', 'lair', 'arena'] as PoiType[]) {
      expect(canSendCaravan(poi({ type: t }), team(3), 99)).toBe(false);
    }
    for (const t of ['well', 'shrine', 'archive', 'mana_mine', 'mine'] as PoiType[]) {
      expect(canSendCaravan(poi({ type: t }), team(3), 99)).toBe(true);
    }
  });
  it('escorte vide ou pléthorique : refusée', () => {
    expect(canSendCaravan(poi(), [], 99)).toBe(false);
    expect(canSendCaravan(poi(), team(CARAVAN.escortMax + 1), 99)).toBe(false);
  });

  it('🗿 le PLAFOND DU PANTHÉON borne aussi une escorte, et le plus strict gagne', () => {
    // ⚠️ `escortMax` (4) domine dès le Panthéon 6 ; en dessous c'est le Panthéon qui
    // décide, sinon un débutant enverrait plus de monde qu'il ne peut en engager.
    expect(canSendCaravan(poi(), team(2), 2)).toBe(true);
    expect(canSendCaravan(poi(), team(3), 2)).toBe(false);
    expect(canSendCaravan(poi(), team(CARAVAN.escortMax), 99)).toBe(true);
    expect(canSendCaravan(poi(), team(CARAVAN.escortMax + 1), 99)).toBe(false);
  });
});

describe('les rôles hors combat servent à quelque chose', () => {
  it('un 🧭 raccourcit le trajet', () => {
    const p = poi();
    const sans = caravanLegMin(p, team(2, 20, 'haul'), 0);
    const avec = caravanLegMin(p, team(2, 20, 'speed'), 0);
    expect(avec).toBeLessThan(sans);
  });
  it('un 🐫 grossit la cargaison', () => {
    const p = poi();
    // Sur l'OR d'une épave (v0.998) : l'énergie est plafonnée à la part de base, donc un
    // 🐫 ne pourrait pas la faire grossir — l'or, si.
    const sans = avgOf(p, team(2, 20, 'speed'), 'gold');
    const avec = avgOf(p, team(2, 20, 'haul'), 'gold');
    expect(avec).toBeGreaterThan(sans);
  });
  it('un 🩺 raccourcit les convalescences, et l’Infirmerie aussi', () => {
    const soigneur = team(2, 20, 'heal');
    expect(caravanHurtMs(soigneur)).toBeLessThan(caravanHurtMs(team(2, 20, 'haul')));
    expect(caravanHurtMs(soigneur, 10)).toBeLessThan(caravanHurtMs(soigneur, 0));
  });
});

describe('salaires, XP et garde-fous', () => {
  it('les salaires croissent avec l’escorte et la profondeur — c’est un puits d’or', () => {
    expect(caravanWages(team(3), poi())).toBeGreaterThan(caravanWages(team(1), poi()));
    expect(caravanWages(team(3), poi({ level: 40 }))).toBeGreaterThan(
      caravanWages(team(3), poi({ level: 10 })),
    );
  });
  it('⚠️ l’XP a un RENDEMENT DÉCROISSANT sous le niveau de l’aventurier', () => {
    // Sinon on farme la route la plus courte à l'infini et le choix de destination meurt.
    // ⚠️ À MÊME POI : c’est l’écart de niveau qui doit faire chuter le gain. Comparer
    // deux POI de niveaux différents ne testait que le socle `base`, pas la décroissance —
    // la mutation qui retire le ratio passait donc au vert.
    const facile = poi({ level: 5 });
    expect(missionXp(refAdventurer(30), facile, true)).toBeLessThan(
      missionXp(refAdventurer(5), facile, true),
    );
    // …et une route à son niveau reste pleine.
    expect(missionXp(refAdventurer(5), facile, true)).toBe(
      missionXp(refAdventurer(3), facile, true),
    );
  });
  it('🪙 le SOCLE suit le niveau de RÉCOMPENSE, la réduction suit le RANG (v0.1033)', () => {
    // Un lieu tiré Bronze (niv 5) sur la carte d'un joueur 40 : sa récompense vaut niv 40.
    const bronze = { ...poi({ level: 5 }), rewardLevel: 40 };
    // Un champion Bronze y prend le socle PLEIN du niveau de récompense (il rattrape)…
    expect(missionXp(refAdventurer(5), bronze, true)).toBe(Math.round(trialXpBase(40)));
    // …un champion de niveau 40 y garde la réduction (5/40 → plancher 0,15).
    expect(missionXp(refAdventurer(40), bronze, true)).toBe(
      Math.round(trialXpBase(40) * 0.15 ** 1.5),
    );
    // Sans niveau de récompense (lieux d'avant, failles), rien ne change.
    expect(missionXp(refAdventurer(5), poi({ level: 5 }), true)).toBe(Math.round(trialXpBase(5)));
  });
  it('⚠️ le nombre de convois monte SANS FIN mais reste bridé par le vivier', () => {
    // Le plafond dur (4) a sauté avec la règle « aucun niveau mort » : un Comptoir de
    // niveau 100 doit apporter quelque chose. Ce qui empêche l'inflation n'est donc plus
    // un cap, mais deux freins qui, eux, ne cèdent jamais : le nombre d'aventuriers
    // recrutables (cf. `buildings.test`) et la LENTEUR du convoi, asymptotique.
    expect(caravanSlots(0)).toBe(1);
    expect(caravanSlots(1)).toBe(1);
    expect(caravanSlots(999)).toBeGreaterThan(caravanSlots(100));
    // Un cran de Comptoir coûte cher : il ne doit jamais offrir un convoi de plus.
    for (let l = 1; l <= 200; l++)
      expect(caravanSlots(l) - caravanSlots(l - 1)).toBeLessThanOrEqual(1);
  });
});

describe('le convoi lui-même', () => {
  it('est DÉTERMINISTE : même graine, même voyage', () => {
    const a = resolveCaravan(poi(), team(3), 1234, NUS, 100);
    const b = resolveCaravan(poi(), team(3), 1234, NUS, 100);
    expect(a).toEqual(b);
  });
  it('l’aller et le retour sont symétriques, le rapport lisible à mi-chemin', () => {
    const c = startCaravan('c1', poi(), team(3), 1000, 7, NUS);
    expect(c.midAt).toBeGreaterThan(c.sentAt);
    expect(c.returnAt - c.midAt).toBe(c.midAt - c.sentAt);
    expect(c.escort).toHaveLength(3);
  });
  it('⚠️ `claimed === undefined` = DÉJÀ crédité, jamais « à récupérer »', () => {
    // Même règle que les rapports d'expédition : traiter l'absence de champ comme
    // « non réclamé » offrirait une seconde fois le butin de chaque convoi passé.
    const base = startCaravan('c1', poi(), team(3), 0, 7, NUS);
    const later = base.returnAt + 1;
    expect(isCaravanClaimable(base, later)).toBe(true);
    expect(isCaravanClaimable({ ...base, claimed: true }, later)).toBe(false);
    const legacy = { ...base } as Caravan;
    delete legacy.claimed;
    expect(isCaravanClaimable(legacy, later)).toBe(false);
  });
  it('rien ne se récupère avant le RETOUR en ville', () => {
    const c = startCaravan('c1', poi(), team(3), 0, 7, NUS);
    expect(isCaravanClaimable(c, c.midAt)).toBe(false);
    expect(isCaravanClaimable(c, c.returnAt)).toBe(true);
  });
});

describe('🎁 caravanClaimRoster — ce que l’encaissement change au vivier', () => {
  const esc = team(3, 20);
  const bystander: Adventurer = { ...refAdventurer(20, 0), id: 'a_reste' };
  const roster = [...esc, bystander];
  /** Un convoi rentré, dont l’XP et les blessés sont FORCÉS pour que le test porte sur la
   *  règle d’encaissement et non sur un tirage d’embuscade. */
  const van = (over: Partial<Caravan['outcome']> = {}): Caravan => {
    const c = startCaravan('c1', poi(), esc, 0, 7, NUS);
    return {
      ...c,
      outcome: {
        ...c.outcome,
        xp: { a0: 50, a1: 70, a2: 90 },
        hurt: ['a1'],
        wages: 123.6,
        ...over,
      },
    };
  };
  const ctx = { pantheonLevel: 30, infirmaryLevel: 4, now: 1_000_000 };

  it('XP de chacun = grantAdvXp ; celui qui n’est pas parti est intact', () => {
    const r = caravanClaimRoster(van(), roster, ctx);
    esc.forEach((a, i) =>
      expect(r.adventurers[i]).toMatchObject(
        grantAdvXp(a, [50, 70, 90][i]!, ctx.pantheonLevel) as object,
      ),
    );
    expect(r.adventurers[3]).toBe(bystander);
  });

  it('🤕 les blessés partent à l’infirmerie (durée d’un convoi), les autres non', () => {
    const r = caravanClaimRoster(van(), roster, ctx);
    expect(r.adventurers[1]!.hurtUntil).toBe(ctx.now + caravanHurtMs(esc, ctx.infirmaryLevel));
    expect(r.adventurers[0]!.hurtUntil).toBeUndefined();
    expect(r.adventurers[2]!.hurtUntil).toBeUndefined();
  });

  it('⚠️ une convalescence plus longue (siège perdu) n’est JAMAIS raccourcie', () => {
    // C'est le défaut que cette fonction existe pour fermer : le store écrasait `hurtUntil`,
    // donc encaisser un convoi remettait debout trop tôt un aventurier déjà alité. La voie
    // des groupes (`partyClaimRoster`) respectait déjà la règle — deux voies, une règle.
    const long = ctx.now + 100 * 3600_000;
    const alite = roster.map((a) => (a.id === 'a1' ? { ...a, hurtUntil: long } : a));
    expect(caravanClaimRoster(van(), alite, ctx).adventurers[1]!.hurtUntil).toBe(long);
  });

  it('…mais une convalescence plus COURTE est bien prolongée', () => {
    // Le `max` ne doit pas non plus figer une échéance : un blessé qui sortait dans 10 min
    // repart pour la durée pleine d'un convoi.
    const court = ctx.now + 600_000;
    const presque = roster.map((a) => (a.id === 'a1' ? { ...a, hurtUntil: court } : a));
    expect(caravanClaimRoster(van(), presque, ctx).adventurers[1]!.hurtUntil).toBe(
      ctx.now + caravanHurtMs(esc, ctx.infirmaryLevel),
    );
  });

  it('un aventurier renvoyé depuis : rien à lui verser, l’escorte ne compte que les présents', () => {
    const r = caravanClaimRoster(van(), [esc[0]!, esc[2]!], ctx);
    expect(r.escort.map((a) => a.id)).toEqual(['a0', 'a2']);
    expect(r.adventurers).toHaveLength(2);
    expect(caravanClaimRoster(van(), roster, ctx).escort.map((a) => a.id)).toEqual([
      'a0',
      'a1',
      'a2',
    ]);
  });

  it('⚠️ salaires ENTIERS (colonne gold entière), jamais négatifs', () => {
    expect(caravanClaimRoster(van(), roster, ctx).wages).toBe(124);
    expect(caravanClaimRoster(van({ wages: -5 }), roster, ctx).wages).toBe(0);
  });
});

describe('⚠️ l’XP est versée PAR AVENTURIER, et toujours', () => {
  const vet = (id: string) => ({ ...refAdventurer(30), id });
  const bleu = (id: string) => ({ ...refAdventurer(5), id });

  it('chacun reçoit SON dû — un vétéran ne se paie pas en emmenant des recrues', () => {
    // C'était une MOYENNE : mesuré, le vétéran passait de 1 à 11 XP sur une route de
    // niveau 5 rien qu'en ajoutant trois recrues. Le rendement décroissant — le garde-fou
    // qui empêche de farmer le trajet le plus court — se contournait avec des passagers.
    // Les abattus sont PARTAGÉS : emmener des recrues ne peut que diluer la part du vétéran,
    // jamais l'augmenter ; et sur une route facile la recrue apprend bien plus que lui.
    const facile = poi({ level: 5 });
    for (let s = 1; s <= 40; s++) {
      const seul = resolveCaravan(facile, [vet('v')], s, NUS, 100);
      const accompagne = resolveCaravan(
        facile,
        [vet('v'), bleu('r1'), bleu('r2'), bleu('r3')],
        s,
        NUS,
        100,
      );
      expect(accompagne.xp['v']!, `graine ${s}`).toBeLessThanOrEqual(seul.xp['v']! + 1);
      expect(accompagne.xp['r1']!).toBeGreaterThan(accompagne.xp['v']!);
    }
  });
  it('tout le monde en reçoit, personne n’est oublié', () => {
    const o = resolveCaravan(poi(), [vet('v'), bleu('r')], 7, NUS, 100);
    expect(Object.keys(o.xp).sort()).toEqual(['r', 'v']);
    for (const v of Object.values(o.xp)) expect(v).toBeGreaterThan(0);
  });
  it('⚠️ l’XP tombe MÊME SANS COMBAT et QUEL QUE SOIT le résultat', () => {
    // Sans ça, un débutant à un seul aventurier — qui perd toutes ses embuscades — ne
    // progresserait jamais ; et perdre punirait deux fois (cargaison, blessé, rien appris).
    let sansCombat = 0;
    let perdu = 0;
    for (let s = 0; s < 200; s++) {
      const o = resolveCaravan(poi(), [bleu('r')], s * 977 + 1, NUS, 100);
      const fights = o.events.filter((e) => e.kind === 'bandits');
      expect(o.xp['r']!).toBeGreaterThan(0);
      if (!fights.length) sansCombat++;
      if (fights.some((f) => !f.won)) perdu++;
    }
    expect(sansCombat, 'aucun voyage sans combat : le test ne prouve rien').toBeGreaterThan(0);
    expect(perdu, 'aucune embuscade perdue : le test ne prouve rien').toBeGreaterThan(0);
  });
  it('⚠️ le socle de mission tombe TOUJOURS ; les abattus s’y AJOUTENT', () => {
    // ⚠️ Assertion DIRECTE : « XP > 0 » laissait passer une version qui ne comptait que
    // les combats GAGNÉS — un débutant qui perd tout aurait alors stagné pour toujours.
    const p = poi();
    const esc = team(3, 20);
    let sansCombat = 0;
    let avecAbattus = 0;
    let defaites = 0;
    for (let s = 0; s < 300; s++) {
      const o = resolveCaravan(p, esc, s * 977 + 1, NUS, 100);
      const f = o.events.filter((e) => e.kind === 'bandits');
      const abattus = f.reduce((n, e) => n + (e.slain ?? 0), 0);
      // 🎓 Victoire = aucune embuscade perdue (sans combat compris) : socle plein ; sinon
      // le socle de défaite (v0.1014).
      const won = !f.some((x) => x.won === false);
      for (const a of esc) {
        expect(o.xp[a.id]!).toBeGreaterThanOrEqual(missionXp(a, p, won));
        if (!f.length) expect(o.xp[a.id]).toBe(missionXp(a, p, true));
        if (abattus > 0) expect(o.xp[a.id]!).toBeGreaterThan(missionXp(a, p, won));
      }
      if (!f.length) sansCombat++;
      if (abattus > 0) avecAbattus++;
      if (f.some((x) => x.won === false)) defaites++;
      // Les abattus par tête somment ceux des embuscades.
      const parTete = Object.values(o.kills ?? {}).reduce((n, k) => n + k, 0);
      expect(parTete).toBe(abattus);
    }
    expect(sansCombat, 'aucun voyage sans combat : le test ne prouve rien').toBeGreaterThan(0);
    expect(avecAbattus, 'aucun abattu : le test ne prouve rien').toBeGreaterThan(0);
    expect(defaites, 'aucune défaite : le test ne prouve rien').toBeGreaterThan(0);
  });
});

describe('🤕 À TERRE N’EST PAS BLESSÉ — la politique d’infirmerie du convoi', () => {
  it('convoyHurt : gagnée → personne, même avec des membres à terre', () => {
    expect(convoyHurt({ win: true, down: ['b', 'a'] })).toEqual([]);
    expect(convoyHurt({ win: true, down: [] })).toEqual([]);
  });
  it('convoyHurt : perdue → UN SEUL blessé, le PREMIER tombé (jamais le dernier ni un tirage)', () => {
    expect(convoyHurt({ win: false, down: ['c', 'a', 'b'] })).toEqual(['c']);
    expect(convoyHurt({ win: false, down: ['b', 'c', 'a'] })).toEqual(['b']);
    expect(convoyHurt({ win: false, down: [] })).toEqual([]);
  });

  it('⚠️ sur la route : les blessés sont les PREMIERS tombés des seules embuscades PERDUES', () => {
    // L'ancien tirage d'UNE victime au hasard devient le premier tombé du journal.
    const esc = team(3, 26);
    let pertes = 0;
    let gagneesATerre = 0;
    for (let s = 1; s <= 400; s++) {
      const o = resolveCaravan(poi({ level: 26, perilous: true }), esc, s * 131 + 5, NUS, 100);
      const f = o.events.filter((e) => e.kind === 'bandits');
      const attendu: string[] = [];
      for (const e of f) {
        if (e.won) {
          if (e.down!.length) gagneesATerre++;
        } else {
          pertes++;
          // Une embuscade perdue met TOUTE l'escorte à terre…
          expect([...e.down!].sort()).toEqual(esc.map((a) => a.id).sort());
          // …mais n'en blesse qu'un : le premier tombé.
          if (!attendu.includes(e.down![0]!)) attendu.push(e.down![0]!);
        }
      }
      expect(o.hurt, `graine ${s}`).toEqual(attendu);
    }
    expect(pertes, 'aucune embuscade perdue : le test ne prouve rien').toBeGreaterThan(0);
    expect(
      gagneesATerre,
      'aucune victoire avec un membre à terre : le test ne prouve rien',
    ).toBeGreaterThan(0);
  });
});

describe('🔢 CE QU’UNE CARGAISON REND TIENT DANS UNE COLONNE ENTIÈRE', () => {
  it('⚠️ AUCUNE RESSOURCE N’EST FRACTIONNAIRE — sinon la cargaison est PERDUE', () => {
    // ⚠️ DÉFAUT RÉEL, trouvé sur le compte du joueur : « je ne peux pas récupérer la
    // cargaison, ça ne fait rien quand je clique ». `energy` valait **55,5** parce que
    // l'arrondi était DANS le `Math.min` — dès que les multiplicateurs valaient ≥ 1,
    // c'est la part brute × `yieldShare` (0,5), donc un demi, qui l'emportait.
    //
    // Or `gold`, `login_energy`, `summon_stones`, `scrap` et `keys` sont des colonnes
    // **ENTIÈRES** : Postgres refuse la valeur (`invalid input syntax for type integer:
    // "1234.5"`), la sauvegarde entière échoue, la promesse est rejetée sans que rien ne
    // l'attrape — et le convoi reste irrécupérable À VIE. Un test d'intégralité coûte
    // trois lignes ; son absence a coûté une cargaison bloquée.
    const esc = team(3, 26);
    // ⚠️ ON BALAIE LES DISTANCES ET DES NIVEAUX CONSÉCUTIFS, et ce n’est pas du zèle :
    // un premier jet figeait `distNorm` à 0,5 avec six niveaux ronds — or la part brute
    // n’y tombe JAMAIS sur un impair, donc le cas fautif n’était jamais atteint et la
    // mutation qui remet le bug passait au VERT. Mesuré : 68 combinaisons (niveau,
    // distance) donnent une énergie fractionnaire — il faut les traverser pour voir.
    for (const type of ['well', 'shrine', 'archive', 'mana_mine', 'mine'] as PoiType[])
      for (let level = 3; level <= 40; level++)
        for (const distNorm of [0, 0.25, 0.5, 0.75, 1])
          for (const per of [false, true]) {
            const o = resolveCaravan(
              poi({ type, level, distNorm, ...(per ? { perilous: true } : {}) }),
              esc,
              level * 31 + 7,
              NUS,
              100,
            );
            for (const [k, v] of [
              ['gold', o.gold],
              ['energy', o.energy],
              ['summonStones', o.summonStones],
              ['keys', o.keys],
              ['wages', o.wages],
            ] as [string, number][]) {
              expect(
                Number.isInteger(v),
                `${type} niv ${level}${per ? ' périlleux' : ''} d=${distNorm} — ${k} = ${v}`,
              ).toBe(true);
              expect(v, `${type} — ${k}`).toBeGreaterThanOrEqual(0);
            }
            // L'XP versée par tête tombe dans le JSONB, mais elle finit en niveau : entière aussi.
            for (const g of Object.values(o.xp)) expect(Number.isInteger(g)).toBe(true);
          }
  });

  it('le PLAFOND d’énergie tient toujours — l’arrondi ne l’a pas emporté', () => {
    // On corrige la fraction sans desserrer l'invariant « complément, jamais substitut au
    // sport » : les multiplicateurs ne peuvent que RÉDUIRE l'énergie, jamais l'augmenter.
    const p = poi({ type: 'well', level: 70 });
    const brut = harvestYield(p.type, p.level, heroEquivalentFactor(p)).energy * CARAVAN.yieldShare;
    for (let seed = 1; seed <= 30; seed++)
      expect(resolveCaravan(p, team(3, 70), seed, NUS, 100).energy).toBeLessThanOrEqual(
        Math.round(brut),
      );
  });
});

describe('💸 LES SALAIRES SONT UN PUITS, PAS UNE RANÇON', () => {
  // ⚠️ CE GARDE-FOU MANQUAIT, et la calibration a dérivé DEUX FOIS sans que rien ne le
  // dise — dans les deux sens. Les salaires valent `wageBase × strataFor(niveau) ×
  // poi.level^0,7`, or `strataFor` lit `PROMO_LEVELS`, dont la cadence a changé en v0.795
  // PUIS en v0.796. Un salaire indexé sur une table qu’on déplace pour une AUTRE raison
  // se met à dire autre chose, en silence.
  const HARVEST: PoiType[] = ['well', 'shrine', 'archive'];
  const part = (n: number, L: number, types: PoiType[] = HARVEST) => {
    const esc = team(n, L);
    let brut = 0;
    let sal = 0;
    for (const type of types)
      for (let seed = 1; seed <= 40; seed++) {
        const p = poi({ type, level: L });
        brut += resolveCaravan(p, esc, seed, NUS, 100).gold;
        sal += caravanWages(esc, p);
      }
    return sal / brut;
  };

  it('⚠️ un convoi n’est JAMAIS déficitaire en or, même pour un débutant', () => {
    // Le défaut relevé en v0.795 : les salaires atteignaient **173 % de l’or brut** sous
    // le niveau 20 — le convoi coûtait plus qu’il ne rapportait, et précisément pour le
    // joueur peu sportif que cette boucle vise. Il a disparu de lui-même quand la cadence
    // des promotions s’est étalée (v0.796) : `strataFor` vaut désormais 1 jusqu’au niveau 10
    // au lieu de 3. **Personne ne l’a corrigé, donc rien ne garantissait qu’il ne revienne.**
    // ⚠️ SEULEMENT LES ESCORTES ATTEIGNABLES : la Guilde plafonne le vivier au niveau du
    // joueur (`engageCap`). Un premier jet balayait « 2 aventuriers au niveau 1 » et
    // rougissait à 134 % — sur un état que personne ne peut avoir. Tester l’impossible
    // donne un rouge aussi creux qu’un vert : mesuré sur l’enveloppe réelle, le pire cas
    // vaut 73 % (niveau 2, deux aventuriers).
    for (let L = 1; L <= 100; L += L < 20 ? 1 : 10)
      for (let n = 1; n <= Math.min(engageCap(L), CARAVAN.escortMax); n++)
        expect(part(n, L), `niveau ${L}, ${n} aventurier(s)`).toBeLessThan(0.8);
    // ⚠️ ~2 s seul, mais il dépasse les 5 s par défaut sous la charge de la suite complète.
  }, 30_000);

  it('…mais ils restent un VRAI puits d’or à tout niveau', () => {
    // L’autre bord, et il a dérivé aussi : la doc annonce « calé à ~60 % de l’or
    // rapporté » (la valeur MESURÉE quand `wageBase` est passé de 26 à 6), on mesure
    // aujourd’hui **15 à 29 %** pour l’escorte de référence. Un puits d’or qui se vide de
    // 3× sans qu’aucune porte ne rougisse est exactement ce que ce test ferme.
    // La borne basse n’entérine PAS la dérive — elle interdit qu’elle continue.
    for (const L of [10, 20, 26, 40, 60, 100])
      expect(part(3, L), `niveau ${L}`).toBeGreaterThan(0.1);
  });
});

describe('🧹 LA LISTE DE CONVOIS NE GROSSIT PAS SANS FIN', () => {
  // ⚠️ Elle n’était JAMAIS purgée : mesuré sur le compte réel, **35 convois stockés dont
  // 30 déjà encaissés**. La ligne `characters` porte déjà le sac, les talents, les
  // aventuriers et la carte — un tableau qui ne fait que croître finit par peser.
  const base = startCaravan('c0', poi({ level: 10 }), team(2, 10), 0, 7, NUS);
  const lot = (n: number, claimed: boolean, from = 0) =>
    Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `${claimed ? 'done' : 'live'}${from + i}`,
      claimed,
      returnAt: from + i,
    }));

  it('⚠️ UN CONVOI NON ENCAISSÉ N’EST JAMAIS JETÉ — il porte une cargaison', () => {
    // C’est la garantie qui compte : la cargaison ne se périme pas (même règle que les
    // rapports d’expédition), donc une purge qui en perdrait un volerait le joueur.
    const live = lot(40, false);
    const gardes = pruneCaravans([...live, ...lot(40, true, 100)]);
    for (const v of live)
      expect(
        gardes.some((g) => g.id === v.id),
        v.id,
      ).toBe(true);
  });

  it('la queue des ENCAISSÉS est bornée, et ce sont les plus RÉCENTS qui restent', () => {
    const done = lot(30, true);
    const gardes = pruneCaravans(done);
    expect(gardes).toHaveLength(CARAVAN_KEEP_CLAIMED);
    // returnAt croît avec l’indice → les derniers de la liste sont les plus récents.
    expect(gardes.map((v) => v.id).sort()).toEqual(
      done
        .slice(-CARAVAN_KEEP_CLAIMED)
        .map((v) => v.id)
        .sort(),
    );
  });

  it('une liste déjà courte ressort INTACTE — on ne réordonne rien pour rien', () => {
    const l = [...lot(3, true), ...lot(2, false, 50)];
    expect(pruneCaravans(l)).toBe(l);
  });
});

describe('✨ COMPOSER UNE ESCORTE', () => {
  /** Un aventurier dont on choisit le CHEMIN, donc les rôles. */
  const who = (id: string, path: string[], level = 20): Adventurer => ({
    id,
    name: id,
    path,
    level,
    xp: 0,
  });
  /** Les rôles réellement portés — on les LIT, on ne les suppose pas. */
  const rolesDe = (t: Adventurer[]) => t.flatMap((a) => advRoles(a));

  it('⚠️ ELLE PARTAGE LE VIVIER ENTRE LES CONVOIS QUI RESTENT', () => {
    // Signalé : « si j'ai 2 convois et 4 aventuriers, que ça ne me propose pas 4 sur un
    // convoi et 0 sur le second ». Les créneaux se paient en niveaux de Comptoir : les
    // rendre inutilisables au premier envoi, c'est annuler ce qu'on vient d'acheter.
    expect(escortShare(4, 2)).toBe(2);
    expect(escortShare(6, 3)).toBe(2);
    expect(escortShare(7, 2)).toBe(4);
    // Un seul convoi à armer : rien à réserver, on va au plafond.
    expect(escortShare(9, 1)).toBe(CARAVAN.escortMax);
  });

  it('elle ne dépasse jamais le plafond d’escorte, ni le vivier', () => {
    // ⚠️ Le plafond n'est pas cosmétique : mesuré, 4 aventuriers tiennent déjà 93-100 %
    // des embuscades — un cinquième supprimerait la décision au lieu de l'enrichir.
    for (let n = 0; n <= 20; n++)
      for (let v = 1; v <= 6; v++) {
        const k = escortShare(n, v);
        expect(k, `${n} dispo, ${v} convois`).toBeLessThanOrEqual(CARAVAN.escortMax);
        expect(k).toBeLessThanOrEqual(n);
        expect(k).toBeGreaterThanOrEqual(n ? 1 : 0);
      }
  });

  it('⚠️ elle couvre des rôles DISTINCTS au lieu d’empiler le même', () => {
    // Un second 🐫 n'ajoute qu'un cran à une cargaison déjà plafonnée, là où un 🧭
    // raccourcit le trajet : ce sont des canaux séparés, et c'est ça, « équilibré ».
    const pool = [
      who('h1', ['caravanier', 'muletier']),
      who('h2', ['caravanier', 'muletier']),
      who('s1', ['eclaireur', 'coursier']),
    ];
    const t = suggestEscort(pool, poi(), 1);
    expect(t).toHaveLength(3);
    // …et sur deux places seulement, elle prend DEUX rôles, pas deux fois le même.
    const deux = suggestEscort(pool, poi(), 2);
    expect(deux).toHaveLength(2);
    expect(new Set(rolesDe(deux)).size).toBeGreaterThan(1);
  });

  it('⚠️ sur une route PÉRILLEUSE, l’éclaireur passe devant', () => {
    // Deux fois plus de rencontres, et c'est le seul rôle qui agit sur le RISQUE
    // lui-même (`ambushChance`) au lieu de le subir. L'ordre n'est donc pas figé.
    const pool = [who('h1', ['caravanier', 'muletier']), who('s1', ['archer', 'veneur'])];
    const calme = suggestEscort(pool, poi(), 2);
    const risque = suggestEscort(pool, poi({ perilous: true }), 2);
    expect(calme).toHaveLength(1);
    expect(rolesDe(calme)).toContain('haul');
    expect(rolesDe(risque)).toContain('scout');
  });

  it('à rôles égaux, elle prend le plus FORT', () => {
    // Départagé par `combatPower(escortCombatant(...))`, l'arbitre de tout le jeu —
    // jamais par une somme de stats recopiée qui finirait par diverger du combat.
    const pool = [
      who('faible', ['caravanier', 'muletier'], 3),
      who('fort', ['caravanier', 'muletier'], 40),
    ];
    expect(suggestEscort(pool, poi(), 2).map((a) => a.id)).toEqual(['fort']);
  });

  it('elle ne propose jamais deux fois la même personne', () => {
    const pool = [who('a', ['guerrier']), who('b', ['mage']), who('c', ['archer'])];
    const t = suggestEscort(pool, poi(), 1);
    expect(new Set(t.map((a) => a.id)).size).toBe(t.length);
  });

  it('vivier vide : aucune escorte, et rien ne casse', () => {
    expect(suggestEscort([], poi(), 2)).toEqual([]);
    expect(escortShare(0, 3)).toBe(0);
  });
});

describe('🎓 L’XP SUIT LE NIVEAU DE L’ÉVENT, PAS LA DISTANCE (v0.1014)', () => {
  it('⚠️ à niveau égal, la distance ne change RIEN à l’XP', () => {
    // Demandé par l'utilisateur : « on ne relie plus l'xp à la distance mais au niveau de
    // l'évent ». Mêmes graines, même escorte : les embuscades sont identiques (la distance
    // ne touche ni la rencontre ni le combat), donc l'XP aussi.
    const escort = team(3, 20);
    const road = { advGear: refAdvGear(20) };
    for (let s = 1; s <= 60; s++) {
      const near = resolveCaravan(poi({ distNorm: 0.05 }), escort, s * 131 + 5, road, 100);
      const far = resolveCaravan(poi({ distNorm: 0.95 }), escort, s * 131 + 5, road, 100);
      expect(far.xp, `graine ${s}`).toEqual(near.xp);
    }
  });

  it('un lieu plus FORT forme davantage', () => {
    const a = refAdventurer(40);
    let prev = 0;
    for (const level of [5, 15, 30, 45]) {
      const x = missionXp(a, poi({ level }), true);
      expect(x, `niveau ${level}`).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('⚠️ une DÉFAITE forme, mais moins qu’une victoire — au ratio annoncé', () => {
    for (const L of [5, 20, 60]) {
      const a = refAdventurer(L);
      const p = poi({ level: L });
      const gagne = missionXp(a, p, true);
      const perdu = missionXp(a, p, false);
      expect(perdu, `niveau ${L}`).toBeGreaterThan(0);
      expect(perdu / gagne).toBeCloseTo(CARAVAN.xpLossShare, 1);
    }
  });

  it('⚠️ le rendement décroissant tient toujours', () => {
    // Un vétéran sur un lieu faible reste bridé : sinon le farm de route facile revient.
    const faible = poi({ level: 5 });
    expect(missionXp(refAdventurer(40), faible, true)).toBeLessThan(
      missionXp(refAdventurer(5), faible, true),
    );
  });
});

describe('⚠️ l’XP de combat suit les ennemis ABATTUS, pas l’étiquette', () => {
  it('une route périlleuse SANS embuscade ne paie plus le simple risque', () => {
    // Mesuré avant : XP identique (49) qu'il y ait eu 1, 2 ou 3 embuscades — on payait
    // l'étiquette. Elle reste plus formatrice, mais parce qu'il s'y passe quelque chose :
    // les abattus s'ajoutent au socle (`skirmishXpShares`, dans `resolveCaravan`).
    const a = refAdventurer(20);
    expect(missionXp(a, poi({ perilous: true }), true)).toBe(missionXp(a, poi(), true));
  });
  it('missionXp lit la base d’épreuve partagée avec le combat de groupe', () => {
    const p = poi({ level: 33 });
    expect(missionXp(refAdventurer(33), p, true)).toBe(Math.round(trialXpBase(33)));
  });
});

describe('⚠️ un convoi VOYAGE comme le héros', () => {
  // Le convoi est situé sur la carte par la MÊME fonction que le héros
  // (`travelPosition`) : deux copies de cette interpolation divergeraient à la
  // première retouche — c'est le piège des libellés de POI, déjà rencontré deux fois.
  const van = startCaravan('v1', poi({ x: 60, y: 20 }), team(3), 0, 7, NUS);

  it('part de la ville, atteint son lieu, et en revient', () => {
    expect(travelPosition(van, van.sentAt)).toMatchObject({ ...EXPE.town, phase: 'outbound' });
    const arrive = travelPosition(van, van.midAt - 1);
    expect(arrive.phase).toBe('outbound');
    expect(arrive.x).toBeCloseTo(van.poi.x, 1);
    expect(arrive.y).toBeCloseTo(van.poi.y, 1);
    expect(travelPosition(van, van.midAt).phase).toBe('return');
    expect(travelPosition(van, van.returnAt)).toMatchObject({ ...EXPE.town, phase: 'done' });
  });

  it('⚠️ le RETOUR revient bien vers la ville, il ne repart pas', () => {
    // Sans ça, un signe inversé donnerait un convoi qui s'éloigne au retour.
    const tot = van.returnAt - van.midAt;
    const tiers = travelPosition(van, van.midAt + tot / 3);
    const deuxTiers = travelPosition(van, van.midAt + (2 * tot) / 3);
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
    expect(d(deuxTiers)).toBeLessThan(d(tiers));
  });

  it('avance de façon MONOTONE vers son lieu à l’aller', () => {
    const d = (t: number) => {
      const p = travelPosition(van, t);
      return Math.hypot(p.x - van.poi.x, p.y - van.poi.y);
    };
    for (let i = 1; i <= 10; i++) {
      expect(d((van.midAt * i) / 10)).toBeLessThan(d((van.midAt * (i - 1)) / 10));
    }
  });
});

describe('👥 une ÉQUIPE part SANS le héros — elle remplace le convoi (2026-09-21)', () => {
  // Le panneau d'envoi était entièrement gardé par « le héros est disponible » : dès qu'il
  // partait, plus rien ne pouvait partir. Une équipe de champions est la voie PARALLÈLE —
  // sa raison d'être est de jouer quand le héros ne peut pas.
  const recolte = poi({ type: 'well' });
  const offre = (p: Poi, heroAway: boolean, advsAvailable: number, slotsFree = 1) =>
    poiOffers(p, { heroAway, comptoirLevel: 3, advsAvailable, slotsFree });

  it('🚫 on ne lance plus de convoi, nulle part', () => {
    for (const t of ['well', 'mine', 'shrine', 'archive', 'mana_mine', 'camp', 'rift'] as const)
      for (const heroAway of [true, false])
        expect(offre(poi({ type: t }), heroAway, 5).caravan, t).toBe(false);
  });

  it('⚠️ un lieu de RÉCOLTE accepte une équipe, que le héros soit là ou non', () => {
    for (const t of ['well', 'mine', 'shrine', 'archive', 'mana_mine'] as const) {
      expect(offre(poi({ type: t }), true, 2).party, t).toBe(true);
      expect(offre(poi({ type: t }), false, 0).party, t).toBe(true);
    }
  });

  it('le HÉROS SEUL garde son expédition solo sur un lieu de récolte', () => {
    expect(offre(recolte, false, 0).hero).toBe(true);
    expect(offre(recolte, true, 0).hero).toBe(false); // il ne peut pas être à deux endroits
  });

  it('🕳️ une FAILLE s’attaque en équipe — jamais en expédition solo', () => {
    // ⚠️ `hero` (l'expédition SOLO) reste refusé : c'est le verrou qui empêche
    // `resolveOutcome` de traiter la faille comme une MINE D'OR (v0.926).
    const o = offre(poi({ type: 'rift' }), false, 4, 4);
    expect(o.hero).toBe(false);
    expect(o.party).toBe(true);
  });

  it('💠 une MINE DE MANA RÉSIDUEL se récolte en équipe, donc sans énergie', () => {
    // C'est ce qui ouvre le mana au joueur qui ne combat pas (v0.725).
    expect(offre(poi({ type: 'mana_mine' }), true, 1).party).toBe(true);
  });

  it('⚔️ un CAMP s’ouvre aux équipes : le héros, ou au moins un champion disponible', () => {
    const camp = poi({ type: 'camp' });
    expect(offre(camp, false, 0).party).toBe(true);
    expect(offre(camp, true, 2).party).toBe(true);
    expect(offre(camp, true, 0).party).toBe(false);
    expect(offre(poi({ type: 'lair' }), true, 1).party).toBe(true);
  });

  it('⚠️ UN SEUL POOL : sans le héros, une équipe exige un créneau libre de l’Avant-poste', () => {
    const camp = poi({ type: 'camp' });
    expect(offre(camp, true, 5, 0).party).toBe(false);
    expect(offre(recolte, true, 5, 0).party).toBe(false);
    // …mais le héros, lui, n'en prend pas : il est sa propre limite.
    expect(offre(camp, false, 5, 0).party).toBe(true);
  });

  it('⚠️ convoySlotsFree : convois d’avant ET équipes sans le héros se partagent les créneaux', () => {
    const now = 1000;
    const enRoute = { returnAt: now + 1 };
    const rentre = { returnAt: now };
    const slots = caravanSlots(18); // 3
    expect(convoySlotsFree(18, [], now)).toBe(slots);
    expect(convoySlotsFree(18, [enRoute, enRoute], now)).toBe(slots - 2);
    expect(convoySlotsFree(18, [enRoute, rentre], now)).toBe(slots - 1);
    expect(convoySlotsFree(0, [enRoute, enRoute, enRoute], now)).toBe(0);
  });
});

describe('⚠️ ce qui est GRISÉ sur la carte', () => {
  // Le gris doit dire « rien ne peut y aller », jamais « le héros est occupé ».
  const gris = (p: Poi, heroAway: boolean, advsAvailable: number) => {
    const o = poiOffers(p, { heroAway, comptoirLevel: 3, advsAvailable, slotsFree: 1 });
    return !o.hero && !o.party;
  };

  it('⚠️ un lieu de RÉCOLTE reste vif quand le héros est parti, s’il reste un champion', () => {
    expect(gris(poi({ type: 'well' }), true, 1)).toBe(false);
  });

  it('sans champion disponible, tout se grise pendant l’absence du héros', () => {
    for (const t of ['well', 'camp'] as const)
      expect(gris(poi({ type: t }), true, 0), t).toBe(true);
  });

  it('héros disponible : rien n’est grisé', () => {
    for (const t of ['well', 'camp', 'lair', 'mine'] as const) {
      expect(gris(poi({ type: t }), false, 0), t).toBe(false);
    }
  });
});

describe('👁️ L’ÉCLAIREUR ÉVITE LES EMBUSCADES (v0.759)', () => {
  // ⚠️ Ce rôle existait, était attribué à 5 classes, annonçait « Repère les embuscades »
  // — et n’était consommé NULLE PART. Mesuré sur le vivier réel : 3 aventuriers sur 10
  // n’avaient que lui comme compétence.
  const mk = (id: string, path: string[]): Adventurer => ({
    id,
    name: id,
    seed: 1,
    path,
    level: 14,
    xp: 0,
  });
  const poiOf = (perilous: boolean) =>
    ({
      id: 'p',
      type: 'well',
      level: 12,
      x: 40,
      y: 40,
      perilous,
      expiresAt: 9e15,
    }) as unknown as Poi;
  const sans = () => [mk('a', ['guerrier']), mk('b', ['guerrier'])];
  const un = () => [mk('a', ['eclaireur']), mk('b', ['guerrier'])];
  const beaucoup = () => [
    mk('a', ['eclaireur', 'coursier', 'rodeur']),
    mk('b', ['eclaireur']),
    mk('c', ['eclaireur']),
  ];

  it('⚠️ SANS éclaireur, la probabilité est EXACTEMENT celle d’avant', () => {
    // Non-régression : le calibrage des embuscades est mesuré et documenté.
    expect(ambushChance(poiOf(false), sans())).toBeCloseTo(0.24, 6);
    expect(ambushChance(poiOf(true), sans())).toBeCloseTo(0.42, 6);
  });

  it('chaque cran en évite davantage, et le plafond tient', () => {
    const a = ambushChance(poiOf(false), sans());
    const b = ambushChance(poiOf(false), un());
    const c = ambushChance(poiOf(false), beaucoup());
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
    // Jamais en dessous du plafond d’évitement : une route ne devient pas sûre.
    expect(c).toBeGreaterThanOrEqual(0.24 * (1 - CARAVAN.scoutMax) - 1e-9);
  });

  it('⚠️ il RÉDUIT LE RISQUE, il ne FABRIQUE PAS de butin', () => {
    // La bande libérée doit revenir à la route CALME, jamais à la cache — sinon
    // l’éclaireur serait une machine à loot et son libellé mentirait.
    const compte = (team: Adventurer[]) => {
      let cache = 0;
      let amb = 0;
      for (let i = 1; i <= 3000; i++) {
        const o = resolveCaravan(poiOf(false), team, i * 7919, NUS, 100);
        cache += o.events.filter((e) => e.kind === 'cache').length;
        amb += o.events.filter((e) => e.kind === 'bandits').length;
      }
      return { cache, amb };
    };
    const nu = compte(sans());
    const eclaire = compte(beaucoup());
    expect(eclaire.amb).toBeLessThan(nu.amb);
    // Les caches ne DOIVENT PAS augmenter (tolérance de bruit d’échantillonnage).
    expect(eclaire.cache).toBeLessThanOrEqual(Math.round(nu.cache * 1.05));
  });

  it('une route dangereuse reste plus risquée, éclaireurs ou pas', () => {
    expect(ambushChance(poiOf(true), beaucoup())).toBeGreaterThan(
      ambushChance(poiOf(false), sans()),
    );
  });
});

describe('📜 LE RAPPORT DE CONVOI DIT QUI A VOYAGÉ, CE QU’IL A APPRIS ET COMBIEN DE TEMPS', () => {
  const escort = team(3, 20);
  const van = (over: Partial<Caravan> = {}): Caravan => ({
    ...startCaravan('c1', poi({ level: 20 }), escort, 0, 11, NUS),
    ...over,
  });

  it('une ligne par aventurier de l’escorte, avec l’XP VERSÉE (celle du convoi stocké)', () => {
    const v = van();
    const r = caravanReport(v, escort);
    expect(r.members.map((m) => m.id)).toEqual(v.escort);
    for (const m of r.members) expect(m.xp).toBe(Math.round(v.outcome.xp[m.id] ?? 0));
    expect(r.totalXp).toBe(r.members.reduce((n, m) => n + m.xp, 0));
    expect(r.members[0]!.name).toBe(escort[0]!.name);
  });

  it('rappelle le temps de voyage ALLER ET RETOUR', () => {
    const v = van();
    expect(caravanReport(v, escort).travelMs).toBe(v.returnAt - v.sentAt);
    expect(v.returnAt - v.sentAt).toBeGreaterThan(v.midAt - v.sentAt);
  });

  it('XP par aventurier et par heure : c’est ce qui compare un long convoi à un court', () => {
    const v = van();
    const court = { ...v, returnAt: v.sentAt + 2 * 3_600_000 };
    const long = { ...v, returnAt: v.sentAt + 8 * 3_600_000 };
    const rc = caravanReport(court, escort);
    const rl = caravanReport(long, escort);
    expect(rc.totalXp).toBe(rl.totalXp); // même XP stockée…
    expect(rc.xpPerHour).toBeCloseTo(rc.totalXp / escort.length / 2, 6); // … par tête et par heure
    expect(rl.xpPerHour).toBeCloseTo(rc.xpPerHour / 4, 6);
  });

  it('les blessés sont signalés, et un aventurier renvoyé depuis garde sa ligne', () => {
    const v = van();
    const blesse = { ...v, outcome: { ...v.outcome, hurt: [escort[1]!.id] } };
    const r = caravanReport(blesse, [escort[0]!, escort[1]!]);
    expect(r.members.map((m) => m.hurt)).toEqual([false, true, false]);
    expect(r.members[2]!.gone).toBe(true);
    expect(r.members[2]!.xp).toBe(Math.round(v.outcome.xp[escort[2]!.id] ?? 0));
  });

  it('🗡️ chaque aventurier affiche SES abattus', () => {
    const v = van();
    const kills = { [escort[0]!.id]: 2, [escort[1]!.id]: 0, [escort[2]!.id]: 1 };
    const r = caravanReport({ ...v, outcome: { ...v.outcome, kills } }, escort);
    expect(r.members.map((m) => m.kills)).toEqual([2, 0, 1]);
    expect(r.totalKills).toBe(3);
  });

  it('⚠️ un convoi LANCÉ AVANT le combat de groupe se lit et s’encaisse toujours', () => {
    // Son `outcome` a été figé au départ par l'ancien moteur : ni `kills` (par tête), ni
    // `slain`/`down` (par embuscade). L'XP par tête (`xp`) et les blessés (`hurt`), que
    // `claimCaravan` crédite, y sont déjà.
    const v = van();
    const outcome = { ...v.outcome };
    delete (outcome as { kills?: unknown }).kills;
    const legacy = {
      ...v,
      outcome: {
        ...outcome,
        events: outcome.events.map(({ slain: _s, down: _d, ...e }) => e),
      },
    };
    const r = caravanReport(legacy, escort);
    // Sans `hasKills` : l'écran lit `totalKills > 0`, qui vaut 0 ici — aucun décompte affiché.
    expect(r.totalKills).toBe(0);
    for (const e of r.events) {
      expect(e.slain).toBeUndefined();
      expect(e.down).toBeUndefined();
    }
    for (const m of r.members) {
      expect(m.kills).toBe(0);
      expect(m.knockedDown).toBe(false);
      expect(m.xp).toBe(Math.round(v.outcome.xp[m.id] ?? 0));
    }
  });

  it('🩹 à terre dans une embuscade GAGNÉE (relevé) — jamais confondu avec 🤕 blessé', () => {
    const v = van();
    const evGagnee = {
      kind: 'bandits' as const,
      won: true,
      slain: 3,
      down: [escort[0]!.id, escort[1]!.id],
      text: 'Une embuscade repoussée.',
    };
    const r = caravanReport(
      { ...v, outcome: { ...v.outcome, events: [evGagnee], hurt: [escort[1]!.id] } },
      escort,
    );
    // escort[0] : à terre pendant la victoire, jamais blessé → la marque « à terre ».
    expect(r.members[0]!.knockedDown).toBe(true);
    expect(r.members[0]!.hurt).toBe(false);
    // escort[1] : aussi tombé pendant CETTE victoire, mais blessé PAR AILLEURS → 🤕 seul,
    // jamais les deux marques sur la même ligne.
    expect(r.members[1]!.hurt).toBe(true);
    expect(r.members[1]!.knockedDown).toBe(false);
    // escort[2] : ni l'un ni l'autre.
    expect(r.members[2]!.hurt).toBe(false);
    expect(r.members[2]!.knockedDown).toBe(false);
  });

  it('🩹 une embuscade PERDUE : TOUS les tombés sont « à terre », seul le premier est 🤕', () => {
    // Toute l'escorte tombe (clôture de la défaite) ; `convoyHurt` n'envoie que le premier à
    // l'infirmerie. Les deux autres étaient à terre aussi : sans marque, le rapport le taisait.
    const v = van();
    const evPerdue = {
      kind: 'bandits' as const,
      won: false,
      slain: 0,
      down: [escort[1]!.id, escort[0]!.id, escort[2]!.id],
      text: 'Des bandits emportent une part du convoi.',
    };
    const r = caravanReport(
      { ...v, outcome: { ...v.outcome, events: [evPerdue], hurt: [escort[1]!.id] } },
      escort,
    );
    expect(r.members.map((m) => m.hurt)).toEqual([false, true, false]);
    expect(r.members.map((m) => m.knockedDown)).toEqual([true, false, true]);
  });

  it('la cargaison est arrondie comme à l’encaissement, les salaires restent à part', () => {
    const v = van();
    const demi = { ...v, outcome: { ...v.outcome, energy: 55.5, gold: 100.4, wages: 30.6 } };
    const r = caravanReport(demi, escort);
    expect(r.pills.find((p) => p.emoji === '⚡')!.n).toBe(56);
    expect(r.pills.find((p) => p.emoji === '🪙')!.n).toBe(100);
    expect(r.wages).toBe(31);
  });

  it('l’historique ne montre que les convois encaissés, du plus récent au plus ancien', () => {
    const v = van();
    const list = [
      { ...v, id: 'ancien', claimed: true, returnAt: 10 },
      { ...v, id: 'enCours', claimed: false, returnAt: 99 },
      { ...v, id: 'recent', claimed: true, returnAt: 50 },
      { ...v, id: 'legacy', claimed: undefined, returnAt: 30 },
    ];
    expect(claimedCaravans(list).map((c) => c.id)).toEqual(['recent', 'legacy', 'ancien']);
  });
});

describe('🗡️ ÉQUIPEMENT DES AVENTURIERS SUR LA ROUTE', () => {
  const bat = (value: number, over: Partial<AdvGear> = {}): AdvGear => ({
    id: 'bat',
    lineage: 'caravanier',
    slot: 'accessory',
    name: 'Bât',
    emoji: '🎒',
    rarity: 'commun',
    roll: 0,
    level: 40,
    effect: { type: 'max_pv_pct', value: 5 },
    role: { kind: 'haul', value },
    ...over,
  });
  const caravanier = (gear = true): Adventurer => ({
    ...refAdventurer(40, 2),
    // Une seule classe : rôle 🐫 au cran 1 (0,12), la marge sous le plafond reste large.
    path: ['caravanier'],
    id: 'car',
    ...(gear ? { gear: { accessory: 'bat' } } : {}),
  });

  it('l’escorte de référence est équipée à son niveau, et chaque membre PORTE ses 4 pièces', () => {
    // ⚠️ « Porte », pas « possède » : une pièce de la mauvaise lignée ou trop rare pour la
    // classe serait ignorée par `wornGear` — la route se calibrerait alors sur une escorte
    // plus faible qu'annoncé, et un vivier réellement équipé y roulerait.
    for (const L of [12, 40, 85]) {
      const g = refAdvGear(L);
      expect(g).toHaveLength(4 * CARAVAN.refEscort);
      for (const p of g) expect(p.level).toBe(L);
      const esc = Array.from({ length: CARAVAN.refEscort }, (_, i) => ({
        ...refChampionAdv(L, i),
        gear: {
          weapon: `refGear${i}weapon`,
          armor: `refGear${i}armor`,
          accessory: `refGear${i}accessory`,
          relic: `refGear${i}relic`,
        },
      }));
      const worn = wornGear(esc, g);
      for (const a of esc) expect(worn.get(a.id), `niveau ${L}, ${a.id}`).toHaveLength(4);
    }
  });

  it('⚠️ la référence a la FORME d’une vraie pièce : rareté de la classe, SANS jet, même formule de valeur', () => {
    // Même formule que les vraies pièces (`makeAdvGear` → `advGearValue`) : sinon la référence
    // et les pièces tirées divergeraient au premier réglage de `ADV_GEAR.k`.
    for (const L of [12, 45, 85]) {
      const g = refAdvGear(L);
      for (let i = 0; i < CARAVAN.refEscort; i++) {
        const a = refChampionAdv(L, i);
        const lineage = lineageOf(a)!;
        for (const p of g.filter((x) => x.id.startsWith(`refGear${i}`))) {
          const pool = LINEAGE_GEAR[lineage].pieces[p.slot].pool;
          expect(p.rarity).toBe(advRarity(a));
          expect(p).not.toHaveProperty('roll');
          expect(p.effect.type).toBe(pool[0]);
          expect(p.effect.value).toBe(advGearValue(pool[0]!, p.rarity));
          // ⚠️ La règle du 2ᵉ affixe est LUE (`advGearHasSecondAffix`), jamais recopiée :
          // ce test épinglait `>= magique` en dur, donc il verrouillait l'ANCIEN SEUIL au
          // lieu de garantir que l'étalon et le tirage disent la même chose — ce qui était
          // exactement le défaut (une copie de la règle vivait dans `refAdvGear`).
          if (advGearHasSecondAffix(p.rarity)) {
            expect(p.effect2?.type).toBe(pool[1]);
            expect(p.effect2?.value).toBe(advGearValue(pool[1]!, p.rarity));
          } else expect(p.effect2).toBeUndefined();
        }
      }
    }
  });

  it('⚠️ L’ÉTALON ET LE TIRAGE S’ACCORDENT sur le 2ᵉ affixe — à TOUS les rangs', () => {
    // C'est l'invariant qui MANQUAIT, et son absence a coûté cher : `refAdvGear` portait sa
    // propre copie de « 2 affixes à partir du rang Or », si bien que régler le seuil dans
    // `rollAdvGear` n'avait AUCUN effet sur la route — mesuré, les bandes d'embuscade ne
    // bougeaient pas d'un seul point. La route se serait calibrée sur un équipement que le
    // jeu ne produit plus. On compare donc les DEUX chemins, jamais une valeur écrite.
    for (const L of [1, 8, 12, 26, 45, 70, 100]) {
      for (const p of refAdvGear(L)) {
        expect(!!p.effect2, `étalon niveau ${L}, ${p.rarity} ${p.slot}`).toBe(
          advGearHasSecondAffix(p.rarity) && LINEAGE_GEAR[p.lineage].pieces[p.slot].pool.length > 1,
        );
      }
      // …et une VRAIE pièce au même rang dit la même chose.
      for (const slot of ADV_GEAR_SLOTS) {
        const g = makeAdvGear({ lineage: 'guerrier', slot, rank: 'commun', grade: 'B' });
        expect(!!g.effect2, `tirage ${slot}`).toBe(advGearHasSecondAffix('commun'));
      }
    }
  });

  it('⚠️ l’équipement compte sur la route, DIVISÉ PAR L’EFFECTIF comme les compagnons', () => {
    const esc = [caravanier()];
    const stock = [bat(0)];
    const nu = roadGearEffects(esc, { advGear: [] });
    const seul = roadGearEffects(esc, { advGear: stock });
    expect(nu.maxPvPct).toBe(0);
    expect(seul.maxPvPct).toBeCloseTo(advGearEffects(stock).maxPvPct, 9);
    const dilue = roadGearEffects(
      [caravanier(), { ...refAdventurer(40, 0), id: 'b' }, { ...refAdventurer(40, 1), id: 'c' }],
      { advGear: stock },
    );
    expect(dilue.maxPvPct).toBeCloseTo(seul.maxPvPct / 3, 9);
  });

  it('⚠️ un Bât porté grossit la cargaison DE SA VALEUR, sous le plafond', () => {
    const sans = caravanHaulMult([caravanier(false)], []);
    const avec = caravanHaulMult([caravanier()], [bat(0.05)]);
    expect(advGearRoles([caravanier()], [bat(0.05)]).haul).toBe(0.05);
    expect(sans).toBeLessThan(1 + CARAVAN.haulMax - 0.05); // la marge existe
    expect(avec).toBeCloseTo(sans + 0.05, 9);
  });

  it('⚠️ …et un bonus ÉNORME s’arrête EXACTEMENT à 1 + haulMax', () => {
    expect(caravanHaulMult([caravanier()], [bat(5)])).toBe(1 + CARAVAN.haulMax);
  });

  it('⚠️ c’est bien CE calcul que le convoi lit : la cargaison grossit', () => {
    // Sur les graines SANS embuscade, rien d'autre ne bouge entre les deux voyages (les
    // tirages de route ne dépendent pas de l'équipement) : seule la cargaison diffère.
    const p = poi({ type: 'shrine', level: 40 });
    let vus = 0;
    for (let s = 1; s <= 60; s++) {
      const avec = resolveCaravan(
        p,
        [caravanier()],
        s,
        {
          familiars: [],
          talents: [],
          advGear: [bat(0.3)],
        },
        100,
      );
      const sans = resolveCaravan(
        p,
        [caravanier(false)],
        s,
        {
          familiars: [],
          talents: [],
          advGear: [],
        },
        100,
      );
      if (avec.events.some((e) => e.kind === 'bandits')) continue;
      vus++;
      expect(avec.gold, `graine ${s}`).toBeGreaterThan(sans.gold);
    }
    expect(vus, 'aucun voyage sans embuscade : le test ne prouve rien').toBeGreaterThan(5);
  });

  it('⚠️ une Longue-vue portée raccourcit le trajet, sous le plafond de vitesse', () => {
    const p = poi();
    const esc = [{ ...refAdventurer(20, 1), id: 'e' }];
    const base = caravanLegMin(p, esc, 0);
    expect(caravanLegMin(p, esc, 0.1)).toBeLessThan(base);
    expect(caravanLegMin(p, esc, 99)).toBe(caravanLegMin(p, esc, CARAVAN.speedMax));
  });

  it('⚠️ …et c’est bien ce trajet que le convoi réel fait', () => {
    const p = poi();
    const lv = bat(0, {
      id: 'lv',
      lineage: 'eclaireur',
      name: 'Longue-vue',
      effect: { type: 'crit_pct', value: 5 },
      role: { kind: 'speed', value: 0.2 },
    });
    const e = { ...refAdventurer(20, 1), path: ['eclaireur'], id: 'e' };
    const road = (advGear: AdvGear[]) => ({ advGear });
    const avec = startCaravan('c', p, [{ ...e, gear: { accessory: 'lv' } }], 0, 7, road([lv]));
    const sans = startCaravan('c', p, [e], 0, 7, road([]));
    expect(avec.midAt).toBeLessThan(sans.midAt);
  });
});

describe('🚫 plus aucun équipement de champion sur la route (v0.1012)', () => {
  it('une embuscade repoussée ne laisse plus de pièce : elles ne viennent que du tirage', () => {
    const escort = [0, 1, 2].map((i) => refChampionAdv(40, i));
    let gagnees = 0;
    for (let s = 1; s <= 300; s++) {
      const o = resolveCaravan(poi({ level: 40, perilous: true }), escort, s, { advGear: [] });
      expect(o).not.toHaveProperty('advGear');
      gagnees += o.events.filter((e) => e.kind === 'bandits' && e.won).length;
    }
    expect(gagnees, 'aucune embuscade gagnée : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('⚠️ la graine 8 pin le butin : retirer le tirage d’équipement ne décale rien', () => {
    // Le tirage d'équipement vivait sur son PROPRE générateur (`gearRng`) : le retirer ne
    // doit rien changer au flux principal. Ces valeurs sont celles d'AVANT le retrait, au
    // chiffre près — une seule qui bouge dirait que le flux aléatoire a fui.
    const escort = [0, 1, 2].map((i) => refChampionAdv(40, i));
    const o = resolveCaravan(poi({ level: 40, perilous: true }), escort, 8, { advGear: [] });
    expect(o.gold).toBe(2028); // une SOURCE depuis que l’épave est retirée (v0.999) : 1758 × 30/26, le coût d’un puits
    expect(o.energy).toBe(62);
    expect(o.summonStones).toBe(0);
    // ⚠️ Le lieu est une SOURCE depuis le retrait de l'épave (v0.999) : l'or suit son coût et
    // l'énergie apparaît. Tout le reste (clés, salaires, XP, blessé, journal) est inchangé au
    // chiffre près — c'est ce qui prouve que le flux aléatoire n'a pas fuité. Une seule valeur qui bouge dit « un réglage » ; toutes qui bougent disent
    // « le flux a fuité » — c'est cette distinction que le test existe pour rendre lisible.
    expect('scrap' in o).toBe(false);
    expect(o.keys).toBe(0);
    expect(o.wages).toBe(951);
    // ⚠️ Les valeurs de CARGAISON ci-dessus sont celles d'avant le combat de groupe, au
    // chiffre près : le groupe n'est qu'une lecture du combat fondu, et `deriveSkirmish` ne
    // lit pas `rng`. Seules l'XP (socle + part des abattus) et le blessé (le PREMIER tombé
    // de l'embuscade perdue, plus une victime tirée) ont changé.
    // ⚠️ v0.996 : les champions n'ont plus de compagnon, compensé en stats (`CHAMPION_SOLO`).
    // Seule la RÉPARTITION des abattus bouge (3/1/1 → 2/2/1, un tombé de moins en 2ᵉ jambe) :
    // la cargaison, l'XP et le blessé sont identiques — le flux aléatoire n'a pas fui.
    // v0.1014 : une embuscade perdue → socle de DÉFAITE (70 → 35) + la même part des abattus (23).
    expect(o.xp).toEqual({ ref0: 58, ref1: 58, ref2: 58 });
    expect(o.kills).toEqual({ ref0: 2, ref1: 2, ref2: 1 });
    expect(o.hurt).toEqual(['ref1']);
    expect(o.events[0]!.down).toEqual(['ref1', 'ref2', 'ref0']);
    expect(o.events[1]!.down).toHaveLength(1); // à terre, mais la victoire ne blesse personne
    expect(o.events.map((e) => [e.slain, e.down?.length])).toEqual([
      [2, 3],
      [3, 1],
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect(o.events.map((e) => e.kind)).toEqual(['bandits', 'bandits', 'calme', 'calme']);
    expect(o.events.map((e) => e.won)).toEqual([false, true, undefined, undefined]);
  });
});

describe('⚔️ UNE UNITÉ PAR AVENTURIER — ce qu’il emmène au combat', () => {
  // ⚠️ Plus de compagnon ni de talent (v0.996) : un champion n'emmène que SES pièces.
  it('unitEffects = ses pièces, UNE seule définition', () => {
    const g = refAdvGear(20, 1);
    expect(unitEffects(g)).toEqual(advGearEffects(g));
    expect(unitEffects(undefined)).toEqual(advGearEffects([]));
  });

  it('⚠️ chaque pièce n’épaule QUE son homme : quatre équipés ne se diluent ni ne s’empilent', () => {
    const seul = roadUnits(
      team(1, 20),
      escortGear(team(1, 20), { advGear: refAdvGear(20, 1) }),
    )[0]!;
    const quatre = roadUnits(team(4, 20), escortGear(team(4, 20), { advGear: refAdvGear(20, 4) }));
    expect(quatre[0]!.combatant).toEqual(seul.combatant);
    const nu = roadUnits(team(1, 20), escortGear(team(1, 20), NUS))[0]!;
    expect(offenseOf(seul.combatant) * survivalOf(seul.combatant)).toBeGreaterThan(
      offenseOf(nu.combatant) * survivalOf(nu.combatant),
    );
  });

  it('l’unité EST le combattant d’un aventurier seul avec SES pièces', () => {
    const esc = team(2, 20);
    const gear = escortGear(esc, { advGear: refAdvGear(20, 2) });
    const units = roadUnits(esc, gear);
    esc.forEach((a, i) => {
      expect(units[i]!.id).toBe(a.id);
      expect(units[i]!.level).toBe(a.level);
      expect(units[i]!.combatant).toEqual(
        escortCombatant([a], a.name, unitEffects(gear.get(a.id))),
      );
    });
  });

  it('⚠️ escortGear EST la règle de port (`wornGear`) — pas une seconde copie', () => {
    const esc = team(3, 20);
    const stock = refAdvGear(20, 3);
    expect(escortGear(esc, { advGear: stock })).toEqual(wornGear(esc, stock));
  });

  it('⚠️ roadTroop : UNE SEULE FORCE — les corps somment EXACTEMENT au combattant qu’on lui passe', () => {
    // Mesuré avant : Σ PV des corps = ×2,23 les PV réels au niveau 12, ×0,53 au niveau 70
    // (une seconde calibration). Désormais une barre de PV par corps dit ce que le combat applique.
    const somme = (t: { combatant: { pv: number; damage: number } }[]) => ({
      pv: t.reduce((s, x) => s + x.combatant.pv, 0),
      damage: t.reduce((s, x) => s + x.combatant.damage, 0),
    });
    for (const level of [5, 12, 26, 45, 70, 95])
      for (const perilous of [false, true]) {
        const p = poi({ level, perilous });
        const f = roadFoe(p);
        const t = roadTroop(f, p);
        expect(somme(t), `niveau ${level} ${perilous ? 'périlleux' : 'calme'}`).toEqual({
          pv: f.pv,
          damage: f.damage,
        });
        for (const x of t) expect(x.level).toBe(level);
      }
    const p = poi({ level: 30 });
    expect(roadTroop(roadFoe(p), p)).toEqual(roadTroop(roadFoe(p), p));
    expect(roadTroop(roadFoe(p), p)).toHaveLength(CARAVAN.troopCalm);
  });

  it('⚠️ roadTroop : calme et périlleux diffèrent là où ils diffèrent VRAIMENT — force et nom', () => {
    // Même nombre de corps (3/3) : comparer les longueurs ne prouvait rien. Ce qui change est
    // la FORCE (`perilousMult`, portée par `roadFoe`) et l'IDENTITÉ des bandits.
    const troupe = (p: Poi) => roadTroop(roadFoe(p), p);
    const calme = troupe(poi({ level: 30 }));
    const peril = troupe(poi({ level: 30, perilous: true }));
    const pv = (t: typeof calme) => t.reduce((s, x) => s + x.combatant.pv, 0);
    const dmg = (t: typeof calme) => t.reduce((s, x) => s + x.combatant.damage, 0);
    // ⚠️ STRICT, et sur les DEUX canaux : une égalité voudrait dire que le drapeau est neutralisé.
    expect(pv(peril)).toBeGreaterThan(pv(calme));
    expect(dmg(peril)).toBeGreaterThan(dmg(calme));
    expect(pv(peril) / pv(calme)).toBeCloseTo(CARAVAN.perilousMult, 2);
    expect(dmg(peril) / dmg(calme)).toBeCloseTo(CARAVAN.perilousMult, 2);
    expect(calme.every((x) => x.name === 'Bandit de grand chemin')).toBe(true);
    expect(peril.every((x) => x.name === 'Pillard de la passe')).toBe(true);
    expect(pv(troupe(poi({ level: 60 })))).toBeGreaterThan(pv(troupe(poi({ level: 20 }))));
  });
});

describe('🧭 refEscortUnits — la référence partagée par la route et les camps', () => {
  it('est l’escorte de référence équipée, unité par unité', () => {
    const L = 30;
    const ref = Array.from({ length: CARAVAN.refEscort }, (_, i) => ({
      ...refChampionAdv(L, i),
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
        relic: `refGear${i}relic`,
      },
    }));
    // ⚠️ Écart au brief : `roadUnits` prend les PAIRES déjà construites
    // (`Map<string, AdvGear[]>`), pas un `EscortKit` brut — on passe donc par
    // `escortGear`, comme tout appelant réel de `roadUnits`.
    const road = { advGear: refAdvGear(L) };
    const attendu = roadUnits(ref, escortGear(ref, road));
    expect(refEscortUnits(L)).toEqual(attendu);
  });
});
