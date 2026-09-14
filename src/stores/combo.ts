// Store combo — Défi 360 (défi combiné hebdo). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import {
  comboChestEligible,
  comboNextStatus,
  removeSetAt,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { logicalToday } from '@/lib/challenges';
import { canStartCombo, type ComboKind } from '@/lib/tennisTraining';
import type { ComboChestRecord } from '@/lib/comboChest';
import { useAuthStore } from '@/stores/auth';

export interface ComboRow extends ComboChallenge {
  user_id?: string;
}

class ComboActiveError extends Error {
  constructor(kind: ComboKind) {
    super(
      kind === 'tennis'
        ? 'Tu as déjà un Défi 360 Tennis en cours (1 max).'
        : 'Tu as déjà un Défi 360 en cours (1 max).',
    );
    this.name = 'ComboActiveError';
  }
}

const COLS = 'id, name, start_date, duration_days, status, legs, chest, config';

/** Ligne brute → 360 : la SORTE vit dans la colonne libre `config` (aucune migration). */
function fromRow(r: ComboRow & { config?: { kind?: string } | null }): ComboRow {
  const { config, ...rest } = r;
  return config?.kind === 'tennis' ? { ...rest, kind: 'tennis' } : rest;
}

export interface NewCombo {
  name: string;
  start_date: string;
  duration_days: number;
  legs: ComboLeg[];
  /** 'tennis' pour un Défi 360 Tennis ; absent = 360 muscu. */
  kind?: 'tennis';
}

export const useComboStore = defineStore('combo', () => {
  const list = ref<ComboRow[]>([]);
  const loaded = ref(false);

  /** Défis 360 qui viennent de se FERMER bouclés — le déclencheur du coffre de fin.
   *  ⚠️ Une FILE et non un seul id : au chargement, plusieurs 360 dont la date est passée
   *  peuvent se fermer d'un coup, et un id unique n'en aurait signalé qu'un. Vidée par
   *  celui qui les traite (`useComboChest`). */
  const closedChests = ref<string[]>([]);

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
    list.value = (data ?? []).map(fromRow);
    loaded.value = true;
    // ⚠️ Un 360 dont la date de fin est passée se FERME ici : personne ne l'aurait fait
    // sinon (aucune série n'arrive), il restait « en cours » pour toujours et son coffre ne
    // tombait jamais. Et un 360 fermé à l'objectif par une version d'avant, dont la
    // période court encore, se ROUVRE pour les séries bonus — son coffre, déjà conservé
    // sur le défi, ne sera pas reversé (`comboChestPlan`).
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

  async function create(input: NewCombo): Promise<ComboRow> {
    // UN 360 ACTIF PAR SORTE : un 360 muscu et un 360 Tennis coexistent.
    // TODO(cleanup avant release) : retirer le bypass `!isAdmin` (plusieurs 360 de la même
    // sorte pour tester, compte admin). Cf. [[combo360-admin-bypass-temporaire]].
    const { kind: askedKind, ...fields } = input;
    const kind = askedKind === 'tennis' ? 'tennis' : 'muscu';
    const isAdmin = useAuthStore().isAdmin;
    if (!isAdmin && !canStartCombo(list.value, kind)) throw new ComboActiveError(kind);
    const { data, error } = await supabase
      .from('combo_challenges')
      .insert({ ...fields, status: 'active', config: kind === 'tennis' ? { kind } : {} })
      .select(COLS)
      .single();
    if (error) throw error;
    const row = fromRow(data);
    list.value.unshift(row);
    return row;
  }

  async function persistLegs(id: string, legs: ComboLeg[], status?: string) {
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
  // Passe à « done » à la FERMETURE (date de fin, ou maximal partout) — plus à l'objectif.
  function addSet(
    id: string,
    exerciseId: string,
    date: string,
    reps: number,
    weight: number | null,
    assisted = false,
  ) {
    const c = list.value.find((x) => x.id === id);
    if (!c || reps <= 0) return;
    const leg = c.legs.find((l) => l.exercise_id === exerciseId);
    if (!leg) return;
    if (!leg.sets) leg.sets = []; // migration : ancien format sans `sets`
    leg.sets.push({ date, reps, weight: weight ?? null, assisted });
    if (weight != null) leg.weight_kg = weight; // dernier poids → préremplissage
    // ⚠️ On SIGNALE la transition vers « terminé ». Le coffre de fin de 360 doit tomber à
    // l'instant même où le défi se boucle — or le store ne connaît ni le niveau du joueur
    // ni la boîte à messages. Plutôt que de brancher le versement sur les quatre écrans
    // qui peuvent valider une série (donc quatre endroits où l'oublier), on émet ici et
    // un seul observateur, monté en permanence, s'en charge (`useComboChest`).
    refreshStatus(c);
    void supabase
      .from('combo_challenges')
      .update({ legs: c.legs, status: c.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('combo addSet persist', error);
      });
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
    void supabase
      .from('combo_challenges')
      .update({ legs: c.legs, status: c.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('combo removeSet persist', error);
      });
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
    closedChests,
    setChest,
    fetchMine,
    create,
    addSet,
    removeSet,
    setWeight,
    setStatus,
    remove,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useComboStore, import.meta.hot));
}
