<template>
  <!-- 🧭 LA FICHE D'UN VOYAGE, dans un coin de la carte (demandé, 2026-10-08) : on touche le
       tracé ou l'icône d'une troupe, et on lit qui voyage, si c'est une attaque combinée, et
       l'heure d'arrivée et de retour de CHAQUE troupe. Les actions du voyage (⚡, 🔙) y vivent
       aussi, à la place de la barre du bas. -->
  <section class="vc" role="dialog" :aria-label="card.title">
    <header class="vc-head">
      <div class="vc-titles">
        <p class="vc-title">{{ card.title }}</p>
        <p class="vc-place">{{ card.place }}</p>
      </div>
      <button type="button" class="vc-x" aria-label="Fermer" @click="emit('close')">✕</button>
    </header>
    <!-- ‹ › Les autres voyages du filtre actif (demandé) : la carte suit, le tracé rouge aussi. -->
    <div v-if="nav && nav.count > 1" class="vc-nav">
      <button type="button" class="vc-arrow" aria-label="Voyage précédent" @click="emit('prev')">
        ‹
      </button>
      <span class="vc-nav-n">{{ nav.index + 1 }} / {{ nav.count }}</span>
      <button type="button" class="vc-arrow" aria-label="Voyage suivant" @click="emit('next')">
        ›
      </button>
    </div>
    <p v-if="card.combined" class="vc-combo">
      ⚔️🧭 Attaque combinée · {{ card.troops.length }} groupe{{ card.troops.length > 1 ? 's' : '' }}
      qui arrivent ensemble
    </p>

    <ul class="vc-troops">
      <li v-for="t in rows" :key="t.key" class="vc-troop">
        <div class="vc-line">
          <span class="vc-emo" aria-hidden="true">{{ t.emo }}</span>
          <span class="vc-label">{{ t.label }}</span>
          <span class="vc-state">{{ TROOP_STATE_LABEL[t.times.state] }}</span>
        </div>
        <p class="vc-from">depuis {{ t.from }}</p>
        <div class="vc-crew">
          <span v-for="c in t.champs" :key="c.id" class="vc-chip">
            <span class="vc-av"
              ><ChampionPortrait :champion-id="c.championId">{{ c.emoji }}</ChampionPortrait></span
            >{{ c.name }}
          </span>
          <span v-if="t.militia" class="vc-chip mil"
            >🛡️ {{ t.militia }} milicien{{ t.militia > 1 ? 's' : '' }}</span
          >
        </div>
        <div class="vc-times">
          <span v-if="t.times.departAt !== null" class="vc-time">
            ⏳ départ <b>{{ clock(t.times.departAt) }}</b>
            <i>{{ inLabel(t.times.departAt) }}</i>
          </span>
          <span v-if="t.times.arriveAt !== null" class="vc-time">
            → arrivée <b>{{ clock(t.times.arriveAt) }}</b>
            <i>{{ inLabel(t.times.arriveAt) }}</i>
          </span>
          <span v-if="t.times.returnAt !== null" class="vc-time">
            ↩ retour <b>{{ clock(t.times.returnAt) }}</b>
            <i>{{ inLabel(t.times.returnAt) }}</i>
          </span>
          <span v-if="t.times.returnAt === null && t.stays" class="vc-time dim">
            reste sur le lieu
          </span>
        </div>
      </li>
    </ul>

    <!-- 🎁 Ce que le voyage ramène (tiré au départ, donc déjà connu). -->
    <div v-if="card.haul.length" class="vc-haul">
      <span class="vc-haul-l">🎁 Ramène</span>
      <HaulPills :pills="card.haul" variant="chip" />
    </div>

    <div class="vc-actions">
      <button v-if="canBoost" type="button" class="vc-btn boost" @click="emit('boost')">
        ⚡ Accélérer
      </button>
      <button v-if="canRecall" type="button" class="vc-btn" @click="emit('recall')">
        🔙 Demi-tour
      </button>
      <button type="button" class="vc-btn" @click="emit('list')">☰ Liste</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import HaulPills from '@/components/HaulPills.vue';
