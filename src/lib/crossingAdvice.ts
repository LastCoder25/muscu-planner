/**
 * 🧭 PARTIR OU RESTER ? — le conseil de traversée (2026-10-12, demandé par l'utilisateur :
 * « conseiller au joueur de passer ou non à l'île suivante quand celle où il est est pacifiée,
 * selon ses effectifs et leurs rangs »).
 *
 * Trois questions, chacune rejouée sur les VRAIES fonctions du combat — jamais une formule
 * recopiée (un pronostic qui refait le calcul à sa façon finit par diverger de la bataille) :
 *
 * 1. **PRENDRE** : combien de tes meilleurs champions faut-il pour prendre un lieu fixe typique
 *    de l'île suivante (`campWinPct`, la même troupe que `campSpecOf`) ? ⚠️ Décision de
 *    l'utilisateur : « si on doit utiliser tous ses effectifs pour prendre un lieu, ça ne vaut
 *    pas le coup » — il faut que la MOITIÉ de ce qu'on peut engager suffise.
 * 2. **TENIR** : champions et miliciens défendent ensemble (2026-10-12). Sur une île neuve la
 *    milice vient des îles quittées (`militiaSea`) : on rejoue la reprise avec ce qu'on peut
 *    faire venir (`garrisonHoldChance`, enceinte comprise), seule puis avec les champions
 *    qui ont pris le lieu laissés en garnison — les garder ou non est un choix.
 * 3. **RAPPORTER** : ce que tes champions y apprennent et ce qu'un lieu y produit, comparé à
 *    l'île où tu es. ⚠️ L'île quittée continue de produire (pacifiée) : partir n'y perd rien.
 *
 * ⚠️ LE NIVEAU DES LIEUX EST TIRÉ (décision de l'utilisateur : « les lieux qui spawnent sont
 * aléatoires entre le niveau min et max de l'île ») : entre le plancher de l'île et le haut de
 * TON rang (`riftLevelFor`), jamais au-delà du plafond de l'île. On moyenne donc sur cette
 * tranche au lieu de juger sur un seul niveau.
 */
import type { Adventurer } from './adventurers';
import { ISLANDS, type Island } from './archipelago';
import { campWinPct } from './camp';
import { dangerMult, missionXpSplit, partyAllies, type EscortKit } from './caravan';
import { characterRank, rankStartLevel } from './characterRank';
import { CONTROL, controlGoldPerHour, garrisonHoldChance } from './controlPoints';
import { enemyLevelFor, mineVeinGold, type Poi, type PoiType } from './expedition';
import { partyWinChance } from './partyForecast';
import { ISLAND_CONQUEST, fortressForce } from './islandConquest';
import { MILITIA, MILITIA_PREFIX, militiaUnits } from './militia';
import { adventurerPowers } from './raid';
import { trialXpBase } from './skirmish';

const ADVICE = {
  /** Un lieu est « pris » à partir de cette chance de victoire. */
  takeOk: 0.7,
  /** Une garnison « tient » à partir de cette part de reprises repoussées. */
  holdOk: 0.5,
  /** Combats rejoués par cas : peu, le conseil se lit en gros. */
  samples: 16,
} as const;

export type AdviceVerdict = 'go' | 'bring' | 'train';

export interface CrossingAdvice {
  next: Island;
  verdict: AdviceVerdict;
  /** La tranche de niveaux des lieux qu'on y croisera. */
  levels: { lo: number; hi: number };
  /** Champions nécessaires pour prendre un lieu (null : même tous ne suffisent pas). */
  need: number | null;
  /** Ce qu'on peut engager (vivier borné par le Panthéon). */
  pool: number;
  /** Chance de prendre un lieu avec `need` (ou avec tout le vivier si `need` est null). */
  takePct: number;
  /** Miliciens qu'on peut y faire venir (au plus une garnison pleine). */
  militia: number;
  /** Part des reprises que ces miliciens repousseraient. */
  holdPct: number;
  /** Champions laissés en garnison avec eux : ceux qui ont pris le lieu (`need`, 3 au plus). */
  keep: number;
  /** Part des reprises repoussées si ces champions restent aussi (null : aucun à laisser). */
  holdKeepPct: number | null;
  /** XP par mission de tes meilleurs champions, ici puis là-bas (même formule de rendement
   *  que `missionXp`). */
  xp: { here: number; there: number };
  /** Or par heure d'une mine tenue au complet, ici puis là-bas. */
  gold: { here: number; there: number };
  /** Ce qui manque, en phrases courtes (vide quand on peut partir). */
  missing: string[];
}

