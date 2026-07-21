// Paliers du « niveau d'athlète » (progression des SÉANCES, distincte du rang
// F→SSS des challenges). Chaque palier couvre une plage de niveaux numériques.
export interface AthleteTier {
  name: string;
  minLevel: number;
  color: string;
}

export const ATHLETE_TIERS: AthleteTier[] = [
  { name: 'Bronze', minLevel: 1, color: '#cd7f32' },
  { name: 'Argent', minLevel: 6, color: '#b8bcc4' },
  { name: 'Or', minLevel: 13, color: '#ffd23f' },
  { name: 'Platine', minLevel: 23, color: '#5aa9e6' },
  { name: 'Diamant', minLevel: 36, color: '#4dd0e1' },
  { name: 'Maître', minLevel: 56, color: '#b57bff' },
];

export function tierForLevel(level: number): AthleteTier {
  let t = ATHLETE_TIERS[0]!;
  for (const tier of ATHLETE_TIERS) if (level >= tier.minLevel) t = tier;
  return t;
}
