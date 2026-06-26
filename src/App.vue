<template>
  <router-view />
  <FeedbackFab />
  <VersionBadge />
</template>

<script setup lang="ts">
import VersionBadge from '@/components/VersionBadge.vue';
import FeedbackFab from '@/components/FeedbackFab.vue';
</script>
