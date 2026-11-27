// comboDebrief.ts — LE BILAN DE RÉPARTITION d'un Défi 360 clôturé (v1.368.0 ; demandé : « rappeler
// à l'utilisateur comment il a réparti ses exercices sur la durée — quelles séries de quel exo
// chaque jour — et le conseiller sur une répartition meilleure, plus régulière »).
// Pur (aucune dépendance Vue/Supabase) : c'est l'écran qui met en forme.
//
// ⚠️ CE N'EST PAS UN VERDICT, C'EST UN MIROIR. Le bilan montre d'abord CE QUI S'EST PASSÉ (jour par
// jour, groupe par groupe) ; les conseils viennent après, au ton de l'information, jamais rouges :
// un défi bouclé en deux jours bien remplis reste un défi bouclé. Rien n'est écrit dans le défi,
// aucune récompense n'en dépend.
//
// CE QU'ON LIT : les séries `ComboSet` (leur `date`), rangées dans la fenêtre du défi. Une série
// faite APRÈS la fin ne compte pas dans la répartition (elle est annoncée à part : « en retard »),
// comme elle ne compte pas pour la prime. Une série basculée sur un autre exo (`origin`) est
// nommée d'après l'exo réellement fait (`setOrigin`) mais reste rangée dans le groupe du slot.
//
// LES REPÈRES (heuristiques, pas des mesures faites sur cette app — ils se règlent ici, au même
// endroit) : un jour qui concentre au moins `PEAK_SHARE` du volume · plus de la moitié du volume
// dans le dernier tiers du défi · `GAP_DAYS` jours de suite sans rien · un groupe travaillé un
// seul jour alors que la durée permet deux passages espacés de 48 h · un même groupe fortement
// travaillé deux jours d'affilée.
import { addDaysUtcIso } from '@/lib/startDate';
import { comboGoals, comboEndDate, goalComplete, legSets, setOrigin } from '@/lib/combo';
import type { ComboChallenge } from '@/lib/combo';

/** Un jour qui porte au moins cette part du volume total est un « pic ». */
export const PEAK_SHARE = 0.4;
/** …à condition que le défi ait un volume qui permette de l'étaler. */
export const PEAK_MIN_SETS = 10;
/** Part du volume tombée dans le DERNIER TIERS du défi au-delà de laquelle on parle de rush. */
export const LATE_SHARE = 0.5;
/** Jours consécutifs sans série à partir desquels on le signale (sur un défi d'au moins 5 jours). */
export const GAP_DAYS = 3;
/** Un groupe qui n'a eu qu'UN jour alors que le défi en a au moins autant… */
export const SINGLE_DAY_MIN_DURATION = 5;
/** …et au moins ce volume (en dessous, un seul jour est normal). */
export const SINGLE_DAY_MIN_SETS = 6;
/** Séries par jour, pour un même groupe, à partir desquelles deux jours d'affilée comptent. */
export const BACK_TO_BACK_SETS = 4;

/** Ce qu'un jour a porté pour UN exo. */
export interface DebriefLegDay {
  exercise_id: string;
  name: string;
  sets: number;
}
/** Ce qu'un jour a porté pour UN groupe. */
export interface DebriefGroupDay {
  slot: string;
  sets: number;
  legs: DebriefLegDay[];
}
export interface DebriefDay {
  /** 1 pour le premier jour du défi. */
  n: number;
  date: string;
  total: number;
  groups: DebriefGroupDay[];
}
/** Une ligne de la grille : un groupe, une case par jour du défi. */
export interface DebriefGroupRow {
  slot: string;
  /** Séries par jour, dans l'ordre des jours du défi. */
  perDay: number[];
  total: number;
  /** Jours où le groupe a été travaillé. */
  daysWorked: number;
  /** Objectif du groupe (mode groupe) ou somme des objectifs de ses exos ; 0 si inconnu. */
  target: number;
}

export type DebriefTipId =
  | 'regular'
  | 'peak'
  | 'late'
  | 'gap'
  | 'singleDay'
  | 'backToBack'
  | 'missed'
  | 'noRest';
export interface DebriefTip {
  id: DebriefTipId;
  /** 'good' = un constat positif ; 'tip' = un conseil. */
  tone: 'good' | 'tip';
  text: string;
  /** Groupes concernés (clés de slot), pour que l'écran les nomme avec leur libellé. */
  slots: string[];
}

