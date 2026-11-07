<template>
  <!-- 📖 LE GUIDE DE L'AVENTURE — 4 cartes qu'on fait défiler, à la 1re visite puis à la
       demande (le ❔ de l'Aventure appelle `open()`). Remplace l'ancienne intro, qui
       disparaissait d'un toucher et ne revenait jamais. Le texte ne décrit que ce qui
       existe : à relire quand un système est retiré ou ajouté. -->
  <section
    v-if="shown"
    class="gt"
    role="dialog"
    aria-label="Guide de l'Aventure"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <header class="gt-top">
      <span class="gt-step font-display">{{ index + 1 }} / {{ CARDS.length }}</span>
      <button class="gt-x" type="button" aria-label="Fermer le guide" @click="close">✕</button>
    </header>

    <div :key="index" class="gt-card">
      <div class="gt-emo" aria-hidden="true">{{ card.emo }}</div>
      <h3 class="gt-h font-display">{{ card.title }}</h3>
      <ul class="gt-list">
        <li v-for="(l, i) in card.lines" :key="i" v-html="l" />
      </ul>
      <div class="gt-chips">
        <span v-for="r in card.res" :key="r.id" class="gt-chip" :title="r.what">
          <span class="gt-ico"
            ><RuneIcon v-if="r.id === 'runes'" /><template v-else>{{ r.ico }}</template></span
          >
          {{ r.name }}
        </span>
      </div>
    </div>

    <div class="gt-dots" role="tablist" aria-label="Cartes du guide">
      <button
        v-for="(_, i) in CARDS"
        :key="i"
        type="button"
        class="gt-dot"
        role="tab"
        :aria-selected="i === index"
        :aria-label="`Carte ${i + 1}`"
        @click="index = i"
      >
        <span :class="{ on: i === index }" />
      </button>
    </div>

    <footer class="gt-nav">
      <button v-if="index > 0" type="button" class="gt-btn ghost" @click="index--">
        ‹ Précédent
      </button>
      <button v-if="index < CARDS.length - 1" type="button" class="gt-btn" @click="index++">
        Suivant ›
      </button>
      <button v-else type="button" class="gt-btn" @click="close">À l'aventure !</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import RuneIcon from '@/components/RuneIcon.vue';
import { markTutorialSeen, tutorialSeen } from '@/lib/gameTutorial';

interface Res {
  id: string;
  ico: string;
  name: string;
  what: string;
}
// Les icônes sont celles du plateau de ressources (`ResourceTray`).
const R: Record<string, Res> = {
  energy: { id: 'energy', ico: '⚡', name: 'Énergie', what: 'gagnée en faisant du sport' },
  mana: { id: 'mana', ico: '💠', name: 'Mana', what: 'invoquer un champion' },
  gold: { id: 'gold', ico: '🪙', name: 'Or', what: 'expéditions, construction' },
  summon: { id: 'summon', ico: '🔮', name: 'Invocation', what: 'tenter un boss de palier' },
  keys: { id: 'keys', ico: '🗝️', name: 'Clés', what: 'entrer dans le Labyrinthe' },
  seals: { id: 'seals', ico: '🔱', name: 'Sceaux', what: 'ascension (ruines anciennes)' },
  tickets: { id: 'tickets', ico: '🎟️', name: 'Tickets', what: "tickets d'invocation" },
  runes: { id: 'runes', ico: '', name: 'Runes', what: 'à ouvrir au Panthéon' },
};

interface Card {
  emo: string;
  title: string;
  lines: string[];
  res: Res[];
}
const CARDS: Card[] = [
  {
    emo: '💪',
    title: 'Ton héros vient de ton sport',
    lines: [
      'Ton <b>niveau et tes stats</b> viennent de tes séances réelles : rien à répartir.',
      "Chaque séance rapporte de l'<b>énergie</b> ⚡, la monnaie qui paie les donjons, le Labyrinthe et le Portail.",
      "Onglets <b>Héros</b> (fiche, talents, familier) et <b>Équipement</b> : la 🪄 équipe le meilleur build.",
    ],
    res: [R.energy!],
  },
  {
    emo: '🏰',
    title: 'Explorer : donjons et boss',
    lines: [
      'Onglet <b>Explorer</b> : nettoie des <b>donjons</b> pour gagner de l\'équipement et des 🔮.',
      'Les 🔮 tentent un <b>boss de palier</b> : il lâche les pièces de <b>set</b>.',
      'Le <b>Labyrinthe</b> (🗝️) est un donjon à étages ; il se débloque avec sa porte, à la Base.',
    ],
    res: [R.summon!, R.keys!, R.gold!],
  },
  {
    emo: '🗺️',
    title: 'La carte : expéditions',
    lines: [
      'Bouton <b>🗺️ Carte</b> : envoie ton héros ou une <b>équipe de champions</b> sur des lieux (mines, camps, ruines…).',
      "Les <b>points de contrôle</b> se prennent à 1-3 champions et rapportent tant qu'on les tient ; l'ennemi tente de les reprendre.",
      'Les <b>failles</b> se referment en groupe avant de déborder.',
    ],
    res: [R.gold!, R.mana!, R.seals!],
  },
  {
    emo: '🛡️',
    title: 'Base et champions',
    lines: [
      'Onglet <b>Base</b> : bâtiments et enceinte contre les <b>sièges</b> ; la milice et la garnison défendent.',
      "Au <b>Panthéon</b>, invoque des <b>champions</b> avec 💠 et 🎟️, puis fais-les monter et ascensionner.",
      "Les <b>runes</b> s'ouvrent au Panthéon pour de nouvelles compétences.",
    ],
    res: [R.mana!, R.tickets!, R.runes!],
  },
];

const shown = ref(false);
const index = ref(0);
const card = computed(() => CARDS[index.value]!);

function open() {
  index.value = 0;
  shown.value = true;
}
function close() {
  shown.value = false;
  markTutorialSeen();
}
defineExpose({ open });

// 1re visite seulement : la même mémoire que l'ancienne intro (`muscu:adv:intro`), donc
// un joueur qui l'avait fermée ne la revoit pas.
onMounted(() => {
  if (!tutorialSeen()) open();
});

// Balayage : un glissement horizontal net change de carte (les boutons restent la voie sûre).
let x0 = 0;
let y0 = 0;
function onTouchStart(e: TouchEvent) {
  const t = e.changedTouches[0];
  if (!t) return;
  x0 = t.clientX;
  y0 = t.clientY;
}
function onTouchEnd(e: TouchEvent) {
  const t = e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - x0;
  const dy = t.clientY - y0;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0 && index.value < CARDS.length - 1) index.value++;
  else if (dx > 0 && index.value > 0) index.value--;
}
</script>

