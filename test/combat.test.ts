import { describe, it, expect } from 'vitest';
import {
  playerCombatant,
  combatPower,
  combatPowerRaw,
  COMBAT,
  PROC_POWER,
  simulateCombat,
  simulateDungeon,
  mulberry32,
  fmtPow,
  fmtDelta,
  betweenFightsHeal,
} from '@/lib/combat';
import { labyrinthRest } from '@/lib/labyrinthRun';
// Import STATIQUE : @/data/monsters construit tout le contenu procédural au chargement.
// En import dynamique dans le test, ce coût tombait DANS son délai de 5 s et le faisait
// expirer sous la charge de la suite complète.
import { monsterArchetype } from '@/data/monsters';

const strong = playerCombatant('Fort', { puissance: 80, endurance: 60, agilite: 40 }, 10);
const weak = playerCombatant('Faible', { puissance: 3, endurance: 1, agilite: 1 }, 1);

describe('archétypes de monstres (variété visuelle)', () => {
  it('classe selon les stats (esquive/crit/ratio)', () => {
    expect(monsterArchetype({ pv: 100, damage: 30, crit: 0.02, dodge: 0.16 })).toBe('evasive');
    expect(monsterArchetype({ pv: 100, damage: 30, crit: 0.14, dodge: 0.05 })).toBe('striker');
    expect(monsterArchetype({ pv: 100, damage: 70, crit: 0.05, dodge: 0.05 })).toBe('brute');
    expect(monsterArchetype({ pv: 100, damage: 30, crit: 0.05, dodge: 0.05 })).toBe('tank');
    expect(monsterArchetype({ pv: 100, damage: 48, crit: 0.05, dodge: 0.05 })).toBe('normal');
  });
});

describe('timeout de combat (garde-fou anti-boucle)', () => {
  it('un combat borné en tours se termine (pas de boucle infinie) et tranche au % de PV', () => {
    // Deux combattants ultra-tanky à faibles dégâts → aucune mort avant maxRounds.
    const tanky = {
      name: 'A',
      pv: 100000,
      damage: 1,
      crit: 0,
      dodge: 0,
      initiative: 5,
      strikes: 1,
    };
    const foe = { name: 'B', pv: 500, damage: 1, crit: 0, dodge: 0, initiative: 1, strikes: 1 };
    const r = simulateCombat(tanky, foe, { seed: 7, goldOnWin: 10 });
    expect(r.rounds).toBeLessThanOrEqual(400); // borné → jamais « sans fin »
    // Le joueur garde un % de PV bien supérieur → il l'emporte au timeout.
    expect(r.win).toBe(true);
  });
});

describe('épines (thorns)', () => {
  const monster = { name: 'M', pv: 400, damage: 40, crit: 0, dodge: 0, initiative: 1, strikes: 1 };
  const base = playerCombatant('Tank', { puissance: 10, endurance: 60, agilite: 5 }, 6);
  it('un défenseur avec épines renvoie des dégâts → gagne au moins aussi souvent', () => {
    const win = (thorns: number) => {
      let w = 0;
      for (let s = 0; s < 40; s++)
        if (simulateCombat({ ...base, thorns }, monster, { seed: s * 53 + 1, goldOnWin: 0 }).win)
          w++;
      return w;
    };
    expect(win(0.5)).toBeGreaterThanOrEqual(win(0));
  });
  it('la puissance (non arrondie) croît avec les épines', () => {
    // ⚠️ Poids mesuré petit (v0.837) : l’arrondi de combatPower l’effaçait sur ce combattant.
    expect(combatPowerRaw({ ...base, thorns: 0.5 })).toBeGreaterThan(
      combatPowerRaw({ ...base, thorns: 0 }),
    );
  });
});

