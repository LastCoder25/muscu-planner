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
      <!-- 🛡️ La tenue À L'ATTAQUE, et ce que chaque renfort y ajoute (arrivée comprise). -->
      <p v-if="hold" class="qr-hold">
        🛡️ Repousse aujourd’hui environ <b>{{ hold.pct }} %</b>
        {{ hold.vsArmy ? 'face à l’armée en approche' : 'des assauts' }}
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
        <span class="qr-mil-emo"><MilitiaPortrait /></span>
        <span class="qr-mil-main">
          <span class="qr-mil-name">Un {{ MILITIA_NAME.toLowerCase() }}</span>
          <span class="qr-mil-sub"
            >{{ milHome }} à la base · 🧭 {{ formatDurationMin(militiaMin)
            }}<template v-if="hold"> · 🎯 {{ sign(hold.mil) }} %</template></span
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
            :gain="hold?.champ[a.id] ?? null"
            :reason="busy ? '…' : null"
            @toggle="emit('champion', a.id)"
          />
        </div>
        <p v-else class="qr-none">Aucun champion disponible pour l’instant.</p>
      </template>
      <p v-else class="qr-none">
        Plus de place de champion ici : seuls des miliciens peuvent encore la compléter.
      </p>
      <!-- ⇄ DEPUIS UN AUTRE LIEU (demandé : « faire venir un champion ou milicien d'un autre
           lieu fixe »). Seuls ceux dont le transfert passe (`transferSourcesFor`) ; un toucher
           le fait partir directement de son point, sans repasser par la base. -->
      <template v-if="sources.length">
        <p class="qr-cap">⇄ Depuis un autre lieu</p>
        <div v-for="s in sources" :key="s.fromId" class="qr-src">
          <p class="qr-src-name">{{ s.emo }} {{ s.label }}</p>
          <div class="qr-pick">
            <button
              v-for="m in s.members"
              :key="m.id"
              type="button"
              class="qr-mem"
              :disabled="busy"
              @click="emit('transfer', s.fromId, m.id)"
            >
              <span class="qr-mem-emo"
                ><ChampionPortrait v-if="m.adv" :champion-id="m.adv.championId">{{
                  advTitle(m.adv)?.emoji ?? '🧑'
                }}</ChampionPortrait
                ><MilitiaPortrait v-else /></span
              >
              <span class="qr-mem-main">
                <span class="qr-mem-name">{{ m.adv ? m.adv.name : MILITIA_NAME }}</span>
                <span class="qr-mem-sub"
                  >🧭 {{ formatDurationMin(m.min)
                  }}<template v-if="hold && hold.trans[m.id] !== undefined">
                    · 🎯 {{ sign(hold.trans[m.id]!) }} %</template
                  ></span
                >
              </span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import AdvPickTile from '@/components/AdvPickTile.vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { advTitle, type Adventurer } from '@/lib/adventurers';
import { CONTROL_EMO, CONTROL_LABEL } from '@/lib/controlPoints';
import type { Poi } from '@/lib/expedition';
import { MILITIA_NAME } from '@/lib/militia';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
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
  /** ⇄ Les autres points tenus et ceux qui peuvent en venir (avec leur trajet). */
  sources: {
    fromId: string;
    emo: string;
    label: string;
    members: { id: string; adv: Adventurer | null; min: number }[];
  }[];
  busy: boolean;
  /** 🎯 La tenue à l'attaque (%) et ce que chaque renfort y ajoute, en points. */
  hold: {
    pct: number;
    /** Jugée contre l'armée en approche (visible), pas contre le pire cas. */
    vsArmy?: boolean;
    mil: number;
    champ: Record<string, number>;
    trans: Record<string, number>;
  } | null;
}>();
/** « +12 », « −3 », « 0 » : un écart se lit avec son signe. */
const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const emit = defineEmits<{
  close: [];
  champion: [string];
  militia: [];
  transfer: [string, string];
}>();
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
.qr-hold {
  margin: 4px 0 8px;
  font-size: 12.5px;
  color: var(--d1, #7bc86c);
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
.qr-src {
  margin-bottom: 10px;
}
.qr-src-name {
  margin: 0 0 6px;
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
}
.qr-mem {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.qr-mem:disabled {
  opacity: 0.5;
}
.qr-mem-emo {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  overflow: hidden;
  font-size: 22px;
}
.qr-mem-emo :deep(.cp) {
  width: 100%;
  height: 100%;
}
.qr-mem-emo :deep(.mil-portrait) {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.qr-mem-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.qr-mem-name {
  font-weight: 700;
  font-size: 13px;
  line-height: 1.2;
  /* Deux lignes : « Orsène le Baumier » était coupé à 344 px. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.qr-mem-sub {
  color: var(--dim);
  font-size: 12px;
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
