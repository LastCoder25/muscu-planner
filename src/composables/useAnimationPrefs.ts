// useAnimationPrefs — état réactif PARTAGÉ des interrupteurs d'animation (cf. lib/animationPrefs).
// Singleton : la page Base les modifie, les écrans qui lancent les rejeux les lisent.
import { reactive } from 'vue';
import { animationKey, parseAnimationPref, type AnimationKind } from '@/lib/animationPrefs';

function read(kind: AnimationKind): boolean {
  try {
    return parseAnimationPref(localStorage.getItem(animationKey(kind)));
  } catch {
    return true;
  }
}

const state = reactive<Record<AnimationKind, boolean>>({
  siege: read('siege'),
  rift: read('rift'),
  overflow: read('overflow'),
  fboss: read('fboss'),
});

export function useAnimationPrefs() {
  function set(kind: AnimationKind, on: boolean): void {
    state[kind] = on;
    try {
      localStorage.setItem(animationKey(kind), on ? '1' : '0');
    } catch {
      /* stockage indisponible : valable pour cette session seulement */
    }
  }
  return { on: state, set };
}
