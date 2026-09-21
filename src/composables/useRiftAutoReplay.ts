// useRiftAutoReplay — ▶️ le rejeu d'une incursion se lance TOUT SEUL : à l'arrivée du
// groupe sur la faille si l'écran est ouvert, sinon à la prochaine ouverture.
//
// ⚠️ La RÈGLE (quel rapport, lesquels retenir comme vus) vit dans `riftAutoReplay` (lib,
// testée) ; ce composable ne fait que brancher la boîte 📬 du personnage et la mémoire de
// l'appareil. Il est monté par les DEUX écrans qui portent un `RiftReplayDialog` (Aventure
// et carte d'expédition) — un seul des deux est monté à la fois, jamais les deux.
//
// ⚠️ MÉMOIRE PAR APPAREIL (`localStorage`) : c'est une commodité d'affichage, pas un état
// de jeu. Revoir une incursion sur un second appareil est acceptable ; ne jamais la revoir
// parce que le stockage est bloqué (navigation privée) l'est aussi — d'où les try/catch.
import { watch, type Ref } from 'vue';
import type { PartyResult } from '@/lib/expedition';
import { riftAutoReplay } from '@/lib/riftStage';
import { useCharacterStore } from '@/stores/character';

const KEY = 'muscu:rift:replayed';

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
    /* stockage indisponible : on rejouera peut-être une fois de trop, rien de plus */
  }
}

export function useRiftAutoReplay(replay: Ref<PartyResult | null>): void {
  const char = useCharacterStore();
  watch(
    () => char.row?.messages,
    (messages) => {
      // ⚠️ Pas pendant un rejeu déjà ouvert (lancé à la main ou le précédent) : le suivant
      // reste NON vu, il partira à la prochaine occasion au lieu de couper celui-ci.
      if (!messages || replay.value) return;
      const t = riftAutoReplay(messages, readSeen(), Date.now());
      writeSeen(t.seen);
      if (t.play?.party) replay.value = t.play.party;
    },
    { immediate: true },
  );
}
