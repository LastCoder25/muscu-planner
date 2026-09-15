<template>
  <component :is="embedded ? 'div' : 'q-page'" class="fb-page" :class="{ embedded }">
    <header class="fb-head">
      <button class="fb-back" aria-label="Retour" @click="backOr(router, '/friends')">‹</button>
      <h1 class="fb-title font-display">🐉 Boss entre amis</h1>
    </header>

    <div v-if="!loaded" class="fb-empty"><q-spinner color="primary" size="28px" /></div>

    <template v-else>
      <!-- ── INVITATIONS : la seule chose urgente (24 h pour répondre) ───────────── -->
      <section v-for="b in invitations" :key="'inv-' + b.id" class="fb-card invite">
        <div class="fb-inv-t">
          <b>{{ ownerPseudo(b) }}</b> t’invite à abattre un boss en
          <b>{{ b.exerciseName }}</b>
        </div>
        <div class="fb-inv-s">
          {{ BOSS_FAMILY_LABEL[b.family].emoji }} ta part : {{ FRIEND_BOSS.shareUnits[b.family] }}
          {{ bossUnitLabel(b.family) }} sur 7 jours · réponds dans
          {{ fmtBossSpan(bossStartAt(b) - now) }}
        </div>
        <div v-if="current" class="fb-inv-s warn">
          Tu mènes déjà un boss : termine-le avant d’en rejoindre un autre.
        </div>
        <div class="fb-acts">
          <button class="fb-btn" :disabled="busy || !!current" @click="doRespond(b, true)">
            Rejoindre
          </button>
          <button class="fb-btn ghost" :disabled="busy" @click="doRespond(b, false)">
            Refuser
          </button>
        </div>
      </section>

      <!-- ── BOSS EN COURS ─────────────────────────────────────────────────────── -->
      <section v-if="current" class="fb-card boss">
        <div class="fb-boss-s">
          <template v-if="phase === 'recruiting'">
            ⏳ Démarre dans {{ fmtBossSpan(bossStartAt(current) - now) }} — {{ answered }}/{{
              invitedCount
            }}
            réponse{{ invitedCount > 1 ? 's' : '' }}
          </template>
          <template v-else>⚔️ Encore {{ fmtBossSpan(bossEndsAt(current) - now) }}</template>
          <span class="fb-dim">
            · 1 {{ unitSingular }} = {{ fmtBossPv(FRIEND_BOSS.damagePerUnit) }} dégâts</span
          >
        </div>

        <FriendBossStage
          ref="stage"
          :boss-name="current.exerciseName"
          :boss-emoji="bossEmoji(current.id)"
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
            <button class="fb-step" aria-label="Moins" @click="step(-5)">−</button>
            <input
              v-model.number="amount"
              class="fb-input font-display"
              type="number"
              inputmode="numeric"
              min="1"
              :aria-label="'Nombre de ' + bossUnitLabel(current.family)"
            />
            <button class="fb-step" aria-label="Plus" @click="step(5)">＋</button>
            <button class="fb-btn big" :disabled="busy || accepted <= 0" @click="doHit">
              Frapper
            </button>
          </div>
          <div class="fb-hint">
            <template v-if="dayLeft <= 0">
              Plafond de la journée atteint — tu pourras refrapper dans les prochaines heures.
            </template>
            <template v-else-if="accepted < amount">
              Seulement <b>{{ accepted }}</b> compteront (≤ {{ perHit }} par saisie,
              {{ dayLeft }} restant sur 24 h).
            </template>
            <template v-else>
              ≤ {{ perHit }} {{ bossUnitLabel(current.family) }} par saisie · {{ dayLeft }}
              restant sur 24 h
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
            <span class="fb-m-u" :class="{ ok: metMinShare(current.family, m.units) }">{{
              m.units
            }}</span>
          </template>
          <span v-else class="fb-m-st">{{ m.status === 'invited' ? 'invité' : 'a refusé' }}</span>
        </div>
        <p class="fb-hint">
          La barre = ta part ({{ FRIEND_BOSS.shareUnits[current.family] }}), le trait = la moitié à
          apporter pour le coffre.
        </p>

        <div v-if="recentHits.length" class="fb-sec-t">Dernières frappes</div>
        <div v-for="h in recentHits" :key="h.id" class="fb-log">
          <b>{{ pseudoOf(h.userId) }}</b> +{{ h.units }} {{ bossUnitLabel(current.family) }}
          <span class="fb-dim">(−{{ fmtBossPv(bossDamage(h.units)) }} PV)</span>
          <span class="fb-dim">· il y a {{ fmtBossSpan(now - h.createdAt) }}</span>
        </div>
      </section>

      <!-- ── LANCER UN BOSS ────────────────────────────────────────────────────── -->
      <section v-else class="fb-card">
        <div class="fb-sec-t first">Lancer un boss</div>
        <p v-if="nextAt && nextAt > now" class="fb-hint">
          Ton dernier boss est fini : tu pourras en lancer un nouveau dans
          {{ fmtBossSpan(nextAt - now) }}. En attendant, tu peux rejoindre celui d’un ami.
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
              @click="pickedExo = e"
            >
              <span>{{ BOSS_FAMILY_LABEL[e.family].emoji }} {{ e.name }}</span>
              <span class="fb-dim"
                >{{ FRIEND_BOSS.shareUnits[e.family] }} {{ bossUnitLabel(e.family) }}/pers.</span
              >
            </button>
          </div>

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

          <button class="fb-btn big wide" :disabled="!pickedExo || busy" @click="doDeclare">
            <template v-if="pickedExo">
              Lancer · {{ fmtBossPv(bossHpTotal(pickedExo.family, 1)) }} PV
              {{
                invitees.size
                  ? `(+${fmtBossPv(bossHpTotal(pickedExo.family, 1))} par ami qui rejoint)`
                  : ''
              }}
            </template>
            <template v-else>Choisis un exercice</template>
          </button>
        </template>
      </section>

      <!-- ── BOSS PASSÉS ───────────────────────────────────────────────────────── -->
      <section v-if="past.length" class="fb-sec">
        <div class="fb-sec-t">Boss passés</div>
        <div v-for="b in past" :key="b.id" class="fb-past">
          <span class="fb-emo fb-emo-past">{{ b.defeatedAt ? '🏆' : '💨' }}</span>
          <span class="fb-past-main">
            <b>{{ b.exerciseName }}</b>
            <span class="fb-dim">
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
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { backOr } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import { useFriendBossStore, FriendBossError } from '@/stores/friendBoss';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { fxRarity, RARITY_LABEL } from '@/lib/items';
import { bossAltarBuilt } from '@/lib/buildings';
import { computeCharacter } from '@/lib/character';
import { heroLook, type HeroLook } from '@/lib/heroLook';
import FriendBossStage, { type StageAlly } from '@/components/FriendBossStage.vue';
import { useGameFx } from '@/composables/useGameFx';
import { repWeightFromExercise } from '@/lib/challenges';
import {
  FRIEND_BOSS,
  BOSS_FAMILY_LABEL,
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
  bossUnitsLeft,
  chestState,
  fmtBossPv,
  fmtBossSpan,
  friendBossChest,
  isBossExercise,
  lastDayUnits,
  metMinShare,
  nextDeclareAt,
  type BossFamily,
  type FriendBoss,
} from '@/lib/friendBoss';

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

