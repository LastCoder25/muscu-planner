// useOverflowReplay — ▶️ le débordement d'une faille se montre TOUT SEUL, à la prochaine
// ouverture de l'Aventure ou de la carte (même règle que les incursions : le plus récent,
// jamais vu, de moins de 3 jours — `overflowAutoReplay`).
//
// ⚠️ MÉMOIRE PAR APPAREIL, à part de celle des incursions : c'est une commodité d'affichage.
// ⚠️ Il attend qu'aucun autre rejeu ne soit ouvert (`busy`) : deux plateaux plein écran
// empilés, on ne sait plus lequel on referme.
import { ref, watch, type Ref } from 'vue';
import type { ExpeditionMessage } from '@/lib/expedition';
import { overflowAutoReplay } from '@/lib/overflowStage';
import { useCharacterStore } from '@/stores/character';

const KEY = 'muscu:overflow:replayed';

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
function writeSeen(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : on le reverra peut-être une fois, rien de plus */
  }
}

/** `ovfMsg` = le débordement montré (ou null) ; `ovfAutoId` = son id s'il est parti TOUT SEUL
 *  (« Voir le rapport » mène alors à ce message), null s'il a été lancé à la main. */
export function useOverflowReplay(busy: Ref<boolean>): {
  ovfMsg: Ref<ExpeditionMessage | null>;
  ovfAutoId: Ref<string | null>;
} {
  const char = useCharacterStore();
  const ovfMsg = ref<ExpeditionMessage | null>(null);
  const ovfAutoId = ref<string | null>(null);
  watch(ovfMsg, (m) => {
    if (!m) ovfAutoId.value = null;
  });
  watch(
    [() => char.row?.messages, busy],
    ([messages, b]) => {
      if (!messages || b || ovfMsg.value) return;
      const t = overflowAutoReplay(messages, readSeen(), Date.now());
      writeSeen(t.seen);
      if (t.play) {
        ovfAutoId.value = t.play.id;
        ovfMsg.value = t.play;
      }
    },
    { immediate: true },
  );
  return { ovfMsg, ovfAutoId };
}
