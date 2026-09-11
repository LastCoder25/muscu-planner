// friendFeed.ts — fil d'activité des amis, DÉRIVÉ de l'existant.
//
// Aucune table, aucune colonne, aucun trigger : `challenges` et `combo_challenges`
// portent déjà `created_at`, `updated_at` et `status`, et les policies
// `challenges_read_friends` / `combo_read_friends` (migr. 0058) en autorisent déjà la
// lecture. Le fil n'est donc qu'une LECTURE de ces lignes, transformée en événements.
// Conséquence à garder en tête : il ne peut montrer que ce que ces deux tables savent
// (pas les séances libres, pas le cardio, pas l'Aventure — leurs tables ne sont pas
// partagées avec les amis).
//
// Pur et testable : aucune horloge interne, `now` et `todayIso` sont toujours passés.
import { challengeStats, type Challenge } from './challenges';
import { comboProgressPct, type ComboChallenge } from './combo';

type FeedKind = 'started' | 'progress' | 'done';
type FeedSource = 'challenge' | 'combo';

export interface FeedItem {
  id: string; // clé de rendu stable (ligne + nature de l'événement)
  userId: string;
  pseudo: string;
  source: FeedSource;
  kind: FeedKind;
  at: string; // horodatage du fait
  emoji: string;
  text: string; // « a bouclé « 100 pompes » »
  pct: number | null;
}

/** Horodatages portés par les LIGNES en base. Volontairement déclarés ici et non
 *  dans `Challenge`/`ComboChallenge` : c'est de la persistance, pas du contrat
 *  d'entraînement — inutile d'obliger tout le code métier à les porter. */
export interface RowStamps {
  created_at: string;
  updated_at: string;
}

/** Entraînement d'un ami, tel que le store le récupère. */
export interface FriendTraining {
  userId: string;
  pseudo: string;
  challenges: (Challenge & RowStamps)[];
  combos: (ComboChallenge & RowStamps)[];
}

/** Au-delà, l'info n'a plus de valeur d'entraînement — le fil doit donner envie
 *  d'agir aujourd'hui, pas archiver le trimestre. */
export const FEED_RECENT_DAYS = 14;
const FEED_MAX = 40;

const EMOJI: Record<FeedKind, string> = { started: '✨', progress: '📈', done: '🏁' };

function dayOf(ts: string): string {
  return ts.slice(0, 10);
}

/** Construit le fil : le plus récent d'abord, borné dans le temps et en nombre.
 *
 *  Les défis ABANDONNÉS sont volontairement omis : le fil sert à se motiver, pas à
 *  exposer les renoncements de ses amis. */
export function buildFriendFeed(
  friends: FriendTraining[],
  now: string,
  todayIso: string,
  limit: number = FEED_MAX,
): FeedItem[] {
  const floor = Date.parse(now) - FEED_RECENT_DAYS * 86400000;
  const out: FeedItem[] = [];

  const push = (
    f: FriendTraining,
    source: FeedSource,
    kind: FeedKind,
    rowId: string,
    at: string,
    text: string,
    pct: number | null,
  ) => {
    const t = Date.parse(at);
    // Une ligne touchée « dans le futur » (horloge client décalée) ne doit pas
    // squatter le haut du fil pour toujours.
    if (!Number.isFinite(t) || t < floor || t > Date.parse(now)) return;
    out.push({
      id: `${rowId}:${kind}`,
      userId: f.userId,
      pseudo: f.pseudo,
      source,
      kind,
      at,
      emoji: EMOJI[kind],
      text,
      pct,
    });
  };

  for (const f of friends) {
    for (const c of f.challenges) {
      if (c.status === 'abandoned') continue;
      const label = `« ${c.exercise_name} »`;
      if (c.status === 'done') {
        push(f, 'challenge', 'done', c.id, c.updated_at, `a bouclé ${label}`, 100);
        continue;
      }
      push(f, 'challenge', 'started', c.id, c.created_at, `a lancé ${label}`, null);
      // Un « en cours » le jour même du lancement ferait doublon avec « a lancé ».
      if (dayOf(c.updated_at) > dayOf(c.created_at)) {
        const pct = challengeStats(c, todayIso).completionPct;
        push(f, 'challenge', 'progress', c.id, c.updated_at, `en est à ${pct} % de ${label}`, pct);
      }
    }

    for (const c of f.combos) {
      if (c.status === 'abandoned') continue;
      if (c.status === 'done') {
        push(f, 'combo', 'done', c.id, c.updated_at, `a bouclé son ${c.name}`, 100);
        continue;
      }
      push(f, 'combo', 'started', c.id, c.created_at, `a lancé un ${c.name}`, null);
      if (dayOf(c.updated_at) > dayOf(c.created_at)) {
        const pct = comboProgressPct(c);
        push(f, 'combo', 'progress', c.id, c.updated_at, `en est à ${pct} % de son ${c.name}`, pct);
      }
    }
  }

  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1));
  return out.slice(0, limit);
}

/** Libellé relatif court (« il y a 2 h », « hier ») — le fil se lit d'un coup d'œil. */
export function feedWhen(at: string, now: string): string {
  const ms = Date.parse(now) - Date.parse(at);
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  return `il y a ${d} j`;
}
