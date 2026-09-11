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
  raidDamage,
  corpsesFrom,
  lootCorpses,
  advanceBase,
  applyRaidOutcome,
  emptyBase,
  raidsEnabled,
  defenseReadiness,
  scavengerCount,
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
  raidThreatSize,
  type RaidReport,
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
} from '@/lib/raid';

/** Places de garnison pour les tests courts — ce que le repli implicite rendait
 *  autrefois. ⚠️ La valeur est désormais TOUJOURS explicite : c'est ce repli qui avait
 *  permis au store de ne compter que 3 familiers pendant que l'écran en affichait 6. */
const SLOTS = 3;
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
    const base = baseCombatant(
      defs(defLevel, defLevel),
      playerLevel,
      heroHome ? hero(playerLevel) : null,
    );
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
        if (resolveRaid(baseCombatant(defs(26, 26), 26, null), raid, 0, false).held) held++;
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
      if (resolveRaid(baseCombatant(broken, 26, hero(26)), raid, 0, true).held) held++;
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
    const r = advanceBase(b, { playerLevel: 26, sessions7: 7, globalXp: 0 }, 10 * 24 * H);
    expect(r.detected).toBeNull();
    expect(r.dueRaid).toBeNull();
  });

  it('un joueur inactif n’est pas attaqué, et ne trouve PAS d’arriéré au retour', () => {
    // Règle fondatrice : on ne perd jamais pour ne pas avoir ouvert l'app.
    let b = base(0);
    const ctx = { playerLevel: 26, sessions7: 0, globalXp: 0 };
    for (let d = 1; d <= 21; d++) b = advanceBase(b, ctx, d * 24 * H).base;
    const back = advanceBase(b, { ...ctx, sessions7: 5 }, 22 * 24 * H);
    expect(back.dueRaid).toBeNull(); // rien n'a pu s'accumuler
  });

  it('détecte le raid AVANT son arrivée, puis le signale à résoudre', () => {
    const now = 0;
    let b = base(now);
    b.nextRaidAt = now + 10 * H;
    const ctx = { playerLevel: 26, sessions7: 7, globalXp: 0 };
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
    const ctx = { playerLevel: 26, sessions7: 7, globalXp: 0 };
    b = advanceBase(b, ctx, 0).base;
    const first = b.raid;
    for (let d = 1; d < 10; d++) b = advanceBase(b, ctx, d * 24 * H).base;
    expect(b.raid).toEqual(first); // il ne s'en empile jamais un second
  });

  it('la production gelée se dégèle par une SÉANCE, ou toute seule', () => {
    const b = base(0);
    b.freeze = { until: 10 * H, atXp: 500 };
    const still = advanceBase(b, { playerLevel: 26, sessions7: 7, globalXp: 500 }, H);
    expect(still.base.freeze).not.toBeNull();
    // Une séance de sport (XP en hausse) lève le gel immédiatement…
    const bySport = advanceBase(b, { playerLevel: 26, sessions7: 7, globalXp: 620 }, H);
    expect(bySport.base.freeze).toBeNull();
    // …et l'échéance le lève de toute façon : l'app ne réclame jamais d'entraînement.
    const byTime = advanceBase(b, { playerLevel: 26, sessions7: 7, globalXp: 500 }, 11 * H);
    expect(byTime.base.freeze).toBeNull();
  });

  it('une victoire ne coûte RIEN et sème quand même un champ de cadavres', () => {
    const b = base(0);
    const raid = rollRaid(555, 26, 0, 0);
    const rep = resolveRaid(baseCombatant(defs(40, 40), 40, hero(40)), raid, 0, true);
    expect(rep.held).toBe(true);
    const { base: nb, damage } = applyRaidOutcome(b, raid, rep, { sessions7: 7, globalXp: 0 }, 0);
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
    b = advanceBase(b, { playerLevel: 26, sessions7: 7, globalXp: 0 }, 6 * H).base;
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
    const loup = garrisonBonus([fam('a', 'damage_pct', 20)], 0, k, SLOTS);
    const ours = garrisonBonus([fam('b', 'dmg_reduction_pct', 20)], 0, k, SLOTS);
    const cerf = garrisonBonus([fam('c', 'max_pv_pct', 20)], 0, k, SLOTS);
    expect(loup.damagePct).toBeGreaterThan(0);
    expect(loup.maxPvPct).toBeUndefined();
    expect(ours.dmgReduction).toBeGreaterThan(0);
    expect(cerf.maxPvPct).toBeGreaterThan(0);
    // Rôles HORS combat : le faucon renseigne, la marmotte fouille.
    expect(garrisonBonus([fam('d', 'crit_pct', 20)], 0, k, SLOTS).scoutBonus).toBe(1);
    expect(garrisonBonus([fam('e', 'gold_pct', 20)], 0, k, SLOTS).lootPct).toBeGreaterThan(0);
  });

  it('sans Chenil, la garnison n’apporte rien', () => {
    expect(garrisonBonus([fam('a', 'damage_pct', 20)], 0, 0, SLOTS)).toEqual({});
  });

  it('le dressage DÉFENSIF renforce la garnison, et ne dépasse jamais le niveau du joueur', () => {
    const brut = garrisonBonus([fam('a', 'damage_pct', 20, 0)], 0, 5, SLOTS);
    const dresse = garrisonBonus([fam('a', 'damage_pct', 20, famXpForLevel(10))], 0, 5, SLOTS);
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
    expect(garrisonBonus([guerrier], 0, 5, SLOTS).damagePct).toBeCloseTo(
      garrisonBonus([base], 0, 5, SLOTS).damagePct!,
      5,
    );
    // …et l'axe d'attaque reste MODESTE : le combat du héros est calibré au serré.
    expect(famAtkMult(famLevel(guerrier.atkXp))).toBeLessThan(1.2);
  });

  it('un familier fatigué est DIMINUÉ, jamais perdu ni blessé', () => {
    // S'il pouvait être perdu, personne ne posterait ses bons familiers et le chenil
    // resterait vide le jour où la mécanique se déclenche.
    const tired: Item = { ...fam('a', 'damage_pct', 20), fatigueUntil: 10 * H };
    const rested = garrisonBonus([{ ...tired, fatigueUntil: 0 }], 5 * H, 5, SLOTS);
    const weary = garrisonBonus([tired], 5 * H, 5, SLOTS);
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
        SLOTS,
      );
      let held = 0;
      for (let i = 0; i < 200; i++) {
        const raid = rollRaid(i * 7919 + 13, 26, 0, 0);
        if (resolveRaid(baseCombatant(defs(26, 26), 26, null, bonus), raid, 0, false).held) held++;
      }
      return (held / 200) * 100;
    }
    const nu = rate([], 0);
    const garni = rate(real, 0);
    const dresse = rate(real, 26);
    expect(garni).toBeGreaterThan(nu); // elle sert vraiment…
    expect(garni - nu).toBeLessThan(20); // …sans renverser la table
    expect(dresse).toBeGreaterThan(garni); // le dressage se sent…
    expect(dresse).toBeLessThan(95); // …et ne rend jamais la base imprenable
  });

  it('la régénération est plafonnée PLUS BAS que le reste (elle compose)', () => {
    // Seule stat qui s'applique entre CHAQUE groupe, donc 4-5 fois par siège : 15 % de
    // soin par groupe rendrait la base quasi increvable.
    const gros = garrisonBonus(
      [fam('a', 'lifesteal_pct', 40), fam('b', 'lifesteal_pct', 40)],
      0,
      20,
      SLOTS,
    );
    expect(gros.regen).toBeLessThanOrEqual(GARRISON_CAP.regen);
    const mur = garrisonBonus(
      [fam('a', 'dmg_reduction_pct', 60), fam('b', 'dmg_reduction_pct', 60)],
      0,
      20,
      SLOTS,
    );
    expect(mur.dmgReduction).toBeLessThanOrEqual(GARRISON_CAP.dmgReduction);
  });

  it('l’assignation automatique prend les meilleurs, dans la limite des places', () => {
    // ⚠️ Réécrit en v0.719 : le pool d'origine était fait de TROIS familiers à dégâts,
    // dont deux étaient postés côte à côte. C'est précisément ce que la règle « un rôle
    // par poste » interdit désormais — le test verrouillait le défaut.
    const pool = [
      fam('faible', 'damage_pct', 5),
      fam('fort', 'damage_pct', 40),
      fam('cerf', 'max_pv_pct', 30),
      fam('ours', 'dmg_reduction_pct', 12),
    ];
    const picked = autoGarrison(pool, SLOTS);
    expect(picked).toHaveLength(SLOTS);
    expect(picked[0]).toBe('fort');
    expect(picked).not.toContain('faible');
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

  it('⚠️ la FOUILLE demande le meme nombre de vagues qu avant', () => {
    for (const L of [12, 26, 60, 90]) {
      M.massMult = 1;
      const avant = raidSize(L, 'betes') / scavengerCount(L);
      M.massMult = REF;
      const apres = raidSize(L, 'betes') / scavengerCount(L);
      // Sinon la foule devient une corvee : meme butin, 2,5x plus d allers-retours.
      expect(apres).toBeCloseTo(avant, 1);
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
    expect(scavengerCount(9)).not.toBe(scavengerCount(10));
    const a = defensePerLevelLabel('salvage', 9, ctx(9, 'salvage'));
    expect(a).toContain(String(scavengerCount(9)));
    expect(a).toContain(String(scavengerCount(10)));
    const w = defensePerLevelLabel('watchtower', 2, ctx(2, 'watchtower'));
    expect(w).toContain(fmtSpan(scoutLeadMs(3)));
  });

  it('⚠️ elle distingue le PLANCHER de la structure du RYTHME des sièges', () => {
    // Deux plafonds differents, deux motifs differents. Annoncer le mauvais enverrait le
    // joueur reduire son entrainement pour un gain qui ne viendrait jamais.
    const plancher = defensePerLevelLabel('infirmary', 20, ctx(20, 'infirmary'));
    expect(plancher).toMatch(/plancher/);
    expect(plancher).not.toMatch(/rythme/);
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
      ...resolveRaid(baseCombatant([], 26, null), lost, 0, true),
      held: false,
      heroHome: true,
    };
    const { base: nb } = applyRaidOutcome(b, raid, report, { sessions7: 7, globalXp: 0 }, 0);
    expect(nb.wound).not.toBeNull();
    // Il part à l'INFIRMERIE : plus de donjon, de faille ni d'expédition le temps qu'il
    // se remette. (Un simple malus de dégâts avait été essayé : sans mordant, puisqu'on
    // farme surtout du contenu qu’on domine largement — il ne changeait rien.)
    expect(isWounded(nb, 0)).toBe(true);
    expect(heroAvailable(nb, 0)).toBe(false);
    expect(woundRemainingMs(nb, 0)).toBeGreaterThan(0);
    // …et il se remet tout seul.
    expect(heroAvailable(nb, nb.wound!.until + 1)).toBe(true);
    const healed = advanceBase(nb, { playerLevel: 26, sessions7: 7, globalXp: 0 }, nb.wound!.until);
    expect(healed.base.wound).toBeNull();
  });

  it('une VICTOIRE ne blesse personne : la présence du héros reste un pari gagnant', () => {
    const b = emptyBase(1, 0);
    b.defenses = defs(40, 40);
    const raid = rollRaid(555, 26, 0, 0);
    const rep = resolveRaid(baseCombatant(defs(40, 40), 40, hero(40)), raid, 0, true);
    expect(rep.held).toBe(true);
    const { base: nb } = applyRaidOutcome(b, raid, rep, { sessions7: 7, globalXp: 0 }, 0);
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
      const d = garrisonBonus([fam(r)], 0, 28, SLOTS).damagePct ?? 0;
      expect(d, `rareté ${r}`).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('⚠️ l’écart suit l’échelle de rareté DU PROJET, pas une autre', () => {
    // ⚠️ On compare à `RARITY_MULT`, la CONSTANTE du projet — pas à un nombre écrit ici :
    // si l’échelle de rareté bouge un jour, ce test suit au lieu de mentir.
    const bas = garrisonBonus([fam(RANK_ORDER[0]!)], 0, 28, SLOTS).damagePct ?? 0;
    const dernier = RANK_ORDER[RANK_ORDER.length - 1]!;
    const haut = garrisonBonus([fam(dernier)], 0, 28, SLOTS).damagePct ?? 0;
    const attendu = RARITY_MULT[dernier] / RARITY_MULT[RANK_ORDER[0]!];
    // ⚠️ Tolérance RELATIVE : `effect.value` est stocké à UNE décimale (`round1`), donc
    // le rapport mesuré (3,93) frôle l’échelle théorique (4,00) sans l’égaler. Ce qui
    // compte est qu’il la SUIVE — s’il tombait à 1, la rareté ne compterait plus.
    expect(Math.abs(haut / bas - attendu) / attendu).toBeLessThan(0.05);
  });
});
