// endless.ts — « Faille sans fin » : donjon END-GAME à paliers INFINIS. Débloqué
// après avoir nettoyé le dernier donjon (Faille du Chaos). Chaque palier scale
// (PV/dégâts × 1.15 / palier) → le joueur pousse aussi loin que son gear/niveau
// le permet. Récompenses croissantes + objets de NIVEAU > 25 (seule source de
// gear au-delà des sets). Donne une cible sans fin aux joueurs full-équipés.
import type { Combatant } from '@/lib/combat';

const GROWTH = 1.15;

/** Adversaire du palier `tier` (1 = ~un cran sous l'Archidémon, puis ×1.15/palier). */
export function endlessFoe(tier: number): Combatant {
  const t = Math.max(1, tier);
  const g = Math.pow(GROWTH, t - 1);
  return {
    name: `Écho du Chaos · palier ${t}`,
    pv: Math.round(12000 * g),
    damage: Math.round(3800 * g),
    crit: 0.15,
    dodge: 0.08,
    initiative: 26,
  };
}
/** Coût d'énergie d'une tentative, PLAFONNÉ (2026‑08‑16, cf. DUNGEON_ENERGY_CAP) :
 *  le coût énergie ne doit pas croître sans borne (il punirait la progression) ; la
 *  difficulté vient des paliers, pas du prix d'entrée. Cap 60 (end-game, réserve large). */
export function endlessEnergy(tier: number): number {
  return Math.min(60, 100 + (Math.max(1, tier) - 1) * 8);
}
/** Or gagné à la victoire (croît vite avec la profondeur). */
export function endlessGold(tier: number): number {
  return Math.round(1500 * Math.pow(1.18, Math.max(1, tier) - 1));
}
/** Poussière gagnée à la victoire. */
export function endlessDust(tier: number): number {
  return 20 + (Math.max(1, tier) - 1) * 8;
}
/** Niveau des objets lâchés : 24 + palier → seule source de gear au-delà du niveau 25. */
export function endlessDropLevel(tier: number): number {
  return 24 + Math.max(1, tier);
}
