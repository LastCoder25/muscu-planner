<!--
  📋 LE DÉTAIL D'UN RAPPORT, UN SEUL MODÈLE (cf. `lib/reportDetail.ts`) : des chiffres clés
  en tête, puis des sections titrées dont chaque ligne a la même anatomie — icône, titre,
  sous-titre, valeur à droite, marques. Un rapport de mission et un siège se lisent pareil.
  Ce composant ne décide rien : il peint ce que la lib a rangé.
-->
<template>
  <div class="rd">
    <div v-if="detail.stats.length" class="rd-stats">
      <div v-for="s in detail.stats" :key="s.label" class="rd-stat">
        <span class="rd-val" :class="s.tone">{{ s.val }}</span>
        <span class="rd-lab">{{ s.label }}</span>
      </div>
    </div>
    <section v-for="sec in detail.sections" :key="sec.id" class="rd-sec" :class="sec.layout">
      <h4>
        <span class="rd-h-ico">{{ sec.icon }}</span> {{ sec.title }}
        <span v-if="sec.count" class="rd-cnt">{{ sec.count }}</span>
        <span v-if="sec.aside" class="rd-aside">{{ sec.aside }}</span>
      </h4>
      <!-- Ce que l'écran ajoute à une section (les ressources du butin), sous son titre. -->
      <slot :name="sec.id" />
      <p v-if="sec.layout === 'text'" class="rd-text">{{ sec.text }}</p>
      <div v-else-if="sec.layout === 'chips'" class="rd-chips">
        <span v-for="(r, i) in sec.rows" :key="i" class="rd-chip" :class="r.tone">{{
          r.title
        }}</span>
      </div>
      <component
        :is="sec.layout === 'steps' ? 'ol' : 'ul'"
        v-else-if="sec.rows.length"
        class="rd-rows"
      >
        <li
          v-for="(r, i) in sec.rows"
          :key="i"
          class="rd-row"
          :class="[{ muted: r.muted }, sec.layout === 'log' && r.tone && `t-${r.tone}`]"
        >
          <span
            v-if="(sec.layout === 'list' || sec.layout === 'log') && (r.item || r.icon)"
            class="rd-ico"
          >
            <ItemIcon v-if="r.item" :item="r.item" :size="32" />
            <template v-else>{{ r.icon }}</template>
          </span>
          <span class="rd-main">
            <span class="rd-title" :class="sec.layout !== 'log' && !r.value && r.tone">{{
              r.title
            }}</span>
            <span v-if="r.sub" class="rd-sub">{{ r.sub }}</span>
            <span v-if="r.note" class="rd-note">{{ r.note }}</span>
          </span>
          <span v-if="r.tags?.length" class="rd-tags">
            <span v-for="t in r.tags" :key="t.icon" :title="t.title" :aria-label="t.title">{{
              t.icon
            }}</span>
          </span>
          <b v-if="r.value" class="rd-value" :class="r.tone">{{ r.value }}</b>
        </li>
      </component>
    </section>
  </div>
</template>

<script setup lang="ts">
import ItemIcon from '@/components/ItemIcon.vue';
import type { ReportDetail } from '@/lib/reportDetail';

defineProps<{ detail: ReportDetail }>();
</script>

<style scoped lang="scss">
.rd {
  display: grid;
  gap: 8px;
  font-size: 12.5px;
  min-width: 0;
}
/* Chiffres clés : une grille de petites cases, valeur en gros, libellé dessous. */
.rd-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 6px;
}
.rd-stat {
  display: grid;
  gap: 1px;
  padding: 7px 9px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 45%, var(--surface-2));
  min-width: 0;
}
.rd-val {
  font-family: 'Oswald', sans-serif;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rd-lab {
  font-size: 10.5px;
  color: var(--dim);
  line-height: 1.25;
}
.acc {
  color: var(--accent);
}
.xp,
.win {
  color: var(--d1);
}
.lose {
  color: var(--d4);
}
.dim {
  color: var(--dim);
}
/* Un encart par sujet : titre en capitales, contenu dessous. */
.rd-sec {
  display: grid;
  gap: 6px;
  padding: 8px 10px 9px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg) 45%, var(--surface-2));
  min-width: 0;
}
.rd-sec h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
}
.rd-cnt {
  font-size: 10.5px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  letter-spacing: 0;
}
.rd-text {
  margin: 0;
  padding-left: 8px;
  border-left: 2px solid var(--line);
  color: var(--dim);
  font-style: italic;
  line-height: 1.45;
}
.rd-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
/* La ligne : [icône] contenu [marques] [valeur à droite]. */
.rd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  min-width: 0;
}
.list .rd-row + .rd-row {
  border-top: 1px solid var(--line-soft);
}
.rd-row.muted {
  opacity: 0.55;
}
.rd-ico {
  flex: none;
  width: 32px;
  display: flex;
  justify-content: center;
  font-size: 18px;
}
.rd-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 1px;
}
.rd-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.rd-sub,
.rd-note {
  font-size: 11.5px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.rd-tags {
  flex: none;
  display: flex;
  gap: 3px;
}
.rd-value {
  flex: none;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* La frise : un point par étape, relié au suivant. */
.timeline .rd-row {
  position: relative;
  padding: 3px 0 3px 16px;
}
.timeline .rd-title {
  font-weight: 400;
}
.timeline .rd-row::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dim);
}
.timeline .rd-row:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 5.5px;
  top: 17px;
  bottom: -5px;
  width: 1px;
  background: var(--line);
}
/* Le résumé d'une section, poussé à droite de son titre. */
.rd-aside {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* Le journal de combat : une ligne par coup décisif, un liseré qui dit qui a eu le
   dessus — vert quand un ennemi tombe, rouge quand c'est l'un des nôtres. */
.log .rd-rows {
  gap: 3px;
}
.log .rd-row {
  padding: 4px 8px 4px 6px;
  gap: 6px;
  border-left: 3px solid var(--line);
  border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
}
.log .rd-ico {
  width: 20px;
  font-size: 14px;
}
.log .rd-title {
  font-weight: 500;
  font-size: 12px;
}
.log .rd-row.t-win {
  border-left-color: var(--d1);
}
.log .rd-row.t-lose {
  border-left-color: var(--d4);
}
.log .rd-row.t-dim .rd-title {
  color: var(--dim);
}
/* Les pastilles : un butin en devises tient sur une ligne. */
.rd-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rd-chip {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* Le journal : numéroté, discret. */
.steps .rd-rows {
  list-style: decimal;
  padding-left: 18px;
}
.steps .rd-row {
  display: list-item;
  padding: 1px 0;
  color: var(--dim);
  font-size: 11.5px;
  line-height: 1.4;
}
.steps .rd-title {
  font-weight: 400;
}
</style>
