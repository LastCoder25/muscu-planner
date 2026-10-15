<template>
  <!-- 🧑 Une tuile d'aventurier à choisir pour un voyage (convoi OU groupe de camp).
       ⚠️ UN SEUL dessin pour les deux feuilles : deux copies de « comment on présente un
       aventurier qu'on envoie » finiraient par diverger (déjà arrivé aux balistes du siège).
       ⚠️ LE RANG ET LES COMPÉTENCES, demandés par l’utilisateur : on choisissait son escorte
       sur un prénom, alors que ce sont les RÔLES qui décident. Le rang est celui du joueur,
       les étoiles la progression de son niveau dedans, et le NIVEAU reste caché — comme dans
       la Guilde. Le nom du rang est ÉCRIT, pas seulement teinté : la couleur seule ne se lit
       pas. -->
  <button
    type="button"
    class="car-adv"
    :class="{ on: on && !readonly, off: !!reason, ro: readonly }"
    :disabled="!!reason"
    :aria-pressed="readonly ? undefined : on"
    :tabindex="readonly ? -1 : undefined"
    :style="{ '--rc': rar.color }"
    :title="`Rareté ${rar.label}`"
    @click="readonly || emit('toggle')"
  >
    <!-- 🖼️ SON PORTRAIT, comme partout où un champion se montre (tirage, Guilde, Codex).
         Le repli reste son emoji : un aventurier legacy n'en a pas. -->
    <span class="ca-emo"
      ><ChampionPortrait :champion-id="adv.championId">{{
        advTitle(adv)?.emoji ?? '🧑'
      }}</ChampionPortrait></span
    >
    <!-- 📐 EN LIGNE (demandé : « bcp de choses à défiler ») : le portrait à gauche garde sa
         taille, les infos s'empilent à droite — la tuile passe de ~170 à ~80 px de haut. -->
    <!-- 🏅 CE QU'IL EST (sa rareté TIRÉE, immuable) se lit au CONTOUR de la tuile (demandé :
         la pastille du coin prenait la place du nom). Le mot reste au survol et pour les
         lecteurs d'écran. -->
    <span class="ca-sr">Rareté {{ rar.label }}</span>
    <span class="ca-body">
      <span class="ca-name">{{ adv.name }}</span>
      <span class="ca-line">
        <!-- 🏅 SON RANG, écrit en toutes lettres dans sa couleur, avec ses étoiles (demandé :
             « je vois la rareté mais pas le rang »). « N★ » comme sur le portrait de la Guilde :
             cinq étoiles ne tiennent pas à côté de « Divin ancestral » à 344 px. Le NOM se
             tronque, jamais les étoiles. -->
        <span
          class="ca-rank"
          :style="{ '--rk': rank.color }"
          :title="`Rang ${rank.name} · ${rank.star}/5 ★`"
          ><span class="ca-rk-name">{{ rank.name }}</span
          ><span class="ca-rk-star">{{ rank.star }}★</span></span
        >
        <!-- ✨ Son Éveil : jusqu'à +48 % de stats. On compose une escorte ici, et il ne se
         lisait qu'au tirage et dans le Codex. Compact (deux tuiles par ligne) : la fiche
         de la Guilde donne le /6. -->
        <span v-if="awaken" class="ca-awk">✨{{ awaken }}</span>
      </span>
      <!-- 🔮 CE QU'IL VA GAGNER ICI (demandé) : on choisissait une destination sans savoir que,
         selon elle, un champion apprend du simple au quadruple. ⚠️ ATTÉNUÉ quand le lieu est
         SOUS son niveau — c'est là que l'apprentissage chute, et c'est la règle que personne
         ne pouvait deviner. La prime de retard, elle, est une bonne nouvelle : en vert. -->
      <span
        v-if="(xp || gain != null || travelMin != null || tripDelta || haulDelta) && !reason"
        class="ca-row"
      >
        <!-- 🧭 SON TRAJET jusqu'au lieu visé (demandé : on le choisissait sans savoir quand il
             arriverait). -->
        <span v-if="travelMin != null" class="ca-trip" title="Trajet jusqu’au lieu"
          >🧭 {{ formatDurationMin(travelMin) }}</span
        >
        <span v-if="xp" class="ca-xp" :class="{ low: !xp.full }" :title="xpWhy">
          {{ xp.win != null && xp.win < 1 ? '≈' : '' }}+{{ xp.xp }} XP<b v-if="xp.catchUp > 1"
            >×{{ fmtMult(xp.catchUp) }}</b
          >
        </span>
        <!-- ⏱️ CE QU'IL CHANGE AU TRAJET (demandé : « comme le % de réussite ») : coché, ce que
             le groupe de son lieu perdrait ou gagnerait sans lui ; non coché, en l'ajoutant.
             Rien quand il ne change rien (un champion sans compétence de vitesse). -->
        <span v-if="tripDelta" class="ca-gain" :class="{ neg: tripDelta > 0 }" :title="tripWhy"
          >⏱️ {{ tripDelta < 0 ? '−' : '+' }}{{ formatDurationMin(Math.abs(tripDelta)) }}</span
        >
        <!-- 💰 CE QU'IL CHANGE À LA RÉCOLTE si le lieu est pris (demandé : « comme le % et le
             temps ») — porteur 🐫, pièce de cargaison. Rien quand il ne change rien. -->
        <span
          v-if="haulDelta"
          class="ca-gain"
          :title="
            on ? 'Ce que la récolte perdrait sans lui.' : 'Ce que la récolte gagnerait avec lui.'
          "
          >🎒 {{ haulDelta }}</span
        >
        <!-- 🎯 CE QU'IL APPORTE À LA RÉUSSITE, par rapport à l'équipe cochée (demandé) : coché,
             ce qu'on perdrait en le retirant ; non coché, ce qu'on gagnerait en l'ajoutant. -->
        <span
          v-if="gain != null"
          class="ca-gain"
          :class="{ zero: gain === 0, neg: gain < 0 }"
          :title="gainWhy"
          >🎯 {{ gain > 0 ? '+' : gain < 0 ? '−' : '' }}{{ Math.abs(gain) }} %</span
        >
      </span>
      <!-- Indisponible : on DIT pourquoi au lieu de cacher la tuile (la règle est celle du
         store, `advUnavailableReason`). -->
      <span v-if="reason" class="ca-why">{{ reason }}</span>
      <!-- ⏱️ Un avertissement qui ne BLOQUE pas (ex. trop tard pour croiser une armée sans boost). -->
      <span v-if="warn && !reason" class="ca-warn">{{ warn }}</span>
      <span v-else-if="badges.length" class="ca-skills">
        <span
          v-for="(b, i) in badges"
          :key="i"
          class="ca-skill"
          :class="{ sig: !b.role }"
          :title="b.what"
          >{{ b.emoji }}<b>{{ b.level }}</b></span
        >
      </span>
      <span v-else class="ca-none">stat brute</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import {
  advAwaken,
  advBadges,
  advGradeBadge,
  advRank,
  advTitle,
  type Adventurer,
} from '@/lib/adventurers';
import { formatDurationMin } from '@/lib/duration';
import type { MissionXpPreview } from '@/lib/caravan';

