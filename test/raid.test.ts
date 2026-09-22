import { describe, it, expect, afterEach } from 'vitest';
import { buildingUpgradeCost } from '@/lib/buildings';
import {
  rollRaid,
  raidSize,
  levelSpanFor,
  raidIntervalMs,
  scoutLeadMs,
  scoutClarity,
  scoutReport,
  baseCombatant,
  groupCombatant,
  earlyThreatMult,
  resolveRaid,
  guardUnits,
  rampartGuard,
  adventurerPowers,
  siegeXp,
  raidDamage,
  corpsesFrom,
  lootCorpses,
  advanceBase,
  applyRaidOutcome,
  battleLootPills,
  emptyBase,
  retireKennel,
  raidsEnabled,
  defenseReadiness,
  scavengerCount,
  scavengeMs,
  advanceScavenging,
  pickScavengeTargets,
  turretCount,
  repairCost,
  defenseUpgradeCost,
  SCRAP_TO_GOLD,
  TURRET_SLOTS,
  RAID,
  startRepair,
  settleRepairs,
  finishRepairNow,
  rushRepairCost,
  repairMsFor,
  isRepairing,
  totalRepairCost,
  raidThreatSize,
  type RaidReport,
  type BattleField,
  defensePerLevelLabel,
  fmtSpan,
  DEFENSE_TYPES,
  type DefenseId,
  woundMsFor,
  woundRemainingMs,
  heroAvailable,
  healCost,
  isWounded,
  WOUND_MAX_MS,
  SCAV,
  FACTION_PROFILE,
  type BaseState,
  type DefenseStructure,
  type RaidFaction,
  groupKind,
  siegeWallOf,
  siegeDefenders,
  skillMults,
  siegeAttackers,
  siegeHurtIds,
  advHurtMs,
  advHealCost,
  woundedAdventurers,
} from '@/lib/raid';

/** Places de garnison pour les tests courts — ce que le repli implicite rendait
 *  autrefois. ⚠️ La valeur est désormais TOUJOURS explicite : c'est ce repli qui avait
 *  permis au store de ne compter que 3 familiers pendant que l'écran en affichait 6. */
import { refFighter, gearExpect } from '@/lib/proceduralContent';
import {
  rankCeilingForLevel,
  prestigeRankIndex,
  RANK_ORDER,
  RARITY_MULT,
  RARITY_LABEL,
  rarityRank,
  rollFamiliar,
  famXpForLevel,
  familiarMult,
  famXp,
  famLevel,
  grantFamiliarXp,
  type Item,
} from '@/lib/items';
import { combatPower, offenseOf, survivalOf, type Combatant } from '@/lib/combat';
import { CHAMPIONS } from '@/data/champions';
import { talentTierFloor, type TalentInstance } from '@/lib/talents';
import { BATTLE, simulateSiege } from '@/lib/siegeBattle';
import { PROMO_LEVELS, engageCap, type Adventurer } from '@/lib/adventurers';
import { refChampionAdv, escortCombatant } from '@/lib/caravan';
import { FAMILIAR_SPECIES } from '@/data/familiars';

const H = 3600_000;

function defs(wall: number, turret: number, watch = 0): DefenseStructure[] {
  const d: DefenseStructure[] = [
    { typeId: 'wall', level: wall },
    { typeId: 'turret', level: turret },
  ];
  if (watch) d.push({ typeId: 'watchtower', level: watch });
  return d;
}

function hero(L: number): Combatant {
  const f = refFighter(L);
  const ge = gearExpect(L);
  return { ...f, damage: Math.round(f.damage * ge.off), pv: Math.round(f.pv * ge.pv) };
}

/** Un vivier plausible : les lignées de référence (mêlée, agile, civile), PROMUES au
 *  rythme du jeu, à des niveaux proches de celui du joueur.
 *  ⚠️ RÉÉCRIT (v0.801). Il portait une seule lignée guerrière figée à TROIS classes quel
 *  que soit le niveau : au niveau 100 le vivier du test valait trois strates quand un
 *  vrai joueur en a huit. Mesuré, base pleine avec héros : 64 % avec l’ancien vivier
 *  contre 88 % avec un vivier promu — le garde-fou du plafond mesurait un joueur qui
 *  n’existe pas, et tant que la cour ne décidait rien ça ne se voyait pas. */
function rosterOf(playerLevel: number): Adventurer[] {
  return Array.from({ length: engageCap(playerLevel) }, (_, i) => ({
    ...refChampionAdv(Math.max(1, playerLevel - (i % 6)), i),
    id: `a${i}`,
    name: `A${i}`,
    seed: i + 1,
  }));
}
function holdRate(
  playerLevel: number,
  defLevel: number,
  heroHome: boolean,
  n = 200,
  /** ⚠️ VIDE PAR DÉFAUT, et c’est volontaire : la plupart des invariants mesurent
   *  l’ENCEINTE SEULE. Y glisser une garnison changerait ce qu’ils verrouillent. */
  advs: Adventurer[] = [],
): number {
  let held = 0;
  for (let i = 0; i < n; i++) {
    const raid = rollRaid(i * 7919 + 13, playerLevel, 0, 0);
    const base = {
      defenses: defs(defLevel, defLevel),
      playerLevel,
      hero: heroHome ? hero(playerLevel) : null,
      guard: guardUnits(playerLevel, advs, 99, {
        now: 0,
        kennelLevel: defLevel,
        familiars: [],
        talents: [],
        advGear: [],
      }),
    };
    if (resolveRaid(base, raid, 0, heroHome).held) held++;
  }
  return (held / n) * 100;
}

describe('composition de l’armée', () => {
  it('aligne plusieurs groupes de NIVEAUX DIFFÉRENTS, champion en dernier', () => {
    for (let s = 1; s < 60; s++) {
      const r = rollRaid(s * 31 + 7, 26, 0, 0);
      expect(r.groups.length).toBeGreaterThanOrEqual(RAID.minGroups);
      expect(r.groups.length).toBeLessThanOrEqual(RAID.maxGroups);
      const champs = r.groups.filter((g) => g.champion);
      expect(champs).toHaveLength(1);
      expect(r.groups[r.groups.length - 1]!.champion).toBe(true);
      // Le champion domine sa troupe : c'est le point culminant du siège.
      const troopMax = Math.max(...r.groups.filter((g) => !g.champion).map((g) => g.level));
      expect(r.level).toBeGreaterThan(troopMax);
    }
  });

  it('reste dans la fenêtre [niveau, niveau + span], qui croît MOINS VITE que le joueur', () => {
    // Un écart FIXE ne peut pas marcher aux deux bouts. Mesuré dans les deux sens : à
    // +15 fixe, un joueur de niveau 10 tenait 0 % de ses sièges et un niveau 90 en tenait
    // 96 % (le siège s'éteignait) ; à 60 % du niveau, le niveau 90 tombait à 40 % même en
    // bâtissant à son niveau. La fenêtre doit donc grandir, mais sous-linéairement.
    expect(levelSpanFor(10)).toBeLessThan(levelSpanFor(26));
    expect(levelSpanFor(26)).toBeLessThan(levelSpanFor(90));
    // Sous-linéaire : elle représente une part DÉCROISSANTE du niveau.
    expect(levelSpanFor(90) / 90).toBeLessThan(levelSpanFor(26) / 26);
    // …et reste bornée : jamais une armée deux fois au-dessus du joueur.
    for (const L of [1, 12, 26, 60, 100]) expect(levelSpanFor(L)).toBeLessThan(L + 10);
    for (const L of [12, 26, 60]) {
      for (let s = 1; s < 40; s++) {
        const r = rollRaid(s * 977, L, 0, 0);
        for (const g of r.groups) {
          expect(g.level).toBeGreaterThanOrEqual(L);
          expect(g.level).toBeLessThanOrEqual(L + levelSpanFor(L));
        }
      }
    }
  });

  it('est déterministe : même graine → même armée', () => {
    expect(rollRaid(4242, 26, 1000, 0)).toEqual(rollRaid(4242, 26, 1000, 0));
  });
});

describe('silhouette de faction', () => {
  it('les bêtes sont bien PLUS NOMBREUSES que les bandits', () => {
    expect(raidSize(26, 'betes')).toBeGreaterThan(raidSize(26, 'bandits') * 2);
    expect(raidSize(26, 'mortsvivants')).toBeGreaterThan(raidSize(26, 'bandits'));
  });

  it('… sans être plus DANGEREUSES : la masse est conservée', () => {
    // C'est l'invariant qui autorise une horde de 20 bêtes à côtoyer une bande de 8
    // brigands sans dérégler la difficulté (l'effectif pèse en puissance 1,5 sur les
    // dégâts encaissés). countMult × unitMult doit rester ≈ 1.
    for (const f of Object.keys(FACTION_PROFILE) as RaidFaction[]) {
      const p = FACTION_PROFILE[f];
      expect(p.countMult * p.unitMult).toBeGreaterThan(0.9);
      expect(p.countMult * p.unitMult).toBeLessThan(1.1);
    }
    const rates: Record<string, number> = {};
    for (const f of Object.keys(FACTION_PROFILE) as RaidFaction[]) {
      let held = 0;
      let n = 0;
      for (let i = 0; i < 900; i++) {
        const raid = rollRaid(i * 7919 + 13, 26, 0, 0);
        if (raid.faction !== f) continue;
        n++;
        if (
          resolveRaid({ defenses: defs(26, 26), playerLevel: 26, hero: null }, raid, 0, false).held
        )
          held++;
      }
      rates[f] = (held / n) * 100;
    }
    const vals = Object.values(rates);
    // ⚠️ SEUIL 13 → 7, ET LA CAUSE A ÉTÉ TRAITÉE, pas contournée (v0.788). Les deux
    // fuites que ce seuil relâché signalait sont réparées : le feu ne se perd plus dans
    // un cadavre (`volley`) et la place au pied du mur ne double-compte plus la racine
    // de l'effectif (`bulk = unitMult`). Mesuré ici même : **12,06 → 4,10**.
    // ⚠️ PUIS 7 → 12 (v0.801), et cette fois ce n'est PAS une fuite — la mesure du rempart
    // juste en dessous le prouve. Les engins de siège placent l'usure MOYENNE du mur pile
    // sur le seuil de brèche (`breachAt`), là où un point d'usure en plus devient un
    // point de brèche en plus : mesuré, brèche 53/62/55 % et tenue 47/38/45 pour une
    // part de rempart emportée de 57,9/60,4/58,4 %. L'écart RELATIF de menace passe au
    // contraire de 14 % à **4 %** — les factions n'ont jamais été aussi égales, c'est
    // l'instrument qui amplifie. Mesuré : **9,7**.
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThan(12);

    // ⚠️ ET SURTOUT : LA TENUE EST UN MAUVAIS INSTRUMENT POUR CETTE PROPRIÉTÉ.
    // C'est une PROBABILITÉ, donc elle sature aux deux bouts — l'écart mesuré n'est même
    // pas monotone en arc de tir (8,5 · 12,1 · 7,4 · 2,6 pour les arcs 0 à 3) : il est
    // maximal au milieu de la courbe, c'est-à-dire précisément dans le régime
    // intéressant. Un tel test donne donc son meilleur satisfecit quand le jeu est le
    // plus plat, ce qui est l'inverse de ce qu'on veut.
    // On mesure donc AUSSI la menace pour ce qu'elle est : LA PART DE REMPART EMPORTÉE,
    // qui ne sature pas. ⚠️ C'est ELLE qui a révélé que la propriété était largement
    // violée (51,6 % d'écart relatif) alors que la tenue n'en montrait presque rien —
    // et c'est elle qui a servi de boussole au chantier de la v0.788. Mesurée
    // aujourd'hui : **11,8 %**. Le seuil descend donc de 0,60 à 0,20.
    const emporte = Object.keys(FACTION_PROFILE).map((f) => {
      let somme = 0;
      let n = 0;
      for (let i = 0; i < 900; i++) {
        const raid = rollRaid(i * 7919 + 13, 26, 0, 0);
        if (raid.faction !== f) continue;
        n++;
        const mur = siegeWallOf(defs(26, 26), 26);
        const r = simulateSiege(
          siegeAttackers(raid),
          siegeDefenders(defs(26, 26), 26, null),
          mur,
          i + 1,
        );
        somme += 1 - r.wallPv / mur.maxPv;
      }
      return somme / n;
    });
    const moyen = emporte.reduce((a, b) => a + b, 0) / emporte.length;
    // ⚠️ RESSERRÉ 0,20 → 0,10 (v0.801) en même temps que le seuil de tenue se relâchait :
    // c'est cette mesure-ci qui porte la propriété, elle doit donc serrer d'autant plus
    // que l'autre desserre. Relâcher la tenue sans resserrer le rempart aurait été
    // renoncer à la garantie.
    expect((Math.max(...emporte) - Math.min(...emporte)) / moyen).toBeLessThan(0.1);
  });

  it('⚠️ TOUT l’effectif repoussé est dépouillé, quelle que soit la silhouette', () => {
    // ⚠️ RÉÉCRIT. Il vérifiait que la fouille par vagues rattrapait la masse avant que
    // les corps ne pourrissent (« 100 cadavres pour 3 fouilleurs serait frustrant »).
    // La fouille étalée a disparu : le butin est crédité À LA RÉSOLUTION (demandé). La
    // propriété qu'il gardait, elle, survit entièrement — une horde de bêtes ne doit pas
    // rendre MOINS qu'une bande de brigands du seul fait d'être nombreuse et diluée.
    for (const L of [15, 26, 50, 100]) {
      const raid = rollRaid(31337, L, 0, 0);
      const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
      expect(corpses, `niveau ${L}`).toHaveLength(raidSize(L, raid.faction));
      const loot = lootCorpses(corpses, raid.faction, L, 1, []);
      expect(loot.gold, `niveau ${L}`).toBeGreaterThan(0);
    }
  });
});

describe('chaque armée sait répondre au feu', () => {
  it('⚠️ AUCUNE faction ne marche sans un seul tireur', () => {
    // Un corps à corps ne peut que cogner le mur : une faction 100 % mêlée ne peut
    // JAMAIS réduire une baliste au silence, quelle que soit sa masse. Mesuré avant
    // correctif : les bêtes, seule faction sans espèce à distance, tenaient le joueur en
    // échec 0 % du temps — un tiers du bestiaire rendu décoratif.
    const vus = new Set<RaidFaction>();
    for (let i = 0; i < 400; i++) {
      for (const L of [5, 26, 90]) {
        const raid = rollRaid(i * 7919 + 3, L, 0, 0);
        vus.add(raid.faction);
        expect(raid.groups.some((g) => groupKind(g) === 'ranged')).toBe(true);
      }
    }
    // ⚠️ Le balayage doit avoir VU les trois factions, sinon il n'affirme rien sur
    // celles qu'il a manquées.
    expect(vus.size).toBe(Object.keys(FACTION_PROFILE).length);
  });

  it('un groupe sans type déclaré est lu au CORPS À CORPS', () => {
    // Les raids écrits avant la v0.754 n'en portent pas. Le repli doit être le cas
    // PRUDENT : « tireur » ferait apparaître des archers là où il n'y en a jamais eu.
    const raid = rollRaid(42, 26, 0, 0);
    const sansType = { ...raid.groups[0]!, kind: undefined };
    expect(groupKind(sansType)).toBe('melee');
  });
});

