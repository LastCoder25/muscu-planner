// Boot theme — applique le thème enregistré avant le rendu (pas de flash).
import { defineBoot } from '#q-app';
import { initTheme } from '@/composables/useTheme';
import { rankCssVars } from '@/lib/items';

export default defineBoot(() => {
  initTheme();
  // Couleurs de rang des objets (classes r-* / p-*), source unique : RANK_COLOR.
  for (const [k, v] of Object.entries(rankCssVars()))
    document.documentElement.style.setProperty(k, v);
});
