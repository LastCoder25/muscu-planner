// Store combo — Défi 360 (défi combiné hebdo). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import {
  comboChestEligible,
  comboLegBlocked,
  legComplete,
  activeCombo,
  comboNextStatus,
  removeSetAt,
  updateSetAt,
  transferComboLeg,
  switchLegUnit,
  type ComboCountMode,
  legHoldLoadable,
  updateHoldSetAt,
  HOLD_LEST_MAX,
  type ComboTransferPlan,
  type ComboTransferTarget,
  type ComboChallenge,
  type ComboLeg,
  type ElasticBand,
  type JustAdded,
} from '@/lib/combo';
import { logicalToday } from '@/lib/challenges';
import type { ComboChestRecord } from '@/lib/comboChest';
import { useAuthStore } from '@/stores/auth';
import { createLatestWriter } from '@/lib/latestWriter';

/** Durée du halo sur la série qu'on vient de faire. */
const FLASH_MS = 2200;

export interface ComboRow extends ComboChallenge {
  user_id?: string;
}

class ComboActiveError extends Error {
  constructor() {
    super('Tu as déjà un Défi 360 en cours (1 max).');
    this.name = 'ComboActiveError';
  }
}

const COLS = 'id, name, start_date, duration_days, status, legs, chest, config';

export interface NewCombo {
  name: string;
  start_date: string;
  duration_days: number;
  legs: ComboLeg[];
  /** Réglages du défi : mode « par groupe » et objectifs des groupes (colonne jsonb `config`,
   *  sans migration) ; repris tels quels à la relance d'un défi. */
  config?: ComboChallenge['config'];
}

