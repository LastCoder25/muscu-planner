// sessionCompare.ts — « et par rapport à la dernière fois ? »
//
// Le bilan affichait trois nombres NUS : volume, minutes, note. Un nombre sans référence
// ne dit rien — 4 200 kg, c'est bien ou pas ? Et rien ne racontait ce qui avait bougé
// exercice par exercice : `detectLiftPRs` ne parle que des RECORDS, donc une séance où
// l'on passe de 60 à 62,5 kg sans battre son record de l'an dernier restait muette.
//
// ⚠️ DEUX RÉFÉRENCES DIFFÉRENTES, et les confondre n'aurait aucun sens :
//  - au niveau de la SÉANCE, on ne compare qu'à une séance du MÊME plan (`session_id`) :
//    opposer le volume d'un bas du corps à celui d'un haut du corps ne veut rien dire ;
//  - au niveau de l'EXERCICE, on compare à la dernière fois qu'on l'a fait, quelle que
//    soit la séance — c'est toujours pertinent, et c'est ce qui parle le plus.
import { bestSetE1RM } from './estimates';
import { daysBetweenUtcIso } from './startDate';
import type { SessionLog } from './types';
import type { LogEntry } from './volume';

// ⚠️ On réemploie `LogEntry` (volume.ts) plutôt que d'en redéclarer la forme : c'est déjà
// la monnaie courante de `bodyBalance`, `weeklyVolumeSeries` et `useBalanceInput`. Trois
// noms pour une structure, et le jour où elle gagne un champ, ces fonctions ne se composent
// plus sans adaptateur.
export type { LogEntry };

/** Ce qu'un exercice valait aujourd'hui, et la dernière fois. */
/** ⚠️ NON exporté : rien ne l'importe (`npm run dead`), et il reste atteignable par
 *  `SessionCompare['exercises'][number]`. Un export que personne ne prend ment sur la
 *  surface publique du module. */
interface ExerciseDelta {
  id: string;
  name: string;
  load: number;
  reps: number;
  e1rm: number;
  prevLoad: number;
  prevReps: number;
  prevE1rm: number;
  /** Jours écoulés depuis la dernière fois qu'on a fait cet exercice. */
  daysSince: number;
}

interface SessionTotals {
  volume: number; // tonnage (kg soulevés)
  sets: number;
  minutes: number;
}

export interface SessionCompare {
  totals: SessionTotals;
  /** Totaux de la précédente séance DU MÊME PLAN — absent s'il n'y en a pas. */
  prev?: SessionTotals & { daysSince: number };
  /** Un delta par exercice DÉJÀ fait auparavant : sans passé, il n'y a rien à comparer. */
  exercises: ExerciseDelta[];
}

/** Tonnage, séries et durée d'un bilan. ⚠️ Les séries d'approche n'y sont jamais (warmup.ts). */
export function sessionTotals(log: SessionLog): SessionTotals {
  let volume = 0;
  let sets = 0;
  for (const ex of log.exercises ?? []) {
    for (const s of ex.performed ?? []) {
      volume += (s.load_kg || 0) * (s.reps || 0);
      sets++;
    }
  }
  return { volume: Math.round(volume), sets, minutes: log.duration_min ?? 0 };
}

/** Jours entre deux horodatages de bilan. ⚠️ Passe par `daysBetweenUtcIso` (startDate.ts)
 *  au lieu d'une 3e copie du même quotient — mais avec DEUX précautions VÉRIFIÉES : elle
 *  prend ses arguments dans l'ordre INVERSE (ancien, récent), et elle exige un
 *  `YYYY-MM-DD` — un horodatage complet lui rendrait `NaN`, donc **0 en silence**. D'où le
 *  découpage, qui n'est pas cosmétique. Le `Math.max(0, …)` d'origine part : `avant` est
 *  déjà filtré sur `performedAt < current.performedAt`, il ne pouvait jamais mordre. */
function joursEntre(recent: string, ancien: string): number {
  return daysBetweenUtcIso(ancien.slice(0, 10), recent.slice(0, 10));
}

/**
 * Compare une séance à ce qui l'a précédée. `priors` = les autres bilans, dans n'importe
 * quel ordre ; la séance courante en est exclue par son id.
 */
export function compareSession(current: LogEntry, priors: LogEntry[]): SessionCompare {
  // Strictement AVANT la séance courante, du plus récent au plus ancien : la première
  // occurrence trouvée est donc « la dernière fois ».
  // ⚠️ Pas de filtre sur l'id : la comparaison stricte écarte DÉJÀ la séance courante,
  // que l'appelant passe forcément (il transmet tout son historique). Un `id !== id` en
  // plus aurait donné la confiance sans la couverture — une mutation qui le retire ne
  // fait rougir aucun test, parce qu'aucune valeur réelle ne l'atteint.
  const avant = priors
    .filter((p) => p.performedAt < current.performedAt)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));

  const out: SessionCompare = { totals: sessionTotals(current.log), exercises: [] };

  // ⚠️ Seulement une séance du MÊME plan. Une séance libre n'a pas de `session_id` : elle
  // n'a donc pas de comparaison de séance, et c'est voulu — deux séances libres n'ont
  // aucune raison de contenir la même chose.
  const sid = current.log.session_id;
  if (sid) {
    const p = avant.find((x) => x.log.session_id === sid);
    if (p) {
      out.prev = {
        ...sessionTotals(p.log),
        daysSince: joursEntre(current.performedAt, p.performedAt),
      };
    }
  }

  for (const ex of current.log.exercises ?? []) {
    const top = bestSetE1RM(ex.performed ?? []);
    if (!top) continue;
    // La dernière fois qu'on a fait CET exercice, quelle que soit la séance.
    let found: { d: LogEntry; top: NonNullable<ReturnType<typeof bestSetE1RM>> } | null = null;
    for (const p of avant) {
      const le = (p.log.exercises ?? []).find((e) => e.id === ex.id);
      const t = le ? bestSetE1RM(le.performed ?? []) : null;
      if (t) {
        found = { d: p, top: t };
        break;
      }
    }
    if (!found) continue;
    out.exercises.push({
      id: ex.id,
      name: ex.name,
      load: top.set.load_kg,
      reps: top.set.reps,
      e1rm: top.e1rm,
      prevLoad: found.top.set.load_kg,
      prevReps: found.top.set.reps,
      prevE1rm: found.top.e1rm,
      daysSince: joursEntre(current.performedAt, found.d.performedAt),
    });
  }
  return out;
}

/** « +340 kg », « −2 min », « = » — un delta lisible, avec son sens. */
export function deltaLabel(
  now: number,
  before: number,
  unit: string,
): { text: string; tone: 'up' | 'down' | 'same' } {
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return { text: `= ${unit}`, tone: 'same' };
  return { text: `${d > 0 ? '+' : ''}${d} ${unit}`, tone: d > 0 ? 'up' : 'down' };
}
