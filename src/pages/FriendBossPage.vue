<template>
  <component :is="embedded ? 'div' : 'q-page'" class="fb-page" :class="{ embedded }">
    <header class="fb-head">
      <button class="fb-back" aria-label="Retour" @click="backOr(router, '/friends')">‹</button>
      <h1 class="fb-title font-display">🐉 Boss entre amis</h1>
    </header>

    <div v-if="!loaded" class="fb-empty"><q-spinner color="primary" size="28px" /></div>

    <template v-else>
      <!-- 🎫 La réserve de jetons : ce qu'on peut encore lancer ou rejoindre. -->
      <div class="fb-tokens">
        <span class="fb-tok-n font-display">🎫 {{ tokens }}</span>
        <span class="fb-dim"
          >/ {{ BOSS_TOKENS.stockMax }} jetons · gagnés par le sport : 1 dès
          {{ BOSS_TOKENS.firstAt }} XP dans la journée, 2 dès {{ BOSS_TOKENS.secondAt }}. Lancer
          coûte le prix du cran ; rejoindre est gratuit.</span
        >
      </div>

      <!-- ── INVITATIONS : la seule chose urgente (24 h pour répondre) ───────────── -->
      <section v-for="b in invitations" :key="'inv-' + b.id" class="fb-card invite">
        <div class="fb-inv-t">
          <b>{{ ownerPseudo(b) }}</b> t’invite à abattre un boss en
          <b>{{ b.exerciseName }}</b>
        </div>
        <div class="fb-inv-s">
          {{ bossTier(b.tier).emoji }} {{ bossTier(b.tier).label }} ·
          {{ BOSS_FAMILY_LABEL[b.family].emoji }} ta part :
          {{ bossShareUnits(b.family, b.tier) }}
          {{ bossUnitLabel(b.family) }} sur 7 jours · réponds dans
          {{ fmtBossSpan(bossStartAt(b) - now) }}
        </div>
        <div class="fb-inv-s">
          🎁 Coffre ×{{ tierRewardMult(bossTier(b.tier)).toFixed(1) }} + trophée<template
            v-if="bossTier(b.tier).tickets"
          >
            · 🎟️ {{ bossTier(b.tier).tickets }}</template
          >
          — si le boss tombe et que tu as fait la moitié de ta part
        </div>
        <div class="fb-inv-s">👥 {{ inviteGroup(b) }}</div>
        <div v-if="inviteBlock(b)" class="fb-inv-s warn">
          {{ bossErrorMessage(inviteBlock(b)!) }}
        </div>
        <div class="fb-acts">
          <button class="fb-btn" :disabled="busy || !!inviteBlock(b)" @click="doRespond(b, true)">
            Rejoindre · gratuit
          </button>
          <button class="fb-btn ghost" :disabled="busy" @click="doRespond(b, false)">
            Refuser
          </button>
        </div>
      </section>

      <!-- ── BOSS EN COURS ─────────────────────────────────────────────────────── -->
      <!-- Plusieurs boss à la fois depuis les jetons : un par exercice. On en regarde un. -->
      <div v-if="running.length > 1" class="fb-pick" role="tablist">
        <button
          v-for="b in running"
          :key="b.id"
          role="tab"
          class="fb-pick-b"
          :class="{ on: current?.id === b.id }"
          :aria-selected="current?.id === b.id"
          @click="selectedId = b.id"
        >
          {{ bossEmoji(b.id) }} {{ b.exerciseName }}
          <span class="fb-dim">{{ bossTier(b.tier).emoji }}</span>
        </button>
      </div>
      <section v-if="current" class="fb-card boss">
        <div class="fb-boss-s">
          <template v-if="phase === 'recruiting'">
            ⏳ Démarre dans {{ fmtBossSpan(bossStartAt(current) - now) }} — {{ answered }}/{{
              invitedCount
            }}
            réponse{{ invitedCount > 1 ? 's' : '' }}
          </template>
          <template v-else-if="phase === 'defeated'">💀 Vaincu !</template>
          <template v-else>⚔️ Encore {{ fmtBossSpan(bossEndsAt(current) - now) }}</template>
          <span class="fb-dim">
            · {{ bossTier(current.tier).emoji }} {{ bossTier(current.tier).label }} · 1
            {{ unitSingular }} = {{ fmtBossPv(FRIEND_BOSS.damagePerUnit) }} dégâts</span
          >
        </div>

        <FriendBossStage
          ref="stage"
          :boss-name="current.exerciseName"
          :boss-emoji="bossEmoji(current.id)"
          :boss-art="friendBossArt(current.id)"
          :family-emoji="BOSS_FAMILY_LABEL[current.family].emoji"
          :family-name="BOSS_FAMILY_LABEL[current.family].name"
          :hp-total="current.hpTotal"
          :hp-left="hpLeft"
          :hold="busy"
          :allies="allies"
        />

        <!-- Frapper : ce que le serveur acceptera est annoncé AVANT l'envoi. -->
        <div v-if="phase === 'active' && isMember" class="fb-hit">
          <div class="fb-hit-row">
            <button class="fb-step" aria-label="Moins" @click="step(-1)">−</button>
            <input
              v-model.number="amount"
              class="fb-input font-display"
              type="number"
              inputmode="numeric"
              min="1"
              :aria-label="'Nombre de ' + bossUnitLabel(current.family)"
            />
            <button class="fb-step" aria-label="Plus" @click="step(1)">＋</button>
            <button class="fb-btn big" :disabled="busy || accepted <= 0" @click="doHit">
              Frapper
            </button>
          </div>
          <div class="fb-hint">
            <template v-if="accepted < amount">
              Seulement <b>{{ accepted }}</b> compteront (≤ {{ perHit }} par saisie, et ce qu’il
              reste de PV).
            </template>
            <template v-else>
              ≤ {{ perHit }} {{ bossUnitLabel(current.family) }} par saisie · pas de plafond par
              jour
            </template>
          </div>
        </div>
        <p v-else-if="phase === 'recruiting'" class="fb-hint">
          On frappe dès le démarrage : à la fin des 24 h, ou plus tôt si tout le monde a répondu.
        </p>

        <!-- Le groupe : chacun voit ce que les autres apportent (le regard des amis fait
             partie du garde-fou, la saisie étant déclarative). -->
        <div class="fb-sec-t">Le groupe</div>
        <div v-for="m in groupRows" :key="m.userId" class="fb-member" :class="m.status">
          <span class="fb-m-n">{{ m.pseudo }}{{ m.userId === uid ? ' (toi)' : '' }}</span>
          <template v-if="m.status === 'accepted'">
            <span class="fb-m-bar"
              ><span class="fb-m-fill" :style="{ width: sharePct(m.units) + '%' }" /><span
                class="fb-m-min"
            /></span>
            <span
              class="fb-m-u"
              :class="{ ok: metMinShare(current.family, m.units, current.tier) }"
              >{{ m.units }}</span
            >
          </template>
          <span v-else class="fb-m-st">{{ m.status === 'invited' ? 'invité' : 'a refusé' }}</span>
        </div>
        <p class="fb-hint">
          La barre = ta part ({{ bossShareUnits(current.family, current.tier) }}), le trait = la
          moitié à apporter pour le coffre.
        </p>

        <div v-if="hitDays.length" class="fb-sec-t">Frappes</div>
        <!-- ⚠️ GROUPÉES PAR JOUR (demande de l'utilisateur) : une journée de combat, c'est
             souvent six ou sept frappes en rafale — la liste à plat noyait le total du jour
             dans le détail. Le total mène, le détail se déplie. -->
        <template v-for="d in hitDays" :key="d.day">
          <button
            type="button"
            class="fb-day"
            :aria-expanded="openDays.has(d.day)"
            @click="toggleDay(d.day)"
          >
            <span class="mf-chev" :class="{ open: openDays.has(d.day) }">▸</span>
            <b>{{ dayLabel(d.at) }}</b>
            <span class="fb-day-tot">+{{ d.total }} {{ bossUnitLabel(current.family) }}</span>
            <span class="fb-dim">−{{ fmtBossPv(bossDamage(d.total)) }} PV</span>
            <span v-if="d.hits.length > 1" class="fb-dim">· {{ d.hits.length }} frappes</span>
          </button>
          <div v-if="openDays.has(d.day)" class="fb-day-detail">
            <div v-for="h in d.hits" :key="h.id" class="fb-log">
              <b>{{ pseudoOf(h.userId) }}</b> +{{ h.units }} {{ bossUnitLabel(current.family) }}
              <span class="fb-dim">(−{{ fmtBossPv(bossDamage(h.units)) }} PV)</span>
              <span class="fb-dim">· il y a {{ fmtBossSpan(now - h.createdAt) }}</span>
            </div>
          </div>
        </template>
      </section>

      <!-- ── LANCER UN BOSS ────────────────────────────────────────────────────── -->
      <!-- ⚠️ Pendant le délai de relance, on ne propose RIEN à lancer : seul le message orange
           dit quand on pourra (demandé). Le formulaire d'un boss qu'on ne peut pas lancer
           se lisait comme une action disponible. -->
      <button
        v-if="current && !launchOpen && !launchWait"
        class="fb-btn ghost big wide fb-more"
        @click="launchOpen = true"
      >
        ＋ Lancer un autre boss
      </button>
      <section v-if="!current || launchOpen || launchWait" class="fb-card">
        <div class="fb-sec-t first">Lancer un boss</div>
        <p v-if="launchWait" class="fb-hint warn">
          Tu pourras lancer un nouveau boss dans {{ fmtBossSpan(launchWait - now) }} (48 h après la
          fin du dernier que tu as lancé). En attendant, tu peux rejoindre celui d’un ami.
        </p>
        <!-- Lancer exige l'Autel des boss (le serveur le vérifie aussi, migr. 0071) ;
             rejoindre l'invitation d'un ami, non. -->
        <template v-else-if="!hasAltar">
          <p class="fb-hint">
            🔮 Pour lancer un boss, construis d’abord l’<b>Autel des boss</b> dans ta base. Tu peux
            déjà rejoindre le boss d’un ami quand il t’invite.
          </p>
          <button class="fb-btn big wide" @click="router.push('/aventure?tab=base')">
            Aller à ma base
          </button>
        </template>
        <template v-else>
          <p class="fb-hint">
            Choisis un exercice au poids du corps et invite jusqu’à {{ FRIEND_BOSS.maxInvites }}
            amis. Chaque participant ajoute sa part de PV ; une rep =
            {{ fmtBossPv(FRIEND_BOSS.damagePerUnit) }} dégâts. 7 jours pour l’abattre.
          </p>
          <input
            v-model="exoQuery"
            class="fb-search"
            type="search"
            placeholder="Chercher un exercice…"
            autocomplete="off"
          />
          <div class="fb-exos">
            <button
              v-for="e in exoChoices"
              :key="e.id"
              class="fb-exo"
              :class="{ on: pickedExo?.id === e.id }"
              :disabled="takenExo.has(e.id)"
              @click="pickedExo = e"
            >
              <span>{{ BOSS_FAMILY_LABEL[e.family].emoji }} {{ e.name }}</span>
              <span class="fb-dim">{{
                takenExo.has(e.id)
                  ? 'déjà un boss en cours'
                  : `${bossShareUnits(e.family, pickedTier)} ${bossUnitLabel(e.family)}/pers.`
              }}</span>
            </button>
          </div>

          <!-- Le cran fixe le VOLUME par personne, et la récompense monte plus vite que lui :
               chaque tuile annonce donc les deux, pour que le choix se fasse en connaissance
               de cause plutôt qu'au nom. -->
          <div class="fb-sec-t">Difficulté</div>
          <div class="fb-tiers">
            <button
              v-for="t in BOSS_TIERS"
              :key="t.id"
              class="fb-tier"
              :class="{ on: pickedTier === t.id }"
              @click="pickedTier = t.id"
            >
              <span class="fb-tier-e">{{ t.emoji }}</span>
              <span class="fb-tier-n">{{ t.label }}</span>
              <span class="fb-tier-v">{{
                pickedExo
                  ? `${bossShareUnits(pickedExo.family, t.id)} ${bossUnitLabel(pickedExo.family)}`
                  : `×${t.mult}`
              }}</span>
              <span class="fb-tier-r">🎁 ×{{ tierRewardMult(t).toFixed(1) }}</span>
              <span class="fb-tier-r">{{ t.tickets ? `🎟️ ${t.tickets}` : '🎟️ —' }}</span>
              <span class="fb-tier-r" :class="{ short: t.tokens > tokens }"
                >coûte {{ t.tokens }} 🎫</span
              >
            </button>
          </div>
          <p class="fb-hint">
            La difficulté fixe le nombre de
            {{ pickedExo ? bossUnitLabel(pickedExo.family) : 'reps' }} <b>par personne</b>. La
            récompense monte <b>plus vite</b> que l’effort : un boss dur paie mieux que plusieurs
            faciles, en or, en pierres et en chances sur le trophée. Chaque cran au-dessus de
            l’Échauffement donne aussi des <b>🎟️ tickets d’invocation</b>.
          </p>

          <div class="fb-sec-t">Inviter ({{ invitees.size }}/{{ FRIEND_BOSS.maxInvites }})</div>
          <p v-if="!friends.accepted.length" class="fb-hint">
            Pas encore d’ami — tu peux combattre seul, ou ajouter des amis depuis la page Amis.
          </p>
          <label v-for="f in friends.accepted" :key="f.userId" class="fb-friend">
            <input
              type="checkbox"
              :checked="invitees.has(f.userId)"
              :disabled="!invitees.has(f.userId) && invitees.size >= FRIEND_BOSS.maxInvites"
              @change="toggleInvite(f.userId)"
            />
            <span>{{ f.pseudo }}</span>
          </label>

          <p v-if="declareBlock && declareBlock !== 'cooldown'" class="fb-hint warn">
            {{ bossErrorMessage(declareBlock) }}
          </p>
          <button
            class="fb-btn big wide"
            :disabled="!pickedExo || busy || !!declareBlock"
            @click="doDeclare"
          >
            <template v-if="pickedExo">
              Lancer · {{ bossTokenCost(pickedTier) }} 🎫 ·
              {{ fmtBossPv(bossHpTotal(pickedExo.family, 1, pickedTier)) }} PV
              {{
                invitees.size
                  ? `(+${fmtBossPv(bossHpTotal(pickedExo.family, 1, pickedTier))} par ami qui rejoint)`
                  : ''
              }}
            </template>
            <template v-else>Choisis un exercice</template>
          </button>
        </template>
      </section>

      <!-- ── RÉSULTAT d'un boss qu'on vient d'abattre (après son animation de mort) ── -->
      <q-dialog
        :model-value="!!victory"
        persistent
        @update:model-value="(v) => !v && closeVictory()"
      >
        <div v-if="victory" class="fb-victory">
          <div class="fb-v-emo">🏆</div>
          <div class="fb-v-title font-display">Le boss est tombé !</div>
          <div class="fb-v-sub">
            {{ victory.exerciseName }} · {{ bossTier(victory.tier).emoji }}
            {{ bossTier(victory.tier).label }}
          </div>
          <div class="fb-v-line">
            Tu as apporté <b>{{ store.myMembership(victory.id)?.units ?? 0 }}</b>
            {{ bossUnitLabel(victory.family) }}
          </div>
          <div v-if="victoryChest" class="fb-v-loot">
            <div class="fb-v-loot-t">Ton butin</div>
            <div>🏆 {{ victoryChest.trophy.name }} · {{ gradeLabel(victoryChest.trophy) }}</div>
            <div>
              🪙 +{{ victoryChest.gold }} · 🔮 +{{ victoryChest.stones
              }}<template v-if="victoryChest.tickets"> · 🎟️ +{{ victoryChest.tickets }}</template>
            </div>
            <div class="fb-dim">Trophée rangé dans ton sac à trophées</div>
          </div>
          <template v-else-if="chestOf(victory) !== 'none'">
            <div class="fb-v-line fb-dim">Ton coffre t’attend : or, pierres et un trophée.</div>
            <button
              class="fb-btn big fb-chest"
              :disabled="busy || !progress.ready.value"
              @click="openVictoryChest"
            >
              🎁 Ouvrir le coffre
            </button>
          </template>
          <div v-else class="fb-v-line fb-dim">
            Pas de coffre : il fallait apporter au moins la moitié de ta part.
          </div>
          <button class="fb-btn fb-v-close" :disabled="busy" @click="closeVictory">Fermer</button>
        </div>
      </q-dialog>

      <!-- ── BOSS PASSÉS ───────────────────────────────────────────────────────── -->
      <section v-if="past.length" class="fb-sec">
        <div class="fb-sec-t">Boss passés</div>
        <div v-for="b in past" :key="b.id" class="fb-past">
          <span class="fb-emo fb-emo-past">{{ b.defeatedAt ? '🏆' : '💨' }}</span>
          <span class="fb-past-main">
            <b>{{ b.exerciseName }}</b>
            <span class="fb-dim">
              {{ bossTier(b.tier).emoji }} {{ bossTier(b.tier).label }} ·
              {{ b.defeatedAt ? 'abattu' : 'a survécu' }} · tu as apporté
              {{ store.myMembership(b.id)?.units ?? 0 }} {{ bossUnitLabel(b.family) }}
            </span>
          </span>
          <button
            v-if="chestOf(b) !== 'none'"
            class="fb-btn fb-chest"
            :disabled="busy || !progress.ready.value"
            @click="doOpenChest(b)"
          >
            🎁 {{ chestOf(b) === 'recover' ? 'Récupérer' : 'Ouvrir' }}
          </button>
        </div>
      </section>
    </template>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { localDayIso } from '@/lib/localDay';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { backOr } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import { useFriendBossStore, FriendBossError } from '@/stores/friendBoss';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useBossTokenAccrual } from '@/composables/useBossTokenAccrual';
