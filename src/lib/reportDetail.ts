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
type ReportLayout = 'list' | 'timeline' | 'steps' | 'chips' | 'text' | 'log';

interface ReportSection {
  id: string;
  icon: string;
  title: string;
  /** Pastille de compte à côté du titre (absent = pas de pastille). */
  count?: number;
  layout: ReportLayout;
  rows: ReportRow[];
  text?: string;
  /** Un résumé court à droite du titre (« ⚔️ 3/3 · +120 XP »). */
  aside?: string;
  /** Affichée même vide : son contenu vient d'ailleurs (les ressources du butin). */
  keep?: boolean;
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
const filled = (s: ReportSection) =>
  !!s.keep || (s.layout === 'text' ? !!s.text : s.rows.length > 0);

/** Une ligne de journal « X abat Y » / « X met à terre Y » (`campJournal`). */
const KILL_LINE = /^(\S+)\s+(.+?)\s+(abat|met à terre)\s+(.+)$/u;
/** Une ligne qui commence par son pictogramme (« 🏆 … », « Route tranquille. » n'en a pas). */
const TAGGED = /^(\p{Extended_Pictographic}️?)\s+(.+)$/u;

/** Une ligne de combat, rangée : l'icône de celui qui frappe, le reste en titre, la teinte
 *  dit qui a eu le dessus (un ennemi abattu en vert, un des nôtres à terre en rouge). */
function combatRow(line: string): ReportRow {
  const k = KILL_LINE.exec(line);
  if (k) {
    const [, emo, who, verb, target] = k;
    return {
      icon: emo!,
      title: `${who} ${verb} ${target}`,
      tone: verb === 'abat' ? 'win' : 'lose',
    };
  }
  const t = TAGGED.exec(line);
  const icon = t ? t[1]! : '•';
  const title = t ? t[2]! : line;
  let tone: ReportTone = 'dim';
  if (icon.startsWith('💀')) tone = 'lose';
  else if (icon.startsWith('🏆') || /abattu/u.test(title)) tone = 'win';
  return { icon, title, tone };
}

/** Des lignes identiques (une « Route tranquille » par trajet) deviennent UNE ligne avec
 *  « ×2 » à droite, à la place de leur première apparition. */
function merged(lines: readonly string[]): ReportRow[] {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([l, n]) => {
    const t = TAGGED.exec(l);
    return {
      icon: t ? t[1]! : '•',
      title: t ? t[2]! : l,
      tone: 'dim' as const,
      ...(n > 1 ? { value: `×${n}` } : {}),
    };
  });
}

/** Le journal coupé en deux : ce qui s'est passé au COMBAT, et en ROUTE. Une incursion ou
 *  une bataille rangée n'a pas de route : tout y est combat. */
export function splitJournal(
  journal: readonly string[],
  allCombat: boolean,
): { combat: ReportRow[]; events: ReportRow[] } {
  if (allCombat) return { combat: journal.map(combatRow), events: [] };
  const combat: string[] = [];
  const events: string[] = [];
  for (const l of journal) (KILL_LINE.test(l) || l.startsWith('… et ') ? combat : events).push(l);
  return { combat: combat.map(combatRow), events: merged(events) };
}

/** Ce que le récit dit DE PLUS que le journal, le verdict et le butin. Il les répète
 *  souvent (« Faille refermée — … 2/2 abattus · +54 💠 ») : ce qui reste est tu s'il n'a
 *  plus rien à dire. */
