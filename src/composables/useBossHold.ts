import { ref, computed, onUnmounted } from 'vue';
import { holdBonusTier, holdBonusMult, holdEffectiveSeconds, holdRing } from '@/lib/friendBoss';

/** ⏱️ Le chrono d'une tenue contre le boss. Le temps vient de `Date.now()` (jamais d'un compteur
 *  de `setInterval`, que l'onglet en veille ralentit) ; l'intervalle ne fait que rafraîchir
 *  l'affichage. Toute la règle (paliers, secondes équivalentes) est dans `friendBoss.ts`. L'écran
 *  reste allumé (Wake Lock, silencieux s'il est absent ou refusé). */
type WakeLockSentinelLike = { release: () => Promise<void> };

export function useBossHold() {
  const running = ref(false);
  const startedAt = ref(0);
  const nowMs = ref(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  let lock: WakeLockSentinelLike | null = null;

  /** Secondes tenues (décimales). */
  const seconds = computed(() =>
    running.value ? Math.max(0, nowMs.value - startedAt.value) / 1000 : 0,
  );
  const tier = computed(() => holdBonusTier(seconds.value));
  const mult = computed(() => holdBonusMult(seconds.value));
  const effective = computed(() => holdEffectiveSeconds(seconds.value));
  const ring = computed(() => holdRing(seconds.value));

  async function acquireLock() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock && document.visibilityState === 'visible')
        lock = await nav.wakeLock.request('screen');
    } catch {
      /* refusé ou indisponible : le chrono marche quand même */
    }
  }
  function releaseLock() {
    const l = lock;
    lock = null;
    l?.release().catch(() => undefined);
  }
  // Le navigateur retire le verrou quand l'onglet passe en arrière-plan : on le reprend au retour.
  function onVisible() {
    nowMs.value = Date.now();
    if (running.value && !lock) void acquireLock();
  }

  function start() {
    if (running.value) return;
    startedAt.value = Date.now();
    nowMs.value = startedAt.value;
    running.value = true;
    timer = setInterval(() => (nowMs.value = Date.now()), 200);
    document.addEventListener('visibilitychange', onVisible);
    void acquireLock();
  }

  /** Arrête et rend les secondes tenues (0 si rien ne tournait). */
  function stop(): number {
    if (!running.value) return 0;
    const s = Math.max(0, Date.now() - startedAt.value) / 1000;
    cleanup();
    return s;
  }

  function cleanup() {
    running.value = false;
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisible);
    releaseLock();
  }
  onUnmounted(cleanup);

  return { running, seconds, tier, mult, effective, ring, start, stop };
}
