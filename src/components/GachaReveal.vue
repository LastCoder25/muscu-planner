<template>
  <!-- 🎰 L'INVOCATION, EN PLEIN ÉCRAN (v1.002 — maquette validée le 2026-09-21, remplace la
       roulette de portraits ; v0.1101 : le choix du tirage lance tout, il n'y a plus de
       maintien). Le cercle se charge seul, un orbe est lancé, sa couleur est le présage, il
       retombe, et la lettre s'abat avant le portrait.
       ⚠️ ELLE NE DÉCIDE RIEN : tout est déjà tiré par le store (avec le pity persisté) ;
       l'écran ne fait que jouer le plan de `gachaReveal.ts`, où vivent le présage et le
       rythme — la règle de `siegeStage` et d'`arenaStage`. -->
  <q-dialog :model-value="!!plan || !!pending" maximized persistent @update:model-value="onClose">
    <!-- 🔮 `--omen` / `omened` : le présage de la scène (A et S seulement). ⚠️ Posé ICI, sur
         la racine, et non sur le `shaker` : pendant une animation WAAPI, Chrome fige les
         variables HÉRITÉES — le sanctuaire garderait la teinte du tirage précédent. -->
    <div
      class="ivk"
      :class="{ omened: !!omen }"
      :style="{ '--c': color, '--omen': omenColor, '--omen-k': omen?.strength ?? 0 }"
    >
      <div class="ivk-top">
        <span class="ivk-title font-display">{{ title }}</span>
        <button
          type="button"
          class="ivk-ibtn"
          :aria-label="sfx.enabled.value ? 'Couper le son' : 'Activer le son'"
          @click="sfx.setEnabled(!sfx.enabled.value)"
        >
          {{ sfx.enabled.value ? '🔊' : '🔇' }}
        </button>
        <!-- ⚠️ « Passer » dès la charge : on coupe l'animation, jamais l'écran de résultat. -->
        <button
          v-if="plan && (phase === 'charge' || phase === 'play')"
          type="button"
          class="ivk-skip"
          @click="skip"
        >
          ⏩ Passer
        </button>
      </div>

      <div ref="stage" class="ivk-stage">
        <InvocationBackdrop />
        <!-- ⚠️ `--c` posé AUSSI ici, en ligne : pendant une animation (la secousse joue sur
             cet élément), Chrome fige la valeur HÉRITÉE — la couleur de la lettre restait
             celle du tirage précédent (trouvé sur la maquette). -->
        <div ref="shaker" class="ivk-shaker" :style="{ '--c': color }">
          <div v-if="phase === 'charge'" class="ivk-cost">
            <div class="ivk-cost-t font-display">Tirage ×{{ count }}</div>
            <div class="ivk-cost-s">
              {{ isLot ? 'Dix orbes, dix trésors' : 'B, A ou S : le cercle te le dira' }}
            </div>
          </div>

          <InvocationSigil
            :key="isLot ? 'big' : 'small'"
            ref="sigilCmp"
            :variant="isLot ? 'big' : 'small'"
            :charge="charge"
            :speed="sigilSpeed"
            :charging="charging"
            :dim="sigilDim"
            :revealing="sigilRevealing"
            :tints="tints"
          />

          <!-- 🃏 LE ×10 : dix cartes face cachée, les B se retournent seuls, les A et S
               attendent qu'on les touche. -->
          <div v-if="cards.length" ref="lotEl" class="ivk-lot" :class="{ faded: !!rv.item }">
            <div
              v-for="(c, i) in cards"
              :key="i"
              class="ivk-card"
              :class="[
                'g-' + c.grade,
                { flipped: c.flipped, hot: c.hot && phase === 'await' && !c.flipped, away: c.away },
              ]"
              :style="{ '--c': GRADE_COLOR[c.grade], opacity: c.shown ? 1 : 0 }"
              @click="onCard(i)"
            >
              <div class="ivk-card-in">
                <div class="ivk-face ivk-back"></div>
                <div class="ivk-face ivk-front">
                  <span class="ivk-front-art"
                    ><ChampionPortrait :champion-id="c.cell.championId"
                      ><AdvGearArt :model="c.cell.gearModel"
                        ><span class="ivk-emo">{{ c.cell.emoji }}</span></AdvGearArt
                      ></ChampionPortrait
                    ></span
                  >
                  <span class="ivk-front-l font-display">{{ c.grade }}</span>
                  <span class="ivk-front-n">{{ c.cell.name }}</span>
                  <span class="ivk-front-t" :class="tagOf(c.lot).cls">{{
                    tagOf(c.lot).label
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ✨ LA RÉVÉLATION au centre du cercle (le ×1, et chaque carte touchée du ×10) -->
          <div v-if="rv.item" class="ivk-reveal" :class="{ interactive: rv.acts, final: rv.final }">
            <div ref="pwrap" class="ivk-pwrap">
              <div class="ivk-rays" :class="{ on: rv.col }"></div>
              <div ref="rim" class="ivk-rim"></div>
              <div ref="gradeEl" class="ivk-grade font-display" :class="'g-' + rv.item.cell.grade">
                {{ rv.item.cell.grade }}
              </div>
              <div class="ivk-portrait">
                <span class="ivk-sil"
                  ><ChampionPortrait :champion-id="rv.item.cell.championId" large
                    ><AdvGearArt :model="rv.item.cell.gearModel"
                      ><span class="ivk-emo">{{ rv.item.cell.emoji }}</span></AdvGearArt
                    ></ChampionPortrait
                  ></span
                >
                <span class="ivk-tint"></span>
                <span class="ivk-col" :class="{ on: rv.col }"
                  ><ChampionPortrait :champion-id="rv.item.cell.championId" large
                    ><AdvGearArt :model="rv.item.cell.gearModel"
                      ><span class="ivk-emo">{{ rv.item.cell.emoji }}</span></AdvGearArt
                    ></ChampionPortrait
                  ></span
                >
              </div>
            </div>
            <div class="ivk-name font-display">{{ rv.typed }}</div>
            <div ref="rarEl" class="ivk-rar font-display">
              {{ rv.item.cell.championId ? 'Champion' : 'Équipement' }}
            </div>
            <div class="ivk-meta" :class="{ on: rv.meta }">
              {{ metaOf(rv.item.cell) }}
              <span v-if="rv.tag" class="ivk-tag" :class="rv.tag.cls">{{ rv.tag.label }}</span>
            </div>
            <div v-if="rv.focus" class="ivk-acts" :class="{ on: rv.acts }">
              <button type="button" class="ivk-btn pri" @click="closeFocus">Continuer</button>
            </div>
          </div>
        </div>
        <div ref="flash" class="ivk-flash"></div>
      </div>

      <div class="ivk-bar">
        <!-- ⚠️ LE PRÉSAGE NE SE DIT PAS EN MOTS : « un S approche » ne serait plus un
             présage mais une annonce. La ligne reste neutre ; ce sont les braseros et la
             lueur du sanctuaire qui parlent. -->
        <template v-if="phase === 'charge'">
          <div class="ivk-msg">Le cercle s’éveille…</div>
        </template>
        <template v-else-if="phase === 'await'">
          <div class="ivk-msg">Touche les cartes qui brillent ({{ hotLeft }})</div>
          <button type="button" class="ivk-btn" @click="revealAll">Tout révéler</button>
        </template>
        <template v-else-if="phase === 'done'">
          <div class="ivk-msg">{{ isLot ? lotSummary : verdictSub }}</div>
          <div class="ivk-row">
            <button
              type="button"
              class="ivk-btn pri"
              :disabled="!canAgain || busy"
              @click="emit('again')"
            >
              🎰 Invoquer encore ×{{ count }}
            </button>
            <button type="button" class="ivk-btn" @click="onClose(false)">Fermer</button>
          </div>
        </template>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { CHAMPION_BY_ID, GRADE_COLOR } from '@/data/champions';
import { ADV_ROLE_LABEL, ADV_SIGNATURE_LABEL, AWAKEN, awakenLevel } from '@/lib/adventurers';
import {
  INVOKE,
  RANK_GRADE,
  apexMs,
  bestRank,
  finalRank,
  igniteOrder,
  omenOf,
  sigilTints,
  silhouetteMs,
  type LotItem,
  type RevealCell,
  type RevealItem,
  type RevealPlan,
} from '@/lib/gachaReveal';
import { useInvokeSfx } from '@/composables/useInvokeSfx';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import AdvGearArt from '@/components/AdvGearArt.vue';
import InvocationBackdrop from '@/components/InvocationBackdrop.vue';
import InvocationSigil from '@/components/InvocationSigil.vue';

const props = defineProps<{
  plan: RevealPlan | null;
  /** Ce que le tirage à l'unité a donné — pour le DIRE après la révélation, jamais avant. */
  verdict: {
    duplicate: boolean;
    copies: number;
    manaBack: number;
    awaken: number;
    /** Un B : une pièce d'équipement, pas un champion. */
    piece?: boolean;
  } | null;
  canAgain: boolean;
  busy: boolean;
  /** Le lot d'un ×10, dans l'ordre du tirage (les étiquettes NOUVEAU / Éveil des cartes). */
  lot?: LotItem[] | null;
  /**
   * 🎰 Le tirage DEMANDÉ (1 ou 10), le temps que son plan arrive. ⚠️ L'écran s'ouvre
   * dessus IMMÉDIATEMENT : le parent tire dans la foulée, et c'est ce cercle qui tourne à
   * vide qui masque l'aller-retour réseau. Sans lui, le choix du tirage resterait sans
   * réponse un quart de seconde et se lirait comme un bouton mort.
   */
  pending?: number | null;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'again'): void;
}>();

const sfx = useInvokeSfx();
const items = computed<RevealItem[]>(() => props.plan?.items ?? []);
/** Combien de tirages : ceux du plan, sinon ceux demandés (avant paiement). */
const count = computed(() => (props.plan ? items.value.length : (props.pending ?? 0)));
const isLot = computed(() => count.value > 1);

type Phase = 'charge' | 'play' | 'await' | 'focus' | 'done';
const phase = ref<Phase>('charge');
const charge = ref(0);
/** Le cercle est en train de se charger (il enfle et vibre). Il n'y a plus de doigt. */
const charging = ref(false);
const sigilSpeed = ref(12);
const sigilDim = ref(false);
const sigilRevealing = ref(false);
const color = ref<string>(GRADE_COLOR.B);

/**
 * 🔮 LE PRÉSAGE DE LA SCÈNE — la lib décide (A et S seulement, rien sur un B, rien en
 * mouvement réduit), l'écran ne fait que le peindre. ⚠️ Il est lu sur le PLAN, donc il
 * n'existe qu'une fois le tirage revenu : pendant que le cercle tourne à vide, le
 * sanctuaire ne promet rien.
 */
const omen = computed(() => (props.plan ? omenOf(props.plan) : null));
const omenColor = computed(() => (omen.value ? GRADE_COLOR[omen.value.grade] : undefined));
/** 🎨 Le cercle en B, ses médaillons en A et ses boules intérieures en S si le tirage en a. */
const tints = computed(() => sigilTints(props.plan));

const stage = ref<HTMLElement | null>(null);
const shaker = ref<HTMLElement | null>(null);
const flash = ref<HTMLElement | null>(null);
const pwrap = ref<HTMLElement | null>(null);
const rim = ref<HTMLElement | null>(null);
const gradeEl = ref<HTMLElement | null>(null);
const rarEl = ref<HTMLElement | null>(null);
const lotEl = ref<HTMLElement | null>(null);
const sigilCmp = ref<{ el: HTMLElement | null } | null>(null);

interface Tag {
  label: string;
  cls: string;
}
const rv = reactive({
  item: null as RevealItem | null,
  typed: '',
  col: false,
  meta: false,
  acts: false,
  final: false,
  focus: false,
  tag: null as Tag | null,
});
interface Card {
  cell: RevealCell;
  grade: RevealCell['grade'];
  lot: LotItem | null;
  item: RevealItem;
  flipped: boolean;
  hot: boolean;
  shown: boolean;
  away: boolean;
}
const cards = ref<Card[]>([]);
const hotLeft = computed(() => cards.value.filter((c) => c.hot && !c.flipped).length);

/* ─────────── ce que l'écran DIT ─────────── */
const title = computed(() => {
  if (phase.value !== 'done' || isLot.value) return 'Invocation';
  const v = props.verdict;
  if (!v) return 'Invocation';
  if (v.piece) return '🎁 Pièce d’équipement';
  if (!v.duplicate) return '✨ Nouveau champion !';
  return v.manaBack > 0 ? '💠 Éveil au maximum' : '✨ Éveil !';
});
const verdictSub = computed(() => {
  const v = props.verdict;
  if (!v) return '';
  if (v.piece) return 'Rangée dans ton stock — confie-la depuis l’onglet Stock.';
  if (!v.duplicate) return 'Il rejoint ton Panthéon — utilisable tout de suite.';
  return v.manaBack > 0
    ? `Il n’a plus rien à révéler : ${v.manaBack} 💠 te sont rendus.`
    : `Éveil ${v.awaken}/${AWAKEN.max} — il gagne en puissance.`;
});
const lotSummary = computed(() => {
  const n = (g: string) => items.value.filter((it) => it.cell.grade === g).length;
  const neufs = (props.lot ?? []).filter((it) => it.champion && !it.duplicate).length;
  return `${n('S')} S · ${n('A')} A · ${n('B')} pièce${n('B') > 1 ? 's' : ''}${neufs ? ` · ${neufs} NOUVEAU` : ''}`;
});
/** ⚠️ Ce qui DISTINGUE un champion : son rôle de convoi et ses signatures (leçon v0.752). */
function metaOf(cell: RevealCell): string {
  const c = cell.championId ? CHAMPION_BY_ID.get(cell.championId) : null;
  if (!c) return 'Pièce d’équipement de champion — rangée dans ton stock';
  const l = [
    ...(c.role ? [ADV_ROLE_LABEL[c.role]] : []),
    ...c.skills.map((s) => ADV_SIGNATURE_LABEL[s]).filter(Boolean),
  ];
  return l.length ? l.join(' · ') : 'combattant pur';
}
function tagOf(it: LotItem | null): Tag {
  if (!it || !it.champion) return { label: 'pièce', cls: 'piece' };
  if (!it.duplicate) return { label: 'NOUVEAU', cls: 'neuf' };
  if (it.manaBack > 0) return { label: `+${it.manaBack} 💠`, cls: 'eveil' };
  return { label: `✨ Éveil ${awakenLevel(it.copies)}`, cls: 'eveil' };
}
function singleTag(): Tag | null {
  const v = props.verdict;
  if (!v) return null;
  if (v.piece) return { label: 'pièce', cls: 'piece' };
  if (!v.duplicate) return { label: 'NOUVEAU', cls: 'neuf' };
  return v.manaBack > 0
    ? { label: `+${v.manaBack} 💠`, cls: 'eveil' }
    : { label: `✨ Éveil ${v.awaken}`, cls: 'eveil' };
}

/* ─────────── moteur de séquence annulable ─────────── */
let run = 0;
class Skip extends Error {}
const alive = (tok: number) => {
  if (tok !== run) throw new Skip();
};
const wait = (ms: number, tok: number) =>
  new Promise<void>((res, rej) =>
    window.setTimeout(() => (tok === run ? res() : rej(new Skip())), ms),
  );
async function anim(
  el: Element | null,
  frames: Keyframe[],
  o: KeyframeAnimationOptions,
  tok: number,
) {
  if (!el) return;
  const a = el.animate(frames, { fill: 'forwards', easing: 'ease-out', ...o });
  await a.finished.catch(() => undefined);
  alive(tok);
}
function tween(ms: number, fn: (k: number) => void, tok: number) {
  return new Promise<void>((res, rej) => {
    const t0 = performance.now();
    const f = (now: number) => {
      if (tok !== run) return rej(new Skip());
      const k = Math.min(1, (now - t0) / ms);
      fn(k);
      if (k < 1) requestAnimationFrame(f);
      else res();
    };
    requestAnimationFrame(f);
  });
}
const rankColor = (r: number) => GRADE_COLOR[RANK_GRADE[r] ?? 'B'];
const intensity = (r: number) => [0, 2, 3][r] ?? 0;
function vib(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* pas de vibreur */
  }
}
function flashOnce(peak: number, ms: number, tok: number) {
  return anim(
    flash.value,
    [{ opacity: 0 }, { opacity: peak }, { opacity: 0 }],
    { duration: ms },
    tok,
  );
}
function shake(px: number, ms: number) {
  const f: Keyframe[] = [];
  for (let i = 0; i < 8; i++) {
    const k = 1 - i / 8;
    f.push({
      transform: `translate(${(Math.random() - 0.5) * 2 * px * k}px,${(Math.random() - 0.5) * 2 * px * k}px)`,
    });
  }
  f.push({ transform: 'none' });
  shaker.value?.animate(f, { duration: ms, easing: 'linear' });
}

