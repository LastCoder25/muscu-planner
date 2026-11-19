// ⚙️ Les montées AUTOMATIQUES (v1.321.0). Les réglages vivent PAR APPAREIL (localStorage,
// comme les autres réglages d'affichage de la Base) : l'automatisation tourne sur
// l'appareil où on l'a allumée, et un appareil qui ne l'a pas allumée ne dépense rien.
// Tout passe par les gestes du store (`ascendChampion`, `ascendGear`, `autoAssignGear`,
// `awakenAllGear`), donc par LEURS refus : rien n'est recopié ici.
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { loadCharacterStore, useLazyCharacter } from '@/composables/useLazyCharacter';
import { emptySeals } from '@/lib/ascension';
import {
  AUTO_UP_KEY,
  anyAutoUp,
  nextChampionToAscend,
  nextGearToAscend,
  parseAutoUp,
  type AutoUpSettings,
} from '@/lib/autoUp';

/** Garde-fou : un tour ne fait jamais plus de montées que ça (une boucle qui ne finirait pas
 *  viderait l'or du joueur). Le tour suivant reprend là où celui-ci s'arrête. */
const MAX_STEPS = 25;

function readStored(): AutoUpSettings {
  try {
    return parseAutoUp(localStorage.getItem(AUTO_UP_KEY));
  } catch {
    return parseAutoUp(null);
  }
}

// Singleton : le panneau (Base) et le moteur (MainLayout) lisent le MÊME état.
const settings: Ref<AutoUpSettings> = ref(readStored());

export function setAutoUp(key: keyof AutoUpSettings, on: boolean) {
  settings.value = { ...settings.value, [key]: on };
  try {
    localStorage.setItem(AUTO_UP_KEY, JSON.stringify(settings.value));
  } catch {
    /* stockage indisponible : le réglage vaut pour cette session */
  }
}

export function useAutoUpSettings() {
  return { settings, setAutoUp };
}

/** Le MOTEUR : à monter une seule fois (MainLayout). Se déclenche à l'ouverture, quand le
 *  vivier / le stock / l'or / les sceaux changent, et quand un réglage s'allume. */
export function useAutoUpEngine() {
  const $q = useQuasar();
  const auth = useAuthStore();
  // 🐢 Le store du personnage n'est jamais importé statiquement sous MainLayout (cf.
  // `useLazyCharacter`, vérifié par `test/lazyCharacter.test.ts`) ; il n'est même demandé
  // que si un réglage est allumé.
  const charRef = useLazyCharacter();
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function run() {
    const uid = auth.user?.id;
    const s = settings.value;
    const char = charRef.value;
    if (running || !uid || !char?.row || !anyAutoUp(s)) return;
    running = true;
    try {
      let steps = 0;
      let champUps = 0;
      if (s.champions) {
        while (steps < MAX_STEPS) {
          const cur = char.row;
          if (!cur) break;
          const a = nextChampionToAscend(char.advList, {
            pantheonLevel: char.pantheonLevel,
            seals: cur.seals ?? emptySeals(),
            gold: cur.gold,
          });
          if (!a) break;
          if (await char.ascendChampion(uid, a.id, s.skipChampionsAnim)) break; // refusé : on s'arrête, sans boucler
          steps++;
          champUps++;
        }
      }
      let gearUps = 0;
      if (s.gear) {
        while (steps < MAX_STEPS) {
          const cur = char.row;
          if (!cur) break;
          const g = nextGearToAscend(char.advGearStock, {
            advs: char.advList,
            seals: cur.seals ?? emptySeals(),
            gold: cur.gold,
          });
          if (!g) break;
          if (await char.ascendGear(uid, g.id, undefined, s.skipGearAnim)) break;
          steps++;
          gearUps++;
        }
        // 🗡️ Monter une pièce change ce que chaque champion devrait porter : on relance
        // l'équipement au mieux (le même geste que « Équiper » de la Guilde).
        // Un champion qui vient de monter peut porter des pièces plus rares : même relance.
        if (gearUps || champUps) await char.autoAssignGear(uid);
      }
      // ✨ La fusion équipe d'abord au mieux, puis fond (`equipThenMerge`) : le rééquipement
      // fait partie du geste. Aucune écriture quand il n'y a rien à fondre.
      if (s.merge) await char.awakenAllGear(uid);
    } catch (e) {
      $q.notify({ type: 'negative', message: `⚙️ Montée automatique : ${(e as Error).message}` });
    } finally {
      running = false;
    }
  }

  /** Regroupe les changements rapprochés (une écriture en provoque une autre) en un tour. */
  function schedule() {
    if (!anyAutoUp(settings.value)) return;
    void loadCharacterStore();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 1500);
  }

  watch(() => {
    const c = charRef.value;
    return [c?.advList, c?.advGearStock, c?.row?.seals, c?.row?.gold, settings.value];
  }, schedule);
  onMounted(schedule);
  onUnmounted(() => {
    if (timer) clearTimeout(timer);
  });
}
