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
      <!-- Mur de records : le plus personnel, donc en tête. Un record par exercice, du
           plus lourd au plus léger. Absent tant qu'aucune série chargée n'existe. -->
      <section v-if="records.length" class="tr-card">
        <div class="tr-head"><span class="tr-emo">🏆</span> Records de force</div>
        <div class="pr-list">
          <button
            v-for="r in records"
            :key="r.id"
            class="pr"
            :style="{ '--m': muscleColor(r.muscle ?? '') }"
            @click="$router.push(`/exercise/${r.id}`)"
          >
            <span class="pr-bar" />
            <span class="pr-mid">
              <span class="pr-name">{{ r.name }}</span>
              <span class="pr-set"
                >{{ r.load }} kg × {{ r.reps }} · {{ fmtDay(r.dateIso) }} ·
                {{ ago(r.dateIso) }}</span
              >
            </span>
            <span class="pr-val font-display">{{ r.e1rm }}<small> kg</small></span>
          </button>
        </div>
        <div class="pr-foot">Max estimé (Epley) — touche un exercice pour voir sa courbe.</div>
      </section>

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
import { computed, toRaw } from 'vue';
import { useProgress } from '@/composables/useProgress';
import { useLogsStore } from '@/stores/logs';
import { personalRecords } from '@/lib/estimates';
import { logicalToday } from '@/lib/challenges';
import { dayLabelShort, daysAgoLabel } from '@/lib/startDate';
import { muscleColor } from '@/lib/volume';
import {
  buildTrophies,
  trophyCounts,
  type Palier,
  type SportCategory,
} from '@/lib/sportAchievements';

const progress = useProgress();
const entries = computed(() => progress.sportEntries.value);

// Mur de records. ⚠️ On lit le cache PARTAGÉ des bilans (`useProgress` appelle déjà
// `logs.fetchAll()`) : une seconde requête ici referait le travail pour rien — le
// double téléchargement corrigé en v0.842.
// ⚠️ `toRaw` sur le PAYLOAD, pas sur le tableau. `personalRecords` descend jusqu'à chaque
// série de chaque exercice de chaque bilan : à travers les proxies de Vue, chacun de ces
// accès passe par un `get` qui enregistre une dépendance — mesuré 3 à 9 fois plus lent,
// ~30-45 ms sur un téléphone, pour un résultat qu'on ne relit jamais champ par champ.
// ⚠️ Débruter le TABLEAU ferait perdre le suivi de l'itération, et `logs.add` fait un
// `unshift` EN PLACE : un bilan enregistré n'apparaîtrait plus. On garde donc `.map` sur
// le tableau réactif (longueur et indices suivis) et on ne débrute que ce qu'on parcourt.
const logsStore = useLogsStore();
const records = computed(() =>
  personalRecords(
    logsStore.all.map((r) => ({ performedAt: r.performed_at, log: toRaw(r.payload) })),
  ),
);

/** « 18 juin » cette année, « 18 juin 25 » sinon. ⚠️ L'année courante est du bruit : sans
 *  cette coupe, la ligne de méta passe sur deux lignes à 344 px (vu au banc).
 *
 *  ⚠️ Le jour et le mois viennent de `dayLabelShort`, PAS d'une table écrite à la main :
 *  la mienne donnait « 18 sep » là où les autres écrans, tous passés par `Intl`, écrivent
 *  « 18 sept. » — une seule app, deux façons d'abréger un mois. Seule la coupe d'année
 *  reste ici : `dayLabelShort` ne la porte pas, et elle n'a de sens que pour un record,
 *  qui peut dater de l'an dernier. */
function fmtDay(iso: string): string {
  const court = dayLabelShort(iso);
  const y = iso.slice(0, 4);
  return y === String(new Date().getFullYear()) ? court : `${court} ${y.slice(2)}`;
}

/** Ancienneté d'un record. ⚠️ `logicalToday()` et pas `new Date()` : c'est le même
 *  « aujourd'hui » que le reste de l'app (bascule à 4 h), donc un record établi cette nuit
 *  ne se met pas à dater d'hier au milieu d'une séance. */
function ago(iso: string): string {
  return daysAgoLabel(iso, logicalToday());
}
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
/* Mur de records. ⚠️ Préfixe `pr-` et NON `rec-` : `.rec` existe déjà dans cette page
   (les records par sport, juste en dessous) — réutiliser le nom aurait écrasé son style
   en silence, le défaut des classes `.fp-*` de la v0.751. */
.pr-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pr {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px; /* cible tactile confortable : c'est un bouton */
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  cursor: pointer;
  text-align: left;
}
.pr-bar {
  flex: 0 0 4px;
  align-self: stretch;
  border-radius: 2px;
  background: var(--m, var(--dim));
}
.pr-mid {
  flex: 1 1 auto;
  min-width: 0; /* sinon un nom long refuse de se tronquer et pousse la valeur dehors */
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pr-name {
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pr-set {
  font-size: 11px;
  color: var(--dim);
  /* Ceinture : la méta tient sur UNE ligne, sinon la carte grandit et les valeurs se
     désalignent (vu au banc à 344 px, « il y a 3 / mois »). */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pr-val {
  flex: 0 0 auto;
  font-size: 22px;
  font-weight: 600;
  color: var(--accent);
}
.pr-val small {
  font-size: 11px;
  color: var(--dim);
}
.pr-foot {
  margin-top: 8px;
  font-size: 11px;
  color: var(--dim-2);
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
  // ⚠️ `minmax(0, 1fr)` et NON `1fr` : un `1fr` garde un minimum implicite de `auto`, donc
  // une colonne refuse de passer sous la largeur de son contenu et la grille déborde —
  // mesuré ici, 345 px pour un écran de 344 (« 🔒 100 séances · 2/100 »). Le projet
  // connaissait déjà ce piège (la rangée de trajets, v0.756) ; il n'avait pas traversé
  // jusqu'à cet écran, parce que la page n'avait jamais été regardée AVEC des données.
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
