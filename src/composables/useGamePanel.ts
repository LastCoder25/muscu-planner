// useGamePanel — navigation INTERNE du volet jeu (droite) du cockpit Z Fold déplié.
// En cockpit, les écrans jeu profonds (carte d'expédition, Labyrinthe) ne routent PAS
// (ça quitterait le cockpit / router le volet gauche) : ils remplacent le composant du
// volet DROIT via cet état partagé (singleton module-level). Hors cockpit, les pages
// utilisent le routeur normal (plein écran) — cf. la prop `embedded` de chaque page.
import { ref } from 'vue';
import type { Router } from 'vue-router';

export type GameView = 'aventure' | 'expedition-map' | 'expedition';

// Correspondance route ↔ vue du volet (pour réutiliser les liens existants).
const PATH_TO_VIEW: Record<string, GameView> = {
  '/aventure': 'aventure',
  '/expedition-map': 'expedition-map',
  '/expedition': 'expedition',
};

const view = ref<GameView>('aventure');
/** Cockpit actif ? Publié par MainLayout (seule à connaître la taille d'écran) : c'est ce
 *  qui permet d'ouvrir un écran jeu depuis N'IMPORTE OÙ — une notification push, par
 *  exemple — sans savoir si l'on est en volet ou en plein écran. */
const cockpit = ref(false);

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
  /**
   * Ouvre un chemin d'écran jeu AU BON ENDROIT : dans le volet droit quand on est en
   * cockpit (`inPane`), en route plein écran sinon. ⚠️ SOURCE UNIQUE de cette règle —
   * elle vivait en deux copies (AventurePage, BasePage) et la notification push en
   * aurait été une troisième, aveugle au cockpit : `/expedition-map` serait parti
   * plein écran dans le volet SPORT, emportant l'écran en cours.
   * La query du chemin (`?tab=base`) est reportée sur la route courante : l'Aventure
   * épinglée la lit, quelle que soit la route sous laquelle elle est montée.
   */
  function openPath(router: Router, path: string, inPane = cockpit.value): void {
    const [p = '', q = ''] = path.split('?');
    const v = inPane ? viewForPath(p) : null;
    if (!v) return void router.push(path);
    goGame(v);
    if (q) {
      const cur = router.currentRoute.value;
      const extra = Object.fromEntries(new URLSearchParams(q));
      void router.replace({ path: cur.path, query: { ...cur.query, ...extra } });
    }
  }
  return { view, cockpit, goGame, gameBack, viewForPath, openPath };
}
