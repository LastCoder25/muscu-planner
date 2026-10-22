// ⚡ CIRCUIT EXPRESS DU DÉFI 360 (v1.271 ; demandé par l'utilisateur : « je prends 2/3/4/5
// exos et je fais une série de chaque en enchaînant »). Choisit N exos qui ne se fatiguent
// pas entre eux, pour une série de chaque, enchaînées sans repos.
//
// Deux exos « se marchent dessus » quand ils ont le même muscle principal, ou quand le
// principal de l'un est un secondaire de l'autre (pompes + dips : les triceps travaillent
// deux fois). Pompes + tractions passent : leurs secondaires ne touchent pas l'autre.
//
// Priorité (décision de l'utilisateur) : l'exo qui a le PLUS de séries à faire cette
// semaine, puis le moins fatigué aujourd'hui, puis l'ordre donné. Le circuit s'arrête au
// nombre d'exos compatibles : jamais un exo qui en fatigue un autre pour remplir.
import { comboMuscleInZone } from './combo';
import { exoFatigueCost, type MuscleProfile } from './muscleFatigue';

export interface CircuitCandidate<K> {
  key: K;
  profile: MuscleProfile;
  /** Séries qu'il reste à faire cette semaine (en séries, quel que soit le mode). */
  setsLeft: number;
}

/** Les deux exos se fatiguent-ils l'un l'autre ? Un exo sans muscle connu ne gêne personne. */
export function circuitConflict(a: MuscleProfile, b: MuscleProfile): boolean {
  if (a.primary && a.primary === b.primary) return true;
  if (a.primary && b.secondaries.includes(a.primary)) return true;
  if (b.primary && a.secondaries.includes(b.primary)) return true;
  return false;
}

type CircuitZone = 'haut' | 'bas' | 'tronc';
function zoneOf(p: MuscleProfile): CircuitZone {
  const haut = comboMuscleInZone(p.primary, 'haut');
  const bas = comboMuscleInZone(p.primary, 'bas');
  return haut && !bas ? 'haut' : bas && !haut ? 'bas' : 'tronc';
}

/** Range le circuit en alternant haut / bas / tronc (la zone la plus fournie ouvre) : deux
 *  exos d'une même zone ne se suivent que si on ne peut pas faire autrement. */
function alternateZones<K>(picked: readonly CircuitCandidate<K>[]): CircuitCandidate<K>[] {
  const queues = new Map<CircuitZone, CircuitCandidate<K>[]>();
  for (const c of picked) {
    const z = zoneOf(c.profile);
    queues.set(z, [...(queues.get(z) ?? []), c]);
  }
  const out: CircuitCandidate<K>[] = [];
  let last: CircuitZone | null = null;
  while (out.length < picked.length) {
    const open = [...queues.entries()].filter(([, q]) => q.length);
    // La plus fournie d'abord, sauf celle qu'on vient de faire (si une autre reste).
    open.sort((a, b) => b[1].length - a[1].length);
    const pick = open.find(([z]) => z !== last) ?? open[0]!;
    out.push(pick[1].shift()!);
    last = pick[0];
  }
  return out;
}

/** Le circuit : jusqu'à `n` exos compatibles deux à deux, dans l'ordre où les faire.
 *  `load` = charge actuelle des muscles (fatigue du jour). `avoid` = exos à ne reprendre
 *  qu'en dernier recours (« 🎲 Autre combinaison » y met le circuit précédent). */
export function pickExpressCircuit<K>(
  cands: readonly CircuitCandidate<K>[],
  n: number,
  opts: { load?: Readonly<Record<string, number>>; avoid?: ReadonlySet<K> } = {},
): K[] {
  const load = opts.load ?? {};
  const avoid = opts.avoid ?? new Set<K>();
  const ranked = cands
    .map((c, i) => ({ c, i, cost: exoFatigueCost(load, c.profile) }))
    .filter((x) => x.c.setsLeft > 0)
    .sort(
      (a, b) =>
        Number(avoid.has(a.c.key)) - Number(avoid.has(b.c.key)) ||
        b.c.setsLeft - a.c.setsLeft ||
        a.cost - b.cost ||
        a.i - b.i,
    );
  const list = ranked.map((x) => x.c);
  // Recherche complète (une quinzaine d'exos au plus, 5 places) : le PLUS GRAND circuit
  // possible, et à taille égale le premier dans l'ordre de priorité. Un choix glouton
  // ratait B + C quand l'exo prioritaire A gêne les deux.
  let best: CircuitCandidate<K>[] = [];
  const cur: CircuitCandidate<K>[] = [];
  const target = Math.max(0, Math.floor(n));
  const dfs = (from: number): boolean => {
    if (cur.length > best.length) best = [...cur];
    if (cur.length >= target) return true;
    if (cur.length + (list.length - from) <= best.length) return false;
    for (let i = from; i < list.length; i++) {
      const c = list[i]!;
      if (cur.some((p) => circuitConflict(p.profile, c.profile))) continue;
      cur.push(c);
      const done = dfs(i + 1);
      cur.pop();
      if (done) return true;
    }
    return false;
  };
  dfs(0);
  return alternateZones(best).map((c) => c.key);
}
