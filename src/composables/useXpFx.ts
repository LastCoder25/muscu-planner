// useXpFx — overlay d'XP GAGNÉE après une activité sportive : montre le cercle du
// niveau de l'ACTIVITÉ + celui du niveau GLOBAL, chacun animant sa progression
// « d'avant → après » (avec level-up), l'un après l'autre. Singleton (App.vue monte
// XpGainOverlay). Ticket 24816d81.
import { ref } from 'vue';

export interface XpRing {
  emoji: string;
  label: string;
  fromLevel: number;
  fromPct: number; // 0..100 (avancement dans le niveau AVANT)
  toLevel: number;
  toPct: number; // 0..100 APRÈS
}
export interface XpFxEvent {
  id: number;
  rings: XpRing[];
}

const current = ref<XpFxEvent | null>(null);
let seq = 0;

export function useXpFx() {
  // N'affiche que s'il y a un vrai gain (évite l'overlay pour 0 XP).
  function show(rings: XpRing[]): void {
    const meaningful = rings.some(
      (r) => r.toLevel > r.fromLevel || Math.abs(r.toPct - r.fromPct) >= 1,
    );
    if (!meaningful) return;
    current.value = { id: ++seq, rings };
  }
  function dismiss(): void {
    current.value = null;
  }
  return { current, show, dismiss };
}