const props = defineProps<{
  adv: Adventurer;
  on: boolean;
  reason?: string | null;
  /** ⏱️ Un avertissement NON bloquant (la tuile reste cochable). */
  warn?: string | null;
  /** Ce qu'il gagnerait sur le lieu visé (absent = on ne vise rien, ex. la Guilde). */
  xp?: MissionXpPreview | null;
  /** 🎯 Ce qu'il apporte à la réussite sur le lieu visé, en points (`winGain`). */
  gain?: number | null;
  /** L'explication du chiffre 🎯, quand elle n'est pas celle d'une équipe à cocher (ex. la
   *  tenue d'un point fixe sans ce membre). */
  gainTitle?: string | null;
  /** 🧭 Son trajet jusqu'au lieu visé, en minutes (absent = rien à afficher). */
  travelMin?: number | null;
  /** ⏱️ Ce qu'il change à l'aller-retour de son lieu, en minutes (`memberTripDelta`).
   *  Négatif = plus rapide avec lui. */
  tripDelta?: number | null;
  /** 💰 Ce qu'il change à la récolte, déjà mis en forme (`formatHaulDelta`) ; vide = rien. */
  haulDelta?: string | null;
  /** Lecture seule : on MONTRE qui voyage, sans rien proposer de cocher. */
  readonly?: boolean;
}>();
/** Un multiplicateur se lit « ×2 » ou « ×2,5 », jamais « ×2.50 ». */
const fmtMult = (m: number) => (Math.round(m * 10) / 10).toString().replace('.', ',');
const gainWhy = computed(
  () =>
    props.gainTitle ??
    (props.on
      ? 'Ce que l’équipe perdrait en réussite sans lui.'
      : 'Ce qu’il ajouterait en réussite à l’équipe cochée.'),
);
const tripWhy = computed(() => {
  const d = props.tripDelta ?? 0;
  if (props.on)
    return d < 0
      ? 'Aller-retour plus court grâce à lui : sans lui, le groupe de son lieu irait moins vite.'
      : 'Il ralentit le groupe de son lieu : sans lui, l’aller-retour serait plus court.';
  return d < 0
    ? 'Aller-retour plus court si tu l’ajoutes (compétence ou pièce de vitesse).'
    : 'Aller-retour plus long si tu l’ajoutes : il marche moins vite que le groupe coché.';
});
const xpWhy = computed(() => {
  const x = props.xp;
  if (!x) return '';
  const parts = [
    x.full
      ? 'Ce lieu est à son niveau ou au-dessus : il apprend à plein.'
      : 'Ce lieu est SOUS son niveau : il apprend beaucoup moins. Envoie-le sur un lieu de son niveau ou plus.',
  ];
  if (x.catchUp > 1)
    parts.push(
      `Prime de retard ×${fmtMult(x.catchUp)} : un rang de retard double l'apprentissage.`,
    );
  if (x.win != null && x.win < 1)
    parts.push(
      `Pondéré par la chance de victoire (${Math.round(x.win * 100)} %) : +${x.xpWin} XP s’il gagne. Une défaite ne paie que ce qu’elle entame.`,
    );
  else parts.push('Socle si la mission réussit ; les ennemis abattus s’y ajoutent.');
  return parts.join(' ');
});
const emit = defineEmits<{ toggle: [] }>();
const rank = computed(() => advRank(props.adv));
const badges = computed(() => advBadges(props.adv));
const awaken = computed(() => advAwaken(props.adv));
/** 🎰 Sa lettre (S / A) — ce qu'on a invoqué. Source unique : `advGradeBadge`. */
const rar = computed(() => advGradeBadge(props.adv));
</script>