describe('poids de puissance (v0.837, mesurés en vrai combat)', () => {
  const h = { name: 'h', pv: 1000, damage: 100, crit: 0.2, dodge: 0.1, initiative: 1, strikes: 2 };
  // ⚠️ RÉÉCRIT (refonte équipement, étape 7) : le vol de vie est de la SURVIE et se compte par
  // son SOIN PAR TOUR, plafonné comme en combat. h frappe 100 × 2 × (1 + 0,2) = 240 par tour
  // pour 1000 PV : 10 % de vol de vie rendent 2,4 % des PV par tour.
  it('le vol de vie vaut son soin par tour, plafonné comme en combat', () => {
    const p = (lifesteal: number, extra = {}) => combatPowerRaw({ ...h, lifesteal, ...extra });
    // La valeur exacte : puissance × (1 + poids × soin par tour).
    expect(p(0.1) / p(0)).toBeCloseTo(1 + COMBAT.powerSustainW * 0.024, 6);
    expect(p(0.3)).toBeGreaterThan(p(0.1));
    // Au-delà du plafond de soin du tour (8 % des PV, atteint à 1/3 de vol de vie), plus rien.
    const capAt = COMBAT.lifestealRoundCap / 0.24;
    expect(p(0.9)).toBe(p(capAt + 0.01));
    expect(p(capAt + 0.01) / p(0)).toBeCloseTo(
      1 + COMBAT.powerSustainW * COMBAT.lifestealRoundCap,
      6,
    );
    // Soif éternelle (Vampire) relève le plafond : la puissance le voit.
    const vamp = { procs: new Set(['sig_vampire']) };
    expect(p(0.9, vamp) / p(0, vamp)).toBeGreaterThan(p(0.9) / p(0));
  });
  it('l’élan pèse son poids mesuré', () => {
    const r = combatPowerRaw({ ...h, momentum: 0.02 }) / combatPowerRaw(h);
    expect(r).toBeCloseTo(Math.sqrt(1 + 0.02 * COMBAT.powerMomentumW), 6);
  });
  it('chaque proc légendaire a un poids, et ils pèsent tous pareil (rééquilibrés à ~+8 %)', async () => {
    const { LEGENDARY_PROCS } = await import('@/lib/items');
    const w = LEGENDARY_PROCS.map((p) => PROC_POWER[p.id]?.weight);
    expect(w.every((x) => (x ?? 0) > 0)).toBe(true);
    expect(new Set(w).size).toBe(1);
    // 'charge' ne dépend d'aucune stat : il pèse toujours.
    const r = combatPowerRaw({ ...h, procs: new Set(['charge']) }) / combatPowerRaw(h);
    expect(r).toBeCloseTo(Math.sqrt(1 + PROC_POWER.charge!.weight), 6);
  });
  it('⚠️ un proc qui AMPLIFIE une stat ne pèse que si le combattant la porte', () => {
    // Mesuré : un proc de riposte vaut +17,5 % chez le Duelliste et 0,0 % chez qui n'en porte
    // pas — la puissance le comptait quand même, donc l'optimiseur équipait un objet pour un
    // pouvoir qui ne se déclencherait jamais.
    for (const [id, stat] of [
      ['whetted', 'riposte'],
      ['thirst', 'lifesteal'],
      ['rage_seal', 'rage'],
    ] as const) {
      expect(PROC_POWER[id]!.needs).toBe(stat);
      const sans = combatPowerRaw({ ...h, procs: new Set([id]) }) / combatPowerRaw(h);
      expect(sans).toBe(1); // sans la stat : rien
      const base = { ...h, [stat]: 0.5 };
      const avec = combatPowerRaw({ ...base, procs: new Set([id]) }) / combatPowerRaw(base);
      expect(avec).toBeCloseTo(Math.sqrt(1 + PROC_POWER[id]!.weight), 6);
    }
  });
  it('deux procs du même côté s’additionnent sur leur facteur', () => {
    const two = combatPowerRaw({ ...h, procs: new Set(['charge', 'cadence']) });
    const w = PROC_POWER.charge!.weight + PROC_POWER.cadence!.weight;
    expect(two / combatPowerRaw(h)).toBeCloseTo(Math.sqrt(1 + w), 6);
  });
});

