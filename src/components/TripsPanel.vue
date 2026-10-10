<!--
  🧭 LES VOYAGES EN COURS, en une rangée de tuiles (par-dessus la carte, bouton 🧭). Sorti de
  `ExpeditionMapPage` (découpage de la page, 2026-09-27).

  Trois cartes empilées poussaient la carte hors de l'écran dès deux convois, et répétaient
  « total » et « escorte » dont on n'a pas besoin en un coup d'œil : il faut QUI voyage, VERS
  QUOI, et COMBIEN DE TEMPS. Toucher une tuile allume un halo rouge sur elle et sur son lieu
  (la page le dessine, d'où le `v-model:focus`) ; la retoucher les éteint. Plus de détail
  d'équipe sous la tuile (demandé) : le tracé sur la carte suffit, la barre ⚡🔙 de la page agit.
-->
<template>
  <!-- ⏱️ VOYAGES ET ATTAQUES MÊLÉS, DANS L'ORDRE D'ARRIVÉE (demandé) : ce qui tombe le plus
       tôt passe en tête, qu'il s'agisse d'un retour ou d'une frappe ennemie (`tiles`). -->
  <!-- 🧭⚔️ FILTRE (demandé) : voyages et armées ennemies partagent la rangée ; on choisit ce
       qu'on regarde. Les catégories se COMBINENT (v1.76.0) : chacune s'ajoute ou se retire
       d'un toucher, « Tout » remet tout (ou retire tout s'il est déjà allumé) —
       `TripSelection`, `shownTripCats`. -->
  <div v-if="tiles.length" ref="topEl" class="tr-filter" role="group" aria-label="Filtrer">
    <button
      v-for="o in filterOpts"
      :key="o.id"
      type="button"
      class="trf"
      :class="[`trf-${o.id}`, { on: o.on }]"
      :aria-pressed="o.on"
      :title="o.label"
      :aria-label="o.id === 'all' ? o.label : `${o.label} (${o.n})`"
      @click="pick(o.id)"
    >
      <template v-if="o.id === 'all'">{{ o.label }}</template>
      <template v-else
        >{{ o.icon }} <b>{{ o.n }}</b></template
      >
    </button>
    <!-- ⏱️ L'ORDRE DE LA RANGÉE (2026-10-10, demandé), à droite des filtres : temps total
         avant le retour en ville, ou temps avant la prochaine étape. Un toucher bascule. -->
    <button
      type="button"
      class="trf trf-sort"
      :title="SORT_LABEL[sort].title"
      :aria-label="`Ordre : ${SORT_LABEL[sort].title} — toucher pour changer`"
      @click="sort = sort === 'home' ? 'step' : 'home'"
    >
      ⇅ {{ SORT_LABEL[sort].short }}
    </button>
  </div>
  <p v-if="tiles.length && !shownTiles.length" class="tr-none">
    Aucune catégorie choisie — touche « Tout » ou une catégorie.
  </p>
  <div v-if="tiles.length" ref="tilesEl" class="trips">
    <template
      v-for="{ key, trip: t, leg: lt, ends: e, line: tl, attack: r } in shownTiles"
      :key="key"
    >
      <button
        v-if="t && lt && e"
        type="button"
        class="trip"
        :class="[
          t.kind,
          'leg-' + lt.leg,
          {
            back: lt.back,
            line: !!tl,
            focus: focus === t.key,
            pending: t.pending,
            failed: !!t.failed,
            'has-total': !tl && !!bannerOf(lt),
            sea: !!t.sea,
            combo: !!t.combo,
          },
        ]"
        :style="t.combo ? { '--combo': t.combo } : undefined"
        :title="t.title"
        :aria-pressed="focus === t.key"
        @click="emit('update:focus', focus === t.key ? null : t.key)"
      >
        <!-- 🧭 D'OÙ VIENT LA TROUPE (demandé), en encart haut-gauche, et OÙ ELLE VA en
           haut-droit. Sur le retour, les deux s'inversent (`tripEnds`). -->
        <span :class="'tr-from'" :title="endTitle(e.left)">
          <template v-if="e.left.kind === 'isle'"
            >🏝️<sub>{{ (e.left as { n: number }).n }}</sub></template
          >
          <template v-else-if="e.left.kind === 'base'">🏰</template>
          <span v-else-if="isRiftPoi(endPoi(e.left))" class="tr-rift">
            <RiftPortal
              :color="poiRank(endPoi(e.left)).color"
              :seed="seedOf(endPoi(e.left).id)"
              still
            />
          </span>
          <template v-else>{{ poiEmo(endPoi(e.left)) }}</template>
        </span>
        <!-- 🎴 L'icône de l'ÉTAPE (⏳ ⚔️ 🔍 ↩️, demandé) ; sans étapes, celle du voyageur. -->
        <span class="tr-who" :title="lt.icon ? LEG_PILL[lt.leg].label : undefined">{{
          lt.icon ?? t.who
        }}</span>
        <!-- 👥 QUI VOYAGE (demandé, d'abord pour les renforts, puis pour toutes les
           expéditions) : leurs portraits sous l'icône, sur une ligne centrée. Champions et
           miliciens ; le héros aussi quand l'icône du haut dit l'étape, pas le voyageur. -->
        <span v-if="t.members.length || (lt.icon && t.withHero)" class="tr-faces">
          <span v-if="lt.icon && t.withHero" class="tr-face" title="Ton héros">🧝</span>
          <span v-for="f in facesOf(t)" :key="f.id" class="tr-face" :title="f.name">
            <MilitiaPortrait v-if="f.militia" />
            <ChampionPortrait v-else :champion-id="f.championId">{{ f.emoji }}</ChampionPortrait>
          </span>
          <span v-if="t.members.length > facesMax(t)" class="tr-face-more"
            >+{{ t.members.length - facesMax(t) }}</span
          >
        </span>
        <span :class="'tr-poi'" :title="endTitle(e.right)">
          <template v-if="e.right.kind === 'isle'"
            >🏝️<sub>{{ (e.right as { n: number }).n }}</sub></template
          >
          <template v-else-if="e.right.kind === 'base'">🏰</template>
          <span v-else-if="isRiftPoi(endPoi(e.right))" class="tr-rift">
            <RiftPortal
              :color="poiRank(endPoi(e.right)).color"
              :seed="seedOf(endPoi(e.right).id)"
              still
            />
          </span>
          <template v-else>{{ poiEmo(endPoi(e.right)) }}</template>
        </span>
        <!-- ⏱️ TOUS LES TEMPS EN BAS DE TUILE (demandé), dans le même bandeau : celui de
             l'étape de la tuile (`bannerOf`). Pas sur une tuile à frise : ses libellés portent
             déjà chaque temps, celui de l'étape en cours en gras. -->
        <span v-if="!tl && bannerOf(lt)" class="tr-total" :title="bannerOf(lt)!.title">{{
          bannerOf(lt)!.text
        }}</span>
        <!-- ✖ MISSION RATÉE (demandé) : ce qu'il faudra refaire se voit d'un coup d'œil. -->
        <span v-if="t.failed" class="tr-fail">{{
          t.failed === 'turned' ? '🔙 Demi-tour' : '✖ Échec'
        }}</span>
        <!-- ↩ Retour encore à venir (le voyage est à l'aller) : sa durée en sous-titre. -->
        <span v-if="lt.line" class="tr-legs">{{ lt.line }}</span>
        <template v-else-if="t.legs && lt.key === lt.tripKey">
          <!-- ⏱️ La prochaine étape est dans le bandeau du bas : l'aller n'est redit que pour un
               départ en attente, dont la tête décompte le départ. -->
          <span v-if="t.legs.go && t.pending" class="tr-legs">→ {{ t.legs.go }}</span>
          <!-- Sur le retour, le bandeau du bas DIT déjà ce temps : pas de seconde ligne. -->
          <span v-if="t.legs.go || t.sea || !t.back || !t.total" class="tr-legs"
            >{{ t.sea ? '' : '↩ ' }}{{ t.legs.back }}</span
          >
        </template>
        <!-- 🧭 LA FRISE DU VOYAGE (concept B) : un segment par étape, large comme sa durée —
             pointillés pour l'attente, ligne pour un trajet, tirets épais sur place. Le curseur
             est posé dans l'étape en cours, là où on en est. -->
        <template v-if="tl">
          <span class="tl-frise" :title="`Voyage fait à ${Math.round(tl.cursor)} %`">
            <span
              v-for="(s, i) in tl.segs"
              :key="i"
              class="tl-seg"
              :class="['tl-' + s.leg, { cur: s.current }]"
              :style="{ '--w': s.width }"
            >
              <i :style="{ width: s.fill + '%' }" />
              <b v-if="s.current" class="tl-cursor" :style="{ left: s.fill + '%' }" />
              <!-- ⏱️ LE TEMPS DANS LA BARRE, EN PASTILLE (2026-10-09, demandé) : l'étape en cours
                   en couleur, les suivantes en grisé, les étapes finies estompées. -->
              <em class="tl-pill" :class="{ cur: s.current, done: s.done }">{{ s.label }}</em>
            </span>
          </span>
        </template>
        <i v-else class="tr-bar" :style="{ width: lt.pct + '%' }" />
        <!-- 💰 LA RÉCOMPENSE SUR LA TUILE (2026-10-09, demandé) : au retour, ce que le voyage
             RAMÈNE (le butin réel, comme dans le détail de l'équipe) ; à l'aller, seulement ce
             que le lieu rapporte s'il est pris — le butin réel révélerait l'issue. -->
        <!-- ⚠️ Du TEXTE, pas `HaulPills` : la tuile est un <button>, et des boutons imbriqués
             ne sont pas du HTML valide (vu au banc : le navigateur referme la tuile avant les
             pastilles). Le détail de l'équipe, lui, garde les pastilles touchables. -->
        <span v-if="t.back && t.haul.length" class="tr-loot" title="Ce que le voyage ramène"
          ><span class="tr-loot-lab">🎁</span> {{ haulText(t.haul) }}</span
        >
        <span
          v-else-if="!t.back && t.expected"
          class="tr-loot est"
          title="Ce que le lieu rapporte s'il est pris (hors aléas de la route)"
          ><span class="tr-loot-lab">💰 si pris</span> {{ t.expected }}</span
        >
        <!-- 🛡️ LES PLACES DU LIEU À SON ARRIVÉE (2026-10-09, demandé) : tenues (pleines), les
             siennes (accent), celles d'autres renforts en route (pointillé), libres (vides). -->
        <span v-if="t.seats" class="tr-seats">
          <span v-for="r in seatRows(t.seats)" :key="r.key" class="ts-row" :title="r.title">
            <span class="ts-lab">{{ r.icon }}</span>
            <i v-for="(c, i) in r.cells" :key="i" class="ts-c" :class="c" />
            <span v-if="r.over" class="ts-over">+{{ r.over }} demi-tour</span>
          </span>
        </span>
      </button>
      <!-- ⚔️ LES ATTAQUES ENNEMIES, AU MÊME FORMAT QUE LES VOYAGES (demandé) : l'armée ⚔️ en
         haut-gauche (d'où vient la troupe), sa faction au centre, le LIEU ATTAQUÉ en haut-droit
         (🏰 la base), le temps avant la frappe, la tenue de ta défense, et sa marche en
         sous-lignage. Toucher la tuile ouvre l'armée sur la carte. -->
      <button
        v-else-if="r"
        type="button"
        class="trip attack"
        :class="['has-total', { soon: r.inMs < ATTACK_SOON_MS }]"
        :title="attackTitle(r)"
        :aria-label="attackTitle(r)"
        @click="emit('attack', r.army)"
      >
        <span class="tr-from">⚔️</span>
        <span class="tr-who">{{ FACTION_EMOJI[r.faction] }}</span>
        <span class="tr-poi">{{ r.target ? poiEmo(r.target) : '🏰' }}</span>
        <span class="tr-total" title="Frappe dans">⚔️ {{ formatCountdown(r.inMs) }}</span>
        <span v-if="holdOf(r) !== null" class="tr-legs tr-hold" :class="siegeOdds(holdOf(r)! / 100)"
          >🛡️ {{ holdOf(r) }} %</span
        >
        <span v-else-if="r.kind === 'siege'" class="tr-legs">🛡️ tenue ?</span>
        <i class="tr-bar" :style="{ width: marchPct(r) + '%' }" />
      </button>
    </template>
  </div>

</template>

<script lang="ts">
import type { HaulPill, Poi, TripPhase, TripStep, VoyageFailure } from '@/lib/expedition';
import type { ActiveAttack } from '@/lib/fieldArmy';
import type { TripCategory } from '@/lib/tripFilter';
import type { arrivalSeats } from '@/lib/controlPoints';
type ArrivalSeats = ReturnType<typeof arrivalSeats>;
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
  /** 💰 À l'aller : ce que le lieu rapporte s'il est pris (« 300 🪙 · 2 🔮 », `formatHaul`). */
  expected?: string | null;
  /** 🧭 D'où part la troupe : un point fixe, ou `null` = la base. */
  from: Poi | null;
  /** 🏠 La troupe rentre à la BASE (un retour d'un point fixe) : l'objectif est 🏰. */
  toBase?: boolean;
  /** 🚶↩️ Aller restant et retour (`tripLegs`), `null` une fois rentré. */
  legs?: {
    go: string | null;
    back: string;
    detail: string;
    phases?: TripPhase[];
    steps?: TripStep[];
  } | null;
  /** ⏱️ L'heure (ms) de la prochaine étape du voyage (`nextStepAt`) — l'ordre de la rangée. */
  endsAt?: number;
  /** 🏠 L'heure (ms) du retour en ville : l'ordre de sa tuile « ↩ Retour » à venir. */
  homeAt?: number;
  /** 🏠 Temps total avant le retour en ville, quand il diffère de la prochaine étape
   *  (`tripTimeLabel`). */
  total?: string | null;
  /** Icône du bandeau du bas : 🏠 retour à la base (défaut), 📍 arrivée sur un lieu, ⚓ port. */
  totalIcon?: string;
  /** 🧭🛡️🗡️ Expédition, renfort ou attaque du joueur (les filtres de la rangée). */
  cat: TripCategory;
  /** ⏳ Programmé, pas encore parti (filtre « Programmés »). */
  pending?: boolean;
  /** ✖ Mission ratée (rapport tombé) : la tuile le dit, pour voir ce qu'il faut refaire. */
  failed?: VoyageFailure | null;
  /** ⛵ Un voyage en MER d'une île à l'autre : `poi` n'est que le port d'ancrage. */
  sea?: { from: number; to: number };
  /** 🎨 Groupe d'une attaque combinée : la couleur de SON attaque (contour de la tuile). */
  combo?: string;
  /** 🛡️ Un renfort (ou le héros qui va se poster) : les places du lieu à son arrivée
   *  (`arrivalSeats`) — tenues, les siennes, celles d'autres renforts, libres. */
  seats?: ArrivalSeats | null;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { toggleAllTrips, toggleTripCat, tripCatPillOn, type TripFilter } from '@/lib/tripFilter';
import { STEP_ICON, TRIP_LEGS, type LegTile, tripTimeline, type TripLeg } from '@/lib/tripLegTiles';
import RiftPortal from '@/components/RiftPortal.vue';
import { useCharacterStore } from '@/stores/character';
import { useTripFilters } from '@/composables/useTripFilters';
import { legTileShown, tripFilterCtx, tripOrder, type TripSort } from '@/lib/tripNav';
import { isRiftPoi, poiEmo, poiLabel } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';
import { tripEnds, type TripEnd } from '@/lib/tripEnds';
import { seedOf } from '@/lib/combat';
import type { CharacterProfile } from '@/lib/character';
import { isMilitiaId, MILITIA_NAME } from '@/lib/militia';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { advTitle } from '@/lib/adventurers';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { FACTION_EMOJI, FACTION_LABEL, siegeOdds } from '@/lib/raid';

/** 🎁 Le butin ramené, en une ligne (« 12 480 🪙 · 35 ⚡ ») : la forme de l'estimation « si pris ». */
function haulText(pills: HaulPill[]): string {
  return pills.map((g) => `${g.n.toLocaleString('fr-FR')} ${g.emoji}`).join(' · ');
}

/** Le lieu d'un encart (appelé seulement quand il en porte un). */
function endPoi(e: TripEnd): Poi {
  return (e as { poi: Poi }).poi;
}
function endTitle(e: TripEnd): string {
  return e.kind === 'isle' ? `Île ${e.n}` : e.kind === 'base' ? 'La base' : poiLabel(e.poi);
}

const props = defineProps<{
  trips: MapTrip[];
  focus: string | null;
  heroProfile: CharacterProfile;
  /** ⚔️ Les armées ennemies en marche, en tuiles à la suite des voyages. */
  attacks?: ActiveAttack[];
  /** 🛡️ % de tenue de ta défense actuelle, par armée (`null` = inconnu). */
  holds?: Record<string, number | null>;
  /** Horloge (ms) pour l'avancement de leur marche. */
  now?: number;
}>();
const emit = defineEmits<{
  'update:focus': [key: string | null];
  attack: [army: Poi];
}>();

/** ⏱️ Une seule rangée, dans l'ordre d'arrivée : le retour en ville d'un voyage (`homeAt`, cf.
 *  `tripOrder`) et l'heure de frappe d'une armée se comparent sur la même horloge. Tri
 *  STABLE : à égalité, les voyages d'abord, dans l'ordre reçu. Un voyage sans heure connue
 *  reste en tête, dans l'ordre reçu (il n'a rien à comparer). */
const tiles = computed(() => {
  const list: {
    key: string;
    at: number;
    trip?: MapTrip;
    leg?: LegTile;
    ends?: ReturnType<typeof tripEnds>;
    line?: ReturnType<typeof tripTimeline>;
    attack?: ActiveAttack;
  }[] = [
    // 🧭 UNE TUILE PAR VOYAGE (concept B, choisi le 2026-10-09), rangée par son retour en ville
    // (`tripOrder`) ; ses étapes sont sur sa frise.
    ...tripOrder(props.trips, sort.value).map((x) => {
      const line = x.leg.phased ? tripTimeline(x.trip.legs?.steps) : null;
      return {
        key: x.key,
        at: x.at,
        trip: x.trip,
        leg: x.leg,
        // La frise montre le voyage ENTIER : départ à gauche, objectif à droite, même au retour.
        ends: tripEnds({ ...x.trip, back: line ? false : x.leg.back }),
        line,
      };
    }),
    ...(props.attacks ?? []).map((r) => ({
      key: 'atk' + r.army.id,
      at: r.army.army?.at ?? Infinity,
      attack: r,
    })),
  ];
  return list.sort((x, y) => x.at - y.at);
});
/** 🧭⚔️ Le filtre (cf. `TripSelection`), PARTAGÉ avec l'autre rangée et les flèches de la
 *  fiche d'un voyage (`useTripFilters`). Ce qu'il laisse voir : `tripFilterCtx` (lib). */
const { selection, legSel, sort } = useTripFilters();
const SORT_LABEL: Record<TripSort, { short: string; title: string }> = {
  home: { short: '↩ Retour', title: 'Rangé par temps total avant le retour en ville' },
  step: { short: '⏭ Étape', title: 'Rangé par temps avant la prochaine étape' },
};
const ctx = computed(() =>
  tripFilterCtx(props.trips, props.attacks?.length ?? 0, selection.value, legSel.value),
);
const counts = computed(() => ctx.value.counts);
const present = computed(() => ctx.value.present);
const shown = computed(() => ctx.value.shown);
function pick(id: TripFilter) {
  if (id === 'all') {
    // « Tout » ne touche qu'aux catégories : le filtre d'étape vit dans sa propre pastille.
    selection.value = toggleAllTrips(selection.value, present.value);
    return;
  }
  selection.value = toggleTripCat(selection.value, id, present.value);
}
/** Les catégories VIDES ne sont pas proposées (six pastilles dont trois grisées encombraient
 *  la rangée). Une seule ligne (demandé) : l'icône seule (sauf « Tout »), le nom en
 *  infobulle et en aria-label. 🎯 Une pastille est allumée quand elle FILTRE
 *  (`tripCatPillOn`) : sous « Tout », seul « Tout » l'est — toucher une pastille allumée
 *  l'éteint toujours, elle n'isole jamais (v1.82.5, signalé). */
const filterOpts = computed<
  { id: TripFilter; icon: string; label: string; n: number; on: boolean }[]
>(() => {
  const opts = [
    { id: 'all', icon: '', label: 'Tout', n: tiles.value.length },
    { id: 'trips', icon: '🧭', label: 'Expéditions', n: counts.value.trips },
    { id: 'raids', icon: '🗡️', label: 'Mes attaques', n: counts.value.raids },
    { id: 'reinf', icon: '🛡️', label: 'Renforts', n: counts.value.reinf },
    { id: 'planned', icon: '⏳', label: 'Programmés', n: counts.value.planned },
    { id: 'attacks', icon: '⚔️', label: 'Ennemis', n: counts.value.attacks },
  ] as const;
  return opts
    .filter((o) => o.id === 'all' || o.n > 0)
    .map((o) => ({
      ...o,
      on:
        o.id === 'all'
          ? present.value.length > 0 && present.value.every((c) => shown.value.has(c))
          : tripCatPillOn(selection.value, o.id, present.value),
    }));
});
/** ➡️↩️ Les étapes, dans leur pastille à part (aller / retour) — proposées seulement s'il y en a au moins
 *  deux à séparer, et seulement celles qui ont des tuiles. Allumée = elle filtre
 *  (`legPillOn`). */
/** 🛡️ Les mini-cases d'un renfort : une par place de la réserve, dans l'ordre tenues → les
 *  siennes → d'autres en route → libres (`arrivalSeats`). */
type SeatCell = 'held' | 'mine' | 'other' | 'free';
function seatRows(a: NonNullable<ArrivalSeats>) {
  const rows: { key: string; icon: string; cells: SeatCell[]; over: number; title: string }[] = [];
  for (const [key, icon, name, r] of [
    ['champ', '⚔️', 'champion', a.champ],
    ['mil', '🛡️', 'milicien', a.mil],
  ] as const) {
    if (!r) continue;
    const free = Math.max(0, r.total - r.held - r.mine - r.other);
    const cells: SeatCell[] = [
      ...Array<SeatCell>(r.held).fill('held'),
      ...Array<SeatCell>(r.mine).fill('mine'),
      ...Array<SeatCell>(r.other).fill('other'),
      ...Array<SeatCell>(free).fill('free'),
    ];
    const parts = [
      `${r.held} tenue${r.held > 1 ? 's' : ''}`,
      `${r.mine} avec ce renfort`,
      r.other ? `${r.other} pour d'autres renforts en route` : '',
      `${free} libre${free > 1 ? 's' : ''}`,
    ].filter(Boolean);
    rows.push({
      key,
      icon,
      cells,
      over: r.over,
      title: `Places de ${name} à l'arrivée : ${parts.join(', ')}${r.over ? ` — ${r.over} en trop feront demi-tour` : ''}`,
    });
  }
  return rows;
}
const LEG_LABEL: Record<TripLeg, string> = {
  wait: 'Attente du départ',
  go: 'Aller',
  dwell: 'Sur place',
  back: 'Retour',
};
/** 🎴 Les icônes des tuiles (`STEP_ICON`), pour que filtre et tuiles parlent pareil. */
const LEG_PILL = Object.fromEntries(
  TRIP_LEGS.map((l) => [l, { icon: STEP_ICON[l], label: LEG_LABEL[l] }]),
) as Record<TripLeg, { icon: string; label: string }>;
const shownTiles = computed(() =>
  tiles.value.filter((x) =>
    x.attack
      ? shown.value.has('attacks')
      : !!x.trip && !!x.leg && legTileShown(x.trip, x.leg.leg, ctx.value),
  ),
);
/** ⏱️ Le bandeau du bas d'une tuile : le temps de son étape (⏳ → 🔍), sinon le temps avant
 *  d'arriver (🏠 📍 ⚓). Une seule ligne de temps par tuile, toujours au même endroit. */
const BANNER_TITLE: Record<string, string> = {
  wait: 'Départ dans',
  go: 'Arrivée sur le lieu dans',
  dwell: 'Encore sur place',
};
function bannerOf(lt: LegTile): { text: string; title: string } | null {
  if (lt.time) return { text: lt.time, title: BANNER_TITLE[lt.leg] ?? 'Prochaine étape dans' };
  if (!lt.total) return null;
  const icon = lt.totalIcon ?? '🏠';
  return {
    text: `${icon} ${lt.total}`,
    title: icon === '📍' ? 'Arrivée' : icon === '⚓' ? 'Arrivée au port' : 'Retour en ville dans',
  };
}
/** ⚔️ Moins d'une heure avant la frappe : la tuile passe au rouge (comme la liste des attaques). */
const ATTACK_SOON_MS = 3_600_000;
const holdOf = (r: ActiveAttack): number | null => props.holds?.[r.army.id] ?? null;
/** La marche de l'armée, de son apparition à sa frappe (0..100). */
function marchPct(r: ActiveAttack): number {
  const span = (r.army.army?.at ?? 0) - r.army.spawnedAt;
  if (span <= 0 || props.now === undefined) return 0;
  return Math.max(0, Math.min(100, ((props.now - r.army.spawnedAt) / span) * 100));
}
/** Le détail que la tuile n'a pas la place d'écrire (survol, lecteur d'écran). */
function attackTitle(r: ActiveAttack): string {
  const hold = holdOf(r);
  const size = Math.round(r.size * 10) / 10;
  return [
    r.kind === 'siege'
      ? 'Siège de ta base'
      : `Reprise : ${r.target ? poiLabel(r.target) : 'un point fixe'}`,
    `${poiRank(r.army).name} · ${FACTION_LABEL[r.faction]}`,
    `≈ ${size.toLocaleString('fr-FR')} champion${r.size >= 2 ? 's' : ''}`,
    `frappe dans ${formatDuration(r.inMs)}`,
    hold !== null ? `ta défense repousse environ ${hold} %` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const char = useCharacterStore();

/** 🛡️ Au plus ce nombre de portraits sur une tuile (au-delà : « +N »), pour tenir sur une
 *  ligne dans une tuile de tiers de largeur à 344 px. */
const FACES_MAX = 4;
/** ⛵ Une traversée prend toute la ligne : la place de plus de portraits. */
const SEA_FACES_MAX = 10;
const facesMax = (t: MapTrip) => (t.sea ? SEA_FACES_MAX : FACES_MAX);
/** 🛡️ Les portraits d'un renfort : champions (portrait, repli emoji) et miliciens. */
function facesOf(t: MapTrip) {
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  return t.members.slice(0, facesMax(t)).map((id) => {
    if (isMilitiaId(id))
      return { id, militia: true, name: MILITIA_NAME, championId: null, emoji: '' };
    const a = byId.get(id);
    return {
      id,
      militia: false,
      name: a?.name ?? 'Champion',
      championId: a?.championId ?? null,
      emoji: a ? (advTitle(a)?.emoji ?? '🧑') : '❔',
    };
  });
}
</script>

<style scoped lang="scss">
/* TROIS tuiles par ligne (demandé par l'utilisateur). Une ligne incomplète s'ALIGNE À
   GAUCHE (v1.8.2, demandé : « aligne les tuiles à gauche et pas au centre ») — elle était
   centrée depuis la v0.756. Même règle pour les filtres au-dessus. */
.tr-none {
  margin: 0 2px 8px;
  color: var(--dim);
  font-size: 12px;
}
.tr-filter {
  display: flex;
  justify-content: flex-start;
  gap: 6px;
  /* Une seule ligne (demandé) : icônes seules, six pastilles tiennent à 344 px. */
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 2px 2px 8px;
}
.trf {
  /* ⚠️ « Expéditions » n'était pas centré (signalé) : le bouton portait la classe `trips`,
     celle de la GRILLE des tuiles plus bas, qui lui imposait `padding: 2px 2px 6px` (texte
     remonté de 2 px). Une classe construite à partir d'une donnée se PRÉFIXE (`trf-…`).
     Centré en flex en plus : libellé et compte au même centre. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  line-height: 1;
  flex: none;
  min-height: 36px;
  min-width: 44px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  b {
    color: var(--dim);
  }
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    b {
      color: var(--accent);
    }
  }
  &.trf-attacks.on {
    border-color: var(--d4);
    background: color-mix(in srgb, var(--d4) 18%, var(--surface));
    b {
      color: var(--d4);
    }
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* Poussé tout à droite : ce n'est pas un filtre, c'est l'ordre. */
  &.trf-sort {
    margin-left: auto;
    color: var(--dim);
  }
}
.trips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  padding: 2px 2px 6px;
}
.trips > .trip {
  /* border-box : sans lui padding et bordure s'ajoutaient au tiers, et il n'en tenait que deux. */
  box-sizing: border-box;
  flex: 0 0 calc((100% - 16px) / 3);
}
/* ⛵ Une traversée en bateau prend TOUTE la ligne (demandé) : île de départ et d'arrivée aux
   deux coins, l'équipage entier au milieu. */
.trips > .trip.sea {
  flex-basis: 100%;
}
/* 🧭 UNE TUILE PAR VOYAGE, pleine largeur, avec sa FRISE (concept B, choisi le 2026-10-09) :
   toutes les étapes d'un coup d'œil, chacune large comme sa durée, et le curseur dit où on en
   est. Les voyages sans étapes connues (renfort, traversée, rappel) gardent leur tuile de tiers. */
.trips > .trip.line {
  flex-basis: 100%;
  --tc: var(--accent);
}
.trips > .trip.line.van {
  --tc: #b57bff;
}
.trips > .trip.line.back {
  --tc: #7bc86c;
}
.trips > .trip.line.combo {
  --tc: var(--combo);
}
.trips > .trip.line.failed {
  --tc: var(--d3);
}
/* Icône et portraits sur la même ligne : la tuile a la place. */
.trip.line .tr-faces {
  flex-basis: auto;
}
/* 💰 La récompense : le butin ramené (pastilles), ou l'estimation « si pris » à l'aller. */
.tr-loot {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  margin: 5px 8px 0;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.tr-loot.est {
  color: var(--dim);
}
.tr-loot-lab {
  font-size: 11px;
  font-weight: 600;
}
/* 🛡️ Les places du lieu à l'arrivée d'un renfort : une rangée de mini-cases par réserve. */
.tr-seats {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  margin: 5px 8px 0;
}
.ts-row {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.ts-lab {
  font-size: 11px;
  margin-right: 2px;
}
.ts-c {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  border: 1.5px solid var(--line, #3a332a);
}
.ts-c.held {
  background: var(--dim);
  border-color: var(--dim);
}
.ts-c.mine {
  background: var(--tc, var(--accent));
  border-color: var(--tc, var(--accent));
}
.ts-c.other {
  border-style: dashed;
  border-color: var(--dim);
}
.ts-over {
  font-size: 10.5px;
  color: var(--d3, #ffb23f);
  margin-left: 4px;
}
/* 🧭 LA FRISE, VERSION « NÉON » (2026-10-09, choisie parmi trois au banc) : des barres en
   creux, le remplissage en dégradé, l'étape en cours qui brille avec un reflet qui passe. */
.tl-frise {
  flex-basis: 100%;
  display: flex;
  gap: 3px;
  margin: 6px 8px 0;
  align-items: center;
  height: 24px;
}
/* La largeur vient de la lib (`segWidths`, plancher compris) : une largeur minimale en px ici
   faisait déborder la frise, et le dernier temps sortait de la tuile (signalé le 2026-10-09). */
.tl-seg {
  flex: var(--w) 1 0;
  min-width: 0;
  position: relative;
  height: 20px;
  border-radius: 10px;
  /* Une rainure : plus sombre en haut, ombre intérieure. Dérivée de --line, pour suivre le thème. */
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--line, #3a332a) 45%, #000),
    var(--line, #3a332a)
  );
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.6),
    0 1px 0 rgba(255, 255, 255, 0.05);
}
.tl-seg > i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  overflow: hidden;
  background: linear-gradient(90deg, color-mix(in srgb, var(--tc) 45%, #000), var(--tc));
  /* Une étape finie reste lisible, mais en retrait de celle qui se joue. */
  opacity: 0.55;
}
.tl-seg.cur > i {
  opacity: 1;
  box-shadow: 0 0 12px color-mix(in srgb, var(--tc) 55%, transparent);
}
/* ✨ Le reflet qui passe sur l'étape en cours : elle avance, ça se voit. */
.tl-seg.cur > i::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 35%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 65%
  );
  background-size: 250% 100%;
  animation: tl-sheen 2.6s linear infinite;
}
@keyframes tl-sheen {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -100% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tl-seg.cur > i::after {
    animation: none;
    display: none;
  }
}
/* ⏳ L'attente : des pointillés, rien n'a commencé. */
.tl-seg.tl-wait {
  background: transparent;
  box-shadow: none;
  border: 1px dashed color-mix(in srgb, var(--tc) 60%, transparent);
}
/* 🔍 Sur place : des tirets épais — on ne voyage pas, on travaille. */
.tl-seg.tl-dwell {
  background: repeating-linear-gradient(90deg, var(--line, #3a332a) 0 6px, transparent 6px 9px);
  box-shadow: none;
}
.tl-seg.tl-dwell > i {
  background: repeating-linear-gradient(90deg, var(--tc) 0 6px, transparent 6px 9px);
}
/* Le curseur : un trait lumineux au bout de la part remplie (un rond masquerait la pastille). */
.tl-cursor {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 8px #fff;
}
.tl-pill {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: calc(100% - 4px);
  box-sizing: border-box;
  padding: 1px 5px;
  border-radius: 999px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
  font-size: 10px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  /* Plus de pastille autour du temps (demandé) : le texte est posé sur la barre, une ombre
     sombre le garde lisible sur le remplissage comme sur le vide. Les étapes à venir restent
     en retrait. */
  background: none;
  border: 0;
  color: var(--text);
  opacity: 0.75;
  text-shadow:
    0 0 3px #000,
    0 0 2px #000,
    0 1px 1px #000;
}
.tl-pill.cur {
  font-weight: 700;
  color: #fff;
  opacity: 1;
}
.tl-pill.done {
  opacity: 0.6;
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
/* 🎨 Attaque combinée : chaque attaque a SA couleur, portée par tous ses groupes (en attente,
   à l'aller comme au retour) — on voit d'un coup d'œil quelles tuiles vont ensemble. */
.trip.combo {
  border-color: var(--combo);
  border-width: 2px;
}
.trip.combo .tr-bar {
  background: var(--combo);
}
/* ⏳ Programmé, pas encore parti : contour en pointillés, comme un départ qui attend. */
.trip.pending {
  border-style: dashed;
}
.tr-who {
  font-size: 17px;
}
/* 🛡️ Les portraits du renfort : une ligne pleine largeur, centrée, sous l'icône. */
.tr-faces {
  flex-basis: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2px;
  font-size: 16px;
  line-height: 1;
}
.tr-face {
  display: inline-flex;
}
.tr-face-more {
  font-size: 10.5px;
  color: var(--dim);
}
/* 🎯 L'objectif du voyage, en encart dans le coin haut-droit (agrandi, demandé : 31×29 px) : collé au bord EXTÉRIEUR
   de la tuile (top/right 0), seuls ses côtés intérieurs sont tracés, dans la couleur
   de la tuile (`inherit` suit aller / convoi / retour). */
.tr-poi {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 29px;
  font-size: 19px;
  line-height: 1;
  border-left: 1px solid;
  border-bottom: 1px solid;
  border-color: inherit;
  border-bottom-left-radius: 8px;
  background: color-mix(in srgb, var(--surface-2, #2a241c) 70%, var(--surface));
  pointer-events: none;
}
/* 🧭 La provenance, en encart haut-gauche : le miroir exact de l'objectif. */
.tr-from sub,
.tr-poi sub {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.tr-from {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 29px;
  font-size: 19px;
  line-height: 1;
  border-right: 1px solid;
  border-bottom: 1px solid;
  border-color: inherit;
  border-bottom-right-radius: 8px;
  background: color-mix(in srgb, var(--surface-2, #2a241c) 70%, var(--surface));
  pointer-events: none;
}
/* 🌀 La faille garde son portail sous la carte aussi, à la taille de l'emoji. */
.tr-rift {
  display: inline-block;
  width: 15px;
  height: 23px;
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
/* 🏠 Le temps TOTAL avant le retour, en bandeau encadré tout en BAS de la tuile (demandé), sur
   toute la largeur : collé aux bords (marges négatives = le padding de la tuile), seul son côté
   haut est tracé, dans la couleur de la tuile — comme les encarts de départ et d'objectif.
   `order` le pousse en dernier quel que soit l'ordre du gabarit. */
/* ⚠️ POSÉ en bas (absolu), à hauteur FIXE : dans le flux il suivait le contenu de la tuile,
   donc il ne tombait pas au même endroit selon qu'elle affiche un temps en tête, un échec ou
   rien (signalé). La tuile lui réserve sa place (`.has-total`). */
.tr-total {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 4px 3px; /* 3 px : la barre d'avancement passe dessous */
  box-sizing: border-box;
  pointer-events: none;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  border-top: 1px solid;
  border-color: inherit;
  background: color-mix(in srgb, var(--surface-2, #2a241c) 70%, var(--surface));
}
.trip.has-total {
  padding-bottom: 27px;
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
/* ✖ Mission ratée : orange (d3), pas le rouge des attaques ennemies ; contour épais, fond
   teinté et bandeau — la tuile ressort parmi les retours verts. */
.trip.failed {
  border-color: var(--d3);
  border-width: 2px;
  background: color-mix(in srgb, var(--d3) 14%, var(--surface));
}
.trip.failed .tr-bar {
  background: var(--d3);
}
.tr-fail {
  flex-basis: 100%;
  text-align: center;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.25;
  white-space: normal; /* 2 lignes plutôt que coupé quand la tuile est étroite */
  color: var(--d3);
}
/* ⚔️ Une attaque ennemie : même tuile, en rouge (danger), fond teinté quand elle frappe bientôt. */
.trip.attack {
  border-color: color-mix(in srgb, var(--d4) 70%, transparent);
}
.trip.attack.soon {
  border-color: var(--d4);
  background: color-mix(in srgb, var(--d4) 12%, var(--surface));
}
.trip.attack.soon .tr-total {
  color: var(--d4);
}
.trip.attack .tr-bar {
  background: var(--d4);
}
.tr-hold.tenu {
  color: var(--d1);
}
.tr-hold.serre {
  color: var(--d3);
}
.tr-hold.perdu {
  color: var(--d4);
}
/* 🔴 La tuile touchée : le même rouge que le halo posé sur son lieu, pour qu'on relie les deux. */
.trip.focus {
  box-shadow:
    0 0 0 2px #ff5d5d,
    0 0 12px 2px rgb(255 93 93 / 55%);
}
</style>