<style scoped lang="scss">
.car-adv {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 8px;
  text-align: left;
  background: #1d1913;
  /* 🏅 La rareté au CONTOUR (demandé) : elle fait ressortir la tuile sans lui voler de place.
     Repli sur le trait neutre si la couleur manque. */
  border: 2px solid var(--rc, var(--line));
  border-radius: 12px;
  color: var(--text);
  min-height: 44px;
  cursor: pointer;
  position: relative;
}
/* Coché : le contour GARDE la rareté ; la sélection se lit par le fond accent et un anneau
   accent à l'extérieur — deux signaux qui ne se recouvrent pas. */
.car-adv.on {
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.16), #1d1913 65%);
  box-shadow: 0 0 0 2px var(--accent);
}
.ca-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
/* Indisponible : lisible (on doit lire POURQUOI), mais visiblement hors jeu. */
.car-adv.ro {
  cursor: default;
}
.car-adv.off {
  cursor: default;
  border-style: dashed;
  opacity: 0.6;
}
/* En GRAND (demandé) : deux tuiles par ligne, le portrait est ce qu'on reconnaît. */
.ca-emo {
  flex: none;
  font-size: 40px;
  line-height: 1;
}
.ca-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}
.ca-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  max-width: 100%;
}
/* Le nom prend toute la largeur (plus de pastille dans le coin) et se tronque au besoin. */
.ca-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Les étoiles : le travail de terrain, dans la teinte de son rang. */
/* ✨ Même teinte que le Codex et la Guilde : une seule couleur pour l’Éveil. */
.ca-awk {
  font-size: 11px;
  line-height: 1;
  color: var(--accent);
}
/* Le rang en pastille à CONTOUR : même langage que la rareté du coin, mais sans fond, pour
   ne pas faire deux étiquettes pleines qui se disputent l'œil. */
.ca-rank {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--rk) 60%, transparent);
  color: var(--rk);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}
.ca-rk-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Les étoiles, séparées du nom par un filet, dans les chiffres de la charte. */
.ca-rk-star {
  flex: none;
  padding-left: 4px;
  border-left: 1px solid color-mix(in srgb, var(--rk) 45%, transparent);
  font-family: 'Oswald', sans-serif;
  font-weight: 600;
}
/* Les compétences en icônes : à 344 px, seule l’icône tient. Le libellé complet reste
   au survol, et la fiche de la Guilde le donne en toutes lettres. */
.ca-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  line-height: 1;
}
.ca-skill {
  font-size: 15px;
}
.ca-skill b {
  font-size: 10px;
  color: var(--accent);
  vertical-align: super;
}
/* Une signature ne sert qu’en cas d’embuscade : elle compte moins qu’un rôle sur un
   convoi, et son opacité le dit sans ajouter un mot. */
.ca-skill.sig {
  opacity: 0.65;
}
/* L'XP à gagner : c'est le chiffre qui décide d'une destination, il se lit avant les
   compétences. Accent = plein tarif ; atténué = le lieu est sous son niveau. */
.ca-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
}
/* 🎯 L'apport à la réussite : vert s'il aide, gris s'il n'y change rien, orange s'il nuit. */
.ca-gain {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--d1, #7bc86c);
  white-space: nowrap;
}
.ca-gain.zero {
  color: var(--dim);
  font-weight: 600;
}
.ca-gain.neg {
  color: var(--d3, #ffb23f);
}
.ca-trip {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: var(--text);
  white-space: nowrap;
}
.ca-xp {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
}
.ca-xp.low {
  color: var(--dim);
  font-weight: 600;
}
/* La prime de retard : un gain, donc la teinte du gain (celle du vert de la charte). */
.ca-xp b {
  margin-left: 3px;
  font-size: 10.5px;
  color: #7bc86c;
}
.ca-none {
  font-size: 11px;
  color: var(--dim);
  opacity: 0.6;
}
.ca-warn {
  font-size: 11px;
  line-height: 1.2;
  color: var(--d3);
}
.ca-why {
  font-size: 11.5px;
  line-height: 1.1;
  color: var(--text);
}
/* Z Fold plié (~344 px) : on reprend un peu de place sur le portrait et les marges plutôt que
   de tronquer le nom. */
@media (max-width: 379px) {
  .car-adv {
    gap: 6px;
    padding: 7px 6px;
  }
  .ca-emo {
    font-size: 32px;
  }
}
</style>