const current = computed(() => store.current(now.value));
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
const recentHits = computed(() =>
  current.value
    ? store.hits
        .filter((h) => h.bossId === current.value!.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 15)
    : [],
);
const pseudoOf = (userId: string) =>
  store.members.find((m) => m.userId === userId)?.pseudo ?? 'Un ami';
const ownerPseudo = (b: FriendBoss) => pseudoOf(b.ownerId);
const sharePct = (units: number) =>
  current.value ? Math.min(100, (units / FRIEND_BOSS.shareUnits[current.value.family]) * 100) : 0;

// ── Frapper ──
const amount = ref(20);
const perHit = computed(() =>
  current.value
    ? Math.floor(FRIEND_BOSS.shareUnits[current.value.family] * FRIEND_BOSS.hitMaxShare)
    : 0,
);
const dayUsed = computed(() =>
  current.value ? lastDayUnits(store.hits, current.value.id, uid.value, now.value) : 0,
);
const dayLeft = computed(() =>
  current.value
    ? Math.max(
        0,
        Math.floor(FRIEND_BOSS.shareUnits[current.value.family] * FRIEND_BOSS.dayMaxShare) -
          dayUsed.value,
      )
    : 0,
);
/** Ce que le serveur retiendra : la même règle que `fboss_hit`. */
const accepted = computed(() =>
  current.value
    ? acceptedUnits(
        current.value.family,
        amount.value || 0,
        dayUsed.value,
        bossUnitsLeft(current.value),
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
  let res: { accepted: number; defeated: boolean };
  try {
    res = await store.hit(b.id, amount.value);
  } catch (e) {
    busy.value = false;
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
  if (res.defeated)
    gameFx.celebrate({
      kind: 'generic',
      emoji: '🏆',
      title: 'Le boss est tombé !',
      subtitle: `${b.exerciseName} · ton groupe l’a abattu`,
      rarity: 'legendary',
    });
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
const owned = computed(() => store.bosses.filter((b) => b.ownerId === uid.value));
/** Lancer un boss exige l'Autel des boss — même règle que `fboss_declare` (migr. 0071). */
const hasAltar = computed(() => bossAltarBuilt(char.row?.buildings ?? []));
const nextAt = computed(() => nextDeclareAt(owned.value));
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
    await store.declare(ex, [...invitees.value]);
    syncLook();
    $q.notify({
      type: 'positive',
      message: invitees.value.size
        ? `Boss lancé ! Tes amis ont 24 h pour te rejoindre.`
        : 'Boss lancé : le combat commence maintenant.',
    });
    pickedExo.value = null;
    invitees.value = new Set();
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
async function doOpenChest(b: FriendBoss) {
  const me = uid.value;
  const state = chestOf(b);
  if (!me || state === 'none' || busy.value || !progress.ready.value) return;
  busy.value = true;
  try {
    if (state === 'open') await store.claim(b.id);
    const chest = friendBossChest(b, me, progress.global.value.level);
    const now = Date.now();
    const msgId = await char.grantFriendBossChest(me, b.id, b.exerciseName, chest, now);
    if (msgId) await char.expeClaim(me, msgId, now);
    gameFx.celebrate({
      kind: 'generic',
      emoji: '🏆',
      title: chest.trophy.name,
      subtitle: `${RARITY_LABEL[chest.trophy.rarity]} · +${chest.gold} 🪙 · +${chest.stones} 🔮`,
      rarity: fxRarity(chest.trophy.rarity),
    });
  } catch (e) {
    notifyError(e);
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
</style>
