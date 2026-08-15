// useGameFx — file d'attente d'ANIMATIONS CENTRALES (overlay plein écran assombri)
// pour les moments clés de l'Aventure : drop d'objet (coloré/explosant selon la
// rareté), familier obtenu, montée de niveau, déverrouillage (chaînes qui explosent),
// bâtiment construit/amélioré… But : rendre le jeu IMMERSIF, guider par l'animation.
//
// Singleton (état au niveau module) : n'importe quel écran appelle `celebrate(...)`,
// l'overlay global (GameFxOverlay, monté dans App.vue) joue les fx une par une.
import { ref } from 'vue';

export type GameFxKind = 'drop' | 'familiar' | 'levelup' | 'unlock' | 'building' | 'generic';

export interface GameFx {
  id: number;
  kind: GameFxKind;
  emoji: string; // gros glyphe central
  title: string;
  subtitle?: string;
  // Rareté → couleur + intensité de l'effet (divin = explosion). Optionnel.
  rarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'divin';
}

const queue = ref<GameFx[]>([]);
let seq = 0;

export function useGameFx() {
  function celebrate(fx: Omit<GameFx, 'id'>): void {
    queue.value.push({ ...fx, id: ++seq });
  }
  function dismiss(): void {
    queue.value.shift();
  }
  return { queue, celebrate, dismiss };
}
