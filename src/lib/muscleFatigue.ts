// muscleFatigue.ts — FATIGUE LOCALE des groupes musculaires pendant une séance (pur/testé).
// Le Défi 360 laisse faire ses séries dans l'ordre qu'on veut : on CONSEILLE (jamais on
// n'interdit) de ne pas enchaîner un exo dont un muscle vient de travailler.
//
// ⚠️ AUCUN ÉTAT STOCKÉ : la fatigue se RECALCULE à partir de l'heure de chaque série
// (`ComboSet.at`, en base). Un minuteur en localStorage aurait été un second état, faux dès
// qu'une série est corrigée, retirée ou saisie sur un autre appareil.
//
// Modèle : une série ajoute 1 à son muscle principal et ½ à chacun de ses secondaires (le
// même crédit que l'Équilibre du corps), puis cette charge DÉCROÎT de moitié toutes les
// `halfLifeMin` minutes. Une charge qui s'additionne et décroît dit ce qu'un minuteur par
// groupe ne sait pas dire : trois séries enchaînées fatiguent plus qu'une, et un
// développé couché sollicite aussi les triceps.

import { normMuscle } from './muscles';
import { legSets, setOrigin, type ComboLeg } from './combo';

export const FATIGUE = {
  /** Demi-vie de la charge d'un muscle, en minutes. */
  halfLifeMin: 7,
  /** Part d'une série portée par un muscle secondaire (crédit de l'Équilibre du corps). */
  secondaryShare: 0.5,
  /** Muscle « à reposer » : une série de lui dans les ~5 dernières minutes, ou plusieurs
   *  dans le quart d'heure. */
  hot: 0.6,
  /** Muscle « encore sollicité » : en dessous, on ne dit plus rien. */
  warm: 0.3,
  /** Au-delà, une série ne pèse plus rien (et on ne la lit même pas). */
  horizonMin: 90,
} as const;

/** Les muscles qu'un exo fait travailler, normalisés. */
export interface MuscleProfile {
  primary: string;
  secondaries: readonly string[];
}

/** Profil normalisé : secondaires dédoublonnés, sans le principal, sans vide. */
export function muscleProfile(
  primary: string | null | undefined,
  secondaries: readonly string[] | null | undefined,
): MuscleProfile {
  const p = normMuscle(primary);
  const sec = [
    ...new Set((secondaries ?? []).map((s) => normMuscle(s)).filter((s) => s && s !== p)),
  ];
  return { primary: p, secondaries: sec };
}

/** Une série faite : quand, et quels muscles elle a fait travailler. */
export interface FatigueHit {
  at: number; // ms
  profile: MuscleProfile;
}

/** Charge de chaque muscle à l'instant `now` (une série future ou trop ancienne ne compte pas). */
export function muscleLoad(hits: readonly FatigueHit[], now: number): Record<string, number> {
  const load: Record<string, number> = {};
  const horizon = FATIGUE.horizonMin * 60_000;
  for (const h of hits) {
    const age = now - h.at;
    if (age < 0 || age > horizon) continue;
    const decay = Math.pow(0.5, age / (FATIGUE.halfLifeMin * 60_000));
    const add = (m: string, w: number) => {
      if (m) load[m] = (load[m] ?? 0) + w * decay;
    };
    add(h.profile.primary, 1);
    for (const s of h.profile.secondaries) add(s, FATIGUE.secondaryShare);
  }
  return load;
}

type FatigueLevel = 'fresh' | 'warm' | 'hot';
export interface ExoFatigue {
  level: FatigueLevel;
  /** Les muscles en cause, le principal d'abord. Vide si `fresh`. */
  muscles: string[];
}

/** Ce que la charge actuelle dit d'un exo :
 *  - `hot` : son muscle PRINCIPAL est à reposer ;
 *  - `warm` : son principal est encore sollicité, ou un de ses SECONDAIRES est à reposer ;
 *  - `fresh` : rien à signaler. */
