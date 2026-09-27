/**
 * 🏰 LES POINTS DE CONTRÔLE — des lieux FIXES qu'on prend à l'ennemi et qu'il vient reprendre
 * (2026-09-27, décisions de l'utilisateur, cf. mémoire `carte-lieux-controle`).
 *
 * - **Fixes** : toujours au même endroit (dérivé de la graine de la carte), dans le disque
 *   révélé dès le départ. ⚠️ Leur RANG est TIRÉ, jamais lié à la distance (la carte n'a plus
 *   de « faible près, fort loin »), et RE-TIRÉ à chaque reprise ennemie.
 * - **Prise** : une équipe de 1 à 3 champions, SANS le héros, livre le combat d'un camp
 *   (`resolveCamp`). Gagnée, l'équipe RESTE : elle devient la garnison, et ses champions
 *   sont indisponibles (missions, défense de la base) tant qu'ils y sont postés.
 * - **Production** : tant qu'elle est tenue, la mine produit de l'or (plus la garnison est
 *   nombreuse, plus elle produit), dans une réserve plafonnée qu'on vient récolter.
 * - **Reprise** : l'ennemi attaque à un instant ALÉATOIRE entre 1 et 3 jours après la prise
 *   (ou la dernière défense), avec une force ALÉATOIRE — il ne gagne pas toujours. Repoussé :
 *   XP pour la garnison, et une nouvelle attaque se prépare. Vainqueur : la garnison part à
 *   l'infirmerie, le lieu redevient ennemi, son rang est re-tiré.
 *
 * ⚠️ PUR : toutes les fonctions rendent un nouvel état, le store écrit.
 */
import { mulberry32, seedOf } from './combat';
import { advAscensionCap, advXpToNext, type Adventurer } from './adventurers';
import { grantAdvGearXp, wornGear, type AdvGear } from './advGear';
import { characterRank, rankStartLevel } from './characterRank';
import { campWinPct } from './camp';
import type { SkirmishUnit } from './skirmish';
import { trialXpBase } from './skirmish';
import { SUPPLY_IDS, type SupplyStock } from './supplies';
import {
  CAMP_FACTIONS,
  CONTROL_MAX_GARRISON,
  CONTROL_KIND_EMO,
  CONTROL_KIND_LABEL,
  EXPE,
  distNormAt,
  harvestGold,
  revealRadius,
  riftLevelFor,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type Poi,
} from './expedition';

