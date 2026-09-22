// Ce qu'une carte d'entrée dit du BOSS ENTRE AMIS : l'invitation d'abord, puis un coffre à
// ouvrir, puis le combat en cours. Partagé par la page Amis et l'accueil — une seule
// définition, sinon les deux cartes finiraient par annoncer des choses différentes.
import { computed, ref } from 'vue';
import { useFriendBossStore } from '@/stores/friendBoss';
import { useCharacterStore } from '@/stores/character';
import {
  bossEndsAt,
  bossPhase,
  bossStartAt,
  chestState,
  fmtBossPv,
  fmtBossSpan,
} from '@/lib/friendBoss';

export function useFriendBossEntry() {
  const boss = useFriendBossStore();
  const char = useCharacterStore();
  const now = ref(Date.now());

  const invites = computed(() => boss.invitations(now.value));
  /** Un coffre de boss attend-il d'être ouvert ? (sans personnage chargé, on ne sait pas.) */
  const chestWaiting = computed(() => {
    const cleared = char.row?.cleared_dungeons;
    return (
      !!cleared &&
      boss.bosses.some((b) => chestState(b, boss.myMembership(b.id), cleared) !== 'none')
    );
  });
  const running = computed(() => boss.inProgress(now.value));
  const current = computed(() => running.value[0] ?? null);
  /** Plusieurs boss en cours : on annonce le plus récent, et combien d'autres attendent. */
  const more = computed(() =>
    running.value.length > 1 ? ` · +${running.value.length - 1} autre(s)` : '',
  );

  const line = computed(() => {
    const inv = invites.value[0];
    if (inv)
      return `⚔️ Invité : « ${inv.exerciseName} » — réponds dans ${fmtBossSpan(bossStartAt(inv) - now.value)}`;
    if (chestWaiting.value) return '🎁 Ton coffre de boss t’attend — viens l’ouvrir.';
    const cur = current.value;
    if (!cur) return 'Lance un boss et abats-le avec tes amis, rep après rep.';
    const pv = Math.max(0, cur.hpTotal - cur.damage);
    return bossPhase(cur, now.value) === 'recruiting'
      ? `« ${cur.exerciseName} » — démarre dans ${fmtBossSpan(bossStartAt(cur) - now.value)}${more.value}`
      : `« ${cur.exerciseName} » — ${fmtBossPv(pv)} PV, encore ${fmtBossSpan(bossEndsAt(cur) - now.value)}${more.value}`;
  });

  /** Il se passe quelque chose : une invitation, un coffre ou un boss en cours. */
  const active = computed(() => invites.value.length > 0 || chestWaiting.value || !!current.value);
  /** Une action attend le joueur (invitation ou coffre) : la carte se met en avant. */
  const hot = computed(() => invites.value.length > 0 || chestWaiting.value);

  async function refresh() {
    now.value = Date.now();
    // Le coffre se lit sur le personnage : sans lui, la carte le tairait.
    await Promise.all([boss.fetchMine(), char.loaded ? null : char.fetchMine()]);
  }

  return { invites, chestWaiting, line, active, hot, refresh };
}