export function storyExtra(text: string, journal: readonly string[], verdict = ''): string | null {
  let rest = text;
  for (const l of journal) if (l) rest = rest.split(l).join(' ');
  rest = rest
    .replace(/\d+\/\d+\s+(gardes\s+)?abattus\.?/gu, ' ')
    .replace(/·\s*\+[\d\s]+\S*/gu, ' ');
  const v = verdict.toLowerCase();
  rest = rest
    .split(/(?<=[.!?])\s+/u)
    .filter((s) => !(v && s.toLowerCase().includes(v)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return rest.replace(/[^\p{L}]/gu, '').length >= STORY_MIN_LETTERS ? rest : null;
}
/** En dessous, il ne reste que le verdict (« ⚔️ Camp pris ! 🐺 ») : déjà dit en tête. */
const STORY_MIN_LETTERS = 14;

/** Le CORPS d'un rapport de mission, toujours visible : ce qu'il rapporte, qui y était. */
/** 🧭 Où renvoyer un blessé une fois guéri : son point fixe, ou rien s'il vient de la base
 *  (il y est déjà). */
function backTo(from: string | null): string {
  return from ? `à renvoyer vers ${from}` : 'parti de la base';
}

export function missionMain(c: MissionCard): ReportDetail {
  const teamBits: string[] = [];
  if (c.kills) teamBits.push(`⚔️ ${c.kills.replace(/ abattus$/, '')}`);
  if (c.totalXp) teamBits.push(`+${fmt(c.totalXp)} XP`);
  const sections: ReportSection[] = [
    {
      id: 'loot',
      icon: '🎁',
      title: 'Butin',
      layout: 'list',
      // ⚠️ Affiché même sans objet : les ressources, elles, se dessinent au-dessus des
      // lignes (`HaulPills`, qui dit ce qu'est chaque ressource au toucher).
      keep: true,
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
        ...(c.legacyItem ? [{ icon: '🎁', title: c.legacyItem }] : []),
      ],
    },
    {
      id: 'team',
      icon: '🧭',
      title: 'Équipe',
      aside: teamBits.join(' · ') || undefined,
      layout: 'list',
      rows: [
        // 🧭 D'où le groupe est parti et où il allait (demandé : « savoir où le renvoyer
        // une fois guéri »).
        ...(c.route
          ? [
              {
                icon: '🧭',
                title: `${c.route.from} → ${c.route.to}`,
                sub: 'départ → arrivée',
                tone: 'dim' as const,
              },
            ]
          : []),
        ...(c.hero
          ? [{ icon: '🧝', title: 'Héros', sub: 'son XP vient du sport', tone: 'dim' as const }]
          : []),
        ...c.team.map((m) => {
          const tags: ReportTag[] = [];
          // 🏥 Un blessé sorti d'un point fixe rentre soigné à la BASE : le rapport dit où il
          // tenait garnison, pour l'y renvoyer.
          const sendBack = c.route && (m.hurt || m.lightHurt) ? backTo(m.from) : null;
          if (m.star) tags.push({ icon: '⭐', title: 'Une étoile de plus' });
          if (m.hurt)
            tags.push({
              icon: '🤕',
              title: `Blessé : à l’infirmerie${sendBack ? `, puis ${sendBack}` : ''}`,
            });
          else if (m.lightHurt)
            tags.push({
              icon: '🩹',
              title: `Victoire serrée : courte convalescence${sendBack ? `, puis ${sendBack}` : ''}`,
            });
          const bits: string[] = [];
          if (m.kills) bits.push(`⚔️ ${plural(m.kills, 'abattu')}`);
          if (m.hurt) bits.push('à l’infirmerie');
          else if (m.lightHurt) bits.push('légèrement blessé');
          else if (m.down) bits.push('à terre, relevé');
          if (sendBack) bits.push(sendBack);
          else if (c.route?.mixed) bits.push(`depuis ${m.from ?? 'la base'}`);
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
  ];
  return { stats: [], sections: sections.filter(filled) };
}

/** Le DÉTAIL d'un rapport de mission, replié : le récit, le combat, la route. */
export function missionDetail(c: MissionCard): ReportDetail {
  const stats: ReportStat[] = [];
  if (c.travelMs) stats.push({ label: 'de voyage', val: formatDuration(c.travelMs) });
  if (c.xpPerHour)
    stats.push({ label: 'XP/h par champion', val: `≈ ${fmtRate(c.xpPerHour)}`, tone: 'acc' });
  const { combat, events } = splitJournal(c.journal, !!(c.party?.rift || c.party?.battle));
  const story = c.journal.length ? storyExtra(c.story, c.journal, c.verdict) : c.story || null;
  const sections: ReportSection[] = [
    { id: 'story', icon: '📖', title: 'Récit', layout: 'text', rows: [], text: story ?? undefined },
    {
      id: 'combat',
      icon: '⚔️',
      title: 'Combat',
      count: combat.length,
      layout: 'log',
      rows: combat,
    },
    {
      id: 'road',
      icon: '🛣️',
      title: 'Route',
      layout: 'timeline',
      rows: [
        ...c.road.map((e) => ({
          icon: '•',
          title: e.text,
          value: e.slain ? `⚔️ ${e.slain}` : undefined,
          tone: 'dim' as const,
        })),
        ...events,
      ],
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
