// 🔄 « Une nouvelle version est en ligne » — détection sans build step ni cache.
//
// ⚠️ POURQUOI ÇA EXISTE : ce projet déploie plusieurs fois par jour, et un onglet resté
// ouvert continue de faire tourner l'ANCIEN code indéfiniment. Le service worker ne
// cache rien (choix délibéré), donc un simple rechargement suffit toujours — encore
// faut-il SAVOIR qu'il faut recharger. Faute de ce signal, un correctif livré peut être
// signalé comme « toujours cassé » pendant des heures ; c'est arrivé trois fois de suite.
//
// ⚠️ On ne recharge JAMAIS d'autorité : l'utilisateur peut être en pleine séance, un
// rechargement sauvage lui ferait perdre son écran. On propose, il décide.

import { ref } from 'vue';

/** L'empreinte du build = le nom haché du chunk d'entrée, que Vite régénère à chaque
 *  déploiement. ⚠️ Dérivée du HTML servi, donc aucune étape de build à maintenir : rien
 *  à générer, rien qui puisse se désynchroniser. */
function stampFrom(html: string): string | null {
  return /assets\/index[-.][\w-]+\.js/.exec(html)?.[0] ?? null;
}

const updateReady = ref(false);
let mien: string | null = null;
let watching = false;

export function useAppUpdate() {
  async function check(): Promise<void> {
    if (!import.meta.env.PROD || updateReady.value) return;
    try {
      // `no-store` : sans ça on relirait la copie du navigateur, et on ne verrait
      // jamais le nouveau déploiement — le bug qu'on cherche précisément à éviter.
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
      const distant = stampFrom(html);
      mien ??= stampFrom(document.documentElement.outerHTML);
      if (distant && mien && distant !== mien) updateReady.value = true;
    } catch {
      // Hors ligne ou serveur muet : ce n'est pas une information, on ne dit rien.
    }
  }

  /** On vérifie quand l'onglet REVIENT au premier plan — le moment où quelqu'un reprend
   *  l'app après un déploiement — et non en boucle : ce serait une requête pour rien. */
  function watch(): void {
    if (watching || typeof document === 'undefined') return;
    watching = true;
    void check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check();
    });
  }

  function reload(): void {
    window.location.reload();
  }

  return { updateReady, watch, check, reload };
}

export { stampFrom as __stampFrom };
