/**
 * 🔮🏆 LES ILLUSTRATIONS DES POUVOIRS — une par pouvoir de RELIQUE (12) et par pouvoir de
 * TROPHÉE (8) (demandé par l'utilisateur : « un par type de relique et de trophée »).
 *
 * Le TYPE d'une relique ou d'un trophée, c'est son pouvoir (`Item.power`) : c'est lui qui
 * la distingue d'une autre, pas son nom tiré au hasard. L'image s'affiche dans la tuile de
 * l'objet (`ItemIcon`), sur le cadre teinté par le rang — elle est donc DÉTOURÉE.
 *
 * Générées par Pollinations (Z-Image, API à clé) puis versionnées
 * (`scripts/fetch-power-art.mjs`) : jamais chargées depuis un service à l'exécution.
 *
 * ⚠️ EXHAUSTIVE PAR CONSTRUCTION (`Record<…Id, string>`) : ajouter un pouvoir sans son
 * illustration ne compile pas, et un test vérifie que chaque fichier existe.
 * ⚠️ AUCUN IMPORT D'EXÉCUTION : le script la lit directement avec Node.
 */
import type { RelicPowerId, TrophyPowerId } from '@/lib/combat';

export const RELIC_ART: Readonly<Record<RelicPowerId, string>> = {
  brasier: '/powers/relic-brasier.webp',
  rempart: '/powers/relic-rempart.webp',
  coup_fatal: '/powers/relic-coup_fatal.webp',
  festin: '/powers/relic-festin.webp',
  tempete: '/powers/relic-tempete.webp',
  riposte_parfaite: '/powers/relic-riposte_parfaite.webp',
  ronces: '/powers/relic-ronces.webp',
  carapace: '/powers/relic-carapace.webp',
  ouverture: '/powers/relic-ouverture.webp',
  moisson: '/powers/relic-moisson.webp',
  phenix: '/powers/relic-phenix.webp',
  second_souffle: '/powers/relic-second_souffle.webp',
};

export const TROPHY_ART: Readonly<Record<TrophyPowerId, string>> = {
  dechainer: '/powers/trophy-dechainer.webp',
  achever: '/powers/trophy-achever.webp',
  annuler: '/powers/trophy-annuler.webp',
  retourner: '/powers/trophy-retourner.webp',
  etaler: '/powers/trophy-etaler.webp',
  desarmer: '/powers/trophy-desarmer.webp',
  renvoyer: '/powers/trophy-renvoyer.webp',
  accelerer: '/powers/trophy-accelerer.webp',
};

/** L'illustration d'un objet selon son emplacement et son pouvoir, `null` sinon. ⚠️ On lit
 *  la table de SON emplacement : `power` porte les deux familles, et une relique ne doit
 *  jamais prendre l'image d'un trophée (ni l'inverse). */
export function powerArt(
  slot: string | null | undefined,
  power: string | null | undefined,
): string | null {
  if (!power) return null;
  const table: Readonly<Record<string, string>> | null =
    slot === 'relic' ? RELIC_ART : slot === 'trophy' ? TROPHY_ART : null;
  return table && Object.hasOwn(table, power) ? table[power]! : null;
}
