// muscleFatigue.ts — FATIGUE LOCALE des groupes musculaires pendant une séance (pur/testé).
// Le Défi 360 CALCULE l’ordre des séries d’une séance (`planSessionOrder`) et CONSEILLE (jamais on
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

// ── ORDRE DES SÉRIES D'UNE SÉANCE DU 360 (v1.249 ; demandé par l'utilisateur) ──
// L'ordre n'est plus un choix : l'app l'écrit pour que chaque série trouve ses muscles frais.
// Deux règles, dans cet ordre :
//  1. jamais deux séries de suite sur le même GROUPE (muscle principal) tant que c'est
//     possible — y compris plus loin : on ne prend pas une série qui obligerait, en fin de
//     séance, à enchaîner deux séries d'un même groupe (cf. `canFinish`) ;
//  2. parmi les séries permises, celle dont les muscles sont les plus reposés, d'après la
//     charge qui décroît (`exoFatigueCost`, principal + secondaires : un développé couché
//     fatigue aussi les triceps). À égalité : le groupe qui a le plus de séries à caser,
//     puis l'ordre donné.
// La suite se simule au rythme d'une série (exécution + repos) : la page la recalcule après
// chaque série faite, avec les vraies heures, donc elle suit le sportif s'il s'en écarte.

/** Une série à placer : l'exo (`key`), ses muscles, et combien de séries il lui reste. */
export interface OrderCandidate<K> {
  key: K;
  profile: MuscleProfile;
  remaining: number;
}

/** Le groupe d'un exo : son muscle principal (un exo sans muscle connu est son propre groupe). */
function groupOf<K>(c: OrderCandidate<K>): string {
  return c.profile.primary || `#${String(c.key)}`;
}

/** Peut-on encore finir sans deux séries d'un même groupe à la suite, sachant que la
 *  suivante ne peut pas être de `last` ? (Le groupe le plus fourni ne doit pas dépasser la
 *  moitié, arrondie au-dessus — au-dessous pour `last`, qui ne peut pas ouvrir.) */
function canFinish(counts: ReadonlyMap<string, number>, last: string): boolean {
  let total = 0;
  for (const n of counts.values()) total += n;
  for (const [g, n] of counts) {
    if (n > Math.ceil(total / 2)) return false;
    if (g === last && n > Math.floor(total / 2)) return false;
  }
  return true;
}

/** L'ordre des séries restantes (une clé par série). `hits` = séries déjà faites (le défi
 *  du jour et la séance), `lastGroup` = le groupe de la dernière série faite, `stepMs` =
 *  durée d'une série repos compris. */
export function planSessionOrder<K>(
  cands: readonly OrderCandidate<K>[],
  opts: { hits?: readonly FatigueHit[]; now: number; stepMs: number; lastGroup?: string },
): K[] {
  const left = cands.map((c) => ({ c, n: Math.max(0, Math.floor(c.remaining)), g: groupOf(c) }));
  const counts = new Map<string, number>();
  for (const x of left) counts.set(x.g, (counts.get(x.g) ?? 0) + x.n);
  const hits = [...(opts.hits ?? [])];
  let t = opts.now;
  let last = opts.lastGroup ?? '';
  const out: K[] = [];
  for (;;) {
    const open = left.filter((x) => x.n > 0);
    if (!open.length) return out;
    const fresh = open.filter((x) => x.g !== last);
    const safe = fresh.filter((x) => {
      const after = new Map(counts);
      after.set(x.g, (after.get(x.g) ?? 0) - 1);
      return canFinish(after, x.g);
    });
    // Plus de série sûre : on case d’abord le groupe le plus fourni (il est en retard).
    const most = Math.max(...fresh.map((x) => counts.get(x.g) ?? 0));
    const pool = safe.length
      ? safe
      : fresh.length
        ? fresh.filter((x) => (counts.get(x.g) ?? 0) === most)
        : open;
    const load = muscleLoad(hits, t);
    let best: { x: (typeof pool)[number]; cost: number } | null = null;
    for (const x of pool) {
      const cost = exoFatigueCost(load, x.c.profile);
      if (
        !best ||
        cost < best.cost - 1e-9 ||
        (Math.abs(cost - best.cost) <= 1e-9 && (counts.get(x.g) ?? 0) > (counts.get(best.x.g) ?? 0))
      )
        best = { x, cost };
    }
    const pick = best!.x;
    out.push(pick.c.key);
    pick.n--;
    counts.set(pick.g, (counts.get(pick.g) ?? 0) - 1);
    hits.push({ at: t, profile: pick.c.profile });
    last = pick.g;
    t += opts.stepMs;
  }
}

/** Le groupe (muscle principal) d'un profil, tel que `planSessionOrder` le compare. */
export function muscleGroupOf(key: string, profile: MuscleProfile): string {
  return groupOf({ key, profile, remaining: 0 });
}
