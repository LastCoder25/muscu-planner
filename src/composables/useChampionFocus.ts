// ⬆️ OUVRIR LA FICHE D'UN CHAMPION DEPUIS N'IMPORTE OÙ — l'overlay de retour de mission
// (monté dans App.vue) annonce « prêt pour l'ascension » ; toucher la ligne doit mener
// directement à sa fiche au Panthéon, où vit le bouton d'ascension.
// Singleton : l'overlay DÉPOSE l'id, la Base (onglet de l'Aventure) le CONSOMME en ouvrant
// le Panthéon, qui l'ouvre sur la fiche. Consommé une fois, puis remis à null — sinon un
// retour sur l'onglet Base rouvrirait la fiche.
import { ref } from 'vue';

const pending = ref<string | null>(null);

export function useChampionFocus() {
  function focus(advId: string): void {
    pending.value = advId;
  }
  /** Rend l'id en attente et le vide. */
  function take(): string | null {
    const id = pending.value;
    pending.value = null;
    return id;
  }
  return { pending, focus, take };
}
