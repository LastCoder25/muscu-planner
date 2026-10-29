<!--
  🏝️ L'ARCHIPEL, posé EN HAUT À DROITE DE LA CARTE (v1.40.3, demandé par l'utilisateur : « en haut
  à droite de la carte l'île actuelle, et quand on clique dessus on voit toutes les îles et on
  peut switcher l'affichage de l'île »). Replié : une pastille « Île N · nom ». Déplié : les cinq
  îles (cadenas sur les bloquées) et la fiche de l'île choisie (traversée, conquête, réserve),
  qui s'ouvre sur l'île où l'on est. ⚠️ Replié à chaque ouverture : la carte passe avant.
-->
<template>
  <div class="arch" :class="{ open }">
    <button
      type="button"
      class="arch-cur"
      :style="{ '--a': curTile?.color }"
      :aria-expanded="open"
      aria-controls="archipel-pop"
      :aria-label="`Île actuelle : ${curTile ? `île ${curTile.id}, ${curTile.name}` : 'aucune'}. Voir l’archipel`"
      @click="toggle"
    >
      <span class="ac-emo" aria-hidden="true">{{ curTile?.emoji ?? '🏝️' }}</span>
      <span class="ac-txt">Île {{ curTile?.id ?? '?' }} · {{ curTile?.name }}</span>
      <span v-if="condition" class="ac-sea" :title="condition.def.label" aria-hidden="true">{{
        condition.def.emo
      }}</span>
      <span v-if="crossing || sailings?.length" class="ac-sea" aria-hidden="true">⛵</span>
      <span class="ac-chev" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>
    <div v-if="open" id="archipel-pop" class="arch-pop">
      <div class="isl-row" role="group" aria-label="Les îles de l’archipel">
        <button
          v-for="i in tiles"
          :key="i.id"
          type="button"
          class="isl"
          :class="{ active: i.active, locked: i.locked, sel: sel === i.id, sea: i.sea }"
          :style="{ '--a': i.color }"
          :aria-label="`Île ${i.id} · ${i.name}${i.locked ? ' (verrouillée)' : ''}`"
          :aria-current="i.active ? 'location' : undefined"
          :aria-pressed="sel === i.id"
          @click="pick(i.id)"
        >
          <span class="isl-emo" aria-hidden="true">{{ i.locked ? '🔒' : i.emoji }}</span>
          <span class="isl-num">Île {{ i.id }}</span>
          <span v-if="i.active" class="isl-tag" aria-hidden="true">📍</span>
          <span v-else-if="i.sea" class="isl-tag" aria-hidden="true">⛵</span>
        </button>
      </div>

      <div class="arch-body">
        <!-- ⛵ La traversée réservée ou en cours. -->
        <div v-if="crossing" class="arch-sea">
          <span class="as-emo" aria-hidden="true">⛵</span>
          <span class="as-txt">
            <b>Vers l'île {{ crossing.to }}</b>
            <template v-if="now < crossing.departAt">
              · départ à {{ clock(crossing.departAt) }} (dans
              {{ formatDuration(crossing.departAt - now) }})
            </template>
            <template v-else>
              · en mer, arrivée à {{ clock(crossing.arriveAt) }} (dans
              {{ formatDuration(Math.max(0, crossing.arriveAt - now)) }})
            </template>
            <span class="as-sub"
              >Le héros et {{ crossing.ids.length }} champion{{
                crossing.ids.length > 1 ? 's' : ''
              }}
              à bord</span
            >
          </span>
        </div>
        <!-- ⛵ Les champions qui naviguent seuls (option A). -->
        <div v-for="(s, k) in sailings ?? []" :key="'s' + k" class="arch-sea">
          <span class="as-emo" aria-hidden="true">⛵</span>
          <span class="as-txt">
            <b>Île {{ s.from }} → île {{ s.to }}</b>
            <template v-if="now < s.departAt">
              · départ à {{ clock(s.departAt) }} (dans {{ formatDuration(s.departAt - now) }})
            </template>
            <template v-else>
              · arrivée à {{ clock(s.arriveAt) }} (dans
              {{ formatDuration(Math.max(0, s.arriveAt - now)) }})
            </template>
            <span v-if="s.militia" class="as-sub"
              >🛡️ {{ s.militia }} milicien{{ s.militia > 1 ? 's' : '' }} en route</span
            >
            <span v-else class="as-sub"
              >{{ s.ids.length }} champion{{ s.ids.length > 1 ? 's' : '' }} sans le héros</span
            >
          </span>
        </div>
        <div
          v-if="selTile"
          class="arch-tile"
          :class="{ active: selTile.active, locked: selTile.locked }"
          :style="{ '--a': selTile.color }"
        >
          <div class="at-top">
            <span class="at-emo" aria-hidden="true">{{ selTile.emoji }}</span>
            <span class="at-num">Île {{ selTile.id }} · {{ selTile.name }}</span>
            <span v-if="selTile.active" class="at-chip">Tu es ici</span>
            <span v-else-if="!selTile.locked" class="at-chip open">⛵ ouverte</span>
            <span v-else class="at-chip dim">🔒 à venir</span>
          </div>
          <!-- 🌗 La condition d'île du moment (`islandCondition`) : pastille, effet, durée restante. -->
          <div v-if="selTile.active" class="at-cond">
            <template v-if="condition">
              <span class="at-chip cond" data-test="cond-chip"
                >{{ condition.def.emo }} {{ condition.def.label }}</span
              >
              <span class="ac-fx">{{ condition.def.effect }}</span>
              <span class="ac-left"
                >⏳ encore {{ formatDuration(Math.max(0, condition.endsAt - now)) }}</span
              >
            </template>
            <span v-else class="ac-fx">🌗 Pas de condition particulière pour l’instant.</span>
            <span v-if="nextCondition" class="ac-next"
              >Ensuite : {{ nextCondition.def.emo }} {{ nextCondition.def.label }} dans
              {{ formatDuration(Math.max(0, nextCondition.startsAt - now)) }}</span
            >
          </div>
          <div class="at-ranks">
            <span class="at-rank" :style="{ '--rk': selTile.lo.color }">{{ selTile.lo.name }}</span>
            <span class="at-rank" :style="{ '--rk': selTile.hi.color }">{{ selTile.hi.name }}</span>
            <span class="at-lvl">niv. {{ selTile.minLevel }}-{{ selTile.maxLevel }}</span>
          </div>
          <div class="at-threat">⚔️ {{ selTile.threat }}</div>
          <div class="at-fort">🏰 {{ selTile.fortress }}</div>
          <!-- 📜 Les règles de l'île, repliées : ce qui revient, à quel rythme, ce qui l'arrête. -->
          <details :key="'rules-' + selTile.id" class="at-rules">
            <summary>📜 Règles de l’île</summary>
            <ul>
              <li v-for="(r, k) in islandRules(selTile)" :key="k">
                <span class="ar-emo" aria-hidden="true">{{ r.emoji }}</span
                >{{ r.text }}
              </li>
            </ul>
          </details>
          <!-- 🏝️ La conquête de l'île active : objectifs abattus, forteresse, pacification. -->
          <div v-if="selTile.active && conquest" class="at-conq">
            <span class="at-pill" :class="{ done: conquest.pointsHeld >= OBJECTIVES_AFTER_HELD }"
              >🏳️ {{ Math.min(conquest.pointsHeld, OBJECTIVES_AFTER_HELD) }}/{{
                OBJECTIVES_AFTER_HELD
              }}
              lieux tenus</span
            >
            <span
              class="at-pill"
              :class="{ done: conquest.objectivesDown >= conquest.objectivesTotal }"
              >{{ selTile.objectiveEmoji }} {{ conquest.objectivesDown }}/{{
                conquest.objectivesTotal
              }}
              {{ EMBER.islands.has(selTile.id) ? 'éteints' : 'pris' }}</span
            >
            <span class="at-pill" :class="{ done: conquest.fortressDown, dim: conquest.locked }">{{
              conquest.fortressDown
                ? '🏰 abattue'
                : conquest.locked
                  ? '🔒 forteresse verrouillée'
                  : '🏰 forteresse à abattre'
            }}</span>
            <span v-for="e in embers ?? []" :key="e.id" class="at-pill" :class="{ dim: e.frozen }"
              >{{ e.emoji }} {{ e.name }} · 🕯️ {{ emberText(e, now) }}</span
            >
            <span v-if="conquest.pacified" class="at-pill done">🕊️ île pacifiée</span>
          </div>
          <!-- 🏅 Les jalons de l'île (livraison 1 « rival + jalons ») : 4 tuiles, le prochain en
               avant. Toucher une tuile déplie son texte. -->
          <div v-if="selTile.active && milestones?.length" class="at-miles" data-test="milestones">
            <button
              v-for="m in milestones"
              :key="m.id"
              type="button"
              class="am-tile"
              :class="m.state"
              :data-state="m.state"
              :aria-expanded="isMileOpen(m)"
              @click="toggleMile(m)"
            >
              <span class="am-emo" aria-hidden="true">{{
                m.state === 'todo' ? '🔒' : m.emoji
              }}</span>
              <span class="am-body">
                <span class="am-name">{{ m.name }}</span>
                <span class="am-state">{{
                  m.state === 'done'
                    ? '✓ atteint'
                    : m.state === 'next'
                      ? `🎯 niveau ${m.level}`
                      : `niveau ${m.level}`
                }}</span>
                <span v-if="isMileOpen(m)" class="am-text"
                  >{{ m.text
                  }}<template v-if="m.chestRunes">
                    🎁 Coffre : {{ m.chestRunes }} runes.</template
                  ></span
                >
              </span>
            </button>
          </div>
          <!-- ⛵ Les champions restés sur cette île, et la traversée pour la rejoindre. -->
          <div v-if="awayOn(selTile.id)" class="at-away">
            ⛵ {{ awayOn(selTile.id) }} champion{{ awayOn(selTile.id) > 1 ? 's' : '' }} resté{{
              awayOn(selTile.id) > 1 ? 's' : ''
            }}
            ici{{
              selTile.visited && !selTile.active ? ' · ses lieux tenus produisent à distance' : ''
            }}
          </div>
          <div v-if="selTile.visited || selTile.active" class="at-away mil">
            🛡️ {{ militiaOn(selTile.id) }} milicien{{ militiaOn(selTile.id) > 1 ? 's' : '' }} en
            réserve{{ selTile.active ? '' : ' · la Caserne continue de produire' }}
          </div>
          <!-- 🛡️ Île quittée : sa milice se gère d'ici, entre sa réserve et ses lieux fixes. -->
          <div v-if="!selTile.active && remote?.[selTile.id]?.length" class="at-remote">
            <div v-for="rp in remote[selTile.id]" :key="rp.id" class="ar-row">
              <span class="ar-name">{{ rp.emoji }} {{ rp.label }}</span>
              <span class="ar-count">🛡️ {{ rp.militia }}</span>
              <button
                type="button"
                class="ar-btn"
                :aria-label="`Ramener un milicien de ${rp.label}`"
                :disabled="busy || rp.militia < 1"
                @click="$emit('militia', { island: selTile.id, pointId: rp.id, delta: -1 })"
              >
                −
              </button>
              <button
                type="button"
                class="ar-btn"
                :aria-label="`Poster un milicien sur ${rp.label}`"
                :disabled="busy || rp.room < 1 || militiaOn(selTile.id) < 1"
                @click="$emit('militia', { island: selTile.id, pointId: rp.id, delta: 1 })"
              >
                +
              </button>
            </div>
          </div>
          <!-- ⛵🛡️ Faire venir des miliciens de cette île sur l'île active (`militiaSea.ts`). -->
          <div
            v-if="!selTile.active && island && (shippable?.[selTile.id] ?? 0) > 0"
            class="at-ship"
          >
            <div class="ar-row">
              <span class="ar-name">⛵ Faire venir sur l'île {{ island.id }}</span>
              <button
                type="button"
                class="ar-btn"
                aria-label="Un milicien de moins"
                :disabled="busy || shipCount <= 1"
                @click="shipCount = Math.max(1, shipCount - 1)"
              >
                −
              </button>
              <span class="ar-count">🛡️ {{ shipN(selTile.id) }}</span>
              <button
                type="button"
                class="ar-btn"
                aria-label="Un milicien de plus"
                :disabled="busy || shipCount >= (shippable?.[selTile.id] ?? 0)"
                @click="shipCount = Math.min(shippable?.[selTile.id] ?? 1, shipCount + 1)"
              >
                +
              </button>
            </div>
            <button
              type="button"
              class="at-cross alt"
              :disabled="busy"
              @click="$emit('ship', { island: selTile.id, n: shipN(selTile.id) })"
            >
              <span class="ac-main"
                >⛵ Faire venir {{ shipN(selTile.id) }} milicien{{
                  shipN(selTile.id) > 1 ? 's' : ''
                }}</span
              >
              <span class="ac-sub"
                >2 h de mer · ils rejoindront ta réserve sur l'île {{ island.id }} · la réserve de
                cette île part d'abord, puis ses lieux les plus garnis</span
              >
            </button>
          </div>
          <!-- 🧭 Rester ou reculer ? (`stayOrBackAdvice`) : sur l'île où l'on est, tant qu'elle
               n'est pas pacifiée. -->
          <div v-if="stay && selTile.active" class="at-advice" :class="STAY_CLASS[stay.verdict]">
            <div class="av-head">
              {{ stayTitle(stay) }}
            </div>
            <div class="av-line">
              ⚔️ Un lieu (niv. {{ stay.here.levels.lo }}-{{ stay.here.levels.hi }}) :
              <b>{{
                stay.here.need === null ? 'hors de portée' : `${stay.here.need} champions`
              }}</b>
              · île {{ stay.back.island.id }} :
              {{ stay.back.need === null ? 'hors de portée' : `${stay.back.need} champions` }}
            </div>
            <div class="av-line">
              🎓 XP par champion : {{ stay.back.xpPerChamp }} → <b>{{ stay.here.xpPerChamp }}</b> ·
              🪙 mine {{ stay.back.mineGold.toLocaleString('fr-FR') }} →
              <b>{{ stay.here.mineGold.toLocaleString('fr-FR') }}</b>
            </div>
            <div class="av-line">
              🛡️ 5 miliciens tiennent un lieu fixe ici :
              <b>{{ Math.round(stay.holdHerePct * 100) }} %</b>
            </div>
            <div class="av-line">
              {{ selTile.objectiveEmoji }} Objectif :
              <b>{{
                stay.objective.take === null
                  ? 'hors de portée'
                  : `${stay.objective.take} pour le prendre`
              }}</b>
              <template v-if="stay.objective.hold !== null">
                · {{ stay.objective.hold }} postés pour le tenir</template
              >
              ·
              {{
                stay.objective.fortress === null
                  ? '🏰 forteresse hors de portée'
                  : `🏰 forteresse à ${stay.objective.fortress}`
              }}
            </div>
            <ul class="av-miss">
              <li v-for="m in stay.reasons" :key="m">{{ m }}</li>
            </ul>
          </div>
          <!-- 🧭 Partir ou rester ? (`crossingAdvice`) : sur l'île SUIVANTE, une fois la sienne pacifiée. -->
          <div
            v-if="advice && !selTile.active && selTile.id === advice.next.id"
            class="at-advice"
            :class="advice.verdict"
          >
            <div class="av-head">{{ ADVICE_TITLE[advice.verdict] }}</div>
            <div class="av-line">
              ⚔️ Prendre un lieu (niv. {{ advice.levels.lo
              }}{{ advice.levels.hi > advice.levels.lo ? '-' + advice.levels.hi : '' }}) :
              <b>{{
                advice.need === null
                  ? `hors de portée de tes ${advice.pool}`
                  : `${advice.need} champion${advice.need > 1 ? 's' : ''} sur ${advice.pool}`
              }}</b>
              · {{ Math.round(advice.takePct * 100) }} %
            </div>
            <div class="av-line">
              🛡️ Tenir : {{ advice.militia }} milicien{{ advice.militia > 1 ? 's' : '' }} à faire
              venir · <b>{{ Math.round(advice.holdPct * 100) }} %</b> des reprises repoussées
              <template v-if="advice.holdKeepPct !== null">
                · avec {{ advice.keep }} champion{{ advice.keep > 1 ? 's' : '' }} en garnison :
                <b>{{ Math.round(advice.holdKeepPct * 100) }} %</b>
              </template>
            </div>
            <div class="av-line">
              🎓 XP par mission : {{ advice.xp.here }} → <b>{{ advice.xp.there }}</b> · 🪙 mine
              {{ advice.gold.here.toLocaleString('fr-FR') }}/h →
              <b>{{ advice.gold.there.toLocaleString('fr-FR') }}/h</b>
            </div>
            <div class="av-note">Ton île pacifiée continue de produire après ton départ.</div>
            <ul v-if="advice.missing.length" class="av-miss">
              <li v-for="m in advice.missing" :key="m">{{ m }}</li>
            </ul>
          </div>
          <template v-if="island && !selTile.active && !selTile.locked">
            <!-- ⛵ Option A (2026-10-03) : le héros retenu bloque SA traversée, pas celle des
               champions vers une île déjà visitée — la feuille propose alors de les envoyer seuls. -->
            <p v-if="blocks?.[selTile.id]" class="at-block">{{ blocks[selTile.id] }}</p>
            <button
              v-if="!blocks?.[selTile.id] || selTile.visited"
              type="button"
              class="at-cross"
              :disabled="busy"
              @click="$emit('cross', selTile.id)"
            >
              <span class="ac-main">⛵ Traverser vers l'île {{ selTile.id }}</span>
              <span class="ac-sub"
                >Départ {{ heroDepartAt && heroDepartAt > departAt ? 'avec le héros' : '' }} à
                {{ clock(Math.max(departAt, heroDepartAt ?? 0)) }} · arrivée
                {{ clock(Math.max(departAt, heroDepartAt ?? 0) + CROSSING.travelMs) }} ·
                {{
                  selTile.visited
                    ? 'avec ou sans le héros, tu choisis qui embarque'
                    : 'avec le héros, tu choisis les champions'
                }}</span
              >
            </button>
            <button
              v-if="fetchable?.[selTile.id]"
              type="button"
              class="at-cross alt"
              :disabled="busy"
              @click="$emit('fetch', selTile.id)"
            >
              <span class="ac-main"
                >⛵ Faire venir {{ fetchable[selTile.id] }} champion{{
                  fetchable[selTile.id]! > 1 ? 's' : ''
                }}
                sur l'île {{ island.id }}</span
              >
              <span class="ac-sub">Ils naviguent seuls, sans le héros.</span>
            </button>
          </template>
          <p v-else-if="island && selTile.locked" class="at-block">
            🔒 Abats {{ prevFortress(selTile.id) }} pour ouvrir la traversée.
          </p>
        </div>
        <p v-if="island" class="arch-note">
          Lieux plafonnés au rang {{ islandCapRank }}, trajets selon la seule distance, carte à la
          taille de l'île : l'Avant-poste ne règle plus que la vitesse.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ISLANDS, type Island } from '@/lib/archipelago';
