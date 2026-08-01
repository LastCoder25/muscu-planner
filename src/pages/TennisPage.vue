<template>
  <q-page class="tennis-page">
    <h1 class="page-title font-display">Tennis</h1>
    <p class="page-sub text-dim">Prépa physique et drills sur le court.</p>

    <!-- Prépa physique -->
    <section class="card">
      <div class="card-head">
        <q-icon name="directions_run" size="22px" />
        <div>
          <div class="card-title">Prépa physique</div>
          <div class="card-desc">Pliométrie, agilité, gainage rotatif — le physique du tennis.</div>
        </div>
      </div>

      <div class="opt-row">
        <span class="opt-lbl">Durée</span>
        <div class="chips">
          <button
            v-for="d in DURATIONS"
            :key="d"
            class="chip"
            :class="{ on: duration === d }"
            @click="duration = d"
          >
            {{ d }} min
          </button>
        </div>
      </div>

      <q-btn
        class="gen-btn full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="bolt"
        label="Générer une séance"
        :loading="generating"
        @click="generate"
      />

      <div v-if="prepaSessions.length" class="saved">
        <div class="saved-lbl">Mes séances de prépa</div>
        <div v-for="s in prepaSessions" :key="s.id" class="saved-row" @click="openDetail(s.id)">
          <div class="saved-main">
            <div class="saved-name">{{ s.payload.name }}</div>
            <div class="saved-meta">
              {{ s.payload.exercises.length }} exos ·
              {{ s.payload.estimated_duration_min ?? '?' }} min
            </div>
          </div>
          <button class="saved-del" aria-label="Supprimer" @click.stop="remove(s.id)">
            <q-icon name="delete_outline" size="20px" />
          </button>
        </div>
      </div>
    </section>

    <!-- Drills court (Phase 2) -->
    <section class="card soon">
      <div class="card-head">
        <q-icon name="sports_tennis" size="22px" />
        <div>
          <div class="card-title">Drills sur le court</div>
          <div class="card-desc">
            Diagonales coup droit/revers, montée-volée, jeu… avec ou sans partenaire.
          </div>
        </div>
      </div>
      <div class="soon-badge">Bientôt</div>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useSessionsStore } from '@/stores/sessions';
import { useLibraryStore } from '@/stores/library';
import { buildPrepaSession } from '@/lib/prepaBuilder';

const DURATIONS = [20, 30, 45] as const;

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const profileStore = useProfileStore();
const sessionsStore = useSessionsStore();
const library = useLibraryStore();

const duration = ref<number>(30);
const generating = ref(false);

const prepaSessions = computed(() =>
  sessionsStore.list.filter((s) => s.payload.discipline === 'prepa_physique'),
);

onMounted(() => {
  sessionsStore.fetchMine().catch(() => undefined);
});

async function generate() {
  const profile = profileStore.profile;
  const userId = auth.user?.id;
  if (!profile || !userId) {
    $q.notify({ type: 'negative', message: 'Profil introuvable.' });
    return;
  }
  generating.value = true;
  try {
    const lib = await library.fetchPrepa('tennis');
    const session = buildPrepaSession(profile, lib, { duration_min: duration.value });
    if (!session) {
      $q.notify({
        type: 'warning',
        message: 'Aucun exercice de prépa disponible avec ton matériel.',
      });
      return;
    }
    const id = await sessionsStore.insert(userId, session);
    await router.push(`/session/${id}/detail`);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Génération impossible.',
    });
  } finally {
    generating.value = false;
  }
}

async function openDetail(id: string) {
  await router.push(`/session/${id}/detail`);
}

function remove(id: string) {
  $q.dialog({
    title: 'Supprimer la séance',
    message: 'Cette séance de prépa sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void sessionsStore
      .remove(id)
      .then(() => $q.notify({ type: 'positive', message: 'Séance supprimée.' }));
  });
}
</script>

<style scoped lang="scss">
.tennis-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.card-head .q-icon {
  color: var(--accent);
  margin-top: 2px;
}
.card-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--text);
}
.card-desc {
  color: var(--dim);
  font-size: 13px;
  margin-top: 2px;
}
.opt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.opt-lbl {
  color: var(--dim);
  font-size: 13px;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
}
.gen-btn {
  border-radius: 12px;
}
.saved {
  margin-top: 18px;
}
.saved-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 8px;
}
.saved-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}
.saved-row:active {
  border-color: var(--accent);
}
.saved-main {
  flex: 1;
}
.saved-name {
  font-weight: 600;
  color: var(--text);
}
.saved-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.saved-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
.card.soon {
  opacity: 0.72;
  position: relative;
}
.soon-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-ink);
  background: var(--accent);
  border-radius: 999px;
  padding: 3px 10px;
}
</style>