describe('procs légendaires (Phase 3)', () => {
  const pl = (procs: string[], over: Record<string, unknown> = {}) => ({
    name: 'P',
    pv: 200,
    damage: 20,
    crit: 0,
    dodge: 0,
    initiative: 10,
    strikes: 1,
    procs: new Set(procs),
    ...over,
  });
  const mon = (over: Record<string, unknown> = {}) => ({
    name: 'M',
    pv: 500,
    damage: 40,
    crit: 0,
    dodge: 0,
    initiative: 1,
    strikes: 1,
    ...over,
  });

  // ⚠️ Même combat, même graine, avec et sans le proc : aucun proc ne consomme de rng, donc
  // les deux côtés tirent la même variance et on peut comparer les dégâts au point près.
  const monHits = (procs: string[], m: ReturnType<typeof mon>, over = {}) =>
    simulateCombat(pl(procs, over), m, { seed: 5, goldOnWin: 0 }).log.filter(
      (e) => e.who === 'monster' && e.type !== 'dodge',
    );

  it('Égide : la 1re attaque ennemie qui touche est bloquée d’office (−75 %), pas la 2e', () => {
    const m = mon({ initiative: 99 }); // le monstre frappe en premier
    const avec = monHits(['aegis'], m);
    const sans = monHits([], m);
    expect(avec[0]!.damage).toBe(Math.round(sans[0]!.damage * (1 - COMBAT.aegisBlock)));
    expect(avec[0]!.damage).toBeGreaterThan(0); // amortie, plus annulée (v0.837)
    expect(avec[1]!.damage).toBe(sans[1]!.damage);
  });

  it('Rétorsion : les 3 premiers coups reçus retirent chacun 7 % des PV max ennemis, pas le 4e', () => {
    const m = mon({ initiative: 99, pv: 5000 });
    const avec = monHits(['retort'], m, { damage: 1 });
    const sans = monHits([], m, { damage: 1 });
    const blessure = Math.round(5000 * COMBAT.retortMaxPvPct);
    for (let k = 0; k < 5; k++)
      expect(sans[k]!.monsterPv - avec[k]!.monsterPv, `coup ${k + 1}`).toBe(
        blessure * Math.min(k + 1, COMBAT.retortHits),
      );
  });

  it('Phénix : le coup fatal perd la moitié de ses dégâts — un coup deux fois mortel tue quand même', () => {
    const m = (damage: number) => mon({ initiative: 99, damage });
    // ~80 de dégâts sur 50 PV : mortel sans le proc, ~40 une fois amorti.
    expect(monHits([], m(80), { pv: 50 })[0]!.playerPv).toBe(0);
    expect(monHits(['phoenix'], m(80), { pv: 50 })[0]!.playerPv).toBeGreaterThan(0);
    // ⚠️ Plus de survie garantie à 1 PV (v0.837) : amorti, un coup de 1000 reste mortel.
    expect(monHits(['phoenix'], m(1000), { pv: 50 })[0]!.playerPv).toBe(0);
  });

  const playerLog = (procs: string[], m: ReturnType<typeof mon>, over = {}) =>
    simulateCombat(pl(procs, over), m, { seed: 2, goldOnWin: 0 }).log.filter(
      (e) => e.who === 'player',
    );

  it('Initiative : TOUS les coups de ses premiers tours sont inesquivables, pas ceux du suivant', () => {
    // ⚠️ Un héros frappe plusieurs fois par tour (~17 au niveau 60) : un proc limité au
    // 1er COUP ne durait qu’un instant, il vaut pour des TOURS (v0.837) — trois depuis le
    // 2026-09-22 (sur un seul, il ne valait rien contre un boss).
    const dodgy = mon({ dodge: 1, damage: 5, pv: 1e6 });
    const avec = playerLog(['initiative'], dodgy, { strikes: 3 });
    const rounds = [...new Set(avec.map((e) => e.round))];
    const opening = avec.filter((e) => rounds.indexOf(e.round) < COMBAT.initiativeTurns);
    expect(opening).toHaveLength(3 * COMBAT.initiativeTurns);
    expect(opening.map((e) => e.type)).not.toContain('dodge');
    expect(avec.find((e) => e.round === rounds[COMBAT.initiativeTurns])!.type).toBe('dodge');
    // Mesuré (2026-09-22) : sur UN seul tour, −3 à +4 % contre un boss — rien. Trois tours : +5 à +10 %.
    expect(COMBAT.initiativeTurns).toBeGreaterThanOrEqual(3);
    expect(playerLog([], dodgy, { strikes: 3 })[0]!.type).toBe('dodge'); // sans le proc
  });

  // ⚠️ RÉÉCRIT (refonte équipement, étape 5) : l'Œil passe au CASQUE et prolonge la
  // précision (inesquivable) au lieu du critique, stat de l'anneau.
  it('Œil du prédateur : les coups des 3 premiers tours sont inesquivables, pas ceux du 4e', () => {
    const avec = playerLog(['predator_eye'], mon({ dodge: 1, damage: 0, pv: 1e6 }), { strikes: 2 });
    const rounds = [...new Set(avec.map((e) => e.round))];
    const ofTurn = (i: number) => avec.filter((e) => e.round === rounds[i]).map((e) => e.type);
    for (let t = 0; t < COMBAT.predatorTurns; t++)
      expect(ofTurn(t), `tour ${t + 1}`).toEqual(['hit', 'hit']);
    expect(ofTurn(COMBAT.predatorTurns)).toEqual(['dodge', 'dodge']);
  });

  it('Œil du prédateur : les coups de ses tours frappent plus fort, pas ceux d’après', () => {
    const m = mon({ damage: 0, pv: 1e6 });
    const avec = playerLog(['predator_eye'], m);
    const sans = playerLog([], m);
    // À l'arrondi près : le multiplicateur s'applique avant l'arrondi final du coup.
    expect(Math.abs(avec[0]!.damage - sans[0]!.damage * COMBAT.predatorMult)).toBeLessThanOrEqual(
      1,
    );
    expect(avec[0]!.damage).toBeGreaterThan(sans[0]!.damage);
    expect(avec[COMBAT.predatorTurns]!.damage).toBe(sans[COMBAT.predatorTurns]!.damage);
  });

  it('Vampirisme : le soin des critiques a sa propre réserve par tour', () => {
    // Crit de 1 000 sur 200 PV max : sans réserve il soignerait 500 ; il en rend 2 % des PV max.
    const e = simulateCombat(
      pl(['vampiric'], { crit: 1, damage: 1000 }),
      mon({ damage: 0, pv: 1e6 }),
      {
        seed: 9,
        goldOnWin: 0,
        startPlayerPv: 10,
      },
    ).log.find((x) => x.who === 'player')!;
    expect(e.playerPv - 10).toBe(Math.round(200 * COMBAT.vampiricCapPct));
  });

  it('Vampirisme : les crits soignent', () => {
    const m = mon({ damage: 0, pv: 5000 });
    const firstPlayerPv = (procs: string[]) =>
      simulateCombat({ ...pl(procs, { crit: 1 }) }, m, {
        seed: 9,
        goldOnWin: 0,
        startPlayerPv: 10,
      }).log.find((e) => e.who === 'player')!.playerPv;
    expect(firstPlayerPv(['vampiric'])).toBeGreaterThan(10);
    expect(firstPlayerPv([])).toBe(10); // monstre à 0 dégât → sans soin, PV figés
  });

  it('Bourreau : exécute un ennemi bas → moins de coups pour tuer', () => {
    const m = mon({ damage: 0, pv: 100 });
    const hits = (procs: string[]) => {
      let n = 0;
      for (let s = 0; s < 40; s++)
        n += simulateCombat(pl(procs, { damage: 18 }), m, {
          seed: s * 11 + 1,
          goldOnWin: 0,
        }).log.filter((e) => e.who === 'player' && e.type !== 'dodge').length;
      return n;
    };
    expect(hits(['executioner'])).toBeLessThan(hits([]));
  });

  it('combatPower valorise les procs (offense & survie)', () => {
    const base = playerCombatant('X', { puissance: 40, endurance: 30, agilite: 20 }, 8);
    expect(combatPower({ ...base, procs: new Set(['executioner']) })).toBeGreaterThan(
      combatPower(base),
    );
    expect(combatPower({ ...base, procs: new Set(['phoenix']) })).toBeGreaterThan(
      combatPower(base),
    );
    expect(combatPower({ ...base, procs: new Set(['secondwind']) })).toBeGreaterThan(
      combatPower(base),
    );
  });

  it('sans procs, le combat est byte-identique à l’ancien moteur (déterminisme préservé)', () => {
    const p = playerCombatant('Old', { puissance: 50, endurance: 40, agilite: 25 }, 9);
    const m = mon({ pv: 800, damage: 55, crit: 0.1, dodge: 0.08 });
    const a = simulateCombat(p, m, { seed: 12345, goldOnWin: 100 });
    const b = simulateCombat({ ...p }, m, { seed: 12345, goldOnWin: 100 });
    expect(a.log.length).toBe(b.log.length);
    expect(a.win).toBe(b.win);
  });
});

