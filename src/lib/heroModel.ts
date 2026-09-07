// heroModel.ts — traduit l'ÉQUIPEMENT du joueur en pièces 3D à empiler. Pur et testable.
//
// Même séparation que partout : la lib décide, le composant charge et rend.
//
// ⚠️ CONTRAINTE D'ASSETS, à connaître avant de lire le mapping. Le pack CC0 téléchargé
// (Quaternius, tier gratuit) ne contient que **2 tenues** — Peasant et Ranger — là où la
// page annonce 12 (le reste est derrière le Patreon). Et il ne contient **AUCUNE ARME**.
// Donc :
//   • l'armure se lit sur 2 paliers visuels, pas 8 ;
//   • l'arme n'est pas représentable tant qu'on n'a pas de modèle d'arme.
// Le jour où d'autres tenues arrivent, il suffit d'étendre OUTFITS et TIER_FROM_RANK.
import { RANK_ORDER, type Equipped, type ItemSlot, type Rarity } from './items';

export type OutfitTier = 'peasant' | 'ranger';

/** Rareté à partir de laquelle on passe à la tenue supérieure (Épique et au-delà). */
export const RANGER_FROM_RANK = 4;

/** Les 4 pièces qui habillent le corps, par tenue. Le corps de base reste visible
 *  dessous (les pièces sont conçues pour se superposer sans le remplacer). */
export const OUTFITS: Record<OutfitTier, string[]> = {
  peasant: ['Male_Peasant_Body', 'Male_Peasant_Arms', 'Male_Peasant_Legs', 'Male_Peasant_Feet'],
  ranger: ['Male_Ranger_Body', 'Male_Ranger_Arms', 'Male_Ranger_Legs', 'Male_Ranger_Feet_Boots'],
};

/** Pièces d'appoint, disponibles uniquement en Ranger dans ce pack. */
export const PAULDRON = 'Male_Ranger_Acc_Pauldron';
export const HOOD = 'Male_Ranger_Head_Hood';

export const BASE_FILE = 'base.gltf';
/** Dossier servi (bundle SLIM dérivé par scripts/build-hero-assets.mjs). */
export const HERO_DIR = '/hero/';

export interface HeroPlan {
  base: string;
  /** Fichiers de pièces à charger et à greffer sur le squelette du corps de base. */
  parts: string[];
  /** Tenue retenue, ou null si rien n'habille le personnage. */
  tier: OutfitTier | null;
  /** Emplacements équipés que ce pack ne sait PAS représenter (honnêteté d'affichage). */
  missing: ItemSlot[];
}

function rankOf(r: Rarity | undefined): number {
  return r ? Math.max(0, RANK_ORDER.indexOf(r)) : -1;
}

/** Palier visuel d'une rareté. */
export function outfitTier(rank: number): OutfitTier {
  return rank >= RANGER_FROM_RANK ? 'ranger' : 'peasant';
}

/** Construit la liste des pièces à empiler. L'ordre n'a pas d'importance au rendu
 *  (chaque pièce est un mesh indépendant greffé sur le même squelette), mais on garde
 *  un ordre stable pour que le chargement soit reproductible. */
export function planHeroParts(equipped: Equipped): HeroPlan {
  const parts: string[] = [];
  const missing: ItemSlot[] = [];

  const armorRank = rankOf(equipped.armor?.rarity);
  const tier = armorRank >= 0 ? outfitTier(armorRank) : null;
  if (tier) parts.push(...OUTFITS[tier]);

  // Épaulières et capuche n'existent qu'en Ranger : on les pose quel que soit le palier
  // de l'armure — mieux vaut une épaulière visible qu'un emplacement muet.
  if (equipped.accessory) parts.push(PAULDRON);
  if (equipped.relic) parts.push(HOOD);

  // L'arme n'a aucun modèle dans ce pack : on le SIGNALE plutôt que de faire semblant.
  if (equipped.weapon) missing.push('weapon');

  return { base: BASE_FILE, parts, tier, missing };
}
