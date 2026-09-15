// heroLook.ts — l'APPARENCE d'un héros, sans ses stats. Pur/testable.
//
// Sert à dessiner le héros d'un AMI (scène du boss entre amis) : la RLS de `characters` est
// own-only, chaque joueur dépose donc un instantané de son apparence (migr. 0072). On n'y
// met que ce que `AventureAvatar` lit pour dessiner : silhouette, nom (forme de l'arme),
// rareté (teinte), set (écharpe) et race du familier. Aucune valeur d'effet.
import {
  FAMILIAR_SLOT,
  RANK_ORDER,
  SLOTS,
  type Equipped,
  type Item,
  type ItemSlot,
  type Rarity,
} from './items';
import type { CharacterProfile } from './character';

const PROFILES: readonly CharacterProfile[] = ['puissant', 'agile', 'polyvalent'];

interface LookPiece {
  name: string;
  rarity: Rarity;
  setId?: string;
}

export interface HeroLook {
  profile: CharacterProfile;
  voie: string | null;
  gear: Partial<Record<ItemSlot, LookPiece>>;
  /** Race du familier porté. */
  familiar?: string;
}

/** Instantané de l'apparence d'un héros. */
export function heroLook(
  equipped: Equipped,
  profile: CharacterProfile,
  voie: string | null | undefined,
): HeroLook {
  const gear: HeroLook['gear'] = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    gear[slot] = {
      name: it.name.slice(0, 60),
      rarity: it.rarity,
      ...(it.setId ? { setId: it.setId } : {}),
    };
  }
  const species = equipped[FAMILIAR_SLOT]?.species;
  return { profile, voie: voie ?? null, gear, ...(species ? { familiar: species } : {}) };
}

/** Relecture DÉFENSIVE d'un look venu de la base (écrit par un autre client) : tout champ
 *  inattendu est écarté, jamais de plantage. `null` si ce n'est pas un look. */
export function parseHeroLook(raw: unknown): HeroLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const profile = PROFILES.includes(r.profile as CharacterProfile)
    ? (r.profile as CharacterProfile)
    : 'polyvalent';
  const gear: HeroLook['gear'] = {};
  const g = r.gear && typeof r.gear === 'object' ? (r.gear as Record<string, unknown>) : {};
  for (const slot of SLOTS) {
    const p = g[slot] as Record<string, unknown> | undefined;
    if (!p || typeof p.name !== 'string' || !RANK_ORDER.includes(p.rarity as Rarity)) continue;
    gear[slot] = {
      name: p.name.slice(0, 60),
      rarity: p.rarity as Rarity,
      ...(typeof p.setId === 'string' ? { setId: p.setId } : {}),
    };
  }
  return {
    profile,
    voie: typeof r.voie === 'string' ? r.voie : null,
    gear,
    ...(typeof r.familiar === 'string' ? { familiar: r.familiar.slice(0, 40) } : {}),
  };
}

/** Un look en équipement « de façade » pour `AventureAvatar` (aucun effet : il ne dessine). */
export function lookEquipped(look: HeroLook): Equipped {
  const out: Equipped = {};
  for (const [slot, p] of Object.entries(look.gear) as [ItemSlot, LookPiece][]) {
    out[slot] = { id: `look-${slot}`, slot, ...p } as Item;
  }
  if (look.familiar) {
    out[FAMILIAR_SLOT] = {
      id: 'look-familiar',
      slot: FAMILIAR_SLOT,
      species: look.familiar,
      rarity: RANK_ORDER[0],
    } as Item;
  }
  return out;
}

/** Deux looks identiques ? (évite de réécrire la base à chaque visite) */
export function sameLook(a: HeroLook | null | undefined, b: HeroLook | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
