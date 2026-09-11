import { describe, it, expect, afterEach } from 'vitest';
import { HARVEST } from '@/lib/expedition';
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
  resolveRaid,
  guardUnits,
  siegeXp,
  raidDamage,
  corpsesFrom,
  lootCorpses,
  advanceBase,
  applyRaidOutcome,
  emptyBase,
  raidsEnabled,
  defenseReadiness,
  scavengerCount,
  scavengeMs,
  advanceScavenging,
  pickScavengeTargets,
  turretCount,
  repairCost,
  defenseUpgradeCost,
  defenseUpgradeScrap,
  TURRET_SLOTS,
  RAID,
  repairStructure,
  totalRepairCost,
  garrisonBonus,
  duplicateFamiliars,
  garrisonSlots,
  garrisonRankCap,
  garrisonNextSlotLevel,
  GARRISON_ROLE,
  garrisonRankLabel,
  canGarrison,
  raidThreatSize,
  type RaidReport,
  type BattleField,
  defensePerLevelLabel,
  fmtSpan,
  DEFENSE_TYPES,
  type DefenseId,
  autoGarrison,
  dedupeGarrisonRoles,
  fatigueMsFor,
  woundMsFor,
  woundRemainingMs,
  heroAvailable,
  healCost,
  isWounded,
  WOUND_MAX_MS,
  GARRISON_CAP,
  SCAV,
  FACTION_PROFILE,
  type BaseState,
  type DefenseStructure,
  type RaidFaction,
  groupKind,
  siegeWallOf,
  siegeDefenders,
  siegeAttackers,
} from '@/lib/raid';

/** Places de garnison pour les tests courts — ce que le repli implicite rendait
 *  autrefois. ⚠️ La valeur est désormais TOUJOURS explicite : c'est ce repli qui avait
 *  permis au store de ne compter que 3 familiers pendant que l'écran en affichait 6. */
import { refFighter, gearExpect } from '@/lib/proceduralContent';
import {
  rankCeilingForLevel,
  RANK_ORDER,
  RARITY_MULT,
  rollFamiliar,
  famLevel,
  famAtkMult,
  famXpForLevel,
  grantFamiliarXp,
  type Item,
} from '@/lib/items';
import type { Combatant } from '@/lib/combat';
import { PROMO_LEVELS, type Adventurer } from '@/lib/adventurers';
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