export const CONTROL = {
  /** Les points de contrôle de la carte : ⛏️ mine d'or · 🎯 camp d'entraînement · 🌿 jardin
   *  d'herboriste · 🗼 tour de guet. ⚠️ L'ORDRE compte : il fixe la place de chacun autour
   *  de la ville (un quart de tour d'écart), et la mine, première, garde celle d'avant. */
  kinds: ['mine', 'training', 'garden', 'tower', 'forge'] as readonly ControlKind[],
  /** Où ils se posent : cette fraction du rayon révélé SANS Avant-poste — visible dès le
   *  début, quel que soit l'Avant-poste. */
  distFrac: 0.62,
  /** Délai avant une reprise ennemie : entre 1 et 3 jours (décision de l'utilisateur), et
   *  d'autant plus COURT que le joueur est actif (v0.1239, demandé : « plus souvent s'il joue
   *  beaucoup »). La mesure est celle des sièges de la base (`activeDays7`) : 7 jours actifs
   *  sur 7 → autour d'1 jour, aucun → autour de 3. */
  retakeMinMs: 24 * 3600_000,
  retakeMaxMs: 72 * 3600_000,
  /** Écart aléatoire autour du délai visé (± cette part), toujours borné à [min, max]. */
  retakeJitter: 0.25,
  /** Force de la troupe ennemie, en champions de référence : tirée à chaque attaque.
   *  ⚠️ MESURÉE (`controlPoints.test`, niveau 30, 600 combats) : une garnison de 1, 2 ou 3
   *  champions de référence repousse **10 %, 58 % et 85 %** des attaques. Avec [1,5 → 3], 1
   *  champion ne tenait JAMAIS et 3 tenaient 94 % : poster un seul champion n'était pas un
   *  pari, et en poster trois n'avait plus de risque.
   *  ⚠️ RE-MESURÉ quand l'équipement des champions est passé à l'échelle du héros
   *  (`ADV_GEAR.k` 1) : avec [1 · 1,5 · 2,5 · 3,5], 3 champions tenaient 99 %. Le haut passe à
   *  4,5 → **23 %, 62 % et 86 %** (600 combats, niveau 30). */
  sizes: [1, 1.5, 2.5, 4.5] as readonly number[],
  /** ⚔️ La troupe qui TIENT un point à l'ennemi (celle qu'on attaque pour le prendre), en
   *  champions de référence. ⚠️ Jamais plus que ce qu'on peut envoyer : on ne prend un point
   *  qu'à 3 champions au plus, et une troupe de 3,5 (le haut des reprises) le rendait
   *  imprenable — signalé par l'utilisateur sur une tour de guet affichée « légendaire ».
   *  3 champions de référence prennent une troupe de 2,5 ~9 fois sur 10 (mesure des camps). */
  captureSizes: [1, 1.5, 2, 2.5] as readonly number[],
  /** Une garnison : 1 à 3 champions. */
  maxGarrison: CONTROL_MAX_GARRISON,
  /** ⛏️ Une garnison complète produit l'or d'une mission de mine de son rang toutes les
   *  `mineHoursPerHaul` heures. ⚠️ Ces champions ne font pas de missions pendant ce temps :
   *  le débit est calé pour valoir à peu près ce qu'ils auraient ramené en allant et venant. */
  mineHoursPerHaul: 8,
  /** Part de production selon l'effectif posté (index = nombre de champions). */
  garrisonShare: [0, 0.5, 0.8, 1] as readonly number[],
  /** Réserve plafonnée : au-delà de 24 h sans récolte, la mine ne produit plus. */
  storageMs: 24 * 3600_000,
  /** 🎯 Camp d'entraînement : chaque champion posté gagne l'XP d'une épreuve de son rang
   *  (`trialXpBase`) toutes les `trainHoursPerTrial` heures — plafonné au ★5 du rang JUSTE
   *  EN DESSOUS du héros (décision de l'utilisateur, `trainingCapLevel`). */
  trainHoursPerTrial: 3,
  /** 🌿 Jardin d'herboriste : UN jardinier (`CONTROL_SEATS.garden` = 1) cueille un
   *  consommable toutes les `gardenHoursPerItem` heures (2 par jour). */
  gardenHoursPerItem: 12,
  /** ⚒️ Forge de campagne (2026-09-27, demandé) : chaque pièce PORTÉE par un champion posté
   *  gagne l'XP d'une épreuve de son rang toutes les `forgeHoursPerTrial` heures — deux fois
   *  le rythme du camp d'entraînement, parce que la forge n'apprend RIEN au champion : elle
   *  sert quand il bute sur un plafond (ascension, Panthéon, rang du héros) et que ses pièces,
   *  qui n'apprennent qu'à travers lui (`trainWornGear`), sont bloquées aussi. Plafonds de
   *  la pièce inchangés : le ★5 de son rang et le niveau de son porteur. */
  forgeHoursPerTrial: 1.5,
  /** 🗼 Tour de guet : tenue par une garnison complète, elle raccourcit les trajets de 20 %
   *  (moins avec moins de monde), APRÈS l'Avant-poste — elle multiplie le trajet déjà réduit. */
  towerCut: 0.2,
  /** 🎲 SUSPENSE (demandé par l'utilisateur, 2026-09-27) : une garnison ne repousse JAMAIS
   *  plus de cette part des attaques. Au-delà, l'ennemi envoie plus de monde (`retakeBoost`),
   *  juste assez pour y redescendre : on a toujours une vraie chance de perdre le lieu. */
  maxHold: 0.9,
  /** Combats rejoués par taille de troupe pour estimer la tenue (graines de pronostic). */
  holdSamples: 24,
} as const;

/** 🏰 Combien de champions un point garde en garnison (décision de l'utilisateur : le
 *  jardin n'en garde qu'UN — on choisit à l'envoi qui reste, les autres rentrent). */
