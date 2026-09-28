<template>
  <!-- 🗂️ LA FICHE DU LIEU (demandé : « toutes ses infos dans une grande tuile propre, au-dessus
       du choix des membres ») : ce qui s'y trouve, ce que ça rapporte, ce que ça coûte et ce qu'on
       risque, EN UN SEUL ENDROIT. ⚠️ Composant d'AFFICHAGE : aucune valeur n'est calculée ici,
       la page lui passe les MÊMES `computed` que l'envoi applique (`poiFacts`, `poiSub`). -->
  <div class="poi-card" :style="{ '--rk': held ? HELD_COLOR : rank.color }">
    <div class="pc-head">
      <span v-if="isRiftPoi(poi)" class="pc-emo pc-rift">
        <RiftPortal :color="rank.color" :seed="seedOf(poi.id)" />
      </span>
      <span v-else class="pc-emo">{{ poiEmo(poi) }}</span>
      <div class="pc-main">
        <!-- 🏅 LE RANG À CÔTÉ DU NOM : la boule de la carte dit déjà la couleur, la fiche
             dit le rang en toutes lettres, étoiles comprises (`poiRank`). -->
        <div class="pc-title font-display">
          {{ poiLabel(poi) }}
        </div>
        <!-- 📐 SOUS LE NOM, EN UNE LIGNE (demandé) : QUI on affronte, COMBIEN, à quel niveau,
             et CE QU'ON Y GAGNE — plutôt que des pastilles « Faction », « Ennemis » et un
             bloc « Récompense » à part. -->
        <div class="pc-sub">
          <span v-if="sub.foe">{{ sub.foe }}</span>
          <span v-if="!held">niv {{ poi.level }}</span>
          <span class="pc-res">🎁 {{ sub.res }}</span>
        </div>
        <div class="pc-tags">
          <span
            v-if="!held"
            class="sh-rank"
            :title="
              isRift
                ? 'Rang de la faille — fixé à son apparition, il ne monte pas avec l’âge'
                : 'Difficulté du lieu — le niveau de ses ennemis ET leur nombre réunis'
            "
            >{{ rank.emoji }} {{ rank.name }} {{ rankStarStr(rank.star) }}</span
          >
        </div>
      </div>
      <button class="sh-x" aria-label="Fermer" @click="emit('close')">✕</button>
    </div>

    <div class="pc-grid">
      <span v-for="f in factsInfo" :key="f.label" class="pc-fact" :class="f.cls" :title="f.title">
        <span class="pc-fact-lab">{{ f.icon }} {{ f.label }}</span>
        <span class="pc-fact-val">{{ f.value }}</span>
      </span>
    </div>
    <!-- ⏱️🎯 TRAJET ET RÉUSSITE SUR UNE MÊME LIGNE (demandé) : ce sont les deux chiffres qu'on
         compare d'un lieu à l'autre, ils ne doivent pas se séparer au gré du retour à la
         ligne des autres pastilles. Libellés courts pour tenir côte à côte à 344 px. -->
    <div v-if="factsGo.length" class="pc-go">
      <span v-for="f in factsGo" :key="f.label" class="pc-fact" :class="f.cls" :title="f.title">
        <span class="pc-fact-lab">{{ f.icon }} {{ f.label }}</span>
        <span class="pc-fact-val">{{ f.value }}</span>
      </span>
    </div>

    <!-- 🕳️ DEUX CAUSES, DEUX MESSAGES — « route dangereuse » est tirée au spawn : on la
         subit, on choisit ailleurs. L'embuscade d'une faille (v0.1009) se PRÉVIENT —
         refermer ses failles avant 7 jours — puis s'attend : elle dure deux jours. -->
    <div v-if="poi.riftPeril" class="pc-alert">
      🕳️ Monstres embusqués, sortis d'une faille — embuscades doublées<template v-if="ambushLeft">
        encore {{ formatDuration(ambushLeft) }}</template
      >
    </div>
    <div v-else-if="poi.perilous" class="pc-alert">
      ⚠️ Route dangereuse — embuscades doublées, butin renforcé
    </div>

    <!-- ⓘ L'explication d'une faille est REPLIÉE : elle faisait cinq lignes à chaque ouverture. -->
    <details v-if="isRift" class="pc-more">
      <summary>ⓘ Comment marche une faille</summary>
      <p class="pc-note">
        Y entrer est gratuit — ni mana ni énergie : ce qu’on paie, c’est le temps du héros. Les
        monstres abattus rendent du 💠 même si l’incursion échoue ; refermer la faille ajoute la
        prime du gardien. En cas de défaite, tout le groupe part à l’infirmerie. Laissée mûrir, elle
        déborde : une partie de ses monstres s’embusque deux jours autour d’elle, le reste marche
        sur ta base, et il ne reste qu’une petite 💠 mine résiduelle.
      </p>
    </details>
    <!-- 🧿 LE SCEAU DE BRÈCHE se pose ICI, sur la faille — il n'accompagne aucun voyage. -->
    <template v-if="isRift">
      <p v-if="poi.sealed" class="pc-note">🧿 Scellée : cette faille a déjà reçu son répit.</p>
      <button
        v-else-if="sealStock > 0"
        type="button"
        class="sup-seal"
        :disabled="busySeal"
        @click="emit('seal')"
      >
        🧿 Poser un sceau de brèche — 24 h de répit ({{ sealStock }} en stock)
      </button>
    </template>
    <!-- ⚔️ BANDE EN MARCHE : ce qu'on y gagne est une PERTE ÉVITÉE, et on DIT quand ça
         n'en évite plus aucune (renfort figé au tirage de l'armée, `Raid.overflow`). -->
    <template v-if="warband">
      <p v-if="warband.utile" class="pc-note">
        ⚔️ La disperser <b>évite le renfort ×1,3</b> du prochain siège — soit 30 à 40 points de
        tenue. Le 💠 n'est qu'un lot de consolation. En cas de défaite, tout le groupe part à
        l'infirmerie.
      </p>
      <p v-else class="pc-note warn">
        ⚠️ <b>Trop tard pour le renfort</b> : leur armée est déjà annoncée à tes portes et garde la
        force que la Tour de guet a montrée. L'intercepter ne rapportera plus que du 💠.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RiftPortal from '@/components/RiftPortal.vue';
