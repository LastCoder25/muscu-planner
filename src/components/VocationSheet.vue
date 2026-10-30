<template>
  <!-- 📓 LE CARNET DE VOCATION d'un champion (v1.283.0). ⚠️ Aucune règle ici : points, états des
       tuiles, refus et lectures viennent de `vocation.ts` ; le store écrit, une fois par geste.
       Les tuiles sont des boutons (≥ 44 px), tout se replie sous 344 px. -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    no-refocus
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="adv" class="vc">
      <div class="vc-head">
        <span class="vc-title">📓 Carnet de vocation</span>
        <button
          type="button"
          class="vc-x"
          aria-label="Fermer"
          @click="emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>

      <div class="vc-who">
        <span class="vc-pic"
          ><ChampionPortrait :champion-id="adv.championId ?? null">🧑</ChampionPortrait></span
        >
        <span class="vc-name">
          <b>{{ adv.name }}</b>
          <span class="vc-dim">{{ lineageLabel }}</span>
        </span>
      </div>

      <div class="vc-chips">
        <span class="vc-chip pts" :class="{ none: free === 0 }">
          🎯 {{ free }} point{{ free > 1 ? 's' : '' }} à dépenser
        </span>
        <span v-if="pending.length" class="vc-chip wait">
          ⏳ {{ pending.length }} rendu{{ pending.length > 1 ? 's' : '' }} dans
          {{ formatDuration(pending[0]! - now) }}
        </span>
        <span class="vc-chip dim">sur {{ total }} au total, pour tout le vivier</span>
      </div>

      <p v-if="!tree" class="vc-note">
        Le carnet de la lignée « {{ lineageLabel }} » n’est pas encore ouvert. Les guerriers ouvrent
        la marche ; les autres lignées suivront.
      </p>

      <template v-if="tree">
        <h3 class="vc-sec">🔭 Lectures</h3>
        <div class="vc-grid">
          <div
            v-for="n in infoNodes"
            :key="n.id"
            class="vc-tile"
            :class="[stateOf(n), { owned: stateOf(n) === 'owned' }]"
          >
            <div class="vc-tile-top">
              <span class="vc-emo" aria-hidden="true">{{ n.emoji }}</span>
              <span class="vc-tile-main">
                <b>{{ n.label }}</b>
                <span class="vc-dim">{{ n.text }}</span>
              </span>
            </div>
            <p v-if="stateOf(n) === 'owned' && n.spawn" class="vc-reading">
              {{ readingFor(n.spawn) }}
            </p>
            <button
              type="button"
              class="vc-btn"
              :class="{ off: stateOf(n) === 'short' }"
              :disabled="busy || stateOf(n) === 'short'"
              @click="stateOf(n) === 'owned' ? forget(n) : learn(n)"
            >
              <template v-if="stateOf(n) === 'owned'">↩️ Retirer</template>
              <template v-else-if="stateOf(n) === 'short'">Pas assez de points</template>
              <template v-else>Apprendre · {{ n.cost }} pt</template>
            </button>
          </div>
        </div>

        <h3 class="vc-sec">⚔️ Voies <span class="vc-dim">— l’une ou l’autre</span></h3>
        <div class="vc-grid">
          <div
            v-for="n in majorNodes"
            :key="n.id"
            class="vc-tile major"
            :class="[stateOf(n), { owned: stateOf(n) === 'owned' }]"
          >
            <div class="vc-tile-top">
              <span class="vc-emo" aria-hidden="true">{{ n.emoji }}</span>
              <span class="vc-tile-main">
                <b>{{ n.label }}</b>
                <span class="vc-dim">{{ n.text }}</span>
              </span>
            </div>
            <p v-if="stateOf(n) === 'excluded'" class="vc-dim">
              Barré : tu as pris l’autre voie. Retire-la d’abord.
            </p>
            <button
              type="button"
              class="vc-btn"
              :class="{ off: stateOf(n) === 'short' }"
              :disabled="busy || stateOf(n) === 'short' || stateOf(n) === 'excluded'"
              @click="stateOf(n) === 'owned' ? forget(n) : learn(n)"
            >
              <template v-if="stateOf(n) === 'owned'">↩️ Retirer</template>
              <template v-else-if="stateOf(n) === 'excluded'">Indisponible</template>
              <template v-else-if="stateOf(n) === 'short'">Pas assez de points</template>
              <template v-else>Apprendre · {{ n.cost }} pts</template>
            </button>
          </div>
        </div>
      </template>

      <h3 class="vc-sec">
        🏅 Vétérance <span class="vc-dim">— un titre à {{ VET.tier }} victoires, sans effet</span>
      </h3>
      <div class="vc-grid">
        <div v-for="l in vet" :key="l.faction" class="vc-tile vet" :class="{ owned: l.earned }">
          <div class="vc-tile-top">
            <span class="vc-emo" aria-hidden="true">{{ l.emoji }}</span>
            <span class="vc-tile-main">
              <b>{{ l.earned ? l.label : FACTION_LABEL[l.faction] }}</b>
              <span class="vc-dim">
                {{ l.earned ? `${l.wins} victoires` : `${l.wins} / ${VET.tier} victoires` }}
              </span>
            </span>
          </div>
          <div class="vc-bar" aria-hidden="true">
            <span :style="{ width: Math.min(100, (l.wins / VET.tier) * 100) + '%' }" />
          </div>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { advChampion } from '@/lib/adventurers';