const CONTROL_SEATS: Record<ControlKind, number> = {
  forge: CONTROL_MAX_GARRISON,
  mine: CONTROL_MAX_GARRISON,
  training: CONTROL_MAX_GARRISON,
  garden: 1,
  tower: CONTROL_MAX_GARRISON,
};
export const seatsOf = (kind: ControlKind): number => CONTROL_SEATS[kind];
/** 🧭 L'angle de chaque point autour de la ville, en quarts de tour. La forge se glisse
 *  ENTRE la mine et le camp d'entraînement : les quatre premiers gardent leur place. */
const CONTROL_QUARTER: Record<ControlKind, number> = {
  mine: 0,
  training: 1,
  garden: 2,
  tower: 3,
  forge: 0.5,
};

export const CONTROL_EMO = CONTROL_KIND_EMO;
export const CONTROL_LABEL = CONTROL_KIND_LABEL;
/** Ce qu'un point rapporte, en quelques mots. */
export const CONTROL_YIELD: Record<ControlKind, string> = {
  mine: 'or 🪙 en continu',
  training: 'XP pour la garnison 🎓',
  garden: 'consommables 🎒',
  tower: 'trajets plus courts 🧭',
  forge: 'XP pour l’équipement porté ⚒️',
};

export const controlIdOf = (kind: ControlKind): string => `ctl_${kind}`;

/** La troupe ennemie d'un point — faction et force, TIRÉES sur une graine qui change à
 *  chaque reprise (sinon on affronterait toujours la même). */
function enemyForce(
  id: string,
  retakes: number,
  sizes: readonly number[] = CONTROL.captureSizes,
): Pick<ControlState, 'faction' | 'size'> {
  const rng = mulberry32((seedOf(`${id}:${retakes}`) ^ 0x4f1bbcdc) >>> 0 || 1);
  return {
    faction: CAMP_FACTIONS[Math.floor(rng() * CAMP_FACTIONS.length)]!,
    size: sizes[Math.floor(rng() * sizes.length)]!,
  };
}

/** Le niveau (donc le rang) d'un point : tiré comme celui d'une faille — entre Bronze et le
 *  rang du joueur, jamais lié à la distance. Re-tiré à chaque reprise. */
function controlLevel(id: string, retakes: number, playerLevel: number): number {
  const rng = mulberry32((seedOf(`${id}:lv:${retakes}`) ^ 0x7a3d91c3) >>> 0 || 1);
  // ⚠️ JAMAIS AU-DESSUS DU JOUEUR : le tirage des failles garde une place « au-dessus », or un
  // point FIXE tiré là restait hors d'atteinte jusqu'à ce qu'on le prenne — c'est-à-dire pour
  // toujours. Marquer cette place « prise » (`pris` = un niveau au-dessus) l'écarte du tirage.
  const pl = Math.max(1, playerLevel);
  return Math.min(pl, riftLevelFor(rng, pl, [pl + 1]));
}

/** Où se pose un point : FIXE, dérivé de la graine de la carte et du type. */
function controlSpot(map: ExpeditionMap, kind: ControlKind): Pick<Poi, 'x' | 'y' | 'distNorm'> {
  // Chaque point a son angle, en quarts de tour à partir de l'angle de la MINE (tiré comme
  // avant : une mine déjà posée ne bouge pas). ⚠️ UNE TABLE, pas l'index dans `kinds` : un
  // cinquième type divisait le tour en cinq, et le nouveau point tombait à 18° d'un point
  // déjà posé (les points existants gardent leur place, elle n'est calculée qu'une fois).
  const rng = mulberry32((map.seed ^ seedOf('ctl:mine:0')) >>> 0 || 1);
  const ang = rng() * Math.PI * 2 + (CONTROL_QUARTER[kind] * Math.PI) / 2;
  const d = EXPE.distMin + CONTROL.distFrac * (revealRadius(1) - EXPE.distMin);
  return {
    x: Math.round(EXPE.town.x + Math.cos(ang) * d),
    y: Math.round(EXPE.town.y + Math.sin(ang) * d),
    distNorm: distNormAt(d),
  };
}

/** Pose les points de contrôle MANQUANTS sur la carte (tenus par l'ennemi). Rend la même
 *  carte quand il ne manque rien : le store n'écrit pas à vide. */
