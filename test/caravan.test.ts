import { describe, it, expect } from 'vitest';
const NUS = { advGear: [] };
/**
 * ⚠️ LE PANTHÉON D'UN TEST : AU NIVEAU DE SON ESCORTE, donc la prime de rattrapage
 * (`catchUpMult`) vaut EXACTEMENT 1. Toutes les calibrations de ce fichier — bandes
 * d'embuscade, cargaison, XP — ont été mesurées sur un vivier à jour ; un Panthéon plus haut
 * y glisserait une prime et ferait dériver des mesures qui ne parlent pas d'elle. La prime a
 * ses tests à part.
 *
 * ⚠️ Ce paramètre remplace un `100` qui traînait à cette place depuis que `playerLevel` a été
 * retiré de `resolveCaravan` (v0.1012) : `test/` étant hors typecheck, l'argument mort est
 * resté, muet, jusqu'à ce qu'un nouveau paramètre le récupère en silence.
 */
const aJour = (esc: readonly { level: number }[]) => Math.max(1, ...esc.map((a) => a.level));
import {
  CARAVAN,
  catchUpMult,
  dangerMult,
  DANGER,
  missionXpFor,
  missionXpSplit,
  SOLO_XP_MULT,
  missionXpPreview,
  canSendCaravan,
  caravanHurtMs,
  caravanLegMin,
  caravanSlots,
  convoySlotsFree,
  poiOffers,
  escortCombatant,
  ambushChance,
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
  caravanHaulMult,
  refAdvGear,
  type Caravan,
} from '@/lib/caravan';
import { trialXpBase } from '@/lib/skirmish';
import { rankStartLevel } from '@/lib/characterRank';
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
  advBankedLevel,
  advXpToNext,
  advAscensionCap,
  ascendAdventurer,
  engageCap,
  PROMO_LEVELS,
  type Adventurer,
  type AdvRole,
  ROLE_SKILL,
} from '@/lib/adventurers';
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
import { poiDifficultyLevel } from '@/lib/poiRank';
import { levelForDifficulty } from '@/lib/poiDifficulty';
import { harvestGuardOf } from '@/lib/expedition';

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
  // 🔮 Forcer un rôle = poser SA rune (niveau 2) et RIEN d'autre : on isole ce qu'on
  // mesure au lieu de le mêler au build de référence (qui porte déjà des rôles).
  role?: AdvRole,
  sansGear = false,
): Adventurer[] => {
  const sansPieces = sansGear;
  return Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(level, i),
    id: `a${i}`,
    ...(role ? { skills: [{ id: ROLE_SKILL[role], level: 2 }] } : {}),
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
  Array.from(
    { length: n },
    (_, i) => resolveCaravan(p, esc, i * 7919 + 3, NUS, aJour(esc))[key],
  ).reduce((a, b) => a + b, 0) / n;

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

  it('⚔️ L’ÉQUIPEMENT COMPTE COMME CELUI DU HÉROS — la référence porte ses pièces', () => {
    // RENVERSÉ (2026-09-27, décision de l'utilisateur, option A) : « −1 % de dégâts n'a aucun
    // intérêt ». `ADV_GEAR.k` passe de 0,1125 à 1 — une pièce de champion vaut celle du héros
    // de même rang — et la route reste calibrée sur une escorte ÉQUIPÉE. L'équipement devient
    // donc indispensable, comme pour le héros ; l'ancienne règle (« un bonus, pas un péage »)
    // est abandonnée sciemment. Mesuré (400 graines, niveaux 12/26/45/70) : trio équipé
    // 82/86/81/93 %, le même SANS pièces 21/27/23/11 %.
    for (const L of [12, 26, 45, 70]) {
      const p = poi({ level: L });
      const avec = winPct(team(3, L), p, 300);
      const sans = winPct(team(3, L, undefined, true), p, 300);
      expect(avec, `équipé, niveau ${L}`).toBeGreaterThanOrEqual(0.7);
      expect(sans, `sans pièces, niveau ${L}`).toBeLessThan(0.4);
      expect(avec - sans, `écart, niveau ${L}`).toBeGreaterThan(0.4);
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
      expect(caravanLegMin(p, [], 0, 1), `niveau ${level}`).toBe(Math.max(1, Math.round(hero)));
      expect(caravanLegMin(p, team(3), 0, 1), `niveau ${level}`).toBeLessThanOrEqual(
        Math.round(hero),
      );
    }
  });
  it('…et la paie ne dépend ni de la vitesse ni de la DISTANCE (v0.1153)', () => {
    // Payer sur le temps réel ferait de la vitesse (rôles 🧭) une PÉNALITÉ par voyage ; et
    // depuis la v0.1153 la récompense suit la DIFFICULTÉ du lieu, jamais son éloignement.
    const esc = team(3, 40);
    for (let s = 1; s <= 20; s++) {
      const pres = resolveCaravan(poi({ level: 40, distNorm: 0.1 }), esc, s, NUS, aJour(esc));
      const loin = resolveCaravan(poi({ level: 40, distNorm: 1 }), esc, s, NUS, aJour(esc));
      expect(loin.gold).toBe(pres.gold);
      expect(loin.energy).toBe(pres.energy);
    }
  });
});

