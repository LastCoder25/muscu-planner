<!--
  🏘️ Tout améliorer la base : le bouton (coin haut droit de l'enceinte) et son aperçu. L'or
  dépensé ne se reprend pas : on voit ce qui montera avant de payer.
-->
<template>
  <button
    v-if="visible"
    type="button"
    class="up-all"
    :class="{ ready: plan.levels > 0 }"
    aria-label="Tout améliorer"
    data-test="up-all"
    @click="open = true"
  >
    <BaseUpgradeIcon class="up-all-ico" />
    <span class="up-all-lab">Tout</span>
  </button>

  <q-dialog v-model="open" position="bottom">
    <q-card class="up-sheet">
      <div class="up-head">
        <BaseUpgradeIcon />
        <div class="up-title font-display">Tout améliorer</div>
        <button type="button" class="up-x" aria-label="Fermer" @click="open = false">✕</button>
      </div>
      <template v-if="plan.levels">
        <div class="up-chips">
          <span class="up-chip"
            >+{{ plan.levels }} {{ plan.levels > 1 ? 'niveaux' : 'niveau' }}</span
          >
          <span class="up-chip cost">−{{ fmtPow(plan.spent) }} 🪙</span>
          <span class="up-chip">reste {{ fmtPow(left) }} 🪙</span>
        </div>
        <ul class="up-grid">
          <li v-for="l in plan.lines" :key="l.key" class="up-tile">
            <span class="up-emo" aria-hidden="true">{{ l.emoji }}</span>
            <span class="up-name">{{ l.label }}</span>
            <span class="up-lvl"
              >niv. {{ l.from }} → <b>{{ l.to }}</b></span
            >
            <span class="up-cost">{{ fmtPow(l.gold) }} 🪙</span>
          </li>
        </ul>
        <p class="up-note">
          Les moins chers d’abord, tant que ton or suit. Plafond : ton niveau ({{ heroLevel }}).
        </p>
        <p v-if="repairShort" class="up-warn">
          ⚠️ Il ne te restera pas de quoi tout réparer ({{ fmtPow(repair) }} 🪙).
        </p>
        <button type="button" class="up-go" data-test="up-go" :disabled="busy" @click="go">
          Améliorer · {{ fmtPow(plan.spent) }} 🪙
        </button>
      </template>
      <p v-else-if="plan.nextCost === null" class="up-note">
        Tout est déjà à ton niveau ({{ heroLevel }}).
      </p>
      <p v-else class="up-note">
        Pas assez d’or : le niveau le moins cher coûte {{ fmtPow(plan.nextCost) }} 🪙.
      </p>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useGameFx } from '@/composables/useGameFx';
import { planBaseUpgrades } from '@/lib/baseUpgrade';
import { totalRepairCost } from '@/lib/raid';
import { engageCap } from '@/lib/adventurers';
import { fmtPow } from '@/lib/combat';
import BaseUpgradeIcon from '@/components/BaseUpgradeIcon.vue';

const NBSP = String.fromCodePoint(160);
const props = defineProps<{ heroLevel: number }>();
const char = useCharacterStore();
const auth = useAuthStore();
const gameFx = useGameFx();
const $q = useQuasar();
const open = ref(false);
const busy = ref(false);

const plan = computed(() =>
  planBaseUpgrades({
    gold: char.row?.gold ?? 0,
    playerLevel: props.heroLevel,
    buildings: char.row?.buildings ?? [],
    defenses: char.row?.base?.defenses ?? [],
  }),
);
// Niveau 0 = sport pas encore chargé : on ne dirait que des bêtises.
const visible = computed(
  () => props.heroLevel > 0 && plan.value.buildings.length + plan.value.defenses.length > 0,
);
const left = computed(() => (char.row?.gold ?? 0) - plan.value.spent);
const repair = computed(() => {
  const base = char.row?.base;
  return base ? totalRepairCost({ ...base, defenses: plan.value.defenses }) : 0;
});
const repairShort = computed(() => repair.value > left.value);

async function go() {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  const places = engageCap(char.pantheonLevel);
  try {
    const done = await char.upgradeAllBase(uid, props.heroLevel);
    open.value = false;
    if (!done?.levels) return;
    const levels = `${done.levels} ${done.levels > 1 ? 'niveaux' : 'niveau'}`;
    // Espace insécable : la pièce reste collée à son montant.
    const message = `🏘️ Base améliorée : +${levels} pour ${fmtPow(done.spent)}${NBSP}🪙`;
    $q.notify({ type: 'positive', message });
    // 🛕 Comme à l'unité : une place ouverte au Panthéon se fête.
    const gained = engageCap(char.pantheonLevel) - places;
    if (gained > 0)
      gameFx.celebrate({
        kind: 'unlock',
        emoji: '🛕',
        title:
          gained > 1 ? `${gained} places de plus au Panthéon` : 'Une place de plus au Panthéon',
        subtitle: 'Tu peux engager davantage de champions',
        rarity: 'epic',
      });
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.up-all {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 54px;
  height: 54px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  font: inherit;
  color: var(--dim);
  background: rgba(21, 18, 14, 0.82);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
  touch-action: manipulation;
}
.up-all.ready {
  color: var(--accent, #ffd23f);
  border-color: var(--accent, #ffd23f);
}
/* Rien à payer : le dessin s'éteint avec le bouton. */
.up-all:not(.ready) .up-all-ico {
  filter: grayscale(1);
  opacity: 0.55;
}
.up-all-lab {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
}
.up-sheet {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 14px;
  color: var(--text);
}
.up-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.up-title {
  flex: 1;
  font-size: 16px;
}
.up-x {
  border: 0;
  background: none;
  color: var(--dim);
  font-size: 18px;
  width: 44px;
  height: 44px;
  cursor: pointer;
}
.up-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.up-chip {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
}
.up-chip.cost {
  color: var(--accent, #ffd23f);
  border-color: var(--accent, #ffd23f);
}
.up-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.up-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  min-width: 0;
  padding: 8px 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.up-emo {
  font-size: 22px;
  line-height: 1.1;
}
.up-name {
  font-size: 12px;
  line-height: 1.2;
}
.up-lvl {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.up-cost {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--dim);
}
.up-note {
  font-size: 12px;
  color: var(--dim);
  margin: 10px 0 0;
}
.up-warn {
  font-size: 12px;
  color: #ff6a45;
  margin: 6px 0 0;
}
.up-go {
  display: block;
  width: 100%;
  min-height: 48px;
  margin-top: 12px;
  font: inherit;
  font-weight: 700;
  color: #15120e;
  background: var(--accent, #ffd23f);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  touch-action: manipulation;
}
.up-go:disabled {
  opacity: 0.5;
}
</style>
