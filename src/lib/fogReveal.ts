/**
 * 🌫️ LE BROUILLARD SE LÈVE (v0.1199 ; demandé par l'utilisateur).
 *
 * L'Avant-poste agrandit le disque révélé de la carte (`revealRadius`). Monter un niveau se
 * fait sur la Base, carte fermée : sans animation, on rouvrait la carte sur un disque un peu
 * plus grand sans rien remarquer. On retient donc (par appareil) le dernier rayon VU, et à
 * l'ouverture suivante le brouillard recule de l'ancien rayon au nouveau ; les lieux qu'il
 * découvre apparaissent quand le front les dépasse.
 *
 * Pur : l'écran fournit le rayon vu, le rayon actuel et le temps écoulé.
 */

export const FOG_REVEAL = {
  /** Durée minimale (un petit gain de rayon doit quand même se voir). */
  baseMs: 1200,
  /** Durée par unité de rayon gagnée : un grand saut prend plus de temps. */
  perUnitMs: 60,
  /** Plafond : au-delà on attend, on ne regarde plus. */
  maxMs: 3000,
} as const;

export interface FogRevealPlan {
  from: number;
  to: number;
  ms: number;
}

/**
 * Le recul à jouer, ou `null` s'il n'y a rien à montrer.
 * ⚠️ Sans rayon VU (première ouverture sur cet appareil) : rien. Sinon tout joueur verrait le
 * brouillard reculer depuis le niveau 1 à sa première visite après la mise à jour.
 * ⚠️ Le brouillard ne revient jamais : un rayon qui baisse (Avant-poste détruit, compte
 * changé) se pose sans animation.
 */
export function fogRevealPlan(seen: number | null, current: number): FogRevealPlan | null {
  // `seen == null` ne sert qu’au typage : `Number.isFinite(null)` vaut déjà faux.
  if (seen == null || !Number.isFinite(seen) || !Number.isFinite(current)) return null;
  const gain = current - seen;
  if (gain < 0.5) return null;
  const ms = Math.min(FOG_REVEAL.maxMs, FOG_REVEAL.baseMs + gain * FOG_REVEAL.perUnitMs);
  return { from: seen, to: current, ms };
}

/** Rayon affiché après `elapsed` ms : départ rapide, arrivée douce (cubique). */
export function fogRadiusAt(plan: FogRevealPlan, elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / plan.ms));
  const e = 1 - (1 - t) ** 3;
  return plan.from + (plan.to - plan.from) * e;
}

/** Un lieu est encore sous le brouillard tant que le front ne l'a pas dépassé. */
export function underFog(
  p: { x: number; y: number },
  town: { x: number; y: number },
  radius: number,
): boolean {
  return Math.hypot(p.x - town.x, p.y - town.y) > radius;
}

/** Combien de lieux le recul découvre (ceux au-delà de l'ancien rayon). */
export function revealedCount(
  pois: { x: number; y: number }[],
  town: { x: number; y: number },
  from: number,
): number {
  return pois.filter((p) => underFog(p, town, from)).length;
}
