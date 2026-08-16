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
  damage: number; // dégâts de base par coup (Force)
  crit: number; // proba de critique (0..1, ×2 dégâts)
  dodge: number; // proba d'esquive (0..1)
  initiative: number; // qui commence (plus haut = d'abord)
  dmgReduction?: number; // 0..1 : dégâts reçus réduits (Défense / armure)
  lifesteal?: number; // 0..1 : PV rendus = part des dégâts infligés (vol de vie)
  strikes?: number; // frappes moyennes par tour (Vitesse) ; défaut 1 (monstres)
  // Effets SIGNATURE (objets rares, joueur uniquement) — bonus de dégâts CONDITIONNELS.
  execute?: number; // + dégâts quand l'ENNEMI est bas (< executeThreshold PV)
  rage?: number; // + dégâts quand TOI tu es bas (< rageThreshold PV)
  momentum?: number; // + dégâts par coup consécutif porté dans le combat (cumul plafonné)
  thorns?: number; // 0..1 : part des dégâts reçus renvoyée à l'attaquant (épines, joueur)
}

// Coefficients d'équilibrage (ajustables en un endroit).
// MODÈLE (2026‑08‑09) : chaque sport nourrit 1 offense + 1 survie → l'équilibré
// (bon partout) bat les mono via des PRODUITS (offense = Force×frappes×crit ;
// survie = Vie×défense×esquive). Planchers de NIVEAU sur dégâts & PV → aucun
// pilier n'est jamais nul → les profils extrêmes restent viables.
//  💪 Puissance → Force (dégâts/coup) + Défense (réduction)
//  ❤️ Endurance → Vie (PV)
//  ⚡ Agilité   → Vitesse (multi-frappe) + Crit + Esquive
export const COMBAT = {
  // Coefs optimisés (2026‑08‑09) pour que l'ÉQUILIBRÉ soit le meilleur build à tous
  // les niveaux, les extrêmes restant viables (~57-98 % de sa puissance). Chaque
  // stat a une valeur/point comparable au point équilibré → « bon partout » gagne.
  pvBase: 100,
  pvPerLevel: 15, // plancher de PV par niveau (le muscu ne meurt pas en 2 coups)
  pvPerEndurance: 10,
  baseDamage: 6,
  damagePerLevel: 10, // plancher de dégâts par niveau (le coureur frappe quand même)
  damagePerPuissance: 1.2,
  defPerPuissance: 0.002, // Défense (réduction) issue de la Puissance
  defCap: 0.45,
  strikePerAgilite: 0.004, // Vitesse : frappes/tour = 1 + Agilité×k
  critPerAgilite: 0.002,
  critCap: 0.5,
  dodgePerAgilite: 0.003,
  dodgeCap: 0.4,
  varianceMin: 0.85, // dégâts × [0.85 .. 1.15]
  varianceSpan: 0.3,
  maxRounds: 400, // garde-fou anti-boucle (multi-frappe → combats plus courts en tours)
  dungeonHealPct: 0.15, // PV régénérés entre deux combats d'un donjon (% du max)
  // Effets signature (conditionnels) — seuils & plafond.
  executeThreshold: 0.25, // « Exécution » active si l'ennemi est sous 25 % PV
  rageThreshold: 0.3, // « Rage » active si le joueur est sous 30 % PV
  momentumMaxStacks: 6, // « Déferlante » : cumul plafonné à 6 coups
};

/** Construit le combattant du joueur à partir de ses 3 stats et de son NIVEAU. */
export function playerCombatant(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  level = 1,
): Combatant {
  const L = Math.max(1, level);
  return {
    name,
    pv: Math.round(COMBAT.pvBase + COMBAT.pvPerLevel * L + stats.endurance * COMBAT.pvPerEndurance),
    damage: Math.max(
      1,
      Math.round(COMBAT.baseDamage + COMBAT.damagePerLevel * L + stats.puissance * COMBAT.damagePerPuissance),
    ),
    crit: Math.min(COMBAT.critCap, stats.agilite * COMBAT.critPerAgilite),
    dodge: Math.min(COMBAT.dodgeCap, stats.agilite * COMBAT.dodgePerAgilite),
    initiative: stats.agilite,
    dmgReduction: Math.min(COMBAT.defCap, stats.puissance * COMBAT.defPerPuissance),
    strikes: 1 + stats.agilite * COMBAT.strikePerAgilite,
  };
}

