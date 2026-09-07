<template>
  <component :is="embedded ? 'div' : 'q-page'" class="friends-page" :class="{ embedded }">
    <header class="fr-head">
      <h1 class="fr-title font-display">Amis</h1>
      <p class="fr-sub">
        Suivez vos challenges et Défis 360 respectifs pour vous motiver. Lecture seule des deux
        côtés.
      </p>
    </header>

    <!-- Sans pseudo, on n'est pas trouvable : c'est le handle de recherche. -->
    <div v-if="!myPseudo" class="fr-nopseudo">
      🪪 Choisis un <b>pseudo d'aventurier</b> pour être trouvable par tes amis.
      <button class="fr-cta" @click="goAventure">Choisir mon pseudo</button>
    </div>

    <template v-else>
      <div class="fr-me">
        Ton pseudo : <b>{{ myPseudo }}</b>
        <span class="fr-me-h">— c'est ce que tes amis doivent saisir</span>
      </div>

      <!-- Recherche par pseudo EXACT (pas de liste parcourable : choix de conception). -->
      <form class="fr-search" @submit.prevent="doSearch">
        <input
          v-model="query"
          class="fr-input"
          type="search"
          placeholder="Pseudo exact de ton ami…"
          autocomplete="off"
          :disabled="searching"
        />
        <button class="fr-btn" type="submit" :disabled="searching || query.trim().length < 3">
          Chercher
        </button>
      </form>
      <div v-if="searchMsg" class="fr-msg" :class="{ bad: searchBad }">{{ searchMsg }}</div>
      <div v-if="found" class="fr-found">
        <span class="fr-av">🧑</span>
        <span class="fr-name">{{ found.pseudo }}</span>
        <button class="fr-btn" :disabled="sending" @click="doRequest">Ajouter</button>
      </div>

      <div v-if="friends.loading && !friends.loaded" class="fr-empty">
        <q-spinner color="primary" size="24px" />
      </div>

      <template v-else>
        <!-- Demandes reçues : la seule section où on agit. -->
        <section v-if="friends.incoming.length" class="fr-sec">
          <div class="fr-sec-t">Demandes reçues</div>
          <div v-for="v in friends.incoming" :key="v.userId" class="fr-row">
            <span class="fr-av">🧑</span>
            <span class="fr-name">{{ v.pseudo }}</span>
            <button class="fr-btn sm" @click="respond(v.userId, true)">Accepter</button>
            <button class="fr-btn sm ghost" @click="respond(v.userId, false)">Refuser</button>
          </div>
        </section>

        <!-- Défis partagés proposés : accepter CRÉE mon propre défi (les RLS sont
             own-only en insertion, l'ami n'a pas pu l'écrire pour moi). -->
        <section v-if="friends.sharedInvites.length" class="fr-sec">
          <div class="fr-sec-t">Défis partagés</div>
          <div v-for="s in friends.sharedInvites" :key="s.id" class="fr-row sh-row">
            <span class="fr-av">🤝</span>
            <span class="sh-main">
              <span class="fr-name">{{ pseudoOf(s.created_by) }}</span>
              <span class="sh-what"
                >te propose « {{ s.exercise_name }} » · {{ s.duration_days }} jours</span
              >
            </span>
            <button class="fr-btn sm" :disabled="busyShared" @click="acceptShared(s)">
              Relever
            </button>
            <button class="fr-btn sm ghost" :disabled="busyShared" @click="declineShared(s)">
              Refuser
            </button>
          </div>
        </section>

        <!-- Fil d'activité : DÉRIVÉ des défis déjà lisibles (aucune table dédiée).
             C'est la raison d'ouvrir cet onglet — sans lui la page ne dit rien de neuf. -->
        <section v-if="feed.length" class="fr-sec">
          <div class="fr-sec-t">Fil d'activité</div>
          <button v-for="it in feed" :key="it.id" class="fd-row" @click="openFriend(it.userId)">
            <span class="fd-emo">{{ it.emoji }}</span>
            <span class="fd-main">
              <span class="fd-txt"
                ><b>{{ it.pseudo }}</b> {{ it.text }}</span
              >
              <span class="fd-when">{{ feedWhen(it.at, now) }}</span>
            </span>
            <span v-if="it.pct !== null" class="fd-pct" :class="{ done: it.kind === 'done' }"
              >{{ it.pct }} %</span
            >
          </button>
        </section>

        <section v-if="friends.outgoing.length" class="fr-sec">
          <div class="fr-sec-t">Demandes envoyées</div>
          <div v-for="v in friends.outgoing" :key="v.userId" class="fr-row">
            <span class="fr-av">🧑</span>
            <span class="fr-name">{{ v.pseudo }}</span>
            <span class="fr-wait">en attente</span>
            <button class="fr-btn sm ghost" @click="unlink(v.userId, 'Annuler la demande')">
              Annuler
            </button>
          </div>
        </section>

        <section class="fr-sec">
          <div class="fr-sec-t">Mes amis ({{ friends.accepted.length }})</div>
          <div v-if="!friends.accepted.length" class="fr-empty">
            Personne pour l'instant — cherche un pseudo ci-dessus.
          </div>
          <div v-for="v in friends.accepted" :key="v.userId" class="fr-row">
            <button class="fr-open" @click="openFriend(v.userId)">
              <span class="fr-av">🧑</span>
              <span class="fr-name">{{ v.pseudo }}</span>
              <span class="fr-go">voir l'avancement ›</span>
            </button>
            <button class="fr-btn sm ghost" @click="unlink(v.userId, 'Retirer cet ami')">
              Retirer
            </button>
          </div>
        </section>
      </template>
    </template>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useFriendsStore, PseudoNotFoundError, AlreadyLinkedError } from '@/stores/friends';
