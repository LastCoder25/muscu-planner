// skirmish.ts — le COMBAT DE GROUPE : des unités distinctes contre une troupe. Pur/testable.
//
// ⚠️ UN MOTEUR, PAS UN TROISIÈME JEU DE FORMULES. Chaque affrontement est un DUEL résolu
// par `simulateCombat` — crit, esquive, réduction, vol de vie, signatures et procs compris —
// avec les PV REPORTÉS des deux côtés. Le groupe vit dans l'ENCHAÎNEMENT : la troupe avance
// dans son ordre, l'unité du joueur qui l'affronte est tirée à la graine parmi celles encore
// debout, et le perdant du duel tombe.
//
// ⚠️ POURQUOI PAS `siegeBattle` : ses unités n'ont que PV et dégâts (crit fondu, ni
// esquive, ni réduction, ni procs) et presque aucun aléa hors du ciblage. Sur un 3 contre 3
// l'issue y serait quasi déterministe — or la route vit de PROBABILITÉS (trio calme
// 70-94 %, périlleux 8-40 %). Et ses règles (mur, brèche, secteurs) n'ont pas d'objet en
// rase campagne.
//
// ⚠️ PERSONNE NE MEURT : un allié « tombé » part à l'infirmerie (`down`), jamais perdu.
import { mulberry32, offenseOf, simulateCombat, survivalOf, type Combatant } from './combat';

export const SKIRMISH = {
  /** Part de la base d'une épreuve (`trialXpBase`) que vaut UN ennemi abattu, pour le groupe
   *  entier. ⚠️ Recalibrée en Task 4 (XP moyenne d'un convoi à ±15 % de l'ancienne). */
  xpPerKill: 0.2,
  /** Un abattu ne vaut jamais plus qu'un ennemi de `niveau du membre + N` : un vétéran
   *  n'élève pas une recrue à sa place en l'emmenant sur un lieu hors de sa ligue. */
  carryMargin: 5,
} as const;

export interface SkirmishUnit {
  id: string;
  name: string;
  emoji: string;
  /** Niveau de l'unité — lu par l'XP (rendement décroissant, marge de portage). */
  level: number;
  combatant: Combatant;
}

/** Une mort du journal : QUI a abattu QUI, et à quel duel. */
export interface SkirmishKill {
  duel: number;
  killer: string;
  victim: string;
}

export interface SkirmishResult {
  /** Toute la troupe est tombée. */
  win: boolean;
  duels: number;
  kills: SkirmishKill[];
  /** Morts par tueur (alliés ET ennemis). */
  killsBy: Record<string, number>;
  /** Alliés tombés — BLESSÉS (infirmerie), jamais perdus. */
  down: string[];
  /** Ennemis abattus. */
  foesDown: string[];
  /** PV restants des alliés (0 pour un tombé). */
  pvLeft: Record<string, number>;
}

export interface TroopSpec {
  count: number;
  level: number;
  /** PV d'un ennemi ≈ N tours de l'offense MOYENNE d'une unité de référence. */
  pvTurns: number;
  /** Morsure ≈ part des PV EFFECTIFS moyens d'une unité de référence. */
  dmgPctPv: number;
  /** Multiplicateur de PV ET de dégâts (route périlleuse, taille de camp…). */
  mult: number;
  name: string;
  emoji: string;
}

/** Base d'XP d'une épreuve de ce niveau — celle de `missionXp`, source unique. */
export function trialXpBase(level: number): number {
  return 6 + level * 1.6;
}

/**
 * La bataille. Déterministe pour une graine.
 *
 * ⚠️ CIBLAGE SIMPLE, écrit une fois : la troupe se présente DANS SON ORDRE (le chef en
 * dernier si l'appelant l'y range), et c'est la graine qui choisit quel allié vivant lui
 * fait face — sans quoi le premier du vivier encaisserait tout, et partirait toujours seul
 * à l'infirmerie.
 * ⚠️ Chaque duel fait tomber au moins un combattant (le perdant ; les deux si les épines
 * achèvent le vainqueur) : la boucle se termine en au plus `allies + foes` duels.
 */
