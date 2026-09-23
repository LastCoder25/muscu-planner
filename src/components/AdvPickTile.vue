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
    :class="{ on, off: !!reason }"
    :disabled="!!reason"
    :aria-pressed="on"
    @click="emit('toggle')"
  >
    <!-- 🖼️ SON PORTRAIT, comme partout où un champion se montre (tirage, Guilde, Codex).
         Le repli reste son emoji : un aventurier legacy n'en a pas. -->
    <span class="ca-emo"
      ><ChampionPortrait :champion-id="adv.championId">{{
        advTitle(adv)?.emoji ?? '🧑'
      }}</ChampionPortrait></span
    >
    <span class="ca-name">{{ adv.name }}</span>
    <!-- 🏅 CE QU'IL EST (sa rareté TIRÉE, immuable) plutôt que son rang, qui est déjà dit
         par les étoiles juste en dessous. C'est l'identité d'un champion, et elle ne se
         lisait nulle part hors du Codex (v0.959). Un aventurier LEGACY garde son rang :
         il n'a pas d'autre identité. -->
    <span class="ca-rar" :style="{ color: rar.color }">{{ rar.label }}</span>
    <span class="ca-rank" :style="{ color: rank.color }">{{ rankStarStr(rank.star) }}</span>
    <!-- ✨ Son Éveil : jusqu'à +48 % de stats. On compose une escorte ici, et il ne se
         lisait qu'au tirage et dans le Codex. Compact (deux tuiles par ligne) : la fiche
         de la Guilde donne le /6. -->
    <span v-if="awaken" class="ca-awk">✨{{ awaken }}</span>
    <!-- 🔮 CE QU'IL VA GAGNER ICI (demandé) : on choisissait une destination sans savoir que,
         selon elle, un champion apprend du simple au quadruple. ⚠️ ATTÉNUÉ quand le lieu est
         SOUS son niveau — c'est là que l'apprentissage chute, et c'est la règle que personne
         ne pouvait deviner. La prime de retard, elle, est une bonne nouvelle : en vert. -->
    <span v-if="xp && !reason" class="ca-xp" :class="{ low: !xp.full }" :title="xpWhy">
      +{{ xp.xp }} XP<b v-if="xp.catchUp > 1">×{{ fmtMult(xp.catchUp) }}</b>
    </span>
    <!-- Indisponible : on DIT pourquoi au lieu de cacher la tuile (la règle est celle du
         store, `advUnavailableReason`). -->
    <span v-if="reason" class="ca-why">{{ reason }}</span>
    <span v-else-if="badges.length" class="ca-skills">
      <span
        v-for="(b, i) in badges"
        :key="i"
        class="ca-skill"
        :class="{ sig: !b.role }"
        :title="b.what"
        >{{ b.emoji }}<b v-if="b.level > 1">{{ b.level }}</b></span
      >
    </span>
    <span v-else class="ca-none">stat brute</span>
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
import { rankStarStr } from '@/lib/characterRank';
import type { MissionXpPreview } from '@/lib/caravan';

const props = defineProps<{
  adv: Adventurer;
  on: boolean;
  reason?: string | null;
  /** Ce qu'il gagnerait sur le lieu visé (absent = on ne vise rien, ex. la Guilde). */
  xp?: MissionXpPreview | null;
}>();
/** Un multiplicateur se lit « ×2 » ou « ×2,5 », jamais « ×2.50 ». */
const fmtMult = (m: number) => (Math.round(m * 10) / 10).toString().replace('.', ',');
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
  parts.push('Socle si la mission réussit ; les ennemis abattus s’y ajoutent.');
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
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 10px 6px 9px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  min-height: 44px;
  cursor: pointer;
}
.car-adv.on {
  border-color: var(--accent);
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.16), #1d1913 65%);
}
/* Indisponible : lisible (on doit lire POURQUOI), mais visiblement hors jeu. */
.car-adv.off {
  cursor: default;
  border-style: dashed;
  opacity: 0.6;
}
/* En GRAND (demandé) : deux tuiles par ligne, le portrait est ce qu'on reconnaît. */
.ca-emo {
  font-size: 40px;
  line-height: 1;
}
.ca-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* La rareté de classe : mêmes mots et mêmes couleurs que la Guilde et que le butin. */
.ca-rar {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  text-transform: capitalize;
  max-width: 100%;
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
.ca-rank {
  font-size: 12px;
  letter-spacing: -0.5px;
  line-height: 1;
}
/* Les compétences en icônes : à 344 px, seule l’icône tient. Le libellé complet reste
   au survol, et la fiche de la Guilde le donne en toutes lettres. */
.ca-skills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
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
.ca-why {
  font-size: 11.5px;
  line-height: 1.1;
  color: var(--text);
  text-align: center;
}
</style>
