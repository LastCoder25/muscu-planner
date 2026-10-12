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
import { partyAllies, type EscortKit } from './caravan';
import { characterRank, rankStartLevel } from './characterRank';
import { CONTROL, controlGoldPerHour, garrisonHoldChance } from './controlPoints';
import type { Poi } from './expedition';
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

/** XP d'une mission pour un champion de niveau `L` sur un lieu de niveau `d` (le rendement
 *  décroissant de `missionXp`, sans la prime de danger : on compare, on ne promet pas). */
function learn(L: number, d: number): number {
  return trialXpBase(d) * Math.min(1, d / Math.max(1, L)) ** 1.5;
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
