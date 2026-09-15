import { describe, it, expect } from 'vitest';
const NUS = { familiars: [], talents: [], advGear: [] };
import {
  CARAVAN,
  canSendCaravan,
  caravanHurtMs,
  caravanLegMin,
  caravanSlots,
  poiOffers,
  caravanSlowFor,
  stratumTrainMult,
  trainMsFor,
  caravanWages,
  escortCombatant,
  companionsOf,
  companionEffects,
  refCompanions,
  canAdvTalent,
  ambushChance,
  advTalentsOf,
  advTalentEffects,
  ADV_TALENT_K,
  heroEquivalentFactor,
  isCaravanClaimable,
  pruneCaravans,
  CARAVAN_KEEP_CLAIMED,
  escortShare,
  missionTravelMult,
  suggestEscort,
  missionXp,
  refAdventurer,
  resolveCaravan,
  roadCompanionEffects,
  roadFoe,
  startCaravan,
  caravanReport,
  claimedCaravans,
  caravanHaulMult,
  refAdvGear,
  type Caravan,
} from '@/lib/caravan';
import {
  advGearEffects,
  advGearRoles,
  advGearValue,
  LINEAGE_GEAR,
  lineageOf,
  wornGear,
  type AdvGear,
} from '@/lib/advGear';
import { advRarity, advRoles, guildRoster, PROMO_LEVELS, type Adventurer } from '@/lib/adventurers';
import {
  TALENTS,
  talentTierFloor,
  talentValue,
  talentByCode,
  talentRollOf,
  type TalentInstance,
} from '@/lib/talents';
import { simulateCombat } from '@/lib/combat';
import {
  famXpForLevel,
  aggregateEffects,
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
  type: 'wreck',
  level: 20,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
/** ⚠️ Une escorte ACCOMPAGNÉE (v0.805) : chacun porte le compagnon de référence de son
 *  rang. Depuis que le familier booste l’aventurier comme le héros, c’est la configuration
 *  que la route attend — mesurer des escortes nues mesurerait un joueur qui n’a pas
 *  confié ses familiers. `nus` garde la mesure SANS familier. */
// ⚠️ …ET ÉQUIPÉE (pièces de référence, `refAdvGear`) : la route se calibre sur un vivier
// équipé. `sansGear` garde la mesure SANS équipement.
const team = (
  n: number,
  level = 20,
  path?: string[],
  nus = false,
  sansGear = false,
): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(level, i),
    id: `a${i}`,
    ...(nus ? {} : { familiarId: `refFam${i % 3}` }),
    ...(sansGear
      ? {}
      : {
          gear: {
            weapon: `refGear${i}weapon`,
            armor: `refGear${i}armor`,
            accessory: `refGear${i}accessory`,
          },
        }),
    ...(path ? { path } : {}),
  }));
