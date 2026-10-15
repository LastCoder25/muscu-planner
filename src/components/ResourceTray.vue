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
        ><span class="tb-top"
          ><span class="tb-ico"
            ><RuneIcon v-if="r.id === 'runes'" /><template v-else>{{ r.ico }}</template></span
          >{{ compactNumber(r.value) }}</span
        ><span class="tb-name">{{ r.name }}</span></span
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
  /** Nom court affiché sous le pictogramme (le pictogramme seul ne se lit pas). */
  name: string;
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
      name: 'Énergie',
      ico: '⚡',
      cls: props.energy < 0 ? 'energy deficit' : 'energy',
      value: props.energy,
      title: `Énergie : ${fr(props.energy)} — gagnée en faisant du sport`,
      main: true,
    },
    {
      id: 'mana',
      name: 'Mana',
      ico: '💠',
      cls: 'mana',
      value: row.mana,
      title: `Pierres de mana : ${fr(row.mana)} — invoquer un champion (failles refermées, mines de mana)`,
      main: true,
    },
    {
      id: 'gold',
      name: 'Or',
      ico: '🪙',
      cls: 'gold',
      value: row.gold,
      title: `Or : ${fr(row.gold)} — expéditions et construction des bâtiments`,
      main: false,
    },
    {
      id: 'summon',
      name: 'Invoc.',
      ico: '🔮',
      cls: 'summon',
      value: row.summon_stones,
      title: `Pierres d’invocation : ${fr(row.summon_stones)} — tenter un boss de palier (gagnées en nettoyant des donjons)`,
      main: false,
    },
    {
      id: 'keys',
      name: 'Clés',
      ico: '🗝️',
      cls: 'keys',
      value: row.keys,
      title: `Clés : ${fr(row.keys)} — entrer dans le Labyrinthe (archives de la carte, coffres, boss)`,
      main: false,
    },
    {
      id: 'sealsChamp',
      name: 'Sceaux',
      ico: '🔱',
      cls: 'seals',
      value: sc.total,
      title: `Sceaux de champion : ${fr(sc.total)} — ascension d’un champion (ruines anciennes)`,
      main: false,
    },
    {
      id: 'sealsGear',
      name: 'Sceaux obj.',
      ico: '⚜️',
      cls: 'seals seals-gear',
      value: sg.total,
      title: `Sceaux d’objet : ${fr(sg.total)} — ascension d’un objet de champion (ruines anciennes)`,
      main: false,
    },
    {
      id: 'tickets',
      name: 'Tickets',
      ico: '🎟️',
      cls: 'tickets',
      value: row.gacha_tickets,
      title: "Tickets d'invocation — gagnés au sport (Défi 360, boss entre amis, niveau)",
      main: false,
    },
    {
      id: 'runes',
      name: 'Runes',
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
/* Chaque ressource porte son NOM sous le pictogramme ; avec ~9 puces le plateau passe sur deux
   lignes à 344 px (plus de défilement latéral caché). Nombres courts (`compactNumber`). */
.tb-tray {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 8px;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 4px 12px;
}
/* ⚡ 💠 sur la ligne du pseudo : la pastille ne prend que sa place. */
.tb-tray.tb-main {
  flex: 0 0 auto;
  width: auto;
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
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.tb-top {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
/* Le nom : petit mais lisible, dans la couleur de la ressource. */
.tb-name {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
  letter-spacing: 0.01em;
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