export function ensureControls(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
): ExpeditionMap {
  const add: Poi[] = [];
  for (const kind of CONTROL.kinds) {
    const id = controlIdOf(kind);
    if (map.pois.some((p) => p.id === id)) continue;
    add.push({
      id,
      type: 'control',
      level: controlLevel(`${map.seed}:${id}`, 0, playerLevel),
      // Le trajet suit la DISTANCE (le lieu est fixe), pas le rang tiré.
      travelLevel: Math.max(1, playerLevel),
      ...controlSpot(map, kind),
      spawnedAt: now,
      expiresAt: EXPE.lifespanMs.control,
      control: {
        kind,
        owner: 'enemy',
        garrison: [],
        retakes: 0,
        ...enemyForce(`${map.seed}:${id}`, 0),
      },
    });
  }
  // 🩹 Les points ENNEMIS posés avant la règle (rang au-dessus du joueur, troupe de 3,5) sont
  // re-tirés : sinon ils restaient imprenables. Idempotent — une fois soignés, ils passent.
  const healed = map.pois.map((p) => {
    const c = p.control;
    if (!c || c.owner !== 'enemy') return p;
    const tooHigh = p.level > Math.max(1, playerLevel);
    const tooBig = c.size > Math.max(...CONTROL.captureSizes);
    if (!tooHigh && !tooBig) return p;
    const key = `${map.seed}:${p.id}`;
    return {
      ...p,
      level: tooHigh ? controlLevel(key, c.retakes, playerLevel) : p.level,
      control: tooBig ? { ...c, ...enemyForce(key, c.retakes) } : c,
    };
  });
  const changed = healed.some((p, i) => p !== map.pois[i]);
  if (!add.length && !changed) return map;
  return { ...map, pois: [...healed, ...add] };
}

/** Délai avant la prochaine attaque (graine : le lieu et l'instant) : visé entre 3 jours
 *  (aucun jour actif sur 7) et 1 jour (7 sur 7), ± `retakeJitter`, borné à [1 j, 3 j].
 *  ⚠️ `activeDays7` est REQUIS : l'oublier ferait attaquer au rythme d'un inactif.
 *  ⚠️ L'instant n'est JAMAIS annoncé au joueur (décision de l'utilisateur) : ni sur la fiche
 *  du point, ni par une notification de préavis — seule l'attaque elle-même se dit. */
export function retakeDelayMs(id: string, from: number, activeDays7: number): number {
  const r = mulberry32((seedOf(`${id}:atk:${from}`) ^ 0x2c1b3c6d) >>> 0 || 1)();
  const act = Math.min(7, Math.max(0, activeDays7)) / 7;
  const { retakeMinMs: lo, retakeMaxMs: hi, retakeJitter: j } = CONTROL;
  const aim = hi - act * (hi - lo);
  return Math.min(hi, Math.max(lo, aim * (1 + (r * 2 - 1) * j)));
}

/** Remplace un point dans la carte. */
function withControl(map: ExpeditionMap, id: string, f: (p: Poi) => Poi): ExpeditionMap {
  return { ...map, pois: map.pois.map((p) => (p.id === id && p.control ? f(p) : p)) };
}

/** 🏰 Une équipe part à l'assaut : on ne l'attaque pas deux fois. */
export function markAssault(map: ExpeditionMap, id: string, on: boolean): ExpeditionMap {
  return withControl(map, id, (p) => ({ ...p, control: { ...p.control!, assault: on } }));
}

/** 🏰 Pris ! L'équipe devient la garnison ; la production court ; la reprise se prépare. */
export function captureControl(
  map: ExpeditionMap,
  id: string,
  garrison: readonly string[],
  at: number,
  activeDays7: number,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      owner: 'player',
      garrison: garrison.slice(0, seatsOf(p.control!.kind)),
      since: at,
      collectedAt: at,
      attackAt: at + retakeDelayMs(id, at, activeDays7),
      assault: false,
    },
  }));
}

/** 🏰 Perdu (reprise ennemie ou abandon) : le lieu redevient ennemi, rang et troupe
 *  re-tirés. */
export function loseControl(map: ExpeditionMap, id: string, playerLevel: number): ExpeditionMap {
  return withControl(map, id, (p) => {
    const retakes = p.control!.retakes + 1;
    const next: ControlState = {
      kind: p.control!.kind,
      owner: 'enemy',
      garrison: [],
      retakes,
      ...enemyForce(`${map.seed}:${id}`, retakes),
    };
    return { ...p, level: controlLevel(`${map.seed}:${id}`, retakes, playerLevel), control: next };
  });
}

