<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="setlog-card">
      <div class="sl-title font-display">{{ title }}</div>
      <div class="sl-desc">{{ desc || 'reps & poids' }}</div>
      <!-- Fourchette conseillée : rappel de la consigne au moment de saisir. Elle est
           surtout affichée AVANT la série (fiche du 360, séance générée) ; ici elle
           justifie la valeur préremplie et sert de repère pour la série suivante. -->
      <div v-if="hint" class="sl-goal">🎯 {{ hint }}</div>
      <div class="sl-row">
        <span class="sl-lbl">Reps</span>
        <q-input v-model.number="reps" type="number" filled dense style="max-width: 110px" />
      </div>
      <div class="sl-row">
        <span class="sl-lbl">Poids</span>
        <q-input
          v-model.number="weight"
          type="number"
          filled
          dense
          suffix="kg"
          style="max-width: 130px"
        />
        <span class="sl-hint">vide = PdC</span>
      </div>
      <!-- 🟦 Élastique : l'assistance (il aide) et la résistance (il rend l'exo plus dur) sont
           deux choses — un seul état à la fois. Réservé au Défi 360 (`bandable`). -->
      <div v-if="assistable && bandable" class="sl-elastic">
        <span class="sl-lbl">Élastique</span>
        <div class="sl-seg" role="group" aria-label="Élastique">
          <button
            v-for="m in ELASTIC_MODES"
            :key="m.id"
            type="button"
            class="sl-seg-b"
            :class="{ on: elastic === m.id }"
            :aria-pressed="elastic === m.id"
            @click="elastic = m.id"
          >
            {{ m.label }}
          </button>
        </div>
        <div v-if="elastic === 'resist'" class="sl-seg sl-bands" role="group" aria-label="Niveau">
          <button
            v-for="b in ELASTIC_BANDS"
            :key="b.id"
            type="button"
            class="sl-seg-b"
            :class="{ on: band === b.id }"
            :aria-pressed="band === b.id"
            @click="band = b.id"
          >
            {{ b.label }}
          </button>
        </div>
        <span class="sl-hint">{{ elasticHint }}</span>
      </div>
      <div v-else-if="assistable" class="sl-row">
        <span class="sl-lbl">Assisté</span>
        <q-toggle v-model="assisted" />
        <span class="sl-hint">élastique → ×0,6</span>
      </div>
      <div class="sl-actions">
        <!-- Retrait d’une série : il vivait en bouton ↩ sur CHAQUE ligne d'exo et leur prenait
             la place des cases. Il a sa place ici, là où l'on gère les séries. Le libellé vient
             du parent : « la dernière » à l’ajout, « cette série » quand on en corrige une. -->
        <q-btn v-if="undoLabel" flat no-caps class="sl-undo" :label="undoLabel" @click="undo" />
        <q-btn flat no-caps label="Annuler" @click="emit('update:modelValue', false)" />
        <q-btn
          unelevated
          color="primary"
          text-color="dark"
          no-caps
          :label="saveLabel || 'Valider'"
          @click="save"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
// Dialogue de saisie d'une SÉRIE (reps + poids + assisté), partagé par le Défi 360
// (fiche + séance générée) et les défis simples en mode Séries (ChallengeDetailPage).
import { ref, watch, computed } from 'vue';
import { ELASTIC_BANDS, type ElasticBand } from '@/lib/combo';

type ElasticMode = 'none' | 'assist' | 'resist';
const ELASTIC_MODES: { id: ElasticMode; label: string }[] = [
  { id: 'none', label: 'Aucun' },
  { id: 'assist', label: 'Assisté' },
  { id: 'resist', label: 'Résistance' },
];

const props = defineProps<{
  modelValue: boolean;
  title: string;
  desc?: string;
  assistable?: boolean;
  /** Propose l'élastique de RÉSISTANCE en plus de l'assistance (Défi 360). */
  bandable?: boolean;
  hint?: string; // ex. « 8–12 reps » — fourchette conseillée pour cet exo
  initialReps?: number;
  initialWeight?: number | null;
  initialAssisted?: boolean;
  initialBand?: ElasticBand | null;
  undoLabel?: string; // présent = on peut retirer une série (le parent confirme)
  saveLabel?: string; // « Enregistrer » quand on corrige une série existante
}>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  save: [{ reps: number; weight: number | null; assisted: boolean; band: ElasticBand | null }];
  undo: [];
}>();

const reps = ref(props.initialReps ?? 10);
const weight = ref<number | null>(props.initialWeight ?? null);
const assisted = ref(!!props.initialAssisted);
const band = ref<ElasticBand | null>(props.initialBand ?? null);
function modeOf(): ElasticMode {
  return props.initialAssisted ? 'assist' : props.initialBand ? 'resist' : 'none';
}
const elastic = ref<ElasticMode>(modeOf());
const elasticHint = computed(() =>
  elastic.value === 'assist'
    ? 'il aide → ×0,6'
    : elastic.value === 'resist'
      ? 'il rend l’exo plus dur'
      : 'sans élastique',
);

// Reseed les champs à chaque ouverture (préremplissage fourni par le parent).
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    reps.value = props.initialReps ?? 10;
    weight.value = props.initialWeight ?? null;
    assisted.value = !!props.initialAssisted;
    band.value = props.initialBand ?? null;
    elastic.value = modeOf();
  },
);

function undo() {
  emit('update:modelValue', false);
  emit('undo');
}

function save() {
  const r = Math.max(1, Math.round(reps.value || 0));
  const w = weight.value != null && weight.value > 0 ? weight.value : null;
  // Avec le sélecteur d'élastique, l'état est celui des trois boutons ; sinon, l'ancien interrupteur.
  const useMode = !!(props.assistable && props.bandable);
  const isAssisted = useMode ? elastic.value === 'assist' : !!(props.assistable && assisted.value);
  // Résistance sans niveau choisi : « moyen » (jamais une résistance sans niveau).
  const bandOut = useMode && elastic.value === 'resist' ? (band.value ?? 'medium') : null;
  emit('save', { reps: r, weight: w, assisted: isAssisted, band: bandOut });
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.setlog-card {
  background: var(--surface);
  color: var(--text);
  padding: 18px 16px;
  border-radius: 16px;
  width: 320px;
  max-width: 92vw;
}
.sl-title {
  font-size: 18px;
  font-weight: 700;
}
.sl-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 4px 0 6px;
}
.sl-goal {
  font-size: 13px;
  color: var(--accent);
  margin: 0 0 14px;
}
.sl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sl-lbl {
  font-size: 13px;
  color: var(--dim);
  min-width: 46px;
}
.sl-elastic {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.sl-seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 6px;
}
.sl-bands {
  grid-auto-flow: row;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.sl-seg-b {
  min-height: 44px;
  padding: 8px 6px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sl-seg-b.on {
  border-color: var(--accent);
  color: var(--accent);
}
.sl-hint {
  font-size: 11px;
  color: var(--dim);
}
.sl-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.sl-undo {
  margin-right: auto;
  color: var(--d4);
}
</style>