export interface CrossingAdviceInput {
  /** L'île où l'on est. */
  current: number;
  heroLevel: number;
  champions: readonly Adventurer[];
  kit: EscortKit;
  /** Champions engageables à la fois (`engageCap`). */
  engage: number;
  /** Miliciens qu'on pourrait faire venir des îles quittées (réserve active comprise). */
  militia: number;
  /** 🧱🏹 `fortifyMult` de l'enceinte. */
  fort: number;
  samples?: number;
}

/** Les niveaux des lieux de l'île `next` pour un héros de `heroLevel` : du plancher de l'île au
 *  haut de son rang, jamais au-delà du plafond de l'île. */
export function adviceLevels(next: Island, heroLevel: number): { lo: number; hi: number } {
  const lo = next.minLevel;
  const r = characterRank(heroLevel).rankIndex;
  const rankEnd = rankStartLevel(r + 1) - 1;
  const hi = Math.max(lo, Math.min(next.maxLevel, r + 1 > 9 ? next.maxLevel : rankEnd));
  return { lo, hi };
}

const spread = (lo: number, hi: number): number[] =>
  lo === hi ? [lo] : [lo, Math.round((lo + hi) / 2), hi];

/** Un lieu fixe ennemi de niveau `level`, tenu par une troupe de `size`. */
function enemyPlace(level: number, size: number, island: Island): Poi {
  return {
    id: `advice_${level}_${size}`,
    type: 'control',
    level,
    x: 0,
    y: 0,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 9e15,
    control: {
      kind: 'mine',
      owner: 'enemy',
      faction: island.faction,
      size,
      garrison: [],
      retakes: 0,
    },
  };
}

/** XP d'une mission GAGNÉE pour un champion de niveau `L` sur un lieu de niveau `d` : le
 *  rendement décroissant de `missionXp` ET sa prime de danger (`dangerMult`). ⚠️ Sans la prime
 *  (avant le 2026-10-14) le conseil sous-estimait l'île la plus dure : mesuré sur un vrai
 *  compte (île 3, champions niv. 27-40), une mission y rapportait 80 à 200 XP par champion,
 *  contre ~55 sur l'île 2. */
function learn(L: number, d: number): number {
  return trialXpBase(d) * Math.min(1, d / Math.max(1, L)) ** 1.5 * dangerMult(L, d);
}

