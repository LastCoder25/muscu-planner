// weightMemory.ts — mémorise le DERNIER poids saisi par exercice (localStorage), pour
// pré-remplir la saisie de série la fois suivante (Défi 360 + défis en mode Séries).
// Léger, par appareil, tolérant aux erreurs de stockage (ticket efa49f4f).
const KEY = 'muscu:setweight';

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Dernier poids (kg) saisi pour cet exercice, ou null si aucun / poids du corps. */
export function recallWeight(exerciseId: string | null | undefined): number | null {
  if (!exerciseId) return null;
  const w = load()[exerciseId];
  return typeof w === 'number' && w > 0 ? w : null;
}

/** Mémorise le poids saisi pour un exercice (ignore vide / poids du corps). */
export function rememberWeight(exerciseId: string | null | undefined, weight: number | null): void {
  if (!exerciseId || weight == null || weight <= 0) return;
  try {
    const m = load();
    m[exerciseId] = weight;
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* stockage indispo → on n'échoue jamais la saisie pour ça */
  }
}
