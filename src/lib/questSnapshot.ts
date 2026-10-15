// 🗓️👥 LES QUÊTES D'UN AMI (demandé par l'utilisateur : « voir ce qu'ils ont reçu comme quêtes
// pour la semaine et l'avancement »).
//
// ⚠️ ON NE PEUT PAS LES RECALCULER CHEZ LE VOISIN : les quêtes se dérivent des séances, des
// sorties cardio et des parties de tennis (`weeklyQuests`), tables own-only en base. Ouvrir
// leur lecture aux amis exposerait tout l'historique pour trois barres. Chaque joueur PUBLIE
// donc un INSTANTANÉ de son tableau de la semaine (table `weekly_quest_boards`, lisible par ses
// amis) — le patron du classement et de l'apparence d'un membre de boss (`fboss_set_look`).
//
// ⚠️ C'EST UN INSTANTANÉ : il date de la dernière ouverture de l'accueil par l'ami. L'écran le
// dit (« mis à jour il y a… »), et un instantané d'une AUTRE semaine n'est pas montré — les
// quêtes repartent à zéro chaque lundi, celles de la semaine passée mentiraient.
//
// Module pur. Relecture DÉFENSIVE : le JSON vient d'un autre client.

import {
  QUEST_INFO,
  SPORT_QUESTS,
  questTiers,
  type QuestKind,
  type WeeklyQuestBoard,
} from './weeklyQuests';

export interface QuestSnapshot {
  monday: string;
  quests: { kind: QuestKind; target: number; done: number; mine: boolean; activity?: string }[];
}

/** Ce qui est publié : les objectifs et leur avancement, rien d'autre (ni marque de tickets,
 *  ni historique). Les paliers et les tickets se RE-DÉRIVENT à la lecture. */
export function questSnapshot(board: WeeklyQuestBoard): QuestSnapshot {
  return {
    monday: board.monday,
    quests: board.quests.map((q) => ({
      kind: q.kind,
      target: q.target,
      done: q.done,
      mine: q.mine,
      ...(q.activity ? { activity: q.activity } : {}),
    })),
  };
}

const MONDAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 10_000) : null;

export interface FriendQuestView {
  quests: {
    kind: QuestKind;
    emoji: string;
    label: string;
    target: number;
    done: number;
    complete: boolean;
    mine: boolean;
  }[];
  doneCount: number;
  /** Tickets que ses paliers atteints valent cette semaine. */
  earned: number;
  tiers: { at: number; tickets: number; reached: boolean }[];
}

/** Relit l'instantané d'un ami pour la semaine qui commence `monday`. `null` si absent,
 *  illisible ou d'une autre semaine. Un objectif inconnu (version plus récente) est ignoré. */
export function readQuestSnapshot(raw: unknown, monday: string): FriendQuestView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.monday !== 'string' || !MONDAY_RE.test(r.monday) || r.monday !== monday) return null;
  if (!Array.isArray(r.quests)) return null;
  const quests: FriendQuestView['quests'] = [];
  const seen = new Set<string>();
  for (const q of r.quests as unknown[]) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    const kind = o.kind as QuestKind;
    if (typeof kind !== 'string' || !Object.hasOwn(QUEST_INFO, kind) || seen.has(kind)) continue;
    const target = num(o.target);
    const done = num(o.done);
    if (target === null || target <= 0 || done === null) continue;
    seen.add(kind);
    const info = QUEST_INFO[kind];
    const activity = typeof o.activity === 'string' ? o.activity.slice(0, 30) : undefined;
    quests.push({
      kind,
      emoji: info.emoji,
      label: info.label(target, activity),
      target,
      done,
      complete: done >= target,
      mine: o.mine === true,
    });
  }
  // ⚠️ Un instantané publié avant la v1.203 porte AUSSI les objectifs des sports que l'ami ne
  // pratique pas (marqués `mine: false`) : on applique la même règle que son écran
  // (`isShown`) — dès qu'un de ses sports est connu, les objectifs des autres sports partent.
  if (quests.some((q) => SPORT_QUESTS.has(q.kind) && q.mine))
    for (let i = quests.length - 1; i >= 0; i--)
      if (SPORT_QUESTS.has(quests[i]!.kind) && !quests[i]!.mine) quests.splice(i, 1);
  if (!quests.length) return null;
  const doneCount = quests.filter((q) => q.complete).length;
  const { tiers, earned } = questTiers(doneCount, quests.length);
  return { quests, doneCount, earned, tiers };
}
