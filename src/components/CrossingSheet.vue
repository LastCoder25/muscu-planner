<!--
  ⛵ QUI EMBARQUE ? (option A, décision de l'utilisateur 2026-10-03)
  La première traversée vers une île se fait avec le héros (elle fait naître l'île) ; vers une
  île déjà visitée, le héros est facultatif : sans lui, les champions naviguent seuls et la
  carte ne change pas. On choisit les champions, tous cochés au départ.
  Le composant ne décide rien : les refus viennent du store (`crossingBlock`, `sailingBlocker`).
-->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <div v-if="to !== null" class="cs">
      <header class="cs-head">
        <span class="cs-ico" aria-hidden="true">⛵</span>
        <div>
          <div class="cs-title">
            {{ from === activeId ? `Vers l'île ${to}` : `De l'île ${from} vers l'île ${to}` }}
          </div>
          <div class="cs-sub">
            Départ à {{ clock(leaveAt) }} · arrivée à {{ clock(leaveAt + travelMs) }}
          </div>
          <div v-if="hero && heroDepartAt > departAt" class="cs-wait">
            ⏳ Le départ attend le retour de tes troupes parties vers un lieu fixe.
          </div>
        </div>
      </header>

      <!-- 🦸 Le héros : obligatoire vers une île jamais visitée, facultatif ensuite, absent
           quand on fait revenir des champions d'une autre île. -->
      <button
        v-if="heroMode !== 'none'"
        type="button"
        class="cs-hero"
        :class="{ on: hero, forced: heroMode === 'forced' }"
        :aria-pressed="hero"
        :disabled="heroMode === 'forced'"
        @click="hero = !hero"
      >
        <span class="cs-hero-ico" aria-hidden="true">🦸</span>
        <span class="cs-hero-txt">
          <b>Ton héros {{ hero ? 'embarque' : 'reste ici' }}</b>
          <small v-if="heroMode === 'forced'"
            >Première traversée vers cette île : elle se fait avec lui.</small
          >
          <small v-else-if="hero">Toute la carte passe sur l'île {{ to }}.</small>
          <small v-else>Les champions naviguent seuls ; tu restes sur l'île {{ activeId }}.</small>
        </span>
        <span class="cs-check" aria-hidden="true">{{ hero ? '✓' : '' }}</span>
      </button>
      <p v-if="hero && heroBlock" class="cs-block">{{ heroBlock }}</p>

      <!-- ⛵ Vers l'île suivante (décision de l'utilisateur, 2026-10-03) : pas de choix, tout
           le monde part, et l'île quittée est pacifiée. -->
      <div v-if="forward" class="cs-forward">
        <p>
          <b>🧭 Tous tes champions te suivent</b>, y compris ceux postés sur un lieu fixe ou restés
          sur une autre île. Ils débarquent avec toi à l'arrivée.
        </p>
        <p>
          <b>🕊️ L'île {{ from }} est pacifiée</b> : camps, failles et armées disparaissent, seuls
          ses lieux fixes restent. Ils produisent toujours, gardés par ta milice.
        </p>
      </div>
      <template v-else>
        <div class="cs-bar">
          <span
            >{{ picked.length }}/{{ candidates.length }} champion{{
              candidates.length > 1 ? 's' : ''
            }}</span
          >
          <button v-if="candidates.length" type="button" class="cs-all" @click="toggleAll">
            {{ picked.length === candidates.length ? 'Aucun' : 'Tous' }}
          </button>
        </div>
        <div v-if="candidates.length" class="cs-grid">
          <AdvPickTile
            v-for="a in candidates"
            :key="a.id"
            :adv="a"
            :on="picked.includes(a.id)"
            @toggle="toggle(a.id)"
          />
        </div>
        <p v-else class="cs-empty">Aucun champion libre ici.</p>
        <p class="cs-note">
          Les champions postés sur un lieu, en route ou blessés restent où ils sont.
        </p>
      </template>

      <div class="cs-actions">
        <q-btn flat no-caps label="Annuler" @click="emit('update:modelValue', false)" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          text-color="dark"
          class="cs-go"
          :disable="!canGo || busy"
          :label="goLabel"
          @click="emit('confirm', { hero, ids: [...picked] })"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import type { Adventurer } from '@/lib/adventurers';
import { CROSSING } from '@/lib/crossing';

const props = defineProps<{
  modelValue: boolean;
  from: number;
  to: number | null;
  activeId: number;
  /** 'forced' : île jamais visitée · 'optional' : déjà visitée · 'none' : retour d'une île rangée. */
  heroMode: 'forced' | 'optional' | 'none';
  /** Pourquoi le héros ne peut pas partir (texte), null s'il le peut. */
  heroBlock: string | null;
  candidates: Adventurer[];
  /** Le départ d'une navigation sans héros (tout de suite). */
  departAt: number;
  /** Le départ avec le héros : après le retour des troupes encore en marche. */
  heroDepartAt: number;
  busy?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  confirm: [{ hero: boolean; ids: string[] }];
}>();

const travelMs = CROSSING.travelMs;
const leaveAt = computed(() => (hero.value ? props.heroDepartAt : props.departAt));
const hero = ref(true);
const picked = ref<string[]>([]);
// À chaque ouverture : héros embarqué s'il le peut, tous les champions cochés.
watch(
  () => [props.modelValue, props.to] as const,
  ([open]) => {
    if (!open) return;
    // Héros retenu (expédition, troupes en marche) : on part sur « champions seuls », pas
    // sur un bouton grisé — sauf vers une île neuve, où il est obligatoire.
    hero.value = props.heroMode === 'forced' || (props.heroMode === 'optional' && !props.heroBlock);
    picked.value = props.candidates.map((a) => a.id);
  },
  { immediate: true },
);
const toggle = (id: string) => {
  picked.value = picked.value.includes(id)
    ? picked.value.filter((x) => x !== id)
    : [...picked.value, id];
};
const toggleAll = () => {
  picked.value =
    picked.value.length === props.candidates.length ? [] : props.candidates.map((a) => a.id);
};
/** ⛵ Le héros part vers l'île suivante : tout le monde suit, l'île quittée est pacifiée. */
const forward = computed(
  () => hero.value && props.to !== null && props.from === props.activeId && props.to > props.from,
);
const canGo = computed(() => (hero.value ? !props.heroBlock : picked.value.length > 0));
const goLabel = computed(() => {
  if (forward.value) return '⛵ Embarquer avec tous les champions';
  const n = picked.value.length;
  const champs = `${n} champion${n > 1 ? 's' : ''}`;
  return hero.value ? `⛵ Embarquer : le héros et ${champs}` : `⛵ Faire naviguer ${champs}`;
});
const clock = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
</script>

<style scoped lang="scss">
.cs {
  width: min(94vw, 520px);
  max-height: 88dvh;
  overflow-y: auto;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cs-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cs-ico {
  font-size: 26px;
}
.cs-title {
  font-family: Oswald, sans-serif;
  font-size: 19px;
  font-weight: 600;
}
.cs-wait {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--d3);
}
.cs-sub,
.cs-note,
.cs-empty {
  font-size: 12.5px;
  color: var(--dim);
  margin: 0;
}
.cs-hero {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2, transparent);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.cs-hero.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.cs-hero.forced {
  cursor: default;
  opacity: 1;
}
.cs-hero-ico {
  font-size: 22px;
}
.cs-hero-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-hero-txt small {
  color: var(--dim);
  font-size: 12px;
}
.cs-check {
  width: 22px;
  font-weight: 800;
  color: var(--accent);
}
.cs-block {
  margin: 0;
  font-size: 12.5px;
  color: var(--d3);
}
.cs-forward {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  font-size: 13px;
  p {
    margin: 0;
  }
}
.cs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 700;
}
.cs-all {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.cs-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.cs-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.cs-go {
  min-height: 44px;
  font-weight: 700;
}
</style>