import { fxRarity, gradeLabel } from '@/lib/items';
import { bossAltarBuilt } from '@/lib/buildings';
import { computeCharacter } from '@/lib/character';
import { heroLook, type HeroLook } from '@/lib/heroLook';
import FriendBossStage, { type StageAlly } from '@/components/FriendBossStage.vue';
import { useGameFx } from '@/composables/useGameFx';
import { repWeightFromExercise } from '@/lib/challenges';
import {
  FRIEND_BOSS,
  BOSS_FAMILY_LABEL,
  BOSS_TIERS,
  BOSS_TIER_DEFAULT,
  BOSS_TOKENS,
  bossErrorMessage,
  bossJoinBlocker,
  bossLaunchBlocker,
  nextDeclareAt,
  bossTokenCost,
  bossShareUnits,
  bossTier,
  type BossTier,
  acceptedUnits,
  bossEndsAt,
  bossEmoji,
  bossFamily,
  bossDamage,
  strikesToReplay,
  bossHpTotal,
  bossPhase,
  bossStartAt,
  bossUnitLabel,
  bossHitsByDay,
  bossUnitsLeft,
  chestState,
  fmtBossPv,
  fmtBossSpan,
  friendBossChest,
  isBossExercise,
  metMinShare,
  type BossFamily,
  type FriendBoss,
} from '@/lib/friendBoss';
import { friendBossArt } from '@/data/friendBossArt';