import { buildingLevel } from '@/lib/buildings';
import { spawnsForecast } from '@/lib/archipelago';
import { formatDuration } from '@/lib/duration';
import { FACTION_LABEL } from '@/lib/raid';
import {
  VET,
  VOCATION,
  nextOfGroup,
  nodeState,
  pendingPoints,
  readableGroups,
  readingText,
  vetLines,
  vocationBudget,
  vocationFree,
  vocationTree,
  type SpawnAhead,
  type SpawnGroup,
  type VocationNode,
} from '@/lib/vocation';

const props = defineProps<{
  modelValue: boolean;
  advId: string | null;
  /** Le niveau du héros (budget de points, et niveau vu par la carte). */
  heroLevel: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();

const busy = ref(false);
/** L'heure de l'ouverture / du dernier geste : jamais une horloge qui défile (les lectures
 *  coûtent un rejeu de la carte). */
const now = ref(Date.now());
const roster = computed(() => char.row?.adventurers ?? []);
const adv = computed(() => roster.value.find((a) => a.id === props.advId) ?? null);
const tree = computed(() => (adv.value ? vocationTree(adv.value) : null));
const infoNodes = computed(() => (tree.value ?? []).filter((n) => n.kind === 'info'));
const majorNodes = computed(() => (tree.value ?? []).filter((n) => n.kind === 'major'));
const free = computed(() => vocationFree(roster.value, props.heroLevel, now.value));
const pending = computed(() => pendingPoints(roster.value, now.value));
const total = computed(() => vocationBudget(props.heroLevel));
const vet = computed(() => (adv.value ? vetLines(adv.value) : []));
const lineageLabel = computed(() => {
  const l = adv.value ? advChampion(adv.value)?.lineage : undefined;
  return l ? (LINEAGE_LABEL[l] ?? l) : 'sans lignée';
});
const LINEAGE_LABEL: Record<string, string> = {
  guerrier: 'Guerrier',
  archer: 'Archer',
  mage: 'Mage',
  homme_armes: 'Homme d’armes',
  eclaireur: 'Éclaireur',
  caravanier: 'Caravanier',
};
const stateOf = (n: VocationNode) =>
  nodeState(roster.value, adv.value!, n, props.heroLevel, now.value);

// 🔭 Les lectures : un rejeu de la carte, fait à l'ouverture et quand un nœud de lecture change.
const spawns = ref<SpawnAhead[] | null>(null);
const groupsKey = computed(() => (adv.value ? readableGroups(adv.value).join('|') : ''));
watch(
  [() => props.modelValue, groupsKey],
  ([open, key]) => {
    if (!open) return;
    now.value = Date.now();
    const map = char.row?.expedition_map;
    spawns.value =
      key && map
        ? spawnsForecast(
            map,
            now.value,
            props.heroLevel,
            buildingLevel(char.row?.buildings ?? [], 'outpost'),
            char.row?.expedition?.poi.id,
          )
        : null;
  },
  { immediate: true },
);
const readingFor = (g: SpawnGroup) =>
  spawns.value ? readingText(nextOfGroup(spawns.value, g), now.value) : 'Lecture indisponible.';

async function act(fn: (uid: string) => Promise<string | null>, ok: string) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const why = await fn(uid);
    now.value = Date.now();
    $q.notify(why ? { type: 'warning', message: why } : { type: 'positive', message: ok });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Échec de l’écriture',
    });
  } finally {
    busy.value = false;
  }
}
const learn = (n: VocationNode) =>
  act((uid) => char.learnVocation(uid, props.advId!, n.id), `${n.emoji} ${n.label} appris.`);
function forget(n: VocationNode) {
  $q.dialog({
    title: `Retirer « ${n.label} » ?`,
    message: `L’effet cesse tout de suite. Les ${n.cost} point${n.cost > 1 ? 's' : ''} ne seront de nouveau dépensables que dans ${formatDuration(VOCATION.refundMs)}.`,
    cancel: { label: 'Garder', flat: true },
    ok: { label: 'Retirer', color: 'primary', textColor: 'dark' },
  }).onOk(
    () => void act((uid) => char.forgetVocation(uid, props.advId!, n.id), `${n.label} retiré.`),
  );
}
</script>

<style scoped>
.vc {
  width: 100%;
  max-width: 560px;
  max-height: 85dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vc-head,
.vc-who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.vc-title {
  flex: 1;
  font-family: Oswald, sans-serif;
  font-size: 18px;
  font-weight: 700;
}
.vc-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.vc-pic {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: var(--bg);
}
.vc-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 14px;
}
.vc-dim {
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 400;
}
.vc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.vc-chip {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 12.5px;
  background: var(--bg);
}
.vc-chip.pts {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.vc-chip.pts.none {
  border-color: var(--line);
  color: var(--dim);
}
.vc-chip.wait {
  border-style: dashed;
}
.vc-chip.dim {
  color: var(--dim);
}
.vc-note {
  margin: 0;
  padding: 10px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  color: var(--dim);
  font-size: 13px;
}
.vc-sec {
  margin: 6px 0 0;
  font-family: Oswald, sans-serif;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.vc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
  gap: 8px;
}
.vc-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #1d1913;
  min-width: 0;
}
.vc-tile.owned {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, #1d1913);
}
.vc-tile.excluded {
  opacity: 0.55;
  border-style: dashed;
}
.vc-tile.excluded b {
  text-decoration: line-through;
}
.vc-tile-top {
  display: flex;
  gap: 10px;
  min-width: 0;
}
.vc-emo {
  flex: none;
  font-size: 26px;
  line-height: 1.1;
}
.vc-tile-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.vc-reading {
  margin: 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--bg);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.vc-btn {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.vc-btn:disabled,
.vc-btn.off {
  opacity: 0.5;
  cursor: default;
  border-color: var(--line);
  background: transparent;
}
.vc-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--bg);
  overflow: hidden;
}
.vc-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
</style>
