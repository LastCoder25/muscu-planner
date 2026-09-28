// companionFusion.ts — FUSION des talents et des familiers (demandé par l'utilisateur, 2026-09-28 :
// « éviter de vendre les doublons et prévoir de quoi en fusionner 3 de la même rareté pour en avoir
// un aléatoire de la rareté au-dessus »). Remplace la vente automatique des doublons (v0.1058).
//
// Règles (décisions de l'utilisateur) :
//  • on fusionne EXACTEMENT 3 exemplaires de la MÊME rareté, jamais un mélange ;
//  • le résultat est de la rareté JUSTE AU-DESSUS, d'un type tiré au hasard ;
//  • ⚠️ PLAFONNÉ AU RANG DU JOUEUR (« le sport est le plafond », v0.876 : aucun drop ne dépasse son
//    rang). Au rang du joueur, 3 exemplaires donnent 1 exemplaire du MÊME rang, sans étoile
//    garantie — un tirage ordinaire. Sans ce plafond, farmer le Labyrinthe (familier garanti à
//    chaque nettoyage) puis fusionner en boucle mènerait au sommet sans jamais faire de sport ;
//  • jamais de fusion automatique : c'est un geste du joueur.
//
// Le résultat se tire comme un DROP de son rang : même jet (biaisé bas), niveau d'objet centré sur
// le niveau du joueur. Une seule règle de tirage, celle des drops — pas une seconde courbe.
import {
  FAMILIAR_SLOT,
  RANK_ORDER,
  RARITY_RANK,
  isFamiliar,
  prestigeRankIndex,
  rollFamiliar,
  rollItemLevel,
  rollJetValue,
  type Item,
  type Rarity,
} from './items';
import { TALENTS, talentRankOf, talentTierFloor, type TalentInstance } from './talents';
import { FAMILIAR_SPECIES } from '@/data/familiars';

/** Nombre d'exemplaires consommés par une fusion. */
export const FUSION_SIZE = 3;

/** Rareté du résultat d'une fusion de trois `rarity`, ou `null` si la fusion est impossible
 *  (exemplaires AU-DESSUS du rang du joueur — reliquat d'avant la v0.876 : fusionner ne doit jamais
 *  faire descendre de rang, et ne peut pas monter). */
export function fusionResultRank(rarity: Rarity, playerLevel: number): Rarity | null {
  const cap = prestigeRankIndex(playerLevel);
  const idx = RARITY_RANK[rarity];
  if (idx > cap) return null;
  return RANK_ORDER[Math.min(idx + 1, cap)]!;
}

export type FusionBlock = 'count' | 'mixed' | 'worn' | 'locked' | 'aboveRank' | 'duplicate';

/** Pourquoi ces exemplaires ne se fusionnent pas (`null` = ils le peuvent). Source unique de
 *  l'écran et du store : l'écran peut ne pas proposer l'impossible, il ne peut pas le garantir. */
function fusionBlock(
  items: readonly { id: string; rarity: Rarity; worn: boolean; locked: boolean }[],
  playerLevel: number,
): FusionBlock | null {
  if (items.length !== FUSION_SIZE) return 'count';
  if (new Set(items.map((i) => i.id)).size !== items.length) return 'duplicate';
  if (items.some((i) => i.worn)) return 'worn';
  if (items.some((i) => i.locked)) return 'locked';
  if (items.some((i) => i.rarity !== items[0]!.rarity)) return 'mixed';
  if (!fusionResultRank(items[0]!.rarity, playerLevel)) return 'aboveRank';
  return null;
}

/** Familiers : ceux du SAC (le porté vit dans `equipped`, il n'est jamais passé ici). */
export function familiarFusionBlock(
  fams: readonly Item[],
  playerLevel: number,
): FusionBlock | null {
  if (fams.some((f) => !isFamiliar(f))) return 'mixed';
  return fusionBlock(
    fams.map((f) => ({ id: f.id, rarity: f.rarity, worn: false, locked: !!f.locked })),
    playerLevel,
  );
}

export function talentFusionBlock(
  tals: readonly TalentInstance[],
  playerLevel: number,
): FusionBlock | null {
  return fusionBlock(
    tals.map((t) => ({ id: t.id, rarity: talentRankOf(t), worn: !!t.equipped, locked: false })),
    playerLevel,
  );
}

const FUSION_BLOCK_LABEL: Record<FusionBlock, string> = {
  count: `il en faut exactement ${FUSION_SIZE}`,
  mixed: 'ils doivent être de la même rareté',
  worn: 'retire d’abord celui que tu portes',
  locked: 'un exemplaire est verrouillé 🔒',
  aboveRank: 'au-dessus de ton rang : rien à gagner',
  duplicate: 'le même exemplaire compté deux fois',
};

/** Fusionne trois familiers : un familier d'une race au hasard, de la rareté du résultat. */
export function fuseFamiliars(
  rng: () => number,
  fams: readonly Item[],
  playerLevel: number,
): Omit<Item, 'id'> {
  const block = familiarFusionBlock(fams, playerLevel);
  if (block) throw new Error(`Fusion impossible : ${FUSION_BLOCK_LABEL[block]}`);
  const rarity = fusionResultRank(fams[0]!.rarity, playerLevel)!;
  const species = FAMILIAR_SPECIES[Math.floor(rng() * FAMILIAR_SPECIES.length)]!;
  const out = rollFamiliar(rng, species, { level: playerLevel, playerLevel, rarity });
  return { ...out, slot: FAMILIAR_SLOT };
}

/** Fusionne trois talents : un talent au hasard, de la rareté du résultat, non équipé. */
export function fuseTalents(
  rng: () => number,
  tals: readonly TalentInstance[],
  playerLevel: number,
  id: string,
): TalentInstance {
  const block = talentFusionBlock(tals, playerLevel);
  if (block) throw new Error(`Fusion impossible : ${FUSION_BLOCK_LABEL[block]}`);
  const rarity = fusionResultRank(talentRankOf(tals[0]!), playerLevel)!;
  const def = TALENTS[Math.floor(rng() * TALENTS.length)]!;
  return {
    id,
    code: def.code,
    xp: talentTierFloor(RARITY_RANK[rarity] * 5),
    roll: rollJetValue(rng),
    enchant: 0,
    level: rollItemLevel(rng, playerLevel),
    equipped: false,
  };
}
