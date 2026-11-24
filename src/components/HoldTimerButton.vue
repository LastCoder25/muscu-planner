<template>
  <!-- ⏱ LE CHRONO / MINUTEUR D'UNE TENUE (v1.346.0 ; demandé : « soit un chrono si on ne sait pas
       combien de temps on va tenir, soit un minuteur qu'on règle, avec un délai pour poser le
       téléphone et s'installer »). Un bouton qui ouvre un écran PLEIN FORMAT : le téléphone est
       posé par terre, les chiffres se lisent de loin. Tout le calcul vit dans `lib/holdTimer.ts`
       (testé) ; à la fin on ÉMET des secondes, l'écran hôte les enregistre. -->
  <button
    type="button"
    class="htb"
    :class="[variant, { running: active }]"
    data-test="hold-open"
    :aria-label="`Tenue : ${label}`"
    @click="open = true"
  >
    <span aria-hidden="true">{{ active ? '⏳' : '⏱' }}</span>
    <span class="htb-t">{{ buttonText }}</span>
  </button>

  <q-dialog v-model="open" maximized :persistent="active" transition-show="fade" transition-hide="fade">
    <div class="hd" role="dialog" :aria-label="`Tenue : ${label}`" data-test="hold-dialog">
      <header class="hd-head">
        <div class="hd-name font-display">{{ label }}</div>
        <button
          v-if="!active"
          type="button"
          class="hd-x"
          aria-label="Fermer"
          data-test="hold-close"
          @click="open = false"
        >
          ✕
        </button>
      </header>

      <!-- ① RÉGLAGES -->
      <div v-if="!view" class="hd-body">
        <section aria-label="Mode">
          <div class="hd-cap">Mode</div>
          <div class="hd-tiles" role="radiogroup" aria-label="Chrono ou minuteur">
            <button
              type="button"
              class="hd-tile"
              :class="{ on: settings.mode === 'chrono' }"
              role="radio"
              :aria-checked="settings.mode === 'chrono'"
              data-test="hold-mode-chrono"
              @click="settings.mode = 'chrono'"
            >
              <span class="hd-emo">⏱</span>
              <b>Chrono</b>
              <small>je tiens le plus longtemps possible</small>
            </button>
            <button
              type="button"
              class="hd-tile"
              :class="{ on: settings.mode === 'timer' }"
              role="radio"
              :aria-checked="settings.mode === 'timer'"
              data-test="hold-mode-timer"
              @click="settings.mode = 'timer'"
            >
              <span class="hd-emo">⏳</span>
              <b>Minuteur</b>
              <small>je règle la durée à tenir</small>
            </button>
          </div>
        </section>

        <section v-if="settings.mode === 'timer'" aria-label="Durée à tenir">
          <div class="hd-cap">Durée à tenir</div>
          <div class="hd-chips">
            <button
              v-for="s in targetChoices"
              :key="s"
              type="button"
              class="hd-chip"
              :class="{ on: settings.targetSec === s }"
              :aria-pressed="settings.targetSec === s"
              :data-test="`hold-target-${s}`"
              @click="settings.targetSec = s"
            >
              {{ s === suggested ? '🎯 ' : '' }}{{ s }} s
            </button>
          </div>
          <div class="hd-step">
            <button
              type="button"
              class="hd-pm"
              aria-label="5 secondes de moins"
              :disabled="settings.targetSec <= HOLD_TARGET_MIN"
              data-test="hold-target-minus"
              @click="settings.targetSec = bumpTarget(settings.targetSec, -1)"
            >
              −
            </button>
            <div class="hd-val font-display" data-test="hold-target-val">
              {{ fmtHold(settings.targetSec) }}
            </div>
            <button
              type="button"
              class="hd-pm"
              aria-label="5 secondes de plus"
              :disabled="settings.targetSec >= HOLD_TARGET_MAX"
              data-test="hold-target-plus"
              @click="settings.targetSec = bumpTarget(settings.targetSec, 1)"
            >
              +
            </button>
          </div>
        </section>

        <section aria-label="Préparation">
          <div class="hd-cap">Départ dans</div>
          <div class="hd-chips">
            <button
              v-for="p in HOLD_PREP_CHOICES"
              :key="p"
              type="button"
              class="hd-chip"
              :class="{ on: settings.prepSec === p }"
              :aria-pressed="settings.prepSec === p"
              :data-test="`hold-prep-${p}`"
              @click="settings.prepSec = p"
            >
              {{ p === 0 ? 'tout de suite' : `${p} s` }}
            </button>
          </div>
          <p class="hd-hint">
            Le temps de poser le téléphone et de t’installer : il n’est jamais compté dans la tenue.
          </p>
        </section>

        <button
          type="button"
          class="hd-chip hd-sig"
          :class="{ on: settings.signals }"
          :aria-pressed="settings.signals"
          data-test="hold-signals"
          @click="settings.signals = !settings.signals"
        >
          {{ settings.signals ? '🔔 Bips et vibration' : '🔕 Silencieux' }}
        </button>

        <button type="button" class="hd-go" data-test="hold-start" @click="start">
          Lancer
          <small>{{ summary }}</small>
        </button>
      </div>

      <!-- ② PRÉPARATION -->
      <div v-else-if="view.phase === 'prep'" class="hd-body hd-live" data-test="hold-prep">
        <div class="hd-state">Installe-toi…</div>
        <div class="hd-big font-display" role="timer" aria-live="off">{{ view.prepLeft }}</div>
        <div class="hd-sub">{{ summary }}</div>
        <button type="button" class="hd-stop ghost" data-test="hold-cancel" @click="cancel">
          Annuler
        </button>
      </div>

      <!-- ③ TENUE -->
      <div v-else-if="view.phase === 'run'" class="hd-body hd-live" data-test="hold-run">
        <div class="hd-state go">Tiens !</div>
        <div class="hd-big font-display" role="timer" aria-live="off" data-test="hold-time">
          {{ bigTime }}
        </div>
        <div v-if="view.progress !== null" class="hd-prog" aria-hidden="true">
          <span :style="{ width: Math.round(view.progress * 100) + '%' }" />
        </div>
        <div class="hd-sub">
          {{ settings.mode === 'timer' ? `tenu ${fmtHold(view.heldSec)}` : 'chrono' }}
        </div>
        <!-- ➕ « Je suis en forme » : on rallonge le minuteur sans l'arrêter (le temps déjà tenu
             est gardé, seule la cible recule). -->
        <div v-if="settings.mode === 'timer'" class="hd-more" role="group" aria-label="Ajouter du temps">
          <button
            v-for="s in HOLD_EXTEND_CHOICES"
            :key="s"
            type="button"
            class="hd-chip"
            :data-test="`hold-extend-${s}`"
            @click="extend(s)"
          >
            +{{ s }} s
          </button>
        </div>
        <button type="button" class="hd-stop" data-test="hold-stop" @click="stop">
          Terminer
        </button>
      </div>

      <!-- ④ TERMINÉ : le minuteur est à 0, un bip a retenti. On valide à la main (« OK »),
           de loin ou pas : la série n'est enregistrée qu'à ce moment, à la durée visée. -->
      <div v-else class="hd-body hd-live" data-test="hold-done">
        <div class="hd-state done">Terminé !</div>
        <div class="hd-big font-display" role="timer" aria-live="polite" data-test="hold-time">
          {{ bigTime }}
        </div>
        <div class="hd-prog" aria-hidden="true"><span style="width: 100%" /></div>
        <div class="hd-sub">{{ fmtHold(view.heldSec) }} tenues</div>
        <!-- ➕ Encore un peu ? Le minuteur repart pour la durée ajoutée. -->
        <div v-if="settings.mode === 'timer'" class="hd-more" role="group" aria-label="Ajouter du temps">
          <button
            v-for="s in HOLD_EXTEND_CHOICES"
            :key="s"
            type="button"
            class="hd-chip"
            :data-test="`hold-extend-${s}`"
            @click="extend(s)"
          >
            +{{ s }} s
          </button>
        </div>
        <button type="button" class="hd-stop ok" data-test="hold-ok" @click="stop">
          OK · valider la série
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useHoldTimer } from '@/composables/useHoldTimer';
import {
  bumpTarget,
  fmtHold,
  HOLD_EXTEND_CHOICES,
  HOLD_PREP_CHOICES,
  HOLD_TARGET_CHOICES,
  HOLD_TARGET_MAX,
  HOLD_TARGET_MIN,
} from '@/lib/holdTimer';

