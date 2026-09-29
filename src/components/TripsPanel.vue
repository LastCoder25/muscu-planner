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
      <span class="tr-poi">
        <span v-if="isRiftPoi(t.poi)" class="tr-rift">
          <RiftPortal :color="poiRank(t.poi).color" :seed="seedOf(t.poi.id)" still />
        </span>
        <template v-else>{{ poiEmo(t.poi) }}</template>
      </span>
      <span class="tr-time">{{ t.time }}</span>
      <template v-if="t.legs">
        <span v-if="t.legs.go" class="tr-legs">→ {{ t.legs.go }}</span>
        <span class="tr-legs">↩ {{ t.legs.back }}</span>
      </template>
      <i class="tr-bar" :style="{ width: t.pct + '%' }" />
    </button>
  </div>

  <!-- 👥 QUI EST DANS CE VOYAGE : toucher une tuile montre son équipe, sans rien toucher. -->
  <div v-if="crew" ref="crewEl" class="trip-crew">
    <div class="tc-head">👥 En route vers {{ poiLabel(crew.poi) }} niv {{ crew.poi.level }}</div>
    <p v-if="crew.legs" class="tc-legs">⏱️ {{ crew.legs }}</p>
    <div v-if="crew.haul.length" class="tc-haul">
      <span class="tc-haul-lab">Ramène</span>
      <!-- ❓ Toucher une ressource dit ce que c'est, comme dans les rapports (`HaulPills`). -->
      <HaulPills :pills="crew.haul" variant="chip" />
    </div>
    <div class="tc-pick">
      <div v-if="crew.hero" class="tc-hero">
        <div class="tc-hero-av">
          <AventureAvatar
            :profile="heroProfile"
            :equipped="char.row?.equipped ?? {}"
            no-companions
          />
        </div>
        <b>Ton héros</b>
      </div>
      <AdvPickTile v-for="a in crew.advs" :key="a.id" :adv="a" :on="true" readonly />
      <div v-if="crew.militia" class="tc-hero tc-mil">
        <div class="tc-mil-emo"><MilitiaPortrait /></div>
        <b>{{ crew.militia }} milicien{{ crew.militia > 1 ? 's' : '' }}</b>
      </div>
    </div>
    <p v-if="!crew.hero && !crew.advs.length && !crew.militia && !crew.gone" class="tc-none">
      Personne à bord.
    </p>
    <p v-if="crew.gone" class="tc-none">
      {{ crew.gone }} champion{{ crew.gone > 1 ? 's ne sont' : " n'est" }} plus dans ton vivier.
    </p>
    <!-- 🔙 FAIRE DEMI-TOUR depuis la tuile (demandé) : même feuille que sur la carte, la page
         décide de ce qui peut rebrousser chemin (`recallable`). -->
    <button
      v-if="crew.recallable"
      type="button"
      class="tc-recall"
      @click="emit('recall', crew.key)"
    >
      🔙 Faire demi-tour
    </button>
  </div>
</template>

<script lang="ts">
import type { HaulPill, Poi } from '@/lib/expedition';
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
  haul: HaulPill[];
  /** 🚶↩️ Aller restant et retour (`tripLegs`), `null` une fois rentré. */
  legs?: { go: string | null; back: string; detail: string } | null;
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import RiftPortal from '@/components/RiftPortal.vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import { useCharacterStore } from '@/stores/character';
import { isRiftPoi, poiEmo, poiLabel } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';
import { seedOf } from '@/lib/combat';
import type { CharacterProfile } from '@/lib/character';
import type { Adventurer } from '@/lib/adventurers';
import { militiaIn } from '@/lib/militia';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import HaulPills from '@/components/HaulPills.vue';

const props = defineProps<{
  trips: MapTrip[];
  focus: string | null;
  heroProfile: CharacterProfile;
  /** 🔙 Les voyages (par `key`) qui peuvent encore faire demi-tour. */
  recallable?: ReadonlySet<string>;
}>();
const emit = defineEmits<{ 'update:focus': [key: string | null]; recall: [key: string] }>();
const char = useCharacterStore();

/** 👥 L'équipe naît SOUS la carte et la rangée de tuiles : sur un téléphone elle était hors de
 *  l'écran, il fallait faire défiler pour la voir (signalé). On la RÉVÈLE au toucher d'une
 *  tuile — même remède que la fiche d'un lieu (v0.738). `nearest` : rien ne bouge si elle
 *  est déjà visible. */
const crewEl = ref<HTMLElement | null>(null);
watch(
  () => props.focus,
  async (key) => {
    if (!key) return;
    await nextTick();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    crewEl.value?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  },
);

/** 👥 Les membres du voyage touché (demandé : « quand je clique sur une expédition, voir les
 *  champions qui sont dedans »). Un champion renvoyé depuis n'est plus dans le vivier : il est
 *  compté à part plutôt que de faire tomber l'écran. */
const crew = computed(() => {
  const t = props.trips.find((x) => x.key === props.focus);
  if (!t) return null;
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  const advs = t.members.map((id) => byId.get(id)).filter((a): a is Adventurer => !!a);
  // 🛡️ Les miliciens sont anonymes, hors du vivier : comptés à part (sans ça ils passaient
  // pour des champions « qui ne sont plus dans ton vivier »).
  const militia = militiaIn(t.members).length;
  // Le butin est tiré au départ, mais on ne le montre qu'une fois le lieu atteint (retour) :
  // à l'aller, l'annoncer révélerait l'issue d'un combat qui n'a pas encore eu lieu.
  return {
    key: t.key,
    recallable: !!props.recallable?.has(t.key),
    hero: t.withHero,
    advs,
    militia,
    gone: t.members.length - advs.length - militia,
    poi: t.poi,
    haul: t.back ? t.haul : [],
    legs: t.legs?.detail ?? null,
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
  position: relative;
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
/* 🛡️ Les miliciens : anonymes, un seul encart avec leur nombre (bordure neutre : ce n'est pas
   le héros). */
.tc-mil {
  border-color: var(--line);
}
.tc-mil-emo {
  /* Le portrait (ou l'emoji de repli) à la taille de l'avatar du héros voisin. */
  font-size: 48px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tc-recall {
  width: 100%;
  min-height: 44px;
  margin-top: 10px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.tc-recall:active {
  transform: scale(0.98);
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
/* 🎯 L'objectif du voyage, en encart dans le coin haut-droit : collé au bord EXTÉRIEUR
   de la tuile (top/right 0), seuls ses côtés intérieurs sont tracés, dans la couleur
   de la tuile (`inherit` suit aller / convoi / retour). */
.tr-poi {
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
/* 🌀 La faille garde son portail sous la carte aussi, à la taille de l'emoji. */
.tr-rift {
  display: inline-block;
  width: 10px;
  height: 16px;
}
.tr-legs {
  flex-basis: 100%;
  text-align: center;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.tc-legs {
  margin: 2px 0 6px;
  font-size: 12px;
  color: var(--dim);
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
