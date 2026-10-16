/** Mémoire « guide déjà vu » — ⚠️ la clé est celle de l'ancienne intro : la changer
 *  remontrerait le guide à tous les joueurs qui l'avaient fermée. */
export const TUTORIAL_KEY = 'muscu:adv:intro';

export function tutorialSeen(): boolean {
  try {
    return !!localStorage.getItem(TUTORIAL_KEY);
  } catch {
    return true; // pas de stockage : on ne harcèle pas à chaque ouverture
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore */
  }
}
