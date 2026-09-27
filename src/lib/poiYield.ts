/**
 * ⏱️ LE RENDEMENT PAR HEURE D'UN LIEU (v0.1207 ; demandé par l'utilisateur).
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
import { CARAVAN } from './caravan';
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

const RATE_EMOJI: Record<keyof PoiHaul, string> = {
  gold: '🪙',
  energy: '⚡',
  summonStones: '🔮',
  keys: '🗝️',
  mana: '💠',
};

/** Ce que ce butin rend PAR HEURE d'aller-retour, ressource par ressource (seules celles qui
 *  rapportent quelque chose). Vide sans trajet connu. */
export function hourlyRates(
  haul: PoiHaul,
  minutes: number,
): { key: keyof PoiHaul; emoji: string; perHour: number }[] {
  if (!(minutes > 0)) return [];
  const h = minutes / 60;
  return (Object.keys(RATE_EMOJI) as (keyof PoiHaul)[])
    .filter((k) => haul[k] > 0)
    .map((k) => ({ key: k, emoji: RATE_EMOJI[k], perHour: haul[k] / h }));
}

/** « 3 400 🪙/h · 1,2 🗝️/h » : entier au-delà de 10, une décimale en dessous (une clé toutes
 *  les deux heures ne doit pas s'afficher « 0 »). */
export function formatRates(rates: { emoji: string; perHour: number }[]): string {
  return rates
    .map((r) => {
      const v =
        r.perHour >= 10
          ? Math.round(r.perHour).toLocaleString('fr-FR')
          : r.perHour.toFixed(1).replace('.', ',');
      return `${v} ${r.emoji}/h`;
    })
    .join(' · ');
}