import { CROSSING, nextCrossingDeparture, type RemotePoint } from '@/lib/crossing';
import { formatDuration } from '@/lib/duration';
import type { ActiveCondition, ConditionDef } from '@/lib/islandCondition';
import type { MilestoneView } from '@/lib/islandMilestones';
import type { Crossing } from '@/lib/expedition';
import { characterRank } from '@/lib/characterRank';
import {
  EMBER,
  emberText,
  islandRules,
  OBJECTIVES_AFTER_HELD,
  type EmberStatus,
} from '@/lib/islandConquest';
import type {
  AdviceVerdict,
  CrossingAdvice,
  StayOrBackAdvice,
  StayVerdict,
} from '@/lib/crossingAdvice';

const props = defineProps<{
  island: Island | null;
  busy?: boolean;
  /** 🏝️ Où en est la conquête de l'île active (`islandConquest`). */
  conquest?: {
    pointsHeld: number;
    objectivesDown: number;
    objectivesTotal: number;
    fortressDown: boolean;
    locked: boolean;
    pacified: boolean;
  } | null;
  /** 🕯️ Les objectifs éteints de l'île active et leur rallumage (`emberStatus`). */
  embers?: EmberStatus[];
  /** 🏅 Les jalons de l'île active (`milestoneViews`), vide si elle n'en a pas. */
  milestones?: MilestoneView[];
  /** ⛵ Les îles ouvertes à la traversée (`openIslands`) et celles déjà visitées. */
  openIds?: number[];
  visitedIds?: number[];
  /** ⛵ La traversée réservée ou en cours. */
  crossing?: Crossing | null;
  /** ⛵ Pourquoi on ne peut pas traverser vers chaque île (texte), null si possible. */
  blocks?: Record<number, string | null>;
  /** ⛵ Champions LIBRES sur chaque autre île visitée : on peut les faire venir. */
  fetchable?: Record<number, number>;
  /** ⛵ Les navigations sans héros en cours. */
  sailings?: Crossing[];
  /** ⛵ Le départ avec le héros (après le retour des troupes encore en marche). */
  heroDepartAt?: number;
  /** ⛵ Champions restés sur chaque autre île. */
  away?: Record<number, number>;
  /** 🛡️ La réserve de milice de chaque île visitée (elle traverse sur demande, `ship`). */
  militia?: Record<number, number>;
  /** 🛡️ Les lieux fixes tenus de chaque île rangée, avec leur milice (`remotePoints`). */
  remote?: Record<number, RemotePoint[]>;
  /** ⛵🛡️ Combien de miliciens chaque île rangée peut envoyer sur l'île active
   *  (`shippableMilitia`). */
  shippable?: Record<number, number>;
  /** 🧭 Le conseil « partir ou rester » pour l'île suivante (`crossingAdvice`), une fois
   *  l'île active pacifiée. */
  advice?: CrossingAdvice | null;
  /** 🧭 Le conseil « rester ou reculer » sur l'île active, tant qu'elle n'est pas pacifiée. */
  stay?: StayOrBackAdvice | null;
  /** 🌗 La condition de l'île active en ce moment, et la suivante (`islandCondition`). */
  condition?: ActiveCondition | null;
  nextCondition?: { def: ConditionDef; startsAt: number } | null;
  /** 🗺️ L'île rangée dont on regarde la carte (null : la carte active). */
  shown?: number | null;
  now: number;
}>();
const emit = defineEmits<{
  /** 🗺️ Montrer la carte d'une île rangée (`null` = revenir à l'île active). */
  view: [id: number | null];
  cross: [to: number];
  fetch: [from: number];
  militia: [{ island: number; pointId: string; delta: number }];
  ship: [{ island: number; n: number }];
}>();

