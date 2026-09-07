<template>
  <component :is="embedded ? 'div' : 'q-page'" class="lab-page" :class="{ embedded }">
    <header class="lab-head">
      <h1 class="lab-title font-display">🧪 Labo</h1>
      <p class="lab-sub">
        Page de test <b>admin</b>, référencée nulle part — accessible seulement en tapant
        <code>/labo</code>. Rien ici n'est promis au reste de l'app.
      </p>
    </header>

    <!-- ── Expérience : héros en 3D ── -->
    <section class="lab-exp">
      <div class="lab-exp-t">Héros 3D <span class="lab-tag">three.js</span></div>
      <p class="lab-note">
        Silhouette dérivée des stats (épaules ← 💪, épaisseur ← ❤️, élancement ← ⚡) et pièces
        colorées par rareté. Personnage <b>procédural</b> : aucun modèle 3D à charger.
      </p>

      <Suspense>
        <Hero3D :spec="spec" :height="340" @unsupported="webglKo = true" />
        <template #fallback>
          <div class="lab-loading">Chargement de la 3D…</div>
        </template>
      </Suspense>
      <div v-if="webglKo" class="lab-warn">
        WebGL indisponible ici — dans l'app réelle on retomberait sur l'avatar SVG.
      </div>

      <div class="lab-ctrl">
        <label v-for="s in STATS" :key="s.key" class="lab-row">
          <span class="lab-lbl">{{ s.emoji }} {{ s.label }}</span>
          <input v-model.number="stats[s.key]" type="range" min="0" max="100" step="1" />
          <b class="lab-val">{{ stats[s.key] }}</b>
        </label>
        <div class="lab-shape">
          épaules {{ spec.build.shoulders.toFixed(2) }} · épaisseur
          {{ spec.build.bulk.toFixed(2) }} · élancement {{ spec.build.height.toFixed(2) }}
        </div>
      </div>

      <div class="lab-ctrl">
        <div class="lab-lbl2">Équipement — tape pour changer la rareté</div>
        <div class="lab-slots">
          <button
            v-for="sl in ALL_SLOTS"
            :key="sl"
            class="lab-slot"
            :style="slotStyle(sl)"
            @click="cycle(sl)"
          >
            <span class="ls-name">{{ SLOT_LABEL[sl] }}</span>
            <span class="ls-r">{{ gear[sl] ? RARITY_LABEL[gear[sl]!] : 'vide' }}</span>
          </button>
        </div>
        <div class="lab-acts">
          <button class="lab-btn" @click="loadMine">Charger mon équipement</button>
          <button class="lab-btn ghost" @click="clearGear">Tout vider</button>
        </div>
      </div>
    </section>
  </component>
</template>

<script setup lang="ts">
// LabPage — banc d'essai ADMIN, volontairement hors navigation (aucune entrée de menu,
// aucun lien). Sert à éprouver une idée sur l'appareil réel sans l'imposer à l'app :
// ici, le héros 3D. La route est gardée dans `boot/auth.ts` comme /backlog.
//
// C'est aussi ce qui rend Three.js acceptable : chargé UNIQUEMENT sur cette route
// (composant async → chunk séparé), il ne pèse rien pour les autres écrans — d'autant
// que le service worker ne cache rien et que tout est retéléchargé à chaque visite.
import { ref, computed, reactive, defineAsyncComponent } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { buildHeroSpec } from '@/lib/hero3d';
import { RANK_ORDER, RARITY_LABEL, RANK_COLOR, type Equipped, type Rarity } from '@/lib/items';

defineProps<{ embedded?: boolean }>();

const Hero3D = defineAsyncComponent(() => import('@/components/Hero3D.vue'));
const char = useCharacterStore();
const webglKo = ref(false);

const STATS = [
  { key: 'puissance', emoji: '💪', label: 'Puissance' },
  { key: 'endurance', emoji: '❤️', label: 'Endurance' },
  { key: 'agilite', emoji: '⚡', label: 'Agilité' },
] as const;

const SLOT_LABEL: Record<string, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  accessory: 'Accessoire',
  relic: 'Relique',
  familiar: 'Familier',
};
const ALL_SLOTS = ['weapon', 'armor', 'accessory', 'relic', 'familiar'] as const;
type SlotKey = (typeof ALL_SLOTS)[number];

const stats = reactive({ puissance: 50, endurance: 50, agilite: 50 });
const gear = reactive<Record<SlotKey, Rarity | null>>({
  weapon: 'rare',
  armor: 'epique',
  accessory: null,
  relic: 'legendaire',
  familiar: null,
});

/** Cycle vide → commun → … → primordial → vide. */
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
  for (const s of ALL_SLOTS) gear[s] = null;
}
function loadMine() {
  const eq = char.row?.equipped ?? {};
  for (const s of ALL_SLOTS) gear[s] = (eq as Equipped)[s]?.rarity ?? null;
}

const equipped = computed(() => {
  const out: Record<string, { rarity: Rarity }> = {};
  for (const s of ALL_SLOTS) if (gear[s]) out[s] = { rarity: gear[s] };
  return out;
});
const profile = computed(() =>
  stats.puissance >= stats.agilite * 1.3
    ? 'puissant'
    : stats.agilite >= stats.puissance * 1.3
      ? 'agile'
      : 'polyvalent',
);
const spec = computed(() => buildHeroSpec(stats, profile.value, equipped.value));

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
.lab-sub code {
  background: var(--surface);
  padding: 1px 5px;
  border-radius: 4px;
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
  font-family: var(--font-body, inherit);
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
.lab-loading,
.lab-warn {
  display: grid;
  place-items: center;
  height: 120px;
  font-size: 13px;
  color: var(--dim);
}
.lab-warn {
  height: auto;
  padding: 8px;
  color: var(--d3);
}
.lab-ctrl {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}
.lab-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lab-lbl {
  flex: 0 0 108px;
  font-size: 13px;
}
.lab-row input {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.lab-val {
  flex: 0 0 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.lab-shape {
  font-size: 11.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
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