import { formatDuration } from '@/lib/duration';
import { TROOP_STATE_LABEL, troopTimes, type VoyageCardData } from '@/lib/voyageCard';

const props = defineProps<{
  card: VoyageCardData;
  now: number;
  canBoost: boolean;
  canRecall: boolean;
  /** ‹ › La place du voyage dans le filtre actif, `null` s'il n'y est pas. */
  nav: { index: number; count: number } | null;
}>();
const emit = defineEmits<{
  close: [];
  boost: [];
  recall: [];
  prev: [];
  next: [];
  list: [];
}>();

const rows = computed(() =>
  props.card.troops.map((t) => ({ ...t, times: troopTimes(t.leg, props.now) })),
);

/** « 14:05 », avec le jour s'il ne tombe pas aujourd'hui. */
function clock(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return new Date(props.now).toDateString() === d.toDateString()
    ? time
    : `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time}`;
}
const inLabel = (ms: number) =>
  ms > props.now ? `dans ${formatDuration(ms - props.now)}` : 'passé';
</script>

<style scoped>
.vc {
  /* En bas à gauche, AU-DESSUS des boutons ronds de la carte (48 px) : ils restent visibles. */
  position: fixed;
  left: 16px;
  bottom: calc(76px + env(safe-area-inset-bottom));
  z-index: 50;
  width: min(300px, calc(100vw - 32px));
  /* ~32 % de l'écran, et TRANSLUCIDE (demandé : « elle prend toute la place ») : la carte
     se devine dessous, le flou garde le texte lisible. */
  max-height: 32vh;
  overflow-y: auto;
  padding: 8px 10px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  color: var(--text);
}
.vc-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.vc-titles {
  flex: 1;
  min-width: 0;
}
.vc-title {
  margin: 0;
  font-weight: 800;
  font-size: 14px;
}
.vc-place {
  margin: 2px 0 0;
  color: var(--dim);
  font-size: 12px;
}
.vc-x {
  flex: none;
  width: 44px;
  height: 44px;
  margin: -8px -8px 0 0;
  border: 0;
  background: none;
  color: var(--dim);
  font-size: 16px;
  cursor: pointer;
}
.vc-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
}
.vc-arrow {
  width: 44px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.vc-nav-n {
  font-family: Oswald, sans-serif;
  font-size: 13px;
  color: var(--dim);
}
.vc-haul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.vc-haul-l {
  font-size: 12px;
  font-weight: 700;
}
.vc-combo {
  margin: 6px 0 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  font-size: 12px;
  font-weight: 700;
}
.vc-troops {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vc-troop {
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg) 35%, transparent);
}
.vc-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.vc-emo {
  font-size: 16px;
}
.vc-label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 13px;
}
.vc-state {
  flex: none;
  color: var(--dim);
  font-size: 11px;
}
.vc-from {
  margin: 2px 0 0;
  color: var(--dim);
  font-size: 11px;
}
.vc-crew {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.vc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 2px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11.5px;
}
.vc-chip.mil {
  padding-left: 8px;
}
.vc-chip.mil {
  border-color: var(--d1);
}
.vc-av {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: 13px;
}
.vc-av :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.vc-times {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 12px;
}
.vc-time b {
  font-family: Oswald, sans-serif;
  font-size: 13px;
}
.vc-time i {
  margin-left: 4px;
  font-style: normal;
  color: var(--dim);
  font-size: 11px;
}
.vc-time.dim {
  color: var(--dim);
}
.vc-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.vc-btn {
  flex: 1;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--text);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.vc-btn.boost {
  background: var(--accent);
  border-color: var(--accent);
  color: #15120e;
  text-shadow: none;
}
</style>