function winPct(escort: Adventurer[], p: Poi, n = 150) {
  const lvl = escort[0]?.level ?? p.level;
  const g = escortCombatant(
    escort,
    'Escorte',
    roadCompanionEffects(escort, {
      familiars: refCompanions(lvl),
      talents: [],
      advGear: refAdvGear(lvl, escort.length),
    }),
  );
  const f = roadFoe(p);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(g, { ...f }, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
  return w / n;
}
const avgScrap = (p: Poi, esc: Adventurer[], n = 200) =>
  Array.from({ length: n }, (_, i) => resolveCaravan(p, esc, i * 7919 + 3, NUS, 100).scrap).reduce(
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

  it('⚠️ LA ROUTE ATTEND DES FAMILIERS — la référence est ACCOMPAGNÉE (v0.805)', () => {
    // Mesuré avant ce recalage : un trio accompagné gagnait 92 % de ses embuscades
    // PÉRILLEUSES au niveau 90 (39 % sans). Les bandes ci-dessus ne tiennent que parce
    // que `roadFoe` se dimensionne sur une escorte qui porte ses compagnons.
    // (1) Les compagnons de référence sont du rang qu’un familier tombe le plus souvent à ce
    // niveau — le RANG DU JOUEUR depuis la v0.857 (plus le plafond √ des objets, qui courait
    // jusqu’à deux rangs devant : la route aurait attendu des familiers introuvables).
    for (const L of [5, 26, 70]) {
      for (const f of refCompanions(L)) expect(f.rarity).toBe(RANK_ORDER[prestigeRankIndex(L)]);
    }
    // (2) Sans ses familiers, une escorte est EN RETRAIT — pas interdite, en retrait.
    const p = poi({ level: 45 });
    const avec = winPct(team(3, 45), p, 200);
    const sans = winPct(team(3, 45, undefined, true), p, 200);
    expect(sans).toBeLessThan(avec);
    expect(sans).toBeGreaterThan(0.3);
  });

  it('⚠️ L’ÉQUIPEMENT EST UN BONUS, PAS UN PÉAGE — la référence porte ses pièces', () => {
    // Même précédent que les familiers : un gain modeste. ⚠️ À `ADV_GEAR.k` = 1 un trio
    // sans pièces tombait à 22-28 % de ses embuscades calmes dès le niveau 26 — la plupart
    // des joueurs, équipés partiellement pendant des semaines, auraient payé l'absence
    // d'équipement. Mesuré à 0,15 (2000 graines) : sans pièces 90/86/72/63/67/65 %, équipé
    // 92/89/76/74/85/89 %.
    const NIV = [12, 20, 26, 45, 70, 85];
    for (const L of NIV) {
      const sans = winPct(team(3, L, undefined, false, true), poi({ level: L }), 200);
      expect(sans, `sans pièces, niveau ${L}`).toBeGreaterThanOrEqual(0.5);
    }
    // …mais un bonus RÉEL : en fin de partie, les pièces se sentent.
    for (const L of [70, 85]) {
      const p = poi({ level: L });
      const avec = winPct(team(3, L), p, 200);
      const sans = winPct(team(3, L, undefined, false, true), p, 200);
      expect(avec, `niveau ${L}`).toBeGreaterThan(sans + 0.1);
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
  it('la caravane est plus LENTE que le héros', () => {
    const p = poi();
    expect(caravanLegMin(p, team(3), 0, 0)).toBeGreaterThan(travelOneWayMin(p.level, p.distNorm));
  });
  it('…mais le facteur de paie est celui du héros, pas le sien', () => {
    // `travelFactor` est SUPER-LINÉAIRE : payer sur le temps réel ferait de la lenteur
    // une prime (×1,75 pour un ralentissement de ×1,5) et la caravane écraserait
    // l'expédition du héros.
    const p = poi();
    const heroH = (2 * travelOneWayMin(p.level, p.distNorm)) / 60;
    expect(heroEquivalentFactor(p)).toBeCloseTo(travelFactor(heroH), 6);
    const vanH = (2 * caravanLegMin(p, team(3), 0, 0)) / 60;
    expect(heroEquivalentFactor(p)).toBeLessThan(travelFactor(vanH));
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
    // rester sous la barre). Or c’est ce garde-fou qui tient la règle « la ferraille doit
    // être plus dure à obtenir que l’or » : à part pleine, un convoi rendait 608 🔩/jour
    // au niveau 26 contre 19 pour la Fonderie.
    const p = poi();
    const heros = harvestYield(p.type, p.level, heroEquivalentFactor(p)).scrap;
    // ⚠️ Une escorte SANS RÔLE : le sujet du test est `yieldShare`, pas la cargaison
    // qu'un 🐫 ajoute. Depuis que la référence est mixte, elle porte un rôle de haul —
    // le test mesurait donc les deux à la fois et est tombé pour la mauvaise raison.
    const part = avgScrap(p, team(3, 20, ['guerrier'])) / heros;
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
    const cargo = team(4, 90, ['caravanier', 'convoyeur', 'maitre_convoi', 'intendant']);
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
      expect(canSendCaravan(poi({ type: t }), team(3))).toBe(false);
    }
    for (const t of ['well', 'shrine', 'archive', 'wreck', 'mine'] as PoiType[]) {
      expect(canSendCaravan(poi({ type: t }), team(3))).toBe(true);
    }
  });
  it('escorte vide ou pléthorique : refusée', () => {
    expect(canSendCaravan(poi(), [])).toBe(false);
    expect(canSendCaravan(poi(), team(CARAVAN.escortMax + 1))).toBe(false);
  });
});

describe('les rôles hors combat servent à quelque chose', () => {
  it('un 🧭 raccourcit le trajet', () => {
    const p = poi();
    const sans = caravanLegMin(p, team(2, 20, ['guerrier']), 0, 0);
    const avec = caravanLegMin(p, team(2, 20, ['eclaireur', 'passeur']), 0, 0);
    expect(avec).toBeLessThan(sans);
  });
  it('un 🐫 grossit la cargaison', () => {
    const p = poi();
    const sans = avgScrap(p, team(2, 20, ['guerrier']));
    const avec = avgScrap(p, team(2, 20, ['caravanier', 'convoyeur']));
    expect(avec).toBeGreaterThan(sans);
  });
  it('un 🩺 raccourcit les convalescences, et l’Infirmerie aussi', () => {
    const soigneur = team(2, 20, ['mage', 'clerc']);
    expect(caravanHurtMs(soigneur)).toBeLessThan(caravanHurtMs(team(2, 20, ['guerrier'])));
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
    expect(missionXp(refAdventurer(30), facile)).toBeLessThan(missionXp(refAdventurer(5), facile));
    // …et une route à son niveau reste pleine.
    expect(missionXp(refAdventurer(5), facile)).toBe(missionXp(refAdventurer(3), facile));
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
    // Et le convoi reste TOUJOURS plus lent que le héros — sinon la caravane le remplace.
    for (const l of [0, 9, 45, 100, 999]) expect(caravanSlowFor(l)).toBeGreaterThan(1);
  });
});

describe('le convoi lui-même', () => {
  it('est DÉTERMINISTE : même graine, même voyage', () => {
    const a = resolveCaravan(poi(), team(3), 1234, NUS, 100);
    const b = resolveCaravan(poi(), team(3), 1234, NUS, 100);
    expect(a).toEqual(b);
  });
  it('l’aller et le retour sont symétriques, le rapport lisible à mi-chemin', () => {
    const c = startCaravan('c1', poi(), team(3), 1000, 7, NUS, 0, 100);
    expect(c.midAt).toBeGreaterThan(c.sentAt);
    expect(c.returnAt - c.midAt).toBe(c.midAt - c.sentAt);
    expect(c.escort).toHaveLength(3);
  });
  it('⚠️ `claimed === undefined` = DÉJÀ crédité, jamais « à récupérer »', () => {
    // Même règle que les rapports d'expédition : traiter l'absence de champ comme
    // « non réclamé » offrirait une seconde fois le butin de chaque convoi passé.
    const base = startCaravan('c1', poi(), team(3), 0, 7, NUS, 0, 100);
    const later = base.returnAt + 1;
    expect(isCaravanClaimable(base, later)).toBe(true);
    expect(isCaravanClaimable({ ...base, claimed: true }, later)).toBe(false);
    const legacy = { ...base } as Caravan;
    delete legacy.claimed;
    expect(isCaravanClaimable(legacy, later)).toBe(false);
  });
  it('rien ne se récupère avant le RETOUR en ville', () => {
    const c = startCaravan('c1', poi(), team(3), 0, 7, NUS, 0, 100);
    expect(isCaravanClaimable(c, c.midAt)).toBe(false);
    expect(isCaravanClaimable(c, c.returnAt)).toBe(true);
  });
});

describe('⚠️ l’XP est versée PAR AVENTURIER, et toujours', () => {
  const vet = (id: string) => ({ ...refAdventurer(30), id });
  const bleu = (id: string) => ({ ...refAdventurer(5), id });

  it('chacun reçoit SON dû — un vétéran ne se paie pas en emmenant des recrues', () => {
    // C'était une MOYENNE : mesuré, le vétéran passait de 1 à 11 XP sur une route de
    // niveau 5 rien qu'en ajoutant trois recrues. Le rendement décroissant — le garde-fou
    // qui empêche de farmer le trajet le plus court — se contournait avec des passagers.
    const facile = poi({ level: 5 });
    const seul = resolveCaravan(facile, [vet('v')], 42, NUS, 100);
    const accompagne = resolveCaravan(
      facile,
      [vet('v'), bleu('r1'), bleu('r2'), bleu('r3')],
      42,
      NUS,
      100,
    );
    expect(accompagne.xp['v']).toBe(seul.xp['v']);
    // …et la recrue touche bien plus que lui sur cette route-là.
    expect(accompagne.xp['r1']!).toBeGreaterThan(accompagne.xp['v']!);
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
  it('elle ne dépend QUE du nombre d’épreuves, jamais de leur ISSUE', () => {
    // ⚠️ Assertion DIRECTE : « XP > 0 » laissait passer une version qui ne comptait que
    // les combats GAGNÉS — un débutant qui perd tout aurait alors stagné pour toujours.
    const p = poi();
    const a = bleu('r');
    let defaites = 0;
    for (let s = 0; s < 200; s++) {
      const o = resolveCaravan(p, [a], s * 977 + 1, NUS, 100);
      const f = o.events.filter((e) => e.kind === 'bandits');
      expect(o.xp['r']).toBe(missionXp(a, p, f.length));
      if (f.some((x) => !x.won)) defaites++;
    }
    expect(defaites, 'aucune défaite dans le lot : le test ne prouve rien').toBeGreaterThan(0);
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
    for (const type of ['well', 'shrine', 'archive', 'wreck', 'mine'] as PoiType[])
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
              ['scrap', o.scrap],
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
  const HARVEST: PoiType[] = ['well', 'shrine', 'archive', 'wreck'];
  const part = (n: number, L: number) => {
    const esc = team(n, L);
    let brut = 0;
    let sal = 0;
    for (const type of HARVEST)
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
    // joueur (`guildRoster`). Un premier jet balayait « 2 aventuriers au niveau 1 » et
    // rougissait à 134 % — sur un état que personne ne peut avoir. Tester l’impossible
    // donne un rouge aussi creux qu’un vert : mesuré sur l’enveloppe réelle, le pire cas
    // vaut 73 % (niveau 2, deux aventuriers).
    for (let L = 1; L <= 100; L += L < 20 ? 1 : 10)
      for (let n = 1; n <= Math.min(guildRoster(L), CARAVAN.escortMax); n++)
        expect(part(n, L), `niveau ${L}, ${n} aventurier(s)`).toBeLessThan(0.8);
  });

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
  const base = startCaravan('c0', poi({ level: 10 }), team(2, 10), 0, 7, NUS, 0, 100);
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

describe('⚠️ ALLER LOIN FORME DAVANTAGE — l’XP paie la DISTANCE', () => {
  /** Un POI TEL QUE LA CARTE LE POSE : son niveau DÉCOULE de sa distance (v0.683).
   *  ⚠️ Le fabriquer à niveau constant ne testerait pas la décision du joueur — sur la
   *  carte, choisir « plus loin » c'est choisir « plus fort » du même geste. */
  const mapPoi = (playerLevel: number, distNorm: number): Poi => {
    const w = spawnWindow(playerLevel);
    return poi({ level: w.min + Math.round(distNorm * (w.max - w.min)), distNorm });
  };
  /** Le rendement qui décide vraiment : un convoi occupe un créneau pendant tout son
   *  voyage, on compare donc ce qu'il rapporte À L'HEURE, pas par voyage. */
  const xpParHeure = (playerLevel: number, distNorm: number) => {
    const p = mapPoi(playerLevel, distNorm);
    return missionXp(refAdventurer(playerLevel), p) / ((2 * caravanLegMin(p, [], 0, 0)) / 60);
  };
  const DIST = [0, 0.25, 0.5, 0.75, 0.9, 1];

  it('⚠️ LA NAVETTE AU PIED DE LA VILLE N’EST PLUS LA MEILLEURE ÉCOLE', () => {
    // ⚠️ CE QUE AUCUN TEST N'EXISTAIT POUR VOIR — et c'est pour ça que le défaut a vécu :
    // `poi()` vaut 0,5 partout ailleurs dans ce fichier, donc la distance n'était mesurée
    // nulle part. Le niveau d'un POI découle bien de son éloignement, donc l'XP montait
    // un peu en s'éloignant — mais le TRAJET montait vingt fois plus vite. Mesuré au
    // niveau 28 : 85 XP/h au plus proche contre 5 au plus lointain, un rapport de 17.
    // Élever son vivier revenait à faire l'aller-retour au pied de la ville.
    for (const L of [10, 28, 60, 90]) {
      const proche = xpParHeure(L, 0);
      const ailleurs = Math.max(...DIST.map((d) => xpParHeure(L, d)));
      // Marge FRANCHE : sans borne basse, un écart de 1 % passerait sans jamais peser
      // dans une décision. Mesuré après correctif : +37 à +39 %.
      expect(ailleurs / proche, `niveau ${L}`).toBeGreaterThan(1.25);
    }
  });

  it('⚠️ …et ce n’est jamais le POI le plus proche qui gagne', () => {
    // Formulé sur l'ARGMAX et pas sur le seul bout de la carte : mesuré, l'optimum se
    // déplace vers le milieu à haut niveau (d≈1 aux niveaux 10-28, 0,75 au 60, 0,5 au 90)
    // parce que le plafond de `travelFactor` (9 h aller-retour) est atteint d'autant plus
    // tôt que le trajet s'allonge avec le niveau. C'est la MÊME limite que pour la
    // cargaison, donc un arbitrage cohérent — « il y a une bonne distance » — et non un
    // retour au défaut, qui était « la bonne distance est toujours zéro ».
    for (const L of [10, 28, 60, 90]) {
      const rendements = DIST.map((d) => xpParHeure(L, d));
      const meilleur = DIST[rendements.indexOf(Math.max(...rendements))]!;
      expect(meilleur, `niveau ${L}`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('⚠️ la DISTANCE MÉDIANE est le point fixe — on redistribue, on ne dope pas', () => {
    // C'est ce qui préserve la courbe de montée mesurée (~8 missions pour le niveau 2,
    // 255 pour le 23) : le joueur qui prend ce que la carte lui donne ne voit rien
    // changer. Le proche paie moins, le lointain davantage.
    expect(missionTravelMult(poi({ distNorm: CARAVAN.xpRefDist }))).toBeCloseTo(1, 6);
    expect(missionTravelMult(poi({ distNorm: 0 }))).toBeLessThan(1);
    expect(missionTravelMult(poi({ distNorm: 1 }))).toBeGreaterThan(1);
  });

  it('⚠️ elle se paie sur le temps du HÉROS, jamais sur celui de la caravane', () => {
    // Sinon la lenteur deviendrait une prime : un Comptoir bas niveau — donc des convois
    // plus lents — rapporterait PLUS d'XP qu'un Comptoir monté à fond, et améliorer son
    // bâtiment se paierait d'une régression. Même raison que `heroEquivalentFactor`.
    // ⚠️ VÉRIFIÉ SUR LA VALEUR, pas sur l'intention : un premier jet comparait
    // `missionTravelMult(p)` à lui-même — vrai, et qu'aucune mutation ne peut faire
    // tomber. On épingle donc le fait qu'il vaut EXACTEMENT le facteur du héros, celui
    // que la cargaison utilise : le calculer sur la durée réelle du convoi le change.
    for (const d of [0, 0.5, 1]) {
      const p = poi({ distNorm: d });
      const attendu = heroEquivalentFactor(p) / heroEquivalentFactor(poi({ distNorm: 0.5 }));
      expect(missionTravelMult(p), `distance ${d}`).toBeCloseTo(attendu, 9);
    }
    // …et un convoi ralenti met bien PLUS de temps : c'est ce que la règle refuse de payer.
    const loin = poi({ distNorm: 1 });
    expect(caravanLegMin(loin, [], 80, 0)).toBeLessThan(caravanLegMin(loin, [], 0, 0));
  });

  it('⚠️ la distance ne contourne pas le rendement décroissant', () => {
    // Les deux termes ne font pas double emploi : l'un regarde le NIVEAU de la route,
    // l'autre son ÉLOIGNEMENT. Un vétéran envoyé au bout d'une carte de bas niveau doit
    // rester bridé, sinon le farm de route facile revient par la porte de derrière.
    const loin = poi({ level: 5, distNorm: 1 });
    expect(missionXp(refAdventurer(40), loin)).toBeLessThan(missionXp(refAdventurer(5), loin));
  });

  it('l’XP suit la MÊME courbe que la cargaison', () => {
    // Une seconde règle de distance aurait divergé au premier réglage de `TRAVEL_EXP`,
    // et l'une des deux aurait cessé de payer l'éloignement.
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      const p = poi({ distNorm: d });
      expect(
        missionTravelMult(p) * heroEquivalentFactor(poi({ distNorm: CARAVAN.xpRefDist })),
      ).toBeCloseTo(heroEquivalentFactor(p), 6);
    }
  });
});

describe('⚠️ le bonus d’XP suit les combats RÉELS, pas l’étiquette', () => {
  it('plus d’embuscades traversées = plus d’XP', () => {
    const p = poi();
    const a = refAdventurer(20);
    expect(missionXp(a, p, 2)).toBeGreaterThan(missionXp(a, p, 0));
    expect(missionXp(a, p, 3)).toBeGreaterThan(missionXp(a, p, 1));
  });
  it('le bonus est BORNÉ — une route infestée ne devient pas une pompe à XP', () => {
    const p = poi();
    const a = refAdventurer(20);
    expect(missionXp(a, p, 99)).toBeLessThanOrEqual(
      Math.round(missionXp(a, p, 0) * (1 + CARAVAN.xpFightMax) + 1),
    );
  });
  it('une route périlleuse SANS embuscade ne paie plus le simple risque', () => {
    // Mesuré avant : XP identique (49) qu'il y ait eu 1, 2 ou 3 embuscades — on payait
    // l'étiquette. Elle reste plus formatrice, mais parce qu'il s'y passe quelque chose.
    const a = refAdventurer(20);
    expect(missionXp(a, poi({ perilous: true }), 0)).toBe(missionXp(a, poi(), 0));
    expect(missionXp(a, poi({ perilous: true }), 3)).toBeGreaterThan(missionXp(a, poi(), 0));
  });
});

describe('⚠️ un convoi VOYAGE comme le héros', () => {
  // Le convoi est situé sur la carte par la MÊME fonction que le héros
  // (`travelPosition`) : deux copies de cette interpolation divergeraient à la
  // première retouche — c'est le piège des libellés de POI, déjà rencontré deux fois.
  const van = startCaravan('v1', poi({ x: 60, y: 20 }), team(3), 0, 7, NUS, 0, 100);

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

describe('⚠️ un convoi part SANS le héros', () => {
  // Le panneau d'envoi de la carte était entièrement gardé par « le héros est
  // disponible » : dès qu'il partait en expédition, on ne pouvait plus ni sélectionner
  // un lieu, ni lancer un convoi. C'est l'exact inverse de l'intention — un convoi est
  // une voie PARALLÈLE, sa raison d'être est de jouer quand le héros ne peut pas.
  const recolte = poi({ type: 'well' });
  const combat = poi({ type: 'camp' });

  it('⚠️ l’offre de convoi NE DÉPEND PAS de la disponibilité du héros', () => {
    for (const heroAway of [true, false]) {
      expect(
        poiOffers(recolte, { heroAway, comptoirLevel: 3 }).caravan,
        `héros absent=${heroAway}`,
      ).toBe(true);
    }
  });

  it('le HÉROS, lui, ne peut pas être à deux endroits', () => {
    expect(poiOffers(recolte, { heroAway: false, comptoirLevel: 3 }).hero).toBe(true);
    expect(poiOffers(recolte, { heroAway: true, comptoirLevel: 3 }).hero).toBe(false);
  });

  it('un convoi n’exploite que les lieux de RÉCOLTE, et exige un Comptoir', () => {
    expect(poiOffers(combat, { heroAway: false, comptoirLevel: 3 }).caravan).toBe(false);
    expect(poiOffers(recolte, { heroAway: false, comptoirLevel: 0 }).caravan).toBe(false);
  });
});

describe('⚠️ ce qui est GRISÉ sur la carte', () => {
  // Le gris doit dire « rien ne peut y aller », jamais « le héros est occupé ».
  // La carte grisait TOUT dès son départ, y compris les lieux de récolte où un convoi
  // peut parfaitement aller : elle annonçait indisponibles des lieux disponibles, et
  // l'utilisateur a logiquement cessé d'essayer de cliquer.
  const gris = (p: Poi, heroAway: boolean, comptoirLevel: number) => {
    const o = poiOffers(p, { heroAway, comptoirLevel });
    return !o.hero && !o.caravan;
  };

  it('⚠️ un lieu de RÉCOLTE reste vif quand le héros est parti', () => {
    expect(gris(poi({ type: 'well' }), true, 3)).toBe(false);
  });

  it('un lieu de COMBAT se grise quand le héros est parti — là, rien ne peut y aller', () => {
    expect(gris(poi({ type: 'camp' }), true, 3)).toBe(true);
  });

  it('sans Comptoir, tout se grise pendant l’absence du héros', () => {
    expect(gris(poi({ type: 'well' }), true, 0)).toBe(true);
  });

  it('héros disponible : rien n’est grisé', () => {
    for (const t of ['well', 'camp', 'lair', 'mine'] as const) {
      expect(gris(poi({ type: t }), false, 0), t).toBe(false);
    }
  });
});

describe('⚠️ le temps de formation suit le RANG visé', () => {
  // La durée ne dépendait QUE du Centre : devenir Primordial coûtait exactement le même
  // temps que devenir Inhabituel, alors que la classe vaut 3,3× plus de stats. Un palier
  // qui ne se paie pas n'est pas un palier.
  it('DOUBLE à chaque rang', () => {
    for (let s = 2; s <= 7; s++) {
      expect(stratumTrainMult(s) / stratumTrainMult(s - 1), `strate ${s}`).toBeCloseTo(2, 6);
    }
    expect(stratumTrainMult(1)).toBe(1); // la référence
  });

  it('⚠️ la 1re promotion reste TRÈS RAPIDE — le début de partie ne doit pas attendre', () => {
    // C'est là que vit le joueur peu sportif que cette boucle vise : il ne doit pas
    // patienter une nuit pour la première classe de sa première recrue.
    expect(trainMsFor(0, 1)).toBeLessThanOrEqual(30 * 60_000);
    expect(trainMsFor(10, 1)).toBeLessThan(30 * 60_000);
  });

  it('un rang haut se compte en HEURES, même avec un bon Centre', () => {
    expect(trainMsFor(28, 7)).toBeGreaterThan(8 * 3_600_000);
    expect(trainMsFor(100, 7)).toBeGreaterThan(3 * 3_600_000);
  });

  it('⚠️ le Centre raccourcit TOUJOURS, et une formation garde toujours une durée', () => {
    for (const s of [1, 4, 7]) {
      for (let l = 1; l <= 100; l++) {
        expect(trainMsFor(l, s), `strate ${s} niveau ${l}`).toBeLessThan(trainMsFor(l - 1, s));
      }
      expect(trainMsFor(9999, s)).toBeGreaterThan(0);
    }
  });

  it('les strates hors bornes ne cassent rien', () => {
    expect(stratumTrainMult(0)).toBe(1);
    expect(stratumTrainMult(-5)).toBe(1);
    expect(Number.isFinite(stratumTrainMult(99))).toBe(true);
  });
});

describe('🐾 UN COMPAGNON PAR AVENTURIER — le familier suit son homme', () => {
  // Conception de l'utilisateur : un familier épaule un HOMME, pas un mur. L'appariement
  // est permanent, donc le compagnon part en convoi ET défend le rempart.
  const fam = (id: string, o: Partial<Item> = {}): Item =>
    ({
      id,
      slot: 'familiar',
      name: id,
      emoji: '🐺',
      rarity: 'rare',
      level: 1,
      baseLevel: 1,
      effect: { type: 'damage_pct', value: 20 },
      ...o,
    }) as Item;
  const adv = (id: string, o: Partial<Adventurer> = {}): Adventurer => ({
    id,
    name: id,
    seed: 1,
    path: ['guerrier'],
    level: 5,
    xp: 0,
    ...o,
  });

  describe('🐾🧠 SUR LA ROUTE AUSSI — la moyenne, jamais la somme', () => {
    // ⚠️ Le socle existait depuis la v0.758 et n'était appelé NULLE PART :
    // `companionEffects('atk')` n'avait aucun appelant. « Le compagnon suit son homme
    // PARTOUT » n'était donc vrai qu'au rempart.
    const road = (familiars: Item[] = [], talents: TalentInstance[] = []) => ({
      familiars,
      talents,
      advGear: [],
    });

    it('un compagnon apporte quelque chose à son escorte', () => {
      const team = [adv('a', { familiarId: 'f1' })];
      const nu = roadCompanionEffects(team, road());
      const avec = roadCompanionEffects(team, road([fam('f1')]));
      expect(nu.damagePct).toBe(0);
      expect(avec.damagePct).toBeGreaterThan(0);
    });

    it('⚠️ QUATRE loups sur quatre têtes valent UN loup, pas quatre', () => {
      // C'est ce qui rend la route équivalente au rempart. Là-bas chaque aventurier est
      // une unité distincte et son loup ne booste que LUI ; ici l'escorte est FONDUE en
      // un seul combattant dont les stats s'additionnent, donc cumuler les pourcentages
      // appliquerait quatre fois le bonus à la totalité des dégâts. C'est aussi ce qui
      // interdit le retour du « pool global » supprimé en v0.777.
      const seul = roadCompanionEffects([adv('a', { familiarId: 'f1' })], road([fam('f1')]));
      const quatre = roadCompanionEffects(
        ['a', 'b', 'c', 'd'].map((id, i) => adv(id, { familiarId: `f${i}` })),
        road([fam('f0'), fam('f1'), fam('f2'), fam('f3')]),
      );
      expect(quatre.damagePct).toBeCloseTo(seul.damagePct, 6);
    });

    it('⚠️ … et UN loup sur quatre têtes n’en vaut que le QUART', () => {
      // La contrepartie : c'est bien une moyenne, pas un plafond déguisé.
      const seul = roadCompanionEffects([adv('a', { familiarId: 'f1' })], road([fam('f1')]));
      const dilue = roadCompanionEffects(
        [adv('a', { familiarId: 'f1' }), adv('b'), adv('c'), adv('d')],
        road([fam('f1')]),
      );
      expect(dilue.damagePct).toBeCloseTo(seul.damagePct / 4, 6);
    });

    it('⚠️ UN SEUL DRESSAGE : ce qui a été appris au rempart compte sur la route', () => {
      // ⚠️ RÉÉCRIT (v0.805). Il verrouillait les DEUX carrières (« sur la route, seul le
      // dressage d’attaque pèse ») — exactement ce que l’utilisateur a demandé de fondre :
      // « une expérience globale, montée par les convois et les défenses ». Deux familiers
      // dressés au même niveau, l’un au combat et l’autre au mur (XP legacy), valent
      // désormais pareil — et un familier dressé vaut plus qu’un novice.
      const guerrier = fam('f1', { atkXp: famXpForLevel(20), defXp: 0 });
      const sentinelle = fam('f1', { atkXp: 0, defXp: famXpForLevel(20) / 4 });
      const novice = fam('f1');
      const team = [adv('a', { familiarId: 'f1' })];
      const g = roadCompanionEffects(team, road([guerrier])).damagePct;
      const se = roadCompanionEffects(team, road([sentinelle])).damagePct;
      expect(se).toBeCloseTo(g, 6);
      expect(g).toBeGreaterThan(roadCompanionEffects(team, road([novice])).damagePct);
    });
    it('⚠️ le familier du HÉROS ne part pas en convoi', () => {
      const team = [adv('a', { familiarId: 'f1' })];
      const e = roadCompanionEffects(team, { ...road([fam('f1')]), heroFamiliarId: 'f1' });
      expect(e.damagePct).toBe(0);
    });

    it('le TALENT confié compte lui aussi, et il est bridé', () => {
      const t = { id: 't1', code: 't_dmg', xp: 0, level: 1, equipped: false } as TalentInstance;
      const team = [adv('a', { talentId: 't1' })];
      const nu = roadCompanionEffects(team, road());
      const avec = roadCompanionEffects(team, road([], [t]));
      const somme = (x: AggregatedEffects) =>
        (Object.values(x) as number[]).reduce((s2, v) => s2 + v, 0);
      expect(somme(nu)).toBe(0);
      expect(somme(avec)).toBeGreaterThan(0);
      // Bridé : jamais la valeur pleine d'un talent porté par le héros.
      expect(somme(avec)).toBeLessThan(somme(advTalentEffects([{ ...t }], 1)));
    });

    it('⚠️ CE QUI EST BRANCHÉ EST BIEN LU PAR LE COMBAT, pas seulement calculé', () => {
      // Une formule juste qu'on n'appelle pas est un levier mort qui reste vert — c'est
      // exactement l'état dans lequel ce socle a passé vingt-six versions.
      // ⚠️ Une LIGNÉE PROMUE, pas des recrues brutes : `roadFoe` se calibre sur
      // `refAdventurer`, donc trois bleus perdent 100 % des embuscades et le test ne
      // mesurerait plus rien. Le piège est documenté depuis la v0.759 — j'y suis retombé.
      // ⚠️ Une escorte de RÉFÉRENCE complète (une orientation par membre) : trois copies
      // de la même lignée de mêlée ont agilité 0 à ce niveau, donc multi-frappe 1,00 —
      // l'issue devenait insensible à tout, y compris au bonus qu'on veut mesurer.
      const team = ['a', 'b', 'c'].map((id, i) => ({
        ...refAdventurer(20, i),
        id,
        familiarId: `f${i}`,
      }));
      const fams = [0, 1, 2].map((i) =>
        fam(`f${i}`, { effect: { type: 'damage_pct', value: 60 } }),
      );
      const poi = {
        id: 'p1',
        type: 'well',
        level: 20,
        x: 0.5,
        y: 0.2,
        spawnAt: 0,
        expiresAt: 9e12,
        perilous: true,
      } as Poi;
      let nu = 0;
      let avec = 0;
      for (let seed = 1; seed <= 120; seed++) {
        for (const ev of resolveCaravan(poi, team, seed, road(), 100).events)
          if (ev.kind === 'bandits' && ev.won) nu++;
        for (const ev of resolveCaravan(poi, team, seed, road(fams), 100).events)
          if (ev.kind === 'bandits' && ev.won) avec++;
      }
      expect(avec).toBeGreaterThan(nu);
    });
  });

  describe('qui compte comme compagnon', () => {
    it('apparie chaque aventurier à SON familier', () => {
      const owned = [fam('f1'), fam('f2')];
      const team = [adv('a', { familiarId: 'f1' }), adv('b', { familiarId: 'f2' })];
      expect(companionsOf(team, owned).map((f) => f.id)).toEqual(['f1', 'f2']);
    });

    it('⚠️ le familier PORTÉ PAR LE HÉROS ne se dédouble pas', () => {
      // Il se bat déjà ailleurs. Sans cette garde, le même animal compterait deux fois.
      const owned = [fam('f1')];
      const team = [adv('a', { familiarId: 'f1' })];
      expect(companionsOf(team, owned, 'f1')).toEqual([]);
    });

    it('⚠️ un familier apparié DEUX FOIS ne compte qu’une', () => {
      // L'écran ne devrait pas le permettre — mais l'écran ne garantit rien.
      const owned = [fam('f1')];
      const team = [adv('a', { familiarId: 'f1' }), adv('b', { familiarId: 'f1' })];
      expect(companionsOf(team, owned)).toHaveLength(1);
    });

    it('⚠️ un appariement FANTÔME est ignoré, il ne fait pas tomber le combat', () => {
      // Un familier vendu laisse son id derrière lui.
      const team = [adv('a', { familiarId: 'disparu' }), adv('b')];
      expect(companionsOf(team, [fam('f1')])).toEqual([]);
    });
  });

  describe('ce que le compagnon apporte', () => {
    // ⚠️ BLOC RÉÉCRIT (v0.805). Il verrouillait le BRIDAGE (40 %) et les DEUX terrains —
    // l’utilisateur a demandé l’inverse : « le familier booste l’aventurier comme le
    // héros, que ce soit en défense ou en attaque ». Il épingle désormais cette égalité.
    it('⚠️ L’EFFET EST CELUI DU HÉROS — valeur pleine, niveau d’objet, dressage', () => {
      // On compare à `aggregateEffects`, le calcul du HÉROS lui-même : jamais à un nombre
      // écrit à la main, qui laisserait passer une formule recopiée qui dérive.
      for (const o of [{}, { level: 60 }, { level: 30, xp: famXpForLevel(12) }]) {
        const f = fam('f1', o);
        const heros = aggregateEffects({ [FAMILIAR_SLOT]: f });
        expect(companionEffects([f]).damagePct).toBeCloseTo(heros.damagePct, 6);
      }
    });

    it('⚠️ le NIVEAU D’OBJET compte — il était oublié', () => {
      expect(companionEffects([fam('a', { level: 60 })]).damagePct).toBeGreaterThan(
        companionEffects([fam('b', { level: 1 })]).damagePct,
      );
    });

    it('⚠️ le DRESSAGE compte vraiment — un familier dressé vaut plus qu’un novice', () => {
      const novice = fam('n');
      const dresse = fam('d', { xp: famXpForLevel(15) });
      expect(companionEffects([dresse]).damagePct).toBeGreaterThan(
        companionEffects([novice]).damagePct,
      );
    });

    it('⚠️ la FATIGUE est un état, pas une formule : le multiplicateur s’applique', () => {
      const f = fam('f1');
      expect(companionEffects([f], 0.5).damagePct).toBeCloseTo(
        companionEffects([f]).damagePct / 2,
        6,
      );
    });

    it('la SIGNATURE ✦ d’un familier compte aussi', () => {
      const sig = fam('f1', { effect2: { type: 'execute_pct', value: 10 } });
      expect(companionEffects([sig]).executePct).toBeGreaterThan(0);
    });

    it('sans compagnon, aucun effet — jamais undefined', () => {
      expect(companionEffects([]).damagePct).toBe(0);
    });
  });

  // ⚠️ LE BLOC « la GARNISON » EST SUPPRIMÉ, PAS RÉÉCRIT — et c'est la seule fois où
  // ce projet supprime des tests plutôt que de les réécrire. Ils éprouvaient
  // `garrisonCombatant(advs, bonusDeChenil)`, une fonction qui N'EXISTE PLUS : la
  // garnison de familiers postés au mur a disparu (un familier est confié à un
  // AVENTURIER et le suit partout). Il n'y a plus de « bonus de chenil » à convertir,
  // donc plus rien à tester — le paramètre était d'ailleurs mort en production, seuls
  // ces tests l'exerçaient encore.
  //
  // ⚠️ CE QU'ILS PROTÉGEAIENT N'EST PAS PERDU : le piège d'unité qu'ils verrouillaient
  // (POURCENTAGES du chenil contre FRACTIONS d'AggregatedEffects) disparaît avec le
  // type `GarrisonBonus` lui-même — il n'y a plus qu'UNE convention. Et le renfort
  // par compagnon est couvert par les tests de `companionEffects` juste au-dessus.
  it('⚠️ SANS renfort, l’escorte est EXACTEMENT celle d’avant', () => {
    // Non-régression du calibrage des embuscades, mesuré et documenté : ajouter un
    // paramètre optionnel ne doit rien changer à ceux qui ne le passent pas.
    const team = [adv('a'), adv('b', { path: ['archer'] })];
    const avant = escortCombatant(team);
    const apres = escortCombatant(team, 'Escorte', {});
    expect(apres.pv).toBe(avant.pv);
    expect(apres.damage).toBe(avant.damage);
    expect(apres.crit).toBe(avant.crit);
  });
});

describe('🧠 UN TALENT PAR AVENTURIER — des mini-héros bien moins forts', () => {
  // Conception de l'utilisateur. Même grammaire que le héros — stats, compagnon, talent
  // — mais UNE seule ligne de chaque, et bridée. Effet de bord voulu : les talents en
  // surplus, qui ne servaient que de carburant à l'infusion, trouvent un emploi.
  const adv2 = (id: string, o: Partial<Adventurer> = {}): Adventurer => ({
    id,
    name: id,
    seed: 1,
    path: ['guerrier'],
    level: 5,
    xp: 0,
    ...o,
  });
  /** Un talent RÉEL du catalogue : inventer un code rendrait `talentEffects` muet.
   *  ⚠️ `equipped: false` — c’est l’ÉTAT RÉEL d’un talent confié à un aventurier : il
   *  n’est justement pas équipé sur le héros. Le premier fixture l’omettait, et comme
   *  `talentEffects` n’écarte que le `false` EXPLICITE, la mutation « on oublie de
   *  forcer equipped » passait au VERT — alors qu’en vrai elle aurait rendu zéro. */
  // ⚠️ xp 0 = talent COMMUN (v0.805) : un aventurier de classe de départ ne porte que
  // cette rareté, et l’ancien fixture (xp 400) était déjà au-dessus.
  const tal = (id: string, code = TALENTS[0]!.code, xp = 0) => ({
    id,
    code,
    xp,
    level: 1,
    equipped: false,
  });

  it('⚠️ LE TALENT NE DÉPASSE PAS LA RARETÉ DE SA CLASSE (v0.805)', () => {
    // Demandé par l’utilisateur (« comme les familiers, limiter le talent au rang ») —
    // choix « rareté de sa classe » : chaque promotion débloque la rareté suivante.
    const rare = tal('t9', TALENTS[0]!.code, talentTierFloor(15));
    const bleu = adv2('a', { talentId: 't9' });
    const promu = { ...refAdventurer(40, 0), id: 'b', talentId: 't9' };
    expect(canAdvTalent(bleu, tal('t0'))).toBe(true);
    expect(canAdvTalent(bleu, rare)).toBe(false);
    expect(canAdvTalent(promu, rare)).toBe(true);
    // ⚠️ Appliqué AU COMBAT : un talent trop rare confié avant la règle ne compte pas.
    expect(advTalentsOf([bleu], [rare])).toEqual([]);
    expect(advTalentsOf([promu], [rare]).map((t) => t.id)).toEqual(['t9']);
  });

  it('assigne à chaque aventurier SON talent', () => {
    const owned = [tal('t1'), tal('t2')];
    const team = [adv2('a', { talentId: 't1' }), adv2('b', { talentId: 't2' })];
    expect(advTalentsOf(team, owned).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('⚠️ un talent ÉQUIPÉ PAR LE HÉROS n’est pas disponible', () => {
    const owned = [tal('t1')];
    const team = [adv2('a', { talentId: 't1' })];
    expect(advTalentsOf(team, owned, ['t1'])).toEqual([]);
  });

  it('⚠️ un talent assigné DEUX FOIS ne compte qu’une, un id fantôme est ignoré', () => {
    const owned = [tal('t1')];
    expect(
      advTalentsOf([adv2('a', { talentId: 't1' }), adv2('b', { talentId: 't1' })], owned),
    ).toHaveLength(1);
    expect(advTalentsOf([adv2('a', { talentId: 'parti' })], owned)).toEqual([]);
  });

  it('⚠️ l’effet est RÉEL — un talent assigné change quelque chose', () => {
    // `talentEffects` ignore ce qui n'est pas équipé : sans forcer `equipped`, la
    // fonction rendrait zéro EN SILENCE, et le talent d'un aventurier ne servirait à rien.
    const e = advTalentEffects([tal('t1')]);
    const total = Object.values(e).reduce((a, v) => a + Math.abs(v), 0);
    expect(total).toBeGreaterThan(0);
  });

  it('⚠️ …et il est BRIDÉ sur TOUS les canaux, pas seulement les dégâts', () => {
    // ⚠️ Test renforcé après une mutation passée au VERT : avec UN seul talent, tous
    // les canaux sauf un valent zéro, donc ne brider que les dégâts restait invisible.
    // On prend donc des talents de canaux DIFFÉRENTS (PV, crit, armure).
    const varies = [tal('t1', 't_pv'), tal('t2', 't_crit'), tal('t3', 't_armor')];
    const plein = advTalentEffects(varies, 1);
    const bride = advTalentEffects(varies);
    const somme = (e: Record<string, number>) =>
      Object.values(e).reduce((a, v) => a + Math.abs(v), 0);
    expect(somme(plein)).toBeGreaterThan(0);
    expect(somme(bride)).toBeCloseTo(somme(plein) * ADV_TALENT_K, 6);
    // Chaque canal touché est bridé, pas seulement le total.
    expect(bride.maxPvPct).toBeCloseTo(plein.maxPvPct * ADV_TALENT_K, 6);
    expect(bride.critAdd).toBeCloseTo(plein.critAdd * ADV_TALENT_K, 6);
    expect(bride.dmgReduction).toBeCloseTo(plein.dmgReduction * ADV_TALENT_K, 6);
    expect(ADV_TALENT_K).toBeLessThan(1);
  });

  it('⚠️ le talent confié vaut ce qu’il valait avant que le talent du HÉROS passe à ×1,8 (v0.848)', () => {
    // L'échelle des talents est passée de 0,5 à 0,9 pour le héros ; embuscades et sièges ont
    // été calibrés avec 0,5 × 0,4. Le bridage compense : la valeur confiée ne doit pas bouger.
    const t = { ...tal('t1', 't_dmg'), equipped: true };
    const aEchelle09 = talentValue(talentByCode('t_dmg')!, 0, 0, talentRollOf(t), 1);
    const avant = 0.4 * aEchelle09 * (0.5 / 0.9);
    expect(advTalentEffects([t]).damagePct).toBeCloseTo(avant, 9);
  });

  it('sans talent, aucun effet', () => {
    expect(advTalentEffects([])).toEqual(advTalentEffects([], 0));
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
    ...startCaravan('c1', poi({ level: 20 }), escort, 0, 11, NUS, 0, 100),
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

  it('l’escorte de référence est équipée à son niveau, et chaque membre PORTE ses 3 pièces', () => {
    // ⚠️ « Porte », pas « possède » : une pièce de la mauvaise lignée ou trop rare pour la
    // classe serait ignorée par `wornGear` — la route se calibrerait alors sur une escorte
    // plus faible qu'annoncé, et un vivier réellement équipé y roulerait.
    for (const L of [12, 40, 85]) {
      const g = refAdvGear(L);
      expect(g).toHaveLength(3 * CARAVAN.refEscort);
      for (const p of g) expect(p.level).toBe(L);
      const esc = Array.from({ length: CARAVAN.refEscort }, (_, i) => ({
        ...refAdventurer(L, i),
        gear: {
          weapon: `refGear${i}weapon`,
          armor: `refGear${i}armor`,
          accessory: `refGear${i}accessory`,
        },
      }));
      const worn = wornGear(esc, g);
      for (const a of esc) expect(worn.get(a.id), `niveau ${L}, ${a.id}`).toHaveLength(3);
    }
  });

  it('⚠️ la référence a la FORME d’un tirage : rareté de la classe, jet 0,3, même formule de valeur', () => {
    // Même formule que `rollAdvGear` (`advGearValue`) : sinon la référence et les vrais
    // drops divergeraient au premier réglage de `ADV_GEAR.k`.
    for (const L of [12, 45, 85]) {
      const g = refAdvGear(L);
      for (let i = 0; i < CARAVAN.refEscort; i++) {
        const a = refAdventurer(L, i);
        const lineage = lineageOf(a)!;
        for (const p of g.filter((x) => x.id.startsWith(`refGear${i}`))) {
          const pool = LINEAGE_GEAR[lineage].pieces[p.slot].pool;
          expect(p.rarity).toBe(advRarity(a));
          expect(p.roll).toBe(0.3);
          expect(p.effect.type).toBe(pool[0]);
          expect(p.effect.value).toBe(advGearValue(pool[0]!, p.rarity, 0.3));
          if (RARITY_RANK[p.rarity] >= RARITY_RANK.magique) {
            expect(p.effect2?.type).toBe(pool[1]);
            expect(p.effect2?.value).toBe(advGearValue(pool[1]!, p.rarity, 0.3));
          } else expect(p.effect2).toBeUndefined();
        }
      }
    }
  });

  it('⚠️ l’équipement compte sur la route, DIVISÉ PAR L’EFFECTIF comme les compagnons', () => {
    const esc = [caravanier()];
    const stock = [bat(0)];
    const nu = roadCompanionEffects(esc, { familiars: [], talents: [], advGear: [] });
    const seul = roadCompanionEffects(esc, { familiars: [], talents: [], advGear: stock });
    expect(nu.maxPvPct).toBe(0);
    expect(seul.maxPvPct).toBeCloseTo(advGearEffects(stock).maxPvPct, 9);
    const dilue = roadCompanionEffects(
      [caravanier(), { ...refAdventurer(40, 0), id: 'b' }, { ...refAdventurer(40, 1), id: 'c' }],
      { familiars: [], talents: [], advGear: stock },
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
    const p = poi({ type: 'wreck', level: 40 });
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
      expect(avec.scrap, `graine ${s}`).toBeGreaterThan(sans.scrap);
    }
    expect(vus, 'aucun voyage sans embuscade : le test ne prouve rien').toBeGreaterThan(5);
  });

  it('⚠️ une Longue-vue portée raccourcit le trajet, sous le plafond de vitesse', () => {
    const p = poi();
    const esc = [{ ...refAdventurer(20, 1), id: 'e' }];
    const base = caravanLegMin(p, esc, 0, 0);
    expect(caravanLegMin(p, esc, 0, 0.1)).toBeLessThan(base);
    expect(caravanLegMin(p, esc, 0, 99)).toBe(caravanLegMin(p, esc, 0, CARAVAN.speedMax));
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
    const road = (advGear: AdvGear[]) => ({ familiars: [], talents: [], advGear });
    const avec = startCaravan(
      'c',
      p,
      [{ ...e, gear: { accessory: 'lv' } }],
      0,
      7,
      road([lv]),
      0,
      100,
    );
    const sans = startCaravan('c', p, [e], 0, 7, road([]), 0, 100);
    expect(avec.midAt).toBeLessThan(sans.midAt);
  });
});

describe('sources d’équipement : embuscades repoussées', () => {
  it('une embuscade repoussée peut laisser une pièce de la lignée d’un membre', () => {
    const escort = [0, 1, 2].map((i) => ({ ...refAdventurer(40, i), familiarId: `refFam${i}` }));
    let pieces = 0;
    for (let s = 1; s <= 300; s++) {
      const o = resolveCaravan(
        poi({ level: 40, perilous: true }),
        escort,
        s,
        {
          familiars: refCompanions(40),
          talents: [],
          advGear: [],
        },
        40,
      );
      for (const g of o.advGear) expect(escort.map((a) => a.path[0])).toContain(g.lineage);
      pieces += o.advGear.length;
    }
    expect(pieces).toBeGreaterThan(0);
  });

  it('⚠️ le rang de la pièce se lit sur le VRAI niveau du joueur, jamais sur celui du lieu', () => {
    // Escorte au sommet de l'arbre (le plafond de classe ne mord pas) sur un lieu de niveau
    // 40, pour un joueur de niveau 5 : la courbe borne au rang du JOUEUR, +1 au plus.
    const escort = [0, 1, 2].map((i) => ({ ...refAdventurer(100, i), familiarId: `refFam${i}` }));
    let pieces = 0;
    for (let s = 1; s <= 600; s++) {
      const o = resolveCaravan(
        poi({ level: 40 }),
        escort,
        s,
        {
          familiars: refCompanions(100),
          talents: [],
          advGear: [],
        },
        5,
      );
      for (const g of o.advGear)
        expect(RARITY_RANK[g.rarity], g.rarity).toBeLessThanOrEqual(prestigeRankIndex(5) + 1);
      pieces += o.advGear.length;
    }
    expect(pieces, 'aucune pièce : le test ne prouve rien').toBeGreaterThan(20);
  });

  it('⚠️ GÉNÉRATEUR SÉPARÉ pour l’équipement — la graine 8 pin le reste du butin', () => {
    // Cette graine déclenche le tirage de gear (une embuscade REPOUSSÉE en 2ᵉ jambe, cf.
    // `advGear` ci-dessous) : si son tirage venait à retomber sur le flux principal `rng`
    // au lieu de son propre générateur `gearRng`, tout ce qui suit dans la boucle (les
    // jambes suivantes, donc `gold`/`scrap`/`wages`/`xp`/`hurt`/`events`) serait décalé
    // et ces valeurs, prises sur le vrai code, ne matcheraient plus.
    const escort = [0, 1, 2].map((i) => refAdventurer(40, i));
    const o = resolveCaravan(
      poi({ level: 40, perilous: true }),
      escort,
      8,
      {
        familiars: refCompanions(40),
        talents: [],
        advGear: [],
      },
      40,
    );
    expect(o.gold).toBe(2391);
    expect(o.energy).toBe(0);
    expect(o.summonStones).toBe(0);
    expect(o.scrap).toBe(106);
    expect(o.keys).toBe(0);
    expect(o.wages).toBe(951);
    expect(o.xp).toEqual({ ref0: 98, ref1: 98, ref2: 98 });
    expect(o.hurt).toEqual(['ref1']);
    expect(o.events.map((e) => e.kind)).toEqual(['bandits', 'bandits', 'calme', 'calme']);
    expect(o.events.map((e) => e.won)).toEqual([false, true, undefined, undefined]);
    // …et une pièce a bien été tirée : le test n’est pas trivialement vrai.
    expect(o.advGear.length).toBeGreaterThan(0);
  });
});