const props = withDefaults(
  defineProps<{
    /** Le nom de l'exercice, en tête de l'écran. */
    label: string;
    /** La durée visée pour cette série (s) : proposée dans les pastilles du minuteur. */
    suggested?: number | null;
    /** `cta` = bouton pleine largeur ; `chip` = petite pastille de liste ; `inline` = à côté d'un compteur. */
    variant?: 'cta' | 'chip' | 'inline';
  }>(),
  { suggested: null, variant: 'cta' },
);
const emit = defineEmits<{ finish: [sec: number] }>();

const open = ref(false);
/** Ouvre l'écran de tenue depuis l'extérieur (le bouton « Prochaine série » d'une séance). */
defineExpose({ openPanel: () => (open.value = true) });
const { settings, view, active, start, stop, cancel, extend } = useHoldTimer((sec) => {
  emit('finish', sec);
  open.value = false;
});

/** Les durées proposées : les quatre usuelles, plus l'objectif de la série s'il en diffère. */
const targetChoices = computed(() => {
  const s = props.suggested;
  const base: number[] = [...HOLD_TARGET_CHOICES];
  if (s && s >= HOLD_TARGET_MIN && s <= HOLD_TARGET_MAX && !base.includes(s)) base.push(s);
  return base.sort((a, b) => a - b);
});

