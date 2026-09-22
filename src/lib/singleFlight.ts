/**
 * 🔒 UN SEUL APPEL À LA FOIS — deux appelants concurrents partagent la MÊME promesse.
 *
 * ⚠️ Écrit après un vrai incident (v0.1082, constaté en base) : les tickets de bienvenue du
 * Panthéon ont été versés DEUX fois. `fetchMine` est appelée par une dizaine d'écrans, la
 * plupart gardées par un `if (!char.row)` — un garde qui ne vaut RIEN entre deux appels
 * CONCURRENTS : en cockpit, deux volets se montent ensemble, les deux lisent la ligne avant
 * que l'écriture de l'autre n'arrive, et les deux croient que rien n'a encore été versé.
 * Toutes les régularisations one-shot (`settle*`) en dépendent.
 *
 * ⚠️ NE REMPLACE PAS un garde côté serveur : ceci ne supprime que la course LOCALE. Deux
 * onglets, ou deux appareils, restent deux clients — c'est la condition dans la requête
 * (`filter`) qui les départage.
 *
 * ⚠️ AUCUNE MÉMOÏSATION : dès que l'appel se termine (succès OU échec), le suivant relance
 * vraiment le travail. On dédoublonne ce qui est EN VOL, on ne met rien en cache.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    inflight ??= fn().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