describe('calibration du siège', () => {
  it('bâtir à son niveau et DÉFENDRE tient le plus souvent ; négliger ses murs se paie', () => {
    // ⚠️ RÉÉCRIT (v0.801), et c'est un CHANGEMENT DE DOCTRINE validé par l'utilisateur, pas
    // un relâchement. Il affirmait qu'une enceinte SEULE, sans héros ni garnison, tient le
    // plus souvent. C'était précisément le défaut : la brèche ne s'ouvrait que dans un tiers
    // des sièges, donc les pierres gagnaient seules et le vivier ne pesait rien. Avec les
    // engins de siège, une enceinte seule tient **35 à 48 %** (mesuré aux niveaux 12 à 100)
    // — c'est le HÉROS et la GARNISON qui transforment ça en victoire probable.
    // ⚠️ RE-CADRÉ (v0.829), pas relâché : entre les niveaux 6 et 26 l'armée est RENFORCÉE à
    // la demande de l'utilisateur (« durcir un peu avant le niveau 16 »). Le héros seul y
    // tient 30-50 % — c'est voulu, c'est le VIVIER qui doit faire gagner (dernier test).
    for (const L of [26, 40, 60, 90]) {
      expect(holdRate(L, L, true), `niveau ${L}, défenses à niveau + héros`).toBeGreaterThan(50);
      expect(holdRate(L, L, true), `niveau ${L}, le héros compte`).toBeGreaterThan(
        holdRate(L, L, false),
      );
      expect(holdRate(L, L - 5, false), `niveau ${L}, défenses en retard`).toBeLessThan(
        holdRate(L, L, false),
      );
    }
    for (const L of [15, 20]) {
      expect(
        holdRate(L, L, true, 200, rosterOf(L)),
        `niveau ${L}, défenses + héros + vivier`,
      ).toBeGreaterThan(75);
      expect(holdRate(L, L, true), `niveau ${L}, le héros compte`).toBeGreaterThan(
        holdRate(L, L, false),
      );
      // ⚠️ On ne teste PLUS un scénario « sur-investi » (défenses au-dessus du niveau du
      // joueur) : il est inatteignable en jeu — `upgradeDefense` refuse de dépasser ton
      // niveau, exactement comme les bâtiments. Bâtir À son niveau EST le maximum.
    }
    // ⚠️ ~3 s seul (des milliers de sièges, vivier compris depuis la v0.829) : sous la
    // charge de la suite complète il dépassait les 5 s par défaut. Un délai explicite,
    // pas un test allégé — il mesure ce qu’il doit mesurer.
  }, 30_000);

  it('la défense DÉGRADE en pente, pas en falaise', () => {
    // Calculée sur le refFighter de la STRUCTURE, l'enceinte payait l'écart de façon
    // exponentielle (l'offense d'un refFighter croît en ~L⁴) : mesuré, 0 % de tenue
    // jusqu'à 19, 24 % à 22, 78 % à 26 — une falaise. Elle vaut désormais une FRACTION
    // de ce que le niveau du joueur justifie, donc une enceinte à moitié montée vaut
    // à peu près la moitié.
    const L = 26;
    // ⚠️ LA FORME se mesure sur l'ENCEINTE SEULE : c'est une propriété de géométrie
    // (la part du niveau, `share`), et la vérifier sans garnison est exactement ce que
    // la v0.672 a corrigé. Monotone, et sans marche d'escalier.
    const demi = holdRate(L, Math.round(L * 0.5), true);
    const troisQuarts = holdRate(L, Math.round(L * 0.75), true);
    const plein = holdRate(L, L, true);
    expect(troisQuarts).toBeGreaterThan(demi);
    expect(plein).toBeGreaterThan(troisQuarts);
    expect(plein - troisQuarts).toBeLessThan(45);

    // ⚠️ MAIS « ON A UNE VRAIE CHANCE » SE MESURE AVEC SA GARNISON — RE-CADRÉ, PAS
    // RELÂCHÉ. Ce plancher datait de la v0.672 ; les aventuriers ne tiennent la brèche
    // que depuis la v0.777. Il jugeait donc une configuration que le jeu n'attend plus,
    // et il est entré en tension DIRECTE avec « le vivier doit peser » : élargir la
    // brèche fait par construction payer l'ABSENCE de garnison, donc le seul moyen de
    // rendre le vivier décisif était de faire tomber ce chiffre-là.
    // Mesuré à mi-enceinte : **46,9 % avec le vivier**, 11,9 % sans — et la valeur avec
    // garnison ne bouge quasiment pas quand la brèche s'élargit (49,6 à la largeur 4,
    // 45,4 à la largeur 10). La promesse tient là où elle a un sens.
    const demiAvecVivier = holdRate(L, Math.round(L * 0.5), true, 260, rosterOf(L));
    expect(demiAvecVivier, 'à moitié montée AVEC sa garnison').toBeGreaterThan(30);
    // ⚠️ ET SANS GARNISON, C'EST LA GARNISON QUI MANQUE — RÉÉCRIT (v0.801). Il exigeait
    // qu'une enceinte à moitié montée et vide garde une chance (> 6 %). Depuis que la
    // brèche s'ouvre souvent et qu'une cour vide cède en trois tours, elle n'en a plus
    // (mesuré 0 à 2 %), et c'est la doctrine choisie : l'écart entre les deux EST ce que
    // la garnison apporte. On verrouille donc cet écart, qui ne peut pas se lire à zéro.
    expect(
      demiAvecVivier - demi,
      'à moitié montée, la garnison fait la différence',
    ).toBeGreaterThan(20);
  });

  it('⚠️ LE VIVIER PÈSE : recruter et élever change l’issue, pas seulement le décor', () => {
    // ⚠️ RIEN ne testait cette propriété — et elle était quasi FAUSSE. Le goulot de la
    // brèche ne bornait qu’un camp : quatre hommes entraient, et tout le vivier leur
    // tombait dessus. Mesuré, la garnison ne valait que **+5 points** de tenue, pour un
    // système qu’on nourrit pendant des semaines (recrutement, promotions, compagnons,
    // talents). C’est exactement le genre de promesse creuse qu’un aperçu honnête rend
    // visible — et qu’aucune porte ne voyait.
    //
    // ⚠️ Ce test verrouille « le vivier COMPTE », **pas une largeur de brèche** — et le
    // seuil est bas EXPRÈS. Mesuré sur 400 tirages : l’apport vaut **+10,8 à la largeur
    // 7 contre +6,0 à la largeur 2**, soit 4,8 points d’écart pour un bruit de ~3,5 sur
    // une différence de deux proportions. Resserrer le plancher pour attraper un
    // rétrécissement rendrait le test INSTABLE — on préfère une borne franche et vraie à
    // une borne serrée qui rougit au hasard.
    // Ce qui garde la largeur à son PLAFOND, c’est l’iso-menace entre factions (15,2
    // pour un seuil de 13 dès la largeur 8).
    for (const lvl of [26, 50]) {
      const avec = holdRate(lvl, lvl, true, 260, rosterOf(lvl));
      const sans = holdRate(lvl, lvl, true, 260);
      expect(avec, `niveau ${lvl}`).toBeGreaterThan(sans + 3);
    }
  });

  describe('🐾 LE CHENIL EST RETIRÉ, SON INVESTISSEMENT RENDU EN OR (v0.996 → v0.1005)', () => {
    // Familiers et talents sont réservés au héros : le Chenil n'avait plus aucun effet.
    // ⚠️ On rend ce qui a été PAYÉ : l'ancienne courbe de l'enceinte (28 × L^1,9 en or,
    // 6 + L^1,45 en ferraille) — pas la courbe des bâtiments qu'elle a rejointe en v0.998,
    // ×32 plus chère. La ferraille, retirée, est convertie au taux du retrait.
    const avec = (lvl: number) => ({
      ...emptyBase(1, 0),
      defenses: [
        { typeId: 'wall' as const, level: 12 },
        { typeId: 'kennel' as unknown as 'wall', level: lvl },
      ],
    });
    const paye = (lvl: number) => {
      let or = 750;
      for (let l = 1; l < lvl; l++) {
        or += Math.round(28 * Math.pow(l, 1.9));
        or += Math.round(6 + Math.pow(l, 1.45)) * SCRAP_TO_GOLD;
      }
      return or;
    };
    it('rend la pose et chaque cran, au prix PAYÉ, ferraille convertie', () => {
      for (const lvl of [1, 2, 17, 32])
        expect(retireKennel(avec(lvl)).gold, `niveau ${lvl}`).toBe(paye(lvl));
    });
    it('⚠️ bien SOUS le prix actuel : on ne rembourse pas au tarif d’aujourd’hui', () => {
      let actuel = 750;
      for (let l = 1; l < 32; l++) actuel += defenseUpgradeCost(l);
      expect(retireKennel(avec(32)).gold).toBeLessThan(actuel / 5);
    });
    it('retire le Chenil et garde le reste de l’enceinte', () => {
      expect(retireKennel(avec(9)).base.defenses).toEqual([{ typeId: 'wall', level: 12 }]);
    });
    it('⚠️ IDEMPOTENT : sans Chenil, rien n’est rendu et la base est la MÊME référence', () => {
      const b = { ...emptyBase(1, 0), defenses: [{ typeId: 'wall' as const, level: 12 }] };
      const r = retireKennel(b);
      expect(r.base).toBe(b);
      expect(r.gold).toBe(0);
      expect(retireKennel(retireKennel(avec(5)).base).gold).toBe(0);
    });
  });

  it('💰 l’enceinte suit la MÊME courbe d’or que les bâtiments de la cour (v0.998)', () => {
    // RÉÉCRIT. Il garantissait l'inverse — une courbe DÉDIÉE (coefficient ÷50) plus un
    // second verrou en ferraille. La ferraille retirée, l'utilisateur a tranché : « que les
    // bâtiments aient le même coût d'or ». Une seule courbe, donc un seul endroit à régler ;
    // la profondeur du puits commun (11 structures) est mesurée par `goldSink.test`.
    for (const l of [1, 5, 12, 26, 50, 100])
      expect(defenseUpgradeCost(l), `niveau ${l}`).toBe(buildingUpgradeCost(l));
    expect(defenseUpgradeCost(20)).toBeGreaterThan(defenseUpgradeCost(5)); // strictement croissant
  });

  it('🔧 RÉPARER reste bon marché : une part d’un cran, jamais une punition', () => {
    // Remettre en état après un siège perdu ne doit pas rouvrir la spirale que tout le
    // système de siège évite. Mesuré : ~⅙ de journée de revenu (donjons + mines) pour le
    // mur, à tout niveau — le pire cas (mur + tourelles + tour) reste sous la journée.
    for (const l of [5, 26, 60, 100]) {
      expect(repairCost(l)).toBe(Math.round(buildingUpgradeCost(l) * RAID.repairShare));
      expect(repairCost(l) * 3).toBeLessThan(buildingUpgradeCost(l) * 0.2);
    }
    expect(repairCost(40)).toBeGreaterThan(repairCost(10));
  });

  it('🔩 LA FERRAILLE est retirée : la réserve est rachetée en or, au taux de l’épave', () => {
    // Un compte qui en avait ne doit rien perdre : `SCRAP_TO_GOLD` la convertit une fois.
    // Taux calé sur l'épave au niveau 30 (mesuré 36 / 104 / 177 aux niveaux 10 / 30 / 60).
    expect(SCRAP_TO_GOLD).toBeGreaterThan(30);
    expect(SCRAP_TO_GOLD).toBeLessThan(180);
    for (const t of DEFENSE_TYPES) expect('buildScrap' in t).toBe(false);
  });

  it('⚠️ UNE BASE PLEINEMENT INVESTIE N’EST JAMAIS CERTAINE', () => {
    // ⚠️ RIEN NE BORNAIT LE HAUT, et c'est ce que l'utilisateur a signalé (« les attaques
    // de bases semblent imprenables »). Tous les invariants voisins bornent par le BAS
    // (« on tient le plus souvent ») ou mesurent une base NUE ; aucun ne regardait le cas
    // réel — enceinte à niveau, héros présent, vivier complet — où l'on mesurait
    // **100/99/92/91/94 %** aux niveaux 12/28/50/80/100. Passé le milieu de partie, on ne
    // perdait plus jamais.
    //
    // ⚠️ LE DÉBUT DE PARTIE EN EST EXEMPT, et délibérément : au niveau 12 le joueur vient
    // d'ouvrir le système (`unlockLevel` 3, `enableShare` 0,85) et son enceinte à niveau
    // écrase encore des armées à peine plus fortes que lui. Le borner là forcerait à
    // durcir une rampe qui sert précisément à apprendre.
    for (const L of [50, 80, 100]) {
      const plein = holdRate(L, L, true, 200, rosterOf(L));
      expect(plein, `niveau ${L}, tout investi`).toBeLessThan(92);
      // …mais ça reste largement payant : c'est un plafond, pas un nerf du vivier.
      expect(plein, `niveau ${L}, tout investi`).toBeGreaterThan(70);
    }
  }, 30_000); // lourd : ~3 s seul, dépassait 5 s sous la charge de la suite

  it('la difficulté ne s’ÉTEINT PAS en fin de partie', () => {
    // Le défaut d'un écart de niveau FIXE : mesuré, la tenue à défenses-à-niveau montait
    // de 57 % (niveau 15) à 96 % (niveau 60) — passé un cap, on ne perdait plus jamais et
    // le système cessait d'exister. La fenêtre qui s'élargit maintient la tension.
    const late = [40, 60, 90].map((L) => holdRate(L, L, false));
    for (const v of late) expect(v).toBeLessThan(85);
    // Et sur-investir ne doit pas non plus rendre la fin de partie triviale.
    expect(holdRate(90, 93, false)).toBeLessThan(92);
  });

  it('le héros présent AIDE nettement, sans rendre l’enceinte inutile', () => {
    // Sa présence doit transformer un siège serré en victoire probable. Si elle suffisait
    // à tout tenir, l'investissement dans les murs n'aurait plus de sens.
    for (const L of [20, 26, 40]) {
      expect(holdRate(L, L - 5, true)).toBeGreaterThan(holdRate(L, L - 5, false));
    }
    expect(holdRate(26, 5, true), 'héros seul, sans enceinte digne de ce nom').toBeLessThan(60);
  });

  it('une structure endommagée est DIMINUÉE, jamais annulée (anti-spirale)', () => {
    // Le piège : mur hors service → base sans PV → défaite suivante certaine → nouveaux
    // dégâts. Une défense fendue doit laisser une vraie chance de s'en sortir.
    const broken: DefenseStructure[] = [
      { typeId: 'wall', level: 26, damaged: true },
      { typeId: 'turret', level: 26 },
    ];
    let held = 0;
    for (let i = 0; i < 200; i++) {
      const raid = rollRaid(i * 7919 + 13, 26, 0, 0);
      if (resolveRaid({ defenses: broken, playerLevel: 26, hero: hero(26) }, raid, 0, true).held)
        held++;
    }
    expect((held / 200) * 100).toBeGreaterThan(25);
    expect(baseCombatant(broken, 26, null).pv).toBeGreaterThan(0);
  });

  it('une déroute complète est nécessaire pour perdre plus que le mur', () => {
    const base = { total: 4, defeated: 3 } as never;
    expect(raidDamage({ ...(base as object), held: false } as never).damaged).toEqual(['wall']);
    expect(raidDamage({ total: 4, defeated: 0, held: false } as never).damaged).toContain(
      'watchtower',
    );
    expect(raidDamage({ total: 4, defeated: 4, held: true } as never)).toEqual({
      stockStolen: false,
      damaged: [],
      freeze: false,
    });
  });

  it('les tourelles sont TOUTES là, ou aucune — et montent ensemble', () => {
    // Elles apparaissaient une par une (1 + niveau/3) : la défense croissait en NOMBRE ×
    // PUISSANCE (quadratique), et le rempart restait à moitié nu sans qu'on comprenne —
    // cliquer un emplacement vide n'y bâtissait rien, l'ordre de remplissage étant imposé.
    // Un rempart se garnit d'un coup ; c'est le NIVEAU, partagé, qui porte la puissance.
    expect(turretCount(0)).toBe(0);
    for (const l of [1, 3, 12, 60, 120]) expect(turretCount(l)).toBe(TURRET_SLOTS);
    // ⚠️ La puissance de feu au niveau MAXIMAL est inchangée par ce passage (8 × K dans
    // les deux modèles) : le combat à niveau ne bouge pas, seule la montée devient linéaire.
    const plein = baseCombatant(defs(26, 26), 26, null).damage;
    const demi = baseCombatant(defs(26, 13), 26, null).damage;
    expect(demi).toBeLessThan(plein);
    expect(demi).toBeGreaterThan(plein * 0.35); // linéaire, pas quadratique
  });
});