/** Heure d'horloge (« 14:00 »). */
const clock = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const departAt = computed(() => nextCrossingDeparture(props.now));
const awayOn = (id: number) => props.away?.[id] ?? 0;
const militiaOn = (id: number) => props.militia?.[id] ?? 0;
/** ⛵🛡️ Combien de miliciens faire venir (5 = une garnison pleine), borné à ce que l'île
 *  peut envoyer. */
const shipCount = ref(5);
const shipN = (id: number) => Math.max(1, Math.min(shipCount.value, props.shippable?.[id] ?? 1));
const prevFortress = (id: number) => ISLANDS.find((i) => i.id === id - 1)?.fortress ?? '';

/** 🏅 Le texte d'un jalon : déplié d'office pour le prochain, au toucher pour les autres. */
const mileToggled = ref<Record<string, boolean>>({});
const isMileOpen = (m: MilestoneView) => mileToggled.value[m.id] ?? m.state === 'next';
const toggleMile = (m: MilestoneView) => {
  mileToggled.value = { ...mileToggled.value, [m.id]: !isMileOpen(m) };
};

const open = ref(false);

const tiles = computed(() =>
  ISLANDS.map((i) => {
    const lo = characterRank(i.minLevel);
    const hi = characterRank(i.maxLevel);
    const active = props.island?.id === i.id;
    const reached = props.openIds?.length
      ? props.openIds.includes(i.id)
      : (props.island?.id ?? 1) >= i.id;
    const visited = !!props.visitedIds?.includes(i.id);
    return {
      ...i,
      lo,
      hi,
      /** ⛵ Une traversée (héros ou champions seuls) fait route vers elle. */
      sea: props.crossing?.to === i.id || !!props.sailings?.some((s) => s.to === i.id),
      color: hi.color,
      active,
      visited,
      locked: !reached,
    };
  }),
);
const STAY_CLASS: Record<StayVerdict, string> = { stay: 'go', even: 'bring', back: 'train' };
const stayTitle = (s: StayOrBackAdvice): string => {
  if (s.verdict === 'stay') return '🧭 Reste : cette île rapporte plus';
  if (s.verdict === 'even') return '🧭 À égalité : rester garde tes lieux fixes';
  return `🧭 Recule sur l'île ${s.back.island.id} : tu y gagnes plus`;
};
const ADVICE_TITLE: Record<AdviceVerdict, string> = {
  go: '🧭 Tu peux partir',
  bring: '🧭 Pars, mais fais venir de la milice',
  train: '🧭 Reste et entraîne tes champions',
};
const sel = ref(props.island?.id ?? 1);
/** 📍 L'île AFFICHÉE : une île rangée qu'on regarde, sinon celle où l'on est. */
const shownId = computed(() => props.shown ?? props.island?.id ?? 1);
/** La pastille ouvre l'archipel sur l'île affichée ; la retoucher le referme. */
function toggle() {
  if (!open.value) sel.value = shownId.value;
  open.value = !open.value;
}
/** Toucher une île affiche sa fiche — et, pour une île déjà visitée qu'on a quittée, sa carte
 *  (gérer sa milice sans traverser, v1.48.0). L'île active (ou jamais visitée) : la carte active. */
