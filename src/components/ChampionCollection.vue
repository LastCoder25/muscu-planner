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
        <div
          v-for="c in g.entries"
          :key="c.champ.id"
          class="cc-tile"
          :class="{ found: c.owned }"
          :title="c.owned ? c.champ.name : 'Pas encore invoqué'"
        >
          <!-- Un id nul rend déjà le repli : l'emoji du champion découvert, le ❔ sinon. -->
          <span class="cc-emo">
            <ChampionPortrait :champion-id="c.owned ? c.champ.id : null">{{
              c.owned ? c.champ.emoji : '❔'
            }}</ChampionPortrait>
          </span>
          <span class="cc-name">{{ c.owned ? c.champ.name : '???' }}</span>
          <span v-if="c.owned && c.awaken > 0" class="cc-awk">✨ {{ c.awaken }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { championGroups } from '@/lib/codex';
import { GRADE_COLOR } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';

const props = defineProps<{ advs: Adventurer[] }>();

const groups = computed(() => championGroups(props.advs));
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
.cc-awk {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 9px;
  color: var(--accent);
}
</style>
