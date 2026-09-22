<template>
  <!-- 🏅 LA COLLECTION DES CHAMPIONS, rangée par rareté (demandé : « voir ce qu'on a ou pas
       et leur rareté »). ⚠️ UN SEUL composant pour le Codex ET le Panthéon : deux copies
       de la même galerie finiraient par ne plus compter pareil.
       ⚠️ Elle annonce ce qui EXISTE, jamais ce qui est PROBABLE : pas un taux. Les chances
       vivent sur l'écran d'invocation, dont c'est le métier. -->
  <div class="cc">
    <section
      v-for="g in groups"
      :key="g.grade"
      class="cc-grp"
      :style="{ '--rk': GRADE_COLOR[g.grade] }"
    >
      <header class="cc-h">
        <span class="cc-rar font-display">{{ g.grade }}</span>
        <span class="cc-bar" aria-hidden="true"
          ><i :style="{ width: (g.owned / g.total) * 100 + '%' }"
        /></span>
        <span class="cc-n font-display" :class="{ full: g.owned === g.total }"
          >{{ g.owned }}/{{ g.total }}</span
        >
      </header>
      <div class="cc-grid">
        <!-- Un champion possédé s'ouvre EN GRAND au toucher ; un non-invoqué reste muet
             (il n'y a rien à montrer derrière le ❔). -->
        <component
          :is="c.owned ? 'button' : 'div'"
          v-for="c in g.entries"
          :key="c.champ.id"
          :type="c.owned ? 'button' : undefined"
          class="cc-tile"
          :class="{ found: c.owned }"
          :title="c.owned ? c.champ.name : 'Pas encore invoqué'"
          @click="c.owned && (zoomed = c)"
        >
          <!-- Un id nul rend déjà le repli : l'emoji du champion découvert, le ❔ sinon. -->
          <span class="cc-emo">
            <ChampionPortrait :champion-id="c.owned ? c.champ.id : null">{{
              c.owned ? c.champ.emoji : '❔'
            }}</ChampionPortrait>
          </span>
          <span class="cc-name">{{ c.owned ? c.champ.name : '???' }}</span>
          <span v-if="c.owned && c.awaken > 0" class="cc-awk">✨ {{ c.awaken }}</span>
        </component>
      </div>
    </section>

    <q-dialog v-model="zoomOpen">
      <q-card v-if="zoomed" class="cc-zoom" :style="{ '--rk': GRADE_COLOR[zoomed.champ.grade] }">
        <button class="cc-zoom-x" type="button" aria-label="Fermer" @click="zoomed = null">
          ✕
        </button>
        <div class="cc-zoom-img">
          <ChampionPortrait :champion-id="zoomed.champ.id" large>{{
            zoomed.champ.emoji
          }}</ChampionPortrait>
        </div>
        <div class="cc-zoom-name font-display">{{ zoomed.champ.name }}</div>
        <div class="cc-zoom-meta">
          <span class="cc-zoom-grade font-display">{{ zoomed.champ.grade }}</span>
          <span v-if="zoomed.awaken > 0" class="cc-zoom-awk">✨ Éveil {{ zoomed.awaken }}</span>
        </div>
        <ul class="cc-zoom-skills">
          <li v-if="zoomed.champ.role">{{ ADV_ROLE_LABEL[zoomed.champ.role] }}</li>
          <li v-for="k in zoomed.champ.skills" :key="k">{{ ADV_SIGNATURE_LABEL[k] ?? k }}</li>
        </ul>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { championGroups } from '@/lib/codex';
import { GRADE_COLOR } from '@/data/champions';
import { ADV_ROLE_LABEL, ADV_SIGNATURE_LABEL, type Adventurer } from '@/lib/adventurers';

const props = defineProps<{ advs: Adventurer[] }>();

const groups = computed(() => championGroups(props.advs));

type Entry = ReturnType<typeof championGroups>[number]['entries'][number];
/** Le champion affiché en grand (null = fermé). */
const zoomed = ref<Entry | null>(null);
const zoomOpen = computed({
  get: () => zoomed.value !== null,
  set: (v) => {
    if (!v) zoomed.value = null;
  },
});
</script>

<style scoped>
.cc {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cc-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 7px;
}
.cc-rar {
  color: var(--rk);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.cc-bar {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rk) 16%, transparent);
  overflow: hidden;
}
.cc-bar i {
  display: block;
  height: 100%;
  background: var(--rk);
}
.cc-n {
  font-size: 13px;
  color: var(--dim);
  font-weight: 700;
}
.cc-n.full {
  color: var(--rk);
}
.cc-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}
/* ⚠️ Une tuile NON possédée garde la teinte de sa rareté, en pâle : on voit ce qui manque
   ET à quel rang. Possédée, elle passe en plein. */
.cc-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 3px 7px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--rk) 5%, var(--bg));
  border: 1px dashed color-mix(in srgb, var(--rk) 35%, var(--line));
  min-width: 0;
}
button.cc-tile {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
button.cc-tile:active {
  transform: scale(0.96);
}
button.cc-tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.cc-tile:not(.found) .cc-emo,
.cc-tile:not(.found) .cc-name {
  opacity: 0.5;
}
.cc-tile.found {
  border-style: solid;
  border-color: color-mix(in srgb, var(--rk) 70%, var(--line));
  background: color-mix(in srgb, var(--rk) 14%, var(--bg));
}
/* ⚠️ TOUTES LES TUILES À LA MÊME TAILLE, d'un groupe de rareté à l'autre : la vignette vit
   dans une boîte FIXE (un portrait est plus haut qu'un emoji) et le nom occupe toujours
   DEUX lignes, coupé au-delà (nom complet dans l'info-bulle de la tuile). Une hauteur
   fixe plutôt que `grid-auto-rows: 1fr`, qui n'égaliserait qu'à l'intérieur d'UNE grille. */
.cc-emo {
  font-size: 26px;
  line-height: 1;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cc-name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.15;
  overflow-wrap: anywhere;
  width: 100%;
  height: 2.3em;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
/* Vue en grand : le portrait 560 px, cadré par la couleur de sa lettre. */
.cc-zoom {
  position: relative;
  width: min(92vw, 380px);
  padding: 18px 16px 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--rk) 60%, var(--line));
  background: var(--surface);
  text-align: center;
}
.cc-zoom-x {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 44px;
  height: 44px;
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.cc-zoom-img {
  font-size: min(64vw, 260px);
  line-height: 1;
  display: flex;
  justify-content: center;
  margin: 8px auto 10px;
}
.cc-zoom-img :deep(.cp) {
  width: min(70vw, 280px);
  height: min(70vw, 280px);
  border-radius: 14px;
  box-shadow: 0 0 24px color-mix(in srgb, var(--rk) 40%, transparent);
}
.cc-zoom-name {
  font-size: 20px;
  font-weight: 700;
}
.cc-zoom-meta {
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: center;
  margin: 4px 0 8px;
}
.cc-zoom-grade {
  color: var(--rk);
  font-weight: 800;
  font-size: 16px;
}
.cc-zoom-awk {
  color: var(--accent);
  font-size: 13px;
}
.cc-zoom-skills {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.6;
}
.cc-awk {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 9px;
  color: var(--accent);
}
</style>
