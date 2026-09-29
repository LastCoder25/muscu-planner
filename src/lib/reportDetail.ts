// 📋 LE DÉTAIL D'UN RAPPORT, UN SEUL MODÈLE (demandé : « un affichage structuré avec un
// modèle commun »). Un rapport de mission et le compte rendu d'un siège se lisaient chacun
// à sa façon : ici, les deux deviennent la MÊME forme — des chiffres clés en tête, puis des
// sections titrées dont chaque ligne a la même anatomie (icône · titre · sous-titre · valeur
// à droite · marques). `ReportDetail.vue` la peint ; ce module ne recalcule rien, il range.
import { formatDuration } from './duration';
import { SLOT_LABEL, gradeLabel, itemEffectsText, type Item } from './items';
import type { MissionCard } from './missionCard';
import {
  FACTION_EMOJI,
  FACTION_LABEL,
  battleLootPills,
  type BattleLoot,
  type RaidReport,
} from './raid';

type ReportTone = 'acc' | 'xp' | 'win' | 'lose' | 'dim';

/** Un chiffre clé : la valeur en gros, le libellé dessous. */
interface ReportStat {
  label: string;
  val: string;
  tone?: ReportTone;
}

/** Une marque courte au bout d'une ligne (⭐ étoile gagnée, 🤕 blessé…). */
interface ReportTag {
  icon: string;
  title: string;
}

/** Une ligne de section — même anatomie partout. */
interface ReportRow {
  icon: string;
  title: string;
  sub?: string;
  /** Une seconde ligne de détail (effets d'un objet). */
  note?: string;
  /** Aligné à droite. */
  value?: string;
  tone?: ReportTone;
  tags?: ReportTag[];
  /** L'objet dessiné à la place de l'icône. */
  item?: Omit<Item, 'id'>;
  /** Grisé : un champion parti depuis, un corps qui n'a rien laissé. */
  muted?: boolean;
}

/** `list` : lignes alignées · `timeline` : une frise, un point par étape · `steps` : un
 *  journal numéroté · `chips` : des pastilles (un butin en devises) · `text` : un récit. */
type ReportLayout = 'list' | 'timeline' | 'steps' | 'chips' | 'text';

interface ReportSection {
  id: string;
  icon: string;
  title: string;
  /** Pastille de compte à côté du titre (absent = pas de pastille). */
  count?: number;
  layout: ReportLayout;
  rows: ReportRow[];
  text?: string;
}