import { seedOf } from '@/lib/combat';
import { isRiftPoi, poiEmo, poiLabel, type Poi } from '@/lib/expedition';
import { rankStarStr } from '@/lib/characterRank';
import { formatDuration } from '@/lib/duration';
import type { PoiFact } from '@/lib/poiFacts';
import type { poiRank } from '@/lib/poiRank';
import { HELD_COLOR, isHeldControl } from '@/lib/controlPoints';

const props = defineProps<{
  poi: Poi;
  rank: ReturnType<typeof poiRank>;
  /** La ligne sous le nom : les ennemis et la ressource. */
  sub: { foe: string; res: string };
  facts: PoiFact[];
  /** Temps restant d'une embuscade de faille autour du lieu (ms), 0 sinon. */
  ambushLeft: number;
  isRift: boolean;
  /** Une bande en marche : `utile` = l'intercepter évite encore le renfort du siège. */
  warband: { utile: boolean } | null;
  sealStock: number;
  busySeal: boolean;
}>();
// 🏳️ Tenu : neutre — pas de rang, pas de niveau (il produit au niveau du héros).
const held = computed(() => isHeldControl(props.poi));
const emit = defineEmits<{ close: []; seal: [] }>();

// ⏱️🎯 Trajet et réussite vivent sur leur propre ligne (`go`) : les deux chiffres qu'on compare.
const factsInfo = computed(() => props.facts.filter((f) => !f.go));
const factsGo = computed(() => props.facts.filter((f) => f.go));
</script>