/* ─────────── effets posés à la main dans la scène ─────────── */
function sigilCenter() {
  const r = shaker.value!.getBoundingClientRect();
  const s = sigilCmp.value?.el?.getBoundingClientRect();
  if (!s) return { x: r.width / 2, y: r.height * 0.6 };
  return { x: s.left - r.left + s.width / 2, y: s.top - r.top + s.height / 2 };
}
function makeOrb(c: string) {
  const o = document.createElement('div');
  o.className = 'ivk-orb';
  o.style.setProperty('--c', c);
  const at = sigilCenter();
  o.style.left = `${at.x}px`;
  o.style.top = `${at.y}px`;
  o.innerHTML =
    '<div class="ivk-o-halo"></div><div class="ivk-o-tail"></div><div class="ivk-o-tail core"></div><div class="ivk-o-ring"></div><div class="ivk-o-body"><div class="ivk-o-swirl"></div><div class="ivk-o-swirl s2"></div><div class="ivk-o-shine"></div></div><div class="ivk-o-ring r2"></div>';
  shaker.value!.appendChild(o);
  return o;
}
/** ⚠️ Échelle UNIFORME, jamais d'étirement (demandé : « ne déforme pas la boule »). */
function placeOrb(o: HTMLElement, x: number, y: number, s: number, op?: number) {
  o.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  if (op != null) o.style.opacity = String(op);
}
function setTail(o: HTMLElement, len: number) {
  o.style.setProperty('--tail', String(len));
}
let emitting: { orb: HTMLElement; last: number; px: number | null; py: number | null } | null =
  null;
