// voies.ts — les 8 VOIES (archétypes) du héros. Pur/testé.
// ⚠️ DEPUIS LE 2026-09-22 (spec `2026-09-22-sets-specialises-trophee-voies.md`, § 6) : la voie
// ne se CHOISIT plus et ne donne plus de passif. Elle SE DÉDUIT du set porté (`wornVoie` dans
// items.ts) : c'est l'identité qu'on affiche (fiche, avatar, codex) et celle que liront la
// quête du trophée et la relique. Chaque voie a un PROFIL distinct (spec § 4) : un rôle en
// combat et les stats spécialisées que portent les pièces de son set (`VOIE_SET_STATS`).
import type { EffectType } from './items';

type VoieId =
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
  /** Le rôle de la voie en combat (spec § 4). */
  blurb: string;
  /** Les stats du PROFIL (= les paliers de son set : stat identité, stat partagée, stat de
   *  base). Descriptif : sert aux libellés et au départage « colle à ta voie ». */
  preferred: EffectType[];
}

export const VOIES: Voie[] = [
  {
    id: 'berserker',
    name: 'Berserker',
    emoji: '💥',
    blurb: 'Plus il est blessé, plus il frappe.',
    preferred: ['rage_pct', 'bleed_pct', 'damage_pct'],
  },
  {
    id: 'gardien',
    name: 'Gardien',
    emoji: '🛡️',
    blurb: 'Bloque et pare tout ce qui passe.',
    preferred: ['parry_pct', 'start_shield_pct', 'block_pct'],
  },
  {
    id: 'assassin',
    name: 'Assassin',
    emoji: '🗡️',
    blurb: 'Fait saigner, puis achève.',
    preferred: ['execute_pct', 'bleed_pct', 'crit_dmg_pct'],
  },
  {
    id: 'vampire',
    name: 'Vampire',
    emoji: '🩸',
    blurb: 'Tient en se soignant sur chaque coup.',
    preferred: ['lifesteal_pct', 'rage_pct', 'max_pv_pct'],
  },
  {
    id: 'colosse',
    name: 'Colosse',
    emoji: '🪨',
    blurb: 'Encaisse les gros coups sans broncher.',
    preferred: ['toughness_pct', 'start_shield_pct', 'max_pv_pct'],
  },
  {
    id: 'duelliste',
    name: 'Duelliste',
    emoji: '🎯',
    blurb: 'Évite, puis contre.',
    preferred: ['riposte_pct', 'parry_pct', 'crit_dmg_pct'],
  },
  {
    id: 'epineux',
    name: 'Épineux',
    emoji: '🌵',
    blurb: 'Punit qui le frappe.',
    preferred: ['thorns_pct', 'riposte_pct', 'max_pv_pct'],
  },
  {
    id: 'frenetique',
    name: 'Frénétique',
    emoji: '🌀',
    blurb: 'Lent au départ, écrasant en fin de combat.',
    preferred: ['momentum_pct', 'lifesteal_pct', 'damage_pct'],
  },
];

export const VOIE_BY_ID: Record<string, Voie> = Object.fromEntries(VOIES.map((v) => [v.id, v]));
