import type { Poi } from '@/lib/expedition';

/**
 * 🧭↔️ Les deux encarts d'une tuile de voyage : d'où l'on part (haut-gauche) et où l'on va
 * (haut-droit).
 *
 * À l'aller : la base ou le point fixe de départ → le lieu visé. SUR LE RETOUR, les deux
 * s'INVERSENT (demandé : « pour montrer qu'on revient ») : le lieu quitté → chez soi, c'est-à-dire
 * le point fixe d'où l'équipe était partie, sinon la base.
 *
 * 🏥 Les blessés d'une sortie rentrent à la base (`walkToBase`), tout comme une sortie dont le
 * point tombe pendant le retour (`rerouteSorties`) : leur voyage ne porte plus d'origine, donc
 * `from` vaut null et la destination affichée est bien la base — sans cas particulier ici.
 *
 * Un trajet déjà orienté vers la base (`toBase` : rappel d'un point, héros qui rentre à pied)
 * se lit déjà « lieu → 🏰 » et n'est pas retourné une seconde fois ; une traversée en mer
 * garde ses deux îles.
 */
export type TripEnd = { kind: 'isle'; n: number } | { kind: 'base' } | { kind: 'poi'; poi: Poi };

export function tripEnds(t: {
  back: boolean;
  toBase?: boolean;
  sea?: { from: number; to: number };
  from: Poi | null;
  poi: Poi;
}): { left: TripEnd; right: TripEnd } {
  if (t.sea) return { left: { kind: 'isle', n: t.sea.from }, right: { kind: 'isle', n: t.sea.to } };
  const home: TripEnd = t.from ? { kind: 'poi', poi: t.from } : { kind: 'base' };
  if (t.toBase) return { left: home, right: { kind: 'base' } };
  const place: TripEnd = { kind: 'poi', poi: t.poi };
  return t.back ? { left: place, right: home } : { left: home, right: place };
}
