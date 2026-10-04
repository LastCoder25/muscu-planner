<template>
  <!-- 🧭 QUI PEUT PARTIR : le héros et les champions. Une seule ligne, partagée
       par l'Aventure (où elle ouvre la carte) et par la carte elle-même (où l'on envoie) :
       deux copies finiraient par annoncer deux effectifs différents. Mêmes règles que
       l'envoi (`advAvailable`) : jamais un chiffre que « Envoyer » dément. -->
  <component
    :is="interactive ? 'button' : 'div'"
    class="av-line"
    :class="{ interactive, ranked: byRank, vertical }"
    :title="title"
    :aria-label="interactive ? `${title} — ouvrir la carte d'expédition` : title"
    @click="interactive && emit('open')"
  >
    <span class="av-cell" :class="hero.tone"><span class="av-ico">🦸</span>{{ hero.label }}</span>
    <span v-if="d.champTotal && !byRank" class="av-cell" :class="{ none: !d.champFree }"
      ><span class="av-ico">🏅</span>{{ d.champFree }}/{{ d.champTotal }}</span
    >
    <span v-if="d.champHurt" class="av-cell hurt"
      ><span class="av-ico">⛑️</span>{{ d.champHurt }}</span
    >
    <!-- 🏅 PAR RANG (sur la carte) : ce qui décide d'un lieu, c'est le rang de ceux qui
         peuvent partir. Une pastille par rang possédé : une MÉDAILLE à la couleur du rang
         (le nom reste dans l'infobulle et pour les lecteurs d'écran), libres sur le total
         de ce rang (blessés exclus, comptés à part), sur la même ligne. -->
    <span v-if="byRank && rankRows.length" class="av-ranks">
      <span
        v-for="r in rankRows"
        :key="r.rankIndex"
        class="av-rank"
        :class="{ none: !r.free }"
        :style="{ '--rk': r.color }"
        :title="`${r.free} ${r.name} disponible(s) sur ${r.total}`"
        :aria-label="`${r.name} : ${r.free} disponible(s) sur ${r.total}`"
        ><svg class="av-medal" viewBox="0 0 14 18" aria-hidden="true">
          <path class="av-ribbon" d="M3 0h3l2 7H5zM8 0h3L9 7H6z" />
          <circle cx="7" cy="12" r="5.2" />
          <circle class="av-shine" cx="7" cy="12" r="2.6" /></svg
        ><b>{{ r.free }}</b
        >/{{ r.total }}</span
      >
    </span>
    <span v-if="interactive" class="av-go">›</span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { advAtInfirmary, advAvailable, rankAvailability, type Adventurer } from '@/lib/adventurers';
import { travelPosition } from '@/lib/expedition';
import { isWounded, woundRemainingMs } from '@/lib/raid';
import { formatDuration } from '@/lib/duration';
import { heroAttackReturnAt } from '@/lib/combinedAttack';
import { readyGarrisons } from '@/lib/controlRoutes';
import { plannedTransferIds } from '@/lib/plannedMoves';

const props = defineProps<{
  /** L'horloge de l'écran hôte (il en a déjà une, on ne double pas le tick). */
  now: number;
  /** Vrai sur l'Aventure : la ligne devient un bouton qui ouvre la carte. */
  interactive?: boolean;
  /** Vrai sur la carte : les champions disponibles se détaillent par rang. */
  byRank?: boolean;
  /** Vrai en overlay sur la carte : une colonne à gauche, du haut vers le bas. */
  vertical?: boolean;
}>();
const emit = defineEmits<{ open: [] }>();
const char = useCharacterStore();

/** 🦸 Le temps jusqu'au RETOUR en ville (c'est lui qui rend le héros disponible, pas
 *  l'arrivée sur le lieu), ou sa convalescence — qui passe devant : elle le retient le
 *  plus longtemps. */
const hero = computed<{ label: string; tone: 'ok' | 'away' | 'hurt'; healMs: number }>(() => {
  const healMs = woundRemainingMs(char.row?.base, props.now);
  if (isWounded(char.row?.base, props.now))
    return { label: `⛑️ ${formatDuration(healMs)}`, tone: 'hurt', healMs };
  // ⛵ En traversée (réservée ou en mer) : il est sur le bateau jusqu'au débarquement
  // (signalé : la ligne disait « dispo » pendant toute la traversée).
  const sea = char.row?.expedition_map?.crossing;
  if (sea && sea.arriveAt > props.now)
    return { label: `⛵ ${formatDuration(sea.arriveAt - props.now)}`, tone: 'away', healMs };
  const exp = char.row?.expedition;
  const h = exp ? travelPosition(exp, props.now) : null;
  if (h && h.phase !== 'done')
    return { label: formatDuration(h.remainTotalMs), tone: 'away', healMs };
  // ⚔️ Engagé dans une attaque combinée (réservé en attente, ou parti) : il n'est pas libre.
  const attackBack = heroAttackReturnAt(char.attackList);
  if (attackBack !== null && attackBack > props.now)
    return { label: `⚔️ ${formatDuration(attackBack - props.now)}`, tone: 'away', healMs };
  return { label: 'dispo', tone: 'ok', healMs };
});

/** 🏰 Les champions de garnison PRÊTS À SORTIR des points fixes tenus — la règle de l'écran
 *  d'envoi (`readyGarrisons`) : une sortie peut partir de chez eux, ils comptent donc comme
 *  disponibles au même titre que ceux de la base (demandé). */
