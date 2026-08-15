// Catalogue des FAMILIERS (compagnons de l'Aventure).
//
// Un familier est un `Item` de slot `'familiar'` (5ᵉ emplacement, parallèle aux 4
// slots de stuff : il ne fait PAS partie des sets, ne tombe PAS des drops normaux,
// n'est PAS forgeable). Chaque RACE a un BONUS spécifique (un `EffectType`) — c'est
// son identité. La magnitude est VARIABLE (rareté × niveau × variance de roll),
// comme un objet, et se monte en dépensant des PIERRES MAGIQUES 💎 (pas de la
// poussière), droppées dans les mêmes lieux que les familiers (Labyrinthe + un peu
// partout). Le compagnon s'affiche à côté du personnage (AventureAvatar).

import { rollFamiliar, nextRarity, type EffectType, type Item, type Rarity } from '@/lib/items';

// Biomes = lieu d'obtention privilégié (thématise le drop du trésor de Labyrinthe /
// des régions). `any` = peut tomber n'importe où (voie diffuse par pierres).
export type FamiliarBiome = 'forest' | 'cave' | 'peak' | 'plain' | 'ember' | 'void';

export interface FamiliarSpecies {
  id: string;
  name: string;
  emoji: string;
  tint: string; // teinte du compagnon sur l'avatar
  effect: EffectType; // BONUS spécifique de la race
  base: number; // magnitude de base (niv.1, commun) avant rareté/niveau
  biome: FamiliarBiome;
  blurb: string; // saveur (affiché sur la fiche du familier)
}

export const FAMILIAR_SPECIES: FamiliarSpecies[] = [
  {
    id: 'wolf',
    name: 'Loup',
    emoji: '🐺',
    tint: '#8a94a6',
    effect: 'damage_pct',
    base: 6,
    biome: 'forest',
    blurb: 'Chasseur en meute. Ses crocs prolongent les tiens.',
  },
  {
    id: 'deer',
    name: 'Cerf',
    emoji: '🦌',
    tint: '#b98a5a',
    effect: 'max_pv_pct',
    base: 9,
    biome: 'forest',
    blurb: "Gardien des bois. Sa présence t'enracine et te fortifie.",
  },
  {
    id: 'bear',
    name: 'Ours',
    emoji: '🐻',
    tint: '#7a5c3e',
    effect: 'dmg_reduction_pct',
    base: 5,
    biome: 'cave',
    blurb: 'Colosse des cavernes. Il encaisse une part des coups pour toi.',
  },
  {
    id: 'falcon',
    name: 'Faucon',
    emoji: '🦅',
    tint: '#c9a24a',
    effect: 'crit_pct',
    base: 4,
    biome: 'peak',
    blurb: 'Œil des sommets. Il repère la faille et guide ta frappe.',
  },
  {
    id: 'marmot',
    name: 'Marmotte',
    emoji: '🦫',
    tint: '#a98d5c',
    effect: 'gold_pct',
    base: 12,
    biome: 'plain',
    blurb: 'Fouineuse des plaines. Elle déterre les trésors sur ton chemin.',
  },
  {
    id: 'salamander',
    name: 'Salamandre',
    emoji: '🦎',
    tint: '#c8552e',
    effect: 'lifesteal_pct',
    base: 5,
    biome: 'ember',
    blurb: "Née des braises. Elle boit la vie de tes ennemis pour t'en rendre.",
  },
];

const BY_ID = new Map(FAMILIAR_SPECIES.map((s) => [s.id, s]));
export function familiarSpecies(id: string): FamiliarSpecies | undefined {
  return BY_ID.get(id);
}

/** Choisit une race : privilégie le `biome` du lieu (Labyrinthe/région), sinon au
 *  hasard. `rng` déterministe (pas de Math.random ici → testable). */
export function pickFamiliarSpecies(rng: () => number, biome?: FamiliarBiome): FamiliarSpecies {
  const pool = biome ? FAMILIAR_SPECIES.filter((s) => s.biome === biome) : FAMILIAR_SPECIES;
  const arr = pool.length ? pool : FAMILIAR_SPECIES;
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Tire un familier « de terrain » : choisit une race (biome-thémée si fourni) puis
 *  la roule au niveau/chance donnés. Utilisé par le butin des activités. */
export function rollActivityFamiliar(
  rng: () => number,
  opts: { level: number; luck?: number; biome?: FamiliarBiome },
): Omit<Item, 'id'> {
  return rollFamiliar(rng, pickFamiliarSpecies(rng, opts.biome), {
    level: opts.level,
    ...(opts.luck !== undefined ? { luck: opts.luck } : {}),
  });
}

/** FUSION (incubateur) : à partir de 3 familiers de rareté `fromRarity`, produit 1
 *  familier ALÉATOIRE (race au hasard) de la rareté JUSTE AU-DESSUS, niveau 1.
 *  `null` si `fromRarity` est déjà au max (divin → pas de fusion). */
export function rollFusedFamiliar(rng: () => number, fromRarity: Rarity): Omit<Item, 'id'> | null {
  const nr = nextRarity(fromRarity);
  if (!nr) return null;
  return rollFamiliar(rng, pickFamiliarSpecies(rng), { level: 1, rarity: nr });
}
