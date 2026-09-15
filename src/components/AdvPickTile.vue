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
    <span class="ca-emo">{{ advTitle(adv)?.emoji ?? '🧑' }}</span>
    <span class="ca-name">{{ adv.name }}</span>
    <span class="ca-rar" :style="{ color: rank.color }">{{ rank.emoji }} {{ rank.name }}</span>
    <span class="ca-rank" :style="{ color: rank.color }">{{ rankStarStr(rank.star) }}</span>
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
import { advBadges, advRank, advTitle, type Adventurer } from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';

const props = defineProps<{ adv: Adventurer; on: boolean; reason?: string | null }>();
const emit = defineEmits<{ toggle: [] }>();
const rank = computed(() => advRank(props.adv));
const badges = computed(() => advBadges(props.adv));
</script>

<style scoped lang="scss">
.car-adv {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
  padding: 7px 4px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 10px;
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
.ca-emo {
  font-size: 20px;
}
.ca-name {
  font-size: 11px;
  color: var(--dim);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* La rareté de classe : mêmes mots et mêmes couleurs que la Guilde et que le butin. */
.ca-rar {
  font-size: 9px;
  line-height: 1.1;
  text-transform: capitalize;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Les étoiles : le travail de terrain, dans la teinte de son rang. */
.ca-rank {
  font-size: 9px;
  letter-spacing: -0.5px;
  line-height: 1;
}
/* Les compétences en icônes : à 344 px, seule l’icône tient. Le libellé complet reste
   au survol, et la fiche de la Guilde le donne en toutes lettres. */
.ca-skills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px;
  line-height: 1;
}
.ca-skill {
  font-size: 11px;
}
.ca-skill b {
  font-size: 8px;
  color: var(--accent);
  vertical-align: super;
}
/* Une signature ne sert qu’en cas d’embuscade : elle compte moins qu’un rôle sur un
   convoi, et son opacité le dit sans ajouter un mot. */
.ca-skill.sig {
  opacity: 0.65;
}
.ca-none {
  font-size: 9px;
  color: var(--dim);
  opacity: 0.6;
}
.ca-why {
  font-size: 9.5px;
  line-height: 1.1;
  color: var(--text);
  text-align: center;
}
</style>
