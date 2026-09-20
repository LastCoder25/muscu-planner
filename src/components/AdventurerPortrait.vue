<template>
  <!-- LE PORTRAIT D’UN AVENTURIER — le même langage que celui du héros à l’entrée de
       l’Aventure (demandé par l’utilisateur) : l’avatar au centre d’un cercle teinté par
       son RANG, ses étoiles sur l’anneau, et quatre ronds aux coins.
       ↖ sa classe (rareté) · ↗ son rang · ↙ l’avancement vers l’étoile suivante · ↘ sa
       puissance. ⚠️ Toujours PAS de niveau affiché : c’est la règle posée à la conception
       (« un aventurier de manga ») — le rang et l’anneau disent où il en est. -->
  <div
    class="ap"
    :class="[tone ? 'tone-' + tone : '', { busy: tone ? tone !== 'free' : false }]"
    :style="{ '--rank-c': rank.color, '--rar-c': rarColor, '--nom-c': nomColor }"
  >
    <div class="ap-square">
      <button
        class="ap-mini corner tl"
        type="button"
        :title="subLabel ? `${subLabel} · ${nomLabel}` : nomLabel"
        :aria-label="`Fiche de ${adv.name}`"
        @click="emit('open')"
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track rar" cx="22" cy="22" r="18" />
          <text class="apm-emo" x="22" y="23" text-anchor="middle" dominant-baseline="central">
            {{ title?.emoji ?? '🧑' }}
          </text>
        </svg>
      </button>

      <div class="ap-mini corner tr" :title="`${rank.name} · ${rank.star}/5 ★`">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track full" cx="22" cy="22" r="18" />
          <text class="apm-emo" x="22" y="23" text-anchor="middle" dominant-baseline="central">
            {{ rank.emoji }}
          </text>
        </svg>
        <span class="apm-ic txt font-display">{{ rank.star }}★</span>
      </div>

      <div
        class="ap-frame"
        role="button"
        tabindex="0"
        :aria-label="`Fiche de ${adv.name}`"
        @click="onFrame"
        @keydown.enter.prevent="emit('open')"
      >
        <AventureAvatar
          class="ap-avatar"
          :profile="look.profile"
          :equipped="equipped"
          :weapon-shape="look.weaponKind"
          :champion-id="adv.championId"
          :talent-icon="talentIcon"
          @familiar-click="emit('familiar')"
          @talent-click="emit('talent')"
        />
        <svg class="ap-stars" viewBox="0 0 100 100" aria-hidden="true">
          <path
            v-for="i in 5"
            :key="i"
            class="ap-star"
            :class="{ on: i <= rank.star }"
            :d="STAR_PATH"
            :transform="starTf(i - 1)"
          />
        </svg>
      </div>

      <div class="ap-mini corner bl" :title="`Vers l’étoile suivante : ${pct} %`">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track" cx="22" cy="22" r="18" />
          <circle
            class="apm-arc"
            cx="22"
            cy="22"
            r="18"
            stroke-dasharray="113.1"
            :stroke-dashoffset="113.1 * (1 - pct / 100)"
            transform="rotate(-90 22 22)"
          />
          <text
            class="apm-v font-display"
            x="22"
            y="22"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ pct }}%
          </text>
        </svg>
        <span class="apm-ic txt font-display">XP</span>
      </div>

      <div class="ap-mini corner br pow" :title="`Puissance ${fmtPow(power)}`">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track full" cx="22" cy="22" r="18" />
          <text
            class="apm-v font-display"
            x="22"
            y="22"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ fmtPow(power) }}
          </text>
        </svg>
        <span class="apm-ic">⚔️</span>
      </div>
    </div>

    <!-- 🗡️ SES 4 PIÈCES EN 2×2, comme le héros (v0.881, demandé) : sous l'avatar, au-dessus
         du prénom. Toucher une case ouvre le choix dans le stock pour CET emplacement. Une
         case vide montre la pièce de son métier en filigrane. -->
    <div class="ap-gear">
      <button
        v-for="c in gear"
        :key="c.slot"
        type="button"
        class="apg-cell"
        :class="{ empty: !c.filled, pending: c.pending }"
        :style="c.color ? { '--gc': c.color } : {}"
        :title="c.title"
        :aria-label="c.title"
        :disabled="disabled"
        @click="emit('gear', c.slot)"
      >
        <span class="apg-emo">{{ c.emoji }}</span>
        <span v-if="c.rank" class="apg-rk">{{ c.rank }}</span>
      </button>
    </div>

    <button class="ap-name font-display" type="button" @click="emit('open')">{{ adv.name }}</button>
    <!-- 🏅 LA RARETÉ TIRÉE, EN PASTILLE PLEINE (v0.959, demandé « de façon plus lisible »).
         ⚠️ C'est la NOMINALE — ce qu'on a invoqué, et qui ne changera jamais. Les écrans
         lisaient l'EFFECTIVE : un primordial de niveau 1 s'affichait « classe Bronze », et
         rien ne disait ce qu'on avait tiré. Dans un gacha, c'est L'information.
         ⚠️ Et elle ne vivait qu'en teinte + `title` — donc invisible sur un téléphone, qui
         n'a pas de survol. -->
    <div class="ap-rar font-display">{{ nomLabel }}</div>
    <!-- ⚠️ MASQUÉ QUAND IL RÉPÈTE LE NOM : `advTitle` rend le NOM d'un champion (il n'a pas
         de métier), donc cette ligne affichait « Aurore Première » sous « Aurore Première ».
         Elle ne sert plus qu'aux aventuriers legacy, dont elle donne bien la classe.
         ✨ L'ÉVEIL prend la place ainsi libérée : il vaut jusqu'à +48 % de stats et pouvait
         monter une signature, mais ne se lisait qu'au tirage (fugace) et dans le Codex —
         jamais là où l'on compare deux champions. Teinte du Codex, même notion. -->
    <div v-if="subLabel || awaken" class="ap-sub">
      <span v-if="subLabel">{{ subLabel }}</span>
      <span v-if="awaken" class="ap-awk">✨ Éveil {{ awaken }}</span>
    </div>
    <div v-if="state" class="ap-state">{{ state }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import {
  advNominalRarity,
  advAwaken,
  advRank,
  advRankProgress,
  advRarity,
  advTitle,
  type Adventurer,
} from '@/lib/adventurers';
import type { AdvGearCell, AdvGearSlot, AdvLook } from '@/lib/advGear';
import {
  FAMILIAR_SLOT,
  RANK_COLOR,
  RARITY_LABEL,
  rarityRank,
  type Equipped,
  type Item,
} from '@/lib/items';
import { fmtPow } from '@/lib/combat';

const props = defineProps<{
  adv: Adventurer;
  /** Son apparence, équipement PORTÉ compris (`advLooks`, v0.865). ⚠️ Requise et calculée
   *  par le parent pour tout le vivier d'un coup : « porté » dépend des autres aventuriers
   *  (une pièce ne se porte qu'une fois), un portrait seul ne peut pas le savoir. */
  look: AdvLook;
  familiar: Item | null;
  talentIcon?: string;
  power: number;
  /** Ce qu’il fait en ce moment (« ✅ disponible », « 🐫 en route · 2 h »…). */
  state?: string;
  /** Sa CATÉGORIE (`advStatus`), qui teinte le cadre : vert disponible, jaune en convoi,
   *  rouge infirmerie, orange en collection.
   *  ⚠️ Une PROP, plus une déduction faite sur la chaîne d'état : le portrait lisait
   *  `state.startsWith('✅')` pour savoir s'il était occupé — renommer le libellé aurait
   *  cassé le style en silence, et la même règle vivait alors à deux endroits. */
  tone?: 'free' | 'busy' | 'hurt' | 'benched';
  disabled?: boolean;
  /** Les 4 emplacements d'équipement, dans l'ordre de la grille. */
  gear: AdvGearCell[];
}>();
const emit = defineEmits<{
  open: [];
  familiar: [];
  talent: [];
  gear: [slot: AdvGearSlot];
}>();

const rank = computed(() => advRank(props.adv));
const awaken = computed(() => advAwaken(props.adv));
const title = computed(() => advTitle(props.adv));
// Le rang de la CLASSE (v0.833) : c’est lui qui borne ses compagnons, affichés en rang.
const rarColor = computed(() => rarityRank(advRarity(props.adv)).color);
/**
 * Le sous-titre : sa CLASSE — et rien du tout quand elle répète son nom.
 *
 * ⚠️ `advTitle` rend le **nom** d'un champion (il n'a pas de métier courant, il a un nom),
 * si bien que cette ligne écrivait « Aurore Première » juste sous « Aurore Première ».
 * Depuis le wipe, tout le vivier est fait de champions : le doublon était donc systématique.
 * La comparaison au nom garde la ligne utile aux aventuriers legacy, où elle dit la classe.
 */
const subLabel = computed(() => {
  const l = title.value?.label;
  return l && l !== props.adv.name ? l : '';
});
/**
 * ⚠️ **LA RARETÉ PARLE LA LANGUE DE LA RARETÉ** (v0.962 ; signalé par l'utilisateur : « tu
 * as confondu rareté et rang… je choppe des raretés Or, Argent, alors qu'ils sont tous rang
 * Bronze »). Il avait raison, et c'est un défaut de LANGAGE, pas de calcul.
 *
 * Le projet affiche tout en RANG depuis la v0.874 (`gradeLabel`), et le motif tenait : la
 * rareté d'une classe montait d'un cran à chaque rang gagné (`PROMO_LEVELS` =
 * `rankStartLevel`), donc les deux mots désignaient la même progression. ⚠️ **Ce motif est
 * MORT avec l'arbre de classes (v0.957)** : un champion a une rareté FIGÉE au tirage et un
 * rang qui monte avec son niveau — deux échelles décorrélées. Les nommer pareil fait lire
 * « Or » à côté de « Bronze ★2 » sur le même portrait.
 *
 * ⚠️ **LA COULEUR, ELLE, RESTE PARTAGÉE** (`RANK_COLOR` est dérivée de `CHARACTER_RANKS`) :
 * c'est la même échelle de VALEUR, seuls les mots devaient diverger.
 */
const nomColor = computed(() => RANK_COLOR[advNominalRarity(props.adv)]);
const nomLabel = computed(() => RARITY_LABEL[advNominalRarity(props.adv)]);
const pct = computed(() => Math.round(advRankProgress(props.adv) * 100));
/** L’avatar ne lit que l’emplacement et la RARETÉ de chaque pièce (la forme de l’arme lui
 *  est passée à part) : la règle d’apparence vit dans `advLooks` (lib), ce composant ne
 *  fait que la traduire en « équipement ». */
const equipped = computed<Equipped>(() => {
  const out: Equipped = {};
  for (const [slot, v] of Object.entries(props.look.gear)) {
    out[slot as keyof Equipped] = { id: `look-${slot}`, slot, rarity: v.rarity } as Item;
  }
  if (props.familiar) out[FAMILIAR_SLOT] = props.familiar;
  return out;
});
/** Le cadre ouvre la fiche — sauf quand on touche le familier ou le talent de l’avatar,
 *  qui ouvrent leur propre sélecteur. */
function onFrame(e: MouseEvent) {
  if ((e.target as Element | null)?.closest?.('.hotspot')) return;
  emit('open');
}

// Mêmes étoiles que le portrait du héros, posées sur l’anneau.
const STAR_PATH =
  'M0,-6 L1.76,-2.43 L5.7,-1.85 L2.85,0.94 L3.53,4.85 L0,3 L-3.53,4.85 L-2.85,0.94 L-5.7,-1.85 L-1.76,-2.43 Z';
const STAR_ANGLES = [-150, -120, -90, -60, -30];
function starTf(i: number): string {
  const a = ((STAR_ANGLES[i] ?? -90) * Math.PI) / 180;
  const R = 48;
  return `translate(${(50 + R * Math.cos(a)).toFixed(2)} ${(50 + R * Math.sin(a) - 1.5).toFixed(2)}) scale(0.9)`;
}
</script>

<style scoped lang="scss">
.ap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px 10px;
  border-radius: 14px;
  background: var(--surface);
  /* 🏅 L'ENCADREMENT PORTE LA RARETÉ (demandé) : c'est l'identité du champion, elle ne
     change jamais — là où l'état (convoi, infirmerie) est transitoire.
     ⚠️ La NOMINALE (`--nom-c`), pas l'effective : un primordial de niveau 1 EST un
     primordial. `--rar-c` est l'EFFECTIVE — ce qu'il peut MENER — et n'appartient qu'au
     rond de sa classe. */
  border: 1px solid color-mix(in srgb, var(--nom-c) 55%, var(--line));
  min-width: 0;
  text-align: center;
}
.ap.busy {
  opacity: 0.82;
}
/* CADRE PAR ÉTAT (demandé) : vert disponible · jaune en convoi · rouge infirmerie.
   ⚠️ Les teintes viennent de la charte (les couleurs d'effort `--d1`/`--d4` et l'accent),
   pas de hex écrits ici — le thème change, elles suivent.
   ⚠️ Le banc (`tone-benched`) a disparu avec le plafond d'engagement (v0.958) : sa règle
   est retirée plutôt que laissée inatteignable. */