export function exoFatigue(load: Readonly<Record<string, number>>, p: MuscleProfile): ExoFatigue {
  const of = (m: string) => load[m] ?? 0;
  const pl = p.primary ? of(p.primary) : 0;
  const hotSec = p.secondaries.filter((s) => of(s) >= FATIGUE.hot);
  if (pl >= FATIGUE.hot) return { level: 'hot', muscles: [p.primary, ...hotSec] };
  const warmMuscles = [...(pl >= FATIGUE.warm ? [p.primary] : []), ...hotSec];
  if (warmMuscles.length) return { level: 'warm', muscles: warmMuscles };
  return { level: 'fresh', muscles: [] };
}

/** Coût numérique d'un exo (pour choisir la prochaine série) : sa charge sur le principal,
 *  plus la part secondaire de la charge de ses secondaires. */
export function exoFatigueCost(load: Readonly<Record<string, number>>, p: MuscleProfile): number {
  let c = p.primary ? (load[p.primary] ?? 0) : 0;
  for (const s of p.secondaries) c += FATIGUE.secondaryShare * (load[s] ?? 0);
  return c;
}

/** La prochaine série « la plus fraîche » parmi des candidats (ordre « Par groupe » de la
 *  séance) : le coût le plus bas ; à égalité, pas l'exo qu'on vient de faire, puis l'ordre
 *  donné. `null` sans candidat. */
export function pickFreshest<K>(
  cands: readonly { key: K; profile: MuscleProfile }[],
  load: Readonly<Record<string, number>>,
  last?: K,
): K | null {
  let best: { key: K; cost: number; repeat: boolean } | null = null;
  for (const c of cands) {
    const cost = exoFatigueCost(load, c.profile);
    const repeat = c.key === last;
    if (
      !best ||
      cost < best.cost - 1e-9 ||
      (Math.abs(cost - best.cost) <= 1e-9 && best.repeat && !repeat)
    )
      best = { key: c.key, cost, repeat };
  }
  return best?.key ?? null;
}

/** Le texte de la pastille (null quand il n'y a rien à dire). Formulé sans accord : les
 *  noms de muscles sont tantôt pluriels (pectoraux), tantôt non (dos). */
export function fatigueLabel(f: ExoFatigue): { text: string; title: string } | null {
  if (f.level === 'fresh') return null;
  const list = f.muscles.join(', ');
  return f.level === 'hot'
    ? {
        text: `🔥 À reposer : ${list}`,
        title: `Ces muscles viennent de travailler : enchaîne plutôt un autre groupe, puis reviens`,
      }
    : {
        text: `♨️ Déjà sollicité : ${list}`,
        title: `Ces muscles ont travaillé il y a peu : possible, mais un autre groupe serait plus frais`,
      };
}

/** Comment retrouver les muscles d'un exo : l'appelant combine le muscle porté par la série
 *  et la bibliothèque (secondaires). `null` = inconnu, la série est ignorée. */
export type ProfileOf = (exerciseId: string, primaryHint: string | null) => MuscleProfile | null;

/** Les séries d'un Défi 360 qui portent une heure, avec leurs muscles RÉELS (l'exo
 *  d'origine d'une série basculée — `setOrigin`). Une série sans heure (saisie avant la
 *  v0.1159) est ignorée : on ne devine pas quand elle a été faite. */
export function comboFatigueHits(legs: readonly ComboLeg[], profileOf: ProfileOf): FatigueHit[] {
  const out: FatigueHit[] = [];
  for (const leg of legs) {
    for (const s of legSets(leg)) {
      // Sans heure (ou heure illisible) : NaN, donc ignorée.
      const at = Date.parse(s.at ?? '');
      if (!Number.isFinite(at)) continue;
      const o = setOrigin(leg, s);
      const profile = profileOf(o.exercise_id, o.muscle_primary ?? null);
      if (profile) out.push({ at, profile });
    }
  }
  return out;
}
