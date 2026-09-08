import { describe, it, expect } from 'vitest';
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
  scavengerCount,
  pickScavengeTargets,
  turretCount,
  repairCost,
  TURRET_SLOTS,
  RAID,
  repairStructure,
  totalRepairCost,
  garrisonBonus,
  autoGarrison,
  fatigueMsFor,
  woundMsFor,
  woundRemainingMs,
  heroAvailable,
  healCost,
  isWounded,
  WOUND_MAX_MS,
  GARRISON_SLOTS,
  GARRISON_CAP,
  SCAV,
  FACTION_PROFILE,
  type BaseState,
  type DefenseStructure,
  type RaidFaction,
} from '@/lib/raid';
import { refFighter, gearExpect } from '@/lib/proceduralContent';
import {
  rankCeilingForLevel,
  RANK_ORDER,
  famLevel,
  famAtkMult,
  famXpForLevel,
  grantFamiliarXp,
  type Item,
} from '@/lib/items';
import type { Combatant } from '@/lib/combat';

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
    const base = baseCombatant(defs(defLevel, defLevel), heroHome ? hero(playerLevel) : null);
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
        if (resolveRaid(baseCombatant(defs(26, 26), null), raid, 0, false).held) held++;
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
      expect(holdRate(L, L + 3, false), `niveau ${L}, sur-investi`).toBeGreaterThan(75);
    }
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
      if (resolveRaid(baseCombatant(broken, hero(26)), raid, 0, true).held) held++;
    }
    expect((held / 200) * 100).toBeGreaterThan(25);
    expect(baseCombatant(broken, null).pv).toBeGreaterThan(0);
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

  it('les tourelles visibles sont bornées aux emplacements du mur', () => {
    expect(turretCount(0)).toBe(0);
    for (let l = 1; l <= 120; l++) expect(turretCount(l)).toBeLessThanOrEqual(TURRET_SLOTS);
    expect(turretCount(1)).toBeGreaterThan(0);
    expect(turretCount(60)).toBe(TURRET_SLOTS);
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
    expect(seen[5]!.forecast).toBe(true);
  });

  it('le préavis croît avec la Tour et reste borné', () => {
    expect(scoutLeadMs(0)).toBe(RAID.scoutLeadBaseMs);
    expect(scoutLeadMs(10)).toBeGreaterThan(scoutLeadMs(3));
    expect(scoutLeadMs(999)).toBe(RAID.scoutLeadCapMs);
  });
});

describe('rythme', () => {
  it('plus on s’entraîne, plus la base attire — dans des bornes connues', () => {
    expect(raidIntervalMs(7)).toBe(RAID.intervalActiveMs);
    expect(raidIntervalMs(0)).toBe(RAID.intervalIdleMs);
    expect(raidIntervalMs(7)).toBeLessThan(raidIntervalMs(3));
    expect(raidIntervalMs(3)).toBeLessThan(raidIntervalMs(0));
  });
});

describe('cycle de vie', () => {
  function base(now: number): BaseState {
    const b = emptyBase(1234, now);
    b.defenses = defs(20, 20, 6);
    return b;
  }

  it('sans muraille, AUCUNE attaque — le système est opt-in', () => {
    const b = emptyBase(7, 0);
    expect(raidsEnabled(b, 7)).toBe(false);
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
    const rep = resolveRaid(baseCombatant(defs(40, 40), hero(40)), raid, 0, true);
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
    expect(betes.fragments).toBeGreaterThan(0);
    expect(betes.inkDust).toBe(0);
    expect(morts.inkDust).toBeGreaterThan(0);
    expect(morts.fragments).toBe(0);
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
        if (resolveRaid(baseCombatant(defs(26, 26), null, bonus), raid, 0, false).held) held++;
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
    const pool = [
      fam('faible', 'damage_pct', 5),
      fam('fort', 'damage_pct', 40),
      fam('moyen', 'damage_pct', 20),
      fam('autre', 'max_pv_pct', 30),
    ];
    const picked = autoGarrison(pool);
    expect(picked).toHaveLength(GARRISON_SLOTS);
    expect(picked[0]).toBe('fort');
    expect(picked).not.toContain('faible');
  });
});

describe('blessure du héros', () => {
  it('un siège PERDU avec le héros présent le blesse — mais ne le BLOQUE jamais', () => {
    const b = emptyBase(1, 0);
    b.defenses = defs(20, 20);
    const raid = rollRaid(77, 26, 0, 0);
    const lost = { ...raid, groups: raid.groups } as never;
    const report = {
      ...resolveRaid(baseCombatant([], null), lost, 0, true),
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
    const rep = resolveRaid(baseCombatant(defs(40, 40), hero(40)), raid, 0, true);
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
      expect(woundMsFor(inf)).toBeLessThan(RAID.intervalActiveMs);
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
