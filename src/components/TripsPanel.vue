<!--
  🧭 LES VOYAGES EN COURS, en une rangée de tuiles, et l'équipe du voyage touché. Sorti de
  `ExpeditionMapPage` (découpage de la page, 2026-09-27).

  Trois cartes empilées poussaient la carte hors de l'écran dès deux convois, et répétaient
  « total » et « escorte » dont on n'a pas besoin en un coup d'œil : il faut QUI voyage, VERS
  QUOI, et COMBIEN DE TEMPS. Toucher une tuile allume un halo rouge sur elle et sur son lieu
  (la page le dessine, d'où le `v-model:focus`) ; la retoucher les éteint.
-->
<template>
  <div v-if="trips.length" class="trips">
    <button
      v-for="t in trips"
      :key="t.key"
      type="button"
      class="trip"
      :class="[t.kind, { back: t.back, focus: focus === t.key }]"
      :title="t.title"
      :aria-pressed="focus === t.key"
      @click="emit('update:focus', focus === t.key ? null : t.key)"
    >
      <span class="tr-who">{{ t.who }}</span>
      <span v-if="isRiftPoi(t.poi)" class="tr-poi tr-rift">
        <RiftPortal :color="poiRank(t.poi).color" :seed="seedOf(t.poi.id)" still />
      </span>
      <span v-else class="tr-poi">{{ POI_EMO[t.poi.type] }}</span>
      <span class="tr-time">{{ t.time }}</span>
      <i class="tr-bar" :style="{ width: t.pct + '%' }" />
    </button>
  </div>

  <!-- 👥 QUI EST DANS CE VOYAGE : toucher une tuile montre son équipe, sans rien toucher. -->
  <div v-if="crew" class="trip-crew">
    <div class="tc-head">
      👥 En route vers {{ POI_LABEL[crew.poi.type] }} niv {{ crew.poi.level }}
    </div>
    <div v-if="crew.haul.length" class="tc-haul">
      <span class="tc-haul-lab">Ramène</span>
      <span v-for="p in crew.haul" :key="p.emoji" class="tc-pill">{{ p.emoji }} {{ p.n }}</span>
    </div>
    <div class="tc-pick">
      <div v-if="crew.hero" class="tc-hero">
        <div class="tc-hero-av">
          <AventureAvatar :profile="heroProfile" :equipped="char.row?.equipped ?? {}" no-companions />
        </div>
        <b>Ton héros</b>
      </div>
      <AdvPickTile v-for="a in crew.advs" :key="a.id" :adv="a" :on="true" readonly />
    </div>
    <p v-if="!crew.hero && !crew.advs.length && !crew.gone" class="tc-none">Personne à bord.</p>
    <p v-if="crew.gone" class="tc-none">
      {{ crew.gone }} champion{{ crew.gone > 1 ? 's ne sont' : " n'est" }} plus dans ton vivier.
    </p>
  </div>
</template>

<script lang="ts">
import type { Poi } from '@/lib/expedition';
/** Un voyage en cours, tel que la rangée le montre. */
export interface MapTrip {
  key: string;
  kind: 'hero' | 'van';
  who: string;
  poi: Poi;
  time: string;
  pct: number;
  back: boolean;
  title: string;
  /** Qui voyage : le héros, et les ids des champions (montrés quand on touche la tuile). */
  withHero: boolean;
  members: string[];
  /** Ce que le voyage ramènera (tiré au départ), montré au-dessus de l'équipe. */
  haul: { emoji: string; n: number }[];
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import RiftPortal from '@/components/RiftPortal.vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import { useCharacterStore } from '@/stores/character';
import { POI_EMO, POI_LABEL, isRiftPoi } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';
import { seedOf } from '@/lib/combat';
import type { CharacterProfile } from '@/lib/character';
import type { Adventurer } from '@/lib/adventurers';

const props = defineProps<{
  trips: MapTrip[];
  focus: string | null;
  heroProfile: CharacterProfile;
}>();
const emit = defineEmits<{ 'update:focus': [key: string | null] }>();
const char = useCharacterStore();

/** 👥 Les membres du voyage touché (demandé : « quand je clique sur une expédition, voir les
 *  champions qui sont dedans »). Un champion renvoyé depuis n'est plus dans le vivier : il est
 *  compté à part plutôt que de faire tomber l'écran. */
const crew = computed(() => {
  const t = props.trips.find((x) => x.key === props.focus);
  if (!t) return null;
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  const advs = t.members.map((id) => byId.get(id)).filter((a): a is Adventurer => !!a);
  // Le butin est tiré au départ, mais on ne le montre qu'une fois le lieu atteint (retour) :
  // à l'aller, l'annoncer révélerait l'issue d'un combat qui n'a pas encore eu lieu.
  return {
    hero: t.withHero,
    advs,
    gone: t.members.length - advs.length,
    poi: t.poi,
    haul: t.back ? t.haul : [],
  };
});
</script>

<style scoped lang="scss">
/* TROIS tuiles par ligne (demandé par l'utilisateur). En flex centré plutôt qu'en grille :
   la dernière ligne, incomplète, se CENTRE toute seule quel que soit le reste (1 ou 2) —
   laissée dans ses colonnes, elle se collait à gauche avec un trou, ce qui se lit comme un
   élément manquant plutôt que comme la fin de la liste. */
.trips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 2px 2px 6px;
}
.trip-crew {
  margin: 0 2px 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.tc-head {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.tc-haul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.tc-haul-lab {
  font-size: 12px;
  color: var(--dim);
}
.tc-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--line);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* Deux membres par ligne, comme le choix d'une équipe. */
.tc-pick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}
.tc-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  min-height: 44px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  font-size: 13px;
}
.tc-hero-av {
  width: 64px;
  height: 64px;
}
.tc-none {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.trips > .trip {
  /* border-box : sans lui padding et bordure s'ajoutaient au tiers, et il n'en tenait que deux. */
  box-sizing: border-box;
  flex: 0 0 calc((100% - 16px) / 3);
}
.trip {
  position: relative;
  min-width: 0;
  display: flex;
  flex-wrap: wrap; /* à trois par ligne, le temps passe SOUS les emojis : côte à côte il était coupé à 344 px */
  align-items: center;
  justify-content: center;
  gap: 1px 4px;
  min-height: 44px; /* cible tactile */
  padding: 7px 7px 9px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  overflow: hidden;
  cursor: pointer;
}
.trip.van {
  border-color: #b57bff;
}
/* Au RETOUR la teinte change : on rentre, on ne va plus. */
.trip.back {
  border-color: #7bc86c;
}
.tr-who {
  font-size: 17px;
}
.tr-poi {
  font-size: 15px;
}
/* 🌀 La faille garde son portail sous la carte aussi, à la taille de l'emoji. */
.tr-rift {
  display: inline-block;
  width: 11px;
  height: 18px;
}
.tr-time {
  flex-basis: 100%;
  text-align: center;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
/* L'avancement du voyage, en sous-lignage : la même information que le temps, sans
   une ligne de plus. ⚠️ `voyageProgress` (durée TOTALE) et non la fraction de phase,
   qui repart à zéro au demi-tour et ferait RECULER la barre à mi-chemin. */
.tr-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: var(--accent);
  transition: width 0.6s linear;
}
.trip.van .tr-bar {
  background: #b57bff;
}
.trip.back .tr-bar {
  background: #7bc86c;
}
/* 🔴 La tuile touchée : le même rouge que le halo posé sur son lieu, pour qu'on relie les deux. */
.trip.focus {
  box-shadow:
    0 0 0 2px #ff5d5d,
    0 0 12px 2px rgb(255 93 93 / 55%);
}
</style>