export function simulateSkirmish(
  allies: readonly SkirmishUnit[],
  foes: readonly SkirmishUnit[],
  seed: number,
): SkirmishResult {
  const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0 || 1);
  const pv = new Map<string, number>();
  for (const x of [...allies, ...foes]) pv.set(x.id, x.combatant.pv);
  const up = (x: SkirmishUnit) => (pv.get(x.id) ?? 0) > 0;
  const kills: SkirmishKill[] = [];
  const killsBy: Record<string, number> = {};
  const down: string[] = [];
  const foesDown: string[] = [];
  const fall = (killer: SkirmishUnit, victim: SkirmishUnit, duel: number, ally: boolean) => {
    pv.set(victim.id, 0);
    kills.push({ duel, killer: killer.id, victim: victim.id });
    killsBy[killer.id] = (killsBy[killer.id] ?? 0) + 1;
    (ally ? down : foesDown).push(victim.id);
  };

  let duel = 0;
  for (;;) {
    const foe = foes.find(up);
    const living = allies.filter(up);
    if (!foe || !living.length) break;
    const ally = living[Math.floor(rng() * living.length)]!;
    const r = simulateCombat(ally.combatant, foe.combatant, {
      seed: (seed + duel * 7919) >>> 0,
      goldOnWin: 0,
      startPlayerPv: pv.get(ally.id),
      startMonsterPv: pv.get(foe.id),
    });
    const last = r.log[r.log.length - 1];
    if (last) {
      pv.set(ally.id, Math.max(0, last.playerPv));
      pv.set(foe.id, Math.max(0, last.monsterPv));
    }
    // Le perdant tombe — y compris aux PV restants d'un combat tranché au chrono.
    if (r.win || !up(foe)) fall(ally, foe, duel, false);
    if (!r.win || !up(ally)) fall(foe, ally, duel, true);
    duel++;
  }

  return {
    win: !foes.some(up),
    duels: duel,
    kills,
    killsBy,
    down,
    foesDown,
    pvLeft: Object.fromEntries(allies.map((a) => [a.id, pv.get(a.id) ?? 0])),
  };
}

/**
 * Une TROUPE à danger ABSOLU, dérivée d'un groupe de RÉFÉRENCE — jamais du groupe envoyé :
 * sinon « combien j'en envoie » ne voudrait plus rien dire.
 *
 * ⚠️ `offenseOf` / `survivalOf` sont les formules de `combatPower`, l'arbitre du jeu :
 * une copie locale (celle de l'ancienne route) ignorait signatures et esquive, et la route
 * cessait de suivre l'escorte (mesuré v0.797).
 */
export function troopOf(reference: readonly Combatant[], spec: TroopSpec): SkirmishUnit[] {
  const n = Math.max(1, reference.length);
  const off = reference.reduce((s, x) => s + offenseOf(x), 0) / n;
  const surv = reference.reduce((s, x) => s + survivalOf(x), 0) / n;
  const pv = Math.max(1, Math.round(Math.max(1, off) * spec.pvTurns * spec.mult));
  const damage = Math.max(1, Math.round(surv * 100 * spec.dmgPctPv * spec.mult));
  return Array.from({ length: Math.max(1, Math.round(spec.count)) }, (_, i) => ({
    id: `foe${i}`,
    name: spec.name,
    emoji: spec.emoji,
    level: Math.max(1, spec.level),
    combatant: { name: spec.name, pv, damage, crit: 0.08, dodge: 0.05, initiative: 12 },
  }));
}

/**
 * L'XP de combat : chaque ennemi ABATTU vaut de l'XP, le total est PARTAGÉ entre les
 * membres PRÉSENTS — qui l'a abattu ne compte pas, on a tenu ensemble.
 *
 * ⚠️ Deux garde-fous par membre, et chacun répond à un abus : le RENDEMENT DÉCROISSANT de
 * `missionXp` (plancher 0,15, puissance 1,5) quand l'ennemi est loin sous lui, et la MARGE
 * DE PORTAGE (`SKIRMISH.carryMargin`) quand il est loin au-dessus — sinon un vétéran
 * emmenant des recrues sur un lieu hors de leur ligue les ferait monter à sa place.
 */
export function skirmishXpShares(
  present: readonly { id: string; level: number }[],
  foes: readonly SkirmishUnit[],
  result: Pick<SkirmishResult, 'foesDown'>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!present.length) return out;
  const dead = new Set(result.foesDown);
  const slain = foes.filter((f) => dead.has(f.id));
  for (const m of present) {
    const lvl = Math.max(1, m.level);
    let sum = 0;
    for (const f of slain) {
      const fl = Math.max(1, f.level);
      const ratio = Math.max(0.15, Math.min(1, fl / lvl));
      sum +=
        SKIRMISH.xpPerKill * trialXpBase(Math.min(fl, lvl + SKIRMISH.carryMargin)) * ratio ** 1.5;
    }
    out[m.id] = Math.round(sum / present.length);
  }
  return out;
}
