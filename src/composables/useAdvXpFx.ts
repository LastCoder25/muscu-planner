// 📊 LA BARRE D'ÉTOILE AU RETOUR DE MISSION — un overlay qui montre, pour chaque champion,
// son avancement vers l'étoile suivante AVANT puis sa montée jusqu'à l'APRÈS ; une étoile
// gagnée remplit la barre jusqu'au bout, éclate, puis la barre repart de zéro.
// ⚠️ Le niveau est CACHÉ : sans cette barre, un gain qui reste entre deux étoiles (le cas le
// plus fréquent) ne se voyait nulle part. Singleton, monté une fois dans App.vue.
// 🎓 Elle part À L'ARRIVÉE DU RAPPORT (c'est là que l'XP est versée), plus à l'encaissement.
import { ref } from 'vue';
import type { AdvXpTrack } from '@/lib/adventurers';

interface AdvXpEvent {
  id: number;
  title: string;
  tracks: AdvXpTrack[];
}

const current = ref<AdvXpEvent | null>(null);
const queue: AdvXpEvent[] = [];
/** ⏸️ Qui retient l'overlay (un rejeu de faille ouvert, un siège en cours de rejeu) : il
 *  recouvrirait l'animation et en révélerait l'issue. Des CLÉS et non un booléen — deux
 *  écrans peuvent retenir en même temps, et le premier qui relâche ne libère pas l'autre. */
const holders = new Set<string>();
let seq = 0;

function next(): void {
  current.value = holders.size ? null : (queue.shift() ?? null);
}

export function useAdvXpFx() {
  /** Rien à montrer sans gain : l'overlay ne s'ouvre pas pour une mission sans XP. */
  function show(tracks: readonly AdvXpTrack[] | undefined, title = 'Retour de mission'): void {
    const list = (tracks ?? []).filter((t) => t.xp > 0);
    if (!list.length) return;
    queue.push({ id: ++seq, title, tracks: list });
    if (!current.value) next();
  }
  function dismiss(): void {
    next();
  }
  /** Retient (`on`) ou relâche l'overlay pour `key`. ⚠️ Un overlay DÉJÀ ouvert au moment
   *  de la retenue repasse en tête de file : le rapport et le rejeu arrivent dans le même
   *  tick, et l'overlay part une microseconde avant que le rejeu ne s'ouvre. */
  function hold(key: string, on: boolean): void {
    if (on) {
      if (holders.has(key)) return;
      holders.add(key);
      if (current.value) queue.unshift(current.value);
      current.value = null;
    } else if (holders.delete(key) && !current.value) next();
  }
  return { current, show, dismiss, hold };
}
