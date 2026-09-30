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
      <!-- 🗂️ EN TUILES, COMME LES EXPÉDITIONS (demandé) : trois par ligne, et le LIEU VISÉ en
           encart haut-droit (🏰 la base pour un siège, le point fixe pour une reprise). Le
           détail (faction, force) passe dans le titre de la tuile ; la fiche l'écrit en entier. -->
      <div v-if="rows.length" class="ats-grid">
        <button
          v-for="r in rows"
          :key="r.army.id"
          type="button"
          class="ats-tile"
          :class="{ soon: r.inMs < SOON_MS }"
          :style="{ '--rk': poiRank(r.army).color }"
          :title="titleOf(r)"
          :aria-label="titleOf(r)"
          @click="emit('open', r.army)"
        >
          <span class="ats-target">{{ r.target ? poiEmo(r.target) : '🏰' }}</span>
          <span class="ats-emo">{{ FACTION_EMOJI[r.faction] }}</span>
          <span class="ats-name">{{
            r.kind === 'siege' ? 'Siège de ta base' : targetName(r)
          }}</span>
          <span class="ats-time">{{ formatDuration(r.inMs) }}</span>
          <span v-if="holdOf(r) !== null" class="ats-hold" :class="siegeOdds(holdOf(r)! / 100)"
            >🛡️ {{ holdOf(r) }} %</span
          >
          <span v-else-if="r.kind === 'siege'" class="ats-hold">🛡️ tenue ?</span>
        </button>
      </div>
    </div>
  </SheetShell>
</template>

<script setup lang="ts">
import { poiRank } from '@/lib/poiRank';
import { poiEmo, poiLabel, type Poi } from '@/lib/expedition';
import { FACTION_EMOJI, FACTION_LABEL, siegeOdds } from '@/lib/raid';
import { formatDuration } from '@/lib/duration';
import type { ActiveAttack } from '@/lib/fieldArmy';

import SheetShell from '@/components/SheetShell.vue';

const props = defineProps<{
  modelValue: boolean;
  rows: ActiveAttack[];
  /** 🛡️ % de tenue de ta défense actuelle, par armée (`null` = inconnu). */
  holds?: Record<string, number | null>;
  inline?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; open: [Poi] }>();

/** Moins d'une heure : la tuile passe au rouge. */
const SOON_MS = 3_600_000;
const targetName = (r: ActiveAttack) => (r.target ? poiLabel(r.target) : 'un point fixe');
const holdOf = (r: ActiveAttack): number | null => props.holds?.[r.army.id] ?? null;
const fmtSize = (n: number) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
/** Le détail que la tuile n'a plus la place d'écrire (survol, lecteur d'écran). */
function titleOf(r: ActiveAttack): string {
  const hold = holdOf(r);
  return [
    r.kind === 'siege' ? 'Siège de ta base' : `Reprise : ${targetName(r)}`,
    `${poiRank(r.army).name} · ${FACTION_LABEL[r.faction]}`,
    `≈ ${fmtSize(r.size)} champion${r.size >= 2 ? 's' : ''}`,
    `frappe dans ${formatDuration(r.inMs)}`,
    hold !== null ? `ta défense repousse environ ${hold} %` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
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
/* TROIS tuiles par ligne, centrées, comme les expéditions (`TripsPanel`). */
.ats-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.ats-tile {
  position: relative;
  box-sizing: border-box;
  flex: 0 0 calc((100% - 16px) / 3);
  min-width: 0;
  min-height: 44px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1px 4px;
  padding: 7px 7px 9px;
  font: inherit;
  color: var(--text);
  cursor: pointer;
  overflow: hidden;
  border: 1px solid var(--rk);
  border-radius: 12px;
  background: var(--surface);
}
.ats-tile.soon {
  border-color: var(--d4);
  background: color-mix(in srgb, var(--d4) 10%, var(--surface));
}
/* 🎯 Le lieu attaqué, en encart dans le coin haut-droit (le dessin de l'objectif d'un voyage). */
.ats-target {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  font-size: 13px;
  line-height: 1;
  border-left: 1px solid;
  border-bottom: 1px solid;
  border-color: inherit;
  border-bottom-left-radius: 8px;
  background: color-mix(in srgb, var(--surface-2, #2a241c) 70%, var(--surface));
  pointer-events: none;
}
.ats-emo {
  font-size: 18px;
}
.ats-name {
  flex-basis: 100%;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--rk);
  /* Sur deux lignes si besoin : à 344 px « Jardin d'herboriste » ne tient pas sur une. */
  overflow-wrap: anywhere;
}
.ats-time {
  flex-basis: 100%;
  text-align: center;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ats-tile.soon .ats-time {
  color: var(--d4);
}
/* 🛡️ Mêmes bandes que le pronostic de la Base (`siegeOdds`). */
.ats-hold {
  flex-basis: 100%;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--dim);
}
.ats-hold.tenu {
  color: var(--d1);
}
.ats-hold.serre {
  color: var(--d3);
}
.ats-hold.perdu {
  color: var(--d4);
}
</style>
