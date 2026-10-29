/**
 * 📋 « PENDANT TON ABSENCE » (v1.277.0 ; demandé par l'utilisateur : le joueur brûle l'énergie
 * de plusieurs jours en quelques minutes puis ne fait que des clics de carte identiques — une
 * seule tuile à l'ouverture de la carte dit ce qui est rentré, et ce qui est à relancer).
 *
 * ⚠️ AUCUN CALCUL NOUVEAU : tout est LU dans les rapports de la boîte 📬 (`ExpeditionMessage`),
 * déjà écrits par le jeu. Ce module ne fait que les ADDITIONNER entre deux instants. Il ne
 * stocke rien : la dernière visite vit dans le navigateur (par appareil), la tuile se
 * recalcule à chaque ouverture.
 *
 * ⚠️ LIMITE ASSUMÉE : la boîte ne garde que `MESSAGES_CAP` (40) messages. Une absence très
 * chargée peut avoir fait sortir les plus vieux rapports : le résumé compte ce qui reste,
 * jamais plus.
 */
import type { ExpeditionMessage } from './expedition';

/** En dessous, ce n'est pas une absence mais un aller-retour : pas de tuile. */
export const ABSENCE_MIN_MS = 30 * 60_000;

export interface AbsenceSummary {
  /** Rapports arrivés depuis la dernière visite. */
  reports: number;
  gold: number;
  /** XP versée aux champions, tous rapports confondus. */
  xp: number;
  /** Consommables trouvés (total des exemplaires). */
  supplies: number;
  /** 🏰 Points de contrôle PRIS (assaut gagné). */
  taken: number;
  /** 🏰 Points de contrôle PERDUS (reprise ennemie réussie). */
  lost: number;
  /** 🤕 Champions envoyés à l'infirmerie (le héros compte pour un). */
  hurt: number;
  /** 🕳️ Failles refermées. */
  riftsClosed: number;
  /** 💥 Failles qui ont débordé. */
  riftsOverflowed: number;
}

/** Une pastille du résumé : un emoji, un nombre, un libellé accordé. */
export interface AbsenceChip {
  key: keyof Omit<AbsenceSummary, 'reports'>;
  emoji: string;
  n: number;
  label: string;
}

/** Y a-t-il eu une absence ? (`lastSeen` = 0 : première visite, rien à résumer.) */
export function isAbsence(lastSeen: number, now: number): boolean {
  return lastSeen > 0 && now - lastSeen >= ABSENCE_MIN_MS;
}

const sum = (xs: Iterable<number>): number => {
  let s = 0;
  for (const x of xs) s += Number.isFinite(x) ? x : 0;
  return s;
};

/**
 * Additionne les rapports tombés entre `since` (exclu) et `now` (inclus). `null` quand il n'y
 * en a aucun : la tuile ne s'ouvre pas pour dire « rien ». Les coffres (Défi 360, boss entre
 * amis) sont le sport, pas la carte : ils ne comptent pas.
 */
export function absenceSummary(
  messages: readonly ExpeditionMessage[],
  since: number,
  now: number,
): AbsenceSummary | null {
  const out: AbsenceSummary = {
    reports: 0,
    gold: 0,
    xp: 0,
    supplies: 0,
    taken: 0,
    lost: 0,
    hurt: 0,
    riftsClosed: 0,
    riftsOverflowed: 0,
  };
  for (const m of messages) {
    if (m.chest || m.resolvedAt <= since || m.resolvedAt > now) continue;
    out.reports++;
    out.gold += m.gold ?? 0;
    out.supplies += sum(Object.values(m.supplies ?? {}));
    if (m.overflow) out.riftsOverflowed++;
    const p = m.party;
    if (!p) continue;
    out.xp += sum(Object.values(p.xp ?? {}));
    out.hurt += (p.hurt?.length ?? 0) + (p.heroHurt ? 1 : 0);
    if (p.rift && p.win) out.riftsClosed++;
    if (p.controlId) {
      if (p.defense) {
        if (!p.win) out.lost++;
      } else if (p.win) out.taken++;
    }
  }
  return out.reports ? out : null;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Les pastilles à afficher : jamais un zéro (une pastille vide ne dit rien). */
export function absenceChips(s: AbsenceSummary): AbsenceChip[] {
  const all: AbsenceChip[] = [
    { key: 'gold', emoji: '💰', n: s.gold, label: 'or' },
    { key: 'xp', emoji: '⭐', n: s.xp, label: 'XP' },
    {
      key: 'supplies',
      emoji: '🎒',
      n: s.supplies,
      label: plural(s.supplies, 'consommable', 'consommables'),
    },
    { key: 'taken', emoji: '🏰', n: s.taken, label: plural(s.taken, 'lieu pris', 'lieux pris') },
    { key: 'lost', emoji: '🏚️', n: s.lost, label: plural(s.lost, 'lieu perdu', 'lieux perdus') },
    { key: 'hurt', emoji: '🤕', n: s.hurt, label: plural(s.hurt, 'blessé', 'blessés') },
    {
      key: 'riftsClosed',
      emoji: '🕳️',
      n: s.riftsClosed,
      label: plural(s.riftsClosed, 'faille fermée', 'failles fermées'),
    },
    {
      key: 'riftsOverflowed',
      emoji: '💥',
      n: s.riftsOverflowed,
      label: plural(s.riftsOverflowed, 'faille débordée', 'failles débordées'),
    },
  ];
  return all.filter((c) => c.n > 0);
}

/** Ce qui est à relancer : champions libres, héros libre, lieux disponibles. */
export interface RelaunchInput {
  champions: number;
  heroFree: boolean;
  places: number;
}

export interface RelaunchChip {
  key: 'champions' | 'hero' | 'places';
  emoji: string;
  label: string;
}

/** Les pastilles « à relancer » : rien pour ce qui est à zéro. */
export function relaunchChips(r: RelaunchInput): RelaunchChip[] {
  const out: RelaunchChip[] = [];
  if (r.heroFree) out.push({ key: 'hero', emoji: '🧝', label: 'Héros libre' });
  if (r.champions > 0)
    out.push({
      key: 'champions',
      emoji: '🧑',
      label: `${r.champions} ${plural(r.champions, 'champion libre', 'champions libres')}`,
    });
  if (r.places > 0)
    out.push({
      key: 'places',
      emoji: '📍',
      label: `${r.places} ${plural(r.places, 'lieu disponible', 'lieux disponibles')}`,
    });
  return out;
}

/** « 3 h 12 », « 45 min », « 2 j 4 h » : la durée de l'absence, courte. */
export function absenceDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

/** Le panneau « absence » est resté ouvert alors que plus rien n'est à résumer (retour d'un onglet
 *  resté caché sans rapport neuf) : il faut le FERMER, sinon la chaîne de panneaux de la carte
 *  retombe sur un autre (« Places fortes » sous le titre « Pendant ton absence »). */
export function absencePanelStale(overlay: string | null, summary: unknown): boolean {
  return overlay === 'absence' && !summary;
}

/** Au retour d'un onglet caché : la tuile a-t-elle déjà été montrée pour cette absence ? Oui si le
 *  panneau est ouvert maintenant ; sinon elle peut s'ouvrir. Sans cela, la ranger la faisait
 *  revenir dans la minute. */
export function absenceShownOnReturn(overlay: string | null): boolean {
  return overlay === 'absence';
}