.ap.tone-free {
  --tone-c: var(--d1, #7bc86c);
}
.ap.tone-busy {
  --tone-c: var(--accent, #ffd23f);
}
.ap.tone-hurt {
  --tone-c: var(--d4, #ff6a45);
}
/* ⚠️ L'ÉTAT NE PREND PLUS LE CONTOUR : il est passé au liseré INTÉRIEUR depuis que la
   bordure porte la rareté. Deux couches, deux métiers — le contour dit CE QU'IL EST
   (permanent), le liseré son ÉTAT (transitoire, et déjà dit par l'opacité et le texte). */
.ap[class*='tone-'] {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tone-c) 42%, transparent);
}
.ap[class*='tone-'] .ap-state {
  color: color-mix(in srgb, var(--tone-c) 78%, var(--text));
}
.ap-square {
  position: relative;
  width: 100%;
  max-width: 180px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ap-frame {
  position: relative;
  width: 60%;
  aspect-ratio: 1;
  border-radius: 50%;
  cursor: pointer;
  background: radial-gradient(
    circle at 50% 42%,
    color-mix(in srgb, var(--rank-c) 22%, var(--bg)),
    color-mix(in srgb, var(--rank-c) 6%, var(--bg)) 70%
  );
  border: 3px solid color-mix(in srgb, var(--rank-c) 80%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--rank-c) 30%, transparent);
}
.ap-avatar {
  position: absolute;
  left: 50%;
  top: 53%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 98%;
}
.ap-stars {
  position: absolute;
  inset: -3px;
  width: calc(100% + 6px);
  height: calc(100% + 6px);
  overflow: visible;
  pointer-events: none;
}
.ap-star {
  fill: #14100a;
  stroke: color-mix(in srgb, var(--rank-c) 55%, var(--dim));
  stroke-width: 1;
}
.ap-star.on {
  fill: var(--rank-c);
  stroke: #14100a;
  stroke-width: 1.4;
  paint-order: stroke;
}
.ap-mini {
  position: absolute;
  width: 24%;
  aspect-ratio: 1;
  background: none;
  border: none;
  padding: 0;
}
button.ap-mini {
  cursor: pointer;
}
.corner.tl {
  top: 0;
  left: 0;
}
.corner.tr {
  top: 0;
  right: 0;
}
.corner.bl {
  bottom: 0;
  left: 0;
}
.corner.br {
  bottom: 0;
  right: 0;
}
.ap-mini svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.apm-track {
  fill: var(--bg);
  stroke: var(--line);
  stroke-width: 3.5;
}
.apm-track.full {
  stroke: color-mix(in srgb, var(--accent) 60%, var(--line));
}
.apm-track.rar {
  stroke: var(--rar-c);
}
.apm-arc {
  fill: none;
  stroke: var(--rank-c);
  stroke-width: 3.5;
  stroke-linecap: round;
}
.apm-emo {
  font-size: 18px;
}
.apm-v {
  font-weight: 700;
  font-size: 12px;
  fill: var(--rank-c);
  font-variant-numeric: tabular-nums;
}
.pow .apm-v {
  fill: var(--accent);
  font-size: 12px;
}
.apm-ic {
  position: absolute;
  top: 9%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  line-height: 1;
  background: var(--bg);
  border-radius: 999px;
  padding: 1px 4px;
  border: 1px solid color-mix(in srgb, var(--rank-c) 60%, transparent);
  white-space: nowrap;
}
.pow .apm-ic {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
}
.apm-ic.txt {
  font-size: 9px;
  font-weight: 800;
  color: var(--rank-c);
}
.ap-gear {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  width: 100%;
  max-width: 150px;
  margin: 4px 0 2px;
}
.apg-cell {
  position: relative;
  min-height: 40px;
  padding: 2px;
  border-radius: 9px;
  border: 1.5px solid color-mix(in srgb, var(--gc, var(--line)) 80%, transparent);
  background: color-mix(in srgb, var(--gc, var(--bg)) 14%, var(--bg));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  cursor: pointer;
  color: var(--text);
}
.apg-cell.empty {
  border-style: dashed;
  border-color: var(--line);
  background: transparent;
}
.apg-cell.empty .apg-emo {
  opacity: 0.35;
}
/* ⚠️ UNE CASE VIDE N'EST PAS FORCÉMENT UN MANQUE : il n'y a peut-être rien de sa lignée en
   stock, ou tout est trop rare pour sa classe. Celle qu'une pièce ATTEND se distingue — sans
   ça, « il me manque une arme » se lit comme une panne de l'auto-équipement (constaté sur le
   compte réel). Accent, pas rouge : c'est quelque chose à FAIRE, pas une alerte. */
.apg-cell.empty.pending {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.apg-cell.empty.pending .apg-emo {
  opacity: 0.85;
}
.apg-emo {
  font-size: 17px;
  line-height: 1.1;
}
.apg-rk {
  max-width: 100%;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--gc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ap-name {
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 🏅 LA PASTILLE DE RARETÉ : fond teinté, contour net, majuscules — elle doit se lire
   d'un coup d'œil dans une grille de portraits, pas se deviner à la nuance d'un cercle.
   ⚠️ ELLE N'AVAIT JAMAIS ÉTÉ POSÉE (v0.959, vérifié dans le commit) : le patch avait
   ajouté le <div class="ap-rar"> au template SANS sa règle de style — la « pastille »
   n'était qu'une ligne de texte nue. Et le banc de l'époque réécrivait la CSS à la main,
   donc il montrait une pilule qui n'existait pas dans le fichier. Un banc qui ne LIT pas
   la vraie feuille de style n'est pas un témoin. */
.ap-rar {
  margin-top: 2px;
  align-self: stretch;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--nom-c);
  background: color-mix(in srgb, var(--nom-c) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--nom-c) 55%, transparent);
  border-radius: 999px;
  padding: 2px 6px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
/* ✨ Dans la teinte que le Codex donne déjà à l’Éveil : même notion, même couleur. */
.ap-awk {
  color: var(--accent);
  margin-left: 4px;
}
.ap-sub,
.ap-state {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.3;
}
@media (prefers-reduced-motion: reduce) {
  .ap-frame {
    box-shadow: none;
  }
}
</style>