import { buildFriendFeed, feedWhen, type FeedItem } from '@/lib/friendFeed';
import { logicalToday, computeDailyTargets } from '@/lib/challenges';
import { useChallengesStore } from '@/stores/challenges';
import type { SharedChallenge } from '@/stores/friends';

defineProps<{ embedded?: boolean }>();

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const friends = useFriendsStore();
const challenges = useChallengesStore();

const myPseudo = computed(() => char.row?.pseudo ?? '');
const query = ref('');
const searching = ref(false);
const sending = ref(false);
const searchMsg = ref('');
const searchBad = ref(false);
const found = ref<{ user_id: string; pseudo: string } | null>(null);
const feed = ref<FeedItem[]>([]);
const now = ref(new Date().toISOString());
const busyShared = ref(false);
const pseudoOf = (id: string) => friends.accepted.find((v) => v.userId === id)?.pseudo ?? 'Un ami';

onMounted(async () => {
  const uid = auth.user?.id;
  if (!uid) return;
  try {
    if (!char.loaded) await char.fetchMine();
    await friends.fetchMine(uid);
    await friends.fetchShared(uid);
    if (!challenges.loaded) await challenges.fetchMine();
  } catch {
    /* silencieux : la page reste utilisable, l'action réessaiera */
  }
  try {
    const data = await friends.fetchFeed();
    now.value = new Date().toISOString();
    feed.value = buildFriendFeed(data, now.value, logicalToday());
  } catch {
    /* le fil est un bonus : son échec ne doit pas priver du reste de la page */
  }
});

/** Relever un défi partagé = créer MON défi, lié à la définition commune.
 *
 *  Départ : on HONORE la date du proposant tant qu'elle est à venir — un défi calé
 *  sur lundi doit démarrer lundi POUR LES DEUX, sinon le comparatif oppose deux
 *  calendriers décalés. En revanche on ne reprend jamais une date passée : on
 *  hériterait de journées déjà manquées avant même d'avoir accepté. */
async function acceptShared(s: SharedChallenge) {
  if (busyShared.value) return;
  busyShared.value = true;
  try {
    const t = logicalToday();
    const start = s.start_date > t ? s.start_date : t;
    const created = await challenges.create({
      exercise_id: s.exercise_id,
      exercise_name: s.exercise_name,
      muscle_primary: s.muscle_primary,
      rep_weight: s.rep_weight,
      unit: s.unit,
      format: s.format,
      duration_days: s.duration_days,
      start_date: start,
      config: s.config,
      daily_targets: computeDailyTargets(s.format, s.config, s.duration_days, start),
    });
    await challenges.setShared(created.id, s.id);
    await friends.respondShared(s.id, true);
    $q.notify({ type: 'positive', message: 'Défi relevé — bon courage à vous deux !' });
  } catch (e) {
    // Le plus courant : plus de place dans la voie (budget de jetons) → le message
    // du store est explicite, on le laisse parler.
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Impossible de relever ce défi.',
    });
  } finally {
    busyShared.value = false;
  }
}

async function declineShared(s: SharedChallenge) {
  if (busyShared.value) return;
  busyShared.value = true;
  try {
    await friends.respondShared(s.id, false);
  } catch {
    $q.notify({ type: 'negative', message: 'Action impossible.' });
  } finally {
    busyShared.value = false;
  }
}