export interface ComboDebrief {
  duration: number;
  days: DebriefDay[];
  rows: DebriefGroupRow[];
  /** Séries comptées dans la fenêtre du défi. */
  total: number;
  /** Jours avec au moins une série. */
  activeDays: number;
  restDays: number;
  /** Le jour le plus chargé (index 0-based) et sa part du volume (0 sans volume). */
  peakDay: number;
  peakShare: number;
  /** Séries faites APRÈS la fin du défi (non comptées ci-dessus). */
  lateSets: number;
  /** Séries par jour qui répartiraient le volume à égalité (arrondi au supérieur). */
  idealPerDay: number;
  tips: DebriefTip[];
}

function windowDates(c: ComboChallenge): string[] {
  const n = Math.max(1, c.duration_days);
  return Array.from({ length: n }, (_, i) => addDaysUtcIso(c.start_date, i));
}

/** Plus longue suite de jours à 0 (début et fin compris) : sa longueur et son premier index. */
function longestGap(totals: readonly number[]): { len: number; from: number } {
  let best = { len: 0, from: 0 };
  let run = 0;
  for (let i = 0; i < totals.length; i++) {
    if (totals[i] === 0) {
      run += 1;
      if (run > best.len) best = { len: run, from: i - run + 1 };
    } else run = 0;
  }
  return best;
}

/** Le bilan de répartition d'un défi. `null` quand rien n'a été fait dans la fenêtre : il n'y a
 *  alors rien à raconter (l'écran n'affiche rien). */
