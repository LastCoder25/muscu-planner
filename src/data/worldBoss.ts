// worldBoss.ts — boss communautaire hebdomadaire. Spec DÉTERMINISTE (même boss
// pour tout le monde la même semaine) → le premier joueur qui ouvre le crée.
export interface BossSpec {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  weekStart: string; // ISO
  weekEnd: string; // ISO
}

// Coût en énergie d'une frappe (dégâts = puissance de combat du joueur).
export const BOSS_HIT_ENERGY = 20;

// Rotation de boss (nom/emoji/PV). Les PV montent un peu au fil de la rotation.
const ROTATION = [
  { name: 'Gnaeus le Colosse', emoji: '👹', hp: 3000 },
  { name: 'Vermoriginal', emoji: '🐉', hp: 4000 },
  { name: 'Le Broyeur', emoji: '🗿', hp: 5000 },
  { name: 'Ombre-sans-nom', emoji: '👺', hp: 4500 },
];

function mondayOf(now: Date): Date {
  const m = new Date(now);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((now.getDay() + 6) % 7));
  return m;
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Boss de la semaine contenant `now` (déterministe). */
export function currentBoss(now: Date = new Date()): BossSpec {
  const monday = mondayOf(now);
  const end = new Date(monday.getTime() + 7 * 86400000);
  const weekIndex = Math.floor(monday.getTime() / (7 * 86400000));
  const b = ROTATION[((weekIndex % ROTATION.length) + ROTATION.length) % ROTATION.length]!;
  return {
    id: `boss-${isoDate(monday)}`,
    name: b.name,
    emoji: b.emoji,
    hp: b.hp,
    weekStart: monday.toISOString(),
    weekEnd: end.toISOString(),
  };
}