function stopEmbers() {
  emitting = null;
}
/** Braises semées sur le chemin parcouru, à la MONTÉE seulement (aucune traînée en chute). */
function startEmbers(orb: HTMLElement) {
  const st = { orb, last: 0, px: null as number | null, py: null as number | null };
  emitting = st;
  const step = (now: number) => {
    if (emitting !== st || !orb.isConnected || !shaker.value) return;
    const r = shaker.value.getBoundingClientRect();
    const b = orb.querySelector('.ivk-o-body')!.getBoundingClientRect();
    const x = b.left - r.left + b.width / 2;
    const y = b.top - r.top + b.height / 2;
    if (now - st.last >= 16) {
      st.last = now;
      const d = st.px == null ? 0 : Math.hypot(x - st.px, y - (st.py ?? y));
      const n = Math.min(5, 1 + Math.floor(d / 7));
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 1 : i / (n - 1);
        spawnEmber(
          st.px == null ? x : st.px + (x - st.px) * k,
          st.py == null ? y : st.py + (y - st.py) * k,
          b.width,
        );
      }
      st.px = x;
      st.py = y;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function spawnEmber(x: number, y: number, w: number) {
  const e = document.createElement('span');
  e.className = 'ivk-ember';
  const size = 4 + Math.random() * 8;
  e.style.width = e.style.height = `${size}px`;
  const x0 = x + (Math.random() - 0.5) * w * 0.5 - size / 2;
  const y0 = y + (Math.random() - 0.5) * w * 0.3 - size / 2;
  shaker.value!.appendChild(e);
  e.animate(
    [
      { transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 0.95 },
      {
        transform: `translate(${x0 + (Math.random() - 0.5) * 26}px,${y0 + 8 + Math.random() * 18}px) scale(0)`,
        opacity: 0,
      },
    ],
    { duration: 520 + Math.random() * 380, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' },
  ).finished.then(
    () => e.remove(),
    () => e.remove(),
  );
}
function spawnGem() {
  if (!shaker.value) return;
  const r = shaker.value.getBoundingClientRect();
  const c = sigilCenter();
  const a = Math.random() * Math.PI * 2;
  const d = Math.max(r.width, r.height) * 0.6;
  const g = document.createElement('span');
  g.className = 'ivk-gem';
  g.textContent = '💠';
  shaker.value.appendChild(g);
  g.animate(
    [
      {
        transform: `translate(${c.x + Math.cos(a) * d}px,${c.y + Math.sin(a) * d}px) scale(1)`,
        opacity: 0,
      },
      { opacity: 1, offset: 0.2 },
      { transform: `translate(${c.x - 9}px,${c.y - 12}px) scale(.3)`, opacity: 0.9 },
    ],
    { duration: 520, easing: 'cubic-bezier(.5,0,.9,.6)' },
  ).finished.then(
    () => g.remove(),
    () => g.remove(),
  );
}
function crackOrb(orb: HTMLElement, ms: number, tok: number) {
  const NS = 'http://www.w3.org/2000/svg';
  const cr = document.createElementNS(NS, 'svg');
  cr.setAttribute('viewBox', '0 0 64 64');
  cr.setAttribute('class', 'ivk-crack');
  [
    'M32 4 L28 20 L35 30 L27 44 L31 60',
    'M28 20 L14 16',
    'M35 30 L52 26 L58 34',
    'M27 44 L12 50',
  ].forEach((d, i) => {
    const pa = document.createElementNS(NS, 'path');
    pa.setAttribute('d', d);
    pa.setAttribute('pathLength', '1');
    pa.style.strokeDasharray = '1';
    pa.style.strokeDashoffset = '1';
    cr.appendChild(pa);
    pa.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: ms * 0.5,
      delay: i * 60,
      fill: 'forwards',
    });
  });
  const body = orb.querySelector('.ivk-o-body');
  body?.appendChild(cr);
  return anim(
    body,
    [
      { translate: '0 0' },
      { translate: '-5px 2px' },
      { translate: '5px -2px' },
      { translate: '-4px -1px' },
      { translate: '0 0' },
    ],
    { duration: ms, easing: 'linear' },
    tok,
  ).then(() => cr.remove());
}
function burstWave(x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const w = document.createElement('div');
    w.className = 'ivk-wave';
    w.style.left = `${x}px`;
    w.style.top = `${y}px`;
    shaker.value!.appendChild(w);
    w.animate(
      [
        { transform: 'scale(.3)', opacity: 1 },
        { transform: 'scale(3.2)', opacity: 0 },
      ],
      {
        duration: 650,
        delay: i * 110,
        easing: 'ease-out',
        fill: 'forwards',
      },
    ).finished.then(
      () => w.remove(),
      () => w.remove(),
    );
  }
}
function waveAt(el: Element | null) {
  if (!el || !shaker.value) return;
  const r = shaker.value.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  burstWave(b.left - r.left + b.width / 2, b.top - r.top + b.height / 2, 1);
}
function impact(rank: number) {
  const t = intensity(rank);
  sfx.impact(t);
  vib(t >= 3 ? [80, 40, 120, 40, 200] : t >= 2 ? [70, 40, 110] : 45);
  flash.value?.animate([{ opacity: 0 }, { opacity: 0.7 + t * 0.08 }, { opacity: 0 }], {
    duration: 300,
  });
  const c = sigilCenter();
  burstWave(c.x, c.y, 1 + t);
  shake(4 + t * 4, 300 + t * 80);
}
function lightPillar(rank: number) {
  const c = sigilCenter();
  const pl = document.createElement('div');
  pl.className = 'ivk-pillar';
  pl.style.left = `${c.x}px`;
  pl.style.top = `${c.y}px`;
  shaker.value!.appendChild(pl);
  pl.animate(
    [
      { transform: 'translate(-50%,-100%) scaleY(0) scaleX(.4)', opacity: 1 },
      { transform: 'translate(-50%,-100%) scaleY(1) scaleX(1)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-100%) scaleY(1) scaleX(1.1)', opacity: 0.8, offset: 0.7 },
      { transform: 'translate(-50%,-100%) scaleY(1) scaleX(1.4)', opacity: 0 },
    ],
    { duration: 1300 + intensity(rank) * 300, easing: 'ease-out', fill: 'forwards' },
  ).finished.then(
    () => pl.remove(),
    () => pl.remove(),
  );
}
function sparks(rank: number) {
  if (!pwrap.value || !shaker.value) return;
  const r = shaker.value.getBoundingClientRect();
  const b = pwrap.value.getBoundingClientRect();
  const cx = b.left - r.left + b.width / 2;
  const cy = b.top - r.top + b.height / 2;
  const t = intensity(rank);
  for (let i = 0; i < 8 + t * 12; i++) {
    const s = document.createElement('div');
    s.className = 'ivk-spark';
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    shaker.value.appendChild(s);
    const a = Math.random() * Math.PI * 2;
    const d = 90 + Math.random() * (110 + t * 40);
    const sz = 0.6 + Math.random() * (1 + t * 0.3);
    s.animate(
      [
        { transform: `translate(0,0) scale(${sz})`, opacity: 1 },
        {
          transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 30}px) scale(0)`,
          opacity: 0,
        },
      ],
      { duration: 600 + Math.random() * 600, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' },
    ).finished.then(
      () => s.remove(),
      () => s.remove(),
    );
  }
}
/** Retire tout ce qui a été posé à la main, et coupe les animations JS (jamais les CSS :
 *  le cercle et le décor en vivent). */
function clearFx() {
  stopEmbers();
  const sh = shaker.value;
  if (!sh) return;
  sh.querySelectorAll(
    '.ivk-orb,.ivk-ember,.ivk-gem,.ivk-wave,.ivk-pillar,.ivk-spark,.ivk-fly',
  ).forEach((n) => n.remove());
  for (const a of sh.getAnimations({ subtree: true })) {
    if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel();
  }
  flash.value?.getAnimations().forEach((a) => a.cancel());
}

/* ─────────── la charge du cercle ───────────
 * ⚠️ ELLE SE FAIT TOUTE SEULE (v0.1101, demandé : « que le choix du tirage lance
 * automatiquement l'animation »). Il n'y a plus de maintien, donc plus de retour en
 * arrière : choisir ×1 ou ×10 TIRE ET PAIE. Ce qui reste du geste — les runes qui
 * s'allument, les gemmes aspirées, le bourdonnement — n'est plus une épreuve mais
 * l'ouverture de la séquence, et c'est pourquoi elle est bien plus courte qu'avant. */
let chargeRaf = 0;
let chargeLast = 0;
let gemAcc = 0;
let tickAcc = 0;
const chargeMs = () => (isLot.value ? INVOKE.chargeMsLot : INVOKE.chargeMs);
/** On n'attaque la charge qu'une fois le plan là : c'est LUI qui porte le présage. */
function startCharge() {
  if (charging.value || phase.value !== 'charge') return;
  charging.value = true;
  gemAcc = 0;
  tickAcc = 0;
  chargeLast = 0;
  sfx.humStart();
  chargeRaf = requestAnimationFrame(chargeLoop);
}
function chargeLoop(t: number) {
  const dt = Math.min(0.05, (t - (chargeLast || t)) / 1000);
  chargeLast = t;
  if (phase.value !== 'charge' || !charging.value) return;
  charge.value = Math.min(1, charge.value + (dt * 1000) / chargeMs());
  sigilSpeed.value = 40 + charge.value * 520;
  sfx.humSet(charge.value);
  gemAcc += dt;
  if (gemAcc > 0.06 - charge.value * 0.035) {
    gemAcc = 0;
    spawnGem();
  }
  tickAcc += dt;
  if (tickAcc > 0.18 - charge.value * 0.1) {
    tickAcc = 0;
    vib(6);
  }
  if (charge.value >= 1) {
    charging.value = false;
    sfx.humStop();
    void (isLot.value ? playLot() : playSingle());
    return;
  }
  chargeRaf = requestAnimationFrame(chargeLoop);
}

/* ─────────── la révélation au centre ─────────── */
async function revealCenter(item: RevealItem, tag: Tag | null, tok: number, focus: boolean) {
  const rank = finalRank(item);
  rv.item = item;
  rv.typed = '';
  rv.col = false;
  rv.meta = false;
  rv.acts = false;
  rv.final = false;
  rv.focus = focus;
  rv.tag = tag;
  await nextTick();
  await anim(
    pwrap.value,
    [
      { transform: 'scale(.4)', opacity: 0 },
      { transform: 'scale(1.08)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
    tok,
  );
  rim.value?.animate([{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0.4 }], {
    duration: 700,
    iterations: Infinity,
    direction: 'alternate',
  });
  // ⚠️ La LETTRE s'abat sur la silhouette : on sait ce qu'on a eu juste avant le visage.
  const sil = silhouetteMs(rank);
  await wait(sil * 0.4, tok);
  sfx.stamp();
  vib(rank === 2 ? [40, 30, 80] : 25);
  await anim(
    gradeEl.value,
    [
      { transform: 'scale(3) rotate(-18deg)', opacity: 0 },
      { transform: 'scale(.9) rotate(-8deg)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1) rotate(-8deg)', opacity: 1 },
    ],
    { duration: 300, easing: 'cubic-bezier(.3,1.4,.6,1)' },
    tok,
  );
  shake(2 + intensity(rank) * 2, 200);
  await wait(sil * 0.6, tok);
  await flashOnce(0.9, 320, tok);
  rv.col = true;
  sparks(rank);
  sfx.chime(intensity(rank));
  vib(rank >= 1 ? [60, 30, 120] : 40);
  for (const ch of item.cell.name) {
    rv.typed += ch;
    if (ch !== ' ') sfx.tick();
    await wait(INVOKE.typeMsParLettre, tok);
  }
  sfx.stamp();
  await anim(
    rarEl.value,
    [
      { transform: 'scale(2.4) rotate(-8deg)', opacity: 0 },
      { transform: 'scale(1) rotate(-2deg)', opacity: 1 },
    ],
    { duration: 320, easing: 'cubic-bezier(.3,1.4,.6,1)' },
    tok,
  );
  rv.meta = true;
  await wait(240, tok);
  rv.acts = true;
}
/** L'état FINAL d'une révélation, sans animation (« Passer », mouvement réduit). */
function revealFinal(item: RevealItem, tag: Tag | null, focus: boolean) {
  rv.item = item;
  rv.typed = item.cell.name;
  rv.col = true;
  rv.meta = true;
  rv.acts = true;
  rv.final = true;
  rv.focus = focus;
  rv.tag = tag;
}

/* ─────────── ×1 ─────────── */
async function playSingle() {
  const tok = ++run;
  const item = items.value[0];
  if (!item) return;
  phase.value = 'play';
  const rank = finalRank(item);
  try {
    color.value = rankColor(item.path[0]!);
    vib(25);
    sfx.whoosh(0.9);
    await flashOnce(0.55, 260, tok);
    sigilDim.value = true;
    sigilSpeed.value = 6;
    const orb = makeOrb(color.value);
    const H = stage.value!.clientHeight * 0.34;
    startEmbers(orb);
    // Lancé vers le haut : la vitesse décroît comme sous la gravité.
    await tween(
      INVOKE.riseMs,
      (k) => {
        const v = 1 - k;
        const s = 0.25 + 0.75 * Math.min(1, k / 0.25);
        placeOrb(orb, 0, -H * (1 - v * v), s, Math.min(1, k / 0.1));
        setTail(orb, 1.1 * v);
        if (v < 0.3) stopEmbers();
      },
      tok,
    );
    setTail(orb, 0);
    await wait(apexMs(rank), tok);
    // La surprise vers le haut : l'orbe se fissure et change de couleur.
    for (let s = 1; s < item.path.length; s++) {
      await wait(150, tok);
      sfx.crack();
      vib([30, 40, 60]);
      await crackOrb(orb, 420, tok);
      await flashOnce(0.85, 240, tok);
      color.value = rankColor(item.path[s]!);
      orb.style.setProperty('--c', color.value);
      waveAt(orb.querySelector('.ivk-o-body'));
      vib(80);
      await wait(340, tok);
    }
    // Elle retombe lourdement : petite prise d'élan, puis chute qui accélère, sans traînée.
    await tween(
      INVOKE.windupMs,
      (k) => placeOrb(orb, 0, -H - 12 * (1 - (1 - k) * (1 - k)), 1),
      tok,
    );
    await tween(
      INVOKE.fallMs,
      (k) => {
        const e = Math.pow(k, 2.3);
        placeOrb(orb, 0, -H - 12 + (H + 12) * e, 1 + 0.4 * e);
      },
      tok,
    );
    orb.remove();
    color.value = rankColor(rank);
    impact(rank);
    lightPillar(rank);
    sigilDim.value = false;
    sigilRevealing.value = true;
    charge.value = 1;
    sigilSpeed.value = 146;
    await revealCenter(item, singleTag(), tok, false);
    phase.value = 'done';
  } catch (e) {
    if (!(e instanceof Skip)) throw e;
  }
}

/* ─────────── ×10 ─────────── */
function buildCards() {
  cards.value = items.value.map((it, i) => ({
    cell: it.cell,
    grade: it.cell.grade,
    lot: props.lot?.[i] ?? null,
    item: it,
    flipped: false,
    hot: finalRank(it) > 0,
    shown: false,
    away: false,
  }));
}
async function playLot() {
  const tok = ++run;
  phase.value = 'play';
  const plan = props.plan!;
  const best = bestRank(plan);
  try {
    color.value = rankColor(0);
    vib(30);
    sfx.whoosh(1.1);
    await flashOnce(0.6, 280, tok);
    sigilDim.value = true;
    sigilSpeed.value = 6;
    const H = stage.value!.clientHeight * 0.42;
    const W = stage.value!.clientWidth;
    const spread = Math.min(W * 0.088, 36);
    const half = (plan.items.length - 1) / 2 || 1;
    const orbs = plan.items.map((it, i) => {
      const o = makeOrb(rankColor(it.path[0]!));
      const u = (i - (plan.items.length - 1) / 2) / half;
      placeOrb(o, 0, 0, 0.1, 0);
      return { o, ax: u * spread * 4.5, ay: -H - (1 - u * u) * 28 };
    });
    // Lancés en éventail, avec la même gravité que le ×1.
    await Promise.all(
      orbs.map(({ o, ax, ay }, i) =>
        wait(i * INVOKE.lotLaunchStagger, tok).then(() =>
          tween(
            INVOKE.riseMs,
            (k) => {
              const v = 1 - k;
              const e = 1 - v * v;
              const s = 0.55 * (0.3 + 0.7 * Math.min(1, k / 0.25));
              placeOrb(o, ax * e, ay * e, s, Math.min(1, k / 0.1));
              setTail(o, 0.9 * v);
            },
            tok,
          ),
        ),
      ),
    );
    orbs.forEach(({ o }) => setTail(o, 0));
    await wait(INVOKE.lotApexMs, tok);
    // Scrutation : chaque orbe a son moment, qu'elle s'allume ensuite ou non.
    for (let i = 0; i < orbs.length; i++) {
      orbs[i]!.o.querySelector('.ivk-o-body')?.animate(
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.35)', filter: 'brightness(1.8)', offset: 0.4 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        { duration: INVOKE.lotScanMs * 2, easing: 'ease-out' },
      );
      sfx.pulse(i);
      vib(8);
      await wait(INVOKE.lotScanMs, tok);
    }
    await wait(INVOKE.lotScanHoldMs, tok);
    // Les A puis les S s'allument un à un.
    for (const i of igniteOrder(plan)) {
      const it = plan.items[i]!;
      const o = orbs[i]!.o;
      for (let s = 1; s < it.path.length; s++) {
        const g = it.path[s]!;
        await wait(INVOKE.lotCrackPauseMs, tok);
        sfx.crack();
        vib(25);
        await crackOrb(o, INVOKE.lotCrackMs, tok);
        o.style.setProperty('--c', rankColor(g));
        if (g === 2) {
          sfx.chime(3);
          vib([40, 30, 90]);
          await flashOnce(0.75, INVOKE.lotFlashMsS, tok);
          shake(6, 260);
          color.value = rankColor(2);
        } else {
          await flashOnce(0.3, INVOKE.lotFlashMsA, tok);
          if (best < 2) color.value = rankColor(1);
        }
        waveAt(o.querySelector('.ivk-o-body'));
        await wait(g === 2 ? INVOKE.lotRestMsS : INVOKE.lotRestMsA, tok);
      }
    }
    // Chute lourde : chaque orbe tombe sur l'emplacement de sa carte.
    buildCards();
    await nextTick();
    const r = shaker.value!.getBoundingClientRect();
    const c0 = sigilCenter();
    const pos = [...(lotEl.value?.children ?? [])].map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left - r.left + b.width / 2 - c0.x, y: b.top - r.top + b.height / 2 - c0.y };
    });
    await tween(
      INVOKE.windupMs,
      (k) =>
        orbs.forEach(({ o, ax, ay }) => placeOrb(o, ax, ay - 10 * (1 - (1 - k) * (1 - k)), 0.55)),
      tok,
    );
    await tween(
      INVOKE.fallMs,
      (k) => {
        const e = Math.pow(k, 2.3);
        orbs.forEach(({ o, ax, ay }, i) => {
          const p = pos[i] ?? { x: ax, y: ay };
          placeOrb(o, ax + (p.x - ax) * e, ay - 10 + (p.y - ay + 10) * e, 0.55 + 0.25 * e);
        });
      },
      tok,
    );
    orbs.forEach(({ o }) => o.remove());
    color.value = rankColor(best);
    impact(best);
    cards.value.forEach((c) => (c.shown = true));
    [...(lotEl.value?.children ?? [])].forEach((el, i) =>
      el.animate(
        [
          { transform: 'scale(.3)' },
          { transform: 'scale(1.1)', offset: 0.7 },
          { transform: 'scale(1)' },
        ],
        { duration: 320, delay: i * 25, easing: 'ease-out' },
      ),
    );
    await wait(INVOKE.lotLandMs, tok);
    // Les B se retournent seuls, en cascade.
    for (const c of cards.value) {
      if (c.hot) continue;
      c.flipped = true;
      sfx.tick();
      vib(5);
      await wait(INVOKE.lotFlipStagger, tok);
    }
    phase.value = hotLeft.value ? 'await' : 'done';
  } catch (e) {
    if (!(e instanceof Skip)) throw e;
  }
}

/** Une carte cachée qu'on touche : elle vole au centre, le cercle se rallume autour, et
 *  elle se révèle comme un ×1 (demandé : « qu'elle s'affiche au centre, avec le cercle »). */
async function onCard(i: number) {
  const c = cards.value[i];
  if (!c) return;
  // 🔎 Une carte DÉJÀ retournée s'ouvre en grand au centre (demandé : « cliquer sur un
  // objet devrait pouvoir l'afficher en grand »). Sans animation : on la connaît déjà,
  // on vient la regarder — « Continuer » la repose.
  if (c.flipped && (phase.value === 'await' || phase.value === 'done')) {
    run++;
    phase.value = 'focus';
    color.value = rankColor(finalRank(c.item));
    sigilDim.value = false;
    sigilRevealing.value = true;
    revealFinal(c.item, tagOf(c.lot), true);
    return;
  }
  if (phase.value !== 'await' || c.flipped || !c.hot) return;
  const tok = ++run;
  phase.value = 'focus';
  const el = lotEl.value?.children[i] as HTMLElement | undefined;
  const rank = finalRank(c.item);
  let fly: HTMLElement | null = null;
  try {
    color.value = rankColor(rank);
    sigilDim.value = false;
    sigilRevealing.value = true;
    charge.value = 1;
    sigilSpeed.value = 146;
    sfx.whoosh(0.6);
    vib(20);
    if (el && shaker.value) {
      const r = shaker.value.getBoundingClientRect();
      const cb = el.getBoundingClientRect();
      fly = el.cloneNode(true) as HTMLElement;
      fly.classList.remove('hot');
      fly.classList.add('ivk-fly');
      fly.style.cssText = `position:absolute;left:${cb.left - r.left}px;top:${cb.top - r.top}px;width:${cb.width}px;height:${cb.height}px;z-index:6;opacity:1;--c:${color.value};--cw:${cb.width}px`;
      shaker.value.appendChild(fly);
      c.away = true;
      const dx = r.width / 2 - (cb.left - r.left + cb.width / 2);
      const dy = r.height * 0.36 - (cb.top - r.top + cb.height / 2);
      const sc = Math.min(3, (r.width * 0.55) / cb.width);
      await anim(
        fly,
        [
          { transform: 'translate(0,0) scale(1)' },
          { transform: `translate(${dx}px,${dy}px) scale(${sc})` },
        ],
        { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' },
        tok,
      );
      lightPillar(rank);
      impact(rank);
      await flashOnce(0.7, 260, tok);
      fly.remove();
    }
    c.away = false;
    await revealCenter(c.item, tagOf(c.lot), tok, true);
  } catch (e) {
    c.away = false;
    // ⚠️ Un tirage interrompu en plein vol laissait le clone au-dessus de la révélation
    // (même z-index, plus tard dans le DOM) : il avalait les clics sur « Continuer ».
    fly?.remove();
    if (!(e instanceof Skip)) throw e;
  }
}
function closeFocus() {
  const c = cards.value.find((x) => x.item === rv.item);
  run++;
  clearFx();
  rv.item = null;
  if (c) c.flipped = true;
  sigilRevealing.value = false;
  sigilDim.value = true;
  charge.value = 0;
  sigilSpeed.value = 6;
  color.value = rankColor(props.plan ? bestRank(props.plan) : 0);
  phase.value = hotLeft.value ? 'await' : 'done';
}
function revealAll() {
  cards.value.forEach((c) => (c.flipped = true));
  phase.value = 'done';
}

/* ─────────── Passer, ouverture, fermeture ─────────── */
/** L'état FINAL, sans animation. ⚠️ C'est aussi ce que voit un `prefers-reduced-motion`. */
function showFinal() {
  run++;
  cancelAnimationFrame(chargeRaf);
  charging.value = false;
  sfx.humStop();
  clearFx();
  const plan = props.plan;
  if (!plan) return;
  sigilDim.value = true;
  sigilRevealing.value = false;
  charge.value = 0;
  color.value = rankColor(bestRank(plan));
  if (isLot.value) {
    rv.item = null;
    buildCards();
    cards.value.forEach((c) => {
      c.shown = true;
      c.flipped = true;
    });
  } else if (plan.items[0]) {
    sigilDim.value = false;
    sigilRevealing.value = true;
    revealFinal(plan.items[0], singleTag(), false);
  }
  phase.value = 'done';
}
function skip() {
  showFinal();
}
function onClose(v?: boolean) {
  if (v === true) return;
  run++;
  cancelAnimationFrame(chargeRaf);
  sfx.humStop();
  clearFx();
  emit('close');
}

watch(
  () => [props.plan, props.pending] as const,
  ([p, pend], prev) => {
    // ⚠️ LE MÊME PLAN NE SE REJOUE PAS : le parent peut toucher `pending` après avoir posé
    // le plan, et traiter ce second changement comme une nouvelle ouverture remettrait
    // tout à zéro en pleine révélation — l'écran repartirait sur le cercle.
    if (prev && p && p === prev[0]) return;
    // 🎰 Le plan demandé arrive pendant que le cercle tourne à vide : on enchaîne SANS
    // rouvrir l'écran, la charge part immédiatement.
    if (p && prev?.[1] && phase.value === 'charge') {
      if (p.reduced) void nextTick(showFinal);
      else startCharge();
      return;
    }
    run++;
    cancelAnimationFrame(chargeRaf);
    charging.value = false;
    clearFx();
    rv.item = null;
    cards.value = [];
    charge.value = 0;
    sigilDim.value = false;
    sigilRevealing.value = false;
    sigilSpeed.value = 12;
    color.value = GRADE_COLOR.B;
    if (!p && !pend) return;
    // ⚠️ `prefers-reduced-motion` → l'état FINAL directement, pas une animation courte.
    if (p?.reduced) {
      void nextTick(showFinal);
      return;
    }
    phase.value = 'charge';
    // Le plan est déjà là → on charge tout de suite ; sinon le cercle tourne à vide et
    // `startCharge` partira à l'arrivée du plan (branche du haut).
    if (p) startCharge();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  run++;
  cancelAnimationFrame(chargeRaf);
  sfx.humStop();
  stopEmbers();
});
</script>

<style lang="scss">
/* ⚠️ Styles NON scopés, tous préfixés `ivk-` : orbes, braises, ondes et colonne sont créées
   à la main dans la scène, et un style scopé ne les atteindrait pas. */
.ivk {
  position: relative;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #15120e;
  color: #f3eee6;
  overflow: hidden;
  overflow: clip;
}
.ivk-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
  z-index: 5;
}
.ivk-title {
  flex: 1;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ivk-ibtn,
.ivk-skip {
  min-width: 44px;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid #3a332a;
  background: #211c16;
  color: #f3eee6;
  font-size: 16px;
  cursor: pointer;
}
.ivk-skip {
  padding: 0 12px;
  font-size: 13px;
}
.ivk-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  overflow: clip;
  container-type: size;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}
.ivk-shaker {
  position: absolute;
  inset: 0;
}
.ivk-cost {
  position: absolute;
  left: 0;
  right: 0;
  top: 8%;
  text-align: center;
  z-index: 3;
  pointer-events: none;
}
.ivk-cost-t {
  font-size: 26px;
  text-transform: uppercase;
}
.ivk-cost-s {
  color: #9a8f7e;
  margin-top: 4px;
}
.ivk-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  z-index: 8;
}
.ivk-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 8px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  z-index: 5;
}
.ivk-msg {
  color: #d8cfc0;
  b {
    color: #f3eee6;
  }
}
.ivk-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.ivk-btn {
  min-height: 48px;
  padding: 0 18px;
  border-radius: 12px;
  border: 1px solid #3a332a;
  background: #211c16;
  color: #f3eee6;
  font:
    600 15px Inter,
    system-ui,
    sans-serif;
  cursor: pointer;
  &.pri {
    background: #b57bff;
    border-color: #b57bff;
    color: #16101f;
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

/* ── l'orbe ── */
.ivk-orb {
  position: absolute;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  pointer-events: none;
  --tail: 0;
  z-index: 4;
}
.ivk-o-halo {
  position: absolute;
  inset: -46px;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--c) 55%, transparent),
    color-mix(in srgb, var(--c) 18%, transparent) 55%,
    transparent
  );
  animation: ivk-halo 1.1s ease-in-out infinite alternate;
}
@keyframes ivk-halo {
  to {
    transform: scale(1.12);
    opacity: 0.75;
  }
}
.ivk-o-tail {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 58px;
  height: 280px;
  margin-left: -29px;
  transform-origin: 50% 0;
  transform: scaleY(var(--tail));
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--c) 85%, #fff) 0%,
    var(--c) 18%,
    color-mix(in srgb, var(--c) 40%, transparent) 55%,
    transparent 100%
  );
  clip-path: polygon(0 0, 100% 0, 64% 100%, 36% 100%);
  -webkit-mask: linear-gradient(to bottom, #000 30%, transparent);
  mask: linear-gradient(to bottom, #000 30%, transparent);
  filter: blur(7px);
  opacity: 0.9;
  &.core {
    width: 18px;
    margin-left: -9px;
    height: 190px;
    background: linear-gradient(
      to bottom,
      #fff 0%,
      color-mix(in srgb, var(--c) 50%, #fff) 35%,
      transparent
    );
    clip-path: polygon(0 0, 100% 0, 58% 100%, 42% 100%);
    filter: blur(2.5px);
    opacity: 0.95;
  }
}
.ivk-o-body {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(
    circle at 36% 32%,
    #fff 0 10%,
    color-mix(in srgb, var(--c) 45%, #fff) 26%,
    var(--c) 52%,
    color-mix(in srgb, var(--c) 45%, #000) 88%
  );
  box-shadow:
    0 0 22px 4px var(--c),
    inset -6px -8px 16px color-mix(in srgb, var(--c) 40%, #000),
    inset 4px 4px 12px #fff6;
}
.ivk-o-swirl {
  position: absolute;
  inset: -20%;
  border-radius: 50%;
  mix-blend-mode: screen;
  opacity: 0.55;
  background: conic-gradient(
    from 0deg,
    transparent 0 18%,
    #ffffffaa 24%,
    transparent 32% 52%,
    #ffffff88 58%,
    transparent 66% 84%,
    #ffffffaa 90%,
    transparent 96%
  );
  filter: blur(2px);
  animation: ivk-spin 1.6s linear infinite;
  &.s2 {
    inset: 8%;
    opacity: 0.4;
    animation-duration: 1.1s;
    animation-direction: reverse;
  }
}
.ivk-o-shine {
  position: absolute;
  left: 18%;
  top: 14%;
  width: 30%;
  height: 20%;
  border-radius: 50%;
  background: #fff;
  filter: blur(3px);
  opacity: 0.85;
}
.ivk-o-ring {
  position: absolute;
  inset: -18px;
  border-radius: 50%;
  border: 1.6px solid color-mix(in srgb, var(--c) 60%, #fff);
  box-shadow: 0 0 8px var(--c);
  animation: ivk-orbit 2.4s linear infinite;
  &.r2 {
    inset: -26px;
    opacity: 0.55;
    animation-duration: 3.6s;
    animation-direction: reverse;
    border-style: dashed;
  }
}
@keyframes ivk-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes ivk-orbit {
  from {
    transform: rotate(0deg) scaleY(0.3);
  }
  to {
    transform: rotate(360deg) scaleY(0.3);
  }
}
.ivk-crack {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  path {
    fill: none;
    stroke: #fff;
    stroke-width: 2.4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 3px #fff);
  }
}
.ivk-ember {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, #fff 0 30%, var(--c) 60%, transparent 72%);
  box-shadow: 0 0 6px var(--c);
}
.ivk-gem {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 18px;
  pointer-events: none;
  filter: drop-shadow(0 0 6px #b57bff);
}
.ivk-wave {
  position: absolute;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border-radius: 50%;
  border: 3px solid var(--c);
  box-shadow: 0 0 20px var(--c);
  pointer-events: none;
}
.ivk-pillar {
  position: absolute;
  width: 130px;
  height: 78%;
  transform-origin: 50% 100%;
  pointer-events: none;
  background: linear-gradient(
    to top,
    #fff 0%,
    var(--c) 12%,
    color-mix(in srgb, var(--c) 45%, transparent) 55%,
    transparent 100%
  );
  -webkit-mask: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
  mask: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
  filter: blur(4px);
}
.ivk-spark {
  position: absolute;
  width: 6px;
  height: 6px;
  margin: -3px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 8px var(--c);
  pointer-events: none;
}

/* ── la révélation ── */
.ivk-reveal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px 24px;
  pointer-events: none;
  z-index: 6;
  &.interactive {
    pointer-events: auto;
  }
}
.ivk-pwrap {
  position: relative;
  /* ⚠️ GRAND : c'est LE moment du tirage, le portrait doit presque remplir l'écran (un
     médaillon de 220 px l'avait fait disparaître). Le 52cqh garde de la place dessous
     pour le nom, la rareté et le bouton. */
  width: min(80vw, 360px, 52cqh);
  aspect-ratio: 1;
  /* ⚠️ Le portrait ne se clique pas, et ses rayons (260 % de large) débordent jusque sur
     « Continuer » : sans ça ils AVALAIENT le clic — mesuré au navigateur, le point au
     centre du bouton tombait sur `.ivk-rays`. */
  pointer-events: none;
}
.ivk-rays {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 260%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  opacity: 0;
  background: repeating-conic-gradient(
    from 0deg,
    color-mix(in srgb, var(--c) 55%, transparent) 0 7deg,
    transparent 7deg 20deg
  );
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 62%);
  mask: radial-gradient(circle, #000 18%, transparent 62%);
  transition: opacity 300ms;
  &.on {
    opacity: 1;
    animation: ivk-rays 14s linear infinite;
  }
}
@keyframes ivk-rays {
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}
.ivk-rim {
  position: absolute;
  inset: -10px;
  border-radius: 28px;
  box-shadow: 0 0 30px 8px var(--c);
  opacity: 0;
}
.ivk-grade {
  position: absolute;
  /* Collée au coin, pas au-delà : la carte fait presque la largeur de l'écran, une lettre
     qui déborde de 14 % sortirait du cadre. */
  right: -4%;
  top: -6%;
  z-index: 2;
  font-size: 64px;
  line-height: 1;
  font-weight: 700;
  color: var(--c);
  opacity: 0;
  -webkit-text-stroke: 2px #fff8;
  text-shadow:
    0 0 18px var(--c),
    0 0 40px color-mix(in srgb, var(--c) 60%, transparent),
    0 4px 0 #0008;
  &.g-B {
    font-size: 46px;
  }
}
.ivk-portrait {
  position: absolute;
  inset: 0;
  /* Carte arrondie et non disque : un cercle rognait les coins de l'illustration. */
  border-radius: 18px;
  overflow: hidden;
  border: 3px solid var(--c);
  background: #0e0b08;
  box-shadow:
    0 0 0 6px color-mix(in srgb, var(--c) 18%, transparent),
    0 0 40px color-mix(in srgb, var(--c) 60%, transparent);
  /* ⚠️ `img[src]` et non `img` : cette feuille n'est PAS scopée, alors que celle du
     portrait l'est (`.cp[data-v-…]`, deux « classes »). `img` seul perdait la cascade
     et le portrait restait à sa taille d'emoji (1,15em ≈ 16 px), collé dans un coin —
     d'où « les portraits ne s'affichent pas au tirage ». L'attribut remonte la
     spécificité au-dessus de celle du composant. */
  img[src] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0;
  }
}
.ivk-sil,
.ivk-col {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.ivk-emo {
  font-size: min(96px, 18cqh);
  line-height: 1;
}
/* La silhouette : un « fantôme » flou, teinté de la couleur de la lettre. */
.ivk-sil img {
  filter: grayscale(1) contrast(2.2) brightness(0.7) blur(6px);
}
.ivk-sil .ivk-emo {
  filter: brightness(0);
}
.ivk-tint {
  position: absolute;
  inset: 0;
  background: var(--c);
  mix-blend-mode: color;
  opacity: 0.9;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 35%, transparent 30%, #000c 85%);
  }
}
.ivk-col {
  opacity: 0;
  transition: opacity 120ms;
  &.on {
    opacity: 1;
  }
}
.ivk-name {
  font-size: 26px;
  font-weight: 600;
  text-align: center;
  min-height: 1.3em;
  text-wrap: balance;
}
.ivk-rar {
  font-size: 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--c);
  padding: 4px 16px;
  border: 2px solid var(--c);
  border-radius: 6px;
  opacity: 0;
  text-shadow: 0 0 12px color-mix(in srgb, var(--c) 70%, transparent);
  background: color-mix(in srgb, var(--c) 12%, transparent);
}
.ivk-meta {
  color: #9a8f7e;
  text-align: center;
  opacity: 0;
  transition: opacity 260ms;
  &.on {
    opacity: 1;
  }
}
.ivk-reveal.final {
  .ivk-grade {
    opacity: 1;
    transform: rotate(-8deg);
  }
  .ivk-rar {
    opacity: 1;
    transform: rotate(-2deg);
  }
}
.ivk-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.04em;
  &.neuf {
    background: #ffd23f;
    color: #1a1408;
  }
  &.eveil {
    color: #ffd23f;
    border: 1px solid #ffd23f;
  }
  &.piece {
    color: #9a8f7e;
  }
}
.ivk-acts {
  opacity: 0;
  transition: opacity 200ms;
  &.on {
    opacity: 1;
  }
}

/* ── le ×10 : cartes ── */
.ivk-lot {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  /* 🃏 3 · 4 · 3 EN LOSANGE, et la carte la plus grande que l'écran permet (demandé :
     « les 10 tirages en plus gros, répartis différemment »). Cinq de front ne laissaient
     que ~70 px par carte sur un téléphone ; quatre de front en rendent ~85, et la hauteur
     — jusqu'ici inutilisée — fixe l'autre borne. `--cw` = largeur d'une carte. */
  --gap: 8px;
  --cw: min(
    150px,
    calc((100cqw - 24px - 3 * var(--gap)) / 4),
    calc((92cqh - 2 * var(--gap)) / 4.8)
  );
  display: grid;
  grid-template-columns: repeat(8, calc(var(--cw) / 2 + var(--gap) / 2));
  row-gap: var(--gap);
  perspective: 900px;
  /* Chaque carte couvre deux demi-colonnes : décalées d'une demi-carte, les rangées de
     trois s'emboîtent entre celles de quatre. */
  > .ivk-card {
    grid-column: span 2;
    margin: 0 calc(var(--gap) / 2);
  }
  > .ivk-card:nth-child(1) {
    grid-column: 2 / span 2;
  }
  > .ivk-card:nth-child(4) {
    grid-column: 1 / span 2;
  }
  > .ivk-card:nth-child(8) {
    grid-column: 2 / span 2;
  }
  transition: opacity 300ms;
  z-index: 4;
  &.faded {
    opacity: 0.1;
  }
}
.ivk-card {
  position: relative;
  aspect-ratio: 5 / 8;
  &.hot,
  &.flipped {
    cursor: pointer;
  }
  &.away {
    visibility: hidden;
  }
}
.ivk-card-in {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 420ms cubic-bezier(0.3, 1.3, 0.5, 1);
}
.ivk-card.flipped .ivk-card-in {
  transform: rotateY(180deg);
}
.ivk-face {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
}
.ivk-back {
  border: 2px solid color-mix(in srgb, var(--c) 70%, #fff);
  box-shadow: 0 0 10px color-mix(in srgb, var(--c) 45%, transparent);
  background: radial-gradient(
    circle at 50% 45%,
    color-mix(in srgb, var(--c) 45%, #000) 0,
    #120f1a 75%
  );
  display: grid;
  place-items: center;
  &::before {
    content: '';
    width: 56%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--c) 80%, #fff);
    box-shadow:
      0 0 10px var(--c),
      inset 0 0 10px var(--c);
    opacity: 0.8;
  }
  &::after {
    content: '✦';
    position: absolute;
    color: color-mix(in srgb, var(--c) 60%, #fff);
    font-size: 16px;
  }
}
.ivk-card.hot .ivk-back {
  animation: ivk-hot 1s ease-in-out infinite alternate;
}
.ivk-card.hot.g-S .ivk-back {
  animation-duration: 0.6s;
}
@keyframes ivk-hot {
  to {
    box-shadow: 0 0 22px 4px var(--c);
  }
}
.ivk-front {
  transform: rotateY(180deg);
  background: #120f0b;
  border: 2px solid var(--c);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ivk-front-art {
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: #0c0a07;
  overflow: hidden;
  img[src] {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0;
  }
  .ivk-emo {
    font-size: calc(var(--cw, 70px) * 0.42);
  }
}
.ivk-front-l {
  position: absolute;
  left: 3px;
  top: 1px;
  font-size: max(20px, calc(var(--cw, 70px) * 0.26));
  font-weight: 700;
  color: var(--c);
  text-shadow:
    0 0 6px var(--c),
    0 2px 0 #000;
}
.ivk-front-n {
  font-size: max(9.5px, calc(var(--cw, 70px) * 0.12));
  line-height: 1.15;
  text-align: center;
  padding: 3px 3px 0;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ivk-front-t {
  margin-top: auto;
  margin-bottom: 3px;
  font-size: max(8px, calc(var(--cw, 70px) * 0.095));
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 999px;
  &.neuf {
    background: #ffd23f;
    color: #1a1408;
  }
  &.eveil {
    color: #ffd23f;
    border: 1px solid #ffd23f;
  }
  &.piece {
    color: #9a8f7e;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ivk-o-halo,
  .ivk-o-swirl,
  .ivk-o-ring,
  .ivk-rays.on,
  .ivk-card.hot .ivk-back {
    animation: none;
  }
}
</style>
