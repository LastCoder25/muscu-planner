// skirmish.ts — le COMBAT DE GROUPE : des unités distinctes contre une troupe. Pur/testable.
//
// ⚠️ LE COMBAT RESTE UN SEUL COMBAT. L'issue se joue par `simulateCombat` entre le groupe
// FONDU et la troupe FONDUE — crit, esquive, réduction, vol de vie, signatures et procs
// compris — et c'est ce combat, calibré et mesuré, qui décide gagné/perdu. Le groupe n'est
// qu'une LECTURE de son journal (`deriveSkirmish`) : qui tombe, qui abat qui. Rien n'est
// re-simulé, donc l'issue et tout ce qui en découle (cargaison, butin) sont identiques au
// bit près à ceux du combat fondu.
//
// ⚠️ POURQUOI PAS DES DUELS ENCHAÎNÉS (essayés puis écartés, v0.860) : leur rapport
// trio/solo est LINÉAIRE (≈ 2 à 3), là où un combat fondu suit offense × survie — les bandes
// de route (solo ~0 %, trio 70-94 %) n'y tenaient à aucun réglage, et même une embuscade
// gagnée faisait tomber 1 à 2 membres (voyages avec blessé ×2,6 à ×8).
//
// ⚠️ POURQUOI PAS `siegeBattle` : ses unités n'ont que PV et dégâts, et ses règles (mur,
// brèche, secteurs) n'ont pas d'objet en rase campagne.
//
// ⚠️ PERSONNE NE MEURT : un allié « tombé » part à l'infirmerie (`down`), jamais perdu.
import { mulberry32, offenseOf, survivalOf, type CombatEvent, type Combatant } from './combat';

