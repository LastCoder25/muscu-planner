<template>
  <!-- 🔙 RAPPELER À LA BASE (2026-10-07, demandé : « depuis la base je dois pouvoir rappeler
       des champions ou le héros, pour la défense par exemple »). Qui est dehors, quand il
       rentrerait seul, quand il serait là si on le rappelle — et, une armée en vue, s'il
       arriverait avant elle. ⚠️ Aucune règle ici : les lignes viennent de `homeRecallLines`
       (la lib), les heures et les rappels du store. -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    no-refocus
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="rh">
      <div class="rh-head">
        <span class="rh-title">🔙 Rappeler à la base</span>
        <button
          type="button"
          class="rh-x"
          aria-label="Fermer"
          @click="emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>

      <p v-if="raidAt" class="rh-raid">
        ⚔️ Une armée arrive dans <b>{{ fmt(raidAt - now) }}</b> : seuls ceux rentrés avant elle
        défendront.
      </p>
      <p v-else class="rh-dim">Aucune armée en vue.</p>

      <button
        v-if="useful.length"
        type="button"
        class="rh-all"
        :disabled="busy"
        @click="recallMany(useful)"
      >
        🛡️ Rappeler ceux qui arrivent à temps ({{ useful.length }})
      </button>

      <p v-if="!lines.length" class="rh-dim">Tout le monde est à la base.</p>

      <div v-for="l in lines" :key="l.key" class="rh-line" :class="l.state">
        <div class="rh-who">
          <span v-if="l.hero" class="rh-pic hero" aria-hidden="true">🧝</span>
          <span v-else class="rh-pic"
            ><ChampionPortrait :champion-id="champ(l.advIds[0])?.championId ?? null">{{
              champ(l.advIds[0]) ? '🧑' : '❔'
            }}</ChampionPortrait></span
          >
          <span class="rh-main">
            <b>{{ l.hero ? 'Ton héros' : (champ(l.advIds[0])?.name ?? 'Champion') }}</b>
            <span v-if="l.hero && l.advIds.length" class="rh-dim">
              + {{ l.advIds.length }} champion{{ l.advIds.length > 1 ? 's' : '' }}</span
            >
            <span class="rh-where">{{ whereLabel(l) }}</span>
          </span>
        </div>

        <div class="rh-times">
          <span class="rh-t">
            <span class="rh-k">Sans rien faire</span>
            <span>{{
              l.homeAt === null ? 'reste dehors' : `à la base dans ${fmt(l.homeAt - now)}`
            }}</span>
            <span v-if="l.inTimeAnyway !== null" class="rh-v" :class="l.inTimeAnyway ? 'ok' : 'ko'">
              {{ l.inTimeAnyway ? '✅ avant l’assaut' : '⚠️ absent à l’assaut' }}
            </span>
          </span>
          <span v-if="l.backAt !== null" class="rh-t">
            <span class="rh-k">Rappelé</span>
            <span>à la base dans {{ fmt(l.backAt - now) }}</span>
            <span v-if="l.inTime !== null" class="rh-v" :class="l.inTime ? 'ok' : 'ko'">
              {{ l.inTime ? '✅ avant l’assaut' : '⚠️ trop tard' }}
            </span>
          </span>
        </div>

        <button
          v-if="l.action"
          type="button"
          class="rh-go"
          :disabled="busy"
          @click="recallMany([l])"
        >
          🔙 Rappeler
        </button>
        <p v-else-if="l.why" class="rh-why">🚫 {{ l.why }}</p>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { poiEmo, poiLabel } from '@/lib/expedition';
import { formatDuration } from '@/lib/duration';
import { homeRecallLines, usefulRecalls, type HomeRecallLine } from '@/lib/baseRecall';

const props = defineProps<{ modelValue: boolean; heroLevel: number }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();

const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => clearInterval(tick));

