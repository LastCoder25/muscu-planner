// 📊 LA BARRE D'ÉTOILE AU RETOUR DE MISSION — un overlay qui montre, pour chaque champion,
// son avancement vers l'étoile suivante AVANT puis sa montée jusqu'à l'APRÈS ; une étoile
// gagnée remplit la barre jusqu'au bout, éclate, puis la barre repart de zéro.
// ⚠️ Le niveau est CACHÉ : sans cette barre, un gain qui reste entre deux étoiles (le cas le
// plus fréquent) ne se voyait nulle part. Singleton, monté une fois dans App.vue.
import { ref } from 'vue';
import type { AdvXpTrack } from '@/lib/adventurers';

interface AdvXpEvent {
  id: number;
  title: string;
  tracks: AdvXpTrack[];
}

const current = ref<AdvXpEvent | null>(null);
const queue: AdvXpEvent[] = [];
let seq = 0;

export function useAdvXpFx() {
  /** Rien à montrer sans gain : l'overlay ne s'ouvre pas pour une mission sans XP. */
  function show(tracks: readonly AdvXpTrack[] | undefined, title = 'Retour de mission'): void {
    const list = (tracks ?? []).filter((t) => t.xp > 0);
    if (!list.length) return;
    const ev = { id: ++seq, title, tracks: list };
    if (current.value) queue.push(ev);
    else current.value = ev;
  }
  function dismiss(): void {
    current.value = queue.shift() ?? null;
  }
  return { current, show, dismiss };
}
