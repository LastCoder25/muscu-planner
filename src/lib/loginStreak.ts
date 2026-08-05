// loginStreak.ts — bonus d'énergie de connexion quotidienne (pur, testé).
// Philosophie : la connexion permet de JOUER un peu (énergie) ; le sport reste
// la seule source du NIVEAU et des STATS. Le bonus est volontairement modeste
// (un « goût », pas un substitut au sport).

export const LOGIN = {
  baseEnergy: 5, // énergie à J1
  perDay: 3, // + par jour consécutif
  streakCap: 7, // palier max (J7 et au-delà = même palier de base)
  levelScale: 0.05, // +5 % d'énergie par niveau du joueur au-dessus de 1
};

/** Énergie de base pour un jour de streak (avant scaling niveau). J1=5 … J7+=23. */
export function streakBaseEnergy(streak: number): number {
  const step = Math.min(Math.max(streak, 1), LOGIN.streakCap) - 1;
  return LOGIN.baseEnergy + step * LOGIN.perDay;
}

/** Énergie réellement gagnée pour ce claim (palier de streak × niveau du joueur). */
export function dailyLoginEnergy(streak: number, level: number): number {
  const mult = 1 + Math.max(0, level - 1) * LOGIN.levelScale;
  return Math.round(streakBaseEnergy(streak) * mult);
}

export interface StreakState {
  streak: number;
  graceUsed: boolean; // grâce (jour manqué toléré) déjà consommée cette semaine ?
}

/**
 * Écart en jours (logiques) entre deux dates `YYYY-MM-DD`. Calcul en UTC pur
 * (à partir des composantes) → indépendant du fuseau.
 */
export function daysBetweenIso(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  const a = Date.UTC(ay!, am! - 1, ad);
  const b = Date.UTC(by!, bm! - 1, bd);
  return Math.round((b - a) / 86400000);
}

/**
 * Fait avancer le streak selon l'écart depuis le dernier claim :
 *  - gap = 1  : jour consécutif → +1.
 *  - gap = 2  : un jour manqué → GRÂCE si dispo (+1, grâce consommée) sinon reset.
 *  - gap ≥ 3  : reset à 1.
 * La grâce se recharge au début de chaque nouvelle semaine de streak (J8, J15…) :
 * « 1 jour de déconnexion toléré par cycle de 7 ».
 */
export function advanceStreak(prev: StreakState | null, gapDays: number): StreakState {
  if (!prev || gapDays >= 3) return { streak: 1, graceUsed: false };
  if (gapDays <= 0) return prev; // même jour → inchangé (garde-fou)
  if (gapDays === 1) {
    const streak = prev.streak + 1;
    // Nouvelle semaine (J8, J15…) → la grâce se recharge.
    const graceUsed = streak % LOGIN.streakCap === 1 ? false : prev.graceUsed;
    return { streak, graceUsed };
  }
  // gapDays === 2 : un jour manqué.
  if (!prev.graceUsed) return { streak: prev.streak + 1, graceUsed: true };
  return { streak: 1, graceUsed: false };
}