defineProps<{ embedded?: boolean }>();

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const friends = useFriendsStore();
const store = useFriendBossStore();
const library = useLibraryStore();
const gameFx = useGameFx();
const char = useCharacterStore();
const progress = useProgress();
useBossTokenAccrual(); // 🎫 jetons de boss gagnés par le sport

const uid = computed(() => auth.user?.id ?? '');
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
const loaded = ref(false);
const busy = ref(false);
const exos = ref<ExerciseRow[]>([]);

onMounted(async () => {
  timer = setInterval(() => (now.value = Date.now()), 30_000);
  try {
    await Promise.all([
      store.fetchMine(),
      char.row ? Promise.resolve() : char.fetchMine(),
      uid.value && !friends.loaded ? friends.fetchMine(uid.value) : Promise.resolve(),
      library.fetchAll().then((rows) => (exos.value = rows)),
    ]);
  } catch {
    $q.notify({ type: 'negative', message: 'Chargement impossible pour le moment.' });
  } finally {
    loaded.value = true;
  }
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

/** Mes boss en cours (un par exercice) ; on en regarde un à la fois. */
const running = computed(() => store.inProgress(now.value));
const selectedId = ref<string | null>(null);
/** Le boss qu'on vient d'abattre reste à l'écran le temps de sa mort et du résultat : sans
 *  ça, le rechargement après la frappe fatale le sort des « en cours » et la scène se démonte
 *  au milieu de l'animation. */
const pinnedId = ref<string | null>(null);
const current = computed(
  () =>
    (pinnedId.value ? store.bosses.find((b) => b.id === pinnedId.value) : undefined) ??
    running.value.find((b) => b.id === selectedId.value) ??
    running.value[0] ??
    null,
);
const tokens = computed(() => char.row?.boss_tokens ?? 0);
/** Même règle que `fboss_respond` : gratuit, un seul boss par exercice. */
const inviteBlock = (b: FriendBoss) =>
  bossJoinBlocker({ exerciseId: b.exerciseId, mine: running.value }, now.value);
/** Le délai de 48 h du lanceur (migr. 0087) : il vaut avant même d'avoir choisi un exo. */
const owned = computed(() => store.bosses.filter((b) => b.ownerId === uid.value));
const nextAt = computed(() => nextDeclareAt(owned.value));
const launchWait = computed(() => (nextAt.value && nextAt.value > now.value ? nextAt.value : null));
const takenExo = computed(() => new Set(running.value.map((b) => b.exerciseId)));
const launchOpen = ref(false);
const invitations = computed(() => store.invitations(now.value));
const phase = computed(() => (current.value ? bossPhase(current.value, now.value) : null));
const isMember = computed(
  () => !!current.value && store.myMembership(current.value.id)?.status === 'accepted',
);
const bossMembers = computed(() =>
  current.value ? store.members.filter((m) => m.bossId === current.value!.id) : [],
);
const invitedCount = computed(
  () => bossMembers.value.filter((m) => m.userId !== current.value?.ownerId).length,
);
const answered = computed(
  () =>
    bossMembers.value.filter((m) => m.userId !== current.value?.ownerId && m.status !== 'invited')
      .length,
);
/** Acceptés d'abord (du plus gros apport au plus petit), puis invités, puis refus. */
const groupRows = computed(() => {
  const rank = { accepted: 0, invited: 1, declined: 2 } as const;
  return [...bossMembers.value].sort(
    (a, b) => rank[a.status] - rank[b.status] || b.units - a.units,
  );
});
const hpLeft = computed(() =>
  current.value ? Math.max(0, current.value.hpTotal - current.value.damage) : 0,
);
// ── Scène : le boss, le groupe, et chaque frappe animée ──
const stage = ref<InstanceType<typeof FriendBossStage> | null>(null);
const allies = computed<StageAlly[]>(() =>
  groupRows.value
    .filter((m) => m.status === 'accepted')
    .map((m) => ({
      userId: m.userId,
      pseudo: m.pseudo,
      // Mon héros : tel qu'il est maintenant (sans attendre l'aller-retour serveur).
      look: m.userId === uid.value ? (myLook.value ?? m.look ?? null) : (m.look ?? null),
      units: m.units,
      me: m.userId === uid.value,
    })),
);
const myLook = computed<HeroLook | null>(() => {
  if (!char.row || !progress.ready.value) return null;
  const c = computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    0,
    0,
  );
  return heroLook(char.row.equipped, c.profile, char.row.voie);
});
/** Dépose mon apparence pour que les amis me voient (silencieux : c'est de la déco). */
function syncLook() {
  if (myLook.value) store.setLook(myLook.value, Date.now()).catch(() => undefined);
}
watch([loaded, myLook], () => loaded.value && syncLook(), { immediate: true });

/** Rejoue une fois, à l'ouverture, les frappes des amis depuis ma dernière visite. */
const SEEN_KEY = (id: string) => `muscu:fboss:seen:${id}`;
let replayedFor: string | null = null;
watch(
  [loaded, current],
  async () => {
    const b = current.value;
    if (!loaded.value || !b || replayedFor === b.id) return;
    replayedFor = b.id;
    let since = Number.POSITIVE_INFINITY; // 1re visite : rien à rejouer
    try {
      const raw = localStorage.getItem(SEEN_KEY(b.id));
      if (raw) since = Number(raw) || since;
      localStorage.setItem(SEEN_KEY(b.id), String(Date.now()));
    } catch {
      /* stockage indisponible : pas de rejeu */
    }
    const { strikes, startHp } = strikesToReplay(b, store.hits, uid.value, since);
    if (!strikes.length) return;
    await nextTick();
    await stage.value?.play(strikes, startHp);
  },
  { immediate: true },
);
const unitSingular = computed(() => (current.value?.family === 'core' ? 'seconde' : 'rep'));
/** Jour LOCAL, comme partout ailleurs dans l'app. */
const dayKey = (ms: number) => localDayIso(new Date(ms));
const hitDays = computed(() =>
  current.value ? bossHitsByDay(store.hits, current.value.id, dayKey).slice(0, 10) : [],
);
/** Les jours dépliés. ⚠️ Le plus récent l'est d'office : c'est celui qu'on vient regarder. */
const openDays = ref<Set<string>>(new Set());
watch(
  hitDays,
  (days) => {
    const first = days[0]?.day;
    if (first && !openDays.value.size) openDays.value = new Set([first]);
  },
  { immediate: true },
);
// Changer de boss replie les jours du précédent : on repart du plus récent de celui-ci.
watch(
  () => current.value?.id,
  () => (openDays.value = new Set(hitDays.value[0] ? [hitDays.value[0].day] : [])),
);
function toggleDay(day: string) {
  const next = new Set(openDays.value);
  if (!next.delete(day)) next.add(day);
  openDays.value = next;
}
const dayLabel = (ms: number) => {
  const today = dayKey(Date.now());
  const k = dayKey(ms);
  if (k === today) return "Aujourd'hui";
  if (k === dayKey(Date.now() - 86400000)) return 'Hier';
  return new Date(ms).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
};
const pseudoOf = (userId: string) =>
  store.members.find((m) => m.userId === userId)?.pseudo ?? 'Un ami';
const ownerPseudo = (b: FriendBoss) => pseudoOf(b.ownerId);
/** Le groupe d'une invitation : le lanceur, qui a déjà rejoint, qui est encore invité.
 *  Savoir avec qui on se bat fait partie de la décision (tous les membres du boss sont
 *  lisibles par un invité : RLS « membres du boss »). */
const inviteGroup = (b: FriendBoss) => {
  const others = store.members.filter(
    (m) => m.bossId === b.id && m.userId !== b.ownerId && m.userId !== uid.value,
  );
  const joined = others.filter((m) => m.status === 'accepted').map((m) => m.pseudo);
  const waiting = others.filter((m) => m.status === 'invited').map((m) => m.pseudo);
  const parts = [`${ownerPseudo(b)} (lanceur)`];
  if (joined.length) parts.push(`${joined.join(', ')} ${joined.length > 1 ? 'ont' : 'a'} rejoint`);
  if (waiting.length)
    parts.push(`aussi invité${waiting.length > 1 ? 's' : ''} : ${waiting.join(', ')}`);
  return parts.join(' · ');
};
const sharePct = (units: number) =>
  current.value
    ? Math.min(100, (units / bossShareUnits(current.value.family, current.value.tier)) * 100)
    : 0;

// ── Frapper ──
const amount = ref(20);
const perHit = computed(() =>
  current.value
    ? Math.floor(bossShareUnits(current.value.family, current.value.tier) * FRIEND_BOSS.hitMaxShare)
    : 0,
);
/** Ce que le serveur retiendra : la même règle que `fboss_hit`. */
const accepted = computed(() =>
  current.value
    ? acceptedUnits(
        current.value.family,
        amount.value || 0,
        bossUnitsLeft(current.value),
        current.value.tier,
      )
    : 0,
);
function step(d: number) {
  amount.value = Math.max(1, Math.floor((amount.value || 0) + d));
}
async function doHit() {
  const b = current.value;
  if (!b || busy.value) return;
  const before = hpLeft.value;
  busy.value = true;
  pinnedId.value = b.id;
  let res: { accepted: number; defeated: boolean };
  try {
    res = await store.hit(b.id, amount.value);
  } catch (e) {
    busy.value = false;
    pinnedId.value = null;
    notifyError(e);
    return;
  }
  // La barre attend (hold) : c'est l'animation qui retire les PV, à l'impact.
  const damage = bossDamage(res.accepted);
  await stage.value?.play([{ id: `me-${Date.now()}`, userId: uid.value, damage }], before);
  busy.value = false;
  try {
    localStorage.setItem(SEEN_KEY(b.id), String(Date.now()));
  } catch {
    /* rien */
  }
  if (!res.defeated) {
    pinnedId.value = null;
    return;
  }
  // Fin du combat : on regarde les frappes, PUIS la mort, PUIS le résultat.
  busy.value = true;
  await stage.value?.die();
  busy.value = false;
  victoryChest.value = null;
  victory.value = store.bosses.find((x) => x.id === b.id) ?? b;
}

// ── Résultat d'un boss abattu ──
const victory = ref<FriendBoss | null>(null);
const victoryChest = ref<ReturnType<typeof friendBossChest> | null>(null);
function closeVictory() {
  victory.value = null;
  victoryChest.value = null;
  pinnedId.value = null;
}
async function openVictoryChest() {
  if (!victory.value) return;
  victoryChest.value = await doOpenChest(victory.value);
}

// ── Répondre ──
async function doRespond(b: FriendBoss, accept: boolean) {
  if (busy.value) return;
  busy.value = true;
  try {
    await store.respond(b.id, accept);
    if (accept) syncLook();
    $q.notify({
      type: accept ? 'positive' : 'info',
      message: accept ? `Tu rejoins le boss de ${ownerPseudo(b)} !` : 'Invitation refusée.',
    });
  } catch (e) {
    notifyError(e);
  } finally {
    busy.value = false;
  }
}

// ── Lancer ──
/** Lancer un boss exige l'Autel des boss — même règle que `fboss_declare` (migr. 0071). */
const hasAltar = computed(() => bossAltarBuilt(char.row?.buildings ?? []));
const exoQuery = ref('');
interface BossExo {
  id: string;
  name: string;
  family: BossFamily;
  repWeight: number;
}
const exoList = computed<BossExo[]>(() =>
  exos.value
    .filter((e) => isBossExercise(e))
    .map((e) => ({
      id: e.id,
      name: e.name,
      family: bossFamily(e),
      repWeight: repWeightFromExercise(e.muscle_secondary, e.equipment_required, e.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
);
const exoChoices = computed(() => {
  const q = exoQuery.value.trim().toLowerCase();
  const list = q ? exoList.value.filter((e) => e.name.toLowerCase().includes(q)) : exoList.value;
  return list.slice(0, 40);
});
const pickedExo = ref<BossExo | null>(null);
const pickedTier = ref<string>(BOSS_TIER_DEFAULT);
/** Même règle que `fboss_declare`. */
const declareBlock = computed(() =>
  pickedExo.value
    ? bossLaunchBlocker(
        {
          tokens: tokens.value,
          tier: pickedTier.value,
          exerciseId: pickedExo.value.id,
          mine: running.value,
          owned: owned.value,
        },
        now.value,
      )
    : null,
);
/** Ce que le cran multiplie sur le COFFRE (or, pierres) — la même formule que
 *  `friendBossChest`, jamais un second barème : c'est ce qui rend l'annonce vraie. */
const tierRewardMult = (t: BossTier) => t.mult ** FRIEND_BOSS.rewardExp;
const invitees = ref(new Set<string>());
function toggleInvite(id: string) {
  const s = new Set(invitees.value);
  if (s.has(id)) s.delete(id);
  else if (s.size < FRIEND_BOSS.maxInvites) s.add(id);
  invitees.value = s;
}
async function doDeclare() {
  const ex = pickedExo.value;
  if (!ex || busy.value) return;
  busy.value = true;
  try {
    await store.declare(ex, [...invitees.value], pickedTier.value);
    syncLook();
    $q.notify({
      type: 'positive',
      message: invitees.value.size
        ? `Boss lancé ! Tes amis ont 24 h pour te rejoindre.`
        : 'Boss lancé : le combat commence maintenant.',
    });
    pickedExo.value = null;
    invitees.value = new Set();
    launchOpen.value = false;
    selectedId.value = null; // le plus récent, donc celui qu'on vient de lancer
  } catch (e) {
    notifyError(e);
  } finally {
    busy.value = false;
  }
}

// ── Passés ──
const past = computed(() =>
  store.bosses.filter((b) => {
    const p = bossPhase(b, now.value);
    return (p === 'defeated' || p === 'expired') && store.myMembership(b.id)?.status === 'accepted';
  }),
);
/** État du coffre : à ouvrir (le serveur n'a rien donné), à récupérer (le serveur l'a donné,
 *  le crédit n'a pas suivi), ou rien. Sans personnage chargé, on ne sait pas s'il est versé. */
function chestOf(b: FriendBoss) {
  if (!char.row) return 'none';
  return chestState(b, store.myMembership(b.id), char.row.cleared_dungeons);
}
/** Ouvre le coffre : le serveur le marque pris, puis il est déposé dans la boîte 📬 et
 *  encaissé aussitôt. ⚠️ Le niveau doit être connu (`progress.ready`) : un coffre tiré au
 *  niveau 1 serait définitif. */
async function doOpenChest(b: FriendBoss): Promise<ReturnType<typeof friendBossChest> | null> {
  const me = uid.value;
  const state = chestOf(b);
  if (!me || state === 'none' || busy.value || !progress.ready.value) return null;
  busy.value = true;
  try {
    if (state === 'open') await store.claim(b.id);
    const chest = friendBossChest(b, me, progress.global.value.level);
    const now = Date.now();
    const msgId = await char.grantFriendBossChest(me, b.id, b.exerciseName, chest, now);
    if (msgId) await char.expeClaim(me, msgId, now);
    // Reste à l'écran jusqu'au toucher : il y a tout un butin à lire.
    gameFx.celebrate({
      kind: 'chest',
      emoji: '🏆',
      title: `Trophée : ${chest.trophy.name}`,
      subtitle: `${gradeLabel(chest.trophy)} · +${chest.gold} 🪙 · +${chest.stones} 🔮${chest.tickets ? ` · +${chest.tickets} 🎟️` : ''} · rangé dans ton sac à trophées 🏆`,
      rarity: fxRarity(chest.trophy.rarity),
      sticky: true,
    });
    return chest;
  } catch (e) {
    notifyError(e);
    return null;
  } finally {
    busy.value = false;
  }
}

function notifyError(e: unknown) {
  $q.notify({
    type: 'negative',
    message: e instanceof FriendBossError ? e.message : 'Action impossible pour le moment.',
  });
}
</script>

<style scoped lang="scss">
.fb-page {
  padding: 12px 16px 40px;
}
.fb-page.embedded {
  min-height: 0;
}
.fb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.fb-back {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 26px;
  cursor: pointer;
}
.fb-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.fb-empty {
  padding: 40px 0;
  text-align: center;
}
.fb-card {
  padding: 14px;
  margin-bottom: 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.fb-card.invite {
  border-color: var(--accent);
}
.fb-inv-t {
  font-size: 14px;
}
.fb-inv-s {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--dim);
}
.fb-inv-s.warn {
  color: var(--d3);
}
/* 🎫 Réserve de jetons */
.fb-tokens {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
}
.fb-tok-n {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
}
.fb-hint.warn {
  color: var(--d3);
}
.fb-tier-r.short {
  color: var(--d4);
}
.fb-exo:disabled {
  opacity: 0.45;
}
/* Plusieurs boss en cours : on choisit celui qu'on regarde */
.fb-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.fb-pick-b {
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.fb-pick-b.on {
  border-color: var(--accent);
  color: var(--accent);
}
.fb-more {
  margin-bottom: 14px;
}
.fb-acts {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.fb-btn {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.fb-btn.ghost {
  background: transparent;
  color: var(--dim);
  border-color: var(--line);
}
.fb-btn.big {
  font-family: var(--font-display);
  font-size: 16px;
}
.fb-btn.wide {
  width: 100%;
  margin-top: 14px;
}
.fb-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.fb-emo {
  font-size: 34px;
  line-height: 1;
}
.fb-emo.fb-emo-past {
  font-size: 20px;
}
.fb-boss-s {
  font-size: 12.5px;
  color: var(--dim);
}
.fb-dim {
  color: var(--dim);
}
.fb-hit {
  margin-top: 14px;
}
.fb-hit-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.fb-step {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 20px;
  cursor: pointer;
}
.fb-input {
  width: 0;
  flex: 1;
  min-width: 60px;
  height: 44px;
  text-align: center;
  font-size: 20px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
}
.fb-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.fb-sec {
  margin-top: 6px;
}
.fb-sec-t {
  margin: 16px 0 6px;
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
}
.fb-sec-t.first {
  margin-top: 0;
}
.fb-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--line-soft);
  font-size: 13px;
}
.fb-m-n {
  flex: 0 0 34%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.fb-member.declined .fb-m-n {
  color: var(--dim);
  text-decoration: line-through;
}
.fb-m-bar {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 6px;
  background: var(--surface-2);
  overflow: hidden;
}
.fb-m-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
}
.fb-m-min {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--text);
  opacity: 0.6;
}
.fb-m-u {
  flex: none;
  width: 44px;
  text-align: right;
  font-family: var(--font-display);
  font-weight: 700;
}
.fb-m-u.ok {
  color: var(--d1);
}
.fb-m-st {
  flex: 1;
  text-align: right;
  font-size: 12px;
  color: var(--dim);
}
.fb-log {
  font-size: 12.5px;
  padding: 2px 0;
}
/* La ligne d'un JOUR : c'est un bouton (on déplie le détail), donc reset, cible de 44 px
   et curseur. ⚠️ `.mf-chev` est redéfini ici : les styles sont SCOPED par composant, celui
   d'AventurePage n'atteint pas cet écran. */
.fb-day {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 0 2px;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--line);
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.fb-day:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.fb-day-tot {
  font-weight: 800;
  color: var(--accent);
}
.fb-day-detail {
  padding: 4px 0 8px 18px;
  border-left: 1px solid var(--line);
  margin-left: 6px;
}
.mf-chev {
  display: inline-block;
  transition: transform 0.15s ease;
  color: var(--dim);
}
.mf-chev.open {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .mf-chev {
    transition: none;
  }
}
.fb-search {
  width: 100%;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
}
.fb-exos {
  display: grid;
  gap: 6px;
  max-height: 260px;
  margin-top: 8px;
  overflow-y: auto;
}
.fb-exo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
}
.fb-exo.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
/* ⚠️ `minmax(0, 1fr)` et non `1fr` : sinon une piste refuse de passer sous la taille de son
   contenu et la grille déborde à 344 px (Z Fold plié). */
.fb-tiers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.fb-tier {
  display: grid;
  gap: 1px;
  min-height: 44px;
  padding: 7px 4px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  text-align: center;
  cursor: pointer;
}
.fb-tier.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.fb-tier-e {
  font-size: 18px;
  line-height: 1.1;
}
.fb-tier-n {
  font-size: 12px;
  font-weight: 600;
}
.fb-tier-v {
  font-size: 11.5px;
  color: var(--dim);
}
.fb-tier-r {
  font-size: 11px;
  color: var(--d1);
}
.fb-friend {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 14px;
}
.fb-friend input {
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
}
.fb-past {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-soft);
}
.fb-past-main {
  flex: 1;
  min-width: 0;
  display: grid;
  font-size: 13px;
}
.fb-btn.fb-chest {
  flex: none;
  padding: 0 12px;
  font-size: 13px;
  white-space: nowrap;
}
.fb-victory {
  width: min(92vw, 360px);
  padding: 20px 18px 16px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fb-v-emo {
  font-size: 44px;
  line-height: 1;
}
.fb-v-title {
  font-size: 22px;
  color: var(--accent);
}
.fb-v-sub,
.fb-v-line {
  font-size: 14px;
}
.fb-v-loot {
  margin-top: 4px;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}
.fb-v-loot-t {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--dim);
}
.fb-victory .fb-btn {
  min-height: 44px;
}
.fb-v-close {
  margin-top: 4px;
}
</style>
