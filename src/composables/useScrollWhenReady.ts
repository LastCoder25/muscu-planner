import { nextTick, watch, type Ref } from 'vue';

/** 📜 Quand un calcul vient de FINIR (`running` passe de vrai à faux : un `watch` ne tire que sur un changement, donc `false` = fin) et qu'il y a un résultat à
 *  montrer, fait défiler l'écran pour mettre `target` EN HAUT : l'utilisateur voit tout de suite
 *  le bouton d'action et les propositions dessous, sans chercher sous les réglages.
 *
 *  ⚠️ Seule la transition vrai → faux déclenche : ouvrir un panneau qui garde des résultats
 *  déjà calculés ne doit pas faire sauter l'écran. Mouvement réduit → saut sans animation. */
export function useScrollWhenReady(
  running: Ref<boolean>,
  ready: () => boolean,
  target: Ref<HTMLElement | null>,
) {
  watch(running, async (now) => {
    if (now || !ready()) return;
    await nextTick();
    const el = target.value;
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  });
}
