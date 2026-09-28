/**
 * 💰 CE QU'UN LIEU RAPPORTE (v0.1207). Depuis la v0.1265 la fiche l'annonce en QUANTITÉ, plus
 * par heure (demandé : « pas la production, juste la quantité récupérable »), et le bonus des
 * bâts et des porteurs à part (`poiHaulBonus`).
 *
 * Depuis la v0.1153 la récompense d'un lieu suit sa DIFFICULTÉ, plus sa distance : aller loin
 * ne rapporte pas plus, ça coûte seulement du TEMPS. Un lieu proche et un lieu lointain de même
 * rang rapportent la même chose — ce qui les départage, c'est ce qu'ils rendent PAR HEURE
 * d'aller-retour. La fiche l'annonce, pour qu'on n'envoie plus une équipe six heures loin
 * quand le même butin attend à une heure.
 *
 * ⚠️ AUCUNE FORMULE ICI : ce module appelle les fonctions de la RÉCOLTE elle-même
 * (`harvestYield`, `harvestGold`, `forceLootPreview`), au même niveau (`heroRewardLevel`) —
 * une seconde échelle finirait par annoncer un rendement que la récolte ne verse pas.
 * ⚠️ C'est une valeur SI RÉUSSI, hors aléas de la route (rencontres, embuscades, rôle 🐫).
 */
import { CARAVAN, caravanHaulMult, type EscortKit } from './caravan';
import { supplyFx } from './supplies';
import type { Adventurer } from './adventurers';
import { forceLootPreview } from './camp';
import { riftClearMana } from './rift';
import {
  HARVEST_TYPES,
  harvestGold,
  harvestYield,
  heroRewardLevel,
  poiForceOf,
  type Poi,
} from './expedition';

export interface PoiHaul {
  gold: number;
  energy: number;
  summonStones: number;
  keys: number;
  mana: number;
}

/** Ce qu'un lieu rapporte s'il est pris : sa récolte + ce que portent ses ennemis. */
export function poiHaulPreview(
  poi: Pick<Poi, 'id' | 'type' | 'level'>,
  opts: {
    /** Le niveau qui fixe la récolte (le même que l'envoi applique). */
    playerLevel: number;
    /** ⚡🔮 Une équipe SANS le héros ne ramène qu'une part de l'énergie et des pierres d'un
     *  sanctuaire (`CARAVAN.energyShare`, `stonesShare`). */
    heroGoes: boolean;
  },
): PoiHaul {
  const force = poiForceOf(poi);
  const loot = force ? forceLootPreview(poi, force) : { gold: 0, summonStones: 0 };
  const y = HARVEST_TYPES.has(poi.type)
    ? harvestYield(poi.type, heroRewardLevel(poi, opts.playerLevel), force?.size ?? 0)
    : { energy: 0, summonStones: 0, keys: 0, mana: 0 };
  return {
    gold: harvestGold(poi, opts.playerLevel) + loot.gold,
    energy: opts.heroGoes ? y.energy : Math.round(y.energy * CARAVAN.energyShare),
    summonStones:
      (opts.heroGoes ? y.summonStones : Math.round(y.summonStones * CARAVAN.stonesShare)) +
      (opts.heroGoes ? loot.summonStones : Math.round(loot.summonStones * CARAVAN.stonesShare)),
    keys: y.keys,
    // 🕳️ Une faille : le mana si on la REFERME, gardien compris — le chiffre que la fiche annonce.
    mana: y.mana + (poi.type === 'rift' ? riftClearMana(poi) : 0),
  };
}

/**
 * 🎒🐫 CE QUE LES BÂTS ET LES PORTEURS AJOUTENT À UNE RÉCOLTE (v0.1265 ; demandé par
 * l'utilisateur : « si un consommable ou une compétence augmente la quantité, ça s'affiche
 * séparément »). Rend le SURPLUS, jamais le total : la fiche annonce la récolte de base, puis
 * le bonus à part.
 *
 * ⚠️ LES MÊMES RÈGLES QUE LA RÉSOLUTION (`harvestParty` avec le héros, `resolveCaravan` sans
 * lui) : avec le héros, seuls les bâts 🧺 comptent et s'appliquent à TOUT ; sans lui, les rôles
 * 🐫 et les pièces de cargaison s'ajoutent sous un plafond (`caravanHaulMult`), l'or ne suit
 * que les bâts, l'énergie reste plafonnée à sa base et les clés à ×1,2. Seule la récolte en
 * profite — pas les bourses des gardes. Hors aléas de la route.
 */
export function poiHaulBonus(
  poi: Pick<Poi, 'id' | 'type' | 'level'>,
  opts: {
    playerLevel: number;
    heroGoes: boolean;
    escort: Adventurer[];
    kit: Pick<EscortKit, 'advGear' | 'supplies'>;
  },
): PoiHaul {
  const zero: PoiHaul = { gold: 0, energy: 0, summonStones: 0, keys: 0, mana: 0 };
  if (!HARVEST_TYPES.has(poi.type)) return zero;
  const bats = Math.max(0, supplyFx(opts.kit.supplies).haul);
  const y = harvestYield(
    poi.type,
    heroRewardLevel(poi, opts.playerLevel),
    poiForceOf(poi)?.size ?? 0,
  );
  const gold = harvestGold(poi, opts.playerLevel);
  if (opts.heroGoes) {
    const up = (v: number) => Math.round(v * (1 + bats)) - v;
    return {
      gold: up(gold),
      energy: up(y.energy),
      summonStones: up(y.summonStones),
      keys: up(y.keys),
      mana: up(y.mana),
    };
  }
  const k = caravanHaulMult(opts.escort, opts.kit.advGear, bats);
  return {
    gold: Math.round(gold * (1 + bats)) - gold,
    // ⚡ `min(e, e × k)` dans la résolution : l'énergie d'une équipe ne dépasse jamais sa base.
    energy: 0,
    summonStones:
      Math.round(y.summonStones * k * CARAVAN.stonesShare) -
      Math.round(y.summonStones * CARAVAN.stonesShare),
    keys: Math.round(y.keys * Math.min(1.2, k)) - y.keys,
    mana: Math.round(y.mana * k) - y.mana,
  };
}

/** « 300 🪙 · 2 🔮 » (préfixe au choix) : seulement les ressources non nulles, vide sinon. */
export function formatHaul(haul: PoiHaul, prefix = ''): string {
  return (Object.keys(RATE_EMOJI) as (keyof PoiHaul)[])
    .filter((k) => haul[k] > 0)
    .map((k) => `${prefix}${haul[k].toLocaleString('fr-FR')} ${RATE_EMOJI[k]}`)
    .join(' · ');
}

const RATE_EMOJI: Record<keyof PoiHaul, string> = {
  gold: '🪙',
  energy: '⚡',
  summonStones: '🔮',
  keys: '🗝️',
  mana: '💠',
};