<style scoped>
.gt {
  margin-bottom: 14px;
  padding: 12px 14px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent) 10%, var(--surface)),
    var(--surface) 75%
  );
  min-width: 0;
  overflow: hidden;
}
.gt-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gt-step {
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--dim);
}
.gt-x {
  width: 44px;
  height: 44px;
  margin: -8px -8px -8px 0;
  border: none;
  background: transparent;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.gt-card {
  text-align: center;
  animation: gt-in 0.22s ease-out;
  min-height: 250px;
}
@keyframes gt-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gt-card {
    animation: none;
  }
}
.gt-emo {
  font-size: 34px;
  line-height: 1.1;
}
.gt-h {
  margin: 4px 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  overflow-wrap: anywhere;
}
.gt-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
}
.gt-list li {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  border: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.gt-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
}
.gt-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 12px;
  color: var(--text);
}
.gt-ico {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}
.gt-dots {
  display: flex;
  justify-content: center;
}
.gt-dot {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.gt-dot span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--line);
  transition: all 0.2s;
}
.gt-dot span.on {
  width: 22px;
  border-radius: 5px;
  background: var(--accent);
}
.gt-nav {
  display: flex;
  gap: 8px;
}
.gt-btn {
  flex: 1;
  min-height: 44px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-ink, #15120e);
  font-family: var(--font-display);
  font-weight: 700;
  cursor: pointer;
}
.gt-btn.ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text);
}
</style>
