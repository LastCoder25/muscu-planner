// Boot theme — applique le thème enregistré avant le rendu (pas de flash).
import { defineBoot } from '#q-app';
import { initTheme } from '@/composables/useTheme';

export default defineBoot(() => {
  initTheme();
});