function holdRate(playerLevel: number, defLevel: number, heroHome: boolean, n = 200): number {
  let held = 0;
  for (let i = 0; i < n; i++) {
    const raid = rollRaid(i * 7919 + 13, playerLevel, 0, 0);
    const base = {
      defenses: defs(defLevel, defLevel),
      playerLevel,
      hero: heroHome ? hero(playerLevel) : null,
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
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThan(12);
  });

  it('l’effectif reste entièrement fouillable avant que les corps pourrissent', () => {
    // Le joueur doit pouvoir tout ramasser en quelques vagues : « 100 cadavres pour
    // 3 fouilleurs » serait frustrant, pas impressionnant.
    for (const L of [15, 26, 50, 100]) {
      const worst = raidSize(L, 'betes');
      const waves = Math.ceil(worst / scavengerCount(L));
      expect(waves * SCAV.dispatchMs).toBeLessThan(SCAV.fieldMs);
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
  it('bâtir à son niveau tient le plus souvent ; négliger ses murs se paie', () => {
    for (const L of [15, 20, 26, 40, 60, 90]) {
      expect(holdRate(L, L, false), `niveau ${L}, défenses à niveau`).toBeGreaterThan(50);
      expect(holdRate(L, L - 5, false), `niveau ${L}, défenses en retard`).toBeLessThan(
        holdRate(L, L, false),
      );
      // ⚠️ On ne teste PLUS un scénario « sur-investi » (défenses au-dessus du niveau du
      // joueur) : il est inatteignable en jeu — `upgradeDefense` refuse de dépasser ton
      // niveau, exactement comme les bâtiments. Bâtir À son niveau EST le maximum.
    }
  });

  it('la défense DÉGRADE en pente, pas en falaise', () => {
    // Calculée sur le refFighter de la STRUCTURE, l'enceinte payait l'écart de façon
    // exponentielle (l'offense d'un refFighter croît en ~L⁴) : mesuré, 0 % de tenue
    // jusqu'à 19, 24 % à 22, 78 % à 26 — une falaise. Elle vaut désormais une FRACTION
    // de ce que le niveau du joueur justifie, donc une enceinte à moitié montée vaut
    // à peu près la moitié.
    const L = 26;
    const demi = holdRate(L, Math.round(L * 0.5), true);
    const troisQuarts = holdRate(L, Math.round(L * 0.75), true);
    const plein = holdRate(L, L, true);
    expect(demi, 'à moitié montée, on a une vraie chance').toBeGreaterThan(15);
    expect(troisQuarts).toBeGreaterThan(demi);
    expect(plein).toBeGreaterThan(troisQuarts);
    // …et l'écart entre deux paliers reste mesuré (pas de marche d'escalier).
    expect(plein - troisQuarts).toBeLessThan(45);
  });

  it('💰 l’enceinte est PAYABLE : elle n’a pas la courbe des bâtiments de production', () => {
    // Réutiliser `buildingUpgradeCost` (calée sur des bâtiments financés par toute
    // l'économie) demandait 1,82 M d'or pour monter mur + tourelles au niveau 26 : le
    // système était injouable. Cible : ~10 récoltes de mine.
    let or = 0;
    let fer = 0;
    for (let l = 1; l < 26; l++) {
      or += defenseUpgradeCost(l);
      fer += defenseUpgradeScrap(l);
    }
    expect(2 * or, 'or pour mur + tourelles jusqu’au niveau 26').toBeLessThan(400_000);
    expect(2 * or).toBeGreaterThan(80_000); // …mais ça reste un vrai investissement
    // ⚠️ FOURCHETTE LARGE, ET C'EST VOULU. Ce test dit seulement que la ferraille est un
    // coût RÉEL sans être un mur ; l'équilibre fin — « plus dure à obtenir que l'or » —
    // appartient à `scrapEconomy.test.ts`, qui le mesure en jours réels avec les vraies
    // sources. Une borne serrée ici ne verrouillerait rien d'utile : elle se contenterait
    // de casser à chaque réglage (elle était à 1 200 quand la ferraille ne freinait rien).
    expect(2 * fer, 'ferraille pour la même montée').toBeLessThan(4000);
    expect(2 * fer, 'ferraille pour la même montée').toBeGreaterThan(1500);
    expect(defenseUpgradeCost(20)).toBeGreaterThan(defenseUpgradeCost(5)); // strictement croissant
  });

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

  it('le préavis croît avec la Tour et reste borné', () => {
    expect(scoutLeadMs(0)).toBe(RAID.scoutLeadBaseMs);
    expect(scoutLeadMs(10)).toBeGreaterThan(scoutLeadMs(3));
    expect(scoutLeadMs(999)).toBe(RAID.scoutLeadCapMs);
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
    const lead = scoutLeadMs(6);
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

  it('le champ de bataille pourrit', () => {
    let b = base(0);
    b.field = {
      corpses: corpsesFrom(rollRaid(1, 26, 0, 0), { defeated: 2 } as never, 1),
      expiresAt: 5 * H,
    };
    b = advanceBase(b, { playerLevel: 26, activeDays7: 7, globalXp: 0 }, 6 * H).base;
    expect(b.field).toBeNull();
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

  it('les fouilleurs visent les corps les plus riches d’abord', () => {
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    const picked = pickScavengeTargets({ corpses, expiresAt: 0 }, 3);
    expect(picked).toHaveLength(3);
    expect(picked[0]!.champion || picked[0]!.level >= picked[2]!.level).toBe(true);
    // Un corps déjà dépouillé n'est jamais re-ciblé.
    const half = corpses.map((c, i) => (i < 5 ? { ...c, looted: true } : c));
    expect(pickScavengeTargets({ corpses: half, expiresAt: 0 }, 99)).toHaveLength(
      corpses.length - 5,
    );
  });

  it('paie dans la devise de la faction — et JAMAIS en ferraille', () => {
    // La ferraille vient des épaves de la carte : en trouver sur un loup n'aurait aucun
    // sens. Le butin d'un siège, lui, dépend de qui attaquait.
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    const bandits = lootCorpses(corpses, 'bandits', 26, 1);
    const betes = lootCorpses(corpses, 'betes', 26, 1);
    const morts = lootCorpses(corpses, 'mortsvivants', 26, 1);
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
  });

  it('⚠️ AUCUNE devise MORTE dans le butin d’un siège', () => {
    // Le garde-fou générique : si une devise cesse d'avoir un site de dépense, ce test
    // doit être élargi — pas contourné.
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    for (const f of ['bandits', 'betes', 'mortsvivants'] as const) {
      const l = lootCorpses(corpses, f, 26, 1) as unknown as Record<string, number>;
      expect(l.fragments, f + ' : fragments').toBeUndefined();
      expect(l.inkDust, f + ' : encre').toBeUndefined();
    }
  });

  it('les BÊTES rapportent des clés — rarement, et sur le cumul de la vague', () => {
    // Une clé par corps ferait du Labyrinthe un farm ; on cumule les chances sur la vague.
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    const betes = lootCorpses(corpses, 'betes', 26, 1);
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
      for (const it of lootCorpses(corpses, 'bandits', playerLevel, s).items) {
        // Même tolérance que le reste du jeu : la cloche déborde d'au plus 2 rangs.
        expect(RANK_ORDER.indexOf(it.rarity)).toBeLessThanOrEqual(ceil + 2);
      }
    }
  });
});

describe('chenil : la garnison', () => {
  function fam(id: string, effect: string, value: number, defXp = 0): Item {
    return {
      id,
      slot: 'familiar',
      name: id,
      emoji: '🐺',
      rarity: 'rare',
      level: 10,
      baseLevel: 10,
      effect: { type: effect as never, value },
      defXp,
    };
  }

  it('l’ESPÈCE décide du rôle : poster un ours ou un loup ne donne pas la même bataille', () => {
    const k = 5;
    const loup = garrisonBonus([fam('a', 'damage_pct', 20)], 0, k);
    const ours = garrisonBonus([fam('b', 'dmg_reduction_pct', 20)], 0, k);
    const cerf = garrisonBonus([fam('c', 'max_pv_pct', 20)], 0, k);
    expect(loup.damagePct).toBeGreaterThan(0);
    expect(loup.maxPvPct).toBeUndefined();
    expect(ours.dmgReduction).toBeGreaterThan(0);
    expect(cerf.maxPvPct).toBeGreaterThan(0);
    // Rôles HORS combat : le faucon renseigne, la marmotte fouille.
    expect(garrisonBonus([fam('d', 'crit_pct', 20)], 0, k).scoutBonus).toBe(1);
    expect(garrisonBonus([fam('e', 'gold_pct', 20)], 0, k).lootPct).toBeGreaterThan(0);
  });

  it('sans Chenil, la garnison n’apporte rien', () => {
    expect(garrisonBonus([fam('a', 'damage_pct', 20)], 0, 0)).toEqual({});
  });

  it('le dressage DÉFENSIF renforce la garnison, et ne dépasse jamais le niveau du joueur', () => {
    const brut = garrisonBonus([fam('a', 'damage_pct', 20, 0)], 0, 5);
    const dresse = garrisonBonus([fam('a', 'damage_pct', 20, famXpForLevel(10))], 0, 5);
    expect(dresse.damagePct!).toBeGreaterThan(brut.damagePct!);
    // Le plafond s'applique à l'ATTRIBUTION : on ne peut pas dépasser son niveau.
    const it0 = fam('a', 'damage_pct', 20);
    const gorged = grantFamiliarXp(it0, 'def', 1_000_000, 8);
    expect(famLevel(gorged.defXp)).toBeLessThanOrEqual(8);
  });

  it('les deux carrières sont SÉPARÉES et CONTEXTUELLES', () => {
    // Un familier ne pouvant être à deux endroits à la fois, elles divergent seules.
    const base = fam('a', 'damage_pct', 20);
    const guerrier = grantFamiliarXp(base, 'atk', 5000, 99);
    expect(famLevel(guerrier.atkXp)).toBeGreaterThan(0);
    expect(famLevel(guerrier.defXp)).toBe(0);
    // Le dressage d'attaque ne vaut RIEN au mur…
    expect(garrisonBonus([guerrier], 0, 5).damagePct).toBeCloseTo(
      garrisonBonus([base], 0, 5).damagePct!,
      5,
    );
    // …et l'axe d'attaque reste MODESTE : le combat du héros est calibré au serré.
    expect(famAtkMult(famLevel(guerrier.atkXp))).toBeLessThan(1.2);
  });

  it('un familier fatigué est DIMINUÉ, jamais perdu ni blessé', () => {
    // S'il pouvait être perdu, personne ne posterait ses bons familiers et le chenil
    // resterait vide le jour où la mécanique se déclenche.
    const tired: Item = { ...fam('a', 'damage_pct', 20), fatigueUntil: 10 * H };
    const rested = garrisonBonus([{ ...tired, fatigueUntil: 0 }], 5 * H, 5);
    const weary = garrisonBonus([tired], 5 * H, 5);
    expect(weary.damagePct!).toBeLessThan(rested.damagePct!);
    expect(weary.damagePct!).toBeGreaterThan(0);
    // L'Infirmerie abrège le repos, sans jamais l'annuler.
    expect(fatigueMsFor(10)).toBeLessThan(fatigueMsFor(0));
    expect(fatigueMsFor(999)).toBeGreaterThan(0);
  });

  it('⛔ la garnison AIDE sans devenir un bouton « gagner »', () => {
    // Mesuré sur une garnison réelle de trois légendaires : à pleine valeur, elle faisait
    // passer la tenue de 72 % à 90 % dès le dressage 0 et à 100 % au maximum — le chenil
    // annulait tout le travail sur la fenêtre de niveau. D'où GARRISON_K et les plafonds.
    const real = [
      fam('loup', 'damage_pct', 23.4),
      fam('salamandre', 'lifesteal_pct', 14.7),
      fam('ours', 'dmg_reduction_pct', 9.4),
    ];
    function rate(g: Item[], defLvl: number): number {
      const bonus = garrisonBonus(
        g.map((f) => ({ ...f, defXp: famXpForLevel(defLvl) })),
        0,
        10,
      );
      let held = 0;
      for (let i = 0; i < 200; i++) {
        const raid = rollRaid(i * 7919 + 13, 26, 0, 0);
        if (
          resolveRaid(
            {
              defenses: defs(26, 26),
              playerLevel: 26,
              hero: null,
              guard: guardUnits(26, [], bonus),
            },
            raid,
            0,
            false,
          ).held
        )
          held++;
      }
      return (held / 200) * 100;
    }
    const nu = rate([], 0);
    const garni = rate(real, 0);
    expect(garni).toBeGreaterThan(nu); // elle sert vraiment…
    expect(garni - nu).toBeLessThan(20); // …sans renverser la table

    // ⚠️ LE DRESSAGE SE MESURE SUR LA TROUPE, PAS SUR LE TAUX DE TENUE. À enceinte
    // pleine celui-ci plafonne vers 96 % : le test comparait deux fois le même
    // plafond et ne pouvait rien attraper. On épingle donc ce que le dressage CHANGE
    // — la force des défenseurs qu’il produit — ce qui est exact et sans bruit
    // d’échantillonnage.
    const brut = guardUnits(26, [], garrisonBonus(real, 0, 10));
    const ecole = guardUnits(
      26,
      [],
      garrisonBonus(
        real.map((f) => ({ ...f, defXp: famXpForLevel(26) })),
        0,
        10,
      ),
    );
    expect(ecole[0]!.damage).toBeGreaterThan(brut[0]!.damage);
    expect(ecole[0]!.pv).toBeGreaterThanOrEqual(brut[0]!.pv);
    // …et jamais au point de rendre la base imprenable : le chenil reste un appoint.
    expect(rate(real, 26)).toBeLessThan(99);
  });

  it('la régénération est plafonnée PLUS BAS que le reste (elle compose)', () => {
    // Seule stat qui s'applique entre CHAQUE groupe, donc 4-5 fois par siège : 15 % de
    // soin par groupe rendrait la base quasi increvable.
    const gros = garrisonBonus(
      [fam('a', 'lifesteal_pct', 40), fam('b', 'lifesteal_pct', 40)],
      0,
      20,
    );
    expect(gros.regen).toBeLessThanOrEqual(GARRISON_CAP.regen);
    const mur = garrisonBonus(
      [fam('a', 'dmg_reduction_pct', 60), fam('b', 'dmg_reduction_pct', 60)],
      0,
      20,
    );
    expect(mur.dmgReduction).toBeLessThanOrEqual(GARRISON_CAP.dmgReduction);
  });

  it('l’assignation automatique prend les meilleurs, dans la limite des places', () => {
    // ⚠️ RÉÉCRIT : le 2e argument était un NOMBRE DE PLACES, il est devenu le NIVEAU DU
    // CHENIL — c'est lui qui décide et des places et du rang, comme la Guilde pour les
    // aventuriers. Le test d'origine passait 3 et vérifiait 3 postés ; il dirait
    // aujourd'hui « chenil 3 », soit UNE place. L'intention, elle, ne bouge pas.
    // (Réécrit une 1re fois en v0.719 : trois familiers à dégâts, dont deux postés
    // côte à côte — ce que « un rôle par poste » interdit.)
    const pool = [
      fam('faible', 'damage_pct', 5),
      fam('fort', 'damage_pct', 40),
      fam('cerf', 'max_pv_pct', 30),
      fam('ours', 'dmg_reduction_pct', 12),
    ];
    const KENNEL = 12; // 3 places, et un rang max largement au-dessus du « rare » du fixture
    const picked = autoGarrison(pool, KENNEL);
    expect(picked).toHaveLength(garrisonSlots(KENNEL));
    expect(picked[0]).toBe('fort');
    expect(picked).not.toContain('faible');
  });

  it('⚠️ LES PLACES VIENNENT DU CHENIL, plus du niveau du personnage', () => {
    // Demandé par l’utilisateur : « le level du chenil détermine le nombre de familiers
    // et le rang max comme d’autres bâtiments (la guilde) ». Avant, un joueur de haut
    // niveau avait six places avec un chenil de niveau 1 — le bâtiment ne servait qu’à
    // plafonner le dressage, et on l’améliorait sans rien voir arriver.
    expect(garrisonSlots(0)).toBe(0);
    for (let l = 0; l < 100; l++)
      expect(garrisonSlots(l + 1)).toBeGreaterThanOrEqual(garrisonSlots(l));
    expect(garrisonSlots(40)).toBeGreaterThan(garrisonSlots(5));
  });

  it('⚠️ JAMAIS PLUS DE PLACES QUE DE RÔLES — aucun trou permanent', () => {
    // ⚠️ Signalé par l'utilisateur (« tu as fait le chenil sur la même base de lvl que la
    // guilde ? ») : la question a révélé que `garrisonSlots` promettait 9 places au
    // Chenil 40 et 21 au 100, alors que `dedupeGarrisonRoles` ne garde qu'UN familier
    // par rôle — 15 places qui ne pouvaient JAMAIS se remplir, et un « 6/21 postés » à
    // vie. Même défaut que les emplacements de la cour (v0.676), même remède : on DÉRIVE
    // la borne du roster au lieu de l'écrire.
    const roles = new Set(Object.values(GARRISON_ROLE)).size;
    for (let l = 0; l <= 120; l++) expect(garrisonSlots(l)).toBeLessThanOrEqual(roles);
    // …et on l'atteint VRAIMENT : une borne qu'on ne touche jamais ne borne rien.
    expect(garrisonSlots(120)).toBe(roles);
    // Le pas reste annoncé tant qu'il reste une place, et se tait ensuite.
    expect(garrisonNextSlotLevel(1)).toBeGreaterThan(1);
    expect(garrisonNextSlotLevel(120)).toBeNull();
  });

  it('⚠️ LES PLACES BORNENT VRAIMENT LE BONUS, rôles distincts compris', () => {
    // ⚠️ Ce test manquait, et une mutation l'a montré : `dedupeGarrisonRoles` ne garde
    // déjà qu'UN familier par rôle, si bien que supprimer la coupe aux places ne se
    // voyait nulle part — tous les fixtures tenaient dans le nombre de places. Il faut
    // donc PLUS DE RÔLES DISTINCTS QUE DE PLACES pour que la borne soit observable.
    const KENNEL = 5;
    expect(garrisonSlots(KENNEL)).toBe(2); // le test n’a de sens que s’il y a moins de places que de rôles
    const pool = [
      fam('loup', 'damage_pct', 40),
      fam('cerf', 'max_pv_pct', 30),
      fam('ours', 'dmg_reduction_pct', 20),
      fam('salam', 'lifesteal_pct', 10),
    ];
    const b = garrisonBonus(pool, 0, KENNEL);
    const canaux = [b.damagePct, b.maxPvPct, b.dmgReduction, b.regen].filter((v) => (v ?? 0) > 0);
    expect(canaux).toHaveLength(garrisonSlots(KENNEL));
    // Et ce sont les MEILLEURS qui tiennent les places, pas les premiers venus.
    expect(b.damagePct).toBeGreaterThan(0);
    expect(b.maxPvPct).toBeGreaterThan(0);
  });

  it('⚠️ LE RANG MAXIMAL SUIT LA MÊME TABLE QUE LA GUILDE', () => {
    // ⚠️ Adossé à `PROMO_LEVELS`, jamais à des nombres écrits à la main : c'est la table
    // qui dit déjà « quel niveau de bâtiment pour quel rang », et elle compte exactement
    // autant d'entrées que `RANK_ORDER`. Deux tables finiraient par diverger.
    for (let i = 0; i < RANK_ORDER.length; i++) {
      const need = PROMO_LEVELS[i]!;
      const it = { ...fam(`f${i}`, 'damage_pct', 20), rarity: RANK_ORDER[i]! };
      expect(canGarrison(it, need)).toBe(true);
      if (need > 1) expect(canGarrison(it, need - 1)).toBe(false);
    }
  });

  it('⚠️ UN FAMILIER HORS D’ÉCOLE NE COMPTE PAS AU COMBAT, même s’il est posté', () => {
    // La garde vit dans le CALCUL, pas seulement à l'écriture : une garnison rangée
    // avant ce changement se soigne toute seule, sans migration — même politique que
    // `dedupeGarrisonRoles` et que les POI périmés.
    const prime = { ...fam('p', 'damage_pct', 40), rarity: RANK_ORDER[7]! };
    expect(garrisonBonus([prime], 0, 5).damagePct).toBeUndefined();
    expect(garrisonBonus([prime], 0, PROMO_LEVELS[7]!).damagePct).toBeGreaterThan(0);
    // …et l'assignation automatique ne le propose pas non plus.
    expect(autoGarrison([prime], 5)).not.toContain('p');
  });

  /** ⚠️ UN SEUL FAMILIER PAR RÔLE AU MUR (v0.719, demandé par l'utilisateur : « normalement
   *  c'est un max de chaque type »). Deux loups tombent dans le MÊME canal, déjà plafonné
   *  par GARRISON_CAP : le second n'apportait qu'un reliquat en occupant une place qu'un
   *  autre rôle aurait remplie. La garnison est un jeu de rôles complémentaires. */
  describe('un seul familier par rôle', () => {
    it('deux loups ne peuvent pas tenir le mur ensemble — on garde le meilleur', () => {
      const gardes = dedupeGarrisonRoles([
        fam('loup1', 'damage_pct', 12),
        fam('loup2', 'damage_pct', 30),
        fam('cerf', 'max_pv_pct', 20),
      ]);
      expect(gardes.map((f) => f.id)).toEqual(['loup2', 'cerf']);
    });

    it('⚠️ « le meilleur » se juge sur l’effet ET le dressage, pas sur l’ordre reçu', () => {
      // L'appelant passe les familiers dans l'ordre du SAC : garder « le premier »
      // désignerait un familier au hasard. Ici le 2e a un effet plus FAIBLE mais un
      // dressage qui le rattrape largement.
      const gardes = dedupeGarrisonRoles([
        fam('brut', 'damage_pct', 20, 0),
        fam('dresse', 'damage_pct', 14, famXpForLevel(20)),
      ]);
      expect(gardes.map((f) => f.id)).toEqual(['dresse']);
    });

    it('⚠️ la place libérée par une copie revient à un AUTRE rôle, elle ne se perd pas', () => {
      const bonus = garrisonBonus(
        [
          fam('loup1', 'damage_pct', 30),
          fam('loup2', 'damage_pct', 30),
          fam('cerf', 'max_pv_pct', 30),
        ],
        0,
        20,
        2, // deux places seulement
      );
      // Dédoublonner AVANT la coupe : sinon les deux loups mangeaient les deux places et
      // le cerf, seul autre rôle disponible, restait dehors.
      expect(bonus.maxPvPct).toBeGreaterThan(0);
    });

    it('le combat lui-même l’arbitre → une garnison ancienne se soigne sans migration', () => {
      const deux = garrisonBonus(
        [fam('loup1', 'damage_pct', 30), fam('loup2', 'damage_pct', 30)],
        0,
        20,
        4,
      );
      const un = garrisonBonus([fam('loup1', 'damage_pct', 30)], 0, 20, 4);
      expect(deux.damagePct).toBeCloseTo(un.damagePct!, 6);
    });

    it('les rôles DIFFÉRENTS cohabitent toujours — ce n’est pas un plafond déguisé', () => {
      const gardes = dedupeGarrisonRoles([
        fam('loup', 'damage_pct', 10),
        fam('cerf', 'max_pv_pct', 10),
        fam('ours', 'dmg_reduction_pct', 10),
        fam('sala', 'lifesteal_pct', 10),
        fam('faucon', 'crit_pct', 10),
        fam('marmotte', 'gold_pct', 10),
      ]);
      expect(gardes).toHaveLength(6);
    });
  });
});

/** ⚠️ MASSE VISIBLE ≠ MENACE (v0.720). Une armee comptait 8 brigands au niveau 26 : une
 *  bande, pas un siege. Elle est ~2,5x plus nombreuse, mais chaque assaillant est
 *  d autant plus faible et son cadavre d autant moins riche.
 *
 *  Ces tests comparent le modele A/B en forcant `RAID.massMult` a 1, ce qui reproduit
 *  EXACTEMENT l ancien comportement : c est la seule facon de prouver qu on n a change
 *  que la foule. Sans eux, un futur reglage de la masse deplacerait silencieusement la
 *  difficulte ou l economie du champ de bataille. */
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
      let scrap = 0;
      let stones = 0;
      let corps = 0;
      for (let s = 0; s < 40; s++) {
        const raid = rollRaid(s * 7919 + 5, L, 0, 0);
        const rep = { defeated: raid.groups.length } as RaidReport;
        const c = corpsesFrom(raid, rep, s);
        const loot = lootCorpses(c, raid.faction, L, s);
        corps += c.length;
        gold += loot.gold;
        scrap += loot.scrap;
        stones += loot.summonStones;
      }
      return { gold, scrap, stones, corps };
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
      expect(b.scrap / a.scrap).toBeGreaterThan(0.95);
      expect(b.scrap / a.scrap).toBeLessThan(1.05);
      expect(b.stones / a.stones).toBeGreaterThan(0.95);
      expect(b.stones / a.stones).toBeLessThan(1.05);
    }
  });

  it('⚠️ LA FOUILLE DEMANDE DÉSORMAIS PLUSIEURS VAGUES — et c’est VOULU', () => {
    // ⚠️ RÉÉCRIT. Ce test exigeait « le MÊME nombre de vagues qu’avant la masse ×2,5 »,
    // au motif que « la foule ne doit pas devenir une corvée ». C’était juste tant que
    // chaque vague se lançait et se ramassait À LA MAIN — et c’est ce qui a produit le
    // défaut signalé : « en 1 voire 2 vagues max j’ai tout ramassé ».
    // Depuis que les allers-retours s’enchaînent SEULS et durent 4 minutes, une vague ne
    // coûte plus un clic : le motif du test a disparu avec le geste qu’il protégeait.
    for (const L of [12, 26, 60, 90]) {
      const vagues = raidSize(L, 'betes') / scavengerCount(L);
      // Assez de vagues pour que la fouille DURE et se regarde avancer…
      expect(vagues).toBeGreaterThan(3);
      // …sans jamais approcher la péremption du champ (24 h pour `dispatchMs` de 4 min).
      expect(vagues * SCAV.dispatchMs).toBeLessThan(SCAV.fieldMs / 4);
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

  it('l’INFIRMERIE chiffre la convalescence ET la fatigue', () => {
    const txt = defensePerLevelLabel('infirmary', 3, ctx(3, 'infirmary'));
    expect(txt).toContain(fmtSpan(woundMsFor(3)));
    expect(txt).toContain(fmtSpan(woundMsFor(4)));
    expect(txt).toContain(fmtSpan(fatigueMsFor(3)));
    expect(txt).toContain(fmtSpan(fatigueMsFor(4)));
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
    expect(scavengerCount(7)).not.toBe(scavengerCount(8));
    const a = defensePerLevelLabel('salvage', 7, ctx(7, 'salvage'));
    expect(a).toContain(String(scavengerCount(7)));
    expect(a).toContain(String(scavengerCount(8)));
    // …et un palier SANS bras supplementaire annonce quand meme son gain de vitesse.
    const muet = defensePerLevelLabel('salvage', 9, ctx(9, 'salvage'));
    expect(muet).toContain(fmtSpan(scavengeMs(10)));
    const w = defensePerLevelLabel('watchtower', 2, ctx(2, 'watchtower'));
    expect(w).toContain(fmtSpan(scoutLeadMs(3)));
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
    // « +0 » est honnete mais inutilisable : ce quon veut savoir, cest jusquou monter.
    expect(scavengerCount(6)).toBe(scavengerCount(7)); // ce palier ne donne rien
    const txt = defensePerLevelLabel('salvage', 6, ctx(6, 'salvage'));
    expect(txt).toMatch(/niveau 8/);
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

  it('il y a TOUJOURS une porte de sortie : des soins d’urgence en ferraille', () => {
    // Attendre reste gratuit ; payer n'achète que l'immédiateté, à un prix qui suit le
    // repos restant — écourter la fin est donc une bricole.
    expect(healCost(6 * H)).toBeGreaterThan(healCost(1 * H));
    expect(healCost(0)).toBeGreaterThan(0);
  });
});

describe('économie de la défense', () => {
  it('réparer coûte de la ferraille, proportionnellement au niveau', () => {
    expect(repairCost(1)).toBeGreaterThan(0);
    expect(repairCost(30)).toBeGreaterThan(repairCost(10));
  });

  it('réparer l’enceinte RELANCE la production', () => {
    // Le gel n'est pas une punition séparée : c'est la conséquence d'une base cassée.
    // La ferraille est donc le levier commun aux deux — mais elle achète l'immédiateté,
    // elle ne la rançonne pas (la séance de sport et les 24 h restent gratuites).
    const b = emptyBase(1, 0);
    b.defenses = [
      { typeId: 'wall', level: 20, damaged: true },
      { typeId: 'turret', level: 18, damaged: true },
    ];
    b.freeze = { until: 24 * H, atXp: 100 };
    expect(totalRepairCost(b)).toBe(repairCost(20) + repairCost(18));

    // Tant qu'il reste une brèche, la production reste à l'arrêt…
    const half = repairStructure(b, 'wall');
    expect(half.defenses.find((d) => d.typeId === 'wall')!.damaged).toBeUndefined();
    expect(half.freeze).not.toBeNull();
    // …et elle repart dès que tout est en état.
    const whole = repairStructure(half, 'turret');
    expect(whole.defenses.some((d) => d.damaged)).toBe(false);
    expect(whole.freeze).toBeNull();
    expect(totalRepairCost(whole)).toBe(0);
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
      bandits += lootCorpses(corpses, 'bandits', 26, s * 13 + 1).items.length;
      betes += lootCorpses(corpses, 'betes', 26, s * 13 + 1).items.length;
    }
    expect(bandits, `bandits ${bandits} vs bêtes ${betes}`).toBeGreaterThan(betes * 2);
    expect(betes, 'une bête traîne quand même parfois une pièce prise au village').toBeGreaterThan(
      0,
    );
  });

  it('l’or reste la marque des bandits, l’équipement ne le remplace pas', () => {
    const raid = rollRaid(31, 26, 0, 0);
    const corpses = corpsesFrom(raid, { defeated: raid.groups.length } as never, 7);
    expect(lootCorpses(corpses, 'bandits', 26, 5).gold).toBeGreaterThan(
      lootCorpses(corpses, 'betes', 26, 5).gold,
    );
  });
});

describe('doublons de familiers : on ne cède que l’inemployable', () => {
  // ⚠️ garrisonSlots grandit avec le niveau : on garde slots + 1 par effet. À niveau 1
  // ça fait 2, ce qui rend les cas lisibles — un 3e exemplaire est alors un doublon.
  const L = 1;
  const KEEP = garrisonSlots(L) + 1;

  function fam(id: string, effect: string, value: number, extra: Partial<Item> = {}): Item {
    return {
      id,
      slot: 'familiar',
      name: id,
      emoji: '🐺',
      rarity: 'rare',
      level: 10,
      baseLevel: 10,
      effect: { type: effect as never, value },
      ...extra,
    } as Item;
  }

  it('garde les meilleurs et ne cède que le surplus du même effet', () => {
    const list = [
      fam('fort', 'damage_pct', 30),
      fam('moyen', 'damage_pct', 20),
      fam('faible', 'damage_pct', 5),
    ];
    const dup = duplicateFamiliars(list, L, {});
    expect(dup.map((f) => f.id)).toEqual(['faible']);
  });

  it('⚠️ un EFFET UNIQUE n’est jamais un doublon, même écrasé en puissance brute', () => {
    // Le régression qu’on interdit : vendre son seul faucon (renseignement) parce qu’un
    // loup tape six fois plus fort. Les rôles au mur ne se remplacent pas entre eux.
    const list = [
      fam('loup1', 'damage_pct', 60),
      fam('loup2', 'damage_pct', 55),
      fam('loup3', 'damage_pct', 50),
      fam('faucon', 'crit_pct', 2),
      fam('marmotte', 'gold_pct', 3),
    ];
    const ids = duplicateFamiliars(list, L, {}).map((f) => f.id);
    expect(ids).not.toContain('faucon');
    expect(ids).not.toContain('marmotte');
    expect(ids).toContain('loup3');
  });

  it('⚠️ un BON DÉFENSEUR survit même s’il est mauvais à l’attaque (les 2 axes)', () => {
    // Les carrières ⚔️ et 🛡️ divergent : classer sur la seule attaque braderait le mur.
    const list = [
      fam('a', 'damage_pct', 30, { atkXp: 999999 }),
      fam('b', 'damage_pct', 29, { atkXp: 999999 }),
      fam('mur', 'damage_pct', 28, { defXp: 999999 }),
      fam('rien', 'damage_pct', 27),
    ];
    const ids = duplicateFamiliars(list, L, {}).map((f) => f.id);
    expect(ids).toEqual(['rien']);
  });

  it('⚠️ une SIGNATURE ✦ protège : un effet conditionnel ne se remplace par rien', () => {
    const list = [
      fam('a', 'damage_pct', 40),
      fam('b', 'damage_pct', 35),
      fam('sig', 'damage_pct', 1, { effect2: { type: 'execute_pct' as never, value: 12 } }),
    ];
    expect(duplicateFamiliars(list, L, {}).map((f) => f.id)).toEqual([]);
  });

  it('l’équipé, les postés au chenil et les 🔒 ne partent JAMAIS', () => {
    const list = [
      fam('top1', 'damage_pct', 40),
      fam('top2', 'damage_pct', 39),
      fam('porte', 'damage_pct', 3),
      fam('poste', 'damage_pct', 2),
      fam('verrou', 'damage_pct', 1, { locked: true }),
      fam('jetable', 'damage_pct', 4),
    ];
    const ids = duplicateFamiliars(list, L, {
      equippedId: 'porte',
      postedIds: ['poste'],
    }).map((f) => f.id);
    expect(ids).toEqual(['jetable']);
  });

  it('la réserve suit les places : plus de niveau = plus de familiers gardés', () => {
    const list = Array.from({ length: 30 }, (_, i) => fam('f' + i, 'damage_pct', 30 - i));
    const bas = duplicateFamiliars(list, 1, {}).length;
    const haut = duplicateFamiliars(list, 100, {}).length;
    expect(list.length - bas).toBe(KEEP);
    expect(haut).toBeLessThan(bas);
  });

  it('rien à vendre quand la réserve tient dans les places', () => {
    expect(duplicateFamiliars([fam('a', 'damage_pct', 10)], L, {})).toEqual([]);
    expect(duplicateFamiliars([], L, {})).toEqual([]);
  });
});

describe('🔩 l’acier d’une armée en déroute (v0.702)', () => {
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
    );

  it('⚠️ les BÊTES n’en laissent aucune — on ne démonte pas un loup', () => {
    // Ceci PRÉCISE la règle « les cadavres ne donnent jamais de ferraille » au lieu de la
    // renier : son motif était l'absurdité d'en trouver sur un animal. Une troupe en armes,
    // elle, laisse ses lames et ses plaques.
    expect(loot('betes').scrap).toBe(0);
    expect(loot('bandits').scrap).toBeGreaterThan(0);
    expect(loot('mortsvivants').scrap).toBeGreaterThan(0);
  });

  it('⚠️ l’ÉPAVE reste la source de POINTE — le siège complète, il ne remplace pas', () => {
    // Une épave coûte un geste (choisir, envoyer, attendre le trajet) ; un siège vient à
    // toi. Le premier doit donc rester le plus payant par événement, comme la Mine d'or
    // face aux expéditions.
    const L = 40;
    const parSiege = loot('bandits', 12, L).scrap;
    const parEpave = Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * 1.5);
    expect(parSiege).toBeLessThan(parEpave * 3);
    expect(parSiege).toBeGreaterThan(parEpave / 4); // ni dérisoire…
  });

  it('la récolte suit le NIVEAU du corps, et le champion pèse plus', () => {
    expect(loot('bandits', 6, 60).scrap).toBeGreaterThan(loot('bandits', 6, 20).scrap);
    const sansChamp = lootCorpses(
      Array.from({ length: 4 }, () => corpse(40)) as never,
      'bandits',
      40,
      7,
    ).scrap;
    const avecChamp = lootCorpses(
      [corpse(40), corpse(40), corpse(40), corpse(40, true)] as never,
      'bandits',
      40,
      7,
    ).scrap;
    expect(avecChamp).toBeGreaterThan(sansChamp);
  });
});

// ── Le DÉCLENCHEUR : une enceinte doit être PRÊTE, pas seulement exister ──────────
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
    for (const L of [3, 12, 40, 100]) expect(ready(withDefs(L, L), L)).toBe(true);
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
  it('les 6 structures se débloquent ENSEMBLE, et tôt', () => {
    // 12 protégeait d'un défaut corrigé depuis (v0.672/674/687) : mesuré, un joueur de
    // niveau 8 avec une enceinte à niveau tient 88 %, pas les « 0-20 % » d'alors. Et
    // atteindre 12 demande ~3 mois à un joueur tranquille.
    const levels = new Set(DEFENSE_TYPES.map((t) => t.unlockLevel));
    expect(levels.size).toBe(1);
    expect([...levels][0]).toBe(3);
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
      out.push(scoutClarity(Math.round(L * towerShare), r.level, L, 0, seed));
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
    const ref = scoutClarity(40, 44, 40, 0, 12345);
    for (let i = 0; i < 50; i++) expect(scoutClarity(40, 44, 40, 0, 12345)).toBe(ref);
  });
  it('…mais il VARIE d’un raid à l’autre (sinon ce n’est pas de l’aléa)', () => {
    const vals = new Set(
      Array.from({ length: 40 }, (_, i) => scoutClarity(40, 44, 40, 0, i * 977 + 3)),
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
    expect(scoutClarity(40, 40, 40)).toBe(scoutClarity(40, 40, 40, 0, 0));
  });
  it('sans Tour de guet on ne voit rien, à tout niveau', () => {
    for (const L of [3, 20, 100]) expect(clarities(L, 0).every((c) => c === 0)).toBe(true);
  });
  it('le faucon posté rachète un cran', () => {
    const sans = scoutClarity(20, 24, 20, 0);
    const avec = scoutClarity(20, 24, 20, 1);
    expect(avec).toBeGreaterThanOrEqual(sans);
  });
});

describe('⚠️ la RARETÉ d’un familier compte AUSSI au mur', () => {
  // Vérifié à la demande de l'utilisateur : ça marchait déjà, mais RIEN ne le
  // garantissait. La rareté n'est appliquée nulle part dans `garrisonBonus` — elle
  // transite par `effect.value`, bakée au DROP (refonte drops-only v0.556). C'est
  // élégant, et c'est exactement pour ça que c'est fragile : une refonte qui
  // recalculerait la valeur autrement casserait la défense sans toucher à `raid.ts`.
  const loup = FAMILIAR_SPECIES.find((s) => s.id === 'wolf')!;
  const fam = (rarity: Rarity): Item =>
    ({ ...rollFamiliar(() => 0.5, loup, { level: 28, rarity }), id: 'f' }) as Item;

  it('un familier plus rare renforce PLUS le mur, rang après rang', () => {
    let prev = 0;
    for (const r of RANK_ORDER) {
      const d = garrisonBonus([fam(r)], 0, 28).damagePct ?? 0;
      expect(d, `rareté ${r}`).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('⚠️ l’écart suit l’échelle de rareté DU PROJET, pas une autre', () => {
    // ⚠️ On compare à `RARITY_MULT`, la CONSTANTE du projet — pas à un nombre écrit ici :
    // si l’échelle de rareté bouge un jour, ce test suit au lieu de mentir.
    const bas = garrisonBonus([fam(RANK_ORDER[0]!)], 0, 28).damagePct ?? 0;
    const dernier = RANK_ORDER[RANK_ORDER.length - 1]!;
    const haut = garrisonBonus([fam(dernier)], 0, 28).damagePct ?? 0;
    const attendu = RARITY_MULT[dernier] / RARITY_MULT[RANK_ORDER[0]!];
    // ⚠️ Tolérance RELATIVE : `effect.value` est stocké à UNE décimale (`round1`), donc
    // le rapport mesuré (3,93) frôle l’échelle théorique (4,00) sans l’égaler. Ce qui
    // compte est qu’il la SUIVE — s’il tombait à 1, la rareté ne compterait plus.
    expect(Math.abs(haut / bas - attendu) / attendu).toBeLessThan(0.05);
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
  });

  describe('les assaillants', () => {
    const raid = rollRaid(7919, 28, 0, 0);

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

    it('⚠️ chaque corps porte sa PLACE au pied du mur (bulk)', () => {
      // Sans elle, le goulot comptait des TÊTES et rendait les hordes inoffensives.
      // ⚠️ « > 0 » passait au vert avec un `bulk` figé à 1 : on épingle donc la VALEUR.
      // ⚠️ Elle n’est PAS proportionnelle à `unitMult` : les dégâts d’un groupe suivent
      // la RACINE de son effectif, donc la place d’un corps doit valoir
      // `unitMult^(2−groupDmgExp)` pour que les dégâts portés au mur ne dépendent plus
      // du tout de la silhouette. C’est une identité dérivée, pas un réglage.
      const att = siegeAttackers(raid);
      expect(att.every((u) => (u.bulk ?? 0) > 0)).toBe(true);
      for (const g of raid.groups) {
        const u = att.find((x) => x.name === g.species);
        if (u) expect(u.bulk).toBeCloseTo(Math.pow(g.unitMult ?? 1, 2 - RAID.groupDmgExp), 6);
      }
      // Et la silhouette n’est pas neutre : une horde a des corps plus menus.
      expect(FACTION_PROFILE.betes.unitMult).toBeLessThan(FACTION_PROFILE.bandits.unitMult);
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

describe('⛏️ LE CHANTIER TRAVAILLE SEUL', () => {
  // ⚠️ Demandé par l’utilisateur : « que les allées venues soient automatiques et assez
  // rapides vu que c’est quand même juste devant la base », après avoir constaté « en 1
  // voire 2 vagues max j’ai tout ramassé ». Envoyer une vague n’était pas une DÉCISION —
  // on envoie toujours — donc c’était un clic de péage.
  const NOW = 1_700_000_000_000;
  const champ = (n: number): BattleField => ({
    corpses: Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      emoji: '💀',
      name: `corps ${i}`,
      level: 10,
    })),
    expiresAt: NOW + SCAV.fieldMs,
  });

  it('⚠️ SANS CHANTIER, personne ne fouille', () => {
    expect(advanceScavenging(champ(10), 0, NOW)).toBeNull();
    expect(scavengerCount(0)).toBe(0);
  });

  it('une vague part TOUT DE SUITE, et rien n’est ramassé avant son retour', () => {
    const t = advanceScavenging(champ(10), 3, NOW)!;
    expect(t.taken).toHaveLength(0);
    expect(t.waves).toBe(0);
    expect(t.field.dispatchUntil).toBe(NOW + SCAV.dispatchMs);
    expect(t.field.dispatchIds).toHaveLength(3);
    expect(t.done).toBe(false);
  });

  it('⚠️ UNE ABSENCE RATTRAPE TOUTES LES VAGUES, pas une seule', () => {
    // Le vrai piège : l’app reste fermée une nuit. Sans enchaîner les vagues DOS À DOS,
    // on ne rendrait qu’un aller-retour au retour et le champ pourrirait avec le reste
    // dedans — le joueur perdrait un butin qu’il avait gagné.
    // ⚠️ On part d’un champ dont la 1re vague est DÉJÀ en route : c’est l’état réel, le
    // tick de base lançant la fouille dans la foulée du siège. Un champ neuf, lui, ne
    // peut pas rattraper un passé qu’il n’a pas vécu — il démarre à l’instant de l’appel.
    const parti = advanceScavenging(champ(12), 3, NOW)!.field;
    const t = advanceScavenging(parti, 3, NOW + 10 * SCAV.dispatchMs)!;
    expect(t.taken).toHaveLength(12);
    expect(t.waves).toBe(4);
    expect(t.done).toBe(true);
    expect(t.field.dispatchUntil).toBeUndefined();
  });

  it('les vagues s’enchaînent DOS À DOS, pas depuis l’instant présent', () => {
    // Après deux allers-retours, la troisième doit être en route depuis le retour de la
    // deuxième — pas repartir de zéro à chaque ouverture de l’app.
    const parti = advanceScavenging(champ(12), 3, NOW)!.field;
    const t = advanceScavenging(parti, 3, NOW + 2 * SCAV.dispatchMs)!;
    expect(t.waves).toBe(2);
    expect(t.taken).toHaveLength(6);
    expect(t.field.dispatchUntil).toBe(NOW + 3 * SCAV.dispatchMs);
  });

  it('⚠️ UN CORPS N’EST JAMAIS DÉPOUILLÉ DEUX FOIS', () => {
    let f = advanceScavenging(champ(9), 3, NOW)!.field;
    const vus: string[] = [];
    for (let k = 1; k <= 6; k++) {
      const t = advanceScavenging(f, 3, NOW + k * SCAV.dispatchMs)!;
      f = t.field;
      vus.push(...t.taken.map((x) => x.id));
    }
    expect(vus).toHaveLength(9);
    expect(new Set(vus).size).toBe(9);
  });

  it('⚠️ LE CHAMP SE VIDE EN PLUSIEURS VAGUES, et c’était tout le sujet', () => {
    // Mesuré avant : 20 corps par vague au Chantier 14 pour une armée de ~48 — donc
    // « 1 voire 2 vagues ». Le facteur de masse retiré, la même armée en demande ~6.
    const cap = scavengerCount(14);
    expect(cap).toBe(4);
    expect(Math.ceil(48 / cap)).toBeGreaterThanOrEqual(10);
  });

  it('⚠️ LE NIVEAU DU CHANTIER RACCOURCIT LE VOYAGE — à CHAQUE cran', () => {
    // ⚠️ SECOND LEVIER, et il est NÉCESSAIRE : le nombre de bras monte par crans de
    // quatre niveaux (`scavengerCount`), donc trois niveaux sur quatre ne changeraient
    // RIEN sans lui — ce que « aucun niveau mort du 0 au 100 » (v0.731) interdit.
    for (let l = 0; l < 100; l++) {
      expect(scavengeMs(l + 1)).toBeLessThan(scavengeMs(l));
    }
    // ⚠️ ASYMPTOTIQUE, jamais linéaire : un aller-retour ne devient jamais instantané
    // — on ne dépouille pas un champ de bataille en un clin d’œil.
    expect(scavengeMs(0)).toBe(SCAV.dispatchMs);
    expect(scavengeMs(100_000)).toBeGreaterThan(SCAV.dispatchMs * (1 - SCAV.speedMax) - 1);
    expect(scavengeMs(100_000)).toBeGreaterThan(0);
  });

  it('⚠️ …et `advanceScavenging` HONORE cette durée', () => {
    // Le test précédent ne juge que la FORMULE : sans celui-ci, on pourrait la garder
    // intacte et ignorer son résultat dans la fouille — le levier serait mort en jeu
    // tout en restant vert. On mesure donc ce qui compte : à temps écoulé ÉGAL, un
    // Chantier plus haut ramène davantage de corps.
    const ecoule = 30 * 60_000;
    const vagues = (lvl: number) => {
      const parti = advanceScavenging(champ(200), 1, NOW, scavengeMs(lvl))!.field;
      return advanceScavenging(parti, 1, NOW + ecoule, scavengeMs(lvl))!.waves;
    };
    expect(vagues(40)).toBeGreaterThan(vagues(0));
    // Et le défaut par défaut reste le forfait : un appel sans durée ne change rien.
    const nu = advanceScavenging(
      advanceScavenging(champ(200), 1, NOW)!.field,
      1,
      NOW + ecoule,
    )!.waves;
    expect(nu).toBe(vagues(0));
  });

  it('⚠️ LE CUMUL PART AVEC LE CHAMP QUI POURRIT — pas d’orphelin', () => {
    // Un relevé de fouille SANS champ n’a plus de propriétaire : il se retrouverait
    // dans le rapport de pillage du siège SUIVANT, qui annoncerait un butin déjà
    // encaissé. En pratique la fouille rattrape tout bien avant la péremption — ce
    // cas ne reste ouvert que sans Chantier, où justement rien n’a été relevé.
    const b = emptyBase(7, 0);
    b.field = champ(5);
    b.pillage = {
      corpses: 3,
      waves: 1,
      gold: 40,
      scrap: 2,
      keys: 0,
      summonStones: 1,
      items: 0,
      startedAt: NOW,
    };
    const ctx = { playerLevel: 26, activeDays7: 7, globalXp: 0 };
    // Champ encore frais : on ne touche à rien.
    expect(advanceBase(b, ctx, NOW).base.pillage).not.toBeNull();
    // Champ pourri : les deux s’en vont ENSEMBLE.
    const apres = advanceBase(b, ctx, NOW + SCAV.fieldMs + 1).base;
    expect(apres.field).toBeNull();
    expect(apres.pillage).toBeNull();
  });

  it('un aller-retour est COURT — le chantier est devant la porte', () => {
    expect(SCAV.dispatchMs).toBeLessThanOrEqual(5 * 60_000);
    // …et le champ reste frais bien plus longtemps qu’il n’en faut pour tout ramasser.
    expect(SCAV.fieldMs / SCAV.dispatchMs).toBeGreaterThan(50);
  });
});

describe('🏥 AUCUN NIVEAU MORT — l’Infirmerie jusqu’à 100', () => {
  // ⚠️ Signalé par l’utilisateur (« l’infirmerie est déjà au max ; il faut que chaque
  // bâtiment apporte quelque chose à chaque niveau jusqu’au 100 »). Mesuré : ses DEUX
  // leviers touchaient un plancher DUR aux niveaux 14 et 15 — 85 niveaux sur 100 payés
  // au prix quadratique pour rien. C’était la seule structure d’enceinte ENTIÈREMENT
  // morte : le Chenil garde le dressage, la Tour de guet garde la clarté.
  const leviers: [string, (l: number) => number][] = [
    ['convalescence du héros', (l) => woundMsFor(l)],
    ['fatigue des familiers', (l) => fatigueMsFor(l)],
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
    const f0 = fatigueMsFor(0);
    for (let l = 0; l <= 15; l++)
      expect(fatigueMsFor(l)).toBe(Math.round(f0 * Math.max(0.25, 1 - l * 0.05)));
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