async function doSearch() {
  const uid = auth.user?.id;
  if (!uid) return;
  searching.value = true;
  found.value = null;
  searchMsg.value = '';
  searchBad.value = false;
  try {
    const row = await friends.findByPseudo(query.value);
    // Déjà en relation ? On le dit tout de suite plutôt qu'à l'envoi.
    const existing = friends.views.find((v) => v.userId === row.user_id);
    if (existing) {
      searchBad.value = true;
      searchMsg.value =
        existing.status === 'accepted'
          ? `${row.pseudo} est déjà ton ami.`
          : `Une demande est déjà en cours avec ${row.pseudo}.`;
      return;
    }
    found.value = row;
  } catch (e) {
    searchBad.value = true;
    searchMsg.value =
      e instanceof PseudoNotFoundError
        ? 'Aucun aventurier avec ce pseudo (il faut le pseudo exact).'
        : 'Recherche impossible pour le moment.';
  } finally {
    searching.value = false;
  }
}

async function doRequest() {
  const uid = auth.user?.id;
  const target = found.value;
  if (!uid || !target) return;
  sending.value = true;
  try {
    await friends.request(uid, target.user_id);
    $q.notify({ type: 'positive', message: `Demande envoyée à ${target.pseudo}.` });
    found.value = null;
    query.value = '';
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof AlreadyLinkedError ? e.message : "Impossible d'envoyer la demande.",
    });
  } finally {
    sending.value = false;
  }
}

async function respond(otherId: string, accept: boolean) {
  const uid = auth.user?.id;
  if (!uid) return;
  try {
    await friends.respond(uid, otherId, accept);
    $q.notify({ type: 'positive', message: accept ? 'Ami ajouté !' : 'Demande refusée.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Échec.' });
  }
}

function unlink(otherId: string, title: string) {
  $q.dialog({
    title,
    message: 'Vous ne verrez plus vos avancements respectifs.',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Confirmer', color: 'negative' },
  }).onOk(() => {
    const uid = auth.user?.id;
    if (!uid) return;
    friends.remove(uid, otherId).catch(() => $q.notify({ type: 'negative', message: 'Échec.' }));
  });
}

async function openFriend(userId: string) {
  await router.push(`/friends/${userId}`);
}
async function goAventure() {
  await router.push('/aventure');
}
</script>

<style scoped lang="scss">
.sh-row {
  flex-wrap: wrap;
}
.sh-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 1px;
}
.sh-what {
  font-size: 12px;
  color: var(--dim);
}

/* Fil d'activité : une ligne = un fait, lisible d'un coup d'œil, tapable pour ouvrir
   l'avancement de l'ami concerné. */
.fd-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 2px;
  background: none;
  border: 0;
  border-top: 1px solid var(--line);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.fd-row:first-of-type {
  border-top: 0;
}
.fd-emo {
  font-size: 17px;
  line-height: 1;
}
.fd-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 1px;
}
.fd-txt {
  font-size: 13px;
  color: var(--text);
}
.fd-when {
  font-size: 11px;
  color: var(--dim);
}
.fd-pct {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
  white-space: nowrap;
}
.fd-pct.done {
  color: var(--d1);
}

.friends-page {
  padding: 16px 16px 40px;
}
.friends-page.embedded {
  min-height: 0;
}
.fr-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}
.fr-sub {
  margin: 4px 0 16px;
  font-size: 13px;
  color: var(--dim);
}
.fr-nopseudo {
  padding: 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--accent);
  font-size: 13.5px;
}
.fr-cta {
  display: block;
  margin-top: 10px;
  padding: 9px 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.fr-me {
  font-size: 13px;
  color: var(--dim);
  margin-bottom: 12px;
}
.fr-me-h {
  color: var(--dim-2);
}
.fr-search {
  display: flex;
  gap: 8px;
}
.fr-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}
.fr-input:focus {
  outline: none;
  border-color: var(--accent);
}
.fr-btn {
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex: none;
}
.fr-btn.sm {
  padding: 6px 10px;
  font-size: 12px;
}
.fr-btn.ghost {
  background: transparent;
  color: var(--dim);
  border-color: var(--line);
}
.fr-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.fr-msg {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--dim);
}
.fr-msg.bad {
  color: var(--d4);
}
.fr-found,
.fr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
}
.fr-av {
  font-size: 20px;
  line-height: 1;
}
.fr-name {
  font-weight: 700;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fr-wait {
  font-size: 12px;
  color: var(--dim-2);
}
.fr-sec {
  margin-top: 20px;
}
.fr-sec-t {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 4px;
}
.fr-open {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.fr-go {
  font-size: 12px;
  color: var(--accent);
  flex: none;
}
.fr-empty {
  padding: 14px 0;
  font-size: 13px;
  color: var(--dim);
  text-align: center;
}
</style>
