// useGoldFx — petite animation NON bloquante de « + or gagné » (pièces qui
// jaillissent + le total 🪙) déclenchée à chaque vente (objet / talent / familier /
// vente en masse). Singleton (App.vue monte GoldGainOverlay). Volontairement léger
// et empilable : plusieurs ventes rapprochées = plusieurs éclats.
import { ref } from 'vue';

export interface GoldFx {
  id: number;
  amount: number; // or gagné (entier, > 0)
}

const bursts = ref<GoldFx[]>([]);
let seq = 0;

export function useGoldFx() {
  // Déclenche un éclat de pièces pour `amount` or (ignoré si ≤ 0).
  function gain(amount: number): void {
    const a = Math.round(amount || 0);
    if (a <= 0) return;
    bursts.value.push({ id: ++seq, amount: a });
  }
  function remove(id: number): void {
    bursts.value = bursts.value.filter((b) => b.id !== id);
  }
  return { bursts, gain, remove };
}