export interface ReportDetail {
  stats: ReportStat[];
  sections: ReportSection[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
const fmtRate = (n: number) =>
  (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('fr-FR');
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Ne garde que les sections qui ont quelque chose à dire. */
const filled = (s: ReportSection) => (s.layout === 'text' ? !!s.text : s.rows.length > 0);

/** Le détail d'un rapport de mission (boîte 📬, fenêtre de retour de la carte). */
export function missionDetail(c: MissionCard): ReportDetail {
  const stats: ReportStat[] = [];
  if (c.travelMs) stats.push({ label: 'de voyage', val: formatDuration(c.travelMs) });
  if (c.xpPerHour)
    stats.push({ label: 'XP/h par champion', val: `≈ ${fmtRate(c.xpPerHour)}`, tone: 'acc' });
  if (c.kills) stats.push({ label: 'abattus', val: c.kills.replace(/ abattus$/, '') });
  if (c.totalXp) stats.push({ label: 'XP au total', val: `+${fmt(c.totalXp)}`, tone: 'xp' });

  const sections: ReportSection[] = [
    { id: 'story', icon: '📖', title: 'Récit', layout: 'text', rows: [], text: c.story },
    {
      id: 'loot',
      icon: '🎁',
      title: 'Butin',
      count: c.loot.length + c.lootMore,
      layout: 'list',
      rows: [
        ...c.loot.map((it) => ({
          icon: '🎁',
          item: it,
          title: `${it.name}${it.setId ? ' 🧩' : ''}`,
          sub: `${gradeLabel(it)} · ${SLOT_LABEL[it.slot]}`,
          note: itemEffectsText(it),
        })),
        ...(c.lootMore > 0
          ? [{ icon: '🎒', title: `+${plural(c.lootMore, 'objet')} au sac`, tone: 'dim' as const }]
          : []),
      ],
    },
    {
      id: 'road',
      icon: '🛣️',
      title: 'Route',
      count: c.road.length,
      layout: 'timeline',
      rows: c.road.map((e) => ({
        icon: '•',
        title: e.text,
        value: e.slain ? `⚔️ ${e.slain}` : undefined,
        tone: 'dim' as const,
      })),
    },
    {
      id: 'team',
      icon: '🧭',
      title: 'Équipe',
      count: c.team.length + (c.hero ? 1 : 0),
      layout: 'list',
      rows: [
        ...(c.hero && c.team.length
          ? [{ icon: '🧝', title: 'Héros', sub: 'son XP vient du sport' }]
          : []),
        ...c.team.map((m) => {
          const tags: ReportTag[] = [];
          if (m.star) tags.push({ icon: '⭐', title: 'Une étoile de plus' });
          if (m.hurt) tags.push({ icon: '🤕', title: 'Blessé : à l’infirmerie' });
          else if (m.lightHurt)
            tags.push({ icon: '🩹', title: 'Victoire serrée : courte convalescence' });
          const bits: string[] = [];
          if (m.kills) bits.push(`⚔️ ${m.kills} abattu${m.kills > 1 ? 's' : ''}`);
          if (m.down && !m.hurt && !m.lightHurt) bits.push('à terre, relevé');
          if (m.gone) bits.push('parti depuis');
          return {
            icon: m.emoji,
            title: m.name,
            sub: bits.join(' · ') || undefined,
            value: `+${fmt(m.xp)} XP`,
            tone: 'xp' as const,
            tags,
            muted: m.gone,
          };
        }),
      ],
    },
    {
      id: 'journal',
      icon: '📜',
      title: 'Journal',
      count: c.journal.length,
      layout: 'steps',
      rows: c.journal.map((l) => ({ icon: '', title: l })),
    },
  ];
  return { stats, sections: sections.filter(filled) };
}

/** Le compte rendu du dernier siège (Tour de guet). */
export function siegeDetail(r: RaidReport, loot?: BattleLoot | null): ReportDetail {
  const wall = r.maxPv > 0 ? Math.round((100 * Math.max(0, r.finalPv)) / r.maxPv) : 0;
  const wounded = new Set(r.wounded ?? []);
  const stats: ReportStat[] = [
    {
      label: 'groupes repoussés',
      val: `${r.defeated}/${r.total}`,
      tone: r.held ? 'win' : 'lose',
    },
    { label: 'rempart restant', val: `${wall} %`, tone: wall > 0 ? undefined : 'lose' },
    { label: 'brèche', val: r.breached ? 'ouverte' : 'tenue', tone: r.breached ? 'lose' : 'win' },
    { label: 'héros', val: r.heroHome ? 'présent' : 'absent', tone: r.heroHome ? 'acc' : 'dim' },
  ];
  const sections: ReportSection[] = [
    {
      id: 'army',
      icon: FACTION_EMOJI[r.faction],
      title: FACTION_LABEL[r.faction],
      count: r.groups.reduce((s, g) => s + g.count, 0),
      layout: 'list',
      // ⚠️ Pas de « repoussé » par groupe : le rapport ne garde que le TOTAL (les corps
      // tombés ne sont pas rattachés à leur groupe dans ce qui est stocké).
      rows: r.groups.map((g) => ({
        icon: g.emoji,
        title: `${g.species}${g.champion ? ' 👑' : ''}`,
        sub: `${g.kind === 'ranged' ? 'tir' : 'corps à corps'} · niv ${g.level}`,
        value: `×${g.count}`,
      })),
    },
    {
      id: 'defenders',
      icon: '🛡️',
      title: 'Défenseurs',
      count: r.defenders?.length ?? 0,
      layout: 'list',
      rows: (r.defenders ?? []).map((d) => ({
        icon: d.emoji,
        title: d.name,
        sub: d.kind === 'ranged' ? 'sur le rempart' : 'dans la cour',
        tags: wounded.has(d.id) ? [{ icon: '🤕', title: 'Blessé : à l’infirmerie' }] : [],
      })),
    },
    {
      id: 'loot',
      icon: '🦴',
      title: 'Ramassé sur les corps',
      layout: 'chips',
      rows: battleLootPills(loot).map((p) => ({ icon: '', title: p, tone: 'win' as const })),
    },
  ];
  return { stats, sections: sections.filter(filled) };
}