describe('espionnage', () => {
  it('la clarté monte avec la Tour et BAISSE avec la force de l’armée', () => {
    expect(scoutClarity(20, 26, 26)).toBeGreaterThan(scoutClarity(6, 26, 26));
    expect(scoutClarity(6, 41, 26)).toBeLessThan(scoutClarity(6, 26, 26));
    expect(scoutClarity(0, 26, 26)).toBe(0);
    expect(scoutClarity(200, 26, 26)).toBe(RAID.clarityMax);
  });

  it('chaque palier révèle une ligne de plus, jamais moins', () => {
    const raid = rollRaid(99, 26, 0, 0);
    const seen = [0, 1, 2, 3, 4, 5].map((c) => scoutReport(raid, c));
    expect(seen[0]!.faction).toBeNull();
    expect(seen[1]!.faction).toBe(raid.faction);
    expect(seen[1]!.size).toBeNull();
    expect(seen[2]!.size).toBeGreaterThan(0);
    expect(seen[3]!.avgLevel).toBeGreaterThan(0);
    expect(seen[3]!.groups).toBeNull();
    expect(seen[4]!.groups).toHaveLength(raid.groups.length);
    // ⚠️ RÉÉCRIT en v0.718 : le palier 5 ne donne plus de PRONOSTIC chiffré — il disait
    // « 87 % de chances de tenir », donc l'issue avant la bataille. Il marque désormais
    // une lecture SANS ZONE D’OMBRE de l’ennemi ; ce qu’on ignore encore, c’est le
    // résultat, et c’est voulu.
    expect(seen[5]!.fullRead).toBe(true);
    expect('forecast' in seen[5]!).toBe(false);
  });

  it('⚠️ LE PRÉAVIS GRANDIT À CHAQUE NIVEAU, de 1 à 100', () => {
    // ⚠️ RÉÉCRIT. L'ancien épinglait une durée ABSOLUE et son PLAFOND — exactement ce
    // qu'on supprime : la Tour mourait au niveau 21, soit 79 niveaux payés pour rien.
    // Demandé par l'utilisateur : « qu'elle soit de plus en plus performante jusqu'au
    // 100, quitte à baisser sa performance à bas lvl ».
    const iv = raidIntervalMs(7);
    for (let l = 1; l <= 100; l++)
      expect(scoutLeadMs(l, iv), `niveau ${l}`).toBeGreaterThan(scoutLeadMs(l - 1, iv));
  });

  it('⚠️ 10 H PILE AU NIVEAU 100, et rien de plus au-delà', () => {
    // ⚠️ RÉÉCRIT (v0.802, demande de l’utilisateur : « calibré sur 100 niveaux, détection
    // max de 10 h au niveau 100 »). Il affirmait que le préavis était une PART de
    // l’intervalle — c’est précisément ce qu’on remplace par une durée calibrée.
    const iv = raidIntervalMs(7);
    expect(scoutLeadMs(100, iv)).toBe(10 * 3600_000);
    expect(scoutLeadMs(150, iv)).toBe(scoutLeadMs(100, iv));
    // …et sans Tour il reste un filet, jamais zéro : on voit la poussière à l'horizon.
    expect(scoutLeadMs(0, iv)).toBe(30 * 60_000);
    // Une DURÉE : le même niveau donne le même préavis quel que soit le rythme.
    expect(scoutLeadMs(40, raidIntervalMs(1))).toBe(scoutLeadMs(40, iv));
  });

  it('⚠️ ON N’EST JAMAIS PRÉVENU TOUT LE TEMPS — plafond sur l’intervalle', () => {
    // Un préavis qui couvrirait tout l'intervalle voudrait dire « toujours au courant »,
    // et la Tour cesserait d'acheter quoi que ce soit. Dormant tant que l'intervalle
    // vaut 24 h ou plus — on le vérifie donc sur un intervalle court.
    const court = 6 * 3600_000;
    expect(scoutLeadMs(100, court)).toBe(Math.round(court * RAID.scoutLeadIntervalCap));
    expect(scoutLeadMs(100, court)).toBeLessThan(court);
  });

  it('la montée est en RACINE : les premiers niveaux rendent le plus', () => {
    // Linéaire, les premiers niveaux ne rendaient presque rien pour un coût déjà réel.
    const iv = raidIntervalMs(7);
    const debut = scoutLeadMs(10, iv) - scoutLeadMs(0, iv);
    const fin = scoutLeadMs(100, iv) - scoutLeadMs(90, iv);
    expect(debut).toBeGreaterThan(3 * fin);
  });
});

