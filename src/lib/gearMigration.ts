// gearMigration.ts — les CADEAUX du passage à 7 emplacements (refonte équipement, étape 8 ;
// spec § 9.4 et 9.5). Pur/testé. La conversion objet par objet vit dans `items.ts`
// (`migrateGearItem`, au chargement) ; ici, ce qui demande le NIVEAU du joueur et ne doit
// arriver qu'UNE fois (gardé par `characters.gear_version`).
import { mulberry32, seedOf } from './combat';
import {
  makeGearPiece,
  prestigeRankIndex,
  RANK_ORDER,
  RARITY_RANK,
  VOIE_SETS,
  type Equipped,
  type GearSlot,
  type Item,
  type Loadout,
} from './items';

/** Les emplacements que la refonte AJOUTE : ceux qu'un set d'avant n'avait pas. */
export const NEW_SLOTS: GearSlot[] = ['shield', 'helmet', 'boots'];
/** Les emplacements de set qu'un set d'avant possédait (la relique devient celle de la voie). */
const OLD_SET_SLOTS: GearSlot[] = ['weapon', 'armor', 'accessory'];
/** Jet des cadeaux : moyen ; faible pour un set déjà au rang le plus bas (spec § 9.4). */
export const GIFT_ROLL = { mid: 0.5, low: 0.2 };

export interface GearGifts {
  equipped: Equipped;
  inventory: Item[];
  /** Tout ce qui a été offert (équipé ou mis au sac), pour l'annonce. */
  gifts: Item[];
}

/** Les cadeaux de la refonte (spec § 9.4-9.5) :
 *  - chaque set possédé EN ENTIER (arme, armure et anneau du même set) reçoit ses pièces
 *    neuves (bouclier, casque, bottes) un rang sous le rang moyen de ses pièces, jet moyen —
 *    sans quoi il perdrait sa signature. Équipées si le set est porté, sinon au sac (où le
 *    rangement automatique les classe dans « Mes sets ») ;
 *  - chaque emplacement neuf encore vide reçoit une pièce de départ AU RANG du joueur, jet
 *    moyen, équipée (décision du 2026-09-22 : un rang dessous affaiblissait trop les comptes
 *    existants — Last 78 % → 87 % au donjon de son niveau).
 *  ⚠️ Seules les pièces qui COMPLÈTENT un set restent un rang dessous : il reste un set à
 *  farmer ; une pièce de départ au jet moyen reste battue par un bon drop de son rang. */
export function gearRefonteGifts(
  p: { equipped: Equipped; inventory: Item[]; loadouts: Loadout[] },
  playerLevel: number,
  seed: string,
  newId: () => string,
): GearGifts {
  const rng = mulberry32(seedOf(`gifts:${seed}`));
  const equipped: Equipped = { ...p.equipped };
  const inventory = [...p.inventory];
  const gifts: Item[] = [];
  const owned: Item[] = [
    ...Object.values(p.equipped).filter((x): x is Item => !!x),
    ...p.inventory,
    ...p.loadouts.flatMap((l) => [
      ...Object.values(l.items ?? {}).filter((x): x is Item => !!x),
      ...(l.spares ?? []),
    ]),
  ];
  for (const set of VOIE_SETS) {
    const mine = owned.filter((it) => it.setId === set.id);
    const core = OLD_SET_SLOTS.map((s) => mine.find((it) => it.slot === s));
    if (core.some((x) => !x)) continue;
    const pieces = core as Item[];
    const avg = Math.round(pieces.reduce((a, it) => a + RARITY_RANK[it.rarity], 0) / pieces.length);
    const level = Math.max(
      1,
      Math.round(pieces.reduce((a, it) => a + (it.level ?? 1), 0) / pieces.length),
    );
    const worn = pieces.every((it) => equipped[it.slot]?.id === it.id);
    for (const slot of NEW_SLOTS) {
      if (mine.some((it) => it.slot === slot)) continue;
      const gift: Item = {
        ...makeGearPiece(rng, {
          slot,
          rarity: RANK_ORDER[Math.max(0, avg - 1)]!,
          roll: avg === 0 ? GIFT_ROLL.low : GIFT_ROLL.mid,
          level,
          setId: set.id,
        }),
        id: newId(),
      };
      gifts.push(gift);
      if (worn && !equipped[slot]) equipped[slot] = gift;
      else inventory.push(gift);
    }
  }
  const mineRank = prestigeRankIndex(playerLevel);
  for (const slot of NEW_SLOTS) {
    if (equipped[slot]) continue;
    const gift: Item = {
      ...makeGearPiece(rng, {
        slot,
        rarity: RANK_ORDER[mineRank]!,
        roll: GIFT_ROLL.mid,
        level: Math.max(1, Math.floor(playerLevel)),
      }),
      id: newId(),
    };
    gifts.push(gift);
    equipped[slot] = gift;
  }
  return { equipped, inventory, gifts };
}
