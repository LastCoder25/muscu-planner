// Icône VISUELLE d'un objet d'équipement (Aventure) : un nom d'icône MDI (déjà bundlé via
// @quasar/extras mdi-v7 → 100 % offline). Le SLOT donne l'identité de base (arme/armure/
// accessoire/relique) ; quelques couples slot+effet raffinent l'icône quand elle reste
// cohérente avec le slot (pas de cœur sur une arme). Les familiers gardent leur emoji
// d'espèce (rendu à part par ItemIcon.vue). Rendu net, reconnaissable, teinté par le rang.
import type { EffectType, ItemSlot } from '@/lib/items';

const SLOT_ICON: Record<ItemSlot, string> = {
  weapon: 'mdi-sword',
  armor: 'mdi-shield',
  accessory: 'mdi-ring',
  relic: 'mdi-crystal-ball',
  familiar: 'mdi-paw',
};

// Raffinements slot+effet (icônes MDI VÉRIFIÉES présentes dans mdi-v7).
const OVERRIDE: Record<string, string> = {
  'weapon:crit_pct': 'mdi-sword-cross',
  'weapon:execute_pct': 'mdi-axe',
  'weapon:rage_pct': 'mdi-axe',
  'weapon:momentum_pct': 'mdi-bow-arrow',
  'armor:max_pv_pct': 'mdi-shield-half-full',
  'armor:thorns_pct': 'mdi-shield-sun',
  'accessory:crit_pct': 'mdi-diamond-stone',
  'accessory:lifesteal_pct': 'mdi-necklace',
  'accessory:gold_pct': 'mdi-cash',
  'relic:execute_pct': 'mdi-skull',
  'relic:rage_pct': 'mdi-fire',
  'relic:lifesteal_pct': 'mdi-bottle-tonic',
  'relic:max_pv_pct': 'mdi-heart',
};

/** Nom d'icône MDI pour un objet d'équipement (hors familier). */
export function itemIconName(slot: ItemSlot, effect?: EffectType): string {
  return OVERRIDE[`${slot}:${effect ?? ''}`] ?? SLOT_ICON[slot] ?? 'mdi-help-circle';
}
