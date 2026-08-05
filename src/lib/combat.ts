// combat.ts — moteur de combat RPG (Phase 2a). Tour par tour, auto-résolu,
// aléatoire SEEDÉ (reproductible → testable). Pur, aucune dépendance Vue/Supabase.
// Les valeurs de combat dérivent des 3 stats (elles-mêmes issues du sport).

// PRNG déterministe (mulberry32) : même seed → même combat.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Combatant {
  name: string;
  pv: number;
  damage: number; // dégâts de base par coup
  crit: number; // proba de critique (0..1, ×2 dégâts)
  dodge: number; // proba d'esquive (0..1)
  initiative: number; // qui commence (plus haut = d'abord)
  dmgReduction?: number; // 0..1 : dégâts reçus réduits (effet d'armure)
  lifesteal?: number; // 0..1 : PV rendus = part des dégâts infligés (effet d'arme)
}

// Coefficients d'équilibrage (ajustables en un endroit).
export const COMBAT = {
  pvBase: 100,
  pvPerEndurance: 10,
  baseDamage: 6, // plancher : même sans Puissance, on frappe (cardio gagne par crit/esquive)
  damagePerPuissance: 1.2,
  critPerAgilite: 0.005, // +0,5 %/pt
  critCap: 0.6,
  dodgePerAgilite: 0.003,
  dodgeCap: 0.4,
  varianceMin: 0.85, // dégâts × [0.85 .. 1.15]
  varianceSpan: 0.3,
  maxRounds: 200, // garde-fou anti-boucle
  dungeonHealPct: 0.15, // PV régénérés entre deux combats d'un donjon (% du max)
};

/** Construit le combattant du joueur à partir de ses 3 stats. */
export function playerCombatant(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
): Combatant {
  return {
    name,
    pv: COMBAT.pvBase + stats.endurance * COMBAT.pvPerEndurance,
    damage: Math.max(
      1,
      Math.round(COMBAT.baseDamage + stats.puissance * COMBAT.damagePerPuissance),
    ),
    crit: Math.min(COMBAT.critCap, stats.agilite * COMBAT.critPerAgilite),
    dodge: Math.min(COMBAT.dodgeCap, stats.agilite * COMBAT.dodgePerAgilite),
    initiative: stats.agilite,
  };
}

/** Indice synthétique de puissance de combat (offense × survie) — pour l'UI. */
export function combatPower(c: Combatant): number {
  const offense = c.damage * (1 + c.crit) * (1 + (c.lifesteal ?? 0));
  const survie = (c.pv / 100) * (1 + c.dodge + (c.dmgReduction ?? 0));
  return Math.round(offense * survie);
}

export type CombatActor = 'player' | 'monster';
export type CombatEventType = 'hit' | 'crit' | 'dodge';
export interface CombatEvent {
  round: number;
  who: CombatActor; // qui attaque
  type: CombatEventType;
  damage: number;
  playerPv: number; // PV restants après l'événement
  monsterPv: number;
}
export interface CombatResult {
  win: boolean;
  rounds: number;
  log: CombatEvent[];
  gold: number; // 0 si défaite
}

/** Simule un combat auto tour par tour. `seed` rend le combat reproductible. */
export function simulateCombat(
  player: Combatant,
  monster: Combatant,
  opts: { seed: number; goldOnWin: number; startPlayerPv?: number },
): CombatResult {
  const rng = mulberry32(opts.seed);
  let pPv = opts.startPlayerPv ?? player.pv;
  let mPv = monster.pv;
  const log: CombatEvent[] = [];
  let turn: CombatActor = player.initiative >= monster.initiative ? 'player' : 'monster';
  let round = 0;

  while (pPv > 0 && mPv > 0 && round < COMBAT.maxRounds) {
    round++;
    const atk = turn === 'player' ? player : monster;
    const def = turn === 'player' ? monster : player;
    if (rng() < def.dodge) {
      log.push({ round, who: turn, type: 'dodge', damage: 0, playerPv: pPv, monsterPv: mPv });
    } else {
      const crit = rng() < atk.crit;
      const variance = COMBAT.varianceMin + rng() * COMBAT.varianceSpan;
      let dmg = Math.max(1, Math.round(atk.damage * (crit ? 2 : 1) * variance));
      if (def.dmgReduction) dmg = Math.max(1, Math.round(dmg * (1 - def.dmgReduction)));
      if (turn === 'player') {
        mPv = Math.max(0, mPv - dmg);
        if (atk.lifesteal) pPv = Math.min(player.pv, pPv + Math.round(dmg * atk.lifesteal));
      } else {
        pPv = Math.max(0, pPv - dmg);
        if (atk.lifesteal) mPv = Math.min(monster.pv, mPv + Math.round(dmg * atk.lifesteal));
      }
      log.push({
        round,
        who: turn,
        type: crit ? 'crit' : 'hit',
        damage: dmg,
        playerPv: pPv,
        monsterPv: mPv,
      });
    }
    turn = turn === 'player' ? 'monster' : 'player';
  }

  const win = mPv <= 0 && pPv > 0;
  return { win, rounds: round, log, gold: win ? opts.goldOnWin : 0 };
}

export interface DungeonFoe {
  combatant: Combatant;
  gold: number;
}
export interface DungeonFight {
  monster: string;
  win: boolean;
  result: CombatResult;
}
export interface DungeonResult {
  cleared: boolean; // tous les monstres vaincus
  defeated: number; // nombre de monstres vaincus
  total: number;
  gold: number; // or cumulé des monstres vaincus
  finalPv: number; // PV restants
  fights: DungeonFight[];
}

/**
 * Enchaîne les monstres d'un donjon. Les PV du joueur se REPORTENT d'un combat à
 * l'autre (attrition → l'Endurance compte), avec une petite régén entre deux.
 * On s'arrête à la mort du joueur ; l'or des monstres déjà vaincus est conservé.
 */
export function simulateDungeon(
  player: Combatant,
  foes: DungeonFoe[],
  opts: { seed: number },
): DungeonResult {
  let pv = player.pv;
  let gold = 0;
  let defeated = 0;
  const fights: DungeonFight[] = [];
  for (let i = 0; i < foes.length; i++) {
    const foe = foes[i]!;
    const r = simulateCombat(player, foe.combatant, {
      seed: opts.seed + i * 1000,
      goldOnWin: foe.gold,
      startPlayerPv: pv,
    });
    fights.push({ monster: foe.combatant.name, win: r.win, result: r });
    pv = r.log.length ? r.log[r.log.length - 1]!.playerPv : pv;
    if (!r.win) break;
    gold += r.gold;
    defeated++;
    pv = Math.min(player.pv, pv + Math.round(player.pv * COMBAT.dungeonHealPct));
  }
  return {
    cleared: defeated === foes.length,
    defeated,
    total: foes.length,
    gold,
    finalPv: pv,
    fights,
  };
}
