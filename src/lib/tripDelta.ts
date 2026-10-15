import type { Adventurer } from '@/lib/adventurers';

/**
 * ⏱️ CE QUE CE CHAMPION CHANGE AU TRAJET (demandé : « savoir si le prendre est un gain et de
 * combien, comme le % de réussite »), en minutes d'ALLER-RETOUR depuis SON lieu de départ.
 * Coché : ce qu'il fait gagner (ou perdre) par rapport au groupe SANS lui ; non coché : ce
 * qu'il changerait en l'ajoutant. Négatif = le groupe va plus vite avec lui (compétence 🧭,
 * pièce de vitesse) ; positif = il le ralentit.
 *
 * `legOf` est la règle de trajet du store (`partyLegMin` + `legFromSpot`), appliquée au groupe
 * de son lieu (héros compris s'il en part) : aucune formule recopiée ici.
 */
export function memberTripDelta(
  picked: readonly Adventurer[],
  adv: Adventurer,
  legOf: (members: Adventurer[]) => number,
): number {
  const without = picked.filter((a) => a.id !== adv.id);
  return 2 * (legOf([...without, adv]) - legOf(without));
}