function pick(id: number) {
  sel.value = id;
  const t = tiles.value.find((x) => x.id === id);
  emit('view', t && t.visited && !t.active ? id : null);
}
/** L'île affichée, montrée sur la pastille. */
const curTile = computed(() => tiles.value.find((t) => t.id === shownId.value) ?? null);
const selTile = computed(() => tiles.value.find((t) => t.id === sel.value) ?? null);
const islandCapRank = computed(() =>
  props.island ? characterRank(props.island.maxLevel).name : '',
);
</script>

<style scoped lang="scss">
/* 📍 En haut à droite de la carte, par-dessus elle (le parent est en `position: relative`). */
.arch {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: calc(100% - 16px);
}
.arch-cur {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  max-width: 100%;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--a, var(--accent));
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.arch-cur:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ac-emo {
  font-size: 16px;
  line-height: 1;
}
.ac-txt {
  min-width: 0;
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-sea {
  font-size: 13px;
}
.ac-chev {
  color: var(--dim);
  font-size: 11px;
}
/* Le déplié reste DANS la carte : il défile s'il est plus haut qu'elle. */
.arch-pop {
  margin-top: 6px;
  width: 360px;
  max-width: 100%;
  max-height: calc(min(62vh, 100dvh - 314px) - 70px);
  overflow-y: auto;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}
/* 🏝️ Cinq colonnes égales, 44 px de haut : la carte garde le bas de l'écran. */
.isl-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.isl {
  position: relative;
  height: 42px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0 2px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.isl:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.isl-emo {
  font-size: 15px;
  line-height: 1;
}
.isl-num {
  font-family: 'Oswald', sans-serif;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.isl-tag {
  position: absolute;
  top: -5px;
  right: -3px;
  font-size: 11px;
  line-height: 1;
}
/* 📍 Le sélecteur : l'île où l'on est est le segment PLEIN, comme un onglet choisi. */
.isl.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #15120e;
}
.isl.sea {
  border-color: #5aa9d6;
}
.isl.locked {
  color: var(--dim);
  background: transparent;
  border: 1px dashed var(--line);
}
.isl.sel {
  box-shadow: 0 0 0 2px var(--a);
}
.arch-body {
  padding: 8px 0 4px;
}
.arch-tile {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px;
  background: var(--surface-2, var(--bg));
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.arch-tile.active {
  border-color: var(--a);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--a) 40%, transparent);
}
.arch-tile.locked {
  opacity: 0.6;
}
.at-top {
  display: flex;
  align-items: center;
  gap: 5px;
}
.at-emo {
  font-size: 16px;
}
.at-num {
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  font-weight: 600;
}
.at-chip {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: #15120e;
  white-space: nowrap;
}
/* 🌗 Condition d'île : pastille + effet + durée, en ligne qui passe à la ligne (344 px). */
.at-cond {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-height: 44px;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
}
.at-chip.cond {
  margin-left: 0;
  font-size: 12px;
  padding: 3px 10px;
}
.ac-fx {
  flex: 1 1 140px;
  min-width: 0;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.ac-left,
.ac-next {
  font-size: 11px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.ac-next {
  flex-basis: 100%;
}
.at-chip.dim {
  background: transparent;
  color: var(--dim);
  box-shadow: inset 0 0 0 1px var(--line);
}
.at-ranks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.at-rank {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--rk);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rk) 60%, transparent);
}
.at-lvl {
  font-size: 10px;
  color: var(--dim);
}
.at-threat,
.at-fort {
  font-size: 11px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.at-rules {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text);
}
.at-rules summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  color: var(--accent);
}
.at-rules ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.at-rules li {
  display: flex;
  gap: 6px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.ar-emo {
  flex: none;
}
.at-conq {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.at-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2, var(--surface));
  color: var(--text);
}
.at-pill.done {
  border-color: color-mix(in srgb, var(--d1) 60%, var(--line));
  color: var(--d1);
}
.at-pill.dim {
  color: var(--dim);
}
/* 🏅 Jalons : tuiles pleine largeur (le texte du prochain a besoin de place à 344 px). */
.at-miles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.am-tile {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2, var(--surface));
  color: var(--text);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.am-tile.done {
  border-color: color-mix(in srgb, var(--d1) 60%, var(--line));
}
.am-tile.next {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.am-tile.todo {
  color: var(--dim);
}
.am-emo {
  font-size: 18px;
  line-height: 1.2;
  flex: none;
}
.am-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.am-name {
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.am-state {
  font-size: 11px;
  color: var(--dim);
}
.am-tile.done .am-state {
  color: var(--d1);
}
.am-tile.next .am-state {
  color: var(--accent);
  font-weight: 700;
}
.am-text {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text);
  overflow-wrap: anywhere;
}
.at-chip.open {
  background: #5aa9d6;
  color: #0e1a22;
}
.arch-sea {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 4px 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #5aa9d6 18%, var(--surface));
  border: 1px solid color-mix(in srgb, #5aa9d6 50%, var(--line));
  font-size: 12px;
}
.as-emo {
  font-size: 20px;
  line-height: 1;
}
.as-txt {
  flex: 1;
  min-width: 0;
}
.as-sub {
  display: block;
  color: var(--dim);
  margin-top: 2px;
}
.at-away {
  margin-top: 8px;
  font-size: 12px;
  color: #8cc7e6;
}
.at-away.mil {
  color: var(--dim);
}
.at-ship {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.at-remote {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ar-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ar-count {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.ar-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
}
.ar-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.at-advice {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--av, var(--line));
  background: color-mix(in srgb, var(--av, var(--line)) 12%, transparent);
  font-size: 12px;
}
.at-advice.go {
  --av: var(--d1);
}
.at-advice.bring {
  --av: var(--d3);
}
.at-advice.train {
  --av: var(--d4);
}
.av-head {
  font-weight: 700;
  margin-bottom: 4px;
  color: var(--av);
}
.av-line {
  margin-top: 2px;
}
.av-note {
  margin-top: 4px;
  color: var(--dim);
}
.av-miss {
  margin: 4px 0 0;
  padding-left: 18px;
}
.at-block {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dim);
}
.at-cross {
  margin-top: 10px;
  width: 100%;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 10px;
  border: none;
  background: #5aa9d6;
  color: #0e1a22;
  font: inherit;
  cursor: pointer;
}
.at-cross:disabled {
  opacity: 0.5;
}
.at-cross.alt {
  background: transparent;
  color: var(--text);
  border: 1px solid #5aa9d6;
}
.ac-main {
  font-weight: 800;
  font-size: 14px;
}
.ac-sub {
  font-size: 11px;
  text-align: center;
}
.arch-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--dim);
}
</style>
