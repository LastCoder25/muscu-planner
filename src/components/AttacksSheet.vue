<template>
  <!-- ⚔️ LES ATTAQUES VISIBLES EN COURS (2026-09-29, demandé : « comme la liste des lieux fixes,
       une icône qui référence les attaques visibles en cours »). Une tuile par armée en
       campagne repérée : qui marche, sur quoi, et dans combien de temps elle frappe. Toucher
       une tuile centre la carte sur l'armée et ouvre sa fiche — c'est là qu'on l'attaque ou
       qu'on renforce, un seul endroit. -->
  <!-- 🗂️ `inline` : posée DANS la page, sous la carte, dépliée par sa tuile (2026-09-29). -->
  <SheetShell
    :model-value="modelValue"
    :inline="inline"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="ats" :class="{ inline }">
      <div class="ats-head">
        <span class="ats-title">⚔️ Attaques en cours</span>
        <span class="ats-sum"
          >{{ rows.length }} armée{{ rows.length > 1 ? 's' : '' }} en marche</span
        >
        <button
          v-if="!inline"
          type="button"
          class="ats-x"
          aria-label="Fermer"
          @click="emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>
      <p v-if="!rows.length" class="ats-empty">
        Aucune armée repérée en marche. La Tour de guet te préviendra dès qu’une approche.
      </p>
      <button
        v-for="r in rows"
        :key="r.army.id"
        type="button"
        class="ats-tile"
        :class="{ soon: r.inMs < SOON_MS }"
        :style="{ '--rk': poiRank(r.army).color }"
        @click="emit('open', r.army)"
      >
        <span class="ats-emo">{{ FACTION_EMOJI[r.faction] }}</span>
        <span class="ats-body">
          <span class="ats-name">
            {{ r.kind === 'siege' ? 'Siège de ta base' : `Reprise : ${targetName(r)}` }}
          </span>
          <span class="ats-pills">
            <span class="ats-pill rk">{{ poiRank(r.army).name }}</span>
            <span class="ats-pill">{{ FACTION_LABEL[r.faction] }}</span>
            <span class="ats-pill"
              >≈ {{ fmtSize(r.size) }} champion{{ r.size >= 2 ? 's' : '' }}</span
            >
          </span>
        </span>
        <span class="ats-time">
          <small>frappe dans</small>
          <b>{{ formatDuration(r.inMs) }}</b>
        </span>
      </button>
    </div>
  </SheetShell>
</template>

<script setup lang="ts">
import { poiRank } from '@/lib/poiRank';
import { poiLabel, type Poi } from '@/lib/expedition';
import { FACTION_EMOJI, FACTION_LABEL } from '@/lib/raid';
import { formatDuration } from '@/lib/duration';
import type { ActiveAttack } from '@/lib/fieldArmy';

import SheetShell from '@/components/SheetShell.vue';

defineProps<{ modelValue: boolean; rows: ActiveAttack[]; inline?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; open: [Poi] }>();

/** Moins d'une heure : la tuile passe au rouge. */
const SOON_MS = 3_600_000;
const targetName = (r: ActiveAttack) => (r.target ? poiLabel(r.target) : 'un point fixe');
const fmtSize = (n: number) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
</script>

<style scoped>
.ats.inline {
  width: auto;
  box-sizing: border-box;
  max-width: none;
  max-height: none;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px;
  margin: 0 8px 8px;
}
.ats {
  width: 100%;
  max-width: 560px;
  max-height: 80dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
  box-sizing: border-box;
}
.ats-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.ats-title {
  font-family: Oswald, sans-serif;
  font-size: 18px;
  font-weight: 700;
}
.ats-sum {
  color: var(--dim);
  font-size: 13px;
  flex: 1;
}
.ats-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.ats-empty {
  color: var(--dim);
  font-size: 13px;
}
.ats-tile {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 60px;
  margin-bottom: 8px;
  padding: 8px 10px;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--line);
  border-left: 4px solid var(--rk);
  border-radius: 12px;
  background: var(--surface-2, var(--bg));
}
.ats-tile.soon {
  border-color: var(--d4);
  border-left-color: var(--d4);
  background: color-mix(in srgb, var(--d4) 10%, var(--surface-2, var(--bg)));
}
.ats-emo {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 20px;
  background: var(--surface);
  border: 2px solid var(--rk);
}
.ats-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ats-name {
  font-weight: 700;
  font-size: 14px;
}
.ats-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ats-pill {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--dim);
}
.ats-pill.rk {
  color: var(--rk);
  border-color: color-mix(in srgb, var(--rk) 55%, transparent);
  font-weight: 700;
}
.ats-time {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.1;
}
.ats-time small {
  font-size: 10.5px;
  color: var(--dim);
}
.ats-time b {
  font-family: Oswald, sans-serif;
  font-size: 15px;
}
.ats-tile.soon .ats-time b {
  color: var(--d4);
}
</style>