export function crossingAdvice(i: CrossingAdviceInput): CrossingAdvice | null {
  const here = ISLANDS.find((x) => x.id === i.current);
  const next = ISLANDS.find((x) => x.id === i.current + 1);
  if (!here || !next) return null;
  const samples = i.samples ?? ADVICE.samples;
  const { lo, hi } = adviceLevels(next, i.heroLevel);
  const levels = spread(lo, hi);

  // 1. PRENDRE — les meilleurs d'abord (la puissance du jeu, jamais une somme de stats).
  const pw = adventurerPowers([...i.champions], i.kit);
  const best = [...i.champions].sort(
    (a, b) => (pw.get(b.id) ?? 0) - (pw.get(a.id) ?? 0) || a.id.localeCompare(b.id),
  );
  const pool = Math.min(best.length, Math.max(0, Math.floor(i.engage)));
  const take = (k: number): number => {
    const allies = partyAllies(best.slice(0, k), i.kit, null);
    let w = 0;
    let n = 0;
    for (const L of levels)
      for (const size of CONTROL.captureSizes) {
        w += campWinPct(
          enemyPlace(L, size, next),
          { faction: next.faction, size },
          allies,
          samples,
        );
        n++;
      }
    return n ? w / n : 0;
  };
  let need: number | null = null;
  let takePct = 0;
  for (let k = 1; k <= pool; k++) {
    takePct = take(k);
    if (takePct >= ADVICE.takeOk) {
      need = k;
      break;
    }
  }

  // 2. TENIR — la milice qu'on fait venir, au niveau que la carte de l'île lui donne.
  const militia = Math.max(0, Math.min(MILITIA.perPoint, Math.floor(i.militia)));
  const milLevel = Math.min(i.heroLevel, next.maxLevel);
  const ids = Array.from({ length: militia }, (_, k) => `${MILITIA_PREFIX}${k}`);
  const units = militiaUnits(ids, milLevel);
  const holdOf = (allies: typeof units): number => {
    if (!allies.length) return 0;
    let w = 0;
    for (const L of levels)
      w += garrisonHoldChance(enemyPlace(L, 1, next), allies, 1, samples, i.fort);
    return w / levels.length;
  };
  const holdPct = holdOf(units);
  // Les champions qui ont pris le lieu peuvent y rester (3 au plus, la garnison de référence).
  const keep = need === null ? 0 : Math.min(need, CONTROL.maxGarrison);
  const holdKeepPct = keep
    ? holdOf([...partyAllies(best.slice(0, keep), i.kit, null), ...units])
    : null;

  // 3. RAPPORTER — l'XP des meilleurs, l'or d'une mine tenue au complet.
  const top = best.slice(0, Math.max(1, pool));
  const meanXp = (d: number) =>
    top.length ? top.reduce((s, a) => s + learn(a.level, d), 0) / top.length : 0;
  const mid = Math.round((lo + hi) / 2);
  const xp = {
    here: Math.round(meanXp(Math.min(here.maxLevel, i.heroLevel))),
    there: Math.round(meanXp(mid)),
  };
  const ref = { id: 'advice' };
  const gold = {
    here: Math.round(controlGoldPerHour(ref, 3, Math.min(i.heroLevel, here.maxLevel))),
    there: Math.round(controlGoldPerHour(ref, 3, Math.min(i.heroLevel, next.maxLevel))),
  };

  // Verdict : prendre avec au plus la MOITIÉ (arrondie au-dessus) de ce qu'on engage — le
  // reste peut tenir d'autres missions —, puis tenir.
  const half = Math.max(1, Math.ceil(pool / 2));
  const takeOk = need !== null && need <= half;
  const missing: string[] = [];
  if (!pool) missing.push('aucun champion à engager');
  else if (need === null)
    missing.push(`même tes ${pool} meilleurs champions ne prennent pas un lieu de ce niveau`);
  else if (need > half)
    missing.push(`il faudrait ${need} champions sur ${pool} pour prendre un lieu`);
  if (holdPct < ADVICE.holdOk) {
    if (militia < MILITIA.perPoint)
      missing.push(
        `${MILITIA.perPoint - militia} milicien${MILITIA.perPoint - militia > 1 ? 's' : ''} de plus à faire venir pour tenir`,
      );
    else missing.push('tes lieux y tiendront mal : monte muraille et tourelles');
    if (holdKeepPct !== null && holdKeepPct >= ADVICE.holdOk)
      missing.push(
        `ou laisse ${keep} champion${keep > 1 ? 's' : ''} en garnison : ${Math.round(holdKeepPct * 100)} %`,
      );
  }
  const verdict: AdviceVerdict = !takeOk ? 'train' : holdPct >= ADVICE.holdOk ? 'go' : 'bring';
  return {
    next,
    verdict,
    levels: { lo, hi },
    need,
    pool,
    takePct,
    militia,
    holdPct,
    keep,
    holdKeepPct,
    xp,
    gold,
    missing,
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * 🧭 RESTER OU RECULER ? (2026-10-14, demandé par l'utilisateur : « avec mon arrivée sur
 * l'île 3 et mes actions dessus, est-il plus rentable de rester ou de revenir en arrière ? »).
 *
 * Le conseil de traversée ne parlait que d'AVANCER, et seulement une fois l'île pacifiée : rien
 * ne disait, sur une île qu'on vient d'aborder, si l'on y gagnait plus qu'en revenant. On
 * compare donc les deux îles avec les mêmes fonctions que le combat :
 *
 * - **CE QU'UNE VAGUE DE MISSIONS RAPPORTE**, pas une mission : sur l'île la plus dure il faut
 *   des équipes plus grosses, donc moins d'équipes à la fois. ⚠️ Mesuré sur le compte qui a posé
 *   la question (17 champions niv. 27-40, île 3) : un lieu y demande plus de champions que sur
 *   l'île 2, mais une mission y rapporte bien plus d'XP par champion (prime de danger) et une
 *   mine bien plus d'or — d'où une comparaison en VAGUE, jamais par mission.
 * - **CE QU'ON PERD EN RECULANT** : l'île quittée vers l'arrière est ABANDONNÉE (v1.184) — ses
 *   lieux fixes tombent un à un et leurs miliciens meurent. L'île retrouvée est pacifiée :
 *   aucune attaque, mais ses lieux plafonnent à son niveau maximal.
 * - **LES OBJECTIFS** : combien de champions pour en prendre un, et pour le TENIR. ⚠️ Mesuré :
 *   ils se reprennent dès qu'on les laisse vides (le cimetière de l'île 3 se relève de lui-même),
 *   donc les reprendre en boucle est une source d'XP, pas une conquête — seule la forteresse,
 *   qui demande d'en tenir deux à la fois, fait avancer l'île.
 */
export type StayVerdict = 'stay' | 'even' | 'back';
/** L'écart (en part) sous lequel les deux îles se valent. */
const STAY_TIE = 0.1;

export interface IslandYield {
  island: Island;
  levels: { lo: number; hi: number };
  /** Champions nécessaires pour prendre un lieu à ≥ 70 % (null : hors de portée). */
  need: number | null;
  takePct: number;
  /** XP d'une mission gagnée, par champion engagé (partage d'équipe compris). */
  xpPerChamp: number;
  /** Équipes qu'on peut lancer à la fois avec le vivier engageable (fractionnaire : le reste du
   *  vivier renforce une équipe ou part sur une faille, il n'est pas oisif). */
  teams: number;
  /** XP du vivier pour une vague (toutes ces équipes, une mission chacune). */
  waveXp: number;
  /** Or d'une mine du milieu de la tranche, et d'une vague de mines. */
  mineGold: number;
  waveGold: number;
}

export interface StayOrBackAdvice {
  verdict: StayVerdict;
  here: IslandYield;
  back: IslandYield;
  /** Tenue d'un lieu fixe de l'île actuelle gardé par une garnison pleine de miliciens. */
  holdHerePct: number;
  /** Ce que reculer abandonne : lieux fixes tenus et miliciens qui y sont postés. */
  lose: { points: number; militia: number };
  /** Objectif secondaire : champions pour le prendre, puis pour le tenir à ≥ 50 % (null : hors
   *  de portée), l'XP par champion d'une prise, et la forteresse une fois ouverte (null : hors
   *  de portée). */
  objective: {
    take: number | null;
    hold: number | null;
    xpPerChamp: number;
    fortress: number | null;
    locked: boolean;
  };
  reasons: string[];
}

export interface StayOrBackInput {
  current: number;
  heroLevel: number;
  champions: readonly Adventurer[];
  kit: EscortKit;
  engage: number;
  fort: number;
  /** Lieux fixes tenus sur l'île actuelle, et miliciens qui y sont postés. */
  pointsHeld: number;
  militiaPosted: number;
  /** Objectifs secondaires abattus (`islandConquest`). */
  objectivesDown: number;
  samples?: number;
}

/** Le plus petit nombre de meilleurs champions qui vérifie `ok`, ou null. */
function fewest(pool: number, ok: (k: number) => boolean): number | null {
  for (let k = 1; k <= pool; k++) if (ok(k)) return k;
  return null;
}

/** Les lieux types d'une île : récoltes gardées et camps, deux tirages de gardes chacun. */
const PLACE_TYPES: readonly PoiType[] = ['mine', 'archive', 'well', 'ruins', 'camp', 'lair'];
const PLACE_IDS = ['advice_a', 'advice_b'] as const;
/** Combats rejoués par lieu et par taille d'équipe (× `CAMP_SAMPLE_MULT` dans le pronostic) :
 *  peu, mais sur 36 lieux — le conseil se lit en gros. */
const PLACE_SAMPLES = 4;

/** Le rendement d'une île pour ce vivier (les meilleurs d'abord). */
function islandYield(
  isl: Island,
  heroLevel: number,
  best: readonly Adventurer[],
  pool: number,
  kit: EscortKit,
  samples: number,
): IslandYield {
  const levels = adviceLevels(isl, Math.min(heroLevel, isl.maxLevel));
  // ⚠️ LES LIEUX COMME LA CARTE LES POSE (2026-10-14, signalé par l'utilisateur : « 4 ou 5
  // champions sur un lieu Légendaire ★1, le pourcentage est très faible »). Un lieu affiché à
  // la difficulté D aligne 1 à 3 gardes d'un niveau PLUS HAUT (`enemyLevelFor`), et une récolte
  // sans le héros affronte aussi la ROUTE (`partyWinChance`, le 🎯 % de l'écran). Juger sur des
  // ennemis au niveau D annonçait 4 champions là où il en faut 6 (mesuré sur son vivier ; ses
  // vraies missions sur l'île 3 partaient à 5-10 champions).
  const places = spread(levels.lo, levels.hi).flatMap((d) =>
    PLACE_TYPES.flatMap((type) =>
      PLACE_IDS.map((pre) => {
        const id = `${pre}_${type}`;
        return {
          id,
          type,
          level: enemyLevelFor(id, type, d, isl.minLevel, isl.maxLevel),
          x: 0,
          y: 0,
          distNorm: 0.5,
          spawnedAt: 0,
          expiresAt: 9e15,
        };
      }),
    ),
  );
  const take = (k: number): number => {
    const esc = best.slice(0, k);
    let w = 0;
    for (const p of places)
      w += partyWinChance(p, esc, kit, null, 0, Math.min(samples, PLACE_SAMPLES)) ?? 1;
    return places.length ? w / places.length : 0;
  };
  let takePct = 0;
  const need = fewest(pool, (k) => (takePct = take(k)) >= ADVICE.takeOk);
  const mid = Math.round((levels.lo + levels.hi) / 2);
  const team = best.slice(0, Math.max(1, need ?? pool));
  const xpPerChamp = team.length
    ? (team.reduce((s, a) => s + learn(a.level, mid), 0) / team.length) *
      missionXpSplit(team.length)
    : 0;
  // ⚠️ Des équipes FRACTIONNAIRES : le reste du vivier n'est pas oisif (il renforce une équipe,
  // referme une faille ou creuse un filon). Arrondi en dessous, 17 champions à 6 par lieu en
  // laissaient 5 « inutiles » et l'île dure perdait un tiers de vague sur un artefact.
  const teams = need ? Math.round((pool / need) * 100) / 100 : 0;
  const mineGold = Math.round(mineVeinGold(mid));
  return {
    island: isl,
    levels,
    need,
    takePct,
    xpPerChamp: Math.round(xpPerChamp),
    teams,
    waveXp: Math.round(teams * (need ?? 0) * xpPerChamp),
    mineGold,
    waveGold: Math.round(teams * mineGold),
  };
}

export function stayOrBackAdvice(i: StayOrBackInput): StayOrBackAdvice | null {
  const hereIsl = ISLANDS.find((x) => x.id === i.current);
  const backIsl = ISLANDS.find((x) => x.id === i.current - 1);
  if (!hereIsl || !backIsl) return null;
  const samples = i.samples ?? ADVICE.samples;
  const pw = adventurerPowers([...i.champions], i.kit);
  const best = [...i.champions].sort(
    (a, b) => (pw.get(b.id) ?? 0) - (pw.get(a.id) ?? 0) || a.id.localeCompare(b.id),
  );
  const pool = Math.min(best.length, Math.max(0, Math.floor(i.engage)));
  const allies = (k: number) => partyAllies(best.slice(0, k), i.kit, null);
  const here = islandYield(hereIsl, i.heroLevel, best, pool, i.kit, samples);
  const back = islandYield(backIsl, i.heroLevel, best, pool, i.kit, samples);

  // 🛡️ Ce que tiennent les lieux fixes d'ici, gardés par une garnison pleine de miliciens.
  const units = militiaUnits(
    Array.from({ length: MILITIA.perPoint }, (_, k) => `${MILITIA_PREFIX}${k}`),
    Math.min(i.heroLevel, hereIsl.maxLevel),
  );
  const mid = Math.round((here.levels.lo + here.levels.hi) / 2);
  const holdHerePct = garrisonHoldChance(enemyPlace(mid, 1, hereIsl), units, 1, samples, i.fort);

  // 🪦 Les objectifs : au plafond de l'île, troupe des premiers objectifs.
  const size = ISLAND_CONQUEST.firstSize;
  const objBase = enemyPlace(hereIsl.maxLevel, size, hereIsl);
  const obj: Poi = { ...objBase, control: { ...objBase.control!, kind: 'objective' } };
  const objTake = fewest(
    pool,
    (k) => campWinPct(obj, { faction: hereIsl.faction, size }, allies(k), samples) >= ADVICE.takeOk,
  );
  const objHold = fewest(
    pool,
    (k) => garrisonHoldChance(obj, allies(k), 1, samples, i.fort) >= ADVICE.holdOk,
  );
  // 🏰 La forteresse telle qu'elle serait UNE FOIS OUVERTE (au moins `unlockAfter` objectifs
  // tenus) : verrouillée, elle n'en reste pas moins le but — savoir si on pourra la prendre
  // dit si tenir des objectifs vaut le coup.
  const fort = fortressForce(hereIsl, i.objectivesDown);
  const open = fortressForce(hereIsl, Math.max(i.objectivesDown, ISLAND_CONQUEST.unlockAfter));
  const fortPlace = enemyPlace(open.level, open.size, hereIsl);
  const fortNeed = fewest(
    pool,
    (k) =>
      campWinPct(fortPlace, { faction: hereIsl.faction, size: open.size }, allies(k), samples) >=
      ADVICE.takeOk,
  );

  // Verdict : rester tant qu'on y prend des lieux et qu'une vague y rapporte au moins autant,
  // XP et or pesés à part égale (l'un fait monter le vivier, l'autre les bâtiments).
  const ratio = (a: number, b: number) => (b > 0 ? a / b : a > 0 ? 2 : 1);
  const score = ratio(here.waveXp, back.waveXp) + ratio(here.waveGold, back.waveGold);
  // ⚖️ À moins de 10 % d'écart, c'est une ÉGALITÉ : le modèle ne tranche pas à cette précision
  // (tirages, route, consommables), et l'annoncer comme un verdict mentirait.
  let verdict: StayVerdict = 'even';
  if (here.need === null || score < 2 * (1 - STAY_TIE)) verdict = 'back';
  else if (score > 2 * (1 + STAY_TIE)) verdict = 'stay';
  const reasons: string[] = [];
  const times = (a: number, b: number) =>
    b > 0 ? (Math.round((a / b) * 10) / 10).toLocaleString('fr-FR') : '∞';
  if (here.need === null)
    reasons.push(
      `même tes ${pool} meilleurs champions ne prennent pas un lieu de l'île ${hereIsl.id}`,
    );
  else {
    reasons.push(
      `une vague de missions rapporte ×${times(here.waveXp, back.waveXp)} d'XP et ×${times(here.waveGold, back.waveGold)} d'or ici`,
    );
    // Quand la carte manque de lieux (et non de champions), c'est le rendement PAR LIEU qui
    // compte : mesuré sur le compte qui a posé la question, l'île 3 y est très au-dessus.
    if (back.need !== null)
      reasons.push(
        `par lieu pris : ×${times(here.need * here.xpPerChamp, back.need * back.xpPerChamp)} d'XP et ×${times(here.mineGold, back.mineGold)} d'or`,
      );
    if (back.need !== null && here.need > back.need)
      reasons.push(
        `un lieu y demande ${here.need} champions contre ${back.need} sur l'île ${backIsl.id}`,
      );
  }
  if (holdHerePct < ADVICE.holdOk)
    reasons.push(`tes lieux fixes y tombent souvent (${Math.round(holdHerePct * 100)} % repoussé)`);
  if (i.pointsHeld)
    reasons.push(
      `reculer abandonne ${i.pointsHeld} lieu${i.pointsHeld > 1 ? 'x' : ''} fixe${i.pointsHeld > 1 ? 's' : ''} et ${i.militiaPosted} milicien${i.militiaPosted > 1 ? 's' : ''} (ils tombent peu à peu)`,
    );
  // 🪦 Reprendre un objectif : au plafond de l'île, c'est la mission qui paie le plus par
  // champion. ⚠️ Mesuré sur le compte qui a posé la question : 5 prises en 41 h, ~230 XP par
  // champion chacune, presque la moitié de l'XP gagnée sur l'île — alors qu'elles retombaient
  // aussitôt, laissées vides.
  const objTeam = best.slice(0, objTake ?? 0);
  const objXp = objTeam.length
    ? (objTeam.reduce((s, a) => s + learn(a.level, hereIsl.maxLevel), 0) / objTeam.length) *
      missionXpSplit(objTeam.length)
    : 0;
  if (fortNeed === null) {
    reasons.push(
      `même ouverte, la forteresse reste hors de portée de tes ${pool} champions : inutile de garder tes objectifs pour l'instant`,
    );
    if (objTake !== null && here.xpPerChamp > 0)
      reasons.push(
        `reprendre un objectif rapporte ~${Math.round(objXp)} XP par champion (×${times(objXp, here.xpPerChamp)} une mission ordinaire) : fais-le quand ${objTake} champions sont libres`,
      );
  } else if (fort.locked)
    reasons.push(
      `tiens ${ISLAND_CONQUEST.unlockAfter} objectifs à la fois${objHold !== null ? ` (${objHold} champions postés sur chacun)` : ''} pour ouvrir la forteresse, puis prends-la à ${fortNeed}`,
    );
  return {
    verdict,
    here,
    back,
    holdHerePct,
    lose: { points: i.pointsHeld, militia: i.militiaPosted },
    objective: {
      take: objTake,
      hold: objHold,
      xpPerChamp: Math.round(objXp),
      fortress: fortNeed,
      locked: fort.locked,
    },
    reasons,
  };
}
