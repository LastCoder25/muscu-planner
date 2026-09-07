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
import type { Challenge } from '@/lib/challenges';
import type { ComboChallenge } from '@/lib/combo';

export type FriendStatus = 'pending' | 'accepted' | 'declined';

export interface Friendship {
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  created_at: string;
  responded_at: string | null;
}
/** Une relation vue depuis MOI : qui est l'autre, et de quel côté vient la demande. */
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

export const useFriendsStore = defineStore('friends', () => {
  const links = ref<Friendship[]>([]);
  const pseudos = ref<Record<string, string>>({}); // user_id → pseudo
  const loading = ref(false);
  const loaded = ref(false);
  const me = ref<string | null>(null);

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
    fetchMine,
    findByPseudo,
    request,
    respond,
    remove,
    fetchFriendTraining,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFriendsStore, import.meta.hot));
}
