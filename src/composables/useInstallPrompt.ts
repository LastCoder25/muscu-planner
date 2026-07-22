// Capture de l'événement d'installation PWA (« Ajouter à l'écran d'accueil »).
// `beforeinstallprompt` est émis tôt par Chrome/Android → on le capture au boot
// (module singleton) pour pouvoir déclencher l'invite depuis un clic utilisateur.
// iOS Safari ne propose pas d'invite programmatique → on détecte le cas pour
// afficher des instructions manuelles.
import { ref, computed } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const deferred = ref<BeforeInstallPromptEvent | null>(null);
const installed = ref(false);
let inited = false;

function detectStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ se présente comme un Mac tactile
  const iPadOS = /Macintosh/.test(ua) && 'ontouchend' in document;
  return iOS || iPadOS;
}

// Appelé une fois au boot : installe les écouteurs globaux.
export function initInstallPrompt() {
  if (inited) return;
  inited = true;
  installed.value = detectStandalone();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred.value = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred.value = null;
    installed.value = true;
  });
}

export function useInstallPrompt() {
  const isIOS = detectIOS();
  const isStandalone = computed(() => installed.value || detectStandalone());
  // On peut proposer l'installation si une invite native est prête, ou sur iOS
  // (instructions manuelles), tant que l'app n'est pas déjà installée.
  const canInstall = computed(() => !isStandalone.value && (!!deferred.value || isIOS));

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const evt = deferred.value;
    if (!evt) return 'unavailable';
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    deferred.value = null;
    return outcome;
  }

  return {
    canInstall,
    isIOS,
    isStandalone,
    hasNativePrompt: computed(() => !!deferred.value),
    promptInstall,
  };
}
