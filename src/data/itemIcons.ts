// Icône VISUELLE d'un objet d'équipement (Aventure) : un nom d'icône MDI (déjà bundlé via
// @quasar/extras mdi-v7 → 100 % offline). Le SLOT donne l'identité de base (arme/armure/
// accessoire/relique) ; le NOM d’objet la précise (Hache, Amulette, Sceau…). Les familiers gardent leur emoji
// d'espèce (rendu à part par ItemIcon.vue). Rendu net, reconnaissable, teinté par le rang.
import { itemNoun, type ItemSlot } from '@/lib/items';

const SLOT_ICON: Record<ItemSlot, string> = {
  weapon: 'mdi-sword',
  armor: 'mdi-tshirt-crew',
  shield: 'mdi-shield',
  helmet: 'mdi-racing-helmet',
  boots: 'mdi-shoe-formal',
  accessory: 'mdi-ring',
  relic: 'mdi-crystal-ball',
  familiar: 'mdi-paw',
  trophy: 'mdi-trophy',
};

// ⚠️ L’ICÔNE SUIT L’OBJET, PAS SA STAT (v0.888 ; signalé par l’utilisateur : « les icônes
// et les noms sont bizarres »). Elle se lisait sur le 1er affixe : une « Hache » à critique
// montrait deux épées, une « Idole » à PV un cœur, une lame à élan un ARC. Le nom d’objet
// (premier mot, `itemNoun`) est ce qu’on lit à côté : l’icône dit la même chose.
// Icônes MDI VÉRIFIÉES présentes dans mdi-v7.
const NOUN_ICON: Record<string, string> = {
  Lame: 'mdi-sword',
  Hache: 'mdi-axe-battle',
  Masse: 'mdi-hammer',
  Dague: 'mdi-knife-military',
  Fléau: 'mdi-mace',
  Faux: 'mdi-sickle',
  // ⚠️ L'armure perd ses icônes de bouclier (refonte équipement) : il y a désormais un vrai
  // BOUCLIER, les deux doivent se distinguer d'un coup d'œil.
  Plastron: 'mdi-tshirt-crew',
  Cotte: 'mdi-tshirt-v',
  Cuirasse: 'mdi-tshirt-crew-outline',
  Harnois: 'mdi-wardrobe',
  Écu: 'mdi-shield',
  Pavois: 'mdi-shield-half-full',
  Rondache: 'mdi-shield-cross',
  Targe: 'mdi-shield-crown',
  Heaume: 'mdi-racing-helmet',
  Casque: 'mdi-diving-helmet',
  Bassinet: 'mdi-account-hard-hat',
  Morion: 'mdi-hard-hat',
  Bottes: 'mdi-shoe-formal',
  Grèves: 'mdi-shoe-cleat',
  Solerets: 'mdi-shoe-heel',
  Jambières: 'mdi-shoe-print',
  Anneau: 'mdi-ring',
  Chevalière: 'mdi-ring',
  Bague: 'mdi-ring',
  Jonc: 'mdi-ring',
  Amulette: 'mdi-necklace',
  Talisman: 'mdi-eye-circle',
  Bracelet: 'mdi-circle-double',
  Éclat: 'mdi-diamond-stone',
  Totem: 'mdi-chess-rook',
  Sceau: 'mdi-seal',
  Idole: 'mdi-octagram',
};

/** Nom d'icône MDI pour un objet d'équipement (hors familier) : celle de son nom d’objet,
 *  sinon celle de son emplacement. */
export function itemIconName(item: { slot: ItemSlot; name?: string }): string {
  return NOUN_ICON[itemNoun(item)] ?? SLOT_ICON[item.slot] ?? 'mdi-help-circle';
}
