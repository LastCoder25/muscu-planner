<template>
  <!-- ⚔️ Rapport d'un groupe de camp : faction, abattus, ce que l'escorte coûte et rapporte,
       puis le détail REPLIABLE de chacun et le journal. Toute la règle vit dans
       `partyReport` (lib, testée) ; ce composant ne fait que peindre.
       ⚠️ Aucune ferraille : un camp n'en donne jamais, le rapport n'en parle pas. -->
  <div class="pr">
    <div class="pr-head">
      <span class="pr-emo">{{ r.factionEmoji }}</span>
      <div class="pr-main">
        <div class="pr-title font-display">
          {{ r.factionLabel }} · {{ r.win ? 'camp pris' : 'repoussé' }}
        </div>
        <div class="pr-sub">
          ⚔️ {{ r.slain }}/{{ r.foes }} abattus<template v-if="r.hero">
            · 🧝 {{ r.heroKills }} par le héros</template
          >
        </div>
      </div>
    </div>

    <div v-if="r.pieces || r.wages" class="pr-pills">
      <span v-if="r.pieces" class="pr-pill">
        🗡️ {{ r.pieces }} pièce{{ r.pieces > 1 ? 's' : '' }} d’aventurier
      </span>
      <span v-if="r.wages" class="pr-pill pr-wage">🪙 −{{ r.wages }} salaires</span>
    </div>

    <q-expansion-item
      v-if="r.members.length || r.journal.length"
      dense
      dense-toggle
      switch-toggle-side
      class="pr-exp"
      header-class="pr-exp-head"
    >
      <template #header>
        <div class="pr-exp-title">
          <template v-if="r.members.length">
            ⚔️ {{ r.members.length }} aventurier{{ r.members.length > 1 ? 's' : '' }}
          </template>
          <template v-else>📜 Le récit du combat</template>
          <span v-if="r.members.length" class="pr-exp-xp">+{{ r.totalXp }} XP</span>
        </div>
      </template>
      <ul v-if="r.members.length" class="pr-list">
        <li v-for="m in r.members" :key="m.id" class="pr-row" :class="{ gone: m.gone }">
          <span class="pr-m-emo">{{ m.emoji }}</span>
          <span class="pr-m-name">{{ m.name }}</span>
          <span v-if="m.hurt" class="pr-m-hurt" title="Tombé : à l'infirmerie">🤕</span>
          <span v-if="m.kills" class="pr-m-kills">⚔️ {{ m.kills }}</span>
          <span class="pr-m-xp">+{{ m.xp }} XP</span>
        </li>
      </ul>
      <ol v-if="r.journal.length" class="pr-journal">
        <li v-for="(l, i) in r.journal" :key="i">{{ l }}</li>
      </ol>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { partyReport } from '@/lib/party';
import type { PartyResult } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const props = defineProps<{ party: PartyResult; roster: readonly Adventurer[] }>();
const r = computed(() => partyReport(props.party, props.roster));
</script>

<style scoped lang="scss">
.pr {
  color: var(--text);
  margin-top: 8px;
  text-align: left;
  min-width: 0;
}
.pr-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pr-emo {
  font-size: 24px;
}
.pr-main {
  min-width: 0;
  flex: 1;
}
.pr-title {
  font-size: 15px;
  font-weight: 600;
}
.pr-sub {
  font-size: 12.5px;
  color: var(--dim);
}
.pr-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.pr-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 12.5px;
  font-weight: 700;
}
.pr-wage {
  color: var(--dim);
  font-weight: 600;
}
.pr-exp {
  margin-top: 6px;
  border-top: 1px solid var(--line-soft);
}
:deep(.pr-exp-head) {
  min-height: 44px;
  padding: 0 4px;
}
.pr-exp-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}
.pr-exp-xp {
  margin-left: auto;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.pr-list {
  list-style: none;
  margin: 0;
  padding: 0 4px;
}
.pr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  font-size: 13px;
  &.gone {
    color: var(--dim);
  }
}
.pr-m-emo {
  width: 22px;
  text-align: center;
}
.pr-m-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pr-m-kills {
  color: var(--dim);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pr-m-xp {
  margin-left: auto;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pr-journal {
  margin: 6px 0 4px;
  padding-left: 22px;
  font-size: 12px;
  color: var(--dim);
  max-height: 180px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
</style>