/** 🏰 Une attaque repoussée : la garnison reste, une nouvelle attaque se prépare. */
export function holdControl(
  map: ExpeditionMap,
  id: string,
  at: number,
  activeDays7: number,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: { ...p.control!, attackAt: at + retakeDelayMs(id, at, activeDays7) },
  }));
}

/** 🛡️ La part des attaques qu'une garnison repousserait, moyennée sur les tailles de troupe
 *  qu'une reprise peut tirer (`CONTROL.sizes` ramenées aux places du point), l'ennemi
 *  renforcé de `boost`. ⚠️ Rejoue le VRAI combat (`campWinPct`, graines de pronostic) :
 *  l'estimation et la bataille ne peuvent pas diverger. La faction n'y joue pas (iso-menace). */
export function garrisonHoldChance(
  p: Poi,
  allies: readonly SkirmishUnit[],
  boost = 1,
  samples: number = CONTROL.holdSamples,
): number {
  if (!allies.length) return 0;
  const seats = p.control ? seatsOf(p.control.kind) : CONTROL.maxGarrison;
  let w = 0;
  for (const size of CONTROL.sizes)
    w += campWinPct(
      p,
      { faction: 'bandits', size: ((size * seats) / CONTROL.maxGarrison) * boost },
      allies,
      samples,
    );
  return w / CONTROL.sizes.length;
}

/** 🎲 De combien l'ennemi grossit sa troupe face à CETTE garnison : 1 tant qu'elle ne tient
 *  pas plus de `CONTROL.maxHold` (le cas normal), sinon juste assez pour y redescendre.
 *  ⚠️ Un champion faible n'est donc jamais pénalisé ; seul un choix « sans risque » l'est. */
