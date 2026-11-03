<template>
  <!-- 🔁 RÉCAP D'UNE SÉRIE (×5, ×10, Max) : un seul écran au lieu de N combats animés. Le butin
       est déjà au sac (chaque lancer l'a écrit) ; ceci le résume, les plus rares en tête. -->
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <div v-if="summary" class="br">
      <header class="br-head">
        <span class="br-ico">{{ summary.kind === 'boss' ? '👑' : '🏰' }}</span>
        <div class="br-htxt">
          <div class="br-title">{{ summary.name }}</div>
          <div class="br-sub">
            Série de {{ summary.runs
            }}{{ summary.runs < summary.asked ? ` / ${summary.asked}` : '' }} lancer{{
              summary.runs > 1 ? 's' : ''
            }}
          </div>
        </div>
      </header>

      <div class="br-chips">
        <span class="br-chip win"
          >✅ {{ summary.cleared }} réussi{{ summary.cleared > 1 ? 's' : '' }}</span
        >
        <span v-if="summary.failed" class="br-chip lose"
          >💀 {{ summary.failed }} raté{{ summary.failed > 1 ? 's' : '' }}</span
        >
        <span class="br-chip gold">+{{ summary.gold }} 🪙</span>
        <span v-if="summary.summonStones" class="br-chip">+{{ summary.summonStones }} 🔮</span>
        <span v-if="summary.talents" class="br-chip"
          >🎓 {{ summary.talents }} talent{{ summary.talents > 1 ? 's' : '' }}</span
        >
        <span v-if="summary.firstClear" class="br-chip first">✨ Première victoire</span>
      </div>

      <p v-if="summary.stoppedBecause" class="br-stop">
        ⏸️ Série arrêtée : {{ summary.stoppedBecause }}.
      </p>

      <div class="br-loot">
        <div v-if="!groups.length" class="br-none">Aucun objet cette fois.</div>
        <div
          v-for="g in groups"
          :key="g.rarity"
          class="br-grp"
          :style="{ '--rk': RANK_COLOR[g.rarity] }"
        >
          <div class="br-grp-head">
            <span class="br-dot" />
            <span class="br-grp-name">{{ rarityRank(g.rarity).name }}</span>
            <span class="br-grp-n">×{{ g.items.length }}</span>
          </div>
          <div class="br-items">
            <span v-for="it in g.items" :key="it.id" class="br-item"
              >{{ it.emoji }} {{ it.name }}</span
            >
          </div>
        </div>
      </div>

      <button class="br-ok" @click="emit('update:modelValue', false)">OK</button>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { dropsByRarity, type BatchSummary } from '@/lib/batchRun';
import { RANK_COLOR, RANK_ORDER, rarityRank } from '@/lib/items';

const props = defineProps<{
  modelValue: boolean;
  summary: BatchSummary | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const groups = computed(() => dropsByRarity(props.summary?.drops ?? [], RANK_ORDER));
</script>

<style scoped lang="scss">
.br {
  width: 420px;
  max-width: 92vw;
  max-height: 82vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.br-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.br-ico {
  font-size: 30px;
}
.br-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
}
.br-sub {
  color: var(--dim);
  font-size: 12px;
}
.br-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.br-chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
}
.br-chip.win {
  color: var(--d1, #7bc86c);
  border-color: var(--d1, #7bc86c);
}
.br-chip.lose {
  color: var(--d4, #ff6a45);
  border-color: var(--d4, #ff6a45);
}
.br-chip.gold,
.br-chip.first {
  color: var(--accent);
  border-color: var(--accent);
}
.br-stop {
  margin: 0;
  font-size: 12px;
  color: var(--d3, #ffb23f);
}
.br-loot {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.br-none {
  color: var(--dim);
  font-size: 13px;
}
.br-grp {
  border: 1px solid var(--line);
  border-left: 3px solid var(--rk, var(--line));
  border-radius: 10px;
  padding: 8px 10px;
}
.br-grp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 13px;
}
.br-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--rk);
}
.br-grp-n {
  margin-left: auto;
  color: var(--dim);
}
.br-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--dim);
}
.br-ok {
  min-height: 44px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  border-radius: 10px;
  font-family: var(--font-display);
  font-weight: 700;
  cursor: pointer;
}
</style>
