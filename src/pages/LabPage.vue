<template>
  <component :is="embedded ? 'div' : 'q-page'" class="lab-page" :class="{ embedded }">
    <header>
      <h1 class="lab-title font-display">🧪 Labo</h1>
      <p class="lab-sub">
        Page de test <b>admin</b>, hors navigation publique. Rien ici n'est promis au reste de
        l'app.
      </p>
    </header>

    <section class="lab-exp">
      <div class="lab-exp-t">Héros 3D <span class="lab-tag">paper-doll</span></div>
      <p class="lab-note">
        Corps riggé + pièces d'équipement greffées sur le <b>même squelette</b>. Modèles Quaternius
        (CC0).
      </p>

      <Suspense>
        <HeroModel :plan="plan" :height="380" :arm-drop="armDrop" />
        <template #fallback><div class="lab-loading">Chargement de la 3D…</div></template>
      </Suspense>

      <div class="lab-ctrl">
        <div class="lab-lbl2">Équipement — tape pour changer la rareté</div>
        <div class="lab-slots">
          <button
            v-for="sl in SLOTS_UI"
            :key="sl"
            class="lab-slot"
            :style="slotStyle(sl)"
            @click="cycle(sl)"
          >
            <span class="ls-name">{{ SLOT_LABEL[sl] }}</span>
            <span class="ls-r">{{ gear[sl] ? RARITY_LABEL[gear[sl]!] : 'vide' }}</span>
          </button>
        </div>
        <div class="lab-shape">
          tenue : <b>{{ plan.tier ?? 'aucune' }}</b> · {{ plan.parts.length }} pièce(s)
        </div>
        <div v-if="plan.missing.length" class="lab-warn">
          ⚠️ Non représentable avec ce pack :
          {{ plan.missing.map((m) => SLOT_LABEL[m]).join(', ') }}
          — il ne contient aucun modèle d'arme.
        </div>

        <label class="lab-row">
          <span class="lab-lbl">Bras (pose)</span>
          <input v-model.number="armDrop" type="range" min="0" max="1.2" step="0.01" />
          <b class="lab-val">{{ armDrop.toFixed(2) }}</b>
        </label>

        <div class="lab-acts">
          <button class="lab-btn" @click="loadMine">Charger mon équipement</button>
          <button class="lab-btn ghost" @click="clearGear">Tout vider</button>
        </div>
      </div>
    </section>
  </component>
</template>

<script setup lang="ts">
// LabPage — banc d'essai ADMIN, volontairement hors navigation. Entrée « Labo (admin) »
// dans le menu ⋮ (gardée par isAdmin) : l'app installée n'a pas de barre d'URL, une page
// joignable seulement en tapant /labo y serait inatteignable.
//
// Three.js n'entre QUE par cette route (composant async → chunk séparé), et les modèles
// sont servis depuis public/hero/ (bundle slim dérivé, cf. scripts/build-hero-assets.mjs).
import { ref, computed, reactive, defineAsyncComponent } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { planHeroParts } from '@/lib/heroModel';
import { RANK_ORDER, RARITY_LABEL, RANK_COLOR, type Equipped, type Rarity } from '@/lib/items';

defineProps<{ embedded?: boolean }>();

const HeroModel = defineAsyncComponent(() => import('@/components/HeroModel.vue'));
const char = useCharacterStore();

const SLOT_LABEL: Record<string, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  accessory: 'Accessoire',
  relic: 'Relique',
};
const SLOTS_UI = ['armor', 'accessory', 'relic', 'weapon'] as const;
type SlotKey = (typeof SLOTS_UI)[number];

// Bras rabattus : le pack ne fournit aucune animation, et selon la pose de repos du
// modèle il faut parfois corriger un peu — réglable ici plutôt que codé en dur.
const armDrop = ref(0);

const gear = reactive<Record<SlotKey, Rarity | null>>({
  armor: 'rare',
  accessory: null,
  relic: null,
  weapon: null,
});

function cycle(slot: SlotKey) {
  const cur = gear[slot];
  if (!cur) {
    gear[slot] = RANK_ORDER[0]!;
    return;
  }
  const i = RANK_ORDER.indexOf(cur);
  gear[slot] = i >= RANK_ORDER.length - 1 ? null : RANK_ORDER[i + 1]!;
}
function clearGear() {
  for (const s of SLOTS_UI) gear[s] = null;
}
function loadMine() {
  const eq = (char.row?.equipped ?? {}) as Equipped;
  for (const s of SLOTS_UI) gear[s] = eq[s]?.rarity ?? null;
}

const equipped = computed(() => {
  const out: Record<string, { rarity: Rarity }> = {};
  for (const s of SLOTS_UI) if (gear[s]) out[s] = { rarity: gear[s] };
  return out;
});
const plan = computed(() => planHeroParts(equipped.value));

function slotStyle(sl: SlotKey) {
  const r = gear[sl];
  return r ? { borderColor: RANK_COLOR[r], color: RANK_COLOR[r] } : {};
}
</script>

<style scoped lang="scss">
.lab-page {
  padding: 14px 14px 40px;
}
.lab-page.embedded {
  min-height: 0;
}
.lab-title {
  margin: 0;
  font-size: 26px;
}
.lab-sub {
  margin: 4px 0 16px;
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.5;
}
.lab-exp {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  background: var(--surface);
}
.lab-exp-t {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 4px;
}
.lab-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--dim);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 7px;
  margin-left: 6px;
}
.lab-note {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--dim);
  line-height: 1.5;
}
.lab-loading {
  display: grid;
  place-items: center;
  height: 160px;
  font-size: 13px;
  color: var(--dim);
}
.lab-ctrl {
  margin-top: 12px;
  display: grid;
  gap: 9px;
}
.lab-lbl2 {
  font-size: 12px;
  color: var(--dim);
}
.lab-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lab-slot {
  display: grid;
  gap: 1px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  text-align: left;
}
.ls-name {
  font-size: 12px;
  font-weight: 700;
}
.ls-r {
  font-size: 10.5px;
  opacity: 0.85;
}
.lab-shape {
  font-size: 11.5px;
  color: var(--dim);
}
.lab-warn {
  font-size: 11.5px;
  color: var(--d3);
  line-height: 1.45;
}
.lab-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lab-lbl {
  flex: 0 0 96px;
  font-size: 13px;
}
.lab-row input {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.lab-val {
  flex: 0 0 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.lab-acts {
  display: flex;
  gap: 8px;
}
.lab-btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  background: var(--accent);
  color: #15120e;
  cursor: pointer;
}
.lab-btn.ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--dim);
}
</style>
