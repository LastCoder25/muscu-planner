// Store BOSS ENTRE AMIS — lecture et actions. Toutes les règles vivent en BASE (fonctions
// SECURITY DEFINER de la migration 0067) : ce store ne fait que router les appels et
// ranger les lignes. La lib `friendBoss.ts` sert à AFFICHER ce que le serveur décide.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import {
  bossFromRow,
  bossPhase,
  bossErrorMessage,
  bossTokenCost,
  type BossFamily,
  type FriendBoss,
  type FriendBossHit,
  type FriendBossMember,
} from '@/lib/friendBoss';
import { parseHeroLook, sameLook, type HeroLook } from '@/lib/heroLook';

/** Erreur lisible : le code du serveur traduit en français. */
export class FriendBossError extends Error {
  constructor(code: string) {
    super(bossErrorMessage(code));
    this.name = 'FriendBossError';
  }
}

const errCode = (e: unknown): string =>
  e && typeof e === 'object' && 'message' in e ? String(e.message) : '';

export const useFriendBossStore = defineStore('friendBoss', () => {
  const bosses = ref<FriendBoss[]>([]);
  const members = ref<FriendBossMember[]>([]);
  const hits = ref<FriendBossHit[]>([]);
  const loaded = ref(false);
  const uid = computed(() => useAuthStore().user?.id ?? null);

  async function fetchMine() {
    const me = uid.value;
    if (!me) {
      bosses.value = [];
      members.value = [];
      hits.value = [];
      return;
    }
    // ⚠️ FILTRE EXPLICITE : la RLS borne ce qu'on a le DROIT de lire (tous les boss dont
    // on est membre), jamais ce qu'on VEUT lire. On part de MES adhésions.
    const { data: mine, error } = await supabase
      .from('friend_boss_members')
      .select('boss_id')
      .eq('user_id', me);
    if (error) throw error;
    const ids = [...new Set((mine ?? []).map((r) => r.boss_id as string))];
    if (!ids.length) {
      bosses.value = [];
      members.value = [];
      hits.value = [];
      loaded.value = true;
      return;
    }
    const [b, m, h] = await Promise.all([
      supabase.from('friend_bosses').select('*').in('id', ids),
      supabase.from('friend_boss_members').select('*').in('boss_id', ids),
      supabase.from('friend_boss_hits').select('*').in('boss_id', ids),
    ]);
    if (b.error) throw b.error;
    if (m.error) throw m.error;
    if (h.error) throw h.error;
    bosses.value = (b.data ?? []).map(bossFromRow).sort((x, y) => y.createdAt - x.createdAt);
    members.value = (m.data ?? []).map((r) => ({
      bossId: r.boss_id,
      userId: r.user_id,
      pseudo: r.pseudo,
      status: r.status,
      units: r.units,
      claimed: r.claimed,
      look: parseHeroLook(r.look),
    }));
    hits.value = (h.data ?? []).map((r) => ({
      id: r.id,
      bossId: r.boss_id,
      userId: r.user_id,
      units: r.units,
      createdAt: Date.parse(r.created_at) || 0,
    }));
    loaded.value = true;
  }

  const myMembership = (bossId: string) =>
    members.value.find((m) => m.bossId === bossId && m.userId === uid.value) ?? null;

  /** Les boss que je mène ou ai rejoints et qui ne sont pas terminés (plusieurs depuis les
   *  jetons 🎫, un seul par exercice), du plus récent au plus ancien. */
  function inProgress(now: number): FriendBoss[] {
    return bosses.value.filter((b) => {
      const p = bossPhase(b, now);
      return (p === 'recruiting' || p === 'active') && myMembership(b.id)?.status === 'accepted';
    });
  }

  /** Invitations sur lesquelles je peux encore agir. */
  function invitations(now: number): FriendBoss[] {
    return bosses.value.filter(
      (b) => myMembership(b.id)?.status === 'invited' && bossPhase(b, now) === 'recruiting',
    );
  }

  /** Mes saisies (pour le décompte des jours actifs). */
  const myHits = computed(() => hits.value.filter((h) => h.userId === uid.value));

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new FriendBossError(errCode(error));
    return data as T;
  }

  async function declare(
    ex: { id: string; name: string; family: BossFamily; repWeight: number },
    invitees: string[],
    tier: string,
  ) {
    await rpc<string>('fboss_declare', {
      p_exercise_id: ex.id,
      p_exercise_name: ex.name,
      p_family: ex.family,
      p_rep_weight: ex.repWeight,
      p_invitees: invitees,
      // ⚠️ Le CRAN part au serveur, qui en dérive les PV et les plafonds : l'écran ne fait
      // que l'annoncer. Un cran inconnu est REFUSÉ côté base (`bad_tier`), jamais replié en
      // silence — sinon l'écran promettrait un volume que le serveur n'appliquerait pas.
      p_tier: tier,
    });
    // Le serveur a dépensé les jetons : on le reflète avant qu'un gain ne réécrive l'ancienne réserve.
    useCharacterStore().spentBossTokens(bossTokenCost(tier));
    await fetchMine();
  }

  async function respond(bossId: string, accept: boolean) {
    await rpc('fboss_respond', { p_boss: bossId, p_accept: accept });
    await fetchMine();
  }

  /** Frappe : le serveur retient ce qui passe les plafonds et rend ce qu'il a accepté. */
  async function hit(
    bossId: string,
    units: number,
  ): Promise<{ accepted: number; defeated: boolean }> {
    const res = await rpc<{ ok: boolean; accepted?: number; defeated?: boolean; reason?: string }>(
      'fboss_hit',
      { p_boss: bossId, p_units: Math.floor(units) },
    );
    if (!res.ok) throw new FriendBossError(res.reason ?? '');
    await fetchMine();
    return { accepted: res.accepted ?? 0, defeated: !!res.defeated };
  }

  /** Dépose l'apparence de mon héros sur mes adhésions en cours (migr. 0072), pour que les
   *  amis me voient dans la scène. N'écrit rien si elle n'a pas changé. */
  async function setLook(look: HeroLook, now: number) {
    const me = uid.value;
    if (!me) return;
    const mine = members.value.filter((m) => {
      if (m.userId !== me) return false;
      const b = bosses.value.find((x) => x.id === m.bossId);
      if (!b) return false;
      const p = bossPhase(b, now);
      return p === 'recruiting' || p === 'active';
    });
    if (!mine.length || mine.every((m) => sameLook(m.look, look))) return;
    await rpc('fboss_set_look', { p_look: look });
    for (const m of mine) m.look = look;
  }

  /** Réclame son coffre : le serveur vérifie qu'il est dû (boss mort, part minimale) et le
   *  marque pris. Le contenu est tiré côté client (`friendBossChest`). */
  async function claim(bossId: string) {
    const res = await rpc<{ ok: boolean; reason?: string }>('fboss_claim', { p_boss: bossId });
    if (!res.ok) throw new FriendBossError(res.reason ?? '');
    const m = myMembership(bossId);
    if (m) m.claimed = true;
  }

  return {
    bosses,
    members,
    hits,
    loaded,
    myHits,
    myMembership,
    inProgress,
    invitations,
    fetchMine,
    declare,
    respond,
    hit,
    claim,
    setLook,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFriendBossStore, import.meta.hot));
}
