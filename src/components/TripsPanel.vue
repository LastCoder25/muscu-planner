<!--
  🧭 LES VOYAGES EN COURS, en une rangée de tuiles, et l'équipe du voyage touché. Sorti de
  `ExpeditionMapPage` (découpage de la page, 2026-09-27).

  Trois cartes empilées poussaient la carte hors de l'écran dès deux convois, et répétaient
  « total » et « escorte » dont on n'a pas besoin en un coup d'œil : il faut QUI voyage, VERS
  QUOI, et COMBIEN DE TEMPS. Toucher une tuile allume un halo rouge sur elle et sur son lieu
  (la page le dessine, d'où le `v-model:focus`) ; la retoucher les éteint.
-->
<template>
  <!-- ⏱️ VOYAGES ET ATTAQUES MÊLÉS, DANS L'ORDRE D'ARRIVÉE (demandé) : ce qui tombe le plus
       tôt passe en tête, qu'il s'agisse d'un retour ou d'une frappe ennemie (`tiles`). -->
  <!-- 🧭⚔️ FILTRE (demandé) : voyages et armées ennemies partagent la rangée ; on choisit ce
       qu'on regarde. Une catégorie vide est grisée, et un filtre qui se vide retombe sur
       « Tout » (`effectiveTripFilter`). -->
  <div v-if="tiles.length" ref="topEl" class="tr-filter" role="group" aria-label="Filtrer">
    <button
      v-for="o in filterOpts"
      :key="o.id"
      type="button"
      class="trf"
      :class="[`trf-${o.id}`, { on: shown === o.id }]"
      :aria-pressed="shown === o.id"
      :title="o.label"
      :aria-label="o.id === 'all' ? o.label : `${o.label} (${o.n})`"
      @click="filter = o.id"
    >
      <template v-if="o.id === 'all'">{{ o.label }}</template>
      <template v-else
        >{{ o.icon }} <b>{{ o.n }}</b></template
      >
    </button>
  </div>
  <div v-if="tiles.length" ref="tilesEl" class="trips">
    <template v-for="{ key, trip: t, attack: r } in shownTiles" :key="key">
      <button
        v-if="t"
        type="button"
        class="trip"
        :class="[t.kind, { back: t.back, focus: focus === t.key, pending: t.pending }]"
        :title="t.title"
        :aria-pressed="focus === t.key"
        @click="emit('update:focus', focus === t.key ? null : t.key)"
      >
        <!-- 🧭 D'OÙ VIENT LA TROUPE (demandé), en encart haut-gauche, miroir de l'objectif :
           la base 🏰, ou le point fixe d'où elle est partie. -->
        <span class="tr-from" :title="t.from ? poiLabel(t.from) : 'La base'">{{
          t.from ? poiEmo(t.from) : '🏰'
        }}</span>
        <span class="tr-who">{{ t.who }}</span>
        <!-- 👥 QUI VOYAGE (demandé, d'abord pour les renforts, puis pour toutes les
           expéditions) : leurs portraits sous l'icône, sur une ligne centrée. Champions et
           miliciens ; le héros, lui, est déjà l'icône 🧝 au-dessus. -->
        <span v-if="t.members.length" class="tr-faces">
          <span v-for="f in facesOf(t)" :key="f.id" class="tr-face" :title="f.name">
            <MilitiaPortrait v-if="f.militia" />
            <ChampionPortrait v-else :champion-id="f.championId">{{ f.emoji }}</ChampionPortrait>
          </span>
          <span v-if="t.members.length > FACES_MAX" class="tr-face-more"
            >+{{ t.members.length - FACES_MAX }}</span
          >
        </span>
        <span class="tr-poi" :title="t.toBase ? 'La base' : poiLabel(t.poi)">
          <template v-if="t.toBase">🏰</template>
          <span v-else-if="isRiftPoi(t.poi)" class="tr-rift">
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
      <!-- ⚔️ LES ATTAQUES ENNEMIES, AU MÊME FORMAT QUE LES VOYAGES (demandé) : l'armée ⚔️ en
         haut-gauche (d'où vient la troupe), sa faction au centre, le LIEU ATTAQUÉ en haut-droit
         (🏰 la base), le temps avant la frappe, la tenue de ta défense, et sa marche en
         sous-lignage. Toucher la tuile ouvre l'armée sur la carte. -->
      <button
        v-else-if="r"
        type="button"
        class="trip attack"
        :class="{ soon: r.inMs < ATTACK_SOON_MS }"
        :title="attackTitle(r)"
        :aria-label="attackTitle(r)"
        @click="emit('attack', r.army)"
      >
        <span class="tr-from">⚔️</span>
        <span class="tr-who">{{ FACTION_EMOJI[r.faction] }}</span>
        <span class="tr-poi">{{ r.target ? poiEmo(r.target) : '🏰' }}</span>
        <span class="tr-time">{{ formatDuration(r.inMs) }}</span>
        <span v-if="holdOf(r) !== null" class="tr-legs tr-hold" :class="siegeOdds(holdOf(r)! / 100)"
          >🛡️ {{ holdOf(r) }} %</span
        >
        <span v-else-if="r.kind === 'siege'" class="tr-legs">🛡️ tenue ?</span>
        <i class="tr-bar" :style="{ width: marchPct(r) + '%' }" />
      </button>
    </template>
  </div>

  <!-- 👥 QUI EST DANS CE VOYAGE : toucher une tuile montre son équipe, sans rien toucher. -->
  <div v-if="crew" class="trip-crew">
    <div class="tc-head">
      👥 {{ crew.pending ? 'Partira vers' : 'En route vers' }}
      {{ crew.toBase ? 'la base' : `${poiLabel(crew.poi)} niv ${crew.poi.level}` }}
    </div>
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
    <!-- ⚡ ACCÉLÉRER (demandé) : les boosts du stock, chiffrés pour CE voyage. Les minutes
         qu'un boost ne peut pas donner (l'étape finit avant) sont dites AVANT de toucher. -->
    <div v-if="crewBoosts" class="tc-boost">
      <span class="tc-haul-lab">⚡ Accélérer</span>
      <p v-if="crewBoosts.block" class="tc-none">{{ crewBoosts.block }}</p>
      <div v-else class="tc-bst-row">
        <button
          v-for="b in crewBoosts.choices"
          :key="b.id"
          type="button"
          class="tc-bst"
          :class="{ lossy: b.lostMs > 0 }"
          @click="emit('boost', crewBoosts.key, b.id)"
        >
          <b>⚡ {{ boostLabel(b.minutes) }}</b>
          <span class="tc-bst-n">×{{ b.count }}</span>
          <small v-if="b.lostMs > 0"
            >−{{ formatDuration(b.gainMs) }} · {{ formatDuration(b.lostMs) }} perdues</small
          >
          <small v-else>−{{ formatDuration(b.gainMs) }}</small>
        </button>
      </div>
    </div>
    <!-- ⏳ Un départ programmé s'annule depuis sa tuile : rien n'est encore parti. -->
    <button
      v-if="crew.cancelPlan"
      type="button"
      class="tc-recall"
      @click="emit('cancelPlan', crew.cancelPlan)"
    >
      ✖ Annuler ce départ programmé
    </button>
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
import type { ActiveAttack } from '@/lib/fieldArmy';
import type { TripCategory } from '@/lib/tripFilter';
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
  /** 🧭 D'où part la troupe : un point fixe, ou `null` = la base. */
  from: Poi | null;
  /** 🏠 La troupe rentre à la BASE (un retour d'un point fixe) : l'objectif est 🏰. */
  toBase?: boolean;
  /** 🚶↩️ Aller restant et retour (`tripLegs`), `null` une fois rentré. */
  legs?: { go: string | null; back: string; detail: string } | null;
  /** ⏱️ L'heure (ms) où se termine ce que la tuile décompte — l'ordre d'arrivée. */
  endsAt?: number;
  /** 🧭🛡️🗡️ Expédition, renfort ou attaque du joueur (les filtres de la rangée). */
  cat: TripCategory;
  /** ⏳ Programmé, pas encore parti (filtre « Programmés »). */
  pending?: boolean;
  /** ⏳ Un départ programmé qu'on peut annuler : son id (`PlannedMove.id`). */
  cancelPlan?: string;
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { effectiveTripFilter, type TripFilter } from '@/lib/tripFilter';
import RiftPortal from '@/components/RiftPortal.vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import { useCharacterStore } from '@/stores/character';
import { isRiftPoi, poiEmo, poiLabel } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';
import { seedOf } from '@/lib/combat';
import type { CharacterProfile } from '@/lib/character';
import type { Adventurer } from '@/lib/adventurers';
import { isMilitiaId, militiaIn, MILITIA_NAME } from '@/lib/militia';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { advTitle } from '@/lib/adventurers';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import HaulPills from '@/components/HaulPills.vue';
import { formatDuration } from '@/lib/duration';
import { revealBlock } from '@/lib/reveal';
import { FACTION_EMOJI, FACTION_LABEL, siegeOdds } from '@/lib/raid';
import { BOOST_BLOCK_LABEL, type BoostBlock, type BoostChoice } from '@/lib/speedBoost';
import type { BoostId } from '@/lib/supplies';

const props = defineProps<{
  trips: MapTrip[];
  focus: string | null;
  heroProfile: CharacterProfile;
  /** 🔙 Les voyages (par `key`) qui peuvent encore faire demi-tour. */
  recallable?: ReadonlySet<string>;
  /** ⚡ Les boosts pour le voyage touché (`boostChoices`), avec la clé de ce voyage. */
  boosts?: { key: string; plan: { block: BoostBlock } | { choices: BoostChoice[] } } | null;
  /** ⚔️ Les armées ennemies en marche, en tuiles à la suite des voyages. */
  attacks?: ActiveAttack[];
  /** 🛡️ % de tenue de ta défense actuelle, par armée (`null` = inconnu). */
  holds?: Record<string, number | null>;
  /** Horloge (ms) pour l'avancement de leur marche. */
  now?: number;
}>();
const emit = defineEmits<{
  'update:focus': [key: string | null];
  recall: [key: string];
  boost: [key: string, id: BoostId];
  attack: [army: Poi];
  cancelPlan: [id: string];
}>();

/** ⏱️ Une seule rangée, dans l'ordre d'arrivée : la fin d'un voyage (`endsAt`, ce que sa
 *  tuile décompte) et l'heure de frappe d'une armée se comparent sur la même horloge. Tri
 *  STABLE : à égalité, les voyages d'abord, dans l'ordre reçu. Un voyage sans heure connue
 *  reste en tête, dans l'ordre reçu (il n'a rien à comparer). */
const tiles = computed(() => {
  const list: { key: string; at: number; trip?: MapTrip; attack?: ActiveAttack }[] = [
    ...props.trips.map((t) => ({ key: t.key, at: t.endsAt ?? -Infinity, trip: t })),
    ...(props.attacks ?? []).map((r) => ({
      key: 'atk' + r.army.id,
      at: r.army.army?.at ?? Infinity,
      attack: r,
    })),
  ];
  return list.sort((x, y) => x.at - y.at);
});
/** 🧭⚔️ Le filtre (cf. `effectiveTripFilter`). Un voyage programmé ne compte QUE dans
 *  « Programmés » ; en route, il compte dans sa catégorie (`MapTrip.cat`). */
const filter = ref<TripFilter>('all');
const catOf = (t: MapTrip): Exclude<TripFilter, 'all' | 'attacks'> =>
  t.pending ? 'planned' : (t.cat ?? 'trips');
const counts = computed(() => {
  const n = { trips: 0, reinf: 0, raids: 0, planned: 0, attacks: props.attacks?.length ?? 0 };
  for (const t of props.trips) n[catOf(t)]++;
  return n;
});
const shown = computed(() => effectiveTripFilter(filter.value, counts.value));
/** Les catégories VIDES ne sont pas proposées (six pastilles dont trois grisées encombraient
 *  la rangée). Une seule ligne (demandé) : l'icône seule (sauf « Tout »), le nom en
 *  infobulle et en aria-label. */
const filterOpts = computed<{ id: TripFilter; icon: string; label: string; n: number }[]>(() =>
  (
    [
      { id: 'all', icon: '', label: 'Tout', n: tiles.value.length },
      { id: 'trips', icon: '🧭', label: 'Expéditions', n: counts.value.trips },
      { id: 'raids', icon: '🗡️', label: 'Mes attaques', n: counts.value.raids },
      { id: 'reinf', icon: '🛡️', label: 'Renforts', n: counts.value.reinf },
      { id: 'planned', icon: '⏳', label: 'Programmés', n: counts.value.planned },
      { id: 'attacks', icon: '⚔️', label: 'Ennemis', n: counts.value.attacks },
    ] as const
  ).filter((o) => o.id === 'all' || o.n > 0),
);
const shownTiles = computed(() =>
  tiles.value.filter((x) =>
    shown.value === 'all'
      ? true
      : shown.value === 'attacks'
        ? !!x.attack
        : !!x.trip && catOf(x.trip) === shown.value,
  ),
);
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

const boostLabel = (min: number) => (min >= 60 ? `${min / 60} h` : `${min} min`);
/** ⚡ La page ne passe `boosts` que si on POSSÈDE un boost : sans stock, la section serait
 *  du bruit. Un voyage qu'on ne peut pas presser dit pourquoi (un gris muet se lit comme une
 *  panne). */
const crewBoosts = computed(() => {
  const b = props.boosts;
  if (!b || b.key !== props.focus) return null;
  if ('block' in b.plan) return { key: b.key, block: BOOST_BLOCK_LABEL[b.plan.block], choices: [] };
  return b.plan.choices.length ? { key: b.key, block: null, choices: b.plan.choices } : null;
});
const char = useCharacterStore();

/** 📜 Toucher une tuile cale la DERNIÈRE tuile en bas de l'écran (demandé) : toute la rangée
 *  se voit, le maximum de carte reste au-dessus, et le détail du voyage se lit en faisant
 *  défiler dessous. Si la rangée est plus haute que l'écran, son haut reste visible
 *  (`revealBlock`). */
const tilesEl = ref<HTMLElement | null>(null);
const topEl = ref<HTMLElement | null>(null);
watch(
  () => props.focus,
  async (key) => {
    if (!key) return;
    await nextTick();
    const row = tilesEl.value;
    if (row) revealBlock(topEl.value ?? row, row);
  },
);

/** 🛡️ Au plus ce nombre de portraits sur une tuile (au-delà : « +N »), pour tenir sur une
 *  ligne dans une tuile de tiers de largeur à 344 px. */
const FACES_MAX = 4;
/** 🛡️ Les portraits d'un renfort : champions (portrait, repli emoji) et miliciens. */
function facesOf(t: MapTrip) {
  const byId = new Map(char.advList.map((a) => [a.id, a]));
  return t.members.slice(0, FACES_MAX).map((id) => {
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
/** 👥 Les membres du voyage touché (demandé : « quand je clique sur une expédition, voir les
 *  champions qui sont dedans »). Un champion renvoyé depuis n'est plus dans le vivier : il est
 *  compté à part plutôt que de faire tomber l'écran. */
const crew = computed(() => {
  const t = shown.value === 'attacks' ? undefined : props.trips.find((x) => x.key === props.focus);
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
    pending: !!t.pending,
    toBase: !!t.toBase,
    cancelPlan: t.cancelPlan ?? null,
  };
});
</script>

<style scoped lang="scss">
/* TROIS tuiles par ligne (demandé par l'utilisateur). Une ligne incomplète s'ALIGNE À
   GAUCHE (v1.8.2, demandé : « aligne les tuiles à gauche et pas au centre ») — elle était
   centrée depuis la v0.756. Même règle pour les filtres au-dessus. */
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
}
.trips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
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
.tc-boost {
  margin-top: 10px;
}
.tc-bst-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
  margin-top: 6px;
}
.tc-bst {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-height: 44px;
  padding: 6px 4px;
  border-radius: 10px;
  border: 1.5px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tc-bst small {
  font-size: 11px;
  color: var(--dim);
}
/* Des minutes seraient perdues : on le voit avant de toucher. */
.tc-bst.lossy {
  border-color: var(--d3);
  border-style: dashed;
}
.tc-bst.lossy small {
  color: var(--d3);
}
.tc-bst-n {
  position: absolute;
  top: 2px;
  right: 5px;
  font-size: 10px;
  color: var(--dim);
}
.tc-bst:active {
  transform: scale(0.97);
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
/* 🧭 La provenance, en encart haut-gauche : le miroir exact de l'objectif. */
.tr-from {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  font-size: 13px;
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
/* ⚔️ Une attaque ennemie : même tuile, en rouge (danger), fond teinté quand elle frappe bientôt. */
.trip.attack {
  border-color: color-mix(in srgb, var(--d4) 70%, transparent);
}
.trip.attack.soon {
  border-color: var(--d4);
  background: color-mix(in srgb, var(--d4) 12%, var(--surface));
}
.trip.attack.soon .tr-time {
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