export const SKIRMISH = {
  /** Part de la base d'une épreuve (`trialXpBase`) que vaut UN ennemi abattu, pour le groupe
   *  entier. ⚠️ MESURÉE sur les embuscades de convoi — XP moyenne par membre, ancien bonus
   *  forfaitaire par embuscade → abattus partagés (× distance), escortes accompagnées et
   *  équipées, 1 500 voyages par case, niveaux 12 / 26 / 70 :
   *  - trio : calme −0,5 à −0,1 %, périlleux −8,4 à −7,0 % ;
   *  - quatuor : calme −2,1 à −1,6 %, périlleux −7,2 à −5,8 % ;
   *  - duo : calme −2,7 à +2,5 %, périlleux −8,9 à −7,7 % aux niveaux 12-26, −18,3 % au 70 ;
   *  - solo : calme −8,8 à −1,2 %, périlleux −24,2 à −23,3 %.
   *  ⚠️ Une escorte qui PERD (solo : 0 % d'embuscades gagnées) apprend moins qu'avant : on
   *  paie ce qui est abattu, plus le simple fait d'avoir croisé du monde. Pas de bande
   *  globale tenue : le trio et le quatuor restent sous 10 %, le solo sur route périlleuse
   *  et le duo périlleux au niveau 70 non. */
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

/** Une mort du journal : QUI a abattu QUI, et à quel événement du combat fondu.
 *  `at` = indice dans `GroupFight.log`, ou `log.length` pour la CLÔTURE (combat tranché au
 *  chrono : les derniers debout du camp perdant tombent à la fin). */
interface SkirmishKill {
  at: number;
  killer: string;
  victim: string;
}

export interface SkirmishResult {
  /** C'est l'issue du combat fondu, recopiée — la dérivation ne décide rien. */
  win: boolean;
  kills: SkirmishKill[];
  /** Morts par tueur (alliés ET ennemis). */
  killsBy: Record<string, number>;
  /** Alliés tombés — BLESSÉS (infirmerie), jamais perdus. */
  down: string[];
  /** Ennemis abattus. */
  foesDown: string[];
  /** Ordre de front des alliés (tiré à la graine) et leurs bornes cumulées dans cet ordre. */
  front: string[];
  allyCuts: number[];
  /** Bornes cumulées des corps ennemis, dans l'ordre de la troupe. */
  foeCuts: number[];
}

/** Le combat FONDU dont on lit le groupe. Générique : route, camp, tout ce qui se résout en
 *  un `simulateCombat` entre deux combattants agrégés. */
export interface GroupFight {
  /** Journal du combat : `playerPv` / `monsterPv` APRÈS chaque événement. */
  log: readonly CombatEvent[];
  win: boolean;
  /** PV max du combattant fondu du groupe (`player.pv`) et de celui de la troupe. */
  allyPv: number;
  foePv: number;
}

export interface TroopSpec {
  /** Nombre de CORPS entre lesquels la troupe fondue est répartie. */
  count: number;
  level: number;
  name: string;
  emoji: string;
}

/** Base d'XP d'une épreuve de ce niveau. ⚠️ SOURCE UNIQUE, littéralement partagée avec
 *  `caravan.ts` : `missionXp` l'appelle directement (`import { trialXpBase } from './skirmish'`)
 *  plutôt que de recopier `6 + niveau × 1,6` — un convoi et un combat de groupe jugent le
 *  niveau d'un lieu de la MÊME façon, et un futur réglage de la courbe ne peut plus se faire
 *  d'un seul côté. */
export function trialXpBase(level: number): number {
  return 6 + level * 1.6;
}

/** Bornes CUMULÉES d'un total réparti selon des poids : la part i est entamée jusqu'à
 *  `cuts[i]`. ⚠️ Le dernier franchissement tombe EXACTEMENT au total — le dernier corps
 *  tombe quand le combattant fondu est à zéro, jamais avant ni après. À poids égaux, ce
 *  sont au chiffre près les bornes du rejeu de siège (`siegeStage.cutsFor` délègue ici).
 *  Des poids tous nuls valent des poids égaux.
 *  ⚠️ JAMAIS DE BORNE À 0 (dès que le total vaut au moins 1) : une borne nulle serait
 *  franchie par le PREMIER événement du journal, même une esquive (`dealt 0 >= 0`) — le
 *  corps tomberait sans avoir été touché. Un petit total réparti entre beaucoup de corps y
 *  menait par l'arrondi ; la borne est relevée à 1, ce qui garde l'ordre (monotone) et le
 *  dernier franchissement au total. */
export function cumulativeCuts(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const w = sum > 0 ? weights.map((x) => Math.max(0, x)) : weights.map(() => 1);
  const denom = sum > 0 ? sum : weights.length;
  const end = Math.round(total);
  const floor = Math.min(1, Math.max(0, end));
  const cuts: number[] = [];
  let cum = 0;
  for (let i = 0; i < w.length; i++) {
    cum += w[i]!;
    cuts.push(i === w.length - 1 ? end : Math.max(floor, Math.round((total * cum) / denom)));
  }
  return cuts;
}

/** Tirage pondéré (poids tous nuls → uniforme). `undefined` sur une liste vide. */
function pick<T>(rng: () => number, items: readonly T[], weight: (x: T) => number): T | undefined {
  if (!items.length) return undefined;
  const ws = items.map((x) => Math.max(0, weight(x)));
  const sum = ws.reduce((s, x) => s + x, 0);
  if (sum <= 0) return items[Math.floor(rng() * items.length)]!;
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Ceux qui tiennent encore (repli : tout le camp, s'il n'y a plus personne). */
function standing(list: readonly SkirmishUnit[], fallen: Map<string, number>): SkirmishUnit[] {
  const up = list.filter((x) => !fallen.has(x.id));
  return up.length ? up : [...list];
}

/**
 * Le GROUPE, lu dans le journal du combat fondu. Déterministe pour une graine.
 *
 * - Les PV de la troupe fondue sont répartis entre ses corps (poids = PV de chaque corps) :
 *   un corps tombe quand les dégâts CUMULÉS infligés franchissent sa borne.
 * - Les PV du groupe fondu sont répartis entre les alliés (poids = `survivalOf` de CHAQUE
 *   unité), dans un ordre de FRONT tiré à la graine : un allié tombe quand les dégâts
 *   cumulés encaissés franchissent la sienne.
 * - Chaque mort est créditée à un membre du camp adverse DEBOUT au début de l'événement :
 *   côté allié, pondéré par son OFFENSE (`offenseOf`) — qui ne frappe pas n'abat personne ;
 *   côté ennemi, uniforme.
 *
 * ⚠️ PERSONNE NE SE RELÈVE : une chute n'est inscrite qu'UNE fois. Un vol de vie remonte les
 * PV du combattant fondu, pas ceux d'un corps déjà tombé — et la PREMIÈRE fois qu'une borne
 * est franchie est la même, qu'on lise les pertes du moment ou leur haut de marée.
 * ⚠️ CLÔTURE : sur une victoire tous les corps sont tombés, sur une défaite tous les alliés
 * (combat au chrono compris). Un dernier événement où les deux camps touchent zéro est une
 * DÉFAITE — c'est `simulateCombat` qui le dit, on ne fait que le recopier.
 * ⚠️ GÉNÉRATEUR SÉPARÉ, seedé ici : l'appelant ne consomme RIEN de son propre flux, sinon
 * lire le groupe décalerait tous ses tirages suivants (butin, rencontres).
 * ⚠️ UN CAMP VIDE NE PLANTE PAS : sans personne en face pour la créditer, une chute reste
 * inscrite (`down`/`foesDown`), simplement sans entrée dans `kills` — il n'y a pas de tueur
 * à nommer. Inatteignable par la route (escorte ≥ 1), mais `GroupFight` est générique.
 */
export function deriveSkirmish(
  fight: GroupFight,
  allies: readonly SkirmishUnit[],
  foes: readonly SkirmishUnit[],
  seed: number,
): SkirmishResult {
  const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0 || 1);
  // Ordre de front : Fisher-Yates sur une copie.
  const front = [...allies];
  for (let i = front.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [front[i], front[j]] = [front[j]!, front[i]!];
  }
  const allyCuts = cumulativeCuts(
    fight.allyPv,
    front.map((a) => survivalOf(a.combatant)),
  );
  const foeCuts = cumulativeCuts(
    fight.foePv,
    foes.map((f) => f.combatant.pv),
  );
  const allyAt = new Map<string, number>();
  const foeAt = new Map<string, number>();
  const kills: SkirmishKill[] = [];
  const killsBy: Record<string, number> = {};
  const down: string[] = [];
  const foesDown: string[] = [];
  const credit = (
    at: number,
    killer: SkirmishUnit | undefined,
    victim: SkirmishUnit,
    ally: boolean,
  ) => {
    if (killer) {
      kills.push({ at, killer: killer.id, victim: victim.id });
      killsBy[killer.id] = (killsBy[killer.id] ?? 0) + 1;
    }
    (ally ? down : foesDown).push(victim.id);
    (ally ? allyAt : foeAt).set(victim.id, at);
  };
  const offense = (a: SkirmishUnit) => offenseOf(a.combatant);
  const even = () => 1;
  /** Tombe à `at` : chaque victime est créditée à un adversaire debout AVANT l'événement.
   *  ⚠️ Repli sur le camp entier s'il ne reste personne debout en face : une chute doit
   *  TOUJOURS être inscrite (la clôture en dépend), même sans tueur plausible. */
  const fall = (at: number, deadAllies: SkirmishUnit[], deadFoes: SkirmishUnit[]) => {
    const alliesUp = standing(front, allyAt);
    const foesUp = standing(foes, foeAt);
    for (const f of deadFoes) credit(at, pick(rng, alliesUp, offense), f, false);
    for (const a of deadAllies) credit(at, pick(rng, foesUp, even), a, true);
  };

  fight.log.forEach((e, at) => {
    const dealt = fight.foePv - e.monsterPv;
    const taken = fight.allyPv - e.playerPv;
    const deadFoes = foes.filter((f, i) => !foeAt.has(f.id) && dealt >= foeCuts[i]!);
    const deadAllies = front.filter((a, i) => !allyAt.has(a.id) && taken >= allyCuts[i]!);
    if (deadFoes.length || deadAllies.length) fall(at, deadAllies, deadFoes);
  });
  // Clôture : le camp perdant tombe en entier (chrono compris).
  const leftFoes = foes.filter((f) => !foeAt.has(f.id));
  const leftAllies = front.filter((a) => !allyAt.has(a.id));
  if (fight.win) fall(fight.log.length, [], leftFoes);
  else fall(fight.log.length, leftAllies, []);

  return {
    win: fight.win,
    kills,
    killsBy,
    down,
    foesDown,
    front: front.map((a) => a.id),
    allyCuts,
    foeCuts,
  };
}

/**
 * Une TROUPE : le combattant FONDU (`foe`, celui qui livre le combat) réparti entre
 * `count` CORPS. ⚠️ UNE SEULE FORCE DE TROUPE : la somme des PV des corps vaut EXACTEMENT
 * `foe.pv`, la somme de leurs dégâts EXACTEMENT `foe.damage`. Une barre de PV par corps, un
 * « PV de la troupe » affiché ou un camp dimensionné sur ces corps disent donc ce que le
 * combat applique — jamais une seconde calibration.
 *
 * ⚠️ POURQUOI : les corps portaient auparavant une force calculée à part (offense/survie
 * MOYENNES d'une unité de référence). Mesuré, leur somme valait ×2,23 les PV réels de
 * l'embuscade au niveau 12 et ×0,53 au niveau 70 — sans effet tant qu'ils ne servaient que
 * de poids égaux, mais un mensonge d'affichage assuré pour l'étape 3 (camps).
 *
 * Répartition à parts égales par les bornes cumulées : les PV d'un corps sont l'écart entre
 * deux bornes consécutives, donc `deriveSkirmish`, qui prend ces PV pour poids, retrouve au
 * chiffre près les bornes à poids égaux — l'issue et le journal des morts ne bougent pas.
 * Crit, esquive, initiative (et tout le reste) sont ceux du combattant fondu.
 * ⚠️ Le danger ABSOLU est celui de `foe` : à l'appelant de le dériver d'une RÉFÉRENCE,
 * jamais du groupe envoyé — sinon « combien j'en envoie » ne voudrait plus rien dire.
 * ⚠️ Les ids (`foe0`, `foe1`…) ne sont uniques QUE DANS UN MÊME appel : combiner les
 * unités de deux appels (deux factions, deux vagues…) sans les préfixer produirait des
 * doublons — à l'appelant de les distinguer s'il en assemble plusieurs.
 */
export function troopOf(foe: Combatant, spec: TroopSpec): SkirmishUnit[] {
  const even = new Array<number>(Math.max(1, Math.round(spec.count))).fill(1);
  const parts = (total: number) => {
    const cuts = cumulativeCuts(total, even);
    return cuts.map((c, i) => c - (i ? cuts[i - 1]! : 0));
  };
  const pv = parts(foe.pv);
  const damage = parts(foe.damage);
  return pv.map((p, i) => ({
    id: `foe${i}`,
    name: spec.name,
    emoji: spec.emoji,
    level: Math.max(1, spec.level),
    combatant: { ...foe, name: spec.name, pv: p, damage: damage[i]! },
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
