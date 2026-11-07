<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="setlog-card">
      <header class="sl-head">
        <div class="sl-title font-display">{{ title }}</div>
        <div class="sl-desc">{{ desc || 'reps & poids' }}</div>
        <!-- Fourchette conseillée : rappel de la consigne au moment de saisir. Elle est
             surtout affichée AVANT la série (fiche du 360, séance générée) ; ici elle
             justifie la valeur préremplie et sert de repère pour la série suivante. -->
        <span v-if="hint" class="sl-goal">🎯 {{ hint }}</span>
      </header>

      <!-- 🔢 REPS : un grand chiffre, des ± et la fourchette de l'exo en pastilles. -->
      <section class="sl-block" aria-label="Répétitions">
        <div class="sl-cap">Reps</div>
        <div class="sl-step">
          <button
            type="button"
            class="sl-pm"
            aria-label="Une rep de moins"
            :disabled="reps <= 1"
            @click="bumpReps(-1)"
          >
            −
          </button>
          <div class="sl-val sl-val-edit">
            <input
              v-model.number="reps"
              class="sl-num font-display"
              type="number"
              inputmode="numeric"
              min="1"
              aria-label="Nombre de reps"
              @focus="selectAll"
            />
          </div>
          <button type="button" class="sl-pm" aria-label="Une rep de plus" @click="bumpReps(1)">
            +
          </button>
        </div>
        <div v-if="quickReps.length" class="sl-quick" role="group" aria-label="Reps rapides">
          <button
            v-for="n in quickReps"
            :key="n"
            type="button"
            class="sl-chip"
            :class="{ on: reps === n }"
            :aria-pressed="reps === n"
            @click="reps = n"
          >
            {{ n }}
          </button>
        </div>
      </section>

      <!-- ⚖️ CHARGE. Exo au poids du corps (360) : lest et élastique forment UN bloc. Assisté →
           plus de lest (une aide et un lest se contredisent) ; résistance → les deux comptent. -->
      <section class="sl-block" :class="{ off: lestOff }" aria-label="Charge">
        <div class="sl-cap">{{ chargeBlock ? 'Lest' : 'Poids' }}</div>
        <div class="sl-step">
          <button
            type="button"
            class="sl-pm"
            aria-label="Moins de poids"
            :disabled="lestOff || !weight"
            @click="bumpWeight(-1)"
          >
            −
          </button>
          <div class="sl-val sl-val-edit">
            <input
              v-model.number="weight"
              class="sl-num font-display"
              type="number"
              inputmode="decimal"
              step="0.5"
              min="0"
              placeholder="—"
              :disabled="lestOff"
              aria-label="Poids en kilos"
              @focus="selectAll"
            />
            <span class="sl-unit">kg</span>
          </div>
          <button
            type="button"
            class="sl-pm"
            aria-label="Plus de poids"
            :disabled="lestOff"
            @click="bumpWeight(1)"
          >
            +
          </button>
        </div>
        <div class="sl-sub">
          {{
            lestOff ? 'Pas de lest quand l’élastique t’aide' : 'Vide = poids du corps · pas de 2,5 kg'
          }}
        </div>
      </section>

      <!-- 🟦 ÉLASTIQUE : il aide OU il résiste, jamais les deux (Défi 360, `bandable`). -->
      <section v-if="chargeBlock" class="sl-block" aria-label="Élastique">
        <div class="sl-cap">Élastique <span class="sl-one">un seul à la fois</span></div>
        <div class="sl-tiles" role="group" aria-label="Rôle de l’élastique">
          <button
            v-for="m in ELASTIC_MODES"
            :key="m.id"
            type="button"
            class="sl-tile"
            :class="[`m-${m.id}`, { on: elastic === m.id }]"
            :aria-pressed="elastic === m.id"
            @click="elastic = m.id"
          >
            <span class="st-ico" aria-hidden="true">{{ m.ico }}</span>
            <span class="st-t">{{ m.label }}</span>
            <span class="st-s">{{ m.sub }}</span>
          </button>
        </div>
        <div v-if="elastic === 'resist'" class="sl-bands" role="group" aria-label="Niveau">
          <button
            v-for="(b, i) in ELASTIC_BANDS"
            :key="b.id"
            type="button"
            class="sl-band"
            :class="{ on: band === b.id }"
            :aria-pressed="band === b.id"
            @click="band = b.id"
          >
            <span class="sb-bars" aria-hidden="true">
              <i v-for="k in 4" :key="k" :class="{ lit: k <= i + 1 }" :style="{ height: 5 + k * 4 + 'px' }" />
            </span>
            <span class="sb-t">{{ b.label }}</span>
          </button>
        </div>
        <p class="sl-rule" :class="`m-${elastic}`" data-test="elastic-rule">{{ elasticHint }}</p>
      </section>
      <div v-else-if="assistable" class="sl-toggle">
        <span class="sl-cap sl-cap-inline">Assisté</span>
        <q-toggle v-model="assisted" />
        <span class="sl-sub sl-sub-inline">avec un élastique qui aide</span>
      </div>

      <div class="sl-actions">
        <!-- Retrait d’une série : il vivait en bouton ↩ sur CHAQUE ligne d'exo et leur prenait
             la place des cases. Il a sa place ici, là où l'on gère les séries. Le libellé vient
             du parent : « la dernière » à l’ajout, « cette série » quand on en corrige une. -->
        <q-btn v-if="undoLabel" flat no-caps class="sl-undo" :label="undoLabel" @click="undo" />
        <q-btn flat no-caps label="Annuler" @click="emit('update:modelValue', false)" />
        <q-btn
          unelevated
          no-caps
          class="sl-ok"
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
import { ELASTIC_BANDS, repQuickPicks, stepWeight, type ElasticBand } from '@/lib/combo';

