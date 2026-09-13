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
import { comboCountedSets, type ComboChallenge } from '@/lib/combo';
import { comboChestPlan } from '@/lib/comboChest';

/** Verse le coffre d'un 360 bouclé ET le conserve sur le défi. Partagé par l'observateur
 *  ci-dessous et le balayage de l'Aventure : deux chemins, une seule règle.
 *  Rend `true` seulement si un coffre vient d'être DÉPOSÉ dans la boîte. */
export async function depositComboChest(
  uid: string,
  c: ComboChallenge,
  playerLevel: number,
): Promise<boolean> {
  const combo = useComboStore();
  const char = useCharacterStore();
  // Le personnage peut ne pas être chargé (on vient d'un écran sport) : sans sa ligne,
  // on ne saurait ni où écrire le message ni s'il y est déjà.
  if (!char.row) await char.fetchMine();
  if (!char.row) return false;
  const sets = comboCountedSets(c);
  const plan = comboChestPlan(c, char.row.messages, sets, playerLevel, Date.now());
  if (!plan) return false;
  const pose = plan.grant
    ? await char.grantComboChest(uid, c.id, c.name || 'Défi 360', sets, plan.record)
    : false;
  await combo.setChest(c.id, plan.record);
  return pose;
}

export function useComboChest() {
  const combo = useComboStore();
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
      const pose = await depositComboChest(uid, c, progress.global.value.level);
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
