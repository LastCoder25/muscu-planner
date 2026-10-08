<template>
  <!-- ➕ LE RENFORT DIRECT (2026-09-29, demandé : « cliquer sur un slot de garnison libre et
       directement envoyer un renfort, sans aller dans la gestion du lieu »). Ouvert depuis
       une case libre (liste des places fortes ou fiche du lieu).
       ➕ GROUPÉ (demandé : « sélectionner plusieurs renforts d'un coup en voyant le % de
       défense qu'ils donnent ») : on coche champions, miliciens et membres d'autres lieux,
       la tenue AVEC la sélection se lit avant d'envoyer, puis un seul bouton envoie tout.
       ⚠️ Aucune règle ici — les places vivent dans `reinforceSelection`, la tenue dans la
       page, et le store refuse ce qui ne passe pas. -->
  <q-dialog :model-value="!!poi" position="bottom" @update:model-value="(v) => !v && emit('close')">
    <div v-if="poi && poi.control" class="qr">
      <div class="qr-head">
        <span class="qr-title"
          >➕ Renfort · {{ CONTROL_EMO[poi.control.kind] }}
          {{ CONTROL_LABEL[poi.control.kind] }}</span
        >
        <button type="button" class="qr-x" aria-label="Fermer" @click="emit('close')">✕</button>
      </div>
      <!-- 🛡️⚔️ UN LIEU ENNEMI (demandé : « pré-envoyer une garnison de miliciens ») : seuls des
           miliciens y marchent. Pris d'ici leur arrivée, ils occupent les places libres ;
           toujours ennemi, ils font demi-tour vers la base. -->
      <p v-if="poi.control.owner !== 'player'" class="qr-sub">
        Lieu <b>ennemi</b> · envoie des miliciens à l’avance : si ton attaque l’a pris à leur
        arrivée, ils prennent les places libres ; sinon ils font demi-tour vers la base.
      </p>
      <p v-else class="qr-sub">
        <template v-if="champFree > milFree"
          >{{ milFree }} place{{ milFree > 1 ? 's' : '' }} libre{{ milFree > 1 ? 's' : '' }} ·
          jusqu’à {{ champFree }} champion{{ champFree > 1 ? 's' : '' }} (des miliciens leur
          céderont leur place)</template
        >
        <template v-else
          >{{ milFree }} place{{ milFree > 1 ? 's' : '' }} libre{{ milFree > 1 ? 's' : '' }}, dont
          {{ champFree }} de champion</template
        >
        · coche tes renforts, puis envoie-les ou programme leur départ
      </p>
      <!-- 🛡️ La tenue À L'ATTAQUE, et ce que la sélection y change (arrivées comprises). -->
      <p v-if="hold" class="qr-hold">
        🛡️ Repousse aujourd’hui environ <b>{{ hold.pct }} %</b>
        {{ hold.vsArmy ? 'face à l’armée en approche' : 'des assauts' }}
      </p>
      <!-- ⏳ Les départs déjà programmés vers ce lieu : ils occupent déjà leurs places. -->
      <div v-for="m in planned" :key="m.id" class="qr-plan">
        <span class="qr-plan-main"
          >⏳ <b>{{ m.count }}</b> renfort{{ m.count > 1 ? 's' : '' }} programmé{{
            m.count > 1 ? 's' : ''
          }}
          · départ dans {{ m.departIn }} ({{ m.departAt }})</span
        >
        <button type="button" class="qr-plan-x" :disabled="busy" @click="emit('cancel', m.id)">
          Annuler
        </button>
      </div>
      <!-- 🦸 LE HÉROS (2026-10-05, demandé : « je n'ai pas la possibilité d'envoyer le héros sur
           un lieu fixe qui a 2 places ») : il tient garnison et prend 2 places sur les 5.
           Depuis le 2026-10-08 (demandé) il se COCHE avec la sélection : il part avec elle, se
           programme comme elle et compte dans la tenue. Grisé AVEC la raison. -->
      <button
        v-if="heroOffer"
        type="button"
        class="qr-mil qr-hero"
        :class="{ on: sel.hero }"
        :aria-pressed="!!sel.hero"
        :disabled="busy || (!sel.hero && (!!heroOffer.why || !canHero))"
        @click="emit('toggleHero')"
      >
        <span class="qr-mil-emo" aria-hidden="true">🦸</span>
        <span class="qr-mil-main">
          <span class="qr-mil-name">Ton héros · 2 places</span>
          <span class="qr-mil-sub">{{
            heroOffer.why ??
            (!sel.hero && !canHero
              ? 'plus assez de places de champion (il en prend 2)'
              : `🧭 ${formatDurationMin(heroOffer.min)} · défend à son arrivée`)
          }}</span>
        </span>
        <span class="qr-hero-mark" aria-hidden="true">{{ sel.hero ? '✓' : '＋' }}</span>
      </button>
      <!-- 🛡️ Les miliciens d'abord : c'est le renfort qu'on a le plus souvent sous la main, et
           il ne prend la place d'aucun champion qui aurait mieux à faire ailleurs. -->
      <div v-if="(milRoom > 0 || milAnyway) && milHome > 0" class="qr-mil">
        <span class="qr-mil-emo"><MilitiaPortrait /></span>
        <span class="qr-mil-main">
          <span class="qr-mil-name">{{ MILITIA_NAME }}s</span>
          <span class="qr-mil-sub"
            >{{ milHome }} à la base · 🧭 {{ formatDurationMin(militiaMin)
            }}<template v-if="hold && canMil && !nextOver">
              · 🎯 {{ sign(hold.mil) }} % le suivant</template
            ></span
          >
        </span>
        <span class="qr-step">
          <button
            type="button"
            class="qr-step-b"
            aria-label="Un milicien de moins"
            :disabled="busy || sel.militia <= 0"
            @click="emit('militia', sel.militia - 1)"
          >
            −
          </button>
          <b class="qr-step-n">{{ sel.militia }}</b>
          <button
            type="button"
            class="qr-step-b"
            aria-label="Un milicien de plus"
            :disabled="busy || !canBaseMil || sel.militia >= milHome"
            @click="emit('militia', sel.militia + 1)"
          >
            ＋
          </button>
        </span>
      </div>
      <template v-if="champFree > 0">
        <p class="qr-cap">🧑 Des champions</p>
        <div v-if="champs.length" class="qr-pick">
          <AdvPickTile
            v-for="a in champs"
            :key="a.id"
            :adv="a"
            :on="sel.champs.includes(a.id)"
            :gain="hold?.champ[a.id] ?? null"
            :travel-min="champMin[a.id] ?? null"
            :gain-title="gainTitle(sel.champs.includes(a.id))"
            :reason="busy ? '…' : !sel.champs.includes(a.id) && !canChamp ? 'plus de place' : null"
            @toggle="emit('toggleChamp', a.id)"
          />
        </div>
        <p v-else class="qr-none">Aucun champion disponible pour l’instant.</p>
      </template>
      <p v-else-if="poi.control.owner === 'player'" class="qr-none">
        Plus de place de champion ici{{
          milAnyway ? ' : des miliciens peuvent encore y aller.' : '.'
        }}
      </p>
      <!-- ⇄ DEPUIS UN AUTRE LIEU (demandé : « faire venir un champion ou milicien d'un autre
           lieu fixe »). Seuls ceux dont le transfert passe (`transferSourcesFor`) ; ils partent
           directement de leur point, sans repasser par la base. -->
      <template v-if="sources.length">
        <p class="qr-cap">⇄ Depuis un autre lieu</p>
        <div v-for="s in sources" :key="s.fromId" class="qr-src">
          <p class="qr-src-name">{{ s.emo }} {{ s.label }}</p>
          <div class="qr-pick">
            <button
              v-for="m in s.members"
              :key="m.id"
              type="button"
              class="qr-mem"
              :class="{ on: picked(m.id) }"
              :aria-pressed="picked(m.id)"
              :disabled="busy || (!picked(m.id) && !(m.adv ? canChamp : canMil))"
              @click="emit('transfer', s.fromId, m.id)"
            >
              <span class="qr-mem-emo"
                ><ChampionPortrait v-if="m.adv" :champion-id="m.adv.championId">{{
                  advTitle(m.adv)?.emoji ?? '🧑'
                }}</ChampionPortrait
                ><MilitiaPortrait v-else
              /></span>
              <span class="qr-mem-main">
                <span class="qr-mem-name">{{ m.adv ? m.adv.name : MILITIA_NAME }}</span>
                <span class="qr-mem-sub"
                  >🧭 {{ formatDurationMin(m.min)
                  }}<template v-if="hold && hold.trans[m.id] !== undefined">
                    · 🎯 {{ sign(hold.trans[m.id]!) }} %</template
                  ></span
                >
              </span>
            </button>
          </div>
        </div>
      </template>
      <!-- 🚀 L'ENVOI : la tenue AVEC la sélection, puis un seul bouton pour tout faire partir. -->
      <div v-if="count > 0" class="qr-send">
        <!-- 🛡️ PARTIR VERS UN LIEU PLEIN (demandé : « prévoir qu'on va envoyer les champions en
             attaque », depuis la base comme depuis un autre lieu) : les miliciens en trop
             s'installent si une place se libère d'ici leur arrivée, sinon ils font demi-tour
             vers la base. -->
        <p v-if="bumped > 0" class="qr-mil-over">
          🏠 {{ bumped }} milicien{{ bumped > 1 ? 's' : '' }} en poste céder{{
            bumped > 1 ? 'ont' : 'a'
          }}
          {{ bumped > 1 ? 'leur' : 'sa' }} place à tes champions et rentrer{{
            bumped > 1 ? 'ont' : 'a'
          }}
          à la base
        </p>
        <p v-if="milOver > 0" class="qr-mil-over">
          🔄 {{ milOver }} milicien{{ milOver > 1 ? 's' : '' }} en trop : demi-tour vers la base si
          toujours plein à l’arrivée
        </p>
        <p v-if="hold && selHold" class="qr-with">
          🛡️ Avec ces renforts<template v-if="delayMin > 0"> (départ différé)</template> :
          <b>{{ selHold.pct }} %</b>
          <span class="qr-delta" :class="{ up: selHold.pct > hold.pct }"
            >({{ sign(selHold.pct - hold.pct) }})</span
          >
          <span v-if="selHold.late > 0" class="qr-late">
            · {{ selHold.late }} arrivera{{ selHold.late > 1 ? 'ont' : '' }} trop tard</span
          >
        </p>
        <!-- 🧭 LE TRAJET DE LA SÉLECTION, avant de valider (demandé) : les champions de la base
             partent ensemble, au pas du plus lent ; l'arrivée tient compte d'un départ différé. -->
        <p v-if="arrival" class="qr-trip">
          🧭 Trajet <b>{{ formatDurationMin(arrival.min) }}</b> · arrivée vers
          <b>{{ arrival.at }}</b>
        </p>
        <!-- ⏳ LE DÉPART (demandé : « dans combien de temps, heures/minutes — si une attaque
             arrive dans 1 h 30 on les envoie dans 1 h 25 », ou tout de suite). -->
        <DepartDelayPicker
          :model-value="delayMin"
          :max-delay-min="maxDelayMin"
          :at="departLabel"
          @update:model-value="emit('delay', $event)"
        />
        <button type="button" class="qr-go" :disabled="busy" @click="emit('send')">
          <template v-if="delayMin > 0"
            >⏳ Programmer {{ count }} renfort{{ count > 1 ? 's' : '' }}</template
          >
          <template v-else>➕ Envoyer {{ count }} renfort{{ count > 1 ? 's' : '' }}</template>
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import DepartDelayPicker from '@/components/DepartDelayPicker.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { advTitle, type Adventurer } from '@/lib/adventurers';
import { CONTROL_EMO, CONTROL_LABEL } from '@/lib/controlPoints';
import type { Poi } from '@/lib/expedition';
import { MILITIA, MILITIA_NAME } from '@/lib/militia';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import { formatDurationMin } from '@/lib/duration';
import {
  reinfCanAdd,
  reinfCount,
  reinfMilitiaOver,
  reinfBumped,
  reinfSeats,
  type ReinfSelection,
} from '@/lib/reinforceSelection';

const props = defineProps<{
  poi: Poi | null;
  /** Les champions disponibles, déjà triés (le même ordre que la fiche du lieu). */
  champs: Adventurer[];
  champFree: number;
  /** Places libres de la garnison entière (miliciens compris). */
  milFree: number;
  /** 🛡️ Places ouvertes aux miliciens (0 dans un objectif ou une forteresse). */
  milRoom: number;
  /** 🛡️ Les miliciens de la base partent même si le lieu est plein (demi-tour à l'arrivée
   *  s'il l'est encore). Faux là où aucun milicien ne va. */
  milAnyway: boolean;
  milHome: number;
  militiaMin: number;
  /** ⇄ Les autres points tenus et ceux qui peuvent en venir (avec leur trajet). */
  sources: {
    fromId: string;
    emo: string;
    label: string;
    members: { id: string; adv: Adventurer | null; min: number }[];
  }[];
  busy: boolean;
  /** La sélection en cours (tenue par la page). */
  sel: ReinfSelection;
  /** 🎯 La tenue à l'attaque (%) et ce que chaque renfort CHANGE à la sélection, en points :
   *  coché, ce qu'on perdrait sans lui ; non coché, ce qu'on gagnerait en l'ajoutant. */
  hold: {
    pct: number;
    /** Jugée contre l'armée en approche (visible), pas contre le pire cas. */
    vsArmy?: boolean;
    mil: number;
    champ: Record<string, number>;
    trans: Record<string, number>;
  } | null;
  /** La tenue AVEC toute la sélection, et combien arriveraient après l'attaque. */
  selHold: { pct: number; late: number } | null;
  /** ⏳ Dans combien de minutes la sélection part (0 = tout de suite). */
  delayMin: number;
  maxDelayMin: number;
  /** L'heure de départ, lisible (« 21 h 40 »), quand elle est programmée. */
  departLabel: string | null;
  /** 🧭 Le trajet de chaque champion de la base jusqu'au lieu, en minutes. */
  champMin: Record<string, number>;
  /** 🧭 Le trajet le plus long de la sélection et l'heure d'arrivée (null = rien coché). */
  arrival: { min: number; at: string } | null;
  /** ⏳ Les départs déjà programmés vers ce lieu. */
  planned: { id: string; count: number; departIn: string; departAt: string }[];
  /** 🦸 Le héros peut-il venir : son trajet, ou la raison d'un refus ; `null` = pas proposé. */
  heroOffer: { why: string | null; min: number } | null;
}>();
/** « +12 », « −3 », « 0 » : un écart se lit avec son signe. */
const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const free = computed(() => ({
  champ: props.champFree,
  total: props.milFree,
  mil: props.milRoom,
  milAnyway: props.milAnyway,
}));
const canChamp = computed(() => reinfCanAdd(props.sel, 'champ', free.value));
const canMil = computed(() => reinfCanAdd(props.sel, 'mil', free.value));
/** 🛡️ Un milicien de la base de plus : toujours possible là où des miliciens vont (dans la
 *  limite de la base), sinon seulement s'il reste une place. */
const canBaseMil = computed(() => props.milAnyway || canMil.value);
/** 🛡️ Ceux de la sélection qui partent au-delà des places libres d'aujourd'hui. */
const milOver = computed(() => reinfMilitiaOver(props.sel, free.value));
/** 🏠 Les miliciens en poste que les champions cochés (ou le héros) délogeront. */
const bumped = computed(() => reinfBumped(props.sel, free.value));
/** 🦸 Le héros tient-il encore dans les places de champion, avec la sélection ? */
const canHero = computed(() => reinfSeats(props.sel).champ + MILITIA.heroSeats <= free.value.champ);
/** Le milicien suivant partirait-il au-delà des places ? (son gain ne se promet pas.) */
const nextOver = computed(
  () => reinfMilitiaOver({ ...props.sel, militia: props.sel.militia + 1 }, free.value) > 0,
);
const count = computed(() => reinfCount(props.sel));
const picked = (id: string) => props.sel.transfers.some((t) => t.id === id);
const gainTitle = (on: boolean) =>
  on
    ? 'Ce que la défense perdrait sans lui, avec le reste de ta sélection'
    : 'Ce qu’il ajouterait à la défense, en plus de ta sélection';
const emit = defineEmits<{
  close: [];
  toggleHero: [];
  toggleChamp: [string];
  militia: [number];
  transfer: [string, string];
  send: [];
  delay: [number];
  cancel: [string];
}>();
</script>

<style scoped>
.qr {
  width: 100%;
  max-width: 560px;
  max-height: 80dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
}
.qr-trip {
  margin: 0 0 8px;
  font-size: 12.5px;
  color: var(--text);
}
.qr-hold {
  margin: 4px 0 8px;
  font-size: 12.5px;
  color: var(--d1, #7bc86c);
}
.qr-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.qr-title {
  flex: 1;
  min-width: 0;
  font-family: Oswald, sans-serif;
  font-size: 17px;
  font-weight: 700;
}
.qr-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.qr-sub {
  margin: 0 0 10px;
  color: var(--dim);
  font-size: 12.5px;
}
.qr-cap {
  margin: 12px 0 6px;
  font-weight: 700;
  font-size: 13px;
}
.qr-pick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.qr-src {
  margin-bottom: 10px;
}
.qr-src-name {
  margin: 0 0 6px;
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
}
.qr-mem {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.qr-mem:disabled {
  opacity: 0.5;
}
.qr-mem-emo {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  overflow: hidden;
  font-size: 22px;
}
.qr-mem-emo :deep(.cp) {
  width: 100%;
  height: 100%;
}
.qr-mem-emo :deep(.mil-portrait) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.qr-mem-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.qr-mem-name {
  font-weight: 700;
  font-size: 13px;
  line-height: 1.2;
  /* Deux lignes : « Orsène le Baumier » était coupé à 344 px. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.qr-mem-sub {
  color: var(--dim);
  font-size: 12px;
}
.qr-none {
  color: var(--dim);
  font-size: 13px;
}
.qr-mil.qr-hero {
  margin-bottom: 8px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-color: var(--line);
  background: var(--surface-2, var(--bg));
}
.qr-mil.qr-hero.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2, var(--bg)));
}
.qr-mil.qr-hero:disabled {
  opacity: 0.5;
  cursor: default;
}
.qr-hero-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
  font-weight: 700;
}
.qr-hero.on .qr-hero-mark {
  background: var(--accent);
  border-color: var(--accent);
  color: #15120e;
}
.qr-mil {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-2, var(--bg)));
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: default;
}
.qr-mil:disabled {
  opacity: 0.5;
}
.qr-mil-emo {
  font-size: 26px;
}
.qr-mil-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qr-mil-name {
  font-weight: 700;
}
.qr-mil-sub {
  color: var(--dim);
  font-size: 12px;
}
.qr-mil-over {
  margin: 0 0 8px;
  color: var(--d3);
  font-size: 12px;
  line-height: 1.35;
}
.qr-mil-main {
  flex: 1;
  min-width: 0;
}
.qr-step {
  display: flex;
  align-items: center;
  gap: 4px;
}
.qr-step-b {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.qr-step-b:disabled {
  opacity: 0.4;
  cursor: default;
}
.qr-step-n {
  min-width: 22px;
  text-align: center;
  font-family: Oswald, sans-serif;
  font-size: 18px;
}
.qr-mem.on {
  border: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2, var(--bg)));
}
/* L'envoi colle au bas de la feuille : la tenue avec la sélection reste sous les yeux
   pendant qu'on coche. */
.qr-send {
  position: sticky;
  bottom: -20px;
  margin: 12px -12px -20px;
  padding: 10px 12px 16px;
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.qr-with {
  margin: 0 0 8px;
  font-size: 13px;
}
.qr-delta {
  margin-left: 4px;
  color: var(--dim);
}
.qr-delta.up {
  color: var(--d1, #7bc86c);
}
.qr-late {
  color: var(--d3, #ffb23f);
}
.qr-go {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #15120e;
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}
.qr-go:disabled {
  opacity: 0.5;
}
.qr-plan {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 6px 6px 6px 10px;
  border: 1px dashed color-mix(in srgb, var(--accent) 55%, var(--line));
  border-radius: 12px;
  font-size: 12.5px;
}
.qr-plan-main {
  flex: 1;
  min-width: 0;
}
.qr-plan-x {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
</style>
