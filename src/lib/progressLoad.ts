/**
 * 📶 FAUT-IL RECHARGER LES DONNÉES DE FOND ? (2026-10-14, trouvé en cherchant pourquoi Supabase
 * dépassait ses 5 Go de trafic sortant).
 *
 * `useProgress` est appelé par 18 écrans et composables. Chaque appel posait son propre
 * chargement des sept stores (séances, tennis, défis, plans, cardio, Défi 360, boss entre
 * amis) : ~220 Ko renvoyés par la base à CHAQUE montage d'écran, mesuré ~46 000 fois en
 * 77 jours. Les stores se mettent pourtant à jour eux-mêmes à chaque saisie : recharger à
 * chaque écran ne sert qu'à voir ce qu'un AUTRE appareil a saisi.
 *
 * Règle : on charge une fois par utilisateur, puis au plus une fois par `PROGRESS_RELOAD_MS`.
 * Pur : l'état (dernier utilisateur chargé, instant du chargement) est passé par l'appelant.
 */

/** Au plus un rechargement complet par quart d'heure (ce qu'un autre appareil a saisi). */
export const PROGRESS_RELOAD_MS = 15 * 60_000;

export interface ProgressLoadPlan {
  /** Lancer les chargements. */
  load: boolean;
  /** Forcer les caches qui refusent de repartir (`logs.fetchAll`) : changement d'utilisateur. */
  force: boolean;
  /** Les données en mémoire ne sont plus celles de cet utilisateur : `ready` repasse à faux. */
  stale: boolean;
}

/**
 * @param loadedUid l'utilisateur dont les données sont en mémoire : `undefined` = jamais
 *   chargé dans cet onglet, `null` = déconnecté depuis.
 * @param loadedAt l'instant du dernier chargement lancé.
 * @param uid l'utilisateur courant (`null` = pas de session).
 */
export function progressLoadPlan(
  loadedUid: string | null | undefined,
  loadedAt: number,
  uid: string | null,
  now: number,
): ProgressLoadPlan {
  if (!uid) return { load: false, force: false, stale: true };
  if (loadedUid !== uid)
    // Premier chargement de l'onglet (session déjà là au démarrage) : rien à forcer. Une
    // transition (connexion après l'écran de login, ou un autre compte) : les caches
    // contiennent des réponses anonymes ou celles d'un autre — on force.
    return { load: true, force: loadedUid !== undefined, stale: true };
  return { load: now - loadedAt >= PROGRESS_RELOAD_MS, force: false, stale: false };
}
