<template>
  <!-- 💰 LE PLATEAU DE RESSOURCES — une seule définition pour l'Aventure et la carte des
       expéditions (demandé : « les ressources au-dessus des effectifs, comme ailleurs »).
       `part` : `main` = ⚡ 💠 (la ligne du pseudo de l'Aventure), `rest` = le reste,
       `all` = tout sur une rangée. Toucher une puce émet `pick` (fiche de la ressource) ;
       sans `interactive`, les puces ne sont que des indicateurs (infobulle gardée). -->
  <div class="tb-tray" :class="{ 'tb-main': part === 'main' }">
    <template v-for="r in shown" :key="r.id">
      <span
        class="tb-r"
        :class="[r.cls, { clickable: interactive }]"
        :role="interactive ? 'button' : undefined"
        :tabindex="interactive ? 0 : undefined"
        :title="r.title"
        @click="interactive && emit('pick', r.id)"
        @keyup.enter="interactive && emit('pick', r.id)"
        ><span class="tb-ico"
          ><RuneIcon v-if="r.id === 'runes'" /><template v-else>{{ r.ico }}</template></span
        >{{ compactNumber(r.value) }}</span
      >
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RuneIcon from '@/components/RuneIcon.vue';
import { useCharacterStore } from '@/stores/character';
import { compactNumber } from '@/lib/compactNumber';
import { emptySeals, sealsSummary } from '@/lib/ascension';
import type { ResourceId } from '@/data/resourceSources';

const props = withDefaults(
  defineProps<{
    /** L'énergie disponible (calculée par l'écran : elle dépend de l'XP de sport). */
    energy: number;
    part?: 'main' | 'rest' | 'all';
    interactive?: boolean;
  }>(),
  { part: 'all', interactive: false },
);
const emit = defineEmits<{ pick: [id: ResourceId | 'runes'] }>();

const char = useCharacterStore();
const fr = (n: number) => n.toLocaleString('fr-FR');

interface Chip {
  id: ResourceId | 'runes';
  ico: string;
  cls: string;
  value: number;
  title: string;
  main: boolean;
}
const chips = computed<Chip[]>(() => {
  const row = char.row;
  if (!row) return [];
  const sc = sealsSummary(row.seals ?? emptySeals(), 'champion');
  const sg = sealsSummary(row.seals ?? emptySeals(), 'gear');
  return [
    {
      id: 'energy',
      ico: '⚡',
      cls: props.energy < 0 ? 'energy deficit' : 'energy',
      value: props.energy,
      title: `Énergie : ${fr(props.energy)} — gagnée en faisant du sport`,
      main: true,
    },
    {
      id: 'mana',
      ico: '💠',
      cls: 'mana',
      value: row.mana,
      title: `Pierres de mana : ${fr(row.mana)} — invoquer un champion (failles refermées, mines de mana)`,
      main: true,
    },
    {
      id: 'gold',
      ico: '🪙',
      cls: 'gold',
      value: row.gold,
      title: `Or : ${fr(row.gold)} — expéditions et construction des bâtiments`,
      main: false,
    },
    {
      id: 'summon',
      ico: '🔮',
      cls: 'summon',
      value: row.summon_stones,
      title: `Pierres d’invocation : ${fr(row.summon_stones)} — tenter un boss de palier (gagnées en nettoyant des donjons)`,
      main: false,
    },
    {
      id: 'keys',
      ico: '🗝️',
      cls: 'keys',
      value: row.keys,
      title: `Clés : ${fr(row.keys)} — entrer dans le Labyrinthe (archives de la carte, coffres, boss)`,
      main: false,
    },
    {
      id: 'sealsChamp',
      ico: '🔱',
      cls: 'seals',
      value: sc.total,
      title: `Sceaux de champion — ascension d’un champion (ruines anciennes) : ${sc.detail || 'aucun pour l’instant'}`,
      main: false,
    },
    {
      id: 'sealsGear',
      ico: '⚜️',
      cls: 'seals seals-gear',
      value: sg.total,
      title: `Sceaux d’objet — ascension d’un objet de champion (ruines anciennes) : ${sg.detail || 'aucun pour l’instant'}`,
      main: false,
    },
    {
      id: 'tickets',
      ico: '🎟️',
      cls: 'tickets',
      value: row.gacha_tickets,
      title: "Tickets d'invocation — gagnés au sport (Défi 360, boss entre amis, niveau)",
      main: false,
    },
    {
      id: 'runes',
      ico: '',
      cls: 'runes',
      value: row.runes.runes,
      title: `Runes multicolores à ouvrir au Panthéon — ${fr(row.runes.runes)} · compétences au stock : ${fr(row.runes.skills.length)}`,
      main: false,
    },
  ];
});
const shown = computed(() =>
  props.part === 'all'
    ? chips.value
    : chips.value.filter((c) => c.main === (props.part === 'main')),
);
</script>

<style scoped>
/* ⚠️ LES RESSOURCES SUR UNE SEULE LIGNE (demandé) : le plateau ne passe JAMAIS à la ligne.
   Les nombres sont courts (`compactNumber`), la valeur exacte vit dans l'infobulle. Filet de
   sécurité : si tout ne tient pas (Z Fold plié), la rangée DÉFILE sur le côté. */
.tb-tray {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 8px;
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 12px;
}
.tb-tray::-webkit-scrollbar {
  display: none;
}
/* ⚡ 💠 sur la ligne du pseudo : la pastille ne prend que sa place. */
.tb-tray.tb-main {
  flex: 0 0 auto;
  width: auto;
  overflow: visible;
}
@media (max-width: 420px) {
  .tb-tray {
    gap: 4px;
    padding: 4px 8px;
  }
  .tb-tray .tb-r {
    font-size: 12px;
  }
}
/* ⚠️ L'icône vit dans une BOÎTE FIXE : les emojis n'ont pas tous la même hauteur ni la
   même ligne de base selon la police du téléphone (⚜️ et 🔱 décrochaient de la rangée). */
.tb-r {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.tb-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25em;
  height: 1.25em;
  line-height: 1;
  flex-shrink: 0;
}
.tb-r.energy {
  color: #8fd0ff;
}
.tb-r.gold {
  color: var(--accent);
}
.tb-r.summon {
  color: #e08bd8;
}
.tb-r.keys {
  color: #d9c48a;
}
/* 💠 Le violet du mana, celui des tracés de convoi et de l’invocation. */
.tb-r.mana {
  color: #b57bff;
}
.tb-r.tickets {
  color: var(--accent);
}
.tb-r.seals {
  color: #7fd4c1;
}
.tb-r.seals-gear {
  color: #e0b36a;
}
.tb-r.energy.deficit {
  color: var(--d4, #ff6a45);
}
.tb-r.clickable {
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
</style>
