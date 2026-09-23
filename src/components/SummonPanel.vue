<template>
  <!-- 🎰 L'ÉCRAN D'INVOCATION, plein écran (v0.960). ⚠️ Monté À CÔTÉ de la feuille et non
       dedans : une modale dans une modale hérite du voile et de la hauteur de sa parente,
       et l'invocation s'y retrouverait bridée. -->
  <GachaReveal
    :plan="revealPlan"
    :verdict="revealVerdict"
    :lot="revealLot"
    :can-again="!!(lastWasLot ? payTen : payOne) && !busy"
    :busy="busy"
    @close="closeReveal"
    :pending="pending"
    @again="askPull(lastWasLot ? multiCount : 1)"
  />
  <!-- 🎰 LA FEUILLE DE TIRAGE (v0.989, demandé : « une tuile pour le tirage plutôt que dans
       les champions, on sépare les deux ; dans la tuile de tirage, deux grandes tuiles pour
       les différents tirages »). Le vivier vit dans « Mes champions », l'invocation ici. -->
  <q-dialog :model-value="open" position="bottom" @update:model-value="emit('close')">
    <q-card class="sm-card">
      <div class="sm-head">
        <span class="sm-title font-display">🎰 Tirage</span>
        <span class="sm-wallet">
          <span v-if="tickets" class="sm-tickets font-display">🎟️ {{ tickets }}</span>
          <span class="sm-mana font-display">💠 {{ mana.toLocaleString('fr-FR') }}</span>
        </span>
      </div>

      <p v-if="!char.pantheonLevel" class="sm-empty">
        Construis le <b>Panthéon</b> dans ta cour pour invoquer tes champions.
      </p>

      <template v-else>
        <!-- Deux GRANDES tuiles côte à côte : un geste, un choix. Chacune DIT son prix et
             ce qui manque plutôt que de se griser en silence (leçon du gris de la carte). -->
        <div class="sm-tiles">
          <button class="sm-tile" :disabled="busy || !payOne" @click="askPull(1)">
            <span class="st-glow" aria-hidden="true"></span>
            <span class="st-x font-display">×1</span>
            <span class="st-lab">Invoquer un champion</span>
            <span class="st-cost font-display">{{ costLabel(payOne, pullCost) }}</span>
            <small v-if="payOne?.kind === 'tickets'" class="st-sub">
              {{ tickets }} ticket{{ tickets > 1 ? 's' : '' }} gagné{{ tickets > 1 ? 's' : '' }} au
              sport
            </small>
            <small v-else-if="mana >= pullCost" class="st-sub">
              {{ pulls }} {{ pulls > 1 ? 'tirages possibles' : 'tirage possible' }}
            </small>
            <small v-else class="st-sub short">il manque {{ pullCost - mana }} 💠</small>
          </button>
          <button class="sm-tile ten" :disabled="busy || !payTen" @click="askPull(multiCount)">
            <span class="st-glow" aria-hidden="true"></span>
            <span class="st-x font-display">×{{ multiCount }}</span>
            <span class="st-lab">Invoquer {{ multiCount }} champions</span>
            <span class="st-cost font-display">{{ costLabel(payTen, multiCost) }}</span>
            <small v-if="payTen?.kind === 'tickets'" class="st-sub"
              >1 offert · payé en tickets</small
            >
            <small v-else-if="mana >= multiCost" class="st-sub"
              >1 offert · au lieu de {{ pullCost * multiCount }}</small
            >
            <small v-else class="st-sub short">il manque {{ multiCost - mana }} 💠</small>
          </button>
        </div>

        <!-- 📊 LES CHANCES, ANNONCÉES (v0.966, demandé : « j'ai eu du primordial,
             légendaire, rare, alors que je pensais avoir beaucoup de commun »).
             ⚠️ Mesuré, les taux étaient CONFORMES : le défaut était le SILENCE. Rien ne
             disait ni les taux, ni la garantie tous les 10, ni — surtout — qu'un tirage
             garanti re-tire dans TOUTE la tranche ≥ épique, donc qu'il la dépasse une
             fois sur deux. C'est ce chiffre-là qui explique le ressenti.
             ⚠️ REPLIÉ par défaut : c'est une notice, pas l'action. -->
        <button class="g-odds-t" type="button" @click="oddsOpen = !oddsOpen">
          <span>📊 Chances d'invocation</span>
          <span class="go-chev" :class="{ on: oddsOpen }">▸</span>
        </button>
        <div v-if="oddsOpen" class="g-odds">
          <div v-for="r in odds.rates" :key="r.grade" class="go-row">
            <span class="go-rar" :style="{ color: GRADE_COLOR[r.grade] }">
              {{ r.grade
              }}{{ r.grade === 'B' ? ' · équipement (lettre B, A ou S)' : ' · champion' }}
            </span>
            <span class="go-bar" aria-hidden="true"
              ><i
                :style="{
                  width: (r.pct / odds.rates[0]!.pct) * 100 + '%',
                  background: GRADE_COLOR[r.grade],
                }"
            /></span>
            <span class="go-pct font-display">{{ fmtOdds(r.pct) }} %</span>
          </div>
          <p class="go-note">
            🎁 Un tirage sur {{ odds.floorEvery }} est garanti <b>A</b> ou mieux. Prochain dans
            <b>{{ odds.nextFloorIn }}</b> tirage{{ odds.nextFloorIn > 1 ? 's' : '' }}.
          </p>
          <p class="go-note">
            👑 S : <b>{{ fmtOdds(odds.topPct) }} %</b> à ton prochain tirage, garanti dans
            <b>{{ odds.nextTopIn }}</b
            >.
          </p>
        </div>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { awakenLevel } from '@/lib/adventurers';
