<template>
  <!-- 🧭 QUI PEUT PARTIR : le héros, les champions, les équipes. Une seule ligne, partagée
       par l'Aventure (où elle ouvre la carte) et par la carte elle-même (où l'on envoie) :
       deux copies finiraient par annoncer deux effectifs différents. Mêmes règles que
       l'envoi (`advAvailable`, `convoySlotsFree`) : jamais un chiffre que « Envoyer » dément. -->
  <component
    :is="interactive ? 'button' : 'div'"
    class="av-line"
    :class="{ interactive }"
    :title="title"
    :aria-label="interactive ? `${title} — ouvrir la carte d'expédition` : title"
    @click="interactive && emit('open')"
  >
    <span class="av-cell" :class="hero.tone"><span class="av-ico">🦸</span>{{ hero.label }}</span>
    <span v-if="d.champTotal" class="av-cell" :class="{ none: !d.champFree }"
      ><span class="av-ico">🏅</span>{{ d.champFree }}/{{ d.champTotal }}</span
    >
    <!-- Par rang (sur la carte) : ce qui compte pour choisir un lieu, c'est le rang de
         ceux qui peuvent partir. Une pastille par rang représenté, à sa couleur. -->
    <template v-if="byRank">
      <span
        v-for="r in freeByRank"
        :key="r.rankIndex"
        class="av-rank"
        :style="{ '--rk': r.color }"
        :title="`${r.count} ${r.name} disponible(s)`"
        ><span class="av-dot" />{{ r.count }}</span
      >
    </template>
    <span v-if="d.champHurt" class="av-cell hurt"
      ><span class="av-ico">⛑️</span>{{ d.champHurt }}</span
    >
    <span v-if="d.teamTotal" class="av-cell" :class="{ none: !d.teamFree }"
      ><span class="av-ico">🧭</span>{{ d.teamFree }}/{{ d.teamTotal }}</span
    >
    <span v-if="interactive" class="av-go">›</span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { advAvailable, countByRank } from '@/lib/adventurers';
import { caravanSlots, convoySlotsFree } from '@/lib/caravan';
import { travelPosition } from '@/lib/expedition';
import { isWounded, woundRemainingMs } from '@/lib/raid';
import { formatDuration } from '@/lib/duration';

const props = defineProps<{
  /** L'horloge de l'écran hôte (il en a déjà une, on ne double pas le tick). */
  now: number;
  /** Vrai sur l'Aventure : la ligne devient un bouton qui ouvre la carte. */
  interactive?: boolean;
  /** Vrai sur la carte : les champions disponibles se détaillent par rang. */
  byRank?: boolean;
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
  const exp = char.row?.expedition;
  const h = exp ? travelPosition(exp, props.now) : null;
  if (h && h.phase !== 'done')
    return { label: formatDuration(h.remainTotalMs), tone: 'away', healMs };
  return { label: 'dispo', tone: 'ok', healMs };
});

/** 🏅 Champions libres / possédés (hors blessés), 🧭 équipes libres / créneaux. */
const d = computed(() => {
  const advs = char.advList;
  const champHurt = advs.filter((a) => (a.hurtUntil ?? 0) > props.now).length;
  return {
    champFree: advs.filter((a) => advAvailable(a, props.now)).length,
    // ⛑️ Les blessés sortent du total : ils ne peuvent pas partir, on les compte à part.
    champTotal: advs.length - champHurt,
    champHurt,
    teamFree: convoySlotsFree(
      char.comptoirLevel,
      [...char.caravanList, ...char.partyList],
      props.now,
    ),
    teamTotal: caravanSlots(char.comptoirLevel),
  };
});

/** Champions disponibles comptés par rang (`advRank`, le rang affiché partout), du plus
 *  haut au plus bas. */
const freeByRank = computed(() =>
  countByRank(char.advList.filter((a) => advAvailable(a, props.now))),
);

const title = computed(() => {
  const h = hero.value;
  const parts = [
    h.tone === 'ok'
      ? 'Héros disponible'
      : h.tone === 'hurt'
        ? `Héros à l'infirmerie — de retour dans ${formatDuration(h.healMs)}`
        : `Héros en expédition — de retour dans ${h.label}`,
  ];
  if (d.value.champHurt) parts.push(`${d.value.champHurt} champion(s) à l'infirmerie`);
  if (d.value.champTotal)
    parts.push(`${d.value.champFree} champion(s) disponible(s) sur ${d.value.champTotal}`);
  if (d.value.teamTotal)
    parts.push(`${d.value.teamFree} équipe(s) libre(s) sur ${d.value.teamTotal}`);
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
.av-rank {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px 1px 5px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--rk) 55%, transparent);
  background: color-mix(in srgb, var(--rk) 16%, transparent);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.av-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--rk);
}
.av-go {
  margin-left: auto;
  color: var(--dim);
  font-size: 16px;
}
</style>
