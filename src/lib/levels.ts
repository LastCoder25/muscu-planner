// levels.ts — système de niveaux UNIFIÉ, numérique et sans rang ni palier.
// Une seule courbe partagée par toutes les pistes (muscu, tennis, cardio,
// challenges, global). Pur/testable.

export interface LevelInfo {
  xp: number;
  level: number; // 1..∞
  xpIntoLevel: number; // XP acquise dans le niveau courant
  xpForLevel: number; // XP nécessaire pour passer au niveau suivant
  progressPct: number; // 0..100
}

// Coût pour passer du niveau L à L+1 : 200 + (L-1)×100 (de plus en plus long).
function levelCost(level: number): number {
  return 200 + (level - 1) * 100;
}

export function computeLevel(xp: number): LevelInfo {
  const safe = Math.max(0, Math.round(xp));
  let level = 1;
  let cum = 0;
  while (level < 999 && safe >= cum + levelCost(level)) {
    cum += levelCost(level);
    level++;
  }
  const cost = levelCost(level);
  const into = safe - cum;
  return {
    xp: safe,
    level,
    xpIntoLevel: into,
    xpForLevel: cost,
    progressPct: Math.min(100, Math.round((into / cost) * 100)),
  };
}