describe('⚠️ ce qu’une caravane rapporte — et ce qu’elle ne rapportera JAMAIS', () => {
  it('aucun ÉQUIPEMENT : ce n’est pas une source de butin', () => {
    // « Le sport est le plafond » : la carte ne doit pas devenir un raccourci vers du
    // stuff hors de sa ligue. Une caravane paie en LOGISTIQUE, point.
    const o = resolveCaravan(poi(), team(3), 42, NUS, aJour(team(3)));
    expect(Object.keys(o)).not.toContain('item');
    expect(Object.keys(o)).not.toContain('items');
  });
  it('🧺 elle rend la récolte du héros — sauf l’ÉNERGIE, à moitié (v0.1189 puis v0.1201)', () => {
    // ⚡ v0.1201 (décision de l'utilisateur, après mesure) : l'énergie d'une équipe sans le
    // héros repasse à `CARAVAN.energyShare` — à part pleine, des créneaux au complet valaient
    // 4 à 15 journées de sport par jour. Les PIERRES restent pleines (vérifié ci-dessous).
    // ⚠️ Mesuré sur l'ÉNERGIE d'une source (la ferraille, qui
    // servait de mesure, est retirée v0.998) : c'est une récolte pure, sans filet d'or qui
    // brouillerait la part.
    const p = poi({ type: 'well' });
    const heros = harvestYield(p.type, poiDifficultyLevel(p), harvestGuardOf(p)?.size ?? 0).energy;
    // ⚠️ Une escorte SANS RÔLE : le sujet du test est la part de base, pas la cargaison
    // qu'un 🐫 ajoute. Depuis que la référence est mixte, elle porte un rôle de haul —
    // le test mesurait donc les deux à la fois et est tombé pour la mauvaise raison.
    // 🔙 Sur les trajets qui ATTEIGNENT le lieu : un demi-tour ne récolte rien, et c'est la
    // part de la récolte qu'on mesure ici, pas le risque de la route.
    const esc0 = team(3, 20, 'heal');
    const arrived = Array.from({ length: 200 }, (_, i) =>
      resolveCaravan(p, esc0, i * 7919 + 3, NUS, aJour(esc0)),
    ).filter((o) => o.turnBack === undefined);
    const part = arrived.reduce((s, o) => s + o.energy, 0) / arrived.length / heros;
    // ⚠️ La part est écrite (0,5) ET lue sur la constante : la mettre à 1 fait tomber ce test,
    // et la déplacer sans le dire aussi.
    expect(CARAVAN.energyShare).toBe(0.2); // v0.1210 (v0.1201 : 0,5)
    expect(part / CARAVAN.energyShare).toBeGreaterThan(0.75);
    expect(part / CARAVAN.energyShare).toBeLessThan(1.25);
    const sh = poi({ type: 'shrine' });
    const pleines = harvestYield(
      sh.type,
      poiDifficultyLevel(sh),
      harvestGuardOf(sh)?.size ?? 0,
    ).summonStones;
    const esc = team(3, 20, 'heal');
    // 🔙 Même règle : sur les trajets qui atteignent le sanctuaire.
    const reach = Array.from({ length: 200 }, (_, i) =>
      resolveCaravan(sh, esc, i + 1, NUS, aJour(esc)),
    ).filter((o) => o.turnBack === undefined);
    const tot = (reach.reduce((t, o) => t + o.summonStones, 0) / reach.length) * 200;
    // 🔮 v0.1210 : les pierres d’un sanctuaire passent elles aussi à la part d’équipe.
    expect(CARAVAN.stonesShare).toBe(0.2);
    expect(tot / 200 / pleines / CARAVAN.stonesShare).toBeGreaterThan(0.75);
    expect(tot / 200 / pleines / CARAVAN.stonesShare).toBeLessThan(1.25);
  });
  it('le plafond d’ÉNERGIE tient APRÈS les multiplicateurs', () => {
    // « complément, jamais substitut au sport » est un invariant, pas une base qu'un
    // bon voyage pourrait dépasser.
    // ⚠️ Il faut FORCER un multiplicateur > 1, sinon le test passe même sans plafond :
    // une escorte 🐫 (cargaison) et des embuscades gagnées poussent `k` au-dessus de 1.
    const p = poi({ type: 'well', level: 90, distNorm: 1 });
    const cap = harvestYield('well', poiDifficultyLevel(p)).energy * CARAVAN.energyShare;
    const cargo = team(4, 90, 'haul');
    let vu = false;
    for (let s = 0; s < 200; s++) {
      const o = resolveCaravan(p, cargo, s * 977 + 1, NUS, aJour(cargo));
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
    const sans = caravanLegMin(p, team(2, 20, 'haul'), 0, 1);
    const avec = caravanLegMin(p, team(2, 20, 'speed'), 0, 1);
    expect(avec).toBeLessThan(sans);
  });
  it('un 🐫 grossit la cargaison', () => {
    // ⚠️ Sur les RESSOURCES, jamais sur l'or (v0.1161 : l'or d'une équipe est celui du
    // héros). Le test d'avant mesurait l'or d'une mine et ne passait que parce que les deux
    // escortes étaient deux champions DIFFÉRENTS — il mesurait leurs stats, pas le rôle.
    expect(caravanHaulMult(team(2, 20, 'haul'), [])).toBeGreaterThan(
      caravanHaulMult(team(2, 20, 'speed'), []),
    );
    const p = poi({ type: 'mana_mine' });
    const mana = (esc: Adventurer[]) =>
      Array.from(
        { length: 200 },
        (_, i) => resolveCaravan(p, esc, i * 7919 + 3, NUS, aJour(esc)).mana,
      ).reduce((x, y) => x + y, 0);
    expect(mana(team(2, 20, 'haul'))).toBeGreaterThan(mana(team(2, 20, 'speed')));
  });
  it('un 🩺 raccourcit les convalescences, et l’Infirmerie aussi', () => {
    const soigneur = team(2, 20, 'heal');
    expect(caravanHurtMs(soigneur)).toBeLessThan(caravanHurtMs(team(2, 20, 'haul')));
    expect(caravanHurtMs(soigneur, 10)).toBeLessThan(caravanHurtMs(soigneur, 0));
  });
});

describe('XP et garde-fous', () => {
  it('💸 aucun salaire : un convoi ne facture rien à son escorte', () => {
    const o = resolveCaravan(poi({ level: 40 }), team(3), 1, NUS, aJour(team(3)));
    expect(o).not.toHaveProperty('wages');
  });
  it('⚠️ l’XP a un RENDEMENT DÉCROISSANT sous la DIFFICULTÉ du lieu', () => {
    // Sinon on farme le lieu le plus facile à l’infini et le choix de destination meurt.
    // ⚠️ À MÊME POI : c’est l’écart de niveau qui doit faire chuter le gain. Comparer deux
    // POI différents ne testerait que le socle, pas la décroissance.
    // ⚠️ La comparaison se fait sur la DIFFICULTÉ (v0.1107), pas sur `poi.level` : un lieu
    // à un seul ennemi ne vaut pas un lieu qui en aligne trois.
    // ⚠️ Un lieu de HAUT niveau : à niveau 5 la difficulté vaut 2, donc « un cran sous »
    //    ne laisse qu'un intervalle d'un niveau et la propriété ne s'observe pas.
    const facile = poi({ level: 33 });
    const d = poiDifficultyLevel(facile);
    expect(d).toBeGreaterThan(10);
    expect(missionXp(refAdventurer(d * 4), facile, true)).toBeLessThan(
      missionXp(refAdventurer(d), facile, true),
    );
    // ⚠️ RÉÉCRIT (v0.1164) : il affirmait qu'au-dessus de soi le ratio était plafonné (même
    // XP qu'à sa hauteur). On paie désormais le danger : le champion plus bas gagne PLUS.
    const bas = Math.round(d / 2);
    expect(missionXp(refAdventurer(bas), facile, true)).toBe(
      Math.round(trialXpBase(d) * dangerMult(bas, d)),
    );
    expect(missionXp(refAdventurer(bas), facile, true)).toBeGreaterThan(
      missionXp(refAdventurer(d), facile, true),
    );
  });
  it('🎯 le SOCLE suit la DIFFICULTÉ — le niveau des ennemis ET leur nombre (v0.1107)', () => {
    // ⚠️ RÉÉCRIT. Il épinglait « le socle suit le niveau de RÉCOMPENSE » (v0.1033) : le
    // socle lisait donc une fenêtre calée sur le JOUEUR, si bien qu’un lieu à 1 ennemi et
    // un lieu à 3 du même niveau rapportaient EXACTEMENT la même chose (mesuré : 30/30/30).
    // Ce que le joueur affronte ne se lisait nulle part dans son XP.
    // (champion À la difficulté du lieu : aucun écart, donc ni rendement décroissant ni danger)
    const p5 = poi({ level: 5 });
    const a5 = refAdventurer(poiDifficultyLevel(p5));
    expect(missionXp(a5, p5, true)).toBe(Math.round(trialXpBase(poiDifficultyLevel(p5))));
    // ⚠️ Le niveau de RÉCOMPENSE n’y entre plus : il paie l’or, pas l’apprentissage.
    const riche = { ...poi({ level: 5 }), rewardLevel: 40 };
    expect(missionXp(a5, riche, true)).toBe(missionXp(a5, p5, true));
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
    const a = resolveCaravan(poi(), team(3), 1234, NUS, aJour(team(3)));
    const b = resolveCaravan(poi(), team(3), 1234, NUS, aJour(team(3)));
    expect(a).toEqual(b);
  });
  it('l’aller et le retour sont symétriques, le rapport lisible à mi-chemin', () => {
    const c = startCaravan('c1', poi(), team(3), 1000, 7, NUS, 1, 20);
    expect(c.midAt).toBeGreaterThan(c.sentAt);
    expect(c.returnAt - c.midAt).toBe(c.midAt - c.sentAt);
    expect(c.escort).toHaveLength(3);
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
      const seul = resolveCaravan(facile, [vet('v')], s, NUS, aJour([vet('v')]));
      const accompagne = resolveCaravan(
        facile,
        [vet('v'), bleu('r1'), bleu('r2'), bleu('r3')],
        s,
        NUS,
        aJour([vet('v')]),
      );
      expect(accompagne.xp['v']!, `graine ${s}`).toBeLessThanOrEqual(seul.xp['v']! + 1);
      expect(accompagne.xp['r1']!).toBeGreaterThan(accompagne.xp['v']!);
    }
  });
  it('tout le monde en reçoit, personne n’est oublié', () => {
    const o = resolveCaravan(poi(), [vet('v'), bleu('r')], 7, NUS, aJour([vet('v'), bleu('r')]));
    expect(Object.keys(o.xp).sort()).toEqual(['r', 'v']);
    for (const v of Object.values(o.xp)) expect(v).toBeGreaterThan(0);
  });
  it('⚠️ l’XP tombe MÊME SANS COMBAT et QUEL QUE SOIT le résultat', () => {
    // Sans ça, un débutant à un seul aventurier — qui perd toutes ses embuscades — ne
    // progresserait jamais ; et perdre punirait deux fois (cargaison, blessé, rien appris).
    let sansCombat = 0;
    let perdu = 0;
    for (let s = 0; s < 200; s++) {
      const o = resolveCaravan(poi(), [bleu('r')], s * 977 + 1, NUS, aJour([bleu('r')]));
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
      const o = resolveCaravan(p, esc, s * 977 + 1, NUS, aJour(esc));
      const f = o.events.filter((e) => e.kind === 'bandits');
      const abattus = f.reduce((n, e) => n + (e.slain ?? 0), 0);
      // 🎓 Victoire = aucune embuscade perdue (sans combat compris) : socle plein ; sinon
      // le socle de défaite (v0.1014).
      const won = !f.some((x) => x.won === false);
      for (const a of esc) {
        expect(o.xp[a.id]!).toBeGreaterThanOrEqual(missionXp(a, p, won));
        // 🧭 Un convoi part sans le héros : son socle porte la prime `SOLO_XP_MULT`.
        if (!f.length) expect(o.xp[a.id]).toBe(Math.round(missionXp(a, p, true) * SOLO_XP_MULT));
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
      const o = resolveCaravan(
        poi({ level: 26, perilous: true }),
        esc,
        s * 131 + 5,
        NUS,
        aJour(esc),
      );
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
              aJour(esc),
            );
            for (const [k, v] of [
              ['gold', o.gold],
              ['energy', o.energy],
              ['summonStones', o.summonStones],
              ['keys', o.keys],
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
    const brut = harvestYield(p.type, poiDifficultyLevel(p)).energy;
    for (let seed = 1; seed <= 30; seed++)
      expect(
        resolveCaravan(p, team(3, 70), seed, NUS, aJour(team(3, 70))).energy,
      ).toBeLessThanOrEqual(Math.round(brut));
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
      const near = resolveCaravan(
        poi({ distNorm: 0.05 }),
        escort,
        s * 131 + 5,
        road,
        aJour(escort),
      );
      const far = resolveCaravan(poi({ distNorm: 0.95 }), escort, s * 131 + 5, road, aJour(escort));
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

  it('⚔️ ON PAIE LE DANGER (v0.1164) : +50 % par rang d’avance du lieu, borné, sur victoire', () => {
    const p = poi({ level: 80 });
    const d = poiDifficultyLevel(p);
    expect(d).toBeGreaterThan(25);
    const base = missionXp(refAdventurer(d), p, true);
    // ⚠️ À un point près : `base` est ARRONDI, la prime s'applique à la valeur non arrondie.
    const near = (x: number, v: number) =>
      expect(Math.abs(x - Math.round(v))).toBeLessThanOrEqual(1);
    // Un rang (10 niveaux) d'avance : +50 %.
    near(missionXp(refAdventurer(d - 10), p, true), base * 1.5);
    // Continu à l'intérieur d'un rang : 5 niveaux → +25 %.
    near(missionXp(refAdventurer(d - 5), p, true), base * 1.25);
    // Borné à +100 % (deux rangs), même très loin dessous.
    near(missionXp(refAdventurer(1), p, true), base * (1 + DANGER.max));
    // ⚠️ Pas sur une DÉFAITE : on paie le danger surmonté, pas la chute.
    expect(missionXp(refAdventurer(d - 10), p, false)).toBe(missionXp(refAdventurer(d), p, false));
    // Aucun danger à sa hauteur ou en dessous.
    expect(dangerMult(d, d)).toBe(1);
    expect(dangerMult(d + 10, d)).toBe(1);
  });

  it('⚠️ le rendement décroissant tient toujours', () => {
    // Un vétéran sur un lieu faible reste bridé : sinon le farm de route facile revient.
    const faible = poi({ level: 5 });
    expect(missionXp(refAdventurer(40), faible, true)).toBeLessThan(
      missionXp(refAdventurer(5), faible, true),
    );
  });
});

describe('🎓 UN CHAMPION EN RETARD APPREND PLUS VITE — la prime de rattrapage (v0.1097)', () => {
  const p = poi({ level: 100 });
  const champ = (level: number, id = 'x') => [{ ...refChampionAdv(100, 0), id, level }];

  it('⚠️ À NIVEAU, elle vaut EXACTEMENT 1 — la calibration de la montée n’est pas déplacée', () => {
    for (const L of [1, 5, 20, 50, 100]) expect(catchUpMult(L, L), `niveau ${L}`).toBe(1);
    // Et AU-DELÀ du Panthéon (un champion que la Guilde a laissé derrière) : toujours 1,
    // jamais moins — on ne PUNIT pas celui qui a de l'avance.
    for (const L of [30, 60]) expect(catchUpMult(L, 20), `niveau ${L}`).toBe(1);
  });

  it('un RANG de retard DOUBLE l’apprentissage — et le pas est celui de l’échelle de prestige', () => {
    const pas = rankStartLevel(1) - 1;
    expect(catchUpMult(100 - pas, 100)).toBeCloseTo(2, 6);
    expect(catchUpMult(100 - 2 * pas, 100)).toBeCloseTo(3, 6);
  });

  it('elle est DISCRÈTE au petit retard, FORTE au gros — et elle grandit avec le monde', () => {
    expect(catchUpMult(98, 100)).toBeCloseTo(1.2, 6); // 2 niveaux
    expect(catchUpMult(95, 100)).toBeCloseTo(1.5, 6); // 5 niveaux
    expect(catchUpMult(1, 100)).toBeGreaterThan(9); // un champion neuf
    // ⚠️ C'EST CE QUI SUPPRIME LA DÉRIVE : une prime en PART du retard donnerait la même
    // valeur aux deux bouts, et rattraper un joueur de niveau 100 resterait 4× plus long
    // que rattraper un joueur de niveau 26.
    expect(catchUpMult(1, 100)).toBeGreaterThan(catchUpMult(1, 26) * 2);
  });

  it('⚠️ elle croît AVEC LE RETARD, sans plafond qui l’écrêterait', () => {
    let prev = 0;
    for (const L of [100, 80, 50, 20, 5, 1]) {
      const m = catchUpMult(L, 100);
      expect(m, `niveau ${L}`).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it('🏦 la réserve compte comme des niveaux — sans réserve, c’est le niveau affiché', () => {
    const a = champ(10, 'a')[0]!;
    expect(advBankedLevel({ ...a, xp: 0 }, 60)).toBe(10);
    // Tout juste de quoi passer 3 niveaux : 10 → 13.
    const trois = [10, 11, 12].reduce((t, l) => t + advXpToNext(l), 0);
    expect(advBankedLevel({ ...a, xp: trois }, 60)).toBe(13);
    expect(advBankedLevel({ ...a, xp: trois - 1 }, 60)).toBe(12);
    // Plafonnée au Panthéon, jamais au-delà.
    expect(advBankedLevel({ ...a, xp: 1e9 }, 60)).toBe(60);
  });

  it('⚠️ bloqué à ★5 avec une grosse réserve, il touche la prime de son niveau VIRTUEL', () => {
    // Le défaut (v0.1126) : la prime lisait le niveau affiché, figé à 10 tant qu'on
    // n'ascensionne pas — donc ×6 au Panthéon 60, quelle que soit la réserve accumulée.
    const bloque = { ...champ(10, 'a')[0]!, ascended: 0, xp: 1e9 };
    const monte = { ...champ(60, 'b')[0]!, ascended: 5 };
    const xp = missionXpFor([bloque, monte], p, true, {}, 60);
    expect(xp[bloque.id]).toBe(xp[monte.id]);
    expect(missionXpPreview([bloque], [bloque.id], p, 60)[bloque.id]!.catchUp).toBe(1);
    // …et l’étiquette « plein tarif » lit le même niveau : un lieu 20 est SOUS sa réserve.
    expect(missionXpPreview([bloque], [], poi({ level: 20 }), 60)[bloque.id]!.full).toBe(false);
  });

  it('⚠️ retarder ses ascensions ne rapporte RIEN — même nombre de missions pour rattraper', () => {
    // Mesuré avant correctif : 41 % (P=30) à 69 % (P=100) de missions en moins pour qui
    // restait bloqué à ★5 puis enchaînait les ascensions.
    for (const P of [30, 60, 100]) {
      const lieu = poi({ level: P });
      const depart = { ...champ(10, 'x')[0]!, ascended: 0, xp: 0 };
      const mission = (a: typeof depart) =>
        grantAdvXp(a, missionXpFor([a], lieu, true, {}, P)[a.id]!, P);
      // A : ascensionne dès que possible.
      let a = depart;
      let nA = 0;
      while (a.level < P && nA < 10000) {
        a = mission(a);
        nA++;
        while (a.level >= advAscensionCap(a) && a.level < P) a = ascendAdventurer(a, P);
      }
      // B : reste bloqué jusqu'à ce que sa réserve le mène au Panthéon, puis enchaîne.
      let b = depart;
      let nB = 0;
      while (advBankedLevel(b, P) < P && nB < 10000) {
        b = mission(b);
        nB++;
      }
      while (b.level < P) b = ascendAdventurer(b, P);
      expect(b.level, `P=${P}`).toBe(P);
      expect(nB, `P=${P}`).toBeGreaterThanOrEqual(nA);
    }
  });

  it('🔮 l’annonce AVANT l’envoi dit EXACTEMENT ce que la mission versera', () => {
    // ⚠️ La garantie est là : aucune formule d’affichage à part. Ce que la tuile annonce
    // est ce que `missionXpFor` verse, au chiffre près.
    const a = champ(10, 'a')[0]!;
    const b = { ...champ(30, 'b')[0]!, id: 'b' };
    const vue = missionXpPreview([a, b], [a.id, b.id], p, 100);
    const verse = missionXpFor([a, b], p, true, {}, 100);
    expect(vue[a.id]!.xp).toBe(verse[a.id]);
    expect(vue[b.id]!.xp).toBe(verse[b.id]);
  });

  it('🔮 un champion NON sélectionné est chiffré comme si on l’AJOUTAIT', () => {
    // Sinon deux tuiles ne se comparent pas : celle du coché porterait le partage, celle
    // du non-coché un partage qui n’existe pas.
    const a = champ(10, 'a')[0]!;
    const b = { ...champ(10, 'b')[0]!, id: 'b' };
    const c = { ...champ(10, 'c')[0]!, id: 'c' };
    const d = { ...champ(10, 'd')[0]!, id: 'd' };
    const eq = [a, b, c, d];
    // Trois cochés : le quatrième est chiffré à QUATRE (le partage qu’il subirait).
    const vue = missionXpPreview(eq, [a.id, b.id, c.id], p, 100);
    expect(vue[d.id]!.xp).toBe(missionXpFor(eq, p, true, {}, 100)[d.id]);
    // …et il annonce donc MOINS que les cochés, qui ne sont encore que trois.
    expect(vue[d.id]!.xp).toBeLessThan(vue[a.id]!.xp);
  });

  it('🔮 elle DIT quand le lieu est sous le niveau du champion — la règle invisible', () => {
    // Mesuré (v0.1102) : c’est CE seuil qui fait varier l’apprentissage du simple au
    // quadruple, et rien à l’écran ne le disait.
    const bas = champ(10, 'bas')[0]!;
    const haut = { ...champ(60, 'haut')[0]!, id: 'haut' };
    const vue = missionXpPreview([bas, haut], [], poi({ level: 20 }), 100);
    expect(vue[bas.id]!.full).toBe(true); // 20 ≥ 10
    expect(vue[haut.id]!.full).toBe(false); // 20 < 60
    // …et ce n’est pas qu’une étiquette : celui qui est au-dessus touche moins.
    expect(vue[haut.id]!.xp).toBeLessThan(vue[bas.id]!.xp);
  });

  it('🔮 elle annonce la prime de retard, et c’est CELLE du moteur', () => {
    const neuf = champ(1, 'neuf')[0]!;
    const vue = missionXpPreview([neuf], [neuf.id], p, 100);
    expect(vue[neuf.id]!.catchUp).toBe(catchUpMult(1, 100));
    expect(vue[neuf.id]!.catchUp).toBeGreaterThan(1);
  });

  it('🎯 « plein tarif » se juge sur la DIFFICULTÉ, pas sur le niveau du lieu', () => {
    // ⚠️ C'est `missionXp` qui écrête sur la difficulté : comparer au niveau ferait annoncer
    //    « plein tarif » sur un lieu de haut niveau tenu par un seul ennemi, que la formule
    //    paie pourtant au rabais. Une étiquette qui diverge du moteur.
    const p33 = poi({ level: 33 });
    const d = poiDifficultyLevel(p33);
    expect(d).toBeLessThan(33);
    const a = { ...champ(33, 'a')[0]!, id: 'a' };
    expect(missionXpPreview([a], [a.id], p33, 100)[a.id]!.full).toBe(false);
    // …et un champion sous la difficulté, lui, est bien à plein tarif.
    const b = { ...champ(Math.max(1, d - 2), 'b')[0]!, id: 'b' };
    expect(missionXpPreview([b], [b.id], p33, 100)[b.id]!.full).toBe(true);
  });

  it('🔮 l’annonce suit le versement, avec ou sans le héros (2026-09-27)', () => {
    // ⚠️ RÉÉCRIT. v0.1109 : le héros ne prend plus de part. Depuis, SANS lui les champions
    // apprennent plus (`SOLO_XP_MULT`) — l'annonce doit le dire, dans les deux cas.
    const a = champ(10, 'a')[0]!;
    const b2 = { ...champ(10, 'b')[0]!, id: 'b' };
    const eq = [a, b2];
    const ids = [a.id, b2.id];
    for (const hero of [true, false])
      expect(missionXpPreview(eq, ids, p, 100, hero)[a.id]!.xp).toBe(
        missionXpFor(eq, p, true, {}, 100, hero)[a.id],
      );
    expect(missionXpPreview(eq, ids, p, 100, false)[a.id]!.xp).toBeGreaterThan(
      missionXpPreview(eq, ids, p, 100, true)[a.id]!.xp,
    );
  });

  it('⚠️ c’est bien CE calcul que la mission verse : le SOCLE est primé, pas les abattus', () => {
    const neuf = champ(1, 'neuf');
    const vieux = champ(poiDifficultyLevel(p), 'vieux');
    const socle = missionXp(neuf[0]!, p, true);
    // ⚠️ RÉÉCRIT (v0.1164) : les deux socles étaient identiques (ratio écrêté à 1). Le
    // danger est désormais payé : le neuf touche le socle du vieux × `dangerMult`.
    const d = poiDifficultyLevel(p);
    expect(socle).toBe(Math.round(trialXpBase(d) * dangerMult(1, d)));
    expect(missionXp(vieux[0]!, p, true)).toBe(Math.round(trialXpBase(d)));
    expect(missionXpFor(neuf, p, true, {}, 100, true).neuf).toBe(
      Math.round(socle * missionXpSplit(1) * catchUpMult(1, 100)),
    );
    expect(missionXpFor(vieux, p, true, {}, 100, true).vieux).toBe(
      Math.round(missionXp(vieux[0]!, p, true) * missionXpSplit(1) * catchUpMult(d, 100)),
    );
    // ⚠️ La part des ABATTUS passe TELLE QUELLE : `SKIRMISH.carryMargin`, le garde-fou
    // anti-portage, n'est pas défait.
    const avec = missionXpFor(neuf, p, true, { neuf: 40 }, 100).neuf!;
    const sans = missionXpFor(neuf, p, true, {}, 100).neuf!;
    expect(avec - sans).toBe(40);
  });

  it('⚠️ la RÉFÉRENCE est le PANTHÉON, pas le niveau du joueur', () => {
    // Un champion au plafond du Panthéon n'a plus de retard à combler : le multiplicateur
    // ne doit pas annoncer un gain que `grantAdvXp` refuserait de convertir.
    const au = champ(40);
    expect(missionXpFor(au, p, true, {}, 40, true).x).toBe(
      Math.round(missionXp(au[0]!, p, true) * missionXpSplit(1)),
    );
    expect(missionXpFor(au, p, true, {}, 100).x!).toBeGreaterThan(missionXp(au[0]!, p, true));
  });

  it('⚠️ elle S’ÉTEINT en rattrapant : aucun farm à garder un champion bas', () => {
    let prev = Infinity;
    for (const L of [1, 25, 50, 75, 99, 100]) {
      const v = missionXpFor(champ(L), p, true, {}, 100).x!;
      expect(v, `niveau ${L}`).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('⚠️ elle traverse le convoi : le rapport annonce ce que le champion recevra', () => {
    // La prime doit être DANS l'XP stockée (donc affichée), pas ajoutée au versement :
    // sinon le rapport dirait 166 et le champion en recevrait dix fois plus.
    const neuf = champ(1, 'neuf');
    const c = resolveCaravan(p, neuf, 4242, NUS, 100);
    expect(c.xp.neuf!).toBeGreaterThan(missionXp(neuf[0]!, p, true));
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
    // ⚠️ Sur la DIFFICULTÉ (v0.1107), pas sur `poi.level` : c’est ce que le champion
    // affronte réellement, nombre d’ennemis compris.
    const d = poiDifficultyLevel(p);
    expect(missionXp(refAdventurer(d), p, true)).toBe(Math.round(trialXpBase(d)));
  });
});

describe('⚠️ un convoi VOYAGE comme le héros', () => {
  // Le convoi est situé sur la carte par la MÊME fonction que le héros
  // (`travelPosition`) : deux copies de cette interpolation divergeraient à la
  // première retouche — c'est le piège des libellés de POI, déjà rencontré deux fois.
  // Une graine dont le trajet ATTEINT le lieu (un demi-tour est testé à part).
  const vanSeed = [7, 8, 9, 10, 11, 12, 13].find(
    (s) =>
      startCaravan('v', poi({ x: 60, y: 20 }), team(3), 0, s, NUS, 1, 20).turnBack === undefined,
  )!;
  const van = startCaravan('v1', poi({ x: 60, y: 20 }), team(3), 0, vanSeed, NUS, 1, 20);

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
    // 🔙 Rapporté aux JAMBES réellement parcourues : un demi-tour arrête la route, donc
    // l'escorte qui perd plus souvent à l'aller parcourt moins de jambes (et croise moins de
    // caches) — compter en absolu ferait passer l'éclaireur pour un fabricant de caches.
    const compte = (team: Adventurer[]) => {
      let cache = 0;
      let amb = 0;
      let legs = 0;
      for (let i = 1; i <= 3000; i++) {
        const o = resolveCaravan(poiOf(false), team, i * 7919, NUS, aJour(team));
        cache += o.events.filter((e) => e.kind === 'cache').length;
        amb += o.events.filter((e) => e.kind === 'bandits').length;
        legs += o.events.length - (o.turnBack !== undefined ? 1 : 0);
      }
      return { cache: cache / legs, amb: amb / legs };
    };
    const nu = compte(sans());
    const eclaire = compte(beaucoup());
    expect(eclaire.amb).toBeLessThan(nu.amb);
    // Les caches ne DOIVENT PAS augmenter (tolérance de bruit d’échantillonnage).
    expect(eclaire.cache).toBeLessThanOrEqual(nu.cache * 1.05);
  });

  it('une route dangereuse reste plus risquée, éclaireurs ou pas', () => {
    expect(ambushChance(poiOf(true), beaucoup())).toBeGreaterThan(
      ambushChance(poiOf(false), sans()),
    );
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
    // ⚠️ Sur une MINE DE MANA (v0.1210) : les pierres d'un sanctuaire sont passées à 20 % pour
    // une équipe, si peu que le +30 % disparaissait dans l'arrondi. Le mana reste plein.
    const p = poi({ type: 'mana_mine', level: 40 });
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
        aJour([caravanier()]),
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
        aJour([caravanier()]),
      );
      if (avec.events.some((e) => e.kind === 'bandits')) continue;
      vus++;
      // ⚠️ La cargaison se lit sur le MANA d'une mine de mana, plus sur l'or : depuis la
      // v0.1161 l'or d'une équipe est celui du héros (`harvestGold`), que la cargaison ne
      // gonfle pas. Il doit donc rester ÉGAL entre les deux voyages.
      expect(avec.mana, `graine ${s}`).toBeGreaterThan(sans.mana);
      expect(avec.gold, `graine ${s}`).toBe(sans.gold);
    }
    expect(vus, 'aucun voyage sans embuscade : le test ne prouve rien').toBeGreaterThan(5);
  });

  it('⚠️ une Longue-vue portée raccourcit le trajet, sous le plafond de vitesse', () => {
    const p = poi();
    const esc = [{ ...refAdventurer(20, 1), id: 'e' }];
    const base = caravanLegMin(p, esc, 0, 1);
    expect(caravanLegMin(p, esc, 0.1, 1)).toBeLessThan(base);
    expect(caravanLegMin(p, esc, 99, 1)).toBe(caravanLegMin(p, esc, CARAVAN.speedMax, 1));
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
    const avec = startCaravan(
      'c',
      p,
      [{ ...e, gear: { accessory: 'lv' } }],
      0,
      7,
      road([lv]),
      1,
      e.level,
    );
    const sans = startCaravan('c', p, [e], 0, 7, road([]), 1, e.level);
    expect(avec.midAt).toBeLessThan(sans.midAt);
  });
});

describe('🚫 plus aucun équipement de champion sur la route (v0.1012)', () => {
  it('une embuscade repoussée ne laisse plus de pièce : elles ne viennent que du tirage', () => {
    const escort = [0, 1, 2].map((i) => refChampionAdv(40, i));
    let gagnees = 0;
    for (let s = 1; s <= 300; s++) {
      const o = resolveCaravan(
        poi({ level: 40, perilous: true }),
        escort,
        s,
        { advGear: [] },
        aJour(escort),
      );
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
    const o = resolveCaravan(
      poi({ level: 40, perilous: true }),
      escort,
      8,
      { advGear: [] },
      aJour(escort),
    );
    // ⚠️ v0.1166 : un puits n'a plus d'or à lui (l'or vient des bourses de ses gardes bandits).
    expect(o.gold).toBe(0); // avant : 938 — v0.1161 : part d’or hors mine unifiée à 0,35 (`HARVEST.goldShare`, 804 × 0,35 / 0,3). v0.1153 : l’or suit la DIFFICULTÉ du lieu (996 à son niveau brut). v0.1120 : 2ᵉ embuscade perdue (bonus d’'ascension), cf. plus bas. Une SOURCE depuis que l’épave est retirée (v0.999) : 1758 × 30/26, le coût d’un puits
    // 🔙 2026-09-29 : la 1re embuscade (ALLER) est perdue → demi-tour, rien de récolté (avant : 12).
    expect(o.turnBack).toBeCloseTo(1 / 3, 6);
    expect(o.energy).toBe(0); // avant le demi-tour : 12 — v0.1210 : 20 % de l'énergie du héros (v0.1201 : 30, v0.1189 : 61)
    expect(o.summonStones).toBe(0);
    // ⚠️ Le lieu est une SOURCE depuis le retrait de l'épave (v0.999) : l'or suit son coût et
    // l'énergie apparaît. Tout le reste (clés, XP, blessé, journal) est inchangé au
    // chiffre près — c'est ce qui prouve que le flux aléatoire n'a pas fuité. Une seule valeur qui bouge dit « un réglage » ; toutes qui bougent disent
    // « le flux a fuité » — c'est cette distinction que le test existe pour rendre lisible.
    expect('scrap' in o).toBe(false);
    expect(o.keys).toBe(0);
    // ⚠️ Les valeurs de CARGAISON ci-dessus sont celles d'avant le combat de groupe, au
    // chiffre près : le groupe n'est qu'une lecture du combat fondu, et `deriveSkirmish` ne
    // lit pas `rng`. Seules l'XP (socle + part des abattus) et le blessé (le PREMIER tombé
    // de l'embuscade perdue, plus une victime tirée) ont changé.
    // ⚠️ v0.996 : les champions n'ont plus de compagnon, compensé en stats (`CHAMPION_SOLO`).
    // Seule la RÉPARTITION des abattus bouge (3/1/1 → 2/2/1, un tombé de moins en 2ᵉ jambe) :
    // la cargaison, l'XP et le blessé sont identiques — le flux aléatoire n'a pas fui.
    // v0.1014 : une embuscade perdue → socle de DÉFAITE (70 → 35) + la même part des abattus (23).
    // v0.1107 : le socle lit la DIFFICULTÉ (niveau des ennemis ET leur nombre) au lieu du
    // niveau de récompense, et le partage est strict dès le 1er membre — 58 → 47. ⚠️ Ce
    // qui compte ici n'a PAS bougé d'un chiffre : la cargaison ci-dessus. L'XP n'en est
    // que le témoin.
    // v0.1120 : +5 % de stats par rang ouvert, appliqué AUSSI à l'étalon — même graine, même
    // flux, mais la 2ᵉ embuscade bascule en défaite (issue d'un combat, pas une fuite de flux).
    // 2026-09-27 : un convoi part sans le héros, son socle porte `SOLO_XP_MULT` — 43 → 49.
    // 2026-09-27 : l'équipement des champions vaut celui du héros (`ADV_GEAR.k` 1), donc
    // l'équipe de référence (`REF_POWER`) est plus forte et le même lieu se lit à une
    // DIFFICULTÉ plus basse — le socle d'XP suit, 49 → 41. L'escorte de ce test est NUE face à
    // des bandits calés sur une escorte équipée, et la route dangereuse passe de ×1,35 à ×1,4 :
    // elle abat un bandit de moins par embuscade (abattus 1/1/2 → 0/1/1). La CARGAISON, les
    // blessés et l'ordre des chutes sont identiques — le flux aléatoire n'a pas fui.
    // 🔙 2026-09-29 : demi-tour dès la 1re embuscade — la route s'arrête là. La 1re jambe est
    // IDENTIQUE à avant (mêmes chutes, même blessé) : le flux n'a pas fui, la route est
    // simplement plus courte. XP 41 → 36 (une embuscade abattue de moins).
    expect(o.xp).toEqual({ ref0: 36, ref1: 36, ref2: 36 });
    expect(o.kills).toEqual({ ref0: 0, ref1: 0, ref2: 1 });
    expect(o.hurt).toEqual(['ref1']);
    expect(o.events[0]!.down).toEqual(['ref1', 'ref2', 'ref0']);
    expect(o.events.map((e) => [e.slain, e.down?.length])).toEqual([
      [1, 3],
      [undefined, undefined],
    ]);
    expect(o.events.map((e) => e.kind)).toEqual(['bandits', 'demitour']);
    expect(o.events.map((e) => e.won)).toEqual([false, undefined]);
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