/** Indice synthétique de puissance de combat (offense × survie) — pour l'UI. */
export function combatPower(c: Combatant): number {
  // Les effets signature (conditionnels) sont pondérés par une valeur MOYENNE
  // attendue sur un combat (ils ne s'appliquent pas tout le temps).
  const sig =
    1 +
    0.35 * (c.execute ?? 0) +
    0.3 * (c.rage ?? 0) +
    (c.momentum ?? 0) * (COMBAT.momentumMaxStacks * 0.5);
  const offense =
    c.damage * (c.strikes ?? 1) * (1 + c.crit) * (1 + (c.lifesteal ?? 0)) * sig * (1 + 0.5 * (c.thorns ?? 0));
  const survie = (c.pv / 100) / (1 - c.dodge) / (1 - (c.dmgReduction ?? 0));
  // offense×survie croît ≈ niveau⁴ → chiffres énormes (dizaines de milliers dès le
  // début). On prend la RACINE : indice toujours monotone/comparable mais à échelle
  // humaine (~niveau², qq centaines au milieu de jeu au lieu de dizaines de milliers).
  return Math.round(Math.sqrt(offense * survie));
}

/** Format compact d'une puissance de combat (≈ niveau⁴ → jusqu'aux millions).
 *  Affichée EN ENTIER tant que ≤ 9999 (lisibilité), puis compactée (k / M). */
export function fmtPow(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace('.', ',') + 'M';
  if (n > 9999) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return String(Math.round(n));
}
/** Delta signé PRÉCIS entre deux puissances (petit écart = valeur exacte, gros
 *  écart = compact) → visible même quand `fmtPow` arrondit les deux pareil. */
export function fmtDelta(cur: number, next: number): string {
  const d = Math.round(next - cur);
  return (d >= 0 ? '+' : '−') + fmtPow(Math.abs(d));
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
  const maxPPv = player.pv;
  const log: CombatEvent[] = [];
  let turn: CombatActor = player.initiative >= monster.initiative ? 'player' : 'monster';
  let round = 0;
  const monsterMaxPv = monster.pv;
  let pStacks = 0; // Déferlante : coups consécutifs du joueur dans CE combat

  // Nombre de frappes d'un tour (Vitesse) : partie entière + reste probabiliste.
  const strikeCount = (c: Combatant): number => {
    const s = c.strikes ?? 1;
    const n = Math.floor(s);
    return n + (rng() < s - n ? 1 : 0);
  };

  while (pPv > 0 && mPv > 0 && round < COMBAT.maxRounds) {
    round++;
    const atk = turn === 'player' ? player : monster;
    const def = turn === 'player' ? monster : player;
    const hits = Math.max(1, strikeCount(atk));
    for (let h = 0; h < hits && pPv > 0 && mPv > 0; h++) {
      if (rng() < def.dodge) {
        log.push({ round, who: turn, type: 'dodge', damage: 0, playerPv: pPv, monsterPv: mPv });
        continue;
      }
      const crit = rng() < atk.crit;
      const variance = COMBAT.varianceMin + rng() * COMBAT.varianceSpan;
      let dmg = Math.max(1, Math.round(atk.damage * (crit ? 2 : 1) * variance));
      // Effets signature du JOUEUR : bonus de dégâts conditionnels (avant réduction).
      if (turn === 'player') {
        let mult = 1;
        if (atk.execute && mPv / monsterMaxPv < COMBAT.executeThreshold) mult += atk.execute;
        if (atk.rage && pPv / maxPPv < COMBAT.rageThreshold) mult += atk.rage;
        if (atk.momentum) mult += Math.min(COMBAT.momentumMaxStacks, pStacks) * atk.momentum;
        if (mult !== 1) dmg = Math.max(1, Math.round(dmg * mult));
      }
      if (def.dmgReduction) dmg = Math.max(1, Math.round(dmg * (1 - def.dmgReduction)));
      if (turn === 'player') {
        mPv = Math.max(0, mPv - dmg);
        pStacks++; // Déferlante : le joueur a porté un coup → cumul
        if (atk.lifesteal) pPv = Math.min(maxPPv, pPv + Math.round(dmg * atk.lifesteal));
      } else {
        pPv = Math.max(0, pPv - dmg);
        if (atk.lifesteal) mPv = Math.min(monster.pv, mPv + Math.round(dmg * atk.lifesteal));
        // Épines : le joueur (défenseur) renvoie une part des dégâts reçus.
        if (def.thorns && dmg > 0) mPv = Math.max(0, mPv - Math.max(1, Math.round(dmg * def.thorns)));
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
