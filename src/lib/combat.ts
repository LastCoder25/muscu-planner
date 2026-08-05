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
}

// Coefficients d'équilibrage (ajustables en un endroit).
export const COMBAT = {
  pvBase: 100,
  pvPerEndurance: 10,
  damagePerPuissance: 1.5,
  critPerAgilite: 0.005, // +0,5 %/pt
  critCap: 0.6,
  dodgePerAgilite: 0.003,
  dodgeCap: 0.4,
  varianceMin: 0.85, // dégâts × [0.85 .. 1.15]
  varianceSpan: 0.3,
  maxRounds: 200, // garde-fou anti-boucle
};

/** Construit le combattant du joueur à partir de ses 3 stats. */
export function playerCombatant(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
): Combatant {
  return {
    name,
    pv: COMBAT.pvBase + stats.endurance * COMBAT.pvPerEndurance,
    damage: Math.max(1, Math.round(stats.puissance * COMBAT.damagePerPuissance)),
    crit: Math.min(COMBAT.critCap, stats.agilite * COMBAT.critPerAgilite),
    dodge: Math.min(COMBAT.dodgeCap, stats.agilite * COMBAT.dodgePerAgilite),
    initiative: stats.agilite,
  };
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
  opts: { seed: number; goldOnWin: number },
): CombatResult {
  const rng = mulberry32(opts.seed);
  let pPv = player.pv;
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
      const dmg = Math.max(1, Math.round(atk.damage * (crit ? 2 : 1) * variance));
      if (turn === 'player') mPv = Math.max(0, mPv - dmg);
      else pPv = Math.max(0, pPv - dmg);
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
