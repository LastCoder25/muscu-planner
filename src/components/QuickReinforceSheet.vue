<template>
  <!-- ➕ LE RENFORT DIRECT (2026-09-29, demandé : « cliquer sur un slot de garnison libre et
       directement envoyer un renfort, sans aller dans la gestion du lieu »). Ouvert depuis
       une case libre de la liste des places fortes. UN TOUCHER ENVOIE : une case = un
       renfort. ⚠️ Aucune règle ici — la page passe qui peut partir et le store refuse ce qui
       ne passe pas (`reinforceControlPoint`, `sendMilitiaToControl`), comme la fiche du lieu. -->
  <q-dialog
    :model-value="!!poi"
    position="bottom"
    @update:model-value="(v) => !v && emit('close')"
  >
    <div v-if="poi && poi.control" class="qr">
      <div class="qr-head">
        <span class="qr-title"
          >➕ Renfort · {{ CONTROL_EMO[poi.control.kind] }}
          {{ CONTROL_LABEL[poi.control.kind] }}</span
        >
        <button type="button" class="qr-x" aria-label="Fermer" @click="emit('close')">✕</button>
      </div>
      <p class="qr-sub">
        {{ champFree }} place{{ champFree > 1 ? 's' : '' }} de champion ·
        {{ milFree }} au total · un toucher l’envoie
      </p>
      <!-- 🛡️ Le milicien d'abord : c'est le renfort qu'on a le plus souvent sous la main, et il
           ne prend la place d'aucun champion qui aurait mieux à faire ailleurs. -->
      <button
        v-if="milFree > 0 && milHome > 0"
        type="button"
        class="qr-mil"
        :disabled="busy"
        @click="emit('militia')"
      >
        <span class="qr-mil-emo">{{ MILITIA_EMO }}</span>
        <span class="qr-mil-main">
          <span class="qr-mil-name">Un {{ MILITIA_NAME.toLowerCase() }}</span>
          <span class="qr-mil-sub"
            >{{ milHome }} à la base · 🧭 {{ formatDurationMin(militiaMin) }}</span
          >
        </span>
      </button>
      <template v-if="champFree > 0">
        <p class="qr-cap">🧑 Un champion</p>
        <div v-if="champs.length" class="qr-pick">
          <AdvPickTile
            v-for="a in champs"
            :key="a.id"
            :adv="a"
            :on="false"
            :reason="busy ? '…' : null"
            @toggle="emit('champion', a.id)"
          />
        </div>
        <p v-else class="qr-none">Aucun champion disponible pour l’instant.</p>
      </template>
      <p v-else class="qr-none">
        Plus de place de champion ici : seuls des miliciens peuvent encore la compléter.
      </p>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import AdvPickTile from '@/components/AdvPickTile.vue';
import type { Adventurer } from '@/lib/adventurers';
import { CONTROL_EMO, CONTROL_LABEL } from '@/lib/controlPoints';
import type { Poi } from '@/lib/expedition';
import { MILITIA_EMO, MILITIA_NAME } from '@/lib/militia';
import { formatDurationMin } from '@/lib/duration';

defineProps<{
  poi: Poi | null;
  /** Les champions disponibles, déjà triés (le même ordre que la fiche du lieu). */
  champs: Adventurer[];
  champFree: number;
  /** Places libres de la garnison entière (miliciens compris). */
  milFree: number;
  milHome: number;
  militiaMin: number;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; champion: [string]; militia: [] }>();
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
.qr-none {
  color: var(--dim);
  font-size: 13px;
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
  cursor: pointer;
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
</style>