type ElasticMode = 'none' | 'assist' | 'resist';
const ELASTIC_MODES: { id: ElasticMode; label: string; sub: string; ico: string }[] = [
  { id: 'none', label: 'Aucun', sub: 'sans bande', ico: '○' },
  { id: 'assist', label: 'Assisté', sub: 'plus facile', ico: '🟧' },
  { id: 'resist', label: 'Résistance', sub: 'plus dur', ico: '🟦' },
];

const props = defineProps<{
  modelValue: boolean;
  title: string;
  desc?: string;
  assistable?: boolean;
  /** Reps proposées en pastilles (saisie rapide). Absent = 8 à 12 ; vide = aucune (durée). */
  repOptions?: number[];
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
const quickReps = computed(() => props.repOptions ?? repQuickPicks());
const weight = ref<number | null>(props.initialWeight ?? null);
const assisted = ref(!!props.initialAssisted);
const band = ref<ElasticBand | null>(props.initialBand ?? null);
function modeOf(): ElasticMode {
  return props.initialAssisted ? 'assist' : props.initialBand ? 'resist' : 'none';
}
const elastic = ref<ElasticMode>(modeOf());
/** Exo au poids du corps du Défi 360 : lest + élastique regroupés. */
const chargeBlock = computed(() => !!(props.assistable && props.bandable));
/** Assisté : pas de lest (grisé, et non enregistré). */
const lestOff = computed(() => chargeBlock.value && elastic.value === 'assist');
/** La règle de l'état choisi, en clair : ce qui s'exclut et ce qui se cumule. */
const elasticHint = computed(() =>
  elastic.value === 'assist'
    ? 'L’élastique t’aide : pas de lest sur cette série.'
    : elastic.value === 'resist'
      ? 'L’élastique rend l’exo plus dur : il s’ajoute au lest, si tu en mets.'
      : 'Poids du corps, plus un lest si tu en ajoutes.',
);

/** Toucher un chiffre le sélectionne en entier : taper remplace, sans effacer à la main. */
function selectAll(e: Event) {
  (e.target as HTMLInputElement).select();
}

/** Steppers de la charte : ±1 rep, ±2,5 kg (pas de clavier en salle). */
function bumpReps(d: number) {
  reps.value = Math.max(1, Math.round((reps.value || 0) + d));
}
function bumpWeight(d: 1 | -1) {
  weight.value = stepWeight(weight.value, d);
}

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
  const w = weight.value != null && weight.value > 0 && !lestOff.value ? weight.value : null;
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
  padding: 16px 14px 12px;
  border-radius: 20px;
  width: 340px;
  max-width: 94vw;
  max-height: 94vh;
  overflow-y: auto;
}
.sl-head {
  margin-bottom: 14px;
}
.sl-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.01em;
}
.sl-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 3px 0 8px;
}
.sl-goal {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

/* Un bloc = une carte légère : reps, charge, élastique se lisent comme trois étages. */
.sl-block {
  padding: 10px 10px 12px;
  margin-bottom: 10px;
  border-radius: 16px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  transition: opacity 0.15s;
}
.sl-block.off {
  opacity: 0.5;
}
.sl-cap {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.sl-cap-inline {
  margin: 0;
}
.sl-one {
  margin-left: 6px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  opacity: 0.8;
}
.sl-sub {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--dim);
  text-align: center;
}
.sl-sub-inline {
  margin: 0;
}

/* Stepper : [−]  GRAND CHIFFRE  [+] */
.sl-step {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  align-items: center;
  gap: 8px;
}
.sl-pm {
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 26px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    transform 0.08s,
    background 0.15s;
}
.sl-pm:active:not(:disabled) {
  transform: scale(0.94);
  background: var(--surface-2);
}
.sl-pm:disabled {
  opacity: 0.35;
  cursor: default;
}
.sl-val {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  min-width: 0;
}
.sl-num {
  width: 100%;
  min-width: 0;
  max-width: 110px;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 44px;
  font-weight: 600;
  line-height: 1.1;
  text-align: center;
  -moz-appearance: textfield;
  appearance: textfield;
}
.sl-num::-webkit-outer-spin-button,
.sl-num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.sl-num::placeholder {
  color: var(--dim);
  opacity: 0.6;
}
.sl-num:focus-visible {
  box-shadow: 0 2px 0 0 var(--accent);
}
/* Le chiffre se lit comme un champ : un soulignement discret, jaune quand on tape. */
.sl-val-edit {
  align-self: stretch;
  align-items: center;
  border-radius: 12px;
  border-bottom: 2px dashed var(--line);
  cursor: text;
}
.sl-val-edit:focus-within {
  border-bottom: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
.sl-unit {
  font-size: 14px;
  font-weight: 600;
  color: var(--dim);
}

/* Pastilles de reps */
.sl-quick {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 4px;
  margin-top: 10px;
}
.sl-chip {
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.sl-chip.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

/* Élastique : trois tuiles, puis les niveaux de bande en « barres de signal ». */
.sl-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.sl-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-height: 72px;
  padding: 8px 4px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  cursor: pointer;
}
.st-ico {
  font-size: 18px;
  line-height: 1.2;
}
.st-t {
  font-size: 13px;
  font-weight: 700;
}
.st-s {
  font-size: 10.5px;
  opacity: 0.8;
}
.sl-tile.on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.sl-tile.m-assist.on {
  border-color: var(--d3, #ffb23f);
  color: var(--d3, #ffb23f);
  background: color-mix(in srgb, var(--d3, #ffb23f) 10%, var(--surface));
}
.sl-bands {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.sl-band {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-height: 64px;
  padding: 8px 2px 6px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  cursor: pointer;
}
.sb-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 25px;
}
.sb-bars i {
  display: block;
  width: 4px;
  border-radius: 2px;
  background: var(--line);
}
.sb-bars i.lit {
  background: currentColor;
}
.sb-t {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.sl-band.on {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.sl-rule {
  margin: 10px 0 0;
  padding: 2px 0 2px 10px;
  border-left: 3px solid var(--line);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--text);
}
.sl-rule.m-assist {
  border-left-color: var(--d3, #ffb23f);
}
.sl-rule.m-resist {
  border-left-color: var(--accent);
}
.sl-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 4px 10px;
}

.sl-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.sl-actions :deep(.q-btn) {
  min-height: 48px;
}
.sl-ok {
  flex: 1 1 140px;
  max-width: 190px;
  border-radius: 14px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  font-size: 16px;
}
.sl-undo {
  margin-right: auto;
  color: var(--d4);
}
@media (prefers-reduced-motion: reduce) {
  .sl-pm,
  .sl-block {
    transition: none;
  }
}
</style>