const raidAt = computed(() => char.row?.base?.raid?.arrivesAt ?? null);
const lines = computed(() =>
  props.modelValue
    ? homeRecallLines({
        now: now.value,
        raidAt: raidAt.value,
        expedition: char.row?.expedition,
        parties: char.partyList,
        map: char.row?.expedition_map,
        advs: char.advList,
        postArrival: (id, advId) => char.postRecallArrival(id, advId, now.value),
        heroPostArrival: () => char.heroPostRecallArrival(now.value),
      })
    : [],
);
const useful = computed(() => usefulRecalls(lines.value));

const champ = (id: string | undefined) => (id ? char.advList.find((a) => a.id === id) : undefined);
const fmt = (ms: number) => formatDuration(Math.max(0, ms));
function whereLabel(l: HomeRecallLine): string {
  if (!l.poi) return 'rentre à la base';
  const at = `${poiEmo(l.poi)} ${poiLabel(l.poi)}`;
  if (l.state === 'returning') return `rentre de ${at}`;
  if (l.state === 'going') return `en route vers ${at}`;
  return `posté à ${at}`;
}

const busy = ref(false);
async function recallMany(list: readonly HomeRecallLine[]) {
  const uid = auth.user?.id;
  if (!uid || busy.value || !list.length) return;
  const ok = await new Promise<boolean>((res) =>
    $q
      .dialog({
        title: list.length > 1 ? `Rappeler ${list.length} troupes ?` : 'Rappeler à la base ?',
        message:
          'Un voyage fait demi-tour : rien n’est gagné ni perdu, le lieu reste sur la carte. Un poste quitté reste à toi, mais moins bien défendu.',
        cancel: { label: 'Annuler', flat: true },
        ok: { label: 'Rappeler', color: 'primary', textColor: 'dark' },
      })
      .onOk(() => res(true))
      .onCancel(() => res(false))
      .onDismiss(() => res(false)),
  );
  if (!ok) return;
  busy.value = true;
  let done = 0;
  try {
    for (const l of list) {
      const a = l.action;
      if (!a) continue;
      const at = Date.now();
      if (a.kind === 'trip') {
        const why = await char.recallTrip(uid, a.target, at);
        if (why) {
          $q.notify({ type: 'warning', message: why });
          continue;
        }
      } else if (a.kind === 'post') {
        await char.releaseControlChampions(uid, a.pointId, [a.advId], at, props.heroLevel);
      } else {
        await char.recallHeroFromPost(uid, at);
      }
      done++;
    }
  } finally {
    busy.value = false;
  }
  if (done)
    $q.notify({
      type: 'positive',
      message: `🔙 ${done > 1 ? `${done} troupes rentrent` : 'En route vers la base'}.`,
    });
}
</script>

<style scoped>
.rh {
  width: 100%;
  max-width: 560px;
  max-height: 80dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rh-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rh-title {
  flex: 1;
  font-family: Oswald, sans-serif;
  font-size: 18px;
  font-weight: 700;
}
.rh-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.rh-raid {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  background: color-mix(in srgb, var(--d4) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--d4) 45%, transparent);
}
.rh-dim {
  margin: 0;
  color: var(--dim);
  font-size: 13px;
}
.rh-all,
.rh-go {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.rh-all:disabled,
.rh-go:disabled {
  opacity: 0.5;
  cursor: default;
}
.rh-line {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #1d1913;
  min-width: 0;
}
.rh-line.returning {
  border-style: dashed;
}
.rh-who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.rh-pic {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: var(--surface);
}
.rh-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 14px;
}
.rh-where {
  color: var(--dim);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.rh-times {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rh-t {
  flex: 1 1 140px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--surface);
  font-size: 12.5px;
  min-width: 0;
}
.rh-k {
  color: var(--dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rh-v.ok {
  color: var(--d1);
}
.rh-v.ko {
  color: var(--d3);
}
.rh-why {
  margin: 0;
  color: var(--dim);
  font-size: 12.5px;
}
</style>
