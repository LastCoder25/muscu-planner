// useGamePanel — navigation INTERNE du volet jeu (droite) du cockpit Z Fold déplié.
// En cockpit, les écrans jeu profonds (carte d'expédition, Labyrinthe) ne routent PAS
// (ça quitterait le cockpit / router le volet gauche) : ils remplacent le composant du
// volet DROIT via cet état partagé (singleton module-level). Hors cockpit, les pages
// utilisent le routeur normal (plein écran) — cf. la prop `embedded` de chaque page.
import { ref } from 'vue';

export type GameView = 'aventure' | 'expedition-map' | 'expedition';

// Correspondance route ↔ vue du volet (pour réutiliser les liens existants).
const PATH_TO_VIEW: Record<string, GameView> = {
  '/aventure': 'aventure',
  '/expedition-map': 'expedition-map',
  '/expedition': 'expedition',
};

const view = ref<GameView>('aventure');

export function useGamePanel() {
  function goGame(v: GameView) {
    view.value = v;
  }
  function gameBack() {
    view.value = 'aventure';
  }
  function viewForPath(path: string): GameView | null {
    return PATH_TO_VIEW[path] ?? null;
  }
  return { view, goGame, gameBack, viewForPath };
}