export function comboDebrief(c: ComboChallenge): ComboDebrief | null {
  const dates = windowDates(c);
  const end = comboEndDate(c);
  const index = new Map(dates.map((d, i) => [d, i] as const));
  const D = dates.length;

  const days: DebriefDay[] = dates.map((date, i) => ({ n: i + 1, date, total: 0, groups: [] }));
  const rowMap = new Map<string, DebriefGroupRow>();
  const goalBySlot = new Map<string, number>();
  for (const g of comboGoals(c)) goalBySlot.set(g.slot, (goalBySlot.get(g.slot) ?? 0) + g.target);
  const rowOf = (slot: string): DebriefGroupRow => {
    let r = rowMap.get(slot);
    if (!r) {
      r = {
        slot,
        perDay: Array.from({ length: D }, () => 0),
        total: 0,
        daysWorked: 0,
        target: goalBySlot.get(slot) ?? 0,
      };
      rowMap.set(slot, r);
    }
    return r;
  };

  let lateSets = 0;
  for (const leg of c.legs) {
    for (const s of legSets(leg)) {
      if (!s.date) continue;
      const i = index.get(s.date);
      if (i === undefined) {
        // Avant le début : non attendu, ignoré. Après la fin : annoncé à part.
        if (s.date > end) lateSets += 1;
        continue;
      }
      const day = days[i]!;
      const origin = setOrigin(leg, s);
      let g = day.groups.find((x) => x.slot === leg.slot);
      if (!g) {
        g = { slot: leg.slot, sets: 0, legs: [] };
        day.groups.push(g);
      }
      let l = g.legs.find((x) => x.exercise_id === origin.exercise_id);
      if (!l) {
        l = { exercise_id: origin.exercise_id, name: origin.exercise_name, sets: 0 };
        g.legs.push(l);
      }
      l.sets += 1;
      g.sets += 1;
      day.total += 1;
      rowOf(leg.slot).perDay[i]! += 1;
    }
  }

  const total = days.reduce((a, d) => a + d.total, 0);
  if (total === 0) return null;
  // Les groupes sans aucune série mais avec un objectif apparaissent quand même (ligne à 0).
  for (const slot of goalBySlot.keys()) rowOf(slot);

  const rows = [...rowMap.values()].map((r) => {
    r.total = r.perDay.reduce((a, n) => a + n, 0);
    r.daysWorked = r.perDay.filter((n) => n > 0).length;
    return r;
  });
  for (const d of days) d.groups.sort((a, b) => b.sets - a.sets);

  const totals = days.map((d) => d.total);
  const activeDays = totals.filter((n) => n > 0).length;
  const peak = Math.max(...totals);
  const peakDay = totals.indexOf(peak);
  const peakShare = peak / total;
  const idealPerDay = Math.ceil(total / D);

  const tips: DebriefTip[] = [];

  // 1. Un seul jour concentre une grosse part du volume.
  if (D >= 3 && total >= PEAK_MIN_SETS && peakShare >= PEAK_SHARE) {
    tips.push({
      id: 'peak',
      tone: 'tip',
      slots: [],
      text:
        `Le jour ${peakDay + 1} concentre ${Math.round(peakShare * 100)} % du volume (${peak} séries). ` +
        `Étaler sur plus de jours — environ ${idealPerDay} séries par jour — laisse mieux récupérer ` +
        `et garde de la qualité sur chaque série.`,
    });
  }

  // 2. Le volume est tombé sur la fin (« rush »).
  if (D >= 5) {
    const lastThirdFrom = Math.ceil((D * 2) / 3);
    const late = totals.slice(lastThirdFrom).reduce((a, n) => a + n, 0);
    if (late / total >= LATE_SHARE) {
      tips.push({
        id: 'late',
        tone: 'tip',
        slots: [],
        text:
          `${Math.round((late / total) * 100)} % des séries sont tombées sur le dernier tiers du défi : ` +
          `le début avait de la marge. Viser un rythme d'environ ${idealPerDay} séries par jour évite ` +
          `de tout compresser à la fin.`,
      });
    }
  }

  // 3. Une longue pause au milieu (ou au début).
  if (D >= 5) {
    const gap = longestGap(totals);
    if (gap.len >= GAP_DAYS) {
      tips.push({
        id: 'gap',
        tone: 'tip',
        slots: [],
        text:
          `${gap.len} jours de suite sans série (jours ${gap.from + 1} à ${gap.from + gap.len}). ` +
          `Un jour sur deux, même court, entretient mieux le rythme qu'une longue coupure.`,
      });
    }
  }

  // 4. Un groupe n'a été travaillé qu'un seul jour, alors que la durée permettait deux passages.
  if (D >= SINGLE_DAY_MIN_DURATION) {
    const single = rows.filter((r) => r.daysWorked === 1 && r.total >= SINGLE_DAY_MIN_SETS);
    if (single.length) {
      tips.push({
        id: 'singleDay',
        tone: 'tip',
        slots: single.map((r) => r.slot),
        text:
          `Travaillé en un seul jour : deux passages espacés de 48 h ou plus, avec la moitié des ` +
          `séries chacun, donnent en général plus de progrès que tout d'un coup.`,
      });
    }
  }

  // 5. Un même groupe fortement chargé deux jours d'affilée.
  if (D >= 4) {
    const b2b = rows.filter((r) =>
      r.perDay.some((n, i) => i > 0 && n >= BACK_TO_BACK_SETS && r.perDay[i - 1]! >= BACK_TO_BACK_SETS),
    );
    if (b2b.length) {
      tips.push({
        id: 'backToBack',
        tone: 'tip',
        slots: b2b.map((r) => r.slot),
        text:
          `Chargé deux jours d'affilée. Alterner avec un autre groupe laisse 48 h de récupération ` +
          `au même muscle.`,
      });
    }
  }

  // 6. Aucun jour de repos sur un défi long.
  if (D >= 6 && activeDays === D) {
    tips.push({
      id: 'noRest',
      tone: 'tip',
      slots: [],
      text: `Aucun jour de repos sur ${D} jours : prévoir un ou deux jours off aide à tenir le rythme.`,
    });
  }

  // 7. Ce qui n'a pas été bouclé, nommé par groupe.
  const missed = comboGoals(c)
    .filter((g) => !goalComplete(g) && g.target > 0)
    .map((g) => g.slot);
  if (missed.length) {
    tips.push({
      id: 'missed',
      tone: 'tip',
      slots: [...new Set(missed)],
      text:
        `Objectif non bouclé. Commencer par ces groupes dès les premiers jours, quand l'énergie ` +
        `est là, laisse la marge de rattraper un jour manqué.`,
    });
  }

  // 8. Rien à redire : le dire (un bilan qui ne fait que corriger décourage).
  if (!tips.length && activeDays >= Math.min(D, 3)) {
    tips.push({
      id: 'regular',
      tone: 'good',
      slots: [],
      text:
        `Répartition régulière : des séries sur ${activeDays} jour${activeDays > 1 ? 's' : ''} ` +
        `sur ${D}, sans jour qui écrase les autres. C'est le rythme à reproduire.`,
    });
  }

  return {
    duration: D,
    days,
    rows,
    total,
    activeDays,
    restDays: D - activeDays,
    peakDay,
    peakShare,
    lateSets,
    idealPerDay,
    tips,
  };
}
