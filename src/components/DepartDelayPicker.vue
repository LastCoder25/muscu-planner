<template>
  <!-- ⏳ LE DÉPART : tout de suite, ou dans H h M min (demandé : « si une attaque arrive dans
       1 h 30, on les envoie dans 1 h 25 »). Partagé par la feuille de renfort et le rappel
       d'une garnison, pour qu'on programme partout de la même façon. -->
  <div class="dd">
    <div class="dd-when" role="group" :aria-label="label">
      <button
        type="button"
        class="dd-when-b"
        :class="{ on: modelValue === 0 }"
        :aria-pressed="modelValue === 0"
        @click="emit('update:modelValue', 0)"
      >
        Maintenant
      </button>
      <button
        type="button"
        class="dd-when-b"
        :class="{ on: modelValue > 0 }"
        :aria-pressed="modelValue > 0"
        @click="modelValue === 0 && emit('update:modelValue', 60)"
      >
        ⏳ Programmer
      </button>
    </div>
    <div v-if="modelValue > 0" class="dd-delay">
      <span class="dd-lab">{{ label }} dans</span>
      <span class="dd-step">
        <button
          type="button"
          class="dd-step-b"
          aria-label="Une heure de moins"
          :disabled="modelValue < 60 + 5"
          @click="emit('update:modelValue', modelValue - 60)"
        >
          −
        </button>
        <b class="dd-step-n">{{ Math.floor(modelValue / 60) }} h</b>
        <button
          type="button"
          class="dd-step-b"
          aria-label="Une heure de plus"
          :disabled="modelValue + 60 > maxDelayMin"
          @click="emit('update:modelValue', modelValue + 60)"
        >
          ＋
        </button>
      </span>
      <span class="dd-step">
        <button
          type="button"
          class="dd-step-b"
          aria-label="Cinq minutes de moins"
          :disabled="modelValue <= 5"
          @click="emit('update:modelValue', modelValue - 5)"
        >
          −
        </button>
        <b class="dd-step-n">{{ String(modelValue % 60).padStart(2, '0') }} min</b>
        <button
          type="button"
          class="dd-step-b"
          aria-label="Cinq minutes de plus"
          :disabled="modelValue + 5 > maxDelayMin"
          @click="emit('update:modelValue', modelValue + 5)"
        >
          ＋
        </button>
      </span>
      <span v-if="at" class="dd-at">{{ label.toLowerCase() }} à {{ at }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Minutes avant le départ ; 0 = tout de suite. */
  modelValue: number;
  maxDelayMin: number;
  /** L'heure du départ, lisible (« 21:45 »), ou rien. */
  at?: string | null;
  /** « Départ », « Retour »… */
  label?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [number] }>();
const label = computed(() => props.label ?? 'Départ');
</script>

<style scoped>
.dd-when {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
}
.dd-when-b {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.dd-when-b.on {
  border: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2, var(--bg)));
}
.dd-delay {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.dd-lab {
  width: 100%;
  color: var(--dim);
}
.dd-at {
  width: 100%;
  color: var(--dim);
  font-size: 12px;
}
.dd-step {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dd-step-b {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.dd-step-b:disabled {
  opacity: 0.4;
  cursor: default;
}
.dd-step-n {
  min-width: 22px;
  text-align: center;
  font-family: Oswald, sans-serif;
  font-size: 18px;
}
</style>
