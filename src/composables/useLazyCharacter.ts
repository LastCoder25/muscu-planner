// 🐢 Le store du personnage, chargé À LA DEMANDE (audit 2026-10-15, tâche 17).
//
// Le store `character` et ce qu'il importe (combat, carte, base, sièges…) pèsent ~149 Ko
// compressés, 40 % de ce que l'accueil téléchargeait au démarrage — alors que l'accueil et
// les overlays d'`App.vue` n'en lisent que quelques champs. Un import statique les mettait
// dans le préchargement ; un import DYNAMIQUE les télécharge juste après le premier rendu.
//
// ⚠️ Tout code chargé au démarrage (App.vue, accueil, composables qu'ils montent) passe par
// ici. Un `import { useCharacterStore } from '@/stores/character'` dans ce chemin remet le
// chunk dans le préchargement — `test/lazyCharacter.test.ts` le vérifie.
import { shallowRef } from 'vue';
import type { useCharacterStore } from '@/stores/character';

export type CharacterStore = ReturnType<typeof useCharacterStore>;

const store = shallowRef<CharacterStore | null>(null);
let pending: Promise<CharacterStore> | null = null;

/** Charge le store (une seule fois) et le rend. */
export function loadCharacterStore(): Promise<CharacterStore> {
  pending ??= import('@/stores/character').then((m) => {
    store.value = m.useCharacterStore();
    return store.value;
  });
  return pending;
}

/** Le store, réactif : `null` tant qu'il n'est pas chargé (le chargement part aussitôt). */
export function useLazyCharacter() {
  void loadCharacterStore();
  return store;
}