const summary = computed(() => {
  const s = settings.value;
  const prep = s.prepSec > 0 ? `départ dans ${s.prepSec} s` : 'départ immédiat';
  return s.mode === 'timer' ? `Minuteur ${fmtHold(s.targetSec)} · ${prep}` : `Chrono · ${prep}`;
});

const bigTime = computed(() => {
  const v = view.value;
  if (!v) return '0:00';
  return v.remainingSec !== null ? fmtHold(v.remainingSec) : fmtHold(v.heldSec);
});

const buttonText = computed(() => {
  const v = view.value;
  if (!v) return props.variant === 'chip' ? 'Tenue' : 'Lancer la tenue';
  if (v.phase === 'prep') return `${v.prepLeft} s`;
  return v.phase === 'done' ? 'Terminé · OK' : bigTime.value;
});

// La tenue tourne alors que l'écran plein format est fermé (retour forcé) : on le rouvre.
watch(active, (a) => {
  if (a) open.value = true;
});
</script>

<style scoped lang="scss">
.htb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  &.cta {
    display: flex;
    width: 100%;
    margin-bottom: 6px;
    font-size: 15px;
  }
  &.chip {
    padding: 0 12px;
    font-size: 13px;
  }
  &.inline {
    min-height: 46px;
    font-size: 15px;
  }
  &.running {
    background: var(--accent);
    color: var(--accent-ink, #1a1605);
  }
}

/* L'écran plein format : fond opaque, chiffres énormes, lisibles posé par terre. */
.hd {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  padding: 14px 16px 22px;
  background: var(--bg);
  color: var(--text);
  overflow-y: auto;
}
.hd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
}
.hd-name {
  font-size: 20px;
  letter-spacing: 0.02em;
  min-width: 0;
  overflow-wrap: anywhere;
}
.hd-x {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.hd-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 14px;
}
.hd-cap {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.hd-tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.hd-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 84px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  small {
    color: var(--dim);
    font-size: 11px;
    line-height: 1.25;
  }
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
}
.hd-emo {
  font-size: 20px;
}
.hd-more {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}
.hd-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.hd-chip {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  }
}
.hd-sig {
  align-self: flex-start;
}
.hd-step {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.hd-pm {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 26px;
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
  }
}
.hd-val {
  flex: 1;
  text-align: center;
  font-size: 40px;
  line-height: 1;
}
.hd-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
  line-height: 1.35;
}
.hd-go {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  border-radius: 16px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink, #1a1605);
  font: inherit;
  font-size: 20px;
  font-weight: 800;
  cursor: pointer;
  small {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.8;
  }
}

/* Préparation et tenue : tout est centré, énorme. */
.hd-live {
  flex: 1;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.hd-state {
  font-size: 22px;
  font-weight: 700;
  color: var(--dim);
  &.go {
    color: var(--accent);
  }
  &.done {
    color: var(--d1, #7bc86c);
    font-size: 28px;
  }
}
.hd-big {
  font-size: clamp(96px, 38vw, 220px);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hd-sub {
  font-size: 14px;
  color: var(--dim);
}
.hd-prog {
  width: 100%;
  max-width: 420px;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2, var(--surface)));
  overflow: hidden;
  span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
}
.hd-stop {
  width: 100%;
  max-width: 420px;
  min-height: 64px;
  margin-top: 14px;
  border-radius: 16px;
  border: none;
  background: var(--accent);
  color: var(--accent-ink, #1a1605);
  font: inherit;
  font-size: 20px;
  font-weight: 800;
  cursor: pointer;
  &.ghost {
    background: transparent;
    border: 1.5px solid var(--line);
    color: var(--text);
  }
  &.ok {
    min-height: 80px;
    font-size: 22px;
    background: var(--d1, #7bc86c);
    color: #10231a;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .hd-prog span {
    transition: width 0.25s linear;
  }
}
</style>
