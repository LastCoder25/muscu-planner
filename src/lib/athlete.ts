// Niveau d'athlète — progression tirée des SÉANCES loggées (session_logs).
// Séparé du rang F→SSS des challenges. Pur/testable, aucune dépendance Vue.
import type { SessionLog } from './types';
import { tierForLevel } from '@/data/athlete';

/** XP d'une séance : présence + volume (reps) + charge + intensité (note 1–4). */
export function sessionXp(log: SessionLog): number {
  let reps = 0;
  let tonnage = 0;
  for (const ex of log.exercises ?? []) {
    for (const s of ex.performed ?? []) {
      reps += s.reps || 0;
      tonnage += (s.load_kg || 0) * (s.reps || 0);
    }
  }
  const intensity = (log.global_difficulty ?? 2) * 10; // 10 … 40
  return Math.round(50 + reps + tonnage / 100 + intensity);
}

/** XP totale d'athlète = somme de l'XP de toutes les séances loggées. */
export function athleteXpPoints(logs: SessionLog[]): number {
  return logs.reduce((a, l) => a + sessionXp(l), 0);
}

export interface AthleteLevel {
  xp: number;
  level: number; // 1..∞
  tier: string; // Bronze … Maître
  tierColor: string;
  xpIntoLevel: number; // XP acquise dans le niveau courant
  xpForLevel: number; // XP nécessaire pour passer au niveau suivant
  progressPct: number; // 0..100
}

// Coût pour passer du niveau L à L+1 : 200 + (L-1)×100 (de plus en plus long).
function levelCost(level: number): number {
  return 200 + (level - 1) * 100;
}

export function athleteLevel(xp: number): AthleteLevel {
  const safeXp = Math.max(0, Math.round(xp));
  let level = 1;
  let cum = 0;
  // On avance tant que l'XP couvre le coût du niveau courant (borne de sécurité).
  while (level < 999 && safeXp >= cum + levelCost(level)) {
    cum += levelCost(level);
    level++;
  }
  const cost = levelCost(level);
  const into = safeXp - cum;
  const tier = tierForLevel(level);
  return {
    xp: safeXp,
    level,
    tier: tier.name,
    tierColor: tier.color,
    xpIntoLevel: into,
    xpForLevel: cost,
    progressPct: Math.min(100, Math.round((into / cost) * 100)),
  };
}