import GachaReveal from './GachaReveal.vue';
import {
  buildReveal,
  buildLotReveal,
  cellOf,
  type RevealPlan,
  type LotItem,
} from '@/lib/gachaReveal';
import { GACHA, gachaOdds, multiPullCost } from '@/lib/gacha';
import { pullPayment } from '@/lib/sportTickets';
import { GRADE_COLOR } from '@/data/champions';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
/** Le niveau du JOUEUR : c'est lui qui fixe le rang d'une pièce B tirée. */
const busy = ref(false);

const mana = computed(() => char.row?.mana ?? 0);
/** 🎟️ Tickets d'invocation, gagnés au sport (v0.992). */
const tickets = computed(() => char.row?.gacha_tickets ?? 0);
const pullCost = GACHA.pullCost;
/** Comment chaque tuile paierait — la MÊME règle que le store (`pullPayment`) : la tuile ne
 *  peut pas annoncer un prix que le tirage n'appliquerait pas. */
const payOne = computed(() => pullPayment(1, { tickets: tickets.value, mana: mana.value }));
const payTen = computed(() =>
  pullPayment(GACHA.multiCount, { tickets: tickets.value, mana: mana.value }),
);
function costLabel(pay: ReturnType<typeof pullPayment>, manaCost: number): string {
  return pay?.kind === 'tickets' ? `${pay.cost} 🎟️` : `${manaCost} 💠`;
}

/** Combien de tirages la réserve permet. ⚠️ Le chiffre qui décide si on appuie : « 1 831
 *  💠 » ne se convertit pas de tête. */
const pulls = computed(() => Math.floor(mana.value / pullCost));
/** 📊 Les chances, avec l'état RÉEL du pity : un panneau qui annoncerait des taux nus
 *  mentirait par omission — c'est la garantie qui explique ce qu'on tire. */