export const useComboStore = defineStore('combo', () => {
  const list = ref<ComboRow[]>([]);
  const loaded = ref(false);
  /** ✨ La dernière série ajoutée, pendant FLASH_MS : les écrans l'entourent d'un halo pour dire
   *  « c'est celle-là, sur cet exo ». Un seul point de départ (addSet) pour les quatre écrans qui
   *  peuvent valider une série. Jamais persisté. */
  const justAdded = ref<JustAdded | null>(null);
  let flashSeq = 0;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  /** Défis 360 qui viennent de se FERMER bouclés — le déclencheur du coffre de fin.
   *  ⚠️ Une FILE et non un seul id : au chargement, plusieurs 360 dont la date est passée
   *  peuvent se fermer d'un coup, et un id unique n'en aurait signalé qu'un. Vidée par
   *  celui qui les traite (`useComboChest`). */
  const closedChests = ref<string[]>([]);

  /** Écrit les séries et le statut d'un 360, UNE requête à la fois, avec l'état du moment
   *  (`latestWriter`). ⚠️ Des requêtes lancées en parallèle (une par série à la fin d'une
   *  séance) arrivaient dans le désordre et s'écrasaient : des séries faites étaient perdues. */
  const legsWriter = createLatestWriter<string>(
    async (id) => {
      const c = list.value.find((x) => x.id === id);
      if (!c) return;
      const { error } = await supabase
        .from('combo_challenges')
        .update({
          legs: JSON.parse(JSON.stringify(c.legs)) as ComboLeg[],
          status: c.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    { onError: (id, e) => console.error('combo persist', id, e) },
  );

  /** Recalcule le statut d'un 360 et signale sa fermeture si elle ouvre un coffre.
   *  Rend `true` si le statut a changé (à persister). */
  function refreshStatus(c: ComboRow, today = logicalToday()): boolean {
    const etait = c.status;
    c.status = comboNextStatus(c, today);
    if (etait !== 'done' && c.status === 'done' && comboChestEligible(c)) {
      closedChests.value.push(c.id);
    }
    return etait !== c.status;
  }

  async function fetchMine() {
    // ⚠️ FILTRE EXPLICITE OBLIGATOIRE. Cette requête s'appuyait sur la RLS own-only
    // comme filtre — jusqu'à ce que la migr. 0058 ajoute `combo_read_friends` : depuis,
    // un `select` nu renvoie MES lignes ET celles de tous mes amis. `activeOne()` prenant
    // le 1er actif trié par date, un ami voyait le 360 du plus récemment créé (le mien)
    // à la place du sien, et son XP comptait mon historique.
    // RÈGLE : ne JAMAIS se reposer sur la RLS pour filtrer côté client — elle borne ce
    // qu'on a le DROIT de lire, pas ce qu'on VEUT lire.
    const uid = useAuthStore().user?.id;
    if (!uid) {
      list.value = [];
      return list.value;
    }
    const { data, error } = await supabase
      .from('combo_challenges')
      .select(COLS)
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    list.value = data ?? [];
    loaded.value = true;
    // ⚠️ Un 360 dont la date de fin est passée se FERME ici : personne ne l'aurait fait
    // sinon (aucune série n'arrive), il restait « en cours » pour toujours et son coffre ne
    // tombait jamais. Et un 360 dont tous les objectifs sont atteints se ferme ici aussi
    // (v1.53) — son coffre, s'il est déjà conservé sur le défi, n'est pas reversé
    // (`comboChestPlan`).
    for (const c of list.value) {
      if (c.status === 'abandoned' || !refreshStatus(c)) continue;
      void supabase
        .from('combo_challenges')
        .update({ status: c.status })
        .eq('id', c.id)
        .then(({ error }) => {
          if (error) console.error('combo fermeture', error);
        });
    }
    return list.value;
  }

  /** ⚠️ Une seule règle pour tout le jeu (`activeCombo`, lib) : mon écran et celui d'un ami
   *  ne peuvent plus désigner deux 360 différents. `list` est triée `created_at desc`. */
  const activeOne = () => activeCombo(list.value, logicalToday());

  async function create(input: NewCombo): Promise<ComboRow> {
    // Un seul Défi 360 actif à la fois, pour tout le monde.
    if (list.value.some((c) => c.status === 'active')) throw new ComboActiveError();
    const { data, error } = await supabase
      .from('combo_challenges')
      .insert({ ...input, status: 'active' })
      .select(COLS)
      .single();
    if (error) throw error;
    list.value.unshift(data);
    return data;
  }

  async function persistLegs(id: string, legs: ComboLeg[], status?: string) {
    // Après les séries encore en route : sinon l'une d'elles écraserait ce changement.
    await legsWriter.idle(id);
    const patch: Record<string, unknown> = { legs, updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    const { error } = await supabase.from('combo_challenges').update(patch).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) {
      c.legs = legs;
      if (status) c.status = status as ComboRow['status'];
    }
  }

  // Ajoute une SÉRIE (reps + poids) sur un exo, à la date donnée. OPTIMISTE : la
  // liste locale est mise à jour tout de suite (réponse instantanée), la
  // persistance Supabase part en arrière-plan. Mémorise le poids (préremplissage).
  // Passe à « done » à la FERMETURE (date de fin, ou objectif atteint partout).
  // ⚠️ REFUSE une série sur un exo dont l'objectif est atteint (v1.53 : plus de séries en
  // plus — qui veut en faire davantage lance un challenge à part). L'écran ne la propose
  // plus, mais l'écran ne garantit rien : la séance générée, un double toucher…
  function addSet(
    id: string,
    exerciseId: string,
    date: string,
    reps: number,
    weight: number | null,
    assisted = false,
    band: ElasticBand | null = null,
    /** Heure réelle de la série (ms). La séance générée n'enregistre qu'à la fin : sans
     *  elle, toutes ses séries porteraient l'heure de l'enregistrement, et la fatigue des
     *  groupes (lue sur cette heure) croirait qu'elles ont été faites d'un coup. */
    at?: number,
    /** 🧱 Lest (kg) d'une tenue lestable (planche, chaise) : champ à part, jamais du poids. */
    lest?: number,
  ) {
    const c = list.value.find((x) => x.id === id);
    if (!c || reps <= 0) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg || legComplete(leg)) return;
    // Mode « par groupe » : l'objectif est celui du GROUPE (la cible de l'exo, elle, vaut 0).
    if (comboLegBlocked(c, leg)) return;
    if (!leg.sets) leg.sets = []; // migration : ancien format sans `sets`
    const stamp = new Date(at ?? Date.now()).toISOString();
    // Un lest n'est retenu que sur une tenue lestable : ailleurs, il est ignoré.
    const lestKg = lest && lest > 0 && legHoldLoadable(leg) ? lest : 0;
    leg.sets.push({
      date,
      reps,
      weight: weight ?? null,
      assisted,
      ...(band && !assisted ? { band } : {}),
      ...(lestKg ? { lest: lestKg } : {}),
      at: stamp,
    });
    if (weight != null) leg.weight_kg = weight; // dernier poids → préremplissage
    if (lestKg) leg.lest_kg = lestKg;
    // ⚠️ On SIGNALE la transition vers « terminé ». Le coffre de fin de 360 doit tomber à
    // l'instant même où le défi se boucle — or le store ne connaît ni le niveau du joueur
    // ni la boîte à messages. Plutôt que de brancher le versement sur les quatre écrans
    // qui peuvent valider une série (donc quatre endroits où l'oublier), on émet ici et
    // un seul observateur, monté en permanence, s'en charge (`useComboChest`).
    refreshStatus(c);
    // ✨ Halo sur la série posée. Une série saisie avec une heure PASSÉE (la séance générée
    // enregistre toutes les siennes à la fin) ne flashe pas : l'utilisateur n'est plus dessus.
    if (at === undefined) {
      justAdded.value = { exerciseId, index: leg.sets.length - 1, key: ++flashSeq };
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (justAdded.value = null), FLASH_MS);
    }
    legsWriter.schedule(id);
  }

  // Retire UNE série précise (la case touchée). OPTIMISTE.
  function removeSet(id: string, exerciseId: string, index: number) {
    const c = list.value.find((x) => x.id === id);
    if (!c) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg?.sets?.length || index < 0 || index >= leg.sets.length) return;
    leg.sets = removeSetAt(leg.sets, index);
    // Plus aucune série → on efface aussi le poids mémorisé (souvent une saisie
    // erronée qu'on vient de retirer) pour ne pas le repré-remplir.
    if (!leg.sets.length) leg.weight_kg = null;
    c.status = comboNextStatus(c, logicalToday());
    legsWriter.schedule(id);
  }

  // Corrige UNE série précise (la case touchée). OPTIMISTE, comme l’ajout et le retrait.
  // ⚠️ Le statut se recalcule : corriger des reps peut boucler — ou dé-boucler — un exo.
  function updateSet(
    id: string,
    exerciseId: string,
    index: number,
    reps: number,
    weight: number | null,
    assisted = false,
    band: ElasticBand | null = null,
  ) {
    const c = list.value.find((x) => x.id === id);
    if (!c || reps <= 0) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg?.sets?.length || index < 0 || index >= leg.sets.length) return;
    leg.sets = updateSetAt(leg.sets, index, { reps, weight, assisted, band });
    // La DERNIÈRE série porte le poids qui préremplit la suivante.
    if (index === leg.sets.length - 1) leg.weight_kg = weight ?? null;
    refreshStatus(c);
    legsWriter.schedule(id);
  }

  /** ✏️ Corrige UNE série de tenue (secondes + lest). Le lest n'est retenu que sur une tenue
   *  lestable ; le statut se recalcule (des secondes en plus peuvent boucler l'exo). OPTIMISTE. */
  function updateHoldSet(id: string, exerciseId: string, index: number, sec: number, lest: number) {
    const c = list.value.find((x) => x.id === id);
    if (!c || !(sec > 0)) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg?.sets?.length || index < 0 || index >= leg.sets.length) return;
    const lestKg = legHoldLoadable(leg) ? Math.min(HOLD_LEST_MAX, Math.max(0, lest)) : 0;
    leg.sets = updateHoldSetAt(leg.sets, index, { sec: Math.round(sec), lest: lestKg });
    // La DERNIÈRE série porte le lest qui préremplit la suivante.
    if (index === leg.sets.length - 1 && legHoldLoadable(leg)) leg.lest_kg = lestKg;
    refreshStatus(c);
    legsWriter.schedule(id);
  }

  /** 🧱 Mémorise le lest choisi sur une tenue lestable (planche, chaise) : il préremplit la
   *  prochaine série. Sans effet ailleurs. OPTIMISTE, écriture différée comme les séries. */
  function setHoldLest(id: string, exerciseId: string, kg: number) {
    const c = list.value.find((x) => x.id === id);
    const leg = c?.legs.find((l) => l.exercise_id === exerciseId);
    if (!c || !leg || !legHoldLoadable(leg)) return;
    leg.lest_kg = Math.min(HOLD_LEST_MAX, Math.max(0, Math.round(kg * 10) / 10));
    legsWriter.schedule(id);
  }

  // Met à jour la charge (kg) d'un exo.
  async function setWeight(id: string, exerciseId: string, weightKg: number | null) {
    const c = list.value.find((x) => x.id === id);
    if (!c) return;
    const legs = c.legs.map((l) =>
      l.exercise_id === exerciseId ? { ...l, weight_kg: weightKg } : l,
    );
    await persistLegs(id, legs);
  }

  async function setStatus(id: string, status: 'active' | 'done' | 'abandoned') {
    const { error } = await supabase.from('combo_challenges').update({ status }).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) c.status = status;
  }

  /** ⇄ CHANGER D'EXO en cours de défi : l'exo quitté disparaît, son objectif et ses
   *  séries basculent sur la cible (un exo déjà présent du même groupe, ou un exo neuf).
   *  Le refus vit dans la lib (comboTransferBlocker) et se rejoue ici : l'écran peut ne
   *  pas proposer l'impossible, il ne peut pas le garantir. Le statut se recalcule (la
   *  cible peut repasser sous son objectif, ou l'atteindre). Lève si c'est refusé. */
  async function transferLeg(
    id: string,
    fromId: string,
    to: ComboTransferTarget,
    plan?: ComboTransferPlan,
  ) {
    const c = list.value.find((x) => x.id === id);
    if (!c) return;
    const legs = transferComboLeg(c, fromId, to, plan);
    const next = { ...c, legs };
    refreshStatus(next);
    await persistLegs(id, legs, next.status);
  }

  /** 🔁 Change l'unité de comptage d'UN exo en place (séries ↔ durée pour une tenue, séries ↔ reps
   *  sinon) : le reste est converti, le fait ne bouge pas. Le refus vit dans la lib
   *  (`comboUnitBlocker`) et se rejoue ici. Le statut se recalcule. Lève si c'est refusé. */
  async function switchUnit(id: string, exerciseId: string, to: ComboCountMode) {
    const c = list.value.find((x) => x.id === id);
    if (!c) return;
    const legs = switchLegUnit(c, exerciseId, to);
    const next = { ...c, legs };
    refreshStatus(next);
    await persistLegs(id, legs, next.status);
  }

  /** Conserve le contenu du coffre de fin sur le défi : preuve durable du versement, et
   *  ce qui permet de le revoir une fois le message chassé de la boîte (30 messages). */
  async function setChest(id: string, chest: ComboChestRecord) {
    const { error } = await supabase.from('combo_challenges').update({ chest }).eq('id', id);
    if (error) throw error;
    const c = list.value.find((x) => x.id === id);
    if (c) c.chest = chest;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('combo_challenges').delete().eq('id', id);
    if (error) throw error;
    list.value = list.value.filter((c) => c.id !== id);
  }

  return {
    list,
    loaded,
    justAdded,
    closedChests,
    setChest,
    fetchMine,
    activeOne,
    create,
    addSet,
    removeSet,
    updateSet,
    transferLeg,
    switchUnit,
    setHoldLest,
    updateHoldSet,
    setWeight,
    setStatus,
    remove,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useComboStore, import.meta.hot));
}
