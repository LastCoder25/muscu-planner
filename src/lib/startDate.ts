// startDate.ts — choix de la DATE DE DÉBUT d'un défi (challenge ou Défi 360).
//
// Jusqu'ici les deux assistants figeaient `logicalToday()` : impossible de caler un défi
// sur un lundi ou d'attendre la fin d'un autre. Cette lib centralise les repères et la
// règle de validité, pour que les deux écrans ne divergent pas.
//
// ⚠️ Dates manipulées en UTC EXPLICITE (`T00:00:00Z`) : le projet s'est déjà fait avoir
// par un aller-retour local↔UTC qui décalait d'un jour en France (cf. `onTimePct`).
// Ici on parse ET on formate en UTC, donc l'arithmétique reste cohérente avec elle-même.

/** Décale une date ISO (AAAA-MM-JJ) de n jours, en UTC de bout en bout. */
export function addDaysUtcIso(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

/** Écart en jours entre deux dates ISO (b − a). */
export function daysBetweenUtcIso(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86400000);
}

/** Le prochain lundi STRICTEMENT après `todayIso` (un lundi renvoie le lundi suivant :
 *  « lundi prochain » ne veut jamais dire « aujourd'hui »). */
export function nextMondayIso(todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return todayIso;
  const dow = d.getUTCDay(); // 0 = dimanche
  return addDaysUtcIso(todayIso, (8 - dow) % 7 || 7);
}

/** On ne laisse PAS démarrer dans le passé : les journées écoulées seraient clôturées
 *  aussitôt comme manquées (et, en mode adaptatif, feraient baisser les objectifs
 *  restants). Un défi antidaté serait donc perdu d'avance. */
export const START_MAX_AHEAD_DAYS = 60;

export function isStartAllowed(
  dateIso: string,
  todayIso: string,
  maxAhead: number = START_MAX_AHEAD_DAYS,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const delta = daysBetweenUtcIso(todayIso, dateIso);
  return delta >= 0 && delta <= maxAhead;
}

export interface StartOption {
  id: string;
  label: string;
  date: string;
}

/** Repères rapides. Dédupliqués : un dimanche, « lundi prochain » vaut « demain » —
 *  proposer deux boutons pour la même date serait du bruit. */
export function startOptions(todayIso: string): StartOption[] {
  const raw: StartOption[] = [
    { id: 'today', label: "Aujourd'hui", date: todayIso },
    { id: 'tomorrow', label: 'Demain', date: addDaysUtcIso(todayIso, 1) },
    { id: 'monday', label: 'Lundi prochain', date: nextMondayIso(todayIso) },
  ];
  const seen = new Set<string>();
  return raw.filter((o) => (seen.has(o.date) ? false : (seen.add(o.date), true)));
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Jour COURT (« 12 sept. »). ⚠️ Formaté en UTC explicite comme tout le reste de ce
 *  module : une date de défi est un JOUR, pas un instant, et le projet s'est déjà fait
 *  décaler d'un jour en France par un aller-retour local↔UTC. */
export function dayLabelShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/** « 12 sept. → 11 oct. » — la plage d'un défi, bornes INCLUSES.
 *  ⚠️ Le dernier jour est `début + durée − 1` : un défi de 30 jours commencé le 1er finit
 *  le 30, pas le 31. Écrit ici une seule fois — la formule vivait recopiée dans
 *  `ChallengesPage` (avec ses propres helpers de date privés), et l'écran des amis
 *  s'apprêtait à en faire une troisième copie. */
export function dateRangeLabel(startIso: string, durationDays: number): string {
  const last = addDaysUtcIso(startIso, Math.max(1, durationDays) - 1);
  return `${dayLabelShort(startIso)} → ${dayLabelShort(last)}`;
}

/** « aujourd'hui », « demain », sinon « lundi 15 septembre » — lisible d'un coup d'œil. */
export function startLabel(dateIso: string, todayIso: string): string {
  const delta = daysBetweenUtcIso(todayIso, dateIso);
  if (delta === 0) return "aujourd'hui";
  if (delta === 1) return 'demain';
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