const oddsOpen = ref(false);
const odds = computed(() => gachaOdds(char.row?.gacha ?? { sinceTop: 0, sinceFloor: 0 }));
/** Un taux à la française, décimale seulement si elle dit quelque chose. */
const fmtOdds = (pct: number) =>
  (Math.round(pct * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const revealPlan = ref<RevealPlan | null>(null);
/** Le lot complet d'un ×10 — `null` pour un tirage à l'unité. */
const revealLot = ref<LotItem[] | null>(null);
/** Le dernier tirage était un ×10 : « Invoquer encore » refait le même geste. */
const lastWasLot = ref(false);
const multiCount = GACHA.multiCount;
const multiCost = multiPullCost();
const revealVerdict = ref<{
  duplicate: boolean;
  copies: number;
  manaBack: number;
  awaken: number;
  piece?: boolean;
} | null>(null);
function closeReveal() {
  revealPlan.value = null;
  revealVerdict.value = null;
  pending.value = null;
}

/**
 * 🎰 CHOISIR ×1 OU ×10 LANCE TOUT (v0.1101, demandé : « que ça lance automatiquement
 * l'animation »). Il n'y a plus de maintien à faire, donc plus rien entre le choix et le
 * tirage : on paie et on anime.
 *
 * ⚠️ **L'ÉCRAN S'OUVRE AVANT que le tirage ne soit revenu**, et ce n'est pas un détail :
 * le tirage est un aller-retour réseau (le store, la mana, le pity persisté). Sans ce
 * `pending`, la tuile resterait sans réponse le temps de la requête et se lirait comme un
 * bouton mort. Le cercle qui tourne à vide masque exactement cette latence — c'est ce que
 * le maintien faisait avant lui.
 *
 * ⚠️ **LE « ‹ RETOUR » DISPARAÎT AVEC LE MAINTIEN** (v1.003) : il n'existait que parce que
 * rien n'était encore payé. Maintenant que le choix tire, revenir laisserait croire qu'on
 * annule un tirage déjà crédité.
 */
const pending = ref<number | null>(null);
async function askPull(n: number) {
  if (busy.value) return;
  if (!(n > 1 ? payTen.value : payOne.value)) {
    $q.notify({ type: 'negative', message: 'Pas assez de tickets ni de pierres de mana.' });
    return;
  }
  revealPlan.value = null;
  revealVerdict.value = null;
  lastWasLot.value = n > 1;
  pending.value = n;
  await (n > 1 ? doPullTen() : doPull());
  // Refusé (mana partie entre-temps, réseau) : on referme plutôt que de laisser un cercle
  // tourner dans le vide pour toujours.
  if (!revealPlan.value) pending.value = null;
}

/**
 * 🎰 UN TIRAGE. ⚠️ On ANNONCE toujours quelque chose — un tirage muet, dans un genre bâti
 * sur le moment où l'on découvre ce qu'on a eu, n'est pas un tirage. Trois issues, et
 * chacune se dit : un champion neuf, un cran d'Éveil, ou une copie de trop qui se
 * convertit (« jamais perdu »).
 *
 * ⚠️ **L'INVOCATION MET EN SCÈNE UN RÉSULTAT DÉJÀ TRANCHÉ** : on tire d'abord (le store, le
 * pity, la mana), on anime ensuite. L'inverse ferait diverger ce qu'on voit de ce qu'on
 * possède — la règle de `siegeStage` et d'`arenaStage`.
 */
/** ⚠️ `prefers-reduced-motion` → l'état FINAL, pas une animation raccourcie : la lib
 *  rend un plan « réduit » que l'écran affiche directement. Lu UNE fois, pour les deux
 *  modes de tirage — deux lectures finiraient par diverger. */
function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 🎰 LE LOT DE 10 — dix orbes lancées ensemble qui retombent en cartes (v1.002) ; les A et
 * les S se révèlent au toucher, au centre du cercle.
 */
async function doPullTen() {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const lot = await char.pullChampions(uid);
    if (!lot) {
      $q.notify({ type: 'negative', message: 'Pas assez de tickets ni de pierres de mana.' });
      return;
    }
    // ⚠️ Au ×10, chaque carte dit SA propre issue (NOUVEAU, Éveil, pièce) : pas de verdict unique.
    revealVerdict.value = null;
    revealLot.value = lot;
    lastWasLot.value = true;
    revealPlan.value = buildLotReveal(lot, Math.random, { reduced: reducedMotion() });
  } finally {
    busy.value = false;
  }
}

async function doPull() {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const r = await char.pullChampion(uid);
    if (!r) {
      $q.notify({ type: 'negative', message: 'Pas assez de tickets ni de pierres de mana.' });
      return;
    }
    revealLot.value = null;
    lastWasLot.value = false;
    revealVerdict.value = {
      duplicate: r.duplicate,
      copies: r.copies,
      manaBack: r.manaBack,
      awaken: awakenLevel(r.copies),
      piece: !r.champion,
    };
    revealPlan.value = buildReveal(cellOf(r), Math.random, { reduced: reducedMotion() });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.sm-card {
  background: var(--surface);
  color: var(--text);
  padding: 16px 14px;
  border-radius: 16px 16px 0 0;
  width: 480px;
  max-width: 100vw;
}
.sm-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sm-title {
  font-size: 18px;
  font-weight: 700;
}
.sm-wallet {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.sm-mana {
  font-size: 16px;
  color: #b57bff;
}
.sm-tickets {
  font-size: 16px;
  color: var(--accent);
}
.sm-empty {
  font-size: 12.5px;
  color: var(--dim);
}
/* 🎰 LES DEUX GRANDES TUILES. Violet du mana, jamais l'accent : l'accent dit « il y a à
   faire », invoquer est un plaisir. Le ×10 est un cran plus soutenu : c'est le geste
   « gros tirage ». */
.sm-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 8px;
}
.sm-tile {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 170px;
  padding: 14px 8px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, #b57bff 55%, var(--line));
  background: radial-gradient(
    120% 90% at 50% 0%,
    color-mix(in srgb, #b57bff 30%, var(--surface)),
    color-mix(in srgb, #b57bff 8%, var(--bg))
  );
  color: var(--text);
  text-align: center;
  cursor: pointer;
  box-shadow: 0 0 22px color-mix(in srgb, #b57bff 22%, transparent);
}
.sm-tile.ten {
  border-color: color-mix(in srgb, #ffd24a 55%, var(--line));
  background: radial-gradient(
    120% 90% at 50% 0%,
    color-mix(in srgb, #b57bff 42%, var(--surface)),
    color-mix(in srgb, #ffd24a 10%, var(--bg))
  );
  box-shadow: 0 0 26px color-mix(in srgb, #ffd24a 22%, transparent);
}
.sm-tile:disabled {
  opacity: 0.55;
  cursor: default;
  box-shadow: none;
}
/* Un reflet qui passe tant qu'on PEUT tirer — éteint quand la mana manque. */
.st-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 35%,
    rgba(255, 255, 255, 0.16) 50%,
    transparent 65%
  );
  transform: translateX(-100%);
  animation: st-sheen 3.2s ease-in-out infinite;
  pointer-events: none;
}
.sm-tile.ten .st-glow {
  animation-delay: 1.6s;
}
.sm-tile:disabled .st-glow {
  display: none;
}
@keyframes st-sheen {
  60%,
  100% {
    transform: translateX(100%);
  }
}
.st-x {
  font-size: 44px;
  line-height: 1;
  color: #e6d2ff;
  text-shadow: 0 0 18px color-mix(in srgb, #b57bff 70%, transparent);
}
.sm-tile.ten .st-x {
  color: #ffe38a;
  text-shadow: 0 0 18px color-mix(in srgb, #ffd24a 60%, transparent);
}
.st-lab {
  font-size: 12.5px;
  font-weight: 600;
}
.st-cost {
  font-size: 18px;
  color: #d9b8ff;
}
.st-sub {
  font-size: 11px;
  color: var(--dim);
}
.st-sub.short {
  color: var(--d4);
}
@media (prefers-reduced-motion: reduce) {
  .st-glow {
    animation: none;
    display: none;
  }
}
/* 📊 LE PANNEAU DES CHANCES — une NOTICE : discrète, repliée, jamais en concurrence
   avec le bouton d'invocation juste au-dessus. */
.g-odds-t {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  /* Cible tactile 44 px : c est une notice, pas l action principale, mais la regle du projet ne souffre pas d exception. */
  min-height: 44px;
  margin: -2px 0 8px;
  padding: 4px 6px;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.go-chev {
  margin-left: auto;
  transition: transform 0.15s ease;
}
.go-chev.on {
  transform: rotate(90deg);
}
.g-odds {
  margin: -6px 0 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg);
}
.go-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.go-rar {
  flex: 0 0 96px;
  font-size: 11.5px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.go-bar {
  flex: 1;
  min-width: 0;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.go-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.go-pct {
  flex: 0 0 46px;
  text-align: right;
  font-size: 12px;
}
.go-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.35;
}
</style>