describe('fmtPow / fmtDelta', () => {
  it('entier jusqu’à 9999, puis compact k/M (1 déc. k, 2 déc. M)', () => {
    expect(fmtPow(950)).toBe('950');
    expect(fmtPow(1500)).toBe('1500'); // ≤ 9999 → affiché en entier
    expect(fmtPow(9999)).toBe('9999');
    expect(fmtPow(10000)).toBe('10,0k'); // > 9999 → compact
    expect(fmtPow(35324)).toBe('35,3k');
    expect(fmtPow(1_234_567)).toBe('1,23M');
  });
  it('delta signé précis, même quand fmtPow arrondirait pareil', () => {
    // 35300 et 35320 s'affichent tous deux « 35,3k » → le delta reste visible.
    expect(fmtPow(35300)).toBe(fmtPow(35320));
    expect(fmtDelta(35300, 35320)).toBe('+20');
    expect(fmtDelta(35320, 35300)).toBe('−20');
  });
});

const dummy = {
  name: 'Mannequin',
  pv: 80,
  damage: 10,
  crit: 0.05,
  dodge: 0.05,
  initiative: 5,
};
const boss = { name: 'Boss', pv: 2000, damage: 200, crit: 0.2, dodge: 0.3, initiative: 99 };

describe('playerCombatant', () => {
  it('dérive PV/dégâts/crit/esquive/vitesse/défense des stats ET du niveau', () => {
    const c = playerCombatant('X', { puissance: 20, endurance: 30, agilite: 50 }, 3);
    expect(c.pv).toBe(100 + 15 * 3 + 30 * 10); // plancher niveau + endurance
    expect(c.damage).toBe(Math.round(6 + 10 * 3 + 20 * 1.2)); // plancher niveau + puissance
    expect(c.crit).toBeCloseTo(50 * 0.002); // agilité
    expect(c.dodge).toBeCloseTo(50 * 0.003);
    expect(c.strikes).toBeCloseTo(1 + 50 * 0.004); // Vitesse (multi-frappe)
    expect(c.dmgReduction).toBeCloseTo(20 * 0.002); // Défense (puissance)
  });
  it('un profil sans Puissance frappe quand même (planchers de niveau)', () => {
    const cardio = playerCombatant('Cardio', { puissance: 0, endurance: 40, agilite: 60 }, 10);
    expect(cardio.damage).toBeGreaterThan(1);
    expect(cardio.strikes!).toBeGreaterThan(1); // il compense par le volume de frappes
  });
  it('crit, esquive et défense sont plafonnés', () => {
    const c = playerCombatant('X', { puissance: 100000, endurance: 1, agilite: 100000 }, 1);
    expect(c.crit).toBeLessThanOrEqual(0.5);
    expect(c.dodge).toBeLessThanOrEqual(0.4);
    expect(c.dmgReduction!).toBeLessThanOrEqual(0.45);
  });
});

describe('le combat récompense l’ÉQUILIBRE', () => {
  it('à budget de stats égal, l’équilibré a la plus haute puissance de combat', () => {
    const L = 15;
    const budget = 800;
    const mk = (p: number, e: number, a: number) =>
      combatPower(
        playerCombatant(
          'x',
          {
            puissance: Math.round(budget * p),
            endurance: Math.round(budget * e),
            agilite: Math.round(budget * a),
          },
          L,
        ),
      );
    const equilibre = mk(0.35, 0.46, 0.19);
    const muscu = mk(0.6, 0.3, 0.1);
    const coureur = mk(0.1, 0.62, 0.28);
    expect(equilibre).toBeGreaterThan(muscu);
    expect(equilibre).toBeGreaterThan(coureur);
    // …mais les extrêmes restent viables (pas écrasés) : ≥ 55 % de l’équilibré.
    expect(muscu).toBeGreaterThan(equilibre * 0.55);
    expect(coureur).toBeGreaterThan(equilibre * 0.55);
  });
});