export function retakeBoost(p: Poi, allies: readonly SkirmishUnit[]): number {
  if (!allies.length || garrisonHoldChance(p, allies) <= CONTROL.maxHold) return 1;
  let lo = 1;
  let hi = 2;
  while (garrisonHoldChance(p, allies, hi) > CONTROL.maxHold && hi < 256) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (garrisonHoldChance(p, allies, mid) > CONTROL.maxHold) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 🛡️ Ce que l'écran annonce : la tenue réelle, renfort ennemi compris (donc ≤ `maxHold`). */
export function garrisonHold(p: Poi, allies: readonly SkirmishUnit[]): number {
  return garrisonHoldChance(p, allies, retakeBoost(p, allies));
}

/** La troupe qui vient REPRENDRE le point — tirée sur l'instant de l'attaque. */
export function retakeForce(p: Poi, boost: number): Pick<ControlState, 'faction' | 'size'> {
  const f = enemyForce(p.id, (p.control?.attackAt ?? 0) % 1_000_003, CONTROL.sizes);
  // ⚔️ La troupe se mesure à la garnison qu'un point PEUT garder : un jardin (1 place) est
  // attaqué par une troupe à l'échelle d'un seul champion, sinon il tomberait à chaque fois.
  const seats = p.control ? seatsOf(p.control.kind) : CONTROL.maxGarrison;
  return { ...f, size: ((f.size * seats) / CONTROL.maxGarrison) * boost };
}

const shareOf = (n: number) =>
  CONTROL.garrisonShare[Math.min(CONTROL.maxGarrison, Math.max(0, n))] ?? 0;

/** ⛏️ L'or produit par heure pour une garnison de `n` champions. */
export function controlGoldPerHour(
  p: Pick<Poi, 'id' | 'level'>,
  n: number,
  playerLevel: number,
): number {
  const haul = harvestGold({ id: p.id, type: 'mine', level: p.level }, playerLevel);
  return (haul * shareOf(n)) / CONTROL.mineHoursPerHaul;
}

/** 🎯 L'XP par heure d'un champion posté au camp d'entraînement. */
export function trainingXpPerHour(p: Pick<Poi, 'level'>): number {
  return trialXpBase(p.level) / CONTROL.trainHoursPerTrial;
}

/** ⚒️ L'XP par heure de CHAQUE pièce portée par un champion posté à la forge. */
export function forgeXpPerHour(p: Pick<Poi, 'level'>): number {
  return trialXpBase(p.level) / CONTROL.forgeHoursPerTrial;
}

/** Ce qu'un point produit par heure, dans SON unité : or (mine), XP par champion (camp),
 *  consommables (jardin, fractionnaires). La tour ne produit rien. */
function unitsPerHour(p: Poi, n: number, playerLevel: number): number {
  switch (p.control?.kind) {
    case 'mine':
      return controlGoldPerHour(p, n, playerLevel);
    case 'training':
      return n > 0 ? trainingXpPerHour(p) : 0;
    case 'garden':
      return n > 0 ? 1 / CONTROL.gardenHoursPerItem : 0;
    case 'forge':
      return n > 0 ? forgeXpPerHour(p) : 0;
    default:
      return 0;
  }
}

/**
 * La production en réserve à `now`, dans l'unité du point, NON arrondie : ce qui était
 * mis de côté quand l'effectif a changé (`banked`), plus ce que l'effectif ACTUEL a produit
 * depuis — plafonnée à 24 h de production, arrêtée à l'heure de l'attaque.
 */
function stockUnits(p: Poi, now: number, playerLevel: number): number {
  const c = p.control;
  if (!c || c.owner !== 'player' || c.collectedAt === undefined) return 0;
  const until = Math.min(now, c.attackAt ?? now);
  const ms = Math.min(CONTROL.storageMs, Math.max(0, until - c.collectedAt));
  const rate = unitsPerHour(p, c.garrison.length, playerLevel);
  const banked = c.banked ?? 0;
  const cap = Math.max(banked, (rate * CONTROL.storageMs) / 3600_000);
  return Math.min(cap, banked + (rate * ms) / 3600_000);
}

/** 🎯 L'XP accumulée PAR champion à `now` (avant plafond, cf. `trainingRoom`). */
export function trainingStock(p: Poi, now: number): number {
  return p.control?.kind === 'training' ? Math.floor(stockUnits(p, now, 1)) : 0;
}
/**
 * 🎯 Jusqu'où le camp fait monter : le ★5 du rang JUSTE EN DESSOUS de celui du héros
 * (décision de l'utilisateur). Un héros Bronze n'a pas de rang en dessous : le camp
 * n'entraîne personne (0).
 */
export function trainingCapLevel(heroLevel: number): number {
  const r = characterRank(Math.max(1, heroLevel)).rankIndex;
  return r > 0 ? rankStartLevel(r) - 1 : 0;
}
/**
 * 🎯 L'XP qu'un champion peut ENCORE recevoir du camp. ⚠️ On borne l'XP versée, pas
 * seulement le niveau : `grantAdvXp` CONSERVE l'excédent au-delà de ses plafonds, et un
 * surplus mis de côté ici passerait le plafond du camp à la prochaine ascension.
 * Bornée aussi par le Panthéon et l'ascension (le plus bas gagne).
 */
export function trainingRoom(adv: Adventurer, heroLevel: number, pantheonLevel: number): number {
  const target = Math.min(
    trainingCapLevel(heroLevel),
    Math.max(1, pantheonLevel),
    advAscensionCap(adv),
  );
  let need = -Math.max(0, adv.xp);
  for (let l = adv.level; l < target; l++) need += advXpToNext(l);
  return Math.max(0, need);
}

/** ⚒️ L'XP accumulée PAR pièce portée à `now` (avant les plafonds de la pièce). */
export function forgeStock(p: Poi, now: number): number {
  return p.control?.kind === 'forge' ? Math.floor(stockUnits(p, now, 1)) : 0;
}

/**
 * ⚒️ Verse l'XP de la forge aux pièces RÉELLEMENT portées (`wornGear`, la règle du combat)
 * par les champions de la garnison. Chaque pièce garde ses plafonds (★5 de son rang, niveau
 * de son porteur) : `grantAdvGearXp` conserve l'excédent. Rend le MÊME tableau si rien n'a
 * bougé — le store n'écrit alors pas `adv_gear`.
 */
export function forgeGear(
  stock: AdvGear[],
  advs: Adventurer[],
  garrison: readonly string[],
  xp: number,
): AdvGear[] {
  if (xp <= 0 || !garrison.length) return stock;
  const posted = advs.filter((a) => garrison.includes(a.id));
  const worn = wornGear(posted, stock);
  const next = new Map<string, AdvGear>();
  for (const a of posted)
    for (const g of worn.get(a.id) ?? []) {
      const up = grantAdvGearXp(g, xp, a.level);
      if (up !== g) next.set(g.id, up);
    }
  return next.size ? stock.map((g) => next.get(g.id) ?? g) : stock;
}

/** 🌿 Combien de consommables le jardin a cueillis à `now`. */
export function gardenStock(p: Poi, now: number): number {
  return p.control?.kind === 'garden' ? Math.floor(stockUnits(p, now, 1) + 1e-9) : 0;
}

/**
 * 🗼 Le multiplicateur de trajet des TOURS DE GUET tenues : `1 − towerCut × part`. Il
 * MULTIPLIE le trajet déjà réduit par l'Avant-poste (décision de l'utilisateur) — on ne
 * l'ajoute pas à sa réduction, sinon les deux se plafonneraient ensemble.
 */
export function controlTravelMult(map: ExpeditionMap | null | undefined): number {
  let m = 1;
  for (const p of map?.pois ?? [])
    if (p.control?.kind === 'tower' && p.control.owner === 'player')
      m *= 1 - CONTROL.towerCut * shareOf(p.control.garrison.length);
  return m;
}

/** ⛏️ L'or en réserve à `now` (plafonné à `storageMs` de production). 0 si non tenu. */
export function controlStock(p: Poi, now: number, playerLevel: number): number {
  return p.control?.kind === 'mine' ? Math.floor(stockUnits(p, now, playerLevel)) : 0;
}

/**
 * Récolte : ce qu'un point a produit part (or, XP par champion, consommables), et la
 * production repart. ⚠️ Au jardin, la FRACTION d'un consommable en cours reste en réserve
 * (`banked`) : cueillir souvent ne fait rien perdre. `xp` = l'XP accumulée PAR champion,
 * AVANT le plafond du camp (le store la borne, `trainingRoom`).
 */
export function collectControl(
  map: ExpeditionMap,
  id: string,
  now: number,
  playerLevel: number,
): { map: ExpeditionMap; gold: number; xp: number; gearXp: number; supplies: SupplyStock } {
  const p = map.pois.find((x) => x.id === id);
  const none = { map, gold: 0, xp: 0, gearXp: 0, supplies: {} };
  const c = p?.control;
  if (!p || !c || c.owner !== 'player' || c.collectedAt === undefined) return none;
  const units = stockUnits(p, now, playerLevel);
  const whole = Math.floor(units + 1e-9);
  if (whole <= 0) return none;
  const supplies: SupplyStock = {};
  if (c.kind === 'garden') {
    const rng = mulberry32((seedOf(`${id}:${c.collectedAt}`) ^ 0x6a09e667) >>> 0 || 1);
    for (let i = 0; i < whole; i++) {
      const s = SUPPLY_IDS[Math.floor(rng() * SUPPLY_IDS.length)]!;
      supplies[s] = (supplies[s] ?? 0) + 1;
    }
  }
  const until = Math.min(now, c.attackAt ?? now);
  return {
    map: withControl(map, id, (q) => ({
      ...q,
      control: {
        ...q.control!,
        collectedAt: until,
        banked: c.kind === 'garden' ? Math.max(0, units - whole) : 0,
      },
    })),
    gold: c.kind === 'mine' ? whole : 0,
    xp: c.kind === 'training' ? whole : 0,
    gearXp: c.kind === 'forge' ? whole : 0,
    supplies,
  };
}

/** ⛏️ L'effectif va changer : on met de côté ce qui est déjà produit (au débit d'AVANT),
 *  et la production repart de `at` au nouveau débit. Rien n'est crédité ni perdu. */
function bankAt(p: Poi, at: number, playerLevel: number): ControlState {
  return { ...p.control!, banked: stockUnits(p, at, playerLevel), collectedAt: at };
}

/** 🏰 Les places OCCUPÉES d'un point : la garnison et les renforts en route. */
export function controlSeats(c: ControlState | undefined | null): number {
  return c ? c.garrison.length + (c.reinforcing?.length ?? 0) : 0;
}
/** 🏰 Places libres pour un renfort (0 si le point n'est pas à nous). */
export function controlFreeSeats(c: ControlState | undefined | null): number {
  if (!c || c.owner !== 'player') return 0;
  return Math.max(0, seatsOf(c.kind) - controlSeats(c));
}

/** 🏰 Pourquoi un renfort ne peut pas partir. SOURCE UNIQUE : l'écran grise avec cette
 *  raison, le store refuse avec elle. */
export type ReinforceBlock = 'notHeld' | 'empty' | 'full';
export function reinforceBlocker(
  c: ControlState | undefined | null,
  count: number,
): ReinforceBlock | null {
  if (!c || c.owner !== 'player') return 'notHeld';
  if (count <= 0) return 'empty';
  if (count > controlFreeSeats(c)) return 'full';
  return null;
}
export const REINFORCE_BLOCK_LABEL: Record<ReinforceBlock, string> = {
  notHeld: 'ce point n’est pas à toi',
  empty: 'choisis au moins un champion',
  full: 'plus assez de places sur ce point',
};

/** 🏰 Des renforts partent : ils prennent leur place tout de suite et rejoignent la
 *  garnison à `at` (leur arrivée). */
export function reinforceControl(
  map: ExpeditionMap,
  id: string,
  ids: readonly string[],
  at: number,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      reinforcing: [...(p.control!.reinforcing ?? []), ...ids.map((x) => ({ id: x, at }))],
    },
  }));
}

