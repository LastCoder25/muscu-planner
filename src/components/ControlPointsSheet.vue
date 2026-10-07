<template>
  <!-- 🗂️ LES POINTS FIXES, EN UNE LISTE (2026-09-28, demandé : « une icône au-dessus du
       dézoom qui liste les lieux fixes pour en faire la gestion »). Une tuile par point :
       son rang, qui le tient, ce qui appelle une action. Toucher une tuile ouvre la fiche du
       lieu : les ACTIONS (attaquer, renforcer, ramener, récolter) restent les siennes — deux
       écrans qui font la même chose finiraient par se contredire. -->
  <!-- 🗂️ `inline` : posée DANS la page, sous la carte, dépliée par sa tuile (2026-09-29). -->
  <SheetShell
    :model-value="modelValue"
    :inline="inline"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="cps" :class="{ inline }">
      <div class="cps-head">
        <span class="cps-title">🏰 Places fortes</span>
        <span class="cps-sum">{{ heldCount }}/{{ rows.length }} tenus</span>
        <button
          v-if="!inline"
          type="button"
          class="cps-x"
          aria-label="Fermer"
          @click="emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>
      <p v-if="!rows.length" class="cps-empty">Aucune place forte sur ta carte pour l’instant.</p>
      <!-- 🔎 Filtres par statut (demandé : « tenu, pas tenu, vide »), avec leur nombre. Une
           catégorie vide n'est pas proposée : une pastille « 0 » n'apprend rien. -->
      <div v-if="filterChips.length > 1" class="cps-filters" role="group" aria-label="Filtrer">
        <button
          type="button"
          class="cps-chip"
          :class="{ on: activeFilter === null }"
          :aria-pressed="activeFilter === null"
          @click="filter = null"
        >
          Toutes · {{ rows.length }}
        </button>
        <button
          v-for="c in filterChips"
          :key="c.id"
          type="button"
          class="cps-chip"
          :class="['f-' + c.id, { on: activeFilter === c.id }]"
          :aria-pressed="activeFilter === c.id"
          @click="filter = activeFilter === c.id ? null : c.id"
        >
          {{ CONTROL_FILTER_LABEL[c.id] }} · {{ c.n }}
        </button>
      </div>
      <!-- 👆 Toucher une tuile ouvre DIRECTEMENT la gestion du lieu (demandé) : elle ne se
           déplie plus. Ce qu'on y lisait (faction, assaut, renforts, garnison en détail) vit
           sur la fiche du lieu, qui porte aussi les actions — un seul endroit.
           ⚠️ Une `div` au rôle de bouton, plus un `<button>` : une case libre de la garnison
           EST un bouton (renfort direct), et un bouton ne peut pas en contenir un autre. -->
      <div
        v-for="r in shownRows"
        :key="r.poi.id"
        role="button"
        tabindex="0"
        class="cps-tile cps-row"
        :class="'st-' + r.status"
        :style="{ '--rk': isHeldControl(r.poi) ? HELD_COLOR : rankOf(r).color }"
        :aria-label="`${CONTROL_LABEL[r.kind]} — ouvrir la gestion`"
        @click="emit('open', r.poi)"
        @keydown.enter.self.prevent="emit('open', r.poi)"
        @keydown.space.self.prevent="emit('open', r.poi)"
      >
        <!-- 📐 Rangée 1 : icône, nom et statut sur la MÊME ligne médiane — l'icône n'est plus
             centrée sur toute la tuile (elle décrochait du titre dès que la colonne de droite
             grandissait). Le statut reste en haut à droite (demandé). -->
        <span class="cps-emo" aria-hidden="true">{{ CONTROL_EMO[r.kind] }}</span>
        <span class="cps-name">{{ CONTROL_LABEL[r.kind] }}</span>
        <span class="pill st">{{ STATUS[r.status] }}</span>
        <!-- 🧾 Rangée 2 : rang/renforts, garnison, puis ce que le lieu rapporte, calé à droite.
             UNE rangée (qui démarre sous l'icône) et ne passe à la ligne que si la place
             manque — une rangée par bloc laissait un grand vide à gauche du rendement. -->
        <span class="cps-foot">
          <span v-if="!isHeldControl(r.poi) || r.reinforcing.length" class="cps-pills">
            <span v-if="!isHeldControl(r.poi)" class="pill rk"
              >{{ rankOf(r).emoji }} {{ rankOf(r).name }} {{ rankStarStr(rankOf(r).star) }}</span
            >
            <span v-if="r.reinforcing.length" class="pill"
              >🧭 +{{ r.reinforcing.length }} en route</span
            >
          </span>
          <!-- 🖼️ La GARNISON, dans sa pastille (demandé : « pour distinguer cette partie-là ») :
               une case par place (1 à N), remplie d'une miniature par champion ou milicien
               posté, numérotée si libre — elle remplace la pastille « 🛡️ 2/5 ». Cases à taille
               FIXE (elles rétrécissaient selon la largeur du texte voisin, signalé sur la tour
               de guet). -->
          <span
            v-if="r.status !== 'enemy' && r.status !== 'assault'"
            class="cps-minis"
            :aria-label="`Garnison ${r.garrison.length} sur ${Number.isFinite(r.seats) ? r.seats : 'sans limite'}`"
          >
            <template v-for="(s, i) in slotsOf(r)" :key="i">
              <span v-if="s.kind === 'adv'" class="mini" :title="s.adv.name"
                ><ChampionPortrait :champion-id="s.adv.championId">{{
                  advTitle(s.adv)?.emoji ?? '🧑'
                }}</ChampionPortrait></span
              >
              <span
                v-else-if="s.kind === 'hero'"
                class="mini hero"
                :class="{ route: s.coming, away: s.away }"
                :title="
                  s.coming
                    ? 'Le héros est en route (2 places)'
                    : s.away
                      ? 'Le héros est en sortie, ses 2 places l’attendent'
                      : 'Le héros (2 places)'
                "
                ><span>{{ s.coming ? '🧭' : '🦸' }}</span
                ><i v-if="s.away" class="away-mark" aria-hidden="true">⚔️</i></span
              >
              <span v-else-if="s.kind === 'mil'" class="mini mil" :title="MILITIA_NAME"
                ><MilitiaPortrait
              /></span>
              <!-- 🧭 Un renfort en route occupe déjà sa place : la montrer libre inviterait à
                   en envoyer un second. -->
              <span v-else-if="s.kind === 'route'" class="mini route" title="Renfort en route"
                >🧭</span
              >
              <!-- ⚔️ En SORTIE : son portrait, estompé, marqué ⚔️ — sa place l'attend, elle
                   n'est pas libre. -->
              <span
                v-else-if="s.kind === 'away'"
                class="mini away"
                :title="`${s.adv.name} — en sortie, revient sur ce point`"
                ><ChampionPortrait :champion-id="s.adv.championId">{{
                  advTitle(s.adv)?.emoji ?? '🧑'
                }}</ChampionPortrait
                ><i class="away-mark" aria-hidden="true">⚔️</i></span
              >
              <!-- ➕ Une place libre ENVOIE un renfort, sans passer par la gestion du lieu
                   (demandé). Grisée si personne ne peut partir (ni champion ni milicien). -->
              <button
                v-else-if="canReinforce(r)"
                type="button"
                class="mini free go"
                :title="`Place ${i + 1} libre — envoyer un renfort`"
                :aria-label="`Envoyer un renfort : ${CONTROL_LABEL[r.kind]}, place ${i + 1}`"
                @click.stop="emit('reinforce', r.poi)"
                @keydown.stop
              >
                ＋
              </button>
              <span v-else class="mini free" :title="`Place ${i + 1} libre`">{{ i + 1 }}</span>
            </template>
          </span>
          <!-- 📊 Tenu : où en est la récolte (or, XP, %…). Pas tenu : ce qu'il rapporterait. -->
          <span v-if="r.progress" class="cps-yield prog" :class="{ full: isFull(r) }">
            <span>{{ r.progress.text }}</span>
            <span v-if="r.progress.pct !== null" class="cps-gauge"
              ><span :style="{ width: Math.round(r.progress.pct * 100) + '%' }"
            /></span>
          </span>
          <span v-else class="cps-yield">{{ CONTROL_YIELD[r.kind] }}</span>
        </span>
        <span class="cps-chev" aria-hidden="true">›</span>
      </div>
    </div>
  </SheetShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import SheetShell from '@/components/SheetShell.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { advTitle, type Adventurer } from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';
import {
  CONTROL_EMO,
  CONTROL_LABEL,
  CONTROL_YIELD,
  CONTROL_FILTERS,
  CONTROL_FILTER_LABEL,
  controlFilterOf,
  HELD_COLOR,
  isHeldControl,
  type ControlFilter,
  type ControlRosterRow,
  type ControlRosterStatus,
} from '@/lib/controlPoints';
import { MILITIA, MILITIA_NAME, isMilitiaId } from '@/lib/militia';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import type { Poi } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';

const props = defineProps<{
  modelValue: boolean;
  rows: ControlRosterRow[];
  advs: readonly Adventurer[];
  /** Les points où un renfort peut partir MAINTENANT (une place et quelqu'un pour la
   *  prendre) : leurs cases libres deviennent des boutons. Calculé par la page, avec la
   *  règle du store (`controlFreeSeats` / `militiaFreeSeats`). */
  reinforceable?: readonly string[];
  /** Posée dans la page (sous la carte) plutôt qu'en dialogue. */
  inline?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  open: [Poi];
  reinforce: [Poi];
}>();
const canReinforce = (r: ControlRosterRow) => !!props.reinforceable?.includes(r.poi.id);

const STATUS: Record<ControlRosterStatus, string> = {
  enemy: '☠️ ennemi',
  assault: '⚔️ assaut en cours',
  held: '🏰 tenu',
  empty: '⚠️ sans défense',
  imminent: '⚠️ attaque imminente',
};

/** 🔎 Le filtre choisi (`null` = toutes). S'il se vide (on vient de reprendre la dernière
 *  place « pas tenue »), la liste retombe sur toutes : sinon elle paraîtrait vide. */
const filter = ref<ControlFilter | null>(null);
const filterChips = computed(() =>
  CONTROL_FILTERS.map((id) => ({
    id,
    n: props.rows.filter((r) => controlFilterOf(r.status) === id).length,
  })).filter((c) => c.n > 0),
);
const activeFilter = computed(() =>
  filterChips.value.some((c) => c.id === filter.value) ? filter.value : null,
);
const shownRows = computed(() => {
  const f = activeFilter.value;
  return f ? props.rows.filter((r) => controlFilterOf(r.status) === f) : props.rows;
});
const heldCount = computed(
  () => props.rows.filter((r) => r.status !== 'enemy' && r.status !== 'assault').length,
);
const byId = computed(() => new Map(props.advs.map((a) => [a.id, a])));
const advsOf = (ids: readonly string[]) =>
  ids.flatMap((id) => {
    const a = byId.value.get(id);
    return a ? [a] : [];
  });
/** 🛡️ Les miliciens d'une garnison : ils n'existent pas dans le vivier (`advsOf` les ignore). */
const milOf = (ids: readonly string[]) => ids.filter(isMilitiaId);
type Slot =
  | { kind: 'adv'; adv: Adventurer }
  | { kind: 'mil' }
  | { kind: 'hero'; coming: boolean; away: boolean }
  | { kind: 'route' }
  | { kind: 'away'; adv: Adventurer }
  | { kind: 'free' };
/** Les cases de la ligne : champions, miliciens, renforts en route, champions en sortie (leur
 *  place est gardée), puis places libres, jusqu'à `seats`. */
const slotsOf = (r: ControlRosterRow): Slot[] => {
  // 🧝 Le héros prend 2 places : UNE case double, en tête (signalé : « je vois encore 5 boules »).
  const hero: Slot[] = r.hero
    ? [{ kind: 'hero', coming: r.hero === 'coming', away: r.hero === 'away' }]
    : [];
  const filled: Slot[] = [
    ...hero,
    ...advsOf(r.garrison).map((adv) => ({ kind: 'adv' as const, adv })),
    ...milOf(r.garrison).map(() => ({ kind: 'mil' as const })),
    ...r.reinforcing.map(() => ({ kind: 'route' as const })),
    ...advsOf(r.away).map((adv) => ({ kind: 'away' as const, adv })),
  ];
  // 🏰 Sans limite (la forteresse) : une seule case libre, qui dit qu'on peut en ajouter.
  const used = filled.length + (hero.length ? MILITIA.heroSeats - 1 : 0);
  const free = Number.isFinite(r.seats) ? Math.max(0, r.seats - used) : 1;
  return [...filled, ...Array.from({ length: free }, () => ({ kind: 'free' as const }))];
};
const rankOf = (r: ControlRosterRow) => poiRank(r.poi);
/** Réserve pleine (or/XP) ou unité prête (consommable, rune) : la jauge passe à l'accent. */
const isFull = (r: ControlRosterRow) =>
  !!r.progress && r.progress.pct !== null && r.progress.pct >= 0.999;
</script>

<style scoped>
.cps.inline {
  width: auto;
  box-sizing: border-box;
  max-width: none;
  max-height: none;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px;
  margin: 0 8px 8px;
}
.cps {
  width: 100%;
  max-width: 560px;
  max-height: 80dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
}
.cps-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.cps-title {
  font-family: Oswald, sans-serif;
  font-size: 18px;
  font-weight: 700;
}
.cps-sum {
  color: var(--dim);
  font-size: 13px;
  flex: 1;
}
.cps-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.cps-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.cps-chip {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}
.cps-chip.on {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.cps-empty {
  color: var(--dim);
}
.cps-tile {
  font: inherit;
  border: 1px solid var(--line);
  border-left: 4px solid var(--rk);
  border-radius: 12px;
  background: var(--surface-2, var(--bg));
  margin-bottom: 8px;
  overflow: hidden;
}
.cps-tile.st-imminent,
.cps-tile.st-empty {
  border-color: var(--d4);
  border-left-color: var(--rk);
}
/* 📐 Deux rangées : la 1re aligne icône, nom et statut sur une même ligne médiane (la case de
   l'icône donne sa hauteur à la rangée) ; la 2e, sous toute la largeur, porte rang/renforts,
   garnison et rendement. Le chevron se centre sur toute la tuile. */
.cps-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto 10px;
  grid-template-areas:
    'emo name st chev'
    'foot foot foot chev';
  align-items: center;
  column-gap: 10px;
  row-gap: 8px;
  width: 100%;
  min-height: 56px;
  padding: 10px 10px 10px 8px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.cps-emo {
  grid-area: emo;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 22px;
  line-height: 1;
  border-radius: 10px;
  background: color-mix(in srgb, var(--rk) 14%, transparent);
}
.cps-name {
  grid-area: name;
  min-width: 0;
  font-weight: 700;
  line-height: 1.2;
  /* Deux lignes au plus : elles tiennent dans la hauteur de l'icône (36 px), le nom reste
     centré sur elle au lieu d'être coupé à 344 px (« Scriptorium des… »). */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.pill.st {
  grid-area: st;
  justify-self: end;
}
.cps-foot {
  grid-area: foot;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}
.cps-pills {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pill {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  white-space: nowrap;
}
.pill.rk {
  border-color: color-mix(in srgb, var(--rk) 60%, transparent);
  color: var(--rk);
}
.st-enemy .pill.st {
  color: var(--dim);
}
.st-held .pill.st {
  color: var(--d1);
  border-color: color-mix(in srgb, var(--d1) 50%, transparent);
}
.st-assault .pill.st {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.st-empty .pill.st,
.st-imminent .pill.st {
  color: var(--d4);
  border-color: color-mix(in srgb, var(--d4) 50%, transparent);
}
/* Toutes les places sur UNE ligne (demandé), à taille FIXE : la rangée du bas démarre sous
   l'icône, 5 cases de 28 px et le rendement y tiennent côte à côte dès 344 px (mesuré). */
.cps-minis {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 3px 5px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--rk) 45%, var(--line));
  background: color-mix(in srgb, var(--rk) 8%, var(--surface));
}
.mini {
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  height: 28px;
  font-size: 17px;
  line-height: 1;
  border-radius: 7px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
}
/* Le portrait remplit sa case, quelle que soit sa taille. */
.mini :deep(.cp) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.mini :deep(.mil-portrait) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
/* 🧝 Le héros vaut 2 places : une case de deux largeurs (2 × 28 + l'écart de 4). */
.mini.hero {
  flex-basis: 60px;
  border-color: color-mix(in srgb, #2f6bff 80%, transparent);
}
.mini.free {
  font-family: Oswald, sans-serif;
  font-size: 12px;
  color: var(--dim);
  background: transparent;
  border-style: dashed;
}
/* ➕ Une place libre qui envoie un renfort : l'accent, et une cible plus large que la case
   (un halo transparent), la case elle-même restant de 28 px pour tenir 5 sur une ligne. */
.mini.free.go {
  position: relative;
  padding: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 70%, transparent);
  cursor: pointer;
}
.mini.free.go::after {
  content: '';
  position: absolute;
  inset: -8px -2px;
}
.mini.free.go:active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.mini.route {
  font-size: 14px;
  opacity: 0.75;
  border-style: dashed;
}
/* ⚔️ En sortie : le portrait estompé, contour pointillé à l'accent (place PRISE), et le ⚔️ en
   coin pour qu'on ne le lise pas comme un champion présent. */
.mini.away {
  position: relative;
  border: 1px dashed var(--accent);
}
.mini.away :deep(.cp),
.mini.away > :first-child {
  opacity: 0.45;
}
.away-mark {
  position: absolute;
  right: -1px;
  bottom: -1px;
  font-size: 11px;
  font-style: normal;
  line-height: 1;
}
.cps-chev {
  color: var(--dim);
  grid-area: 1 / 4 / -1 / 5;
  text-align: center;
}
/* Ce que le lieu rapporte : poussé à droite, sous le statut. */
.cps-yield {
  margin-left: auto;
  max-width: 120px;
  text-align: right;
  font-size: 11.5px;
  line-height: 1.25;
  color: var(--accent);
  font-weight: 600;
}
.cps-yield.prog {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-family: Oswald, sans-serif;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}
.cps-gauge {
  display: block;
  width: 56px;
  height: 5px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}
.cps-gauge > span {
  display: block;
  height: 100%;
  background: var(--d1);
}
/* Réserve pleine : la production s'arrête, c'est le moment de récolter. */
.cps-yield.prog.full {
  color: var(--accent);
}
.cps-yield.prog.full .cps-gauge > span {
  background: var(--accent);
}
</style>
