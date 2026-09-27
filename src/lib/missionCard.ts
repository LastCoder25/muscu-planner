// 📜 Le rapport d'une mission, mis à plat pour UNE carte compacte (v0.1119).
//
// Trois écrans montraient un rapport chacun à sa façon — la boîte 📬 de l'Aventure, la
// fenêtre de retour sur la carte, le rapport de convoi — avec des redites (deux verdicts,
// deux en-têtes de groupe). Ce module les ramène à UNE forme ; `MissionReportCard` la peint.
// ⚠️ Aucun chiffre n'est recalculé : tout vient de `partyReport` et
// `haulPills`, les fonctions que ces écrans lisaient déjà.
import { characterRank, rankStarStr } from './characterRank';
import {
  POI_EMO,
  haulPills,
  messageTitle,
  type ExpeditionMessage,
  type PartyResult,
} from './expedition';
import { partyReport } from './party';
import { feedWhen } from './friendFeed';
import type { Adventurer } from './adventurers';
import { DISPEL_TEXT } from './raid';
import type { Item } from './items';
import type { OverflowReplay } from './expedition';

interface MissionCardMember {
  id: string;
  emoji: string;
  name: string;
  xp: number;
  kills: number;
  hurt: boolean;
  /** Mis à terre mais relevé (convoi) : pas d'infirmerie. */
  down: boolean;
  /** Une étoile de plus à CET encaissement. */
  star: boolean;
  gone: boolean;
}

export interface MissionCard {
  id: string;
  /** Une faille se dessine avec son portail, pas avec un emoji. */
  rift: boolean;
  emoji: string;
  /** Couleur du rang du lieu (celle de la carte). */
  color: string;
  title: string;
  /** « Or ★★★☆☆ » — null pour un coffre, qui ne vient d'aucun lieu. */
  rank: string | null;
  win: boolean;
  verdict: string;
  gains: { emoji: string; n: number }[];
  loot: Omit<Item, 'id'>[];
  /** Objets partis au sac sans être décrits ici (l'arène en ramène beaucoup). */
  lootMore: number;
  /** Ancien message : un nom d'objet seul. */
  legacyItem: string | null;
  team: MissionCardMember[];
  /** Le héros était du voyage (expédition solo, ou dans le groupe). */
  hero: boolean;
  /** « 11/12 abattus » — null quand il n'y a pas eu de combat à compter. */
  kills: string | null;
  totalXp: number;
  story: string;
  road: { text: string; slain: number }[];
  journal: string[];
  travelMs: number | null;
  xpPerHour: number | null;
  /** Le résultat d'un groupe, pour le rejeu d'une incursion. */
  party: PartyResult | null;
  /** Une faille qui a débordé, pour son rejeu. */
  overflow: OverflowReplay | null;
  at: number;
}

const rankLabel = (level: number) => {
  const r = characterRank(level);
  return { label: `${r.name} ${rankStarStr(r.star)}`, color: r.color };
};

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Le verdict, dans les mots du lieu. */
function messageVerdict(m: ExpeditionMessage): string {
  if (m.chest) return 'coffre';
  if (m.overflow) return 'débordée';
  if (m.waves !== undefined) return `${plural(m.waves, 'vague')} tenue${m.waves > 1 ? 's' : ''}`;
  if (m.party) return partyReport(m.party, []).verdict;
  return m.win ? 'réussie' : 'ratée';
}

/** Un rapport de la boîte 📬 (expédition du héros, groupe, arène, coffre). */
export function messageCard(m: ExpeditionMessage, roster: readonly Adventurer[]): MissionCard {
  const p = m.party ? partyReport(m.party, roster) : null;
  const rift = m.poiType === 'rift' || !!m.party?.rift;
  const loot = m.items?.length ? m.items : m.item ? [m.item] : [];
  const rk = m.chest ? null : rankLabel(m.level);
  return {
    id: m.id,
    rift,
    emoji: m.chest ? '🎁' : m.poiType ? POI_EMO[m.poiType] : '📜',
    color: rk?.color ?? 'var(--accent)',
    title: messageTitle(m),
    rank: rk?.label ?? null,
    win: m.win,
    verdict: messageVerdict(m),
    gains: haulPills(m),
    loot,
    lootMore: Math.max(0, (m.itemCount ?? loot.length) - loot.length),
    legacyItem: loot.length ? null : (m.itemName ?? null),
    team: (p?.members ?? []).map((x) => ({
      id: x.id,
      emoji: x.emoji,
      name: x.name,
      xp: x.xp,
      kills: x.kills,
      hurt: x.hurt,
      down: false,
      star: false,
      gone: x.gone,
    })),
    hero: m.chest ? false : p ? p.hero : true,
    kills: p && p.foes > 0 ? `${p.slain}/${p.foes} abattus` : null,
    totalXp: p?.totalXp ?? 0,
    story: m.party?.dispel ? `${m.text} ${DISPEL_TEXT[m.party.dispel]}` : m.text,
    road: [],
    journal: p?.journal ?? [],
    travelMs: null,
    xpPerHour: null,
    party: m.party ?? null,
    overflow: m.overflow ?? null,
    at: m.resolvedAt,
  };
}

/** Combien de champions la ligne de l'équipe nomme avant « +N autres ». */
export const TEAM_SHOWN = 4;

/** « il y a 2 h » — la lecture du fil d'activité des amis (`feedWhen`), pas une copie. */
export function missionWhen(at: number, now: number): string {
  return feedWhen(new Date(at).toISOString(), new Date(now).toISOString()) || "à l'instant";
}
