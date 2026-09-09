// useComboChest.ts — dépose le COFFRE de fin de Défi 360, à l'instant où le défi se boucle.
//
// ⚠️ UN SEUL OBSERVATEUR, MONTÉ EN PERMANENCE (App.vue). Un 360 peut se boucler depuis
// trois écrans (le détail, l'onglet Défi 360, la séance générée) : accrocher le versement
// à chacun d'eux, ce serait trois endroits où l'oublier, et trois copies de la même règle.
// Le store `combo` se contente de SIGNALER la transition ; ici on agit.
//
// ⚠️ ON N'OUVRE PAS LE COFFRE AVANT DE CONNAÎTRE LE NIVEAU. Le niveau vient de l'XP de
// fond, qui se charge en tâche de fond : sans `ready`, un défi bouclé au démarrage aurait
// produit un coffre de NIVEAU 1 — et comme le versement est idempotent, l'erreur serait
// définitive. On garde donc le défi en attente jusqu'à ce que la progression soit connue.
//
// ⚠️ Le versement reste IDEMPOTENT côté store (l'id du message dérive de celui du défi) :
// ce chemin-ci donne l'immédiateté, le balayage de l'Aventure reste le filet pour les
// défis bouclés avant cette version — ou pendant que l'app n'était pas ouverte.
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useComboStore } from '@/stores/combo';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useProgress } from '@/composables/useProgress';
import { comboCountedSets } from '@/lib/combo';

export function useComboChest() {
  const combo = useComboStore();
  const char = useCharacterStore();
  const auth = useAuthStore();
  const progress = useProgress();
  const $q = useQuasar();
  /** Défi bouclé dont le coffre attend de connaître le niveau du joueur. */
  const enAttente = ref<string | null>(null);

  async function deposer(id: string) {
    const uid = auth.user?.id;
    const c = combo.list.find((x) => x.id === id);
    if (!uid || !c) return;
    try {
      // Le personnage peut ne pas être chargé (on vient d'un écran sport) : sans sa ligne,
      // `grantComboChest` ne saurait pas où écrire le message.
      if (!char.row) await char.fetchMine();
      const pose = await char.grantComboChest(
        uid,
        c.id,
        c.name || 'Défi 360',
        comboCountedSets(c),
        progress.global.value.level,
        Date.now(),
      );
      if (pose) {
        $q.notify({
          type: 'positive',
          timeout: 6000,
          message: '🎁 Défi 360 bouclé — un coffre t’attend dans ta boîte 📬',
        });
      }
    } catch (e) {
      console.error('coffre 360', e);
    }
  }

  watch(
    () => combo.justCompleted,
    (id) => {
      if (!id) return;
      combo.justCompleted = null; // consommé : on ne retente pas en boucle
      if (progress.ready.value) void deposer(id);
      else enAttente.value = id; // le niveau n'est pas encore connu → on patiente
    },
  );
  watch(
    () => progress.ready.value,
    (ok) => {
      const id = enAttente.value;
      if (!ok || !id) return;
      enAttente.value = null;
      void deposer(id);
    },
  );
}
