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
</template>

<script setup lang="ts">
import VersionBadge from '@/components/VersionBadge.vue';
import FeedbackFab from '@/components/FeedbackFab.vue';
import RankUpCelebration from '@/components/RankUpCelebration.vue';
import { useBodyReminder } from '@/composables/useBodyReminder';
import { useChallengeReminder } from '@/composables/useChallengeReminder';
import { useRankUp } from '@/composables/useRankUp';

useBodyReminder();
useChallengeReminder();
const {
  show: rankUpShow,
  fromRank: rankUpFrom,
  toRank: rankUpTo,
  close: rankUpClose,
} = useRankUp();
</script>