/** 🏰 Les renforts ARRIVÉS rejoignent la garnison. ⚠️ Seulement ceux arrivés AVANT la
 *  prochaine attaque : une attaque due se résout d'abord avec la garnison qui était là, un
 *  renfort encore en route ne combat pas. Rend la même carte si rien n'arrive. */
export function settleReinforcements(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
): ExpeditionMap {
  let out = map;
  for (const p0 of map.pois) {
    const c0 = p0.control;
    if (c0?.owner !== 'player' || !c0.reinforcing?.length) continue;
    const limit = Math.min(now, c0.attackAt ?? now);
    const arrived = c0.reinforcing.filter((r) => r.at <= limit).sort((a, b) => a.at - b.at);
    if (!arrived.length) continue;
    let p = p0;
    for (const r of arrived) {
      const c = bankAt(p, r.at, playerLevel);
      p = {
        ...p,
        control: {
          ...c,
          garrison: [...c.garrison, r.id].slice(0, seatsOf(c.kind)),
          reinforcing: (c.reinforcing ?? []).filter((x) => x.id !== r.id),
        },
      };
    }
    const done = p;
    out = withControl(out, p0.id, () => done);
  }
  return out;
}

/** 🏰 Ramène des champions (garnison OU renforts en route). L'or déjà produit reste en
 *  réserve. ⚠️ Le point RESTE À NOUS, même vidé (décision de l'utilisateur) : sans garnison
 *  il ne produit plus, et c'est la prochaine attaque ennemie, faute de défenseurs, qui le
 *  reprend (`controlTick`) — d'ici là, on peut encore y envoyer des renforts. */
export function releaseFromControl(
  map: ExpeditionMap,
  id: string,
  ids: readonly string[],
  now: number,
  playerLevel: number,
): ExpeditionMap {
  const out = new Set(ids);
  return withControl(map, id, (p) => {
    const c = bankAt(p, now, playerLevel);
    const garrison = c.garrison.filter((x) => !out.has(x));
    const reinforcing = (c.reinforcing ?? []).filter((r) => !out.has(r.id));
    return { ...p, control: { ...c, garrison, reinforcing } };
  });
}

/** Les points tenus dont l'attaque est DUE à `now`, de la plus ancienne à la plus récente. */
export function dueRetakes(map: ExpeditionMap | null, now: number): Poi[] {
  if (!map) return [];
  return map.pois
    .filter(
      (p) =>
        p.control?.owner === 'player' &&
        p.control.attackAt !== undefined &&
        p.control.attackAt <= now,
    )
    .sort((a, b) => a.control!.attackAt! - b.control!.attackAt!);
}

/** Les points tenus (pour les notifications et l'affichage). */
export function heldControls(map: ExpeditionMap | null): Poi[] {
  return map ? map.pois.filter((p) => p.control?.owner === 'player') : [];
}
