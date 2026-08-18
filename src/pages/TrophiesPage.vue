<template>
  <component :is="embedded ? 'div' : 'q-page'" class="tr-page" :class="{ embedded }">
    <h1 class="page-title font-display">Trophées</h1>
    <p class="page-sub">
      {{ counts.unlocked }} / {{ counts.total }} débloqués · records &amp; paliers par sport
    </p>

    <div v-if="!entries.length" class="empty">
      Aucune séance encore. Enregistre une séance et tes trophées apparaîtront ici 🏆
    </div>

    <template v-else>
      <!-- Succès globaux -->
      <section class="tr-card">
        <div class="tr-head"><span class="tr-emo">🌍</span> Global</div>
        <div class="pal-grid">
          <div
            v-for="g in trophies.global"
            :key="g.metric + g.threshold"
            class="pal"
            :class="[g.achieved ? 'on r-' + g.rarity : 'off']"
          >
            <span class="pal-check">{{ g.achieved ? '✓' : '🔒' }}</span>
            <span class="pal-label">{{ g.label }}</span>
            <span class="pal-val">{{ g.value }}/{{ g.threshold }}</span>
          </div>
        </div>
      </section>

      <!-- Un bloc par sport -->
      <section v-for="s in trophies.perSport" :key="s.sport" class="tr-card">
        <div class="tr-head">
          <span class="tr-emo">{{ sportEmoji(s.category, s.hasDistance) }}</span> {{ s.sport }}
        </div>

        <!-- Records personnels -->
        <div class="rec-row">
          <span class="rec"
            ><b>{{ fmtDur(s.records.maxMin) }}</b
            ><small>plus longue</small></span
          >
          <span v-if="s.hasDistance" class="rec"
            ><b>{{ s.records.maxKm }} km</b><small>record distance</small></span
          >
          <span v-if="s.hasDistance && s.records.maxDplus > 0" class="rec"
            ><b>{{ s.records.maxDplus }} m</b><small>record D+</small></span
          >
          <span v-if="s.category === 'muscu' && s.records.maxTonnage > 0" class="rec"
            ><b>{{ (s.records.maxTonnage / 1000).toFixed(1) }} t</b
            ><small>record tonnage</small></span
          >
          <span class="rec"
            ><b>{{ s.sessions }}</b
            ><small>séances</small></span
          >
        </div>

        <!-- Paliers -->
        <div class="pal-grid">
          <div
            v-for="p in s.paliers"
            :key="p.metric + p.threshold"
            class="pal"
            :class="[p.achieved ? 'on r-' + p.rarity : 'off']"
          >
            <span class="pal-check">{{ p.achieved ? '✓' : '🔒' }}</span>
            <span class="pal-label">{{ p.label }}</span>
            <span class="pal-val">{{ palValue(p) }}</span>
          </div>
        </div>
      </section>
    </template>
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { computed } from 'vue';
import { useProgress } from '@/composables/useProgress';
import {
  buildTrophies,
  trophyCounts,
  type Palier,
  type SportCategory,
} from '@/lib/sportAchievements';

const progress = useProgress();
const entries = computed(() => progress.sportEntries.value);
const trophies = computed(() => buildTrophies(entries.value));
const counts = computed(() => trophyCounts(trophies.value));

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
}
function palValue(p: Palier): string {
  if (p.metric === 'hours_total') return `${Math.floor(p.value)}/${p.threshold} h`;
  if (p.metric === 'tonnage_total')
    return `${(p.value / 1000).toFixed(1)}/${(p.threshold / 1000).toFixed(0)} t`;
  return `${Math.round(p.value)}/${p.threshold}`;
}
function sportEmoji(cat: SportCategory, hasDistance: boolean): string {
  if (cat === 'muscu') return '🏋️';
  if (cat === 'cardio') return hasDistance ? '🏃' : '🚴';
  if (cat === 'specifique') return '🤸';
  return '🎯';
}
</script>

<style scoped lang="scss">
.tr-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px calc(40px + env(safe-area-inset-bottom, 0px));
}
.tr-page.embedded {
  min-height: 0;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  color: var(--dim);
  font-size: 13px;
  margin: 4px 0 18px;
}
.empty {
  color: var(--dim);
  padding: 24px 0;
  text-align: center;
}
.tr-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 14px;
}
.tr-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
  margin-bottom: 10px;
}
.tr-emo {
  font-size: 20px;
}
.rec-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.rec {
  flex: 1 1 auto;
  min-width: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 8px 6px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--line);
}
.rec b {
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--accent);
}
.rec small {
  font-size: 10px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.pal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.pal {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
}
.pal.off {
  opacity: 0.5;
}
.pal.on {
  border-color: var(--c, var(--accent));
  background: color-mix(in srgb, var(--c, var(--accent)) 12%, transparent);
}
.pal.r-common {
  --c: var(--d1, #7bc86c);
}
.pal.r-rare {
  --c: var(--d2, #c6d24a);
}
.pal.r-epic {
  --c: var(--d3, #ffb23f);
}
.pal.r-legendary {
  --c: var(--accent);
}
.pal-check {
  font-size: 13px;
}
.pal-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text);
}
.pal-val {
  font-size: 10.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
</style>
