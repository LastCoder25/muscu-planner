// Store AMIS — demandes d'ami et lecture (seule) de l'entraînement d'un ami.
// Toute l'autorisation vit en BASE (RLS + fonctions SECURITY DEFINER, migr. 0058) :
// ce store ne fait que router les appels, il ne filtre rien lui-même.
//   • découverte par PSEUDO EXACT (RPC find_friend_by_pseudo) → pas d'annuaire
//     parcourable, donc pas d'énumération des inscrits ;
//   • les challenges/combos d'un ami sont lisibles grâce aux policies « amis » —
//     une requête normale suffit, la base décide.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/lib/supabase';
import type { Challenge, ChallengeConfig, ChallengeFormat } from '@/lib/challenges';
import type { ComboChallenge } from '@/lib/combo';
import type { FriendTraining, RowStamps } from '@/lib/friendFeed';

export type FriendStatus = 'pending' | 'accepted' | 'declined';

export interface Friendship {
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  created_at: string;
  responded_at: string | null;
}
/** Une relation vue depuis MOI : qui est l'autre, et de quel côté vient la demande. */
/** DÉFINITION d'un défi partagé + son invitation (table `shared_challenges`).
 *  Ce n'est PAS un défi : chaque ami garde le sien, relié par `challenges.shared_id`. */
