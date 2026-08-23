// voies.ts — SPÉCIALISATION du perso (« Voie » / archétype). Pur/testé.
// Une voie ne donne PAS de puissance brute massive (le sport reste la source) et ne biaise
// PLUS les drops (uniformes) : elle (1) accorde un PETIT passif de saveur ; (2) débloque le
// CAPSTONE (4-pièces) du SET de sa voie (`voie:<id>` dans items.ts) → compléter le set de
// SA voie = accomplir l'archétype. Réversible à tout moment (comme les talents).
import { effectAsAggregate, type EffectType, type AggregatedEffects } from './items';

export type VoieId =
  | 'berserker'
  | 'gardien'
  | 'assassin'
  | 'vampire'
  | 'colosse'
  | 'duelliste'
  | 'epineux'
  | 'frenetique';

export interface Voie {
  id: VoieId;
  name: string;
  emoji: string;
  blurb: string;
  /** Stats de FOCUS de l'archétype (= le thème de son set de voie). Descriptif (les drops
   *  ne sont plus biaisés) : sert au libellé UI + à générer le thème du set. */
  preferred: EffectType[];
  /** Petit passif constant (type + magnitude en %). */
  passive: { type: EffectType; base: number };
}

// Chaque voie porte son IDENTITÉ (1re stat) MAIS ses `preferred` couvrent offense ET survie :
// un build 100 % mono‑axe est non viable (le combat exige les deux — validé par simulation
// 2026‑08‑23). L'identité reste lisible (stat dominante + passif) ; l'ancre de survie/offense
// évite les builds « verre » (tout dégâts = meurt) ou « inerte » (tout défense = ne tue pas).
export const VOIES: Voie[] = [
  {
    id: 'berserker',
    name: 'Berserker',
    emoji: '💥',
    blurb: 'Dégâts bruts et exécution — frappe fort, se soigne en tapant.',
    preferred: ['damage_pct', 'execute_pct', 'lifesteal_pct'],
    passive: { type: 'damage_pct', base: 6 },
  },
  {
    id: 'gardien',
    name: 'Gardien',
    emoji: '🛡️',
    blurb: 'Mur qui frappe : encaisse tout et rend les coups.',
    preferred: ['dmg_reduction_pct', 'max_pv_pct', 'damage_pct'],
    passive: { type: 'dmg_reduction_pct', base: 5 },
  },
  {
    id: 'assassin',
    name: 'Assassin',
    emoji: '🗡️',
    blurb: 'Critiques qui achèvent, et un vol de vie pour tenir.',
    preferred: ['crit_pct', 'execute_pct', 'lifesteal_pct'],
    passive: { type: 'crit_pct', base: 5 },
  },
  {
    id: 'vampire',
    name: 'Vampire',
    emoji: '🩸',
    blurb: 'Vole la vie en frappant fort et se déchaîne au bord de la mort.',
    preferred: ['lifesteal_pct', 'damage_pct', 'rage_pct'],
    passive: { type: 'lifesteal_pct', base: 5 },
  },
  {
    id: 'colosse',
    name: 'Colosse',
    emoji: '🪨',
    blurb: 'Réservoir de PV qui encaisse et cogne dans la durée.',
    preferred: ['max_pv_pct', 'dmg_reduction_pct', 'damage_pct'],
    passive: { type: 'max_pv_pct', base: 8 },
  },
  {
    id: 'duelliste',
    name: 'Duelliste',
    emoji: '🎯',
    blurb: 'Précision létale, adossée à des PV pour durer.',
    preferred: ['crit_pct', 'damage_pct', 'max_pv_pct'],
    passive: { type: 'crit_pct', base: 5 },
  },
  {
    id: 'epineux',
    name: 'Épineux',
    emoji: '🌵',
    blurb: 'Encaisse, renvoie les coups et frappe en retour.',
    preferred: ['thorns_pct', 'max_pv_pct', 'damage_pct'],
    passive: { type: 'thorns_pct', base: 8 },
  },
  {
    id: 'frenetique',
    name: 'Frénétique',
    emoji: '🌀',
    blurb: 'Monte en puissance au fil du combat, et se soigne en frappant.',
    preferred: ['momentum_pct', 'damage_pct', 'lifesteal_pct'],
    passive: { type: 'momentum_pct', base: 4 },
  },
];

export const VOIE_BY_ID: Record<string, Voie> = Object.fromEntries(VOIES.map((v) => [v.id, v]));

/** Passif d'une voie sous forme d'agrégat d'effets (vide si aucune voie). */
export function voiePassiveEffects(voie: VoieId | null | undefined): AggregatedEffects {
  const v = voie ? VOIE_BY_ID[voie] : undefined;
  return v ? effectAsAggregate(v.passive.type, v.passive.base) : effectAsAggregate('gold_pct', 0);
}