describe('rythme', () => {
  it('⚠️ UNE SÉANCE = UN SIÈGE, sans plafond au nombre de séances', () => {
    // RÉÉCRIT en v0.702. L'ancienne version verrouillait le défaut : la fréquence lisait
    // les JOURS ACTIFS, donc elle plafonnait à un siège / 24 h — quelqu'un qui s'entraîne
    // trois fois par jour était au même régime que quelqu'un qui bouge une fois par jour.
    const H = 3600_000;
    const D = 24 * H;
    expect(raidIntervalMs(7)).toBe(D); // un par jour
    expect(raidIntervalMs(2)).toBe(3.5 * D); // deux séances, deux sièges
    expect(raidIntervalMs(1)).toBe(7 * D); // une séance, un siège
    // ⚠️ C'est ICI que l'ancien modèle s'arrêtait : au-delà de 7, il ne se passait plus rien.
    expect(raidIntervalMs(14)).toBe(12 * H);
    expect(raidIntervalMs(21)).toBe(8 * H);
    expect(raidIntervalMs(14)).toBeLessThan(raidIntervalMs(7));
  });

  it('le rythme reste borné aux deux bouts — un siège doit rester un événement', () => {
    // Plancher : même en s'entraînant sans arrêt, on ne descend pas sous 3 h.
    expect(raidIntervalMs(500)).toBe(RAID.intervalFloorMs);
    // Plafond : une seule séance ne déclenche pas un siège par heure ni l'inverse.
    expect(raidIntervalMs(0.2)).toBe(RAID.intervalMaxMs);
    expect(raidIntervalMs(0)).toBe(RAID.intervalIdleMs); // garde-fou, raidsEnabled a déjà coupé
    for (const n of [0, 1, 2, 7, 14, 21, 100, 500]) {
      const v = raidIntervalMs(n);
      expect(v).toBeGreaterThanOrEqual(RAID.intervalFloorMs);
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('cycle de vie', () => {
  function base(now: number): BaseState {
    const b = emptyBase(1234, now);
    b.defenses = defs(26, 26, 6); // enceinte PRÊTE (le joueur du fixture est niveau 26)
    return b;
  }

  it('sans muraille, AUCUNE attaque — le système est opt-in', () => {
    const b = emptyBase(7, 0);
    expect(raidsEnabled(b, 7, 26)).toBe(false);
    const r = advanceBase(b, { playerLevel: 26, activeDays7: 7, globalXp: 0 }, 10 * 24 * H);
    expect(r.detected).toBeNull();
    expect(r.dueRaid).toBeNull();
  });

  it('un joueur inactif n’est pas attaqué, et ne trouve PAS d’arriéré au retour', () => {
    // Règle fondatrice : on ne perd jamais pour ne pas avoir ouvert l'app.
    let b = base(0);
    const ctx = { playerLevel: 26, activeDays7: 0, globalXp: 0 };
    for (let d = 1; d <= 21; d++) b = advanceBase(b, ctx, d * 24 * H).base;
    const back = advanceBase(b, { ...ctx, activeDays7: 5 }, 22 * 24 * H);
    expect(back.dueRaid).toBeNull(); // rien n'a pu s'accumuler
  });

  it('détecte le raid AVANT son arrivée, puis le signale à résoudre', () => {
    const now = 0;
    let b = base(now);
    b.nextRaidAt = now + 10 * H;
    const ctx = { playerLevel: 26, activeDays7: 7, globalXp: 0 };
    expect(advanceBase(b, ctx, now).detected).toBeNull(); // trop tôt
    const lead = scoutLeadMs(6, raidIntervalMs(ctx.activeDays7));
    const det = advanceBase(b, ctx, b.nextRaidAt - lead + 1);
    expect(det.detected).not.toBeNull();
    expect(det.dueRaid).toBeNull(); // détecté ≠ arrivé : il reste du temps pour se préparer
    b = det.base;
    expect(advanceBase(b, ctx, b.nextRaidAt).dueRaid).not.toBeNull();
  });

  it('un seul siège en attente à la fois', () => {
    let b = base(0);
    b.nextRaidAt = 0;
    const ctx = { playerLevel: 26, activeDays7: 7, globalXp: 0 };
    b = advanceBase(b, ctx, 0).base;
    const first = b.raid;
    for (let d = 1; d < 10; d++) b = advanceBase(b, ctx, d * 24 * H).base;
    expect(b.raid).toEqual(first); // il ne s'en empile jamais un second
  });

  it('la production gelée se dégèle par une SÉANCE, ou toute seule', () => {
    const b = base(0);
    b.freeze = { until: 10 * H, atXp: 500 };
    const still = advanceBase(b, { playerLevel: 26, activeDays7: 7, globalXp: 500 }, H);
    expect(still.base.freeze).not.toBeNull();
    // Une séance de sport (XP en hausse) lève le gel immédiatement…
    const bySport = advanceBase(b, { playerLevel: 26, activeDays7: 7, globalXp: 620 }, H);
    expect(bySport.base.freeze).toBeNull();
    // …et l'échéance le lève de toute façon : l'app ne réclame jamais d'entraînement.
    const byTime = advanceBase(b, { playerLevel: 26, activeDays7: 7, globalXp: 500 }, 11 * H);
    expect(byTime.base.freeze).toBeNull();
  });

  it('une victoire ne coûte RIEN et sème quand même un champ de cadavres', () => {
    const b = base(0);
    const raid = rollRaid(555, 26, 0, 0);
    const rep = resolveRaid(
      { defenses: defs(40, 40), playerLevel: 40, hero: hero(40) },
      raid,
      0,
      true,
    );
    expect(rep.held).toBe(true);
    const { base: nb, damage } = applyRaidOutcome(b, raid, rep, { activeDays7: 7, globalXp: 0 }, 0);
    expect(damage).toEqual({ stockStolen: false, damaged: [], freeze: false });
    expect(nb.freeze).toBeNull();
    expect(nb.raid).toBeNull();
    expect(nb.nextRaidAt).toBeGreaterThan(0);
    expect(nb.field!.corpses.length).toBe(raid.groups.reduce((s, g) => s + g.count, 0));
  });

  it('⚠️ LES CORPS SONT RENDUS À L’APPELANT — c’est lui qui crédite le butin, tout de suite', () => {
    // ⚠️ AJOUTÉ APRÈS UNE MUTATION SURVIVANTE : remplacer `corpses` par `[]` dans le retour
    // ne faisait rougir AUCUN test, alors que c'est tout le point 4 du chantier — le butin
    // des corps est crédité À LA RÉSOLUTION et part avec le rapport, au lieu d'attendre
    // qu'on vienne fouiller. Sans ce retour, le store n'a rien à dépouiller et le butin
    // d'un siège disparaît en silence.
    const b = base(0);
    const raid = rollRaid(555, 26, 0, 0);
    const rep = resolveRaid(
      { defenses: defs(40, 40), playerLevel: 40, hero: hero(40) },
      raid,
      0,
      true,
    );
    const { base: nb, corpses } = applyRaidOutcome(
      b,
      raid,
      rep,
      { activeDays7: 7, globalXp: 0 },
      0,
    );
    // Exactement ceux du champ : une seule et même liste, pas deux lectures qui pourraient
    // diverger — le champ n'est que le DÉCOR de ce qu'on vient de dépouiller.
    expect(corpses).toEqual(nb.field!.corpses);
    expect(corpses.length).toBeGreaterThan(0);
    // …et ils valent vraiment quelque chose : c'est ce que le store crédite.
    expect(lootCorpses(corpses, rep.faction, 40, 1, []).gold).toBeGreaterThan(0);
  });

  it('🦴 le relevé du butin se lit en PUCES — une seule mise en forme pour deux écrans', () => {
    // ⚠️ L'écran de fin du rejeu et la feuille de la Tour de guet affichent le MÊME butin :
    // deux mises en forme divergeraient au premier ajout de devise — c'est le défaut que
    // `haulPills` a déjà corrigé pour les expéditions (v0.680), où une épave s'affichait
    // avec un butin VIDE parce que la boîte listait ses devises à la main.
    expect(battleLootPills({ corpses: 12, gold: 840, keys: 1, summonStones: 3, items: 2 })).toEqual(
      ['+840 🪙', '+3 🔮', '+1 🗝️', '+2 objets'],
    );
    // Le singulier se dit au singulier.
    expect(battleLootPills({ corpses: 1, gold: 0, keys: 0, summonStones: 0, items: 1 })).toEqual([
      '+1 objet',
    ]);
    // ⚠️ Une devise à ZÉRO ne fait PAS de puce : une colonne de zéros laisserait croire que
    // la bataille n'a rien donné, alors qu'elle a donné autre chose.
    expect(battleLootPills({ corpses: 5, gold: 100, keys: 0, summonStones: 0, items: 0 })).toEqual([
      '+100 🪙',
    ]);
    // ⚠️ Et SANS relevé (les bases d'avant ce chantier), on n'affiche RIEN — on n'invente
    // pas un butin qu'on ne connaît pas.
    expect(battleLootPills(null)).toEqual([]);
    expect(battleLootPills(undefined)).toEqual([]);
  });

  it('le champ de bataille pourrit', () => {
    let b = base(0);
    b.field = {
      corpses: corpsesFrom(rollRaid(1, 26, 0, 0), { defeated: 2 } as never, 1),
      expiresAt: 5 * H,
    };
    b = advanceBase(b, { playerLevel: 26, activeDays7: 7, globalXp: 0 }, 6 * H).base;
    expect(b.field).toBeNull();
  });

  it('⚠️ les corps ne restent que QUELQUES HEURES — c’est du décor, plus une réserve', () => {
    // Le butin étant crédité à la résolution, le champ n'a plus rien à garder : il montre
    // la bataille, puis la ville se nettoie. ⚠️ BIEN EN DEÇÀ de l'intervalle entre deux
    // sièges (24 h au plus serré, pour un joueur qui s'entraîne tous les jours) — sinon on
    // aurait une base à l'air assiégé en PERMANENCE, pour rien. C'est ce RAPPORT qui est
    // gardé, pas la valeur : le jour où le rythme des sièges change, la règle suit.
    expect(SCAV.fieldMs).toBeLessThan(raidIntervalMs(7) / 2);
    // …et assez longtemps pour qu'on les voie : rentrer le soir après un siège du matin
    // doit encore montrer quelque chose.
    expect(SCAV.fieldMs).toBeGreaterThan(3 * H);
  });
});

describe('champ de bataille', () => {
  const raid = rollRaid(31337, 26, 0, 0);

  it('ne laisse que les corps des groupes REPOUSSÉS', () => {
    const partial = corpsesFrom(raid, { defeated: 2, total: raid.groups.length } as never, 7);
    const expected = raid.groups.slice(0, 2).reduce((s, g) => s + g.count, 0);
    expect(partial).toHaveLength(expected);
    expect(new Set(partial.map((c) => c.id)).size).toBe(partial.length); // ids uniques
    for (const c of partial) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(100);
    }
  });

  it('paie dans la devise de la faction — et JAMAIS en ferraille', () => {
    // La ferraille vient des épaves de la carte : en trouver sur un loup n'aurait aucun
    // sens. Le butin d'un siège, lui, dépend de qui attaquait.
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    const bandits = lootCorpses(corpses, 'bandits', 26, 1, []);
    const betes = lootCorpses(corpses, 'betes', 26, 1, []);
    const morts = lootCorpses(corpses, 'mortsvivants', 26, 1, []);
    expect(bandits.gold).toBeGreaterThan(betes.gold);
    // ⚠️ RÉÉCRIT : ce test exigeait des fragments 🧩 et de la poussière d'encre 🖋️ — il
    // verrouillait donc le défaut. Ces deux devises sont MORTES (plus aucune fonction ne
    // les dépense depuis le retrait des infusions de grade), si bien que DEUX factions sur
    // trois payaient le siège en monnaie de singe. Chacune paie désormais dans quelque
    // chose qui se consomme : or, pierres d'invocation, clés du Labyrinthe.
    expect(
      morts.summonStones,
      'les morts-vivants laissent de quoi rappeler un boss',
    ).toBeGreaterThan(0);
    expect(bandits.summonStones).toBe(0);
    expect(morts.keys).toBe(0);
    // ⚠️ Le titre annonçait « JAMAIS en ferraille » sans jamais la regarder — c'est ce
    // trou qui a laissé la v0.702 en faire tomber des cadavres sans qu'il rougisse.
    for (const l of [bandits, betes, morts])
      expect((l as unknown as Record<string, unknown>).scrap ?? 0).toBe(0);
  });

  it('⚠️ AUCUNE devise MORTE dans le butin d’un siège', () => {
    // Le garde-fou générique : si une devise cesse d'avoir un site de dépense, ce test
    // doit être élargi — pas contourné.
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    for (const f of ['bandits', 'betes', 'mortsvivants'] as const) {
      const l = lootCorpses(corpses, f, 26, 1, []) as unknown as Record<string, number>;
      expect(l.fragments, f + ' : fragments').toBeUndefined();
      expect(l.inkDust, f + ' : encre').toBeUndefined();
    }
  });

  it('les BÊTES rapportent des clés — rarement, et sur le cumul de la vague', () => {
    // Une clé par corps ferait du Labyrinthe un farm ; on cumule les chances sur la vague.
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    const betes = lootCorpses(corpses, 'betes', 26, 1, []);
    expect(betes.keys).toBeLessThanOrEqual(corpses.length);
    expect(betes.gold, 'même une bête traîne ce qu’elle a pris au village').toBeGreaterThan(0);
  });

  it('⛔ ANTI-RUNAWAY : la rareté reste plafonnée par le NIVEAU DU JOUEUR', () => {
    // Un raid à +15 donne PLUS d'objets, jamais des raretés hors de sa ligue — sinon la
    // défense deviendrait le chemin le plus court pour casser « le sport est le plafond ».
    const playerLevel = 20;
    const ceil = rankCeilingForLevel(playerLevel);
    const deep = rollRaid(4242, playerLevel, 0, 0);
    const corpses = corpsesFrom(deep, { defeated: deep.groups.length } as never, 9);
    for (let s = 1; s < 40; s++) {
      for (const it of lootCorpses(corpses, 'bandits', playerLevel, s, []).items) {
        // Même tolérance que le reste du jeu : la cloche déborde d'au plus 2 rangs.
        expect(RANK_ORDER.indexOf(it.rarity)).toBeLessThanOrEqual(ceil + 2);
      }
    }
  });
});

describe('🗡️ LE REMPART : chaque champion avec SES pièces (v0.996)', () => {
  // ⚠️ BLOC RÉÉCRIT. Il éprouvait le Chenil et les compagnons confiés aux champions, retirés
  // (décision de l’utilisateur : familiers et talents restent au HÉROS). Ce qui reste vrai :
  // le même arbitre que le héros, et personne sans champion à la brèche.
  const vrai = (): Adventurer => ({ ...refChampionAdv(60, 0), id: 'a', name: 'Ilyana' });
  const nus = { advGear: [] };

  it('⚠️ LE MÊME ARBITRE QUE LE HÉROS, sans bonus de terrain', () => {
    const a = vrai();
    const p = adventurerPowers([a]).get('a')!;
    expect(p).toBe(combatPower(escortCombatant([a], a.name)));
    expect(p).toBeGreaterThan(0);
  });

  it('⚠️ un familier ou un talent confié par une SAUVEGARDE D’AVANT ne compte plus', () => {
    const a = vrai();
    const legacy = { ...a, familiarId: 'loup', talentId: 't1' } as Adventurer;
    expect(adventurerPowers([legacy], nus).get('a')).toBe(adventurerPowers([a], nus).get('a'));
    expect(guardUnits(60, [legacy], 99, nus)).toEqual(guardUnits(60, [a], 99, nus));
  });

  it('⚠️ SANS AVENTURIER, PERSONNE NE TIENT LA BRÈCHE', () => {
    expect(guardUnits(26, [], 99, nus)).toEqual([]);
  });
});
describe('🎓 UN SEUL DRESSAGE PAR FAMILIER (v0.805)', () => {
  // Demandé par l’utilisateur : « une expérience globale, montée par les convois et les
  // défenses ». Il y avait deux carrières (attaque en donjon, défense au mur) aux pentes
  // différentes ; le même animal valait deux choses selon le terrain.
  const f = (o: Partial<Item> = {}): Item =>
    ({
      id: 'f',
      slot: 'familiar',
      name: 'f',
      emoji: '',
      rarity: 'rare',
      level: 10,
      baseLevel: 10,
      effect: { type: 'damage_pct', value: 20 },
      ...o,
    }) as Item;

  it('⚠️ l’ancien dressage est RELU, sans migration et sans rien perdre', () => {
    // L’ancienne XP de défense se comptait 4 fois moins cher : un familier dressé au mur
    // garde exactement le niveau qu’il avait gagné.
    expect(famXp(f({ atkXp: 100, defXp: 50 }))).toBe(300);
    expect(famLevel(famXp(f({ defXp: famXpForLevel(6) / 4 })))).toBe(6);
    // Dès qu’il regagne, c’est la nouvelle XP qui fait foi.
    expect(famXp(f({ xp: 42, atkXp: 9999 }))).toBe(42);
  });

  it('⚠️ gagner écrit UNE expérience, et fond les deux anciennes dedans', () => {
    const g = grantFamiliarXp(f({ atkXp: 100, defXp: 50 }), 20, 50);
    expect(g.xp).toBe(320);
    expect(g.atkXp).toBeUndefined();
    expect(g.defXp).toBeUndefined();
  });

  it('⚠️ plafonnée au niveau du joueur, jamais en recul', () => {
    const cap = famXpForLevel(6) - 1;
    expect(grantFamiliarXp(f(), 1e9, 5).xp).toBe(cap);
    // Un familier dressé avant que le plafond ne bouge garde son acquis.
    const haut = f({ xp: famXpForLevel(30) });
    expect(grantFamiliarXp(haut, 10, 5).xp).toBe(famXpForLevel(30));
    expect(grantFamiliarXp(haut, 10, 5)).toBe(haut);
  });
});

describe('masse visible contre menace', () => {
  const M = RAID as unknown as { massMult: number };
  const REF = M.massMult;
  afterEach(() => {
    M.massMult = REF;
  });

  /** Menace TOTALE d une armee : PV et degats de tous ses groupes. */
  function threat(L: number, seed: number) {
    const raid = rollRaid(seed, L, 0, 0);
    let pv = 0;
    let dmg = 0;
    for (const g of raid.groups) {
      const c = groupCombatant(g);
      pv += c.pv;
      dmg += c.damage;
    }
    return { pv, dmg, count: raid.groups.reduce((a, g) => a + g.count, 0) };
  }

  it('l armee VISIBLE est bien plus nombreuse que l effectif de calibration', () => {
    for (const L of [12, 26, 60, 100]) {
      expect(raidSize(L, undefined)).toBeGreaterThan(raidThreatSize(L, undefined));
      expect(raidSize(L, 'bandits')).toBeGreaterThanOrEqual(
        Math.round(raidThreatSize(L, 'bandits') * REF) - 1,
      );
    }
  });

  it('⚠️ la MENACE ne bouge pas : plus de monde, chacun plus faible', () => {
    for (const L of [12, 26, 60, 100]) {
      for (const seed of [3, 91, 404]) {
        M.massMult = 1;
        const avant = threat(L, seed);
        M.massMult = REF;
        const apres = threat(L, seed);
        // La foule, elle, a bien grossi — sinon le test ne prouverait rien.
        expect(apres.count).toBeGreaterThan(avant.count * 1.8);
        // Les PV suivent l effectif, les degats sa RACINE : les deux doivent survivre
        // a la dilution, sinon une armee plus nombreuse frapperait moins fort.
        expect(apres.pv / avant.pv).toBeGreaterThan(0.95);
        expect(apres.pv / avant.pv).toBeLessThan(1.05);
        expect(apres.dmg / avant.dmg).toBeGreaterThan(0.95);
        expect(apres.dmg / avant.dmg).toBeLessThan(1.05);
      }
    }
  });

  it('⚠️ le CHAMPION n est pas dilue — il est seul, il n a pas ete gonfle', () => {
    const raid = rollRaid(77, 40, 0, 0);
    const champ = raid.groups.find((g) => g.champion)!;
    expect(champ.count).toBe(1);
    expect(champ.massMult ?? 1).toBe(1);
    M.massMult = 1;
    const seul = groupCombatant({ ...champ, massMult: 1 });
    M.massMult = REF;
    expect(groupCombatant(champ).pv).toBe(seul.pv);
    expect(groupCombatant(champ).damage).toBe(seul.damage);
  });

  it('⚠️ le BUTIN du champ de bataille est conserve : 2,5x plus de corps, chacun moins riche', () => {
    function field(L: number) {
      let gold = 0;
      let stones = 0;
      let corps = 0;
      for (let s = 0; s < 40; s++) {
        const raid = rollRaid(s * 7919 + 5, L, 0, 0);
        const rep = { defeated: raid.groups.length } as RaidReport;
        const c = corpsesFrom(raid, rep, s);
        const loot = lootCorpses(c, raid.faction, L, s, []);
        corps += c.length;
        gold += loot.gold;
        stones += loot.summonStones;
      }
      return { gold, stones, corps };
    }
    for (const L of [26, 60]) {
      M.massMult = 1;
      const a = field(L);
      M.massMult = REF;
      const b = field(L);
      expect(b.corps).toBeGreaterThan(a.corps * 1.8); // la foule a grossi
      // ⚠️ Marge SERREE : c est ici qu un arrondi par corps se voyait. Arrondir la part
      // de chaque cadavre biaisait de +11 % la ferraille et +25 % les pierres, assez
      // pour faire tomber la regle « la ferraille est plus dure a obtenir que l or ».
      expect(b.gold / a.gold).toBeGreaterThan(0.95);
      expect(b.gold / a.gold).toBeLessThan(1.05);
      expect(b.stones / a.stones).toBeGreaterThan(0.95);
      expect(b.stones / a.stones).toBeLessThan(1.05);
    }
  });
});

/** ⚠️ CHAQUE STRUCTURE DIT CE QU'UN NIVEAU CHANGE (v0.721). Les descriptions disaient ce
 *  que la structure FAIT, jamais ce qu'un niveau APPORTE — or c'est la seule question
 *  qu'on se pose devant « Améliorer ». Les bâtiments de production l'avaient depuis la
 *  v0.683 ; l'enceinte, non. */
describe('ce qu’un niveau de défense apporte', () => {
  const ctx = (lvl: number, id: DefenseId, intervalMs?: number) => ({
    playerLevel: 40,
    defenses: [{ typeId: id, level: lvl }] as DefenseStructure[],
    ...(intervalMs ? { intervalMs } : {}),
  });

  it('⚠️ AUCUNE structure muette — en ajouter une sans le dire est une régression', () => {
    for (const t of DEFENSE_TYPES) {
      const txt = defensePerLevelLabel(t.id, 5, ctx(5, t.id));
      expect(txt.length, t.id).toBeGreaterThan(20);
    }
  });

  it('l’INFIRMERIE chiffre la convalescence', () => {
    const txt = defensePerLevelLabel('infirmary', 3, ctx(3, 'infirmary'));
    expect(txt).toContain(fmtSpan(woundMsFor(3)));
    expect(txt).toContain(fmtSpan(woundMsFor(4)));
  });

  it('⚠️ elle AVOUE quand le rythme des sièges annule déjà le gain', () => {
    // La convalescence est bornée par l'intervalle (`WOUND_INTERVAL_SHARE`). Quand on
    // s'entraîne beaucoup, ce plafond mord : monter l'Infirmerie ne change RIEN au
    // héros. Le taire ferait payer un niveau inutile.
    const serre = 3 * 3600_000; // un siège toutes les 3 h : le plancher du jeu
    expect(woundMsFor(3, serre)).toBe(woundMsFor(4, serre)); // le cap mord bien
    const txt = defensePerLevelLabel('infirmary', 3, ctx(3, 'infirmary', serre));
    expect(txt).toMatch(/rythme de sièges/);
  });

  it('⚠️ les chiffres sont DÉRIVÉS des vraies fonctions, pas recopiés', () => {
    // Une étiquette qui réécrirait la formule finirait par mentir. On vérifie donc
    // qu’elle bouge quand la fonction bouge.
    // ⚠️ Niveaux choisis pour que les deux valeurs DIFFERENT : a 4 et 5 la capacite
    // est la meme, et le test passait alors meme en recopiant un chiffre au hasard.
    // ⚠️ 9/10 ne suffit plus : depuis que le nombre de bras monte par crans de QUATRE
    // niveaux, deux niveaux voisins donnent souvent la meme capacite — et le rendu porte
    // desormais un SECOND levier (la vitesse) precisement pour qu aucun cran ne soit mort.
    // ⚠️ AVEC SON INTERVALLE : sans lui les deux côtés valaient `NaN`, et le test passait
    // par construction (trouvé en v0.802).
    const iv = raidIntervalMs(7);
    const w = defensePerLevelLabel('watchtower', 2, ctx(2, 'watchtower', iv));
    expect(w).toContain(fmtSpan(scoutLeadMs(3, iv)));
    expect(w).not.toContain('NaN');
    // Au-delà du niveau 100, on le dit — pas « 10 h → 10 h ».
    expect(defensePerLevelLabel('watchtower', 100, ctx(100, 'watchtower', iv))).toContain(
      'préavis au maximum',
    );
  });

  it('⚠️ l’Infirmerie n’annonce plus jamais de « plancher » — elle n’en a plus', () => {
    // ⚠️ RÉÉCRIT. Ce test exigeait qu'un niveau élevé annonce « déjà à son plancher »,
    // et c'était juste TANT QUE la structure en avait un. La queue asymptotique l'a
    // supprimé (« aucun niveau mort du 0 au 100 ») : la convalescence raccourcit
    // désormais à CHAQUE niveau, donc ce motif ne peut plus être vrai. Ce qu'il
    // protégeait reste protégé : ne JAMAIS confondre les deux bornes.
    const haut = defensePerLevelLabel('infirmary', 20, ctx(20, 'infirmary'));
    expect(haut).not.toMatch(/plancher/);
    // Un niveau élevé annonce un vrai gain, pas un cul-de-sac.
    expect(haut).toContain(fmtSpan(woundMsFor(21)));
    const serre = 3 * 3600_000;
    const rythme = defensePerLevelLabel('infirmary', 3, ctx(3, 'infirmary', serre));
    expect(rythme).toMatch(/rythme de sièges/);
    expect(rythme).not.toMatch(/plancher/);
  });

  it('⚠️ la clarté annoncée ne dépasse JAMAIS le plafond de scoutClarity', () => {
    // Le libelle promettait « 7/5 » crans a une tour de niveau 13 : une etiquette qui
    // depasse le plafond de la fonction quelle decrit ment, et fait payer pour rien.
    for (let lvl = 1; lvl <= 30; lvl++) {
      const txt = defensePerLevelLabel('watchtower', lvl, ctx(lvl, 'watchtower'));
      const m = /(\d+)\/(\d+)\)/.exec(txt);
      if (m) expect(Number(m[1]), `niveau ${lvl} : ${txt}`).toBeLessThanOrEqual(Number(m[2]));
    }
  });

  it('⚠️ un palier SANS gain dit à quel niveau ça bougera', () => {
    // « +0 » est honnête mais inutilisable : ce qu'on veut savoir, c'est jusqu'où monter.
    // ⚠️ SUJET CHANGÉ (le Chenil est retiré, v0.996) : la Tour de guet a la même forme —
    // la clarté monte par crans, donc un niveau sur plusieurs n'en ajoute aucun.
    const clarte = (n: number) => scoutClarity(n, 40, 40);
    expect(clarte(1)).toBe(clarte(2)); // ce palier ne donne rien
    const txt = defensePerLevelLabel('watchtower', 1, {
      ...ctx(1, 'watchtower'),
      intervalMs: 24 * H,
    });
    expect(txt).toMatch(/cran de renseignement suivant est au niveau \d+/);
    expect(txt).not.toMatch(/\+0/);
  });
  it('la MURAILLE et les TOURELLES annoncent un gain réel, puis le plafond du sport', () => {
    expect(defensePerLevelLabel('wall', 10, ctx(10, 'wall'))).toMatch(/PV de muraille/);
    expect(defensePerLevelLabel('turret', 10, ctx(10, 'turret'))).toMatch(/dégâts par tour/);
    // Au niveau du personnage, un cran de plus ne vaut rien : le sport est le plafond.
    expect(defensePerLevelLabel('wall', 40, ctx(40, 'wall'))).toMatch(/sport/);
  });
});
describe('blessure du héros', () => {
  it('un siège PERDU avec le héros présent le blesse — mais ne le BLOQUE jamais', () => {
    const b = emptyBase(1, 0);
    b.defenses = defs(20, 20);
    const raid = rollRaid(77, 26, 0, 0);
    const lost = { ...raid, groups: raid.groups } as never;
    const report = {
      ...resolveRaid({ defenses: [], playerLevel: 26, hero: null }, lost, 0, true),
      held: false,
      heroHome: true,
    };
    const { base: nb } = applyRaidOutcome(b, raid, report, { activeDays7: 7, globalXp: 0 }, 0);
    expect(nb.wound).not.toBeNull();
    // Il part à l'INFIRMERIE : plus de donjon, de faille ni d'expédition le temps qu'il
    // se remette. (Un simple malus de dégâts avait été essayé : sans mordant, puisqu'on
    // farme surtout du contenu qu’on domine largement — il ne changeait rien.)
    expect(isWounded(nb, 0)).toBe(true);
    expect(heroAvailable(nb, 0)).toBe(false);
    expect(woundRemainingMs(nb, 0)).toBeGreaterThan(0);
    // …et il se remet tout seul.
    expect(heroAvailable(nb, nb.wound!.until + 1)).toBe(true);
    const healed = advanceBase(
      nb,
      { playerLevel: 26, activeDays7: 7, globalXp: 0 },
      nb.wound!.until,
    );
    expect(healed.base.wound).toBeNull();
  });

  it('une VICTOIRE ne blesse personne : la présence du héros reste un pari gagnant', () => {
    const b = emptyBase(1, 0);
    b.defenses = defs(40, 40);
    const raid = rollRaid(555, 26, 0, 0);
    const rep = resolveRaid(
      { defenses: defs(40, 40), playerLevel: 40, hero: hero(40) },
      raid,
      0,
      true,
    );
    expect(rep.held).toBe(true);
    const { base: nb } = applyRaidOutcome(b, raid, rep, { activeDays7: 7, globalXp: 0 }, 0);
    expect(nb.wound).toBeNull();
  });

  it('l’Infirmerie abrège la convalescence, qui reste COURTE devant deux sièges', () => {
    expect(woundMsFor(10)).toBeLessThan(woundMsFor(0));
    expect(woundMsFor(999)).toBeGreaterThan(0); // jamais instantané
    // Sinon un héros encore alité manquerait la défense suivante, qu'il perdrait donc
    // plus probablement, ce qui le renverrait à l’infirmerie : la spirale, encore.
    for (const inf of [0, 1, 10, 50]) {
      expect(woundMsFor(inf)).toBeLessThanOrEqual(WOUND_MAX_MS);
      // ⚠️ RÉÉCRIT en v0.702 : la référence n'est plus une constante (l'intervalle « actif »
      // n'existe plus) mais le RYTHME RÉEL. Un siège toutes les 3 h avec 6 h d'infirmerie
      // ferait manquer la défense suivante — la spirale que tout le système évite.
      for (const sessions of [1, 7, 21, 500]) {
        const iv = raidIntervalMs(sessions);
        expect(woundMsFor(inf, iv)).toBeLessThan(iv);
      }
    }
  });

  it('il y a TOUJOURS une porte de sortie : des soins d’urgence en or', () => {
    // Attendre reste gratuit ; payer n'achète que l'immédiateté, à un prix qui suit le
    // repos restant — écourter la fin coûte donc peu.
    expect(healCost(6 * H, 28)).toBeGreaterThan(healCost(1 * H, 28));
    expect(healCost(0, 28)).toBeGreaterThan(0);
    // …et le niveau : l'or d'un joueur de niveau 50 ne vaut pas celui d'un débutant.
    expect(healCost(6 * H, 50)).toBeGreaterThan(healCost(6 * H, 10));
  });
});

describe('économie de la défense', () => {
  it('réparer coûte de la ferraille, proportionnellement au niveau', () => {
    expect(repairCost(1)).toBeGreaterThan(0);
    expect(repairCost(30)).toBeGreaterThan(repairCost(10));
  });

  it('réparer l’enceinte RELANCE la production — à la FIN des travaux', () => {
    // Le gel n'est pas une punition séparée : c'est la conséquence d'une base cassée.
    // ⚠️ RÉÉCRIT (v0.802) : la réparation prend désormais du temps. La ferraille est payée
    // au lancement, la structure reste endommagée jusqu'à la fin, et c'est la fin des
    // derniers travaux qui relance la production.
    const b = emptyBase(1, 0);
    b.defenses = [
      { typeId: 'wall', level: 20, damaged: true },
      { typeId: 'turret', level: 18, damaged: true },
    ];
    b.freeze = { until: 24 * H, atXp: 100 };
    expect(totalRepairCost(b)).toBe(repairCost(20) + repairCost(18));

    const lances = startRepair(startRepair(b, 'wall', 0), 'turret', 0);
    // Les travaux lancés sont payés : ils sortent du total à lancer…
    expect(totalRepairCost(lances)).toBe(0);
    // …mais rien n'est encore en service, et la production reste à l'arrêt.
    expect(lances.defenses.every((d) => d.damaged)).toBe(true);
    expect(lances.freeze).not.toBeNull();

    // Le mur finit avant les tourelles : tant qu'il reste une brèche, toujours gelé.
    const finMur = repairMsFor(20);
    const finTour = repairMsFor(18);
    const tot = Math.max(finMur, finTour);
    const tard = Math.min(finMur, finTour);
    const moitie = settleRepairs(lances, tard);
    expect(moitie.defenses.filter((d) => d.damaged)).toHaveLength(1);
    expect(moitie.freeze).not.toBeNull();
    // …et elle repart quand tout est en état.
    const whole = settleRepairs(moitie, tot);
    expect(whole.defenses.some((d) => d.damaged || d.repairUntil != null)).toBe(false);
    expect(whole.freeze).toBeNull();
  });

  it('🔧 une réparation dure selon le NIVEAU de la structure, et RIEN d’autre', () => {
    // Elle croît à chaque niveau — un mur plus haut se remet en état plus lentement.
    for (let n = 2; n <= 100; n++)
      expect(repairMsFor(n), `niveau ${n}`).toBeGreaterThan(repairMsFor(n - 1));
    expect(repairMsFor(100)).toBe(5.5 * H);
    // ⚠️ Toujours bien plus courte que l'intervalle minimal entre deux sièges (24 h) :
    // une base encore en travaux au siège suivant serait une spirale.
    expect(repairMsFor(100)).toBeLessThan(raidIntervalMs(7) / 3);
  });

  it('⚠️ AUCUN BÂTIMENT ne la raccourcit — la Fonderie est partie avec son second métier', () => {
    // ⚠️ La garantie porte sur la SIGNATURE : tant que la durée ne dépend que du niveau
    // de la structure, aucun bâtiment ne PEUT la réduire. Un second paramètre rouvrirait
    // la porte, et c'est ce qu'on interdit ici.
    expect(repairMsFor.length).toBe(1);
    expect(startRepair.length).toBe(3);
    // La seule sortie reste PAYANTE : elle coûte de l'or, proportionnellement à ce qu'on
    // saute (`rushRepairCost`), comme les soins d'urgence du héros.
    expect(rushRepairCost(2 * H, 30)).toBeGreaterThan(rushRepairCost(1 * H, 30));
  });

  it('⚠️ relancer des travaux en cours ne repousse RIEN et ne fait rien payer', () => {
    const b = emptyBase(1, 0);
    b.defenses = [{ typeId: 'wall', level: 30, damaged: true }];
    const une = startRepair(b, 'wall', 0);
    const deux = startRepair(une, 'wall', 2 * H);
    expect(deux.defenses[0]!.repairUntil).toBe(une.defenses[0]!.repairUntil);
    // Une structure intacte ne se « répare » pas.
    const intacte = emptyBase(1, 0);
    intacte.defenses = [{ typeId: 'wall', level: 30 }];
    expect(startRepair(intacte, 'wall', 0).defenses[0]!.repairUntil).toBeUndefined();
  });

  it('⚠️ le tick CONCLUT les travaux échus, et n’écrit rien quand il n’y a rien à conclure', () => {
    const b = emptyBase(1, 0);
    b.defenses = [{ typeId: 'wall', level: 30, damaged: true }];
    const lance = startRepair(b, 'wall', 0);
    const fin = lance.defenses[0]!.repairUntil!;
    expect(isRepairing(lance.defenses[0], fin - 1)).toBe(true);
    expect(settleRepairs(lance, fin - 1)).toBe(lance); // même objet : rien à écrire
    const ctx = { playerLevel: 30, activeDays7: 0, globalXp: 0 };
    const tick = advanceBase(lance, ctx, fin);
    expect(tick.changed).toBe(true);
    expect(tick.base.defenses[0]!.damaged).toBeFalsy();
  });

  it('on peut TERMINER tout de suite, en or, au prorata du temps restant', () => {
    const b = emptyBase(1, 0);
    b.defenses = [{ typeId: 'wall', level: 40, damaged: true }];
    b.freeze = { until: 24 * H, atXp: 100 };
    const lance = startRepair(b, 'wall', 0);
    const fini = finishRepairNow(lance, 'wall');
    expect(fini.defenses[0]).toEqual({ typeId: 'wall', level: 40 });
    expect(fini.freeze).toBeNull();
    // ∝ au temps restant : écourter la fin est une bricole, sauter tout le chantier se paie.
    // ⚠️ AU TARIF DES SOINS D'URGENCE DU HÉROS (v0.998, la ferraille retirée) : deux portes
    // de sortie qui coûtent pareil se comprennent sans notice.
    expect(rushRepairCost(3 * H, 40)).toBe(healCost(3 * H, 40));
    expect(rushRepairCost(3 * H, 40)).toBeGreaterThan(rushRepairCost(10 * 60_000, 40));
  });

  it('un groupe nombreux est une éponge à PV, pas un pic de dégâts', () => {
    // Seuls quelques assaillants tiennent au pied du mur à la fois : sans ça, une horde
    // expédierait la base en un tour au lieu de l'user.
    const one = groupCombatant({ species: 'x', emoji: 'x', count: 1, level: 26 });
    const many = groupCombatant({ species: 'x', emoji: 'x', count: 9, level: 26 });
    expect(many.pv / one.pv).toBeCloseTo(9, 2); // les PV, eux, suivent l'effectif
    expect(many.damage).toBeLessThan(one.damage * 9);
    expect(many.damage).toBeGreaterThan(one.damage);
  });
});

describe('ce qu’on trouve sur un corps dépend de QUI attaquait', () => {
  it('⚔️ les BANDITS laissent de l’équipement, les bêtes presque pas', () => {
    // Réalisme : un homme en armes porte une arme et une armure ; un loup ne porte rien,
    // un revenant ce qu'il reste de son linceul. La faction décide donc de la DEVISE
    // (or / pierres / clés) ET de ce qu'on ramasse.
    const raid = rollRaid(31, 26, 0, 0);
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    let bandits = 0;
    let betes = 0;
    for (let s = 1; s <= 40; s++) {
      bandits += lootCorpses(corpses, 'bandits', 26, s * 13 + 1, []).items.length;
      betes += lootCorpses(corpses, 'betes', 26, s * 13 + 1, []).items.length;
    }
    expect(bandits, `bandits ${bandits} vs bêtes ${betes}`).toBeGreaterThan(betes * 2);
    expect(betes, 'une bête traîne quand même parfois une pièce prise au village').toBeGreaterThan(
      0,
    );
  });

  it('l’or reste la marque des bandits, l’équipement ne le remplace pas', () => {
    const raid = rollRaid(31, 26, 0, 0);
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    expect(lootCorpses(corpses, 'bandits', 26, 5, []).gold).toBeGreaterThan(
      lootCorpses(corpses, 'betes', 26, 5, []).gold,
    );
  });
});

describe('🔩 AUCUNE FERRAILLE SUR LES ASSAILLANTS (v0.856 ; RÉÉCRIT, il verrouillait l’inverse)', () => {
  const corpse = (level: number, champion = false) => ({
    id: 'c' + level + (champion ? 'x' : ''),
    level,
    champion,
    looted: false,
    species: 'X',
    emoji: '💀',
    at: 0,
  });
  const loot = (faction: 'bandits' | 'betes' | 'mortsvivants', n = 8, L = 40) =>
    lootCorpses(
      Array.from({ length: n }, (_, i) => corpse(L, i === n - 1)) as never,
      faction,
      L,
      7,
      [],
    );

  it('⚠️ aucune faction, à aucun niveau, champion compris, ne laisse de ferraille', () => {
    // La v0.702 en faisait tomber des bandits et des morts-vivants ; ce bloc de tests
    // l'EXIGEAIT. Décision de l'utilisateur : la ferraille vient de ce qu'on va chercher
    // (épaves), de la Fonderie et du recyclage — jamais des assaillants de la base.
    for (const f of ['bandits', 'betes', 'mortsvivants'] as const)
      for (const L of [5, 26, 60, 100]) {
        const l = loot(f, 12, L) as unknown as Record<string, unknown>;
        expect(l.scrap ?? 0, `${f} niveau ${L}`).toBe(0);
      }
  });

  it('le reste du butin, lui, suit toujours le NIVEAU du corps', () => {
    expect(loot('bandits', 6, 60).gold).toBeGreaterThan(loot('bandits', 6, 20).gold);
  });
});

// ── Le DÉCLENCHEUR : une enceinte doit être PRÊTE, pas seulement exister ──────────
describe('📈 RENFORT DE L’ARMÉE ENTRE LES NIVEAUX 6 ET 26 (v0.829)', () => {
  it('rien jusqu’au niveau 5 (apprentissage) ni à partir de 26 (fin de partie calibrée)', () => {
    for (const L of [1, 2, 3, 4, 5, 26, 30, 60, 100]) expect(earlyThreatMult(L)).toBe(1);
  });
  it('monte au niveau 6, plein de 7 à 16, redescend jusqu’à 26', () => {
    const t = RAID.earlyThreat;
    expect(earlyThreatMult(6)).toBeGreaterThan(1);
    expect(earlyThreatMult(6)).toBeLessThan(1 + t.peak);
    for (let L = 7; L <= 16; L++) expect(earlyThreatMult(L)).toBeCloseTo(1 + t.peak, 10);
    for (let L = 17; L < 26; L++) {
      expect(earlyThreatMult(L)).toBeLessThan(earlyThreatMult(L - 1));
      expect(earlyThreatMult(L)).toBeGreaterThan(1);
    }
  });
  it('figé AU TIRAGE sur chaque groupe, champion compris, et une armée d’avant vaut 1', () => {
    const raid = rollRaid(77, 12, 0, 0);
    for (const g of raid.groups) expect(g.threat).toBeCloseTo(earlyThreatMult(12), 10);
    const g = raid.groups[0]!;
    const sans = groupCombatant({ ...g, threat: undefined });
    const avec = groupCombatant(g);
    expect(avec.pv / sans.pv).toBeCloseTo(earlyThreatMult(12), 1);
    expect(avec.damage).toBeGreaterThan(sans.damage);
  });
  it('⚠️ LE DÉFAUT SIGNALÉ : avec 2 aventuriers, un siège des niveaux 8-16 n’est plus gagné d’avance', () => {
    // Mesuré avant : 99 / 95 / 91 / 86 % aux niveaux 8 / 10 / 12 / 16 ; après : 60 / 53 / 54 / 57.
    for (const L of [8, 10, 12, 16]) {
      expect(holdRate(L, L, true, 200, rosterOf(L).slice(0, 2)), `niveau ${L}`).toBeLessThan(80);
    }
  });
  it('…mais ce n’est pas un mur : le vivier complet y tient encore le plus souvent', () => {
    for (const L of [8, 10, 12, 16]) {
      expect(holdRate(L, L, true, 200, rosterOf(L)), `niveau ${L}`).toBeGreaterThan(80);
    }
  });
  it('l’apprentissage tient : au niveau 5, l’enceinte et le héros gagnent presque toujours', () => {
    expect(holdRate(5, 5, true, 200)).toBeGreaterThan(85);
  });
});

describe('seuil de déclenchement des sièges', () => {
  const ready = (b: BaseState, L: number) => raidsEnabled(b, 4, L);
  const withDefs = (wall: number, turret: number): BaseState => {
    const b = emptyBase(9, 0);
    b.defenses = defs(wall, turret);
    return b;
  };

  it('une muraille de niveau 1 chez un joueur de niveau 12 n’allume RIEN', () => {
    // C'est le cas qui punissait le joueur d'avoir fait le premier pas : à cette part,
    // la tenue mesurée est de 0 %.
    expect(ready(withDefs(1, 1), 12)).toBe(false);
  });
  it('une enceinte à MOITIÉ n’allume rien non plus — ce n’est pas un défaut de bas niveau', () => {
    for (const L of [4, 12, 40, 100])
      expect(ready(withDefs(Math.round(L / 2), Math.round(L / 2)), L)).toBe(false);
  });
  it('⚠️ le MINIMUM, pas la moyenne : une muraille parfaite SANS tourelle n’allume rien', () => {
    // Mesuré : mur à niveau + zéro tourelle = 0 % de tenue à TOUS les niveaux. Une
    // moyenne (0,5) laisserait passer ce cas ; le minimum le refuse.
    expect(ready(withDefs(12, 0), 12)).toBe(false);
    expect(ready(withDefs(0, 12), 12)).toBe(false);
  });
  it('une enceinte à niveau, chez un joueur qui s’entraîne, allume les sièges', () => {
    for (const L of [RAID.minRaidLevel, 3, 12, 40, 100])
      expect(ready(withDefs(L, L), L)).toBe(true);
  });
  it('au niveau 1, personne ne vient — même enceinte prête : on apprend d’abord à bâtir', () => {
    expect(RAID.minRaidLevel).toBe(2);
    expect(ready(withDefs(1, 1), 1)).toBe(false);
    expect(ready(withDefs(5, 5), 1)).toBe(false);
  });
  it('le seuil laisse une marge : on n’a pas besoin d’être EXACTEMENT à niveau', () => {
    const L = 20;
    const at = Math.ceil(L * RAID.enableShare);
    expect(ready(withDefs(at, at), L)).toBe(true);
    expect(ready(withDefs(at - 1, at - 1), L)).toBe(false);
  });
  it('un joueur inactif n’est jamais attaqué, même enceinte prête', () => {
    expect(raidsEnabled(withDefs(12, 12), 0, 12)).toBe(false);
  });
  it('monter de niveau sans suivre SUSPEND les sièges — et ils reprennent au rattrapage', () => {
    const b = withDefs(12, 12);
    expect(ready(b, 12)).toBe(true);
    expect(ready(b, 20)).toBe(false); // le joueur a filé, l'enceinte est restée
    b.defenses = defs(20, 20);
    expect(ready(b, 20)).toBe(true); // rattrapé → ça repart, sans arriéré
  });
  it('defenseReadiness est bornée à 1 : sur-monter au-delà de son niveau ne compte pas', () => {
    expect(defenseReadiness(defs(50, 50), 10)).toBe(1);
    expect(defenseReadiness(defs(5, 10), 10)).toBe(0.5); // le minimum des deux
  });
});

describe('les défenses sont un système de DÉBUT de partie', () => {
  it('les 6 structures se débloquent ENSEMBLE, dès le niveau 1', () => {
    // 12 → 3 (v0.723) puis 3 → 1 (v0.823) : bâtir n'expose à rien, ce sont les SIÈGES
    // qui attendent `RAID.minRaidLevel`.
    const levels = new Set(DEFENSE_TYPES.map((t) => t.unlockLevel));
    expect(levels.size).toBe(1);
    expect([...levels][0]).toBe(1);
  });
  it('au premier niveau de siège, bâtir à son niveau AVEC le héros tient le plus souvent', () => {
    // Mesuré (v0.823) : 27 % au niveau 2 avec un plancher de fenêtre à 3 (une armée de
    // niveau 5), 93 % à 2. Le premier siège doit s'apprendre, pas se subir.
    expect(holdRate(RAID.minRaidLevel, RAID.minRaidLevel, true, 300)).toBeGreaterThan(80);
    // …mais il reste un ENJEU : le héros compte.
    expect(holdRate(RAID.minRaidLevel, RAID.minRaidLevel, false, 300)).toBeLessThan(60);
  });
  it('la fenêtre de niveau a un plancher de 2 : jamais d’armée à plus de +2 en tout début', () => {
    expect(levelSpanFor(1)).toBe(RAID.spanMin);
    expect(levelSpanFor(2)).toBe(RAID.spanMin);
    expect(RAID.spanMin).toBe(2);
  });
});

// ── ESPIONNAGE : la Tour achète une PROBABILITÉ, plus une certitude ───────────────
describe('renseignement — du mystère, à tous les niveaux', () => {
  /** Distribution de clarté sur N raids réels, tour à une part donnée du niveau. */
  function clarities(L: number, towerShare: number, n = 300): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const seed = i * 7919 + 11;
      const r = rollRaid(seed, L, 0, 0);
      out.push(scoutClarity(Math.round(L * towerShare), r.level, L, seed));
    }
    return out;
  }

  it('⚠️ LE DÉFAUT D’ORIGINE : la clarté maximale n’est plus SYSTÉMATIQUE', () => {
    // Avant : dès le niveau 20, tour à niveau → 100 % des raids en clarté 5, et ça ne
    // redescendait jamais (le terme `⌊tour/2⌋` valait 50 au niveau 100 pour un cap de 5,
    // donc l'opacité était noyée). Une armée qu'on lit toujours entièrement n'a plus rien
    // d'une menace.
    for (const L of [20, 40, 70, 100]) {
      const max = clarities(L, 1).filter((c) => c === RAID.clarityMax).length;
      expect(max / 300, `niveau ${L}`).toBeLessThan(0.3);
    }
  });
  it('mais l’échelle entière reste ATTEIGNABLE — le haut n’est pas du contenu mort', () => {
    const all = [20, 40, 70, 100].flatMap((L) => clarities(L, 1));
    expect(all.some((c) => c === RAID.clarityMax)).toBe(true);
  });
  it('la TOUR vaut sa PART du niveau joueur : un débutant à niveau n’est plus plafonné', () => {
    // Avant, `⌊tour/2⌋` bornait un joueur de niveau 3 à 1 cran quoi qu'il bâtisse, tandis
    // qu'un vétéran voyait tout : la courbe était à l'envers.
    const petit = clarities(3, 1);
    const moyenne = petit.reduce((a, b) => a + b, 0) / petit.length;
    expect(moyenne).toBeGreaterThan(2);
  });
  it('l’opacité est RELATIVE à la fenêtre : même position = même lecture à tout niveau', () => {
    // Armée au sommet de la fenêtre, tour à niveau, aucun aléa : le résultat ne doit pas
    // dépendre de l'échelle absolue des niveaux.
    const auSommet = (L: number) => scoutClarity(L, L + levelSpanFor(L), L);
    expect(auSommet(20)).toBe(auSommet(100));
    expect(auSommet(12)).toBe(auSommet(40));
    // Et une armée à TON niveau se lit mieux qu'une armée au sommet.
    for (const L of [12, 40]) expect(scoutClarity(L, L, L)).toBeGreaterThan(auSommet(L));
  });
  it('l’aléa est déterministe par graine — même armée, même lecture', () => {
    // ⚠️ Deux appels ne suffisent PAS : l’aléa ne vaut que 0 ou 1 cran, donc un tirage
    // vraiment aléatoire collisionnerait une fois sur deux. On répète largement.
    const ref = scoutClarity(40, 44, 40, 12345);
    for (let i = 0; i < 50; i++) expect(scoutClarity(40, 44, 40, 12345)).toBe(ref);
  });
  it('…mais il VARIE d’un raid à l’autre (sinon ce n’est pas de l’aléa)', () => {
    const vals = new Set(
      Array.from({ length: 40 }, (_, i) => scoutClarity(40, 44, 40, i * 977 + 3)),
    );
    expect(vals.size).toBeGreaterThan(1);
  });
  it('sur-monter la Tour au-delà de son niveau n’achète RIEN — le sport reste le plafond', () => {
    // ⚠️ Le clamp final masque une part non bornée tant que l’opacité est faible : il faut
    // une armée en HAUT de fenêtre pour que la différence apparaisse.
    for (const L of [12, 26, 60]) {
      const haut = L + levelSpanFor(L);
      expect(scoutClarity(L * 8, haut, L)).toBe(scoutClarity(L, haut, L));
    }
  });
  it('sans graine, aucun bruit : les comparaisons de la fiche restent stables', () => {
    expect(scoutClarity(40, 40, 40)).toBe(scoutClarity(40, 40, 40, 0));
  });
  it('sans Tour de guet on ne voit rien, à tout niveau', () => {
    for (const L of [3, 20, 100]) expect(clarities(L, 0).every((c) => c === 0)).toBe(true);
  });
});

describe('⚔️🧱 LES UNITÉS DU SIÈGE — dérivées du vrai état, jamais réinventées', () => {
  // ⚠️ Chaque terme reprend celui de `baseCombatant`. Une seconde formule finirait par
  // diverger du panneau de forces, et les deux mentiraient à tour de rôle.
  const d = (wall: number, turret: number) =>
    [
      { typeId: 'wall', level: wall },
      { typeId: 'turret', level: turret },
    ] as DefenseStructure[];

  describe('la muraille', () => {
    it('ses PV suivent la PART du niveau joueur, comme partout ailleurs', () => {
      const moitie = siegeWallOf(d(14, 14), 28).maxPv;
      const pleine = siegeWallOf(d(28, 28), 28).maxPv;
      expect(moitie).toBeLessThan(pleine);
      expect(moitie).toBeGreaterThan(0);
    });

    it('⚠️ une muraille ENDOMMAGÉE encaisse moins, sans jamais tomber à zéro', () => {
      // Diminuée, jamais annulée : c'est la règle anti-spirale de la v0.661.
      const saine = siegeWallOf(d(28, 28), 28).maxPv;
      const cassee = siegeWallOf(
        [
          { typeId: 'wall', level: 28, damaged: true },
          { typeId: 'turret', level: 28 },
        ] as DefenseStructure[],
        28,
      ).maxPv;
      expect(cassee).toBeLessThan(saine);
      expect(cassee).toBeGreaterThan(0);
    });

    it('sans muraille, il reste un mur SYMBOLIQUE — jamais zéro PV', () => {
      // Un mur à 0 PV serait percé au tour zéro, avant même que quiconque ait frappé.
      expect(siegeWallOf(d(0, 28), 28).maxPv).toBeGreaterThan(0);
    });
  });

  describe('les défenseurs', () => {
    it('les tourelles sont TOUTES là ou aucune — et elles TIRENT', () => {
      const avec = siegeDefenders(d(28, 28), 28, null);
      expect(avec.filter((u) => u.origin === 'turret')).toHaveLength(TURRET_SLOTS);
      expect(avec.every((u) => u.kind === 'ranged')).toBe(true);
      expect(siegeDefenders(d(28, 0), 28, null)).toHaveLength(0);
    });

    it('⚠️ une baliste tient parce que le REMPART LA COUVRE, pas parce qu’elle est épaisse', () => {
      // ⚠️ RÉÉCRIT. Le test épinglait `maxPv > damage × 3` sur les PV BRUTS — vrai du
      // modèle où il fallait gonfler les balistes faute d’abri, faux depuis que le mur
      // les couvre (`armor`). Un joueur l’avait vu : « les tourelles ont plus de vie que
      // le mur ». Une baliste est une MACHINE : elle a des PV et une attaque, mais c’est
      // sa position sur le rempart qui la fait durer.
      const t = siegeDefenders(d(28, 28), 28, null)[0]!;
      expect(t.damage).toBeGreaterThan(0);
      // Elle est ABRITÉE tant que le mur tient — sans quoi « faire taire les tireurs »
      // se réglerait au premier tour.
      expect(t.armor ?? 0).toBeCloseTo(RAID.wallArmorK, 6);
      // Et la DURÉE DE VIE, seule garantie qui compte, se lit abri compris.
      expect(t.maxPv / (1 - (t.armor ?? 0))).toBeGreaterThan(t.damage * 3);
      // ⚠️ Sans mur, plus d’abri du tout : le rempart est la SEULE source de couverture.
      expect(siegeDefenders(d(0, 28), 28, null)[0]!.armor ?? 0).toBe(0);
    });

    it('⚠️ LE MUR PORTE PLUS DE PV QUE TOUTES LES BALISTES RÉUNIES', () => {
      // Signalé par un joueur, et c’est le repère du modèle : la MURAILLE est la
      // structure qui protège — elle n’a qu’un chiffre, des PV — et les tourelles sont
      // des machines posées dessus. Le rapport est arithmétique : `wallPvK` contre
      // `TURRET_SLOTS × turretPvK`. Au-dessus, le rempart cesse d’être le gros du mur.
      expect(RAID.wallPvK).toBeGreaterThan(TURRET_SLOTS * RAID.turretPvK);
      const mur = siegeWallOf(d(28, 28), 28).maxPv;
      const balistes = siegeDefenders(d(28, 28), 28, null)
        .filter((u) => u.origin === 'turret')
        .reduce((n, u) => n + u.maxPv, 0);
      expect(mur).toBeGreaterThan(balistes);
    });

    it('⚠️ le HÉROS tient la brèche au CORPS À CORPS', () => {
      // C'est là que ça se décide ; en faire un tireur le mettrait hors du moment qui compte.
      const hero = refFighter(28);
      const avec = siegeDefenders(d(28, 28), 28, hero);
      const h = avec.find((u) => u.origin === 'hero');
      expect(h?.kind).toBe('melee');
      expect(avec).toHaveLength(TURRET_SLOTS + 1);
    });

    it('la garnison porte SON type — tireur ou homme d’armes', () => {
      const g = [
        { id: 'g1', name: 'Archer', emoji: '🏹', pv: 100, damage: 10, ranged: true },
        { id: 'g2', name: 'Garde', emoji: '🛡️', pv: 200, damage: 20, ranged: false },
      ];
      const def = siegeDefenders(d(28, 28), 28, null, g);
      expect(def.find((u) => u.id === 'g1')?.kind).toBe('ranged');
      expect(def.find((u) => u.id === 'g2')?.kind).toBe('melee');
      expect(def.filter((u) => u.origin === 'adventurer')).toHaveLength(2);
    });

    it('⚠️ TOUT défenseur porte un POSTE — ce que le type ne sait pas exiger', () => {
      // `post` est optionnel sur `SiegeUnit` : il n’a de sens que côté défense, et un
      // type ne sait pas l’exprimer sans union discriminée. Ce qu’il ne garantit pas,
      // ce test le fait — sinon un défenseur sans poste passerait pour non abrité en
      // silence, et personne ne le verrait avant une mesure d’équilibrage.
      const g = [
        { id: 'g1', name: 'Archer', emoji: '🏹', pv: 100, damage: 10, ranged: true },
        { id: 'g2', name: 'Garde', emoji: '🛡️', pv: 200, damage: 20, ranged: false },
      ];
      const def = siegeDefenders(d(28, 28), 28, refFighter(28), g);
      expect(def.length).toBe(TURRET_SLOTS + 3);
      expect(def.every((u) => u.post === 'rampart' || u.post === 'yard')).toBe(true);
    });

    it('⚠️ L’ARCHER EST ABRITÉ EXACTEMENT COMME LA BALISTE — même rempart', () => {
      // Le défaut d’origine : seules les balistes portaient une `armor`. L’archer
      // debout à côté d’elles tirait à découvert, ce qui contredit le modèle — on est
      // mieux protégé sur le mur qu’en bas. L’abri vient du POSTE, donc il est le même
      // pour tout ce qui s’y tient.
      const g = [
        { id: 'g1', name: 'Archer', emoji: '🏹', pv: 100, damage: 10, ranged: true },
        { id: 'g2', name: 'Garde', emoji: '🛡️', pv: 200, damage: 20, ranged: false },
      ];
      const def = siegeDefenders(d(28, 28), 28, null, g);
      const baliste = def.find((u) => u.origin === 'turret')!;
      const archer = def.find((u) => u.id === 'g1')!;
      expect(archer.post).toBe('rampart');
      expect(archer.armor ?? 0).toBeCloseTo(baliste.armor ?? 0, 6);
      expect(archer.armor ?? 0).toBeCloseTo(RAID.wallArmorK, 6);
    });

    it('⚠️ LA COUR NE COUVRE PERSONNE — c’est le prix de tenir la brèche', () => {
      // L’homme d’armes et le héros se battent DANS la base : le rempart ne les abrite
      // pas. C’est ce qui donnera son coût à la descente (étape suivante) — quitter le
      // mur, c’est perdre la couverture.
      const g = [
        { id: 'g1', name: 'Archer', emoji: '🏹', pv: 100, damage: 10, ranged: true },
        { id: 'g2', name: 'Garde', emoji: '🛡️', pv: 200, damage: 20, ranged: false },
      ];
      const def = siegeDefenders(d(28, 28), 28, refFighter(28), g);
      const garde = def.find((u) => u.id === 'g2')!;
      const heros = def.find((u) => u.origin === 'hero')!;
      expect(garde.post).toBe('yard');
      expect(heros.post).toBe('yard');
      expect(garde.armor ?? 0).toBe(0);
      expect(heros.armor ?? 0).toBe(0);
    });

    it('⚠️ SANS MURAILLE, le rempart n’abrite plus personne — archer compris', () => {
      // Le rempart est la SEULE source de couverture : pas de mur, pas d’abri, quel que
      // soit le poste. Le test existant ne le vérifiait que sur la baliste.
      const g = [
        { id: 'g1', name: 'Archer', emoji: '🏹', pv: 100, damage: 10, ranged: true },
        { id: 'g2', name: 'Garde', emoji: '🛡️', pv: 200, damage: 20, ranged: false },
      ];
      const def = siegeDefenders(d(0, 28), 28, null, g);
      expect(def.find((u) => u.id === 'g1')?.post).toBe('rampart');
      expect(def.every((u) => (u.armor ?? 0) === 0)).toBe(true);
    });

    it('⚠️ UN PAN, UNE BALISTE — et les deux constantes vivent dans des fichiers différents', () => {
      // `TURRET_SLOTS` (raid.ts) et `BATTLE.sectors` (siegeBattle.ts) décrivent la MÊME
      // enceinte. Rien dans les types ne les tient d’accord : ce test le fait.
      expect(BATTLE.sectors).toBe(TURRET_SLOTS);
    });

    it('⚠️ LES PORTÉES SONT DES FRACTIONS DU TERRAIN, jamais des pas écrits à la main', () => {
      // La baliste couvre le terrain ENTIER — c’est son métier, et le repère à partir
      // duquel tout le reste se lit. Changer `fieldDepth` déplace donc tout le monde
      // ensemble : une mutation qui fige une portée en dur fait tomber ce test.
      const g = [
        { id: 'g1', name: 'A', emoji: '🏹', pv: 100, damage: 10, ranged: true },
        { id: 'g2', name: 'G', emoji: '🛡️', pv: 100, damage: 10, ranged: false },
      ];
      const d0 = siegeDefenders(d(28, 28), 28, hero(28), g);
      const bal = d0.find((u) => u.origin === 'turret')!;
      expect(bal.range).toBe(BATTLE.fieldDepth);
      expect(d0.find((u) => u.id === 'g1')!.range).toBe(
        Math.round(BATTLE.fieldDepth * RAID.archerRangeShare),
      );
      // Un homme d’armes et le héros ne portent qu’au CONTACT.
      expect(d0.find((u) => u.id === 'g2')!.range).toBe(0);
      expect(d0.find((u) => u.origin === 'hero')!.range).toBe(0);
      // ⚠️ L’archer du rempart porte MOINS LOIN que la baliste, et le tireur assaillant
      // moins loin encore : il vise vers le HAUT. C’est l’ordre qui fait la stratification.
      expect(RAID.archerRangeShare).toBeLessThan(1);
      expect(RAID.foeRangeShare).toBeLessThan(RAID.archerRangeShare);

      // ⚠️ ET ON ÉPROUVE LA DÉRIVATION ELLE-MÊME, en déplaçant le terrain. Sans ça une
      // portée écrite en dur (`range: 6`) passait au VERT, puisqu’elle vaut justement
      // `fieldDepth` aujourd’hui : le test aurait épinglé un NOMBRE au lieu d’un LIEN.
      // Mutation vérifiée — c’est la seule façon de distinguer les deux.
      const vrai = BATTLE.fieldDepth;
      try {
        (BATTLE as { fieldDepth: number }).fieldDepth = vrai * 2;
        const d2 = siegeDefenders(d(28, 28), 28, null, g);
        expect(d2.find((u) => u.origin === 'turret')!.range).toBe(vrai * 2);
        expect(d2.find((u) => u.id === 'g1')!.range).toBe(
          Math.round(vrai * 2 * RAID.archerRangeShare),
        );
        // Les ASSAILLANTS suivent le même repère.
        const a2 = siegeAttackers(rollRaid(7919, 28, 0, 0));
        expect(a2.every((u) => u.dist === vrai * 2)).toBe(true);
      } finally {
        (BATTLE as { fieldDepth: number }).fieldDepth = vrai;
      }
    });

    it('⚠️ CHAQUE BALISTE EST FIXÉE À SON SOMMET — un secteur distinct par machine', () => {
      const t = siegeDefenders(d(28, 28), 28, null).filter((u) => u.origin === 'turret');
      expect(new Set(t.map((u) => u.sector)).size).toBe(TURRET_SLOTS);
      // Les défenseurs HUMAINS, eux, n’ont pas de secteur : ils marchent le long du mur.
      const g = [{ id: 'g1', name: 'A', emoji: '🏹', pv: 100, damage: 10, ranged: true }];
      const arc = siegeDefenders(d(28, 28), 28, null, g).find((u) => u.id === 'g1')!;
      expect(arc.sector).toBeUndefined();
    });
  });

  describe('les assaillants', () => {
    const raid = rollRaid(7919, 28, 0, 0);

    it('⚠️ L’ARMÉE SE MASSE, elle n’encercle pas — un groupe par pan, contigus', () => {
      // Elle marche : son front est CONTIGU, et sa largeur est DÉRIVÉE du nombre de
      // groupes plutôt qu’inventée. Une grosse armée s’étale donc davantage et affronte
      // plus de balistes — elle se borne toute seule.
      for (let s = 1; s < 40; s++) {
        const r = rollRaid(s * 7919, 28, 0, 0);
        const u = siegeAttackers(r);
        const pans = [...new Set(u.map((x) => x.sector!))].sort((x, y) => x - y);
        expect(pans).toHaveLength(r.groups.length);
        // Contigus SUR L’ANNEAU : les pans consécutifs modulo le tour complet.
        const contigu = pans.every(
          (p, i) => i === 0 || (p - pans[i - 1]! + BATTLE.sectors) % BATTLE.sectors === 1,
        );
        const enroule = (pans[0]! - pans[pans.length - 1]! + BATTLE.sectors) % BATTLE.sectors === 1;
        expect(contigu || enroule).toBe(true);
      }
    });

    it('⚠️ TOUT LE MONDE PART DU BORD DU TERRAIN', () => {
      // Sans la traversée, l’armée frappait dès le premier tour et la portée n’aurait
      // rien voulu dire.
      const u = siegeAttackers(rollRaid(7919, 28, 0, 0));
      expect(u.every((x) => x.dist === BATTLE.fieldDepth)).toBe(true);
      // Un homme d’armes ne porte qu’au contact ; un tireur, à une fraction du terrain.
      const cac = u.filter((x) => x.kind === 'melee');
      expect(cac.every((x) => x.range === 0)).toBe(true);
      const tir = u.filter((x) => x.kind === 'ranged');
      expect(tir.length).toBeGreaterThan(0);
      expect(tir.every((x) => x.range === Math.round(BATTLE.fieldDepth * RAID.foeRangeShare))).toBe(
        true,
      );
    });

    it('un corps par assaillant VISIBLE', () => {
      const total = raid.groups.reduce((n, g) => n + g.count, 0);
      expect(siegeAttackers(raid)).toHaveLength(total);
    });

    it('⚠️ la MASSE est diluée comme dans groupCombatant — les dégâts en RACINE', () => {
      // Éclater un groupe en corps sans reprendre ce chemin ferait frapper une armée
      // nombreuse bien plus fort qu'elle ne le doit (`groupDmgExp`, v0.661).
      const att = siegeAttackers(raid);
      for (const g of raid.groups) {
        const corps = att.filter((u) => u.name === g.species && !!u.emoji);
        if (!corps.length) continue;
        const somme = corps.slice(0, g.count).reduce((s, u) => s + u.damage, 0);
        const agrege = groupCombatant(g).damage;
        // À l'arrondi près : la part par corps est arrondie une fois chacune.
        expect(Math.abs(somme - agrege) / Math.max(1, agrege)).toBeLessThan(0.2);
      }
    });

    it('⚠️ la PUISSANCE DE FEU d’un groupe ne dépend pas non plus de sa silhouette', () => {
      // ⚠️ Test ajouté après une mutation passée au VERT : retirer `silhouetteDmgMult` du
      // calcul ne faisait tomber AUCUN des 1168 tests, alors que `raid.ts` la présente comme
      // « une IDENTITÉ dérivée, pas un coefficient ajusté ». Elle existe parce que les PV
      // d’un groupe suivent son effectif quand ses dégâts n’en suivent que la RACINE : sans
      // elle, une horde à masse égale frappait 24 % moins fort qu’une bande d’élite (mesuré
      // v0.761). L’iso-menace statistique ne l’attrapait pas — elle mesure une PROBABILITÉ,
      // qui sature ; on épingle donc l’identité elle-même.
      const feu = (unitMult: number) => {
        const g = {
          species: 'T',
          emoji: '🗡️',
          count: Math.round(24 / unitMult), // masse conservée : countMult × unitMult ≈ 1
          level: 20,
          unitMult,
          massMult: 1,
          kind: 'melee' as const,
        };
        return siegeAttackers({ ...raid, groups: [g] } as typeof raid).reduce(
          (t, u) => t + u.damage,
          0,
        );
      };
      const horde = feu(FACTION_PROFILE.betes.unitMult);
      const elite = feu(FACTION_PROFILE.bandits.unitMult);
      expect(Math.abs(horde - elite) / Math.max(horde, elite)).toBeLessThan(0.1);
    });

    it('⚠️ la PLACE au pied du mur rend la frappe INDIFFÉRENTE à la silhouette', () => {
      // Sans `bulk`, le goulot comptait des TÊTES et rendait les hordes inoffensives.
      //
      // ⚠️ CE TEST ÉPINGLAIT LA FORMULE (`unitMult^(2−groupDmgExp)`) — donc il verrouillait
      // le défaut au lieu de le voir. Cet exposant DOUBLE-COMPTAIT l'annulation que
      // `silhouetteDmgMult` fait déjà : mesuré, une horde emportait 39 à 50 % de rempart
      // de plus qu'une bande d'élite à masse égale. On teste désormais la PROPRIÉTÉ —
      // ce que le front délivre en un tour ne doit pas dépendre de la silhouette — et
      // n'importe quel exposant faux la fait tomber, y compris celui qui était livré.
      const frappe = (unitMult: number) => {
        // Masse conservée : c'est l'hypothèse de l'invariant (countMult × unitMult ≈ 1).
        const g = {
          species: 'T',
          emoji: '🗡️',
          count: Math.round(24 / unitMult),
          level: 20,
          unitMult,
          massMult: 1,
          kind: 'melee' as const,
        };
        const att = siegeAttackers({ ...raid, groups: [g] } as typeof raid);
        let place = BATTLE.wallFront;
        let dmg = 0;
        for (const a of att) {
          if (place <= 0) break;
          place -= Math.max(0.05, a.bulk ?? 1);
          dmg += a.damage;
        }
        return dmg;
      };
      const horde = frappe(FACTION_PROFILE.betes.unitMult);
      const elite = frappe(FACTION_PROFILE.bandits.unitMult);
      expect(Math.abs(horde - elite) / Math.max(horde, elite)).toBeLessThan(0.15);
      // Et la silhouette n’est pas neutre pour autant : une horde a des corps plus menus,
      // donc il en tient DAVANTAGE au pied du mur — chacun frappant d’autant moins fort.
      expect(FACTION_PROFILE.betes.unitMult).toBeLessThan(FACTION_PROFILE.bandits.unitMult);
      const att = siegeAttackers(raid);
      expect(att.every((u) => (u.bulk ?? 0) > 0)).toBe(true);
    });

    it('⚠️ le CHAMPION est plus solide À NIVEAU ÉGAL — sinon on teste son niveau', () => {
      // Test refait après une mutation passée au VERT : dans une vraie armée le champion
      // est AUSSI d’un niveau plus élevé, donc il reste le plus solide même sans son
      // multiplicateur. On construit donc deux groupes RIGOUREUSEMENT identiques, où
      // seul le drapeau `champion` diffère.
      const base = {
        species: 'Troupe',
        emoji: '🗡️',
        count: 1,
        level: 20,
        unitMult: 1,
        massMult: 1,
        kind: 'melee' as const,
      };
      const duo = {
        ...raid,
        groups: [base, { ...base, species: 'Chef', champion: true }],
      } as typeof raid;
      const att = siegeAttackers(duo);
      const troupe = att.find((u) => u.name === 'Troupe')!;
      const chef = att.find((u) => u.name === 'Chef')!;
      expect(chef.maxPv / troupe.maxPv).toBeCloseTo(RAID.championPvMult, 1);
      expect(chef.damage / troupe.damage).toBeCloseTo(RAID.championDmgMult, 1);
    });
  });
});

describe('⚔️ CE QU’ON APPREND EN DÉFENDANT', () => {
  // ⚠️ Demandé par l’utilisateur. Les familiers postés gagnaient de l’XP à chaque siège
  // depuis la v0.663, les aventuriers non — alors qu’ils tiennent la brèche. Rester
  // défendre coûtait donc un convoi ET la progression qui va avec.
  const adv = (level: number): Adventurer => ({
    id: 'a',
    name: 'a',
    seed: 1,
    path: ['guerrier', 'epeiste'],
    level,
    xp: 0,
  });
  /** Un rapport minimal : seuls les champs que `siegeXp` lit comptent ici. */
  const rep = (groups: { count: number; level: number }[], defeated: number) =>
    ({ groups, defeated, total: groups.length }) as unknown as RaidReport;

  it('⚠️ ON APPREND MÊME EN PERDANT — perdre punit déjà assez', () => {
    // Une défaite coûte le stock, les réparations et la production gelée. N’avoir rien
    // appris en plus punirait deux fois — et c’est le joueur qui subit ses premiers
    // sièges qui a le plus besoin de progresser. Même règle que les convois.
    const perdu = siegeXp(adv(20), rep([{ count: 8, level: 20 }], 0));
    const gagne = siegeXp(adv(20), rep([{ count: 8, level: 20 }], 1));
    // ⚠️ « > 0 » NE PROUVAIT RIEN : le plancher `Math.max(1, …)` le garantit tout seul, et
    // la mutation « supprimer la part de consolation » passait au VERT. On affirme donc
    // la VALEUR — la défaite vaut exactement sa part, adossée à la constante du projet.
    expect(perdu / gagne).toBeCloseTo(RAID.xpFloorShare / (RAID.xpFloorShare + 1), 2);
    // …et repousser rapporte NETTEMENT plus : la part repoussée module le gain.
    expect(gagne).toBeGreaterThan(perdu * 2);
  });

  it('⚠️ RENDEMENT DÉCROISSANT : une armée de bleus n’apprend rien à un vétéran', () => {
    // Sans ça, un aventurier de haut niveau engrangerait sur des sièges qui ne lui
    // demandent rien — c’est le garde-fou de `missionXp`, repris tel quel.
    const petit = siegeXp(adv(60), rep([{ count: 10, level: 6 }], 1));
    const taille = siegeXp(adv(60), rep([{ count: 10, level: 60 }], 1));
    expect(petit * 10).toBeLessThan(taille);
  });

  it('⚠️ LE NIVEAU DE L’ARMÉE EST PONDÉRÉ PAR LES EFFECTIFS', () => {
    // Un champion seul de haut niveau ne doit pas faire passer une horde de bleus pour
    // une élite : c’est la masse qu’on a affrontée qui décide, pas le plus gros nom.
    const horde = rep(
      [
        { count: 40, level: 5 },
        { count: 1, level: 80 },
      ],
      2,
    );
    const elite = rep(
      [
        { count: 40, level: 80 },
        { count: 1, level: 80 },
      ],
      2,
    );
    expect(siegeXp(adv(40), horde) * 3).toBeLessThan(siegeXp(adv(40), elite));
  });

  it('une armée sans personne ne donne rien', () => {
    expect(siegeXp(adv(20), rep([], 0))).toBe(0);
    expect(siegeXp(adv(20), rep([{ count: 0, level: 20 }], 0))).toBe(0);
  });
});

describe('🏥 AUCUN NIVEAU MORT — l’Infirmerie jusqu’à 100', () => {
  // ⚠️ Signalé par l’utilisateur (« l’infirmerie est déjà au max ; il faut que chaque
  // bâtiment apporte quelque chose à chaque niveau jusqu’au 100 »). Mesuré : ses DEUX
  // leviers touchaient un plancher DUR aux niveaux 14 et 15 — 85 niveaux sur 100 payés
  // au prix quadratique pour rien. (La fatigue des familiers, son second levier, est
  // partie avec les compagnons des champions, v0.996.)
  const leviers: [string, (l: number) => number][] = [
    ['convalescence du héros', (l) => woundMsFor(l)],
  ];

  it('⚠️ CHAQUE niveau raccourcit encore, de 1 à 100', () => {
    for (const [nom, f] of leviers) {
      for (let l = 1; l <= 100; l++) {
        // Strictement décroissant : un palier qui ne change rien est le défaut qu'on corrige.
        expect(f(l), `${nom} au niveau ${l}`).toBeLessThan(f(l - 1));
      }
    }
  });

  it('⚠️ ON PROLONGE, ON NE REDISTRIBUE PAS : rien ne bouge jusqu’au plafond', () => {
    // La condition non négociable de la v0.731 : personne ne se réveille avec une
    // infirmerie MOINS bonne qu'hier. On épingle l'ancienne formule sous le plafond.
    const avantW = (l: number) => Math.round(RAID.woundMs * Math.max(0.2, 1 - l * 0.06));
    for (let l = 0; l <= 13; l++) expect(woundMsFor(l)).toBe(avantW(l));
  });

  it('⚠️ UNE ASYMPTOTE, PAS UNE PENTE : se soigner n’est jamais gratuit', () => {
    // Sans cette borne, un siège perdu finirait par ne plus rien coûter — et la
    // convalescence est précisément ce qui donne du poids à la défaite.
    for (const [nom, f] of leviers) {
      expect(f(100), nom).toBeGreaterThan(0);
      // La queue reste SOUS le plancher : elle en retire une part, jamais la totalité.
      expect(f(100_000), nom).toBeGreaterThan(f(0) * 0.05);
    }
  });
});

describe('🛡️ LE RENFORT DE SIÈGE D’UN DÉFENSEUR (v0.801, recalibré v0.952)', () => {
  // ⚠️ IL A CHANGÉ DE SENS AVEC LES CHAMPIONS, et le dire vaut mieux que garder un titre
  // devenu faux. Né en v0.801, `guardSiegeK` valait 1,25 : « un aventurier vaut PLUS
  // derrière ses murs », parce qu’il progressait linéairement quand l’armée suit ~L⁴.
  // Les champions ayant à peu près DOUBLÉ la force du vivier (mesuré v0.943 : la tenue
  // gagnait +5 à +27 points, et l’enceinte pleine repassait à 100 % aux niveaux 12-28 —
  // le défaut que la v0.789 avait corrigé), le coefficient est descendu à 0,9. Ce n’est
  // donc plus une prime de terrain mais le RÉGLAGE qui reproduit la difficulté d’avant —
  // écarts −7 à +9 points, dans le bruit d’un échantillon de 120.
  // ⚠️ Il vit au SIÈGE seul : la calibration mesurée des embuscades n’en voit rien.
  it('ses PV et ses dégâts de siège valent ceux de la route × guardSiegeK', () => {
    const adv = refChampionAdv(40, 0);
    const [g] = guardUnits(40, [adv], 99, {
      now: 0,
      kennelLevel: 40,
      familiars: [],
      talents: [],
      advGear: [],
    });
    // ⚠️ RÉÉCRIT (compétences au siège) : la base est désormais le combattant SANS ses
    // compétences, multiplié par ce qu’elles ajoutent (`skillMults`). Ce qui reste vrai :
    // le renfort s’applique aux DEUX canaux, sans quoi un défenseur serait plus solide
    // mais pas plus mordant, ou l’inverse.
    const nu = escortCombatant([adv], adv.name, {}, false);
    const k = skillMults(adv);
    // ⚠️ On n’épingle PLUS un sens (« > 1 ») : c’est un réglage, et il a déjà traversé 1.
    expect(RAID.guardSiegeK).not.toBe(1);
    expect(g!.pv).toBe(Math.max(1, Math.round(nu.pv * RAID.guardSiegeK * k.pv)));
    expect(g!.damage).toBe(
      Math.max(1, Math.round(nu.damage * (nu.strikes ?? 1) * RAID.guardSiegeK * k.damage)),
    );
  });
});

describe('⚔️ LES COMPÉTENCES D’UN CHAMPION COMPTENT AU SIÈGE', () => {
  const nus = { now: 0, kennelLevel: 40, familiars: [], talents: [], advGear: [] };
  const champ = (id: string, level = 40, copies = 1): Adventurer =>
    ({
      id: `c-${id}`,
      name: id,
      seed: 1,
      path: [],
      level,
      xp: 0,
      championId: id,
      copies,
    }) as Adventurer;
  /** Le même champion privé de ses compétences, par la même règle que le jeu. */
  const sansComp = (a: Adventurer) => {
    const c = escortCombatant([a], a.name, {}, false);
    return {
      pv: Math.round(c.pv * RAID.guardSiegeK),
      damage: Math.round(c.damage * (c.strikes ?? 1) * RAID.guardSiegeK),
    };
  };
  const CONDITIONNELLES = [
    'crit_pct',
    'execute_pct',
    'rage_pct',
    'momentum_pct',
    'lifesteal_pct',
    'thorns_pct',
  ];

  // ⚠️ LE DÉFAUT D'ORIGINE : critique, exécution, rage, élan, épines et vol de vie ne
  // valaient RIEN au siège. Chaque champion qui en porte une doit défendre mieux avec.
  it.each(
    CHAMPIONS.filter((c) => c.skills.some((s) => CONDITIONNELLES.includes(s))).map((c) => c.id),
  )('%s défend mieux avec ses compétences', (id) => {
    const a = champ(id);
    const [g] = guardUnits(40, [a], 99, nus);
    const s = sansComp(a);
    expect(g!.damage * g!.pv).toBeGreaterThan(s.damage * s.pv);
  });

  it('une compétence de SURVIE renforce les PV de l’unité, pas seulement ses dégâts', () => {
    const tank = CHAMPIONS.filter((c) => c.skills.includes('max_pv_pct'));
    expect(tank.length).toBeGreaterThan(0);
    for (const c of tank) {
      const a = champ(c.id);
      const [g] = guardUnits(40, [a], 99, nus);
      expect(g!.pv).toBeGreaterThan(sansComp(a).pv);
    }
  });

  it('les multiplicateurs sont ceux de l’arbitre du jeu (offenseOf / survivalOf)', () => {
    for (const c of CHAMPIONS) {
      const a = champ(c.id);
      const avec = escortCombatant([a], a.name);
      const sans = escortCombatant([a], a.name, {}, false);
      const k = skillMults(a);
      expect(k.damage).toBeCloseTo(offenseOf(avec) / offenseOf(sans), 9);
      expect(k.pv).toBeCloseTo(survivalOf(avec) / survivalOf(sans), 9);
      expect(k.damage).toBeGreaterThanOrEqual(1);
      expect(k.pv).toBeGreaterThanOrEqual(1);
    }
  });

  it('l’Éveil d’une compétence se sent au siège', () => {
    const c = CHAMPIONS.find((x) => x.awaken.length > 0)!;
    const eveil = c.awaken.reduce((m, x) => Math.max(m, x.at), 0);
    // On compare les MULTIPLICATEURS : les stats montent aussi avec l'Éveil, et c'est la
    // compétence montée qu'on veut isoler.
    const k0 = skillMults(champ(c.id, 40, 1));
    const k1 = skillMults(champ(c.id, 40, 1 + eveil));
    expect(k1.damage * k1.pv).toBeGreaterThan(k0.damage * k0.pv);
  });

  it('un aventurier SANS compétence n’a aucun multiplicateur', () => {
    const recrue = { id: 'r', name: 'r', seed: 1, path: [], level: 30, xp: 0 } as Adventurer;
    expect(skillMults(recrue)).toEqual({ damage: 1, pv: 1 });
  });
});

describe('🏥 infirmerie des aventuriers', () => {
  const ctx0 = { advGear: [] };
  it('un siège PERDU envoie à l’infirmerie les AVENTURIERS tombés — jamais une baliste ni le héros', () => {
    const L = 28;
    const advs = rosterOf(L);
    const ids = new Set(advs.map((a) => a.id));
    let lost = 0;
    let withHurt = 0;
    for (let i = 0; i < 80; i++) {
      const raid = rollRaid(i * 7919 + 13, L, 0, 0);
      const rep = resolveRaid(
        {
          defenses: defs(12, 12),
          playerLevel: L,
          hero: hero(L),
          guard: guardUnits(L, advs, 99, ctx0),
        },
        raid,
        0,
        true,
      );
      const hurt = siegeHurtIds(rep);
      for (const id of rep.wounded ?? []) expect(ids.has(id), id).toBe(true);
      if (rep.held) {
        expect(hurt).toEqual([]);
      } else {
        lost++;
        expect(hurt).toEqual(rep.wounded);
        if (hurt.length) withHurt++;
      }
    }
    expect(lost).toBeGreaterThan(0);
    expect(withHurt).toBeGreaterThan(0);
  });

  it('une victoire relève ceux qui étaient tombés, et un rapport d’avant n’envoie personne', () => {
    const rep = { held: true, wounded: ['a1'] } as never;
    expect(siegeHurtIds(rep)).toEqual([]);
    expect(siegeHurtIds({ held: false, wounded: ['a1', 'a2'] } as never)).toEqual(['a1', 'a2']);
    expect(siegeHurtIds({ held: false } as never)).toEqual([]);
  });

  it('les soins d’un aventurier coûtent le tarif du héros, et rien s’il est sur pied', () => {
    const H = 3600_000;
    const adv = { ...rosterOf(10)[0]!, hurtUntil: 3 * H };
    expect(advHurtMs(adv, H)).toBe(2 * H);
    expect(advHealCost(adv, H, 28)).toBe(healCost(2 * H, 28));
    expect(advHealCost(adv, 3 * H, 28)).toBe(0);
    expect(advHealCost({ ...adv, hurtUntil: undefined }, 0, 28)).toBe(0);
  });

  it('la liste des blessés : seuls les alités, le plus long repos d’abord', () => {
    const [a, b, c] = rosterOf(10);
    const list = woundedAdventurers(
      [
        { ...a!, hurtUntil: 50 },
        { ...b!, hurtUntil: 500 },
        { ...c!, hurtUntil: 5 },
      ],
      10,
    );
    expect(list.map((x) => x.id)).toEqual([b!.id, a!.id]);
  });
});

describe('🗿 LE PLAFOND D’ENGAGEMENT — ce qui AGIT est borné, pas ce qu’on possède', () => {
  const ctx0 = { advGear: [] };
  /** Un vivier de n champions de niveaux DÉCROISSANTS : le plus fort en dernier, pour que
   *  « garder les n premiers » et « garder les n plus forts » ne se confondent pas. */
  const vivier = (n: number, lvl = 40) =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(Math.max(1, lvl - (n - 1 - i) * 3), i),
      id: `p${i}`,
      name: `P${i}`,
    }));

  it('ne coupe RIEN tant que le vivier tient dans le plafond', () => {
    const v = vivier(4);
    expect(rampartGuard(v, 4, ctx0)).toBe(v);
    expect(rampartGuard(v, 9, ctx0)).toBe(v);
  });

  it('⚠️ GARDE LES PLUS FORTS, pas les premiers venus', () => {
    // Un `slice` nu prendrait les premiers du vivier — donc l'ordre de recrutement
    // déciderait de qui tient les murs, et le meilleur champion resterait à la porte.
    const v = vivier(8);
    const pow = adventurerPowers(v, ctx0);
    const gardes = rampartGuard(v, 3, ctx0);
    expect(gardes).toHaveLength(3);
    const dehors = v.filter((a) => !gardes.includes(a));
    const pire = Math.min(...gardes.map((a) => pow.get(a.id)!));
    for (const a of dehors) expect(pow.get(a.id)!).toBeLessThanOrEqual(pire);
  });

  it('⚠️ TRI STABLE : recruter quelqu’un ne rebat pas la garnison en silence', () => {
    // À puissance égale on départage par id, jamais par l'ordre du vivier.
    const v = vivier(6, 20).map((a, i) => ({ ...a, ...refChampionAdv(20, i % 2), id: `p${i}` }));
    const a = rampartGuard(v, 3, ctx0).map((x) => x.id);
    const b = rampartGuard([...v].reverse(), 3, ctx0).map((x) => x.id);
    expect(a).toEqual(b);
  });

  it('⚠️ `guardUnits` APPLIQUE la coupe — c’est LÀ que l’anti-runaway tient', () => {
    // La collection est illimitée (un gacha), donc si le combat prenait tout le vivier,
    // la base deviendrait imprenable : mesuré, 11 % de tenue à 0 champion contre 100 % à
    // 20 au niveau 12. La coupe vit au point de passage unique du combat.
    expect(guardUnits(40, vivier(80), 5, ctx0)).toHaveLength(5);
    expect(guardUnits(40, vivier(3), 5, ctx0)).toHaveLength(3);
  });

  it('⚠️ UN VIVIER IMMENSE NE CHANGE RIEN À LA BATAILLE, au-delà du plafond', () => {
    // La garantie de bout en bout : 80 champions et les 5 retenus livrent EXACTEMENT le
    // même siège. C'est ce qui rend la collection sans danger pour l'équilibrage.
    const L = 40;
    const grand = vivier(80, L);
    const retenus = rampartGuard(grand, 5, ctx0);
    const raid = rollRaid(4242, L, 0, 0);
    const run = (advs: Adventurer[]) =>
      resolveRaid(
        {
          defenses: defs(L, L),
          playerLevel: L,
          hero: hero(L),
          guard: guardUnits(L, advs, 5, ctx0),
        },
        raid,
        0,
        true,
      );
    const a = run(grand);
    const b = run(retenus);
    expect(a.held).toBe(b.held);
    expect(a.wallLeft).toBe(b.wallLeft);
  });
});