const readyPosted = computed(() => {
  const ids = new Set<string>();
  const ready = readyGarrisons(
    char.row?.expedition_map,
    char.advList,
    props.now,
    plannedTransferIds(char.plannedList),
  );
  for (const list of ready.values()) for (const a of list) ids.add(a.id);
  return ids;
});
/** Peut partir : libre à la base, ou prêt dans la garnison d'un point fixe. */
const canGo = (a: Adventurer) => advAvailable(a, props.now) || readyPosted.value.has(a.id);

/** 🏅 Champions disponibles (base + garnisons prêtes) / possédés (hors blessés). */
const d = computed(() => {
  const advs = char.advList;
  // 🏥 À l'infirmerie seulement : un blessé qui rentre encore à pied est « en route ».
  const champHurt = advs.filter((a) => advAtInfirmary(a, props.now)).length;
  return {
    champFree: advs.filter(canGo).length,
    // ⛑️ Les blessés sortent du total : ils ne peuvent pas partir, on les compte à part.
    champTotal: advs.length - champHurt,
    champHurt,
  };
});

/** Champions par rang (`advRank`, le rang de la fiche), du plus haut au plus bas : libres
 *  sur possédés, blessés exclus (ils sont comptés à part). */
const rankRows = computed(() =>
  rankAvailability(
    char.advList.filter((a) => !advAtInfirmary(a, props.now)),
    canGo,
  ),
);

/** ⛵ L'infobulle d'une traversée : vers quelle île, départ (s'il n'a pas eu lieu), arrivée. */
const seaTitle = computed(() => {
  const c = char.row?.expedition_map?.crossing;
  if (!c) return '';
  const wait =
    c.departAt > props.now ? `départ dans ${formatDuration(c.departAt - props.now)}, ` : '';
  return `Héros en traversée vers l'île ${c.to} — ${wait}arrivée dans ${formatDuration(Math.max(0, c.arriveAt - props.now))}`;
});

const title = computed(() => {
  const h = hero.value;
  const parts = [
    h.tone === 'ok'
      ? 'Héros disponible'
      : h.tone === 'hurt'
        ? `Héros à l'infirmerie — de retour dans ${formatDuration(h.healMs)}`
        : h.label.startsWith('⛵')
          ? seaTitle.value
          : h.label.startsWith('⚔️')
            ? `Héros engagé dans une attaque combinée — libre dans ${h.label.slice(3)}`
            : `Héros en expédition — de retour dans ${h.label}`,
  ];
  if (d.value.champHurt) parts.push(`${d.value.champHurt} champion(s) à l'infirmerie`);
  if (d.value.champTotal)
    parts.push(`${d.value.champFree} champion(s) disponible(s) sur ${d.value.champTotal}`);
  return parts.join(' · ');
});
</script>

<style scoped>
/* Pilule pleine largeur, le gabarit du plateau de ressources. */
.av-line {
  flex: 1 0 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 34px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font: inherit;
  text-align: left;
  overflow-x: auto;
  scrollbar-width: none;
}
.av-line::-webkit-scrollbar {
  display: none;
}
.av-line.interactive {
  cursor: pointer;
}
.av-cell {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.av-ico {
  display: inline-flex;
  font-size: 14px;
  line-height: 1;
}
.av-cell.ok {
  color: var(--d1, #7bc86c);
}
.av-cell.away {
  color: #8fd0ff;
}
.av-cell.hurt {
  color: var(--d4, #ff6a45);
}
.av-cell.none {
  color: var(--dim);
}
/* Par rang (demandé : « tout sur la même ligne et centré ») : héros, infirmerie, rangs et
   équipes forment UNE ligne centrée ; elle ne passe à la ligne, toujours centrée, que si
   la largeur manque (téléphone plié, beaucoup de rangs). Jamais de défilement : les rangs
   sont la raison d'être de la ligne sur la carte. */
.av-line.ranked {
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 14px;
  overflow-x: visible;
}
/* Les pastilles deviennent des éléments de la ligne elle-même. */
.av-ranks {
  display: contents;
}
.av-rank b {
  font-size: 13px;
}
.av-rank.none {
  opacity: 0.5;
}
/* La médaille porte la couleur : plus de cadre autour, la place sert à tenir sur une ligne. */
.av-rank {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* Médaille : ruban sombre, disque à la couleur du rang, reflet clair au centre. */
.av-medal {
  width: 13px;
  height: 17px;
  flex: none;
}
.av-medal circle {
  fill: var(--rk);
  stroke: color-mix(in srgb, var(--rk) 55%, #000);
  stroke-width: 0.8;
}
.av-medal .av-shine {
  fill: color-mix(in srgb, var(--rk) 55%, #fff);
  stroke: none;
  opacity: 0.55;
}
.av-ribbon {
  fill: color-mix(in srgb, var(--rk) 45%, #3a2f24);
}
/* 🗺️ EN COLONNE SUR LA CARTE (demandé : « à gauche, verticalement en partant du haut ») :
   héros en tête, puis l'infirmerie, puis un rang par ligne, du plus haut au plus bas. */
.av-line.vertical {
  flex: none;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  min-height: 0;
  padding: 6px 7px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}
.av-line.vertical .av-cell,
.av-line.vertical .av-rank {
  font-size: 12px;
}
/* Centrée, la ligne garde son chevron à côté du reste (un auto le repousserait seul au bord). */
.av-line.ranked .av-go {
  margin-left: 0;
}
.av-go {
  margin-left: auto;
  color: var(--dim);
  font-size: 16px;
}
</style>
