// voies.ts — SPÉCIALISATION du perso (« Voie » / archétype). Pur/testé.
// Une voie ne donne PAS de puissance brute massive (le sport reste la source) : elle
// (1) BIAISE les drops génériques vers les stats de l'archétype → ton loot soutient TON
// build (fin de « toujours les mêmes stats ») ; (2) accorde un PETIT passif de saveur.
// Réversible à tout moment (comme les talents). Les pièces de SET gardent leur thème.
import { effectAsAggregate, type EffectType, type AggregatedEffects } from './items';

export type VoieId = 'berserker' | 'gardien' | 'assassin' | 'vampire';

export interface Voie {
  id: VoieId;
  name: string;
  emoji: string;
  blurb: string;
  /** Stats vers lesquelles les drops génériques sont biaisés. */
  preferred: EffectType[];
  /** Petit passif constant (type + magnitude en %). */
  passive: { type: EffectType; base: number };
}

export const VOIES: Voie[] = [
  {
    id: 'berserker',
    name: 'Berserker',
    emoji: '💥',
    blurb: 'Dégâts bruts et exécution : frappe le plus fort possible.',
    preferred: ['damage_pct', 'execute_pct', 'momentum_pct'],
    passive: { type: 'damage_pct', base: 6 },
  },
  {
    id: 'gardien',
    name: 'Gardien',
    emoji: '🛡️',
    blurb: 'Encaisse tout et punit : mur increvable qui renvoie les coups.',
    preferred: ['dmg_reduction_pct', 'max_pv_pct', 'thorns_pct'],
    passive: { type: 'dmg_reduction_pct', base: 5 },
  },
  {
    id: 'assassin',
    name: 'Assassin',
    emoji: '🗡️',
    blurb: 'Critiques et tempo : multiplie les coups décisifs.',
    preferred: ['crit_pct', 'momentum_pct'],
    passive: { type: 'crit_pct', base: 5 },
  },
  {
    id: 'vampire',
    name: 'Vampire',
    emoji: '🩸',
    blurb: 'Vole la vie et se déchaîne au bord de la mort.',
    preferred: ['lifesteal_pct', 'rage_pct'],
    passive: { type: 'lifesteal_pct', base: 5 },
  },
];

export const VOIE_BY_ID: Record<string, Voie> = Object.fromEntries(VOIES.map((v) => [v.id, v]));

/** Types de stats préférés d'une voie (vide si aucune voie) → biais de drop. */
export function voiePreferred(voie: VoieId | null | undefined): EffectType[] {
  return voie ? (VOIE_BY_ID[voie]?.preferred ?? []) : [];
}

/** Passif d'une voie sous forme d'agrégat d'effets (vide si aucune voie). */
export function voiePassiveEffects(voie: VoieId | null | undefined): AggregatedEffects {
  const v = voie ? VOIE_BY_ID[voie] : undefined;
  return v ? effectAsAggregate(v.passive.type, v.passive.base) : effectAsAggregate('gold_pct', 0);
}
