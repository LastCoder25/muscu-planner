<template>
  <router-view />
  <FeedbackFab />
  <VersionBadge />
  <RankUpCelebration
    :show="rankUpShow"
    :from-rank="rankUpFrom"
    :to-rank="rankUpTo"
    @close="rankUpClose"
  />
  <AthleteLevelUp
    :show="alShow"
    :from-level="alFrom"
    :to-level="alTo"
    :tier="alTier"
    :tier-color="alColor"
    @close="alClose"
  />
</template>

<script setup lang="ts">
import VersionBadge from '@/components/VersionBadge.vue';
import FeedbackFab from '@/components/FeedbackFab.vue';
import RankUpCelebration from '@/components/RankUpCelebration.vue';
import AthleteLevelUp from '@/components/AthleteLevelUp.vue';
import { useBodyReminder } from '@/composables/useBodyReminder';
import { useChallengeReminder } from '@/composables/useChallengeReminder';
import { useRankUp } from '@/composables/useRankUp';
import { useAthleteLevelUp } from '@/composables/useAthleteLevelUp';

useBodyReminder();
useChallengeReminder();
const {
  show: rankUpShow,
  fromRank: rankUpFrom,
  toRank: rankUpTo,
  close: rankUpClose,
} = useRankUp();
const {
  show: alShow,
  fromLevel: alFrom,
  toLevel: alTo,
  tier: alTier,
  tierColor: alColor,
  close: alClose,
} = useAthleteLevelUp();
</script>