describe('simulateCombat', () => {
  it('déterministe : même seed → même résultat', () => {
    const a = simulateCombat(strong, dummy, { seed: 42, goldOnWin: 50 });
    const b = simulateCombat(strong, dummy, { seed: 42, goldOnWin: 50 });
    expect(a.win).toBe(b.win);
    expect(a.rounds).toBe(b.rounds);
    expect(a.log.length).toBe(b.log.length);
  });
  it('un perso fort bat un mannequin faible et gagne l’or', () => {
    const r = simulateCombat(strong, dummy, { seed: 7, goldOnWin: 50 });
    expect(r.win).toBe(true);
    expect(r.gold).toBe(50);
  });
  it('un perso faible perd contre un boss et ne gagne rien', () => {
    const r = simulateCombat(weak, boss, { seed: 7, goldOnWin: 50 });
    expect(r.win).toBe(false);
    expect(r.gold).toBe(0);
  });
  it('le journal se termine avec un camp à 0 PV', () => {
    const r = simulateCombat(strong, dummy, { seed: 1, goldOnWin: 10 });
    const last = r.log[r.log.length - 1]!;
    expect(last.playerPv === 0 || last.monsterPv === 0).toBe(true);
  });
});

describe('barrière de départ (🔰 start_shield)', () => {
  // ⚠️ UNE PAR DESCENTE, pas une par combat (sets spécialisés, 2026-09-22). Elle se rechargeait
  // à chaque combat : avec ~60 % des PV en barrière, un Gardien ou un Colosse ne s'usaient plus
  // jamais dans une descente — mesuré, 100 % des paliers du Labyrinthe pour eux contre 0 à 20 %
  // pour les autres voies. Ce qu'il en reste passe au combat suivant, comme la jauge de relique.
  const porteur = {
    ...playerCombatant('B', { puissance: 20, endurance: 40, agilite: 5 }, 8),
    startShield: 0.5,
  };
  const cogneur = {
    name: 'C',
    pv: 4000,
    damage: 90,
    crit: 0,
    dodge: 0,
    initiative: 99,
    strikes: 1,
  };
  it('le combat rend ce qu’il en reste, et il DESCEND d’un combat à l’autre', () => {
    const un = simulateCombat(porteur, cogneur, { seed: 5, goldOnWin: 0 });
    expect(un.shield).toBeGreaterThanOrEqual(0);
    expect(un.shield).toBeLessThan(Math.round(porteur.pv * 0.5)); // elle a encaissé
    const deux = simulateCombat(porteur, cogneur, {
      seed: 5,
      goldOnWin: 0,
      startPlayerPv: un.log.at(-1)!.playerPv,
      shield: un.shield!,
    });
    expect(deux.shield!).toBeLessThanOrEqual(un.shield!);
  });
  it('sans barrière portée, le combat n’en annonce aucune', () => {
    expect(simulateCombat(strong, cogneur, { seed: 5, goldOnWin: 0 }).shield).toBeUndefined();
  });
  it('dans un donjon, le 2ᵉ combat commence avec ce qu’il en RESTE (pas une barrière neuve)', () => {
    // Le mordeur vide la barrière pendant le 1er combat ; au 2ᵉ, les PV baissent dès le premier
    // coup reçu. Avec une barrière neuve par combat, ils resteraient intacts le temps qu'elle
    // s'épuise à nouveau.
    const mordeur = {
      name: 'D',
      pv: 700,
      damage: 28,
      crit: 0,
      dodge: 0,
      initiative: 99,
      strikes: 1,
    };
    const r = simulateDungeon(
      porteur,
      [
        { combatant: mordeur, gold: 0 },
        { combatant: { ...mordeur, name: 'D2' }, gold: 0 },
      ],
      { seed: 11 },
    );
    expect(r.defeated).toBe(2);
    // Coups reçus qui ONT coûté des PV (la barrière les encaisse sans rien coûter).
    const touches = (fight: (typeof r.fights)[number]) =>
      fight.result.log.filter((e) => e.who === 'monster' && e.damage > 0).length;
    expect(touches(r.fights[0]!)).toBe(0); // 1er combat : la barrière absorbe tout
    expect(touches(r.fights[1]!)).toBeGreaterThan(0); // 2ᵉ : elle est vide, les coups portent
  });
});

describe('simulateDungeon', () => {
  const foes = [
    { combatant: { ...dummy, name: 'M1' }, gold: 10 },
    { combatant: { ...dummy, name: 'M2' }, gold: 15 },
  ];
  it('un perso fort nettoie le donjon et cumule l’or', () => {
    const r = simulateDungeon(strong, foes, { seed: 3 });
    expect(r.cleared).toBe(true);
    expect(r.defeated).toBe(2);
    expect(r.gold).toBe(25);
    expect(r.fights).toHaveLength(2);
  });
  it('un perso faible échoue et ne garde que l’or des monstres vaincus', () => {
    const tough = [
      {
        combatant: { name: 'B1', pv: 5000, damage: 300, crit: 0.3, dodge: 0.3, initiative: 99 },
        gold: 50,
      },
      {
        combatant: { name: 'B2', pv: 5000, damage: 300, crit: 0.3, dodge: 0.3, initiative: 99 },
        gold: 50,
      },
    ];
    const r = simulateDungeon(weak, tough, { seed: 3 });
    expect(r.cleared).toBe(false);
    expect(r.gold).toBeLessThan(100);
  });
  it('les PV se reportent : PV final ≤ PV max', () => {
    const r = simulateDungeon(strong, foes, { seed: 9 });
    expect(r.finalPv).toBeLessThanOrEqual(strong.pv);
    expect(r.finalPv).toBeGreaterThan(0);
  });
});