export interface SharedChallenge {
  id: string;
  created_by: string;
  invited_user: string;
  exercise_id: string;
  exercise_name: string;
  muscle_primary: string | null;
  rep_weight: number | null;
  unit: 'reps' | 'time' | 'distance';
  format: ChallengeFormat;
  duration_days: number;
  start_date: string;
  config: ChallengeConfig;
  same_targets: boolean;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface FriendView {
  userId: string;
  pseudo: string;
  status: FriendStatus;
  incoming: boolean; // true = c'est l'autre qui m'a demandé
  since: string;
}

export class PseudoNotFoundError extends Error {
  constructor() {
    super('Aucun aventurier avec ce pseudo.');
    this.name = 'PseudoNotFoundError';
  }
}
export class AlreadyLinkedError extends Error {
  constructor() {
    super('Une demande existe déjà avec cette personne.');
    this.name = 'AlreadyLinkedError';
  }
}

const COLS = 'requester_id, addressee_id, status, created_at, responded_at';

// Acceptations DÉJÀ VUES. Volontairement en localStorage plutôt qu'en base : une
// notification est un état d'affichage éphémère, pas une donnée métier — l'alternative
// (colonne « vu par le demandeur ») imposerait une policy d'écriture de plus sur
// friendships pour un gain nul. Contrepartie assumée : le « vu » est par appareil.
const SEEN_KEY = 'muscu:friends:seen';
function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export const useFriendsStore = defineStore('friends', () => {
  const links = ref<Friendship[]>([]);
  const pseudos = ref<Record<string, string>>({}); // user_id → pseudo
  const shared = ref<SharedChallenge[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const me = ref<string | null>(null);
  const seen = ref<Set<string>>(readSeen());

  /** Relations vues depuis moi (l'« autre » côté résolu, pseudo inclus). */
  const views = computed<FriendView[]>(() =>
    links.value.map((l) => {
      const incoming = l.addressee_id === me.value;
      const userId = incoming ? l.requester_id : l.addressee_id;
      return {
        userId,
        pseudo: pseudos.value[userId] ?? '?',
        status: l.status,
        incoming,
        since: l.responded_at ?? l.created_at,
      };
    }),
  );
  const accepted = computed(() => views.value.filter((v) => v.status === 'accepted'));
  /** Demandes REÇUES en attente (celles sur lesquelles on peut agir). */
  const incoming = computed(() => views.value.filter((v) => v.status === 'pending' && v.incoming));
  /** Demandes ENVOYÉES en attente. */
  const outgoing = computed(() => views.value.filter((v) => v.status === 'pending' && !v.incoming));
  /** MES demandes qui viennent d'être acceptées et que je n'ai pas encore vues. */
  const newlyAccepted = computed(() =>
    views.value.filter((v) => v.status === 'accepted' && !v.incoming && !seen.value.has(v.userId)),
  );
  /** Total à traiter ou à annoncer (badge de la cloche). */
  /** Propositions de défi partagé REÇUES et pas encore tranchées. */
  const sharedInvites = computed(() =>
    shared.value.filter((s) => s.status === 'pending' && s.invited_user === me.value),
  );
  const notifCount = computed(
    () => incoming.value.length + newlyAccepted.value.length + sharedInvites.value.length,
  );

  /** Acquitte les acceptations. On REMPLACE l'ensemble par les amis actuels : les
   *  entrées d'ex-amis disparaissent, donc un ré-ajout notifiera de nouveau. */
  function markAcceptedSeen() {
    seen.value = new Set(accepted.value.map((v) => v.userId));
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.value]));
    } catch {
      /* stockage indisponible → on renotifiera, sans gravité */
    }
  }

  async function fetchMine(userId: string) {
    me.value = userId;
    loading.value = true;
    try {
      // La RLS ne renvoie que MES relations : pas de filtre client nécessaire.
      const { data, error } = await supabase.from('friendships').select(COLS);
      if (error) throw error;
      links.value = data ?? [];
      const { data: ps, error: e2 } = await supabase.rpc('friend_pseudos');
      if (e2) throw e2;
      pseudos.value = Object.fromEntries(
        ((ps ?? []) as { user_id: string; pseudo: string }[]).map((p) => [p.user_id, p.pseudo]),
      );
      loaded.value = true;
      return links.value;
    } finally {
      loading.value = false;
    }
  }

  /** Cherche un aventurier par pseudo EXACT (insensible à la casse). */
  async function findByPseudo(pseudo: string): Promise<{ user_id: string; pseudo: string }> {
    const { data, error } = await supabase.rpc('find_friend_by_pseudo', { p: pseudo });
    if (error) throw error;
    const row = ((data ?? []) as { user_id: string; pseudo: string }[])[0];
    if (!row) throw new PseudoNotFoundError();
    return row;
  }

  /** Envoie une demande. 23505 = relation déjà existante (dans un sens ou l'autre). */
  async function request(userId: string, targetId: string) {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: targetId, status: 'pending' });
    if (error) {
      if (error.code === '23505') throw new AlreadyLinkedError();
      throw error;
    }
    await fetchMine(userId);
  }

  /** Répond à une demande reçue (seul le destinataire y est autorisé, cf. RLS). */
  async function respond(userId: string, requesterId: string, accept: boolean) {
    const { error } = await supabase
      .from('friendships')
      .update({
        status: accept ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('requester_id', requesterId)
      .eq('addressee_id', userId);
    if (error) throw error;
    await fetchMine(userId);
  }

  /** Retire un ami / annule une demande (les deux parties peuvent supprimer). */
  async function remove(userId: string, otherId: string) {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),` +
          `and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
      );
    if (error) throw error;
    await fetchMine(userId);
  }

  /** Entraînement d'un ami — lecture autorisée par la RLS, pas par ce code. */
  /** Entraînement de TOUS les amis en 2 requêtes, pour le fil d'activité.
   *  Aucune table dédiée : on relit les défis que les policies `*_read_friends`
   *  autorisent déjà, et `buildFriendFeed` en dérive les événements. */
  async function fetchShared(userId: string) {
    me.value = userId;
    const { data, error } = await supabase
      .from('shared_challenges')
      .select('*')
      .or('created_by.eq.' + userId + ',invited_user.eq.' + userId);
    if (error) throw error;
    shared.value = (data ?? []) as SharedChallenge[];
  }

  /** Propose SON défi à un ami. On n'écrit QUE la définition : les RLS sont own-only
   *  en insertion, donc c'est le client de l'ami qui créera ensuite son propre défi. */
  async function proposeShared(
    userId: string,
    friendId: string,
    ch: Challenge,
  ): Promise<SharedChallenge> {
    const { data, error } = await supabase
      .from('shared_challenges')
      .insert({
        created_by: userId,
        invited_user: friendId,
        exercise_id: ch.exercise_id,
        exercise_name: ch.exercise_name,
        muscle_primary: ch.muscle_primary ?? null,
        rep_weight: ch.rep_weight ?? null,
        unit: ch.unit,
        format: ch.format,
        duration_days: ch.duration_days,
        config: ch.config,
        start_date: ch.start_date,
        same_targets: true, // v1 : mêmes objectifs des deux côtés
      })
      .select('*')
      .single();
    if (error) throw error;
    shared.value.push(data as SharedChallenge);
    return data as SharedChallenge;
  }

  /** Le défi JUMEAU de l'ami sur la même définition partagée. Lisible grâce à
   *  `challenges_read_friends` (migr. 0058) — aucune policy supplémentaire. */
  async function fetchSharedPeer(
    sharedId: string,
    myId: string,
  ): Promise<(Challenge & { user_id: string }) | null> {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('shared_id', sharedId)
      .neq('user_id', myId)
      .limit(1);
    if (error) throw error;
    return ((data ?? [])[0] as (Challenge & { user_id: string }) | undefined) ?? null;
  }

  async function respondShared(id: string, accept: boolean) {
    const { error } = await supabase
      .from('shared_challenges')
      .update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    const row = shared.value.find((s) => s.id === id);
    if (row) row.status = accept ? 'accepted' : 'declined';
  }

  async function fetchFeed(): Promise<FriendTraining[]> {
    const ids = accepted.value.map((v) => v.userId);
    if (!ids.length) return [];
    const [ch, co] = await Promise.all([
      supabase.from('challenges').select('*').in('user_id', ids),
      supabase.from('combo_challenges').select('*').in('user_id', ids),
    ]);
    if (ch.error) throw ch.error;
    if (co.error) throw co.error;
    const byId = new Map<string, FriendTraining>(
      accepted.value.map((v) => [
        v.userId,
        { userId: v.userId, pseudo: v.pseudo, challenges: [], combos: [] },
      ]),
    );
    for (const r of (ch.data ?? []) as (Challenge & RowStamps & { user_id: string })[])
      byId.get(r.user_id)?.challenges.push(r);
    for (const r of (co.data ?? []) as (ComboChallenge & RowStamps & { user_id: string })[])
      byId.get(r.user_id)?.combos.push(r);
    return [...byId.values()];
  }

  async function fetchFriendTraining(friendId: string) {
    const [ch, co] = await Promise.all([
      supabase.from('challenges').select('*').eq('user_id', friendId),
      supabase.from('combo_challenges').select('*').eq('user_id', friendId),
    ]);
    if (ch.error) throw ch.error;
    if (co.error) throw co.error;
    return {
      challenges: (ch.data ?? []) as Challenge[],
      combos: (co.data ?? []) as ComboChallenge[],
    };
  }

  return {
    links,
    pseudos,
    loading,
    loaded,
    views,
    accepted,
    incoming,
    outgoing,
    newlyAccepted,
    notifCount,
    markAcceptedSeen,
    fetchMine,
    findByPseudo,
    request,
    respond,
    remove,
    fetchFriendTraining,
    fetchFeed,
    shared,
    sharedInvites,
    fetchShared,
    proposeShared,
    respondShared,
    fetchSharedPeer,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFriendsStore, import.meta.hot));
}