<style scoped lang="scss">
/* ── 🗂️ LA FICHE DU LIEU — une grande tuile, teintée par le RANG du lieu (`--rk`) ── */
/* Contour appuyé (2 px, couleur du rang à 75 %) et marges latérales : collée au bord de
   l'écran et cerclée d'un trait pâle, la tuile se lisait mal comme un bloc (demandé). */
.poi-card {
  margin: 4px 10px 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 2px solid color-mix(in srgb, var(--rk) 75%, var(--line));
  background:
    radial-gradient(
      120% 90% at 0% 0%,
      color-mix(in srgb, var(--rk) 16%, transparent),
      transparent 60%
    ),
    var(--surface);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pc-rift {
  padding: 4px 0;
}
.pc-emo {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  font-size: 26px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--rk) 22%, var(--bg));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--rk) 60%, transparent);
}
.pc-main {
  flex: 1;
  min-width: 0;
}
.pc-title {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.15;
}
.pc-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 2px;
}
/* 🏅 Le rang du lieu : la pastille prend la COULEUR DU RANG, posée en ligne (`--rk`) — une
   classe par rang n'aurait aucun sens ici, le rang est calculé. */
.sh-rank {
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--rk);
  color: var(--rk);
  background: color-mix(in srgb, var(--rk) 14%, transparent);
  white-space: nowrap;
}
/* La ligne sous le nom : ennemis · niveau · ressource, séparés par un point médian. Elle se
   replie proprement (flex-wrap) au lieu de déborder à 344 px. */
.pc-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  margin-top: 1px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dim);
  line-height: 1.35;
}
.pc-sub > span + span::before {
  content: '·';
  margin-right: 6px;
  color: var(--line);
}
.pc-res {
  color: var(--text);
}
/* Les caractéristiques en pastilles qui se rangent à la suite : « libellé  valeur » sur UNE
   ligne. `max-width: 100%` + `flex-wrap` : une pastille trop longue passe à la ligne en
   elle-même au lieu de faire déborder la fiche à 344 px. */
.pc-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}
.pc-go {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}
.pc-go .pc-fact {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}
.pc-fact {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 5px;
  max-width: 100%;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--line);
}
.pc-fact-lab {
  font-size: 11px;
  font-weight: 600;
  color: var(--dim);
}
.pc-fact-val {
  font-family: 'Oswald', sans-serif;
  font-size: 13.5px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.pc-fact.dim .pc-fact-val {
  font-family: inherit;
  font-size: 11.5px;
  color: var(--dim);
}
.pc-fact.warn .pc-fact-val {
  color: var(--d3);
}
.pc-fact.wp-good .pc-fact-val {
  color: #7bc86c;
}
.pc-fact.wp-mid .pc-fact-val {
  color: #ffb23f;
}
.pc-fact.wp-bad .pc-fact-val {
  color: #ff6a45;
}
.pc-alert {
  margin-top: 7px;
  padding: 6px 9px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--d3);
  background: color-mix(in srgb, var(--d3) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--d3) 50%, transparent);
}
.pc-more {
  margin-top: 6px;
}
.pc-more > summary {
  min-height: 32px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--dim);
  cursor: pointer;
  list-style: none;
}
.pc-more > summary::-webkit-details-marker {
  display: none;
}
.pc-more .pc-note {
  margin-top: 2px;
}
.pc-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--dim);
}
.pc-note.warn {
  color: var(--d3);
}
.sup-seal {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  border: 1px solid #b57bff;
  border-radius: 10px;
  background: rgba(181, 123, 255, 0.12);
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.sup-seal:disabled {
  opacity: 0.5;
  cursor: default;
}
.sh-x {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.wp-good {
  color: #7bc86c;
  border-color: #7bc86c;
}
.wp-mid {
  color: #ffb23f;
  border-color: #ffb23f;
}
.wp-bad {
  color: #ff6a45;
  border-color: #ff6a45;
}
</style>