describe('mulberry32', () => {
  it('renvoie des nombres dans [0,1[', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('effets signature (execute / rage / momentum)', () => {
  const base = playerCombatant('Héros', { puissance: 50, endurance: 40, agilite: 20 }, 8);
  const foe = { name: 'Cible', pv: 900, damage: 40, crit: 0.05, dodge: 0.05, initiative: 5 };

  it('combatPower augmente avec chaque effet signature', () => {
    const p0 = combatPower(base);
    expect(combatPower({ ...base, execute: 0.5 })).toBeGreaterThan(p0);
    expect(combatPower({ ...base, rage: 0.5 })).toBeGreaterThan(p0);
    expect(combatPower({ ...base, momentum: 0.1 })).toBeGreaterThan(p0);
  });

  it('Exécution ne ralentit jamais et achève plus vite (l’ennemi passe sous 25% PV)', () => {
    const ref = simulateCombat(base, foe, { seed: 7, goldOnWin: 0 });
    const withExec = simulateCombat({ ...base, execute: 0.6 }, foe, { seed: 7, goldOnWin: 0 });
    expect(ref.win).toBe(true);
    expect(withExec.win).toBe(true);
    expect(withExec.rounds).toBeLessThanOrEqual(ref.rounds);
  });

  it('Déferlante (momentum) accélère la victoire (dégâts cumulés par coup)', () => {
    const ref = simulateCombat(base, foe, { seed: 11, goldOnWin: 0 });
    const withMom = simulateCombat({ ...base, momentum: 0.15 }, foe, { seed: 11, goldOnWin: 0 });
    expect(ref.win).toBe(true);
    expect(withMom.win).toBe(true);
    expect(withMom.rounds).toBeLessThanOrEqual(ref.rounds);
  });

  it('Rage aide quand le joueur démarre bas (< 30% PV)', () => {
    const lowPv = Math.round(base.pv * 0.2);
    const ref = simulateCombat(base, foe, { seed: 3, goldOnWin: 0, startPlayerPv: lowPv });
    const withRage = simulateCombat({ ...base, rage: 0.8 }, foe, {
      seed: 3,
      goldOnWin: 0,
      startPlayerPv: lowPv,
    });
    // La rage n'enlève jamais de dégâts : au pire égalité, sinon meilleur.
    if (ref.win && withRage.win) expect(withRage.rounds).toBeLessThanOrEqual(ref.rounds);
    expect(withRage.win || !ref.win).toBe(true);
  });

  it('sans effet signature, le combat est inchangé (rétro-compat)', () => {
    const a = simulateCombat(base, foe, { seed: 99, goldOnWin: 5 });
    const b = simulateCombat({ ...base }, foe, { seed: 99, goldOnWin: 5 });
    expect(a.rounds).toBe(b.rounds);
    expect(a.win).toBe(b.win);
  });
});

describe('procs de SET (v0.701) — chacun doit CHANGER le combat', () => {
  // ⚠️ Un proc qui ne modifie rien serait du décor : ces tests comparent le MÊME combat,
  // à la MÊME graine, avec et sans le proc. Ils tiennent parce qu'aucun de ces procs ne
  // consomme de `rng` — la variance tirée est donc identique des deux côtés. Si l'un d'eux
  // se mettait à tirer un aléa, ces tests deviendraient instables : c'est voulu, ils
  // servent aussi de garde-fou au déterminisme.
  const pl = (procs: string[], over: Record<string, unknown> = {}) => ({
    name: 'P',
    pv: 200,
    damage: 20,
    crit: 0,
    dodge: 0,
    initiative: 10,
    strikes: 1,
    procs: new Set(procs),
    ...over,
  });
  const mon = (over: Record<string, unknown> = {}) => ({
    name: 'M',
    pv: 5000,
    damage: 40,
    crit: 0,
    dodge: 0,
    initiative: 1,
    strikes: 1,
    ...over,
  });
  const playerHits = (procs: string[], m = mon(), opts = {}) =>
    simulateCombat(pl(procs), m, { seed: 11, goldOnWin: 0, ...opts }).log.filter(
      (e) => e.who === 'player' && (e.type === 'hit' || e.type === 'crit'),
    );

  it('Charge : les coups des premiers tours frappent plus fort, pas ceux du tour suivant', () => {
    // 2 frappes par tour : les coups des `chargeTurns` premiers tours sont chargés, le
    // suivant redevient normal. Monstre robuste : le combat doit durer jusque-là.
    const hits = (procs: string[]) =>
      simulateCombat(pl(procs, { strikes: 2 }), mon({ pv: 1e6 }), {
        seed: 11,
        goldOnWin: 0,
      }).log.filter((e) => e.who === 'player' && (e.type === 'hit' || e.type === 'crit'));
    const avec = hits(['charge']);
    const sans = hits([]);
    const last = COMBAT.chargeTurns * 2 - 1;
    expect(avec[0]!.damage).toBeGreaterThan(sans[0]!.damage);
    expect(avec[last]!.damage).toBeGreaterThan(sans[last]!.damage); // 2e coup du dernier tour
    expect(avec[last + 1]!.damage).toBe(sans[last + 1]!.damage); // tour suivant : normal
  });

  it('Cadence : rien au début, puis le gain s’installe — l’inverse de la Charge', () => {
    const avec = playerHits(['cadence']);
    const sans = playerHits([]);
    expect(avec[0]!.damage).toBe(sans[0]!.damage); // pas d'ouverture
    expect(avec[5]!.damage).toBeGreaterThan(sans[5]!.damage); // l'élan, lui, paie
  });

  // ⚠️ RÉÉCRIT (étape 5) : Riposte affûtée passe au BOUCLIER et rend les RIPOSTES critiques.
  it('Riposte affûtée : une riposte vaut une volée CRITIQUE entière, pas le critique moyen', () => {
    const m = mon({ initiative: 99, pv: 1e6 });
    const riposte = (procs: string[]) =>
      simulateCombat(pl(procs, { riposte: 1, strikes: 2 }), m, { seed: 11, goldOnWin: 0 }).log.find(
        (e) => e.skills?.includes('riposte'),
      )!;
    // crit 0, ×2 : 20 × 2 frappes × 2 = 80, × `whettedMult` (étape 7), contre 40 sans le proc.
    expect(riposte(['whetted']).damage).toBe(80 * COMBAT.whettedMult);
    expect(riposte(['whetted']).skills).toContain('whetted');
    expect(riposte([]).damage).toBe(40);
  });

  it('Endurance : sous 50 % PV, on encaisse moins', () => {
    const m = mon({ initiative: 99 });
    const firstTaken = (procs: string[]) =>
      simulateCombat(pl(procs), m, { seed: 3, goldOnWin: 0, startPlayerPv: 50 }).log.find(
        (e) => e.who === 'monster' && e.type === 'hit',
      )!.damage;
    expect(firstTaken(['endurance'])).toBeLessThan(firstTaken([]));
  });

  // ⚠️ RÉÉCRIT (étape 5) : la Soif passe à l'ANNEAU et triple le vol de vie sous 50 % PV.
  // ⚠️ RÉÉCRIT (étape 7) : la Soif multiplie le PLAFOND de soin du tour, et non plus le vol de
  // vie — tripler un vol de vie qui bute déjà sur le plafond ne rapportait rien (0 % mesuré).
  it('Soif : sous le seuil, le plafond de soin du tour est relevé ; au-dessus il ne change pas', () => {
    const m = mon({ damage: 0, pv: 1e6 });
    // Vol de vie énorme : le soin bute sur le plafond (8 % de 200 PV = 16).
    const healed = (procs: string[], start: number) => {
      const e = simulateCombat(pl(procs, { lifesteal: 5 }), m, {
        seed: 4,
        goldOnWin: 0,
        startPlayerPv: start,
      }).log.find((x) => x.who === 'player')!;
      return e.playerPv - start;
    };
    expect(healed([], 50)).toBe(Math.round(200 * COMBAT.lifestealRoundCap));
    expect(healed(['thirst'], 50)).toBe(
      Math.round(200 * COMBAT.lifestealRoundCap * COMBAT.thirstHealCapMult),
    );
    expect(healed(['thirst'], 150)).toBe(healed([], 150)); // au-dessus du seuil : rien
  });

  // ── Les 8 effets NOUVEAUX (refonte équipement, étape 5) ──
  const monHits = (procs: string[], m: ReturnType<typeof mon>, over = {}) =>
    simulateCombat(pl(procs, over), m, { seed: 5, goldOnWin: 0 }).log.filter(
      (e) => e.who === 'monster' && e.type !== 'dodge',
    );
  it('Cuirasse vivante : sous 30 % PV, une barrière de 20 % des PV max encaisse la suite', () => {
    const m = mon({ initiative: 99, damage: 40, pv: 1e6 });
    const avec = monHits(['living_armor'], m).map((e) => e.playerPv);
    const sans = monHits([], m).map((e) => e.playerPv);
    const k = sans.findIndex((pv) => pv < 60); // premier passage sous 30 % de 200
    expect(k).toBeGreaterThan(0);
    expect(avec[k]).toBe(sans[k]);
    expect(avec[k + 1]).toBeGreaterThan(sans[k + 1] ?? 0);
  });

  it('Cicatrisation : la récupération entre deux combats est doublée (donjon ET Labyrinthe)', () => {
    const p = pl(['scarring'], { regen: 0.1 });
    expect(betweenFightsHeal(p, 0.12)).toBeCloseTo(
      2 * betweenFightsHeal(pl([], { regen: 0.1 }), 0.12),
    );
    expect(labyrinthRest(p, 0.09)).toBeCloseTo(0.18);
    expect(labyrinthRest(pl([]), 0.09)).toBeCloseTo(0.09);
  });

  it('Cicatrisation : une part des PV max revient à chaque tour du héros', () => {
    const first = (procs: string[]) =>
      simulateCombat(pl(procs), mon({ damage: 0, pv: 1e6 }), {
        seed: 3,
        goldOnWin: 0,
        startPlayerPv: 100,
      }).log.find((e) => e.who === 'player')!.playerPv;
    expect(first([])).toBe(100);
    expect(first(['scarring'])).toBe(100 + Math.round(200 * COMBAT.scarringTurnHeal));
  });

  it('Vigilance : les premiers critiques reçus n’en sont pas, le suivant si', () => {
    const m = mon({ initiative: 99, crit: 1, pv: 1e6 });
    const avec = monHits(['vigilance'], m, { pv: 1e6 });
    for (let i = 0; i < COMBAT.vigilanceCrits; i++) {
      expect(avec[i]!.type).toBe('hit');
      expect(avec[i]!.skills).toContain('vigilance');
    }
    expect(avec[COMBAT.vigilanceCrits]!.type).toBe('crit');
    expect(monHits([], m, { pv: 1e6 })[0]!.type).toBe('crit');
  });

  // ⚠️ RÉÉCRIT (étape 7) : plus de seuil de PV — sous 30 % il ne valait que 0,5 à 3 %.
  it('Sang-froid : plus aucun critique ennemi, quels que soient tes PV', () => {
    const m = mon({ initiative: 99, crit: 1, damage: 1, pv: 1e6 });
    const first = (procs: string[], start?: number) =>
      simulateCombat(pl(procs), m, {
        seed: 5,
        goldOnWin: 0,
        ...(start ? { startPlayerPv: start } : {}),
      }).log.find((e) => e.who === 'monster')!.type;
    expect(first(['sang_froid'], 40)).toBe('hit');
    expect(first(['sang_froid'])).toBe('hit'); // PV pleins
    expect(first([])).toBe('crit');
  });

  it('Pas de côté : la 1re attaque ennemie est esquivée d’office, la 2e non', () => {
    const m = mon({ initiative: 99 });
    const log = simulateCombat(pl(['sidestep']), m, { seed: 5, goldOnWin: 0 }).log.filter(
      (e) => e.who === 'monster',
    );
    expect(log[0]!.type).toBe('dodge');
    expect(log[0]!.skills).toContain('sidestep');
    expect(log[1]!.type).toBe('hit');
  });

  it('Pas de danse : chaque esquive déclenche une riposte, sans stat de riposte', () => {
    const m = mon({ initiative: 99, pv: 1e6 });
    const ripostes = (procs: string[]) =>
      simulateCombat(pl(procs, { dodge: 1 }), m, { seed: 5, goldOnWin: 0 }).log.filter((e) =>
        e.skills?.includes('dance'),
      ).length;
    expect(ripostes(['dance'])).toBeGreaterThan(3);
    expect(ripostes([])).toBe(0);
  });

  it('Sceau de rage : la rage s’active dès 50 % PV (au lieu de 30 %)', () => {
    const m = mon({ damage: 0, pv: 1e6 });
    const first = (procs: string[]) =>
      simulateCombat(pl(procs, { rage: 0.5 }), m, {
        seed: 5,
        goldOnWin: 0,
        startPlayerPv: 80,
      }).log.find((e) => e.who === 'player')!.damage;
    expect(first(['rage_seal'])).toBeGreaterThan(first([])); // 40 % PV : seule la rage scellée mord
  });

  it('Chasseur : critique certain sur un ennemi sous le seuil, pas au-dessus', () => {
    const seuil = COMBAT.hunterThreshold * 1000;
    const log = (pv: number) =>
      simulateCombat(pl(['hunter']), mon({ damage: 0, pv }), { seed: 5, goldOnWin: 0 }).log.filter(
        (e) => e.who === 'player',
      );
    expect(log(1e6)[0]!.type).toBe('hit');
    // Au-dessus du seuil, rien de garanti (le héros n'a aucun critique) : le seuil compte.
    const high = log(1000).filter((e, i, a) => i > 0 && a[i - 1]!.monsterPv >= seuil);
    expect(high.length).toBeGreaterThan(0);
    expect(high.every((e) => e.type === 'hit')).toBe(true);
    // Une fois sous le seuil, tous les coups sont critiques.
    const low = log(1000).filter((e, i, a) => i > 0 && a[i - 1]!.monsterPv < seuil);
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((e) => e.type === 'crit')).toBe(true);
  });

  it('Curée : quand l’ennemi passe sous 30 % PV, on récupère des PV', () => {
    const m = mon({ pv: 100, damage: 5 });
    const run = (procs: string[]) =>
      simulateCombat(pl(procs), m, { seed: 9, goldOnWin: 0, startPlayerPv: 100 }).log;
    const low = (log: ReturnType<typeof run>) =>
      log.find((e) => e.who === 'player' && e.monsterPv > 0 && e.monsterPv / 100 < 0.3);
    expect(low(run(['quarry']))!.playerPv).toBeGreaterThan(low(run([]))!.playerPv);
  });

  it('⚠️ un objet SANS proc laisse le combat rigoureusement identique', () => {
    // La règle « sans proc, rng byte-identique » doit valoir même après l'ajout de 6 procs.
    const a = simulateCombat(pl([]), mon(), { seed: 42, goldOnWin: 0 });
    const b = simulateCombat(pl([]), mon(), { seed: 42, goldOnWin: 0 });
    expect(a.log).toEqual(b.log);
    expect(a.rounds).toBe(b.rounds);
  });
});
