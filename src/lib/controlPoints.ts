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
import { formatDuration } from './duration';
import { mulberry32, seedOf } from './combat';
import { advAscensionCap, advBankedLevel, advXpToNext, type Adventurer } from './adventurers';
import { catchUpMult, partyAllies, type EscortKit } from './caravan';
import { grantAdvGearXp, wornGear, type AdvGear } from './advGear';
import { pickTier, placeRuneOdds, type RuneTier } from './skillRunes';
import { characterRank, rankStartLevel } from './characterRank';
import { campWinPct } from './camp';
import { MILITIA, isMilitiaId, militiaUnits } from './militia';
import type { SkirmishUnit } from './skirmish';
import { trialXpBase } from './skirmish';
import { riftClearMana } from './rift';
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
  kinds: ['mine', 'training', 'garden', 'tower', 'scriptorium', 'mana'] as readonly ControlKind[],
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
  /** La garnison de RÉFÉRENCE (3) : celle sur laquelle l'ennemi se cale, et les places du
   *  camp d'entraînement. Les lieux qui produisent pour le joueur en prennent 5 (`seatsOf`). */
  maxGarrison: CONTROL_MAX_GARRISON,
  /** ⛏️ Une garnison complète produit l'or d'une mission de mine de son rang toutes les
   *  `mineHoursPerHaul` heures. ⚠️ Ces champions ne font pas de missions pendant ce temps :
   *  le débit est calé pour valoir à peu près ce qu'ils auraient ramené en allant et venant. */
  mineHoursPerHaul: 8,
  /** Part de production selon l'effectif posté (index = nombre de présents, champions ET
   *  miliciens). ⚠️ 2026-09-28 (demandé : « chaque lieu qui produit ou a un effet doit
   *  s'améliorer selon le nombre en garnison, jusqu'à 5 ») : elle monte jusqu'à 5, à
   *  rendement décroissant — 1 → 3 inchangé (0,5 · 0,8 · 1), puis +0,15 par présent. Chaque
   *  personne ajoutée rapporte, jamais autant que la précédente. */
  garrisonShare: [0, 0.5, 0.8, 1, 1.15, 1.3] as readonly number[],
  /** Réserve plafonnée : au-delà de 24 h sans récolte, la mine ne produit plus. */
  storageMs: 24 * 3600_000,
  /** 🎯 Camp d'entraînement : chaque champion posté gagne l'XP d'une épreuve de son rang
   *  (`trialXpBase`) toutes les `trainHoursPerTrial` heures — plafonné au ★5 du rang JUSTE
   *  EN DESSOUS du héros (décision de l'utilisateur, `trainingCapLevel`). */
  trainHoursPerTrial: 3,
  /** ⚒️ Le camp entraîne AUSSI l'équipement (2026-09-29, demandé : « fusionne le lieu d'XP de
   *  champion et celui d'équipement, vire le second ») : chaque pièce PORTÉE par un champion
   *  posté reçoit sa réserve × ce facteur, EN PLUS de ce qu'elle apprend à travers son porteur
   *  (`trainWornGear`). 2 = le rythme de l'ancienne Forge de campagne (une épreuve toutes les
   *  1,5 h, le double du camp) — la fusion ne ralentit jamais les pièces.
   *  ⚠️ Versé MÊME quand le champion bute sur son plafond (`trainingRoom`, ascension,
   *  Panthéon) : c'était la raison d'être de la forge, ses pièces continuent d'apprendre.
   *  Plafonds de la pièce inchangés : le ★5 de son rang et le niveau de son porteur. */
  gearXpMult: 2,
  /** 🌿 Jardin d'herboriste : un jardinier cueille un consommable toutes les
   *  `gardenHoursPerItem` heures (2 par jour) ; plus de monde, plus vite (`garrisonShare`,
   *  jusqu'à ×2,6 à cinq). */
  gardenHoursPerItem: 12,
  /** 📜 Scriptorium (2026-09-27, demandé : « comme le jardin, mais pour les compétences ») :
   *  recopie une RUNE de compétence. Depuis le 2026-09-28 (demandé : « comme les autres lieux
   *  fixes »), il garde jusqu'à 5 copistes (3 avant le 2026-09-28) et produit selon l'effectif (`garrisonShare`) : une
   *  rune toutes les `runeHoursPerItem` heures À PLEIN — 3 copistes 24 h, 2 → 30 h, 1 → 48 h
   *  (le rythme d'avant, inchangé pour qui n'en poste qu'un). ⚠️ Les runes sont RARES : toutes
   *  sources confondues, un joueur régulier en gagne 0,27 à 0,87 par jour (spec des runes) ;
   *  tenu plein en continu, le Scriptorium en ajoute 1 par jour (choix de l'utilisateur). La
   *  couleur suit les chances des lieux (`placeRuneOdds`, rang du point face au tien). Sa
   *  réserve tient UNE rune (une seule attend d'être ramassée), quel que soit l'effectif. */
  runeHoursPerItem: 24,
  /** ⛲ Source de mana (2026-09-29, demandé) : une garnison de 3 produit par jour la MOITIÉ du
   *  mana d'une faille refermée de ton niveau (`riftClearMana`), 5 personnes ×1,3. ⚠️ DÉRIVÉ du
   *  mana d'une faille, jamais écrit : si les failles bougent, la Source suit.
   *  ⚠️ MESURÉ (`controlMana.test`) : 11 · 18 · 37 · 69 · 111 💠/jour aux niveaux 5 · 12 · 30 ·
   *  60 · 100 à trois, soit ~+14 % de tirages au niveau 30 pour qui ferme deux failles par jour
   *  (et prend son tirage offert). Un COMPLÉMENT, comme le Scriptorium : les failles restent la
   *  source principale du mana, et le seul puits du mana est le gacha. */
  manaSourceShare: 0.5,
  /** 🗼 Tour de guet : tenue par une garnison complète, elle raccourcit les trajets de 20 %
   *  (moins avec moins de monde), APRÈS l'Avant-poste — elle multiplie le trajet déjà réduit. */
  towerCut: 0.2,
  /** 🗼 Tour de guet (2026-09-29, demandé : « remettre de la détection, qui booste celle de
   *  la base selon le nombre en garnison ») : tenue par 3 champions, elle allonge le PRÉAVIS
   *  de la base de 50 % (×0,5/0,8/1/1,15/1,3 de cette part pour 1 à 5, `garrisonShare`),
   *  donc son rayon de détection. Cumul ADDITIF entre tours, toujours borné par le plafond
   *  de part d'intervalle (`RAID.scoutLeadIntervalCap`) : jamais « toujours prévenu ». */
  towerDetect: 0.5,
  /** 🎲 SUSPENSE (demandé par l'utilisateur, 2026-09-27) : une garnison ne repousse JAMAIS
   *  plus de cette part des attaques. Au-delà, l'ennemi envoie plus de monde (`retakeBoost`),
   *  juste assez pour y redescendre : on a toujours une vraie chance de perdre le lieu. */
  maxHold: 0.9,
  /** Combats rejoués par taille de troupe pour estimer la tenue (graines de pronostic). */
  holdSamples: 24,
  /** ⚔️ BATAILLE IMMINENTE (demandé par l'utilisateur, 2026-09-28) : dans cette fenêtre avant
   *  la reprise, le point porte un avertissement sur la carte et sur sa fiche. ⚠️ Assouplit la
   *  règle « sans préavis » de la v0.1239 SANS l'annuler : on dit « bientôt », jamais l'heure,
   *  et seulement au dernier moment — de quoi envoyer un renfort proche, pas planifier. */
  imminentMs: 2 * 3_600_000,
} as const;

/** 🏰 Combien de champions un point garde en garnison (décision de l'utilisateur : le
 *  jardin n'en garde qu'UN — on choisit à l'envoi qui reste, les autres rentrent). */
// ⚠️ 2026-09-28 (demandé : « les autres peuvent avoir jusqu'à 5 en garnison, champion et/ou
// miliciens ») : les lieux qui PRODUISENT pour le joueur (or, consommables, runes) ou ont un
// EFFET (la tour) prennent 5 champions — la garnison entière (`MILITIA.perPoint`). Le camp,
// qui produit de l'XP PAR champion, garde 3 champions : chacun y apprend pour lui, sa place
// ne profite pas aux autres.
const PRODUCER_SEATS = MILITIA.perPoint;
const CONTROL_SEATS: Record<ControlKind, number> = {
  scriptorium: PRODUCER_SEATS,
  mana: PRODUCER_SEATS,
  mine: PRODUCER_SEATS,
  training: CONTROL_MAX_GARRISON,
  garden: PRODUCER_SEATS,
  tower: PRODUCER_SEATS,
};
export const seatsOf = (kind: ControlKind): number => CONTROL_SEATS[kind];
/** 🧭 L'angle de chaque point autour de la ville, en quarts de tour. Les quatre premiers
 *  gardent leur place ; la demi-place entre la mine et le camp est libre depuis le retrait de
 *  la Forge de campagne (2026-09-29). */
const CONTROL_QUARTER: Record<ControlKind, number> = {
  mine: 0,
  training: 1,
  garden: 2,
  tower: 3,
  scriptorium: 2.5,
  // ⛲ La place laissée libre par la Forge de campagne (2026-09-29), entre la mine et le camp.
  mana: 0.5,
};

export const CONTROL_EMO = CONTROL_KIND_EMO;
export const CONTROL_LABEL = CONTROL_KIND_LABEL;
/** Ce qu'un point rapporte, en quelques mots. */
export const CONTROL_YIELD: Record<ControlKind, string> = {
  mine: 'or 🪙 en continu',
  training: 'XP pour la garnison 🎓 et son équipement ⚒️',
  garden: 'consommables 🎒',
  tower: 'trajets plus courts 🧭',
  scriptorium: 'runes de compétence',
  mana: 'pierres de mana 💠 en continu',
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
  // 🗑️ Un point d'un type RETIRÉ (la Forge de campagne, fondue dans le camp le 2026-09-29)
  // quitte la carte. ⚠️ Sa garnison est libérée d'elle-même : la disponibilité d'un champion
  // se DÉDUIT de la carte. Vérifié en base avant le retrait : aucun joueur n'en tenait une.
  const kept = healed.filter((p) => !p.control || CONTROL.kinds.includes(p.control.kind));
  const changed = kept.length !== map.pois.length || kept.some((p, i) => p !== map.pois[i]);
  if (!add.length && !changed) return map;
  return { ...map, pois: [...kept, ...add] };
}

/** Délai avant la prochaine attaque (graine : le lieu et l'instant) : visé entre 3 jours
 *  (aucun jour actif sur 7) et 1 jour (7 sur 7), ± `retakeJitter`, borné à [1 j, 3 j].
 *  ⚠️ `activeDays7` est REQUIS : l'oublier ferait attaquer au rythme d'un inactif.
 *  ⚠️ L'instant n'est JAMAIS annoncé au joueur (décision de l'utilisateur) : ni sur la fiche
 *  du point, ni par une notification de préavis — seule l'attaque elle-même se dit. Seule
 *  exception (2026-09-28) : `attackImminent`, qui prévient dans les `CONTROL.imminentMs`
 *  dernières heures, sans jamais donner l'heure. */
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

/**
 * 🎲 Le niveau (donc le rang) des ASSAILLANTS de l'attaque qui vient sur un point tenu —
 * tiré à CHAQUE attaque, entre Bronze et le rang du joueur (décision de l'utilisateur,
 * 2026-09-28 : « quand on se fait déloger, le lieu change de rang selon les assaillants »).
 * Graine : la carte, le point et l'instant de l'attaque — une attaque repoussée n'annonce
 * pas le rang de la suivante. ⚠️ Jamais affiché avant la bataille : seule l'attaque le dit.
 */
export function attackerLevel(seed: number, p: Poi, playerLevel: number): number {
  const c = p.control;
  return controlLevel(`${seed}:${p.id}@${c?.attackAt ?? 0}`, (c?.retakes ?? 0) + 1, playerLevel);
}

/** 🔙 Le point tombe à `at` pendant que des renforts marchent vers lui : ils ne combattent
 *  pas (`settleReinforcements` s'arrête à l'heure de l'attaque) et font DEMI-TOUR à cet
 *  instant, pour un retour aussi long que le chemin déjà parcouru. ⚠️ Un renfort parti
 *  APRÈS `at` (le tick n'avait pas encore résolu l'attaque) rentre aussitôt, jamais avant
 *  son départ ; un renfort sans heure de départ connue (envoyé avant qu'on la retienne)
 *  est rentré tout de suite. Ceux déjà arrivés à `at` ont combattu : pas de demi-tour. */
export function turnBackReinforcements(
  c: ControlState,
  at: number,
): { id: string; from: number; at: number }[] {
  return (c.reinforcing ?? [])
    .filter((r) => r.at > at)
    .map((r) => {
      const from = r.from ?? at;
      const turn = Math.max(at, from);
      return { id: r.id, from: turn, at: turn + (turn - from) };
    });
}

/** 🔙 La ligne du rapport de chute, vide s'il n'y avait personne en route. */
export function turnBackLabel(n: number): string {
  if (n <= 0) return '';
  return n > 1
    ? ` 🔙 ${n} renforts en route font demi-tour.`
    : ' 🔙 1 renfort en route fait demi-tour.';
}

/** 🔙 La ligne du rapport de chute pour les SORTIES sur le chemin du retour, qui rentrent
 *  à la base au lieu du point perdu. Vide s'il n'y en avait pas. */
export function sortieHomeLabel(n: number): string {
  if (n <= 0) return '';
  return n > 1
    ? ` 🏠 ${n} champions en sortie rentrent à la base.`
    : ' 🏠 1 champion en sortie rentre à la base.';
}

/** 🏰 Perdu (reprise ennemie ou abandon) : le lieu redevient ennemi, troupe re-tirée. Repris
 *  par une attaque, il prend le rang et la bannière des assaillants (`won`) ; abandonné, un
 *  rang re-tiré. */
export function loseControl(
  map: ExpeditionMap,
  id: string,
  playerLevel: number,
  /** L'heure de la chute : les renforts encore en route font demi-tour à cet instant. */
  at: number,
  won?: { level: number; faction: ControlState['faction'] },
): ExpeditionMap {
  return withControl(map, id, (p) => {
    const retakes = p.control!.retakes + 1;
    const force = enemyForce(`${map.seed}:${id}`, retakes);
    const returning = [...(p.control!.returning ?? []), ...turnBackReinforcements(p.control!, at)];
    const next: ControlState = {
      kind: p.control!.kind,
      owner: 'enemy',
      garrison: [],
      retakes,
      ...force,
      ...(won ? { faction: won.faction } : {}),
      // 🏠 Ceux déjà sur le chemin du retour ne sont plus là : le lieu tombe sans eux, ils
      // finissent leur trajet (sinon un milicien en route vers la base disparaîtrait).
      // 🔙 Les renforts encore en route les rejoignent : ils font demi-tour.
      ...(returning.length ? { returning } : {}),
    };
    const level = won?.level ?? controlLevel(`${map.seed}:${id}`, retakes, playerLevel);
    return { ...p, level, control: next };
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
  // ⚠️ Calée sur une garnison de RÉFÉRENCE (3 au plus) : poster 4 ou 5 personnes renforce la
  // garnison, l'ennemi ne grossit pas pour autant (au-delà de 90 % de tenue, `retakeBoost` s'en
  // charge).
  const seats = p.control
    ? Math.min(seatsOf(p.control.kind), CONTROL.maxGarrison)
    : CONTROL.maxGarrison;
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

/** ⏰ L'heure de l'attaque, telle que le joueur la CONNAÎT : seulement dans les dernières
 *  heures (`attackImminent`). Avant, elle reste secrète (v0.1239) — on compte alors tous les
 *  renforts en route comme arrivés, sinon un renfort « en retard » trahirait l'heure. */
export function knownAttackAt(p: Poi, now: number): number | null {
  return attackImminent(p, now) ? (p.control!.attackAt ?? null) : null;
}

/** 🛡️ Qui DÉFENDRA le point : la garnison, puis les renforts (en route, ou `extra` qu'on
 *  s'apprête à envoyer) arrivés AU PLUS TARD à l'attaque — la règle de
 *  `settleReinforcements`, qui s'arrête à `attackAt`. `late` = ceux qui arriveront après. */
export function defendersAtAttack(
  c: ControlState,
  attackAt: number | null,
  extra: readonly { id: string; at: number }[] = [],
): { present: string[]; late: string[] } {
  const present = [...c.garrison];
  const late: string[] = [];
  for (const r of [...(c.reinforcing ?? []), ...extra]) {
    if (attackAt === null || r.at <= attackAt) present.push(r.id);
    else late.push(r.id);
  }
  return { present, late };
}

/** 🎯 La part des attaques que ces défenseurs repousseront — champions (avec compagnons et
 *  pièces) ET miliciens, contre l'ennemi le plus fort possible (niveau du héros : un
 *  PLANCHER, jamais une promesse), renfort ennemi compris (`garrisonHold`). */
export function controlDefenseHold(
  p: Poi,
  ids: readonly string[],
  advs: readonly Adventurer[],
  kit: EscortKit,
  playerLevel: number,
): number {
  const set = new Set(ids);
  const champs = advs.filter((a) => set.has(a.id));
  const allies = [...partyAllies(champs, kit, null), ...militiaUnits([...ids], playerLevel)];
  return garrisonHold({ ...p, level: Math.max(1, playerLevel) }, allies);
}

/** La troupe qui vient REPRENDRE le point — tirée sur l'instant de l'attaque. */
export function retakeForce(p: Poi, boost: number): Pick<ControlState, 'faction' | 'size'> {
  const f = enemyForce(p.id, (p.control?.attackAt ?? 0) % 1_000_003, CONTROL.sizes);
  // ⚔️ La troupe se mesure à la garnison qu'un point PEUT garder : un jardin (1 place) est
  // attaqué par une troupe à l'échelle d'un seul champion, sinon il tomberait à chaque fois.
  // ⚠️ Calée sur une garnison de RÉFÉRENCE (3 au plus) : poster 4 ou 5 personnes renforce la
  // garnison, l'ennemi ne grossit pas pour autant (au-delà de 90 % de tenue, `retakeBoost` s'en
  // charge).
  const seats = p.control
    ? Math.min(seatsOf(p.control.kind), CONTROL.maxGarrison)
    : CONTROL.maxGarrison;
  return { ...f, size: ((f.size * seats) / CONTROL.maxGarrison) * boost };
}

const shareOf = (n: number) =>
  CONTROL.garrisonShare[Math.min(CONTROL.garrisonShare.length - 1, Math.max(0, n))] ?? 0;

/** ⛏️ L'or produit par heure pour une garnison de `n` champions. */
export function controlGoldPerHour(p: Pick<Poi, 'id'>, n: number, playerLevel: number): number {
  const haul = harvestGold(
    { id: p.id, type: 'mine', level: Math.max(1, playerLevel) },
    playerLevel,
  );
  return (haul * shareOf(n)) / CONTROL.mineHoursPerHaul;
}

/** ⛲ Les pierres de mana produites par heure pour une garnison de `n` (champions ET
 *  miliciens), au niveau du joueur. Une garnison de 3 : la moitié d'une faille par jour. */
export function controlManaPerHour(n: number, playerLevel: number): number {
  const perDay = riftClearMana({ level: Math.max(1, playerLevel) }) * CONTROL.manaSourceShare;
  return (perDay * shareOf(n)) / 24;
}

/** 🎯 L'XP par heure d'un champion posté au camp d'entraînement (avant son rattrapage). */
export function trainingXpPerHour(playerLevel: number): number {
  return trialXpBase(Math.max(1, playerLevel)) / CONTROL.trainHoursPerTrial;
}

/**
 * 🎯 L'XP que le camp VERSE à un champion : sa réserve × la prime de RATTRAPAGE des missions
 * (`catchUpMult`, sur le niveau de sa réserve comme `missionXpFor`).
 * ⚠️ 2026-09-28, MESURÉ (demandé : « les producteurs d'XP doivent être rentables ») : sans
 * elle le camp ne valait rien pour ceux qu'il vise — il plafonne au ★5 du rang sous le héros,
 * donc il n'accueille que des champions EN RETARD, et une mission leur rapporte jusqu'à ×3 par
 * le rattrapage. Joueur 30, champion 20 : 18 XP/h au camp contre 31 à 105 en mission ; avec
 * la prime, 36 XP/h, 24 h sur 24 sans aller-retour. Un champion à jour n'y gagne rien de plus.
 */
export function campXpFor(adv: Adventurer, xp: number, pantheonLevel: number): number {
  return Math.round(xp * catchUpMult(advBankedLevel(adv, pantheonLevel), pantheonLevel));
}

/** ⚒️ L'XP par heure de CHAQUE pièce portée par un champion posté au camp. */
export function campGearXpPerHour(playerLevel: number): number {
  return trainingXpPerHour(playerLevel) * CONTROL.gearXpMult;
}

/** Ce qu'un point produit par heure, dans SON unité : or (mine), XP par champion (camp),
 *  consommables (jardin, fractionnaires). La tour ne produit rien. */
function unitsPerHour(p: Poi, n: number, playerLevel: number): number {
  switch (p.control?.kind) {
    case 'mine':
      return controlGoldPerHour(p, n, playerLevel);
    case 'training':
      return n > 0 ? trainingXpPerHour(playerLevel) : 0;
    case 'garden':
      // Un jardinier : un consommable toutes les 12 h, comme avant ; plus de monde, plus vite.
      return shareOf(n) / shareOf(1) / CONTROL.gardenHoursPerItem;
    case 'scriptorium':
      return shareOf(n) / CONTROL.runeHoursPerItem;
    case 'mana':
      return controlManaPerHour(n, playerLevel);
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
  const storage = storageMsOf(c.kind);
  const ms = Math.min(storage, Math.max(0, until - c.collectedAt));
  const rate = unitsPerHour(p, c.garrison.length, playerLevel);
  const banked = c.banked ?? 0;
  const cap =
    c.kind === 'scriptorium'
      ? Math.max(banked, RUNE_RESERVE)
      : Math.max(banked, (rate * storage) / 3600_000);
  return Math.min(cap, banked + (rate * ms) / 3600_000);
}

/** 🎯 L'XP la plus haute qu'un champion attend au camp (avant plafond, cf. `trainingRoom`),
 *  arrondie — chacun a SA réserve (`trainingStockBy`). */
export function trainingStock(p: Poi, now: number, playerLevel: number): number {
  return maxStock(trainingStockBy(p, now, playerLevel));
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
  // Plafond d'ascension atteint et plus bas que les autres : il faut aussi REMPLIR son ★5
  // (l'XP du niveau plafond) pour être prêt, cf. `advAscensionReady`.
  const asc = advAscensionCap(adv);
  if (target === asc && asc < Math.min(trainingCapLevel(heroLevel), Math.max(1, pantheonLevel)))
    need += advXpToNext(asc);
  return Math.max(0, need);
}

/** Le lieu où CHAQUE champion a sa propre réserve d'XP (sa jauge) : le camp. */
export const isPerChampKind = (k: ControlKind | undefined): k is 'training' => k === 'training';

/**
 * 🎯 L'XP accumulée par CHAQUE champion au camp à `now`, non arrondie (ses pièces portées
 * en reçoivent `CONTROL.gearXpMult` fois autant à la récolte). Chacun a sa propre réserve (demandé : les
 * champions n'arrivent pas en même temps — une valeur commune donnerait à un renfort arrivé
 * tard l'XP de ceux qui étaient là avant lui) : elle part de ce qu'il avait quand l'effectif
 * a changé (`perXp`) et ne court que tant qu'il est EN GARNISON — un renfort en route
 * n'apprend rien, un champion ramené garde ce qu'il a gagné jusqu'à la récolte. Plafonnée à
 * 24 h de production, arrêtée à l'heure de l'attaque. Les miliciens n'apprennent rien.
 */
export function champStockBy(p: Poi, now: number, playerLevel: number): Record<string, number> {
  const c = p.control;
  if (!c || !isPerChampKind(c.kind) || c.owner !== 'player' || c.collectedAt === undefined)
    return {};
  const until = Math.min(now, c.attackAt ?? now);
  const ms = Math.min(CONTROL.storageMs, Math.max(0, until - c.collectedAt));
  const rate = trainingXpPerHour(playerLevel);
  const cap = (rate * CONTROL.storageMs) / 3600_000;
  // Lieu d'avant `perXp` : la réserve commune valait pour chaque champion posté.
  const legacy = c.perXp === undefined ? (c.banked ?? 0) : 0;
  const out: Record<string, number> = { ...c.perXp };
  for (const id of c.garrison) {
    if (isMilitiaId(id)) continue;
    const b = out[id] ?? legacy;
    out[id] = Math.min(Math.max(b, cap), b + (rate * ms) / 3600_000);
  }
  return out;
}
/** 🎯 La réserve par champion au camp d'entraînement (vide ailleurs). */
export const trainingStockBy = (
  p: Poi,
  now: number,
  playerLevel: number,
): Record<string, number> =>
  p.control?.kind === 'training' ? champStockBy(p, now, playerLevel) : {};

/** La réserve la plus haute qu'un champion attend au camp, arrondie. */
function maxStock(by: Record<string, number>): number {
  const v = Object.values(by);
  return v.length ? Math.floor(Math.max(...v) + 1e-9) : 0;
}
/** Ce qu'une réserve représente en HEURES passées sur place (≤ 24 h) : la jauge d'un
 *  champion se remplit à ce rythme. */
export function champHoursOf(p: Poi, xp: number, playerLevel: number): number {
  const rate = isPerChampKind(p.control?.kind) ? trainingXpPerHour(playerLevel) : 0;
  return rate > 0 ? xp / rate : 0;
}

/**
 * ⚒️ Verse l'XP d'équipement du camp aux pièces RÉELLEMENT portées (`wornGear`, la règle du combat),
 * CHAQUE champion la sienne (`xpBy`, id → XP par pièce). Chaque pièce garde ses plafonds
 * (★5 de son rang, niveau de son porteur) : `grantAdvGearXp` conserve l'excédent. Rend le
 * MÊME tableau si rien n'a bougé — le store n'écrit alors pas `adv_gear`.
 */
export function campGear(
  stock: AdvGear[],
  advs: Adventurer[],
  xpBy: Readonly<Record<string, number>>,
): AdvGear[] {
  const posted = advs.filter((a) => (xpBy[a.id] ?? 0) > 0);
  if (!posted.length) return stock;
  const worn = wornGear(posted, stock);
  const next = new Map<string, AdvGear>();
  for (const a of posted)
    for (const g of worn.get(a.id) ?? []) {
      const up = grantAdvGearXp(g, xpBy[a.id]!, a.level);
      if (up !== g) next.set(g.id, up);
    }
  return next.size ? stock.map((g) => next.get(g.id) ?? g) : stock;
}

/** Combien de temps de production un point garde en réserve. 24 h partout, sauf au
 *  Scriptorium : le temps d'une rune avec UN SEUL copiste (48 h) — une réserve plus courte
 *  l'empêchait de jamais finir. Sa réserve est en plus plafonnée à UNE rune (`RUNE_RESERVE`,
 *  dans `stockUnits`) : trois copistes n'en empilent pas deux. */
function storageMsOf(kind: ControlKind): number {
  return kind === 'scriptorium'
    ? (CONTROL.runeHoursPerItem / shareOf(1)) * 3600_000
    : CONTROL.storageMs;
}
/** 📜 Une seule rune attend d'être ramassée, quel que soit l'effectif. */
const RUNE_RESERVE = 1;
/** 📜 Le temps d'une rune pour `n` copistes (48 h à 1, 30 h à 2, 24 h à 3, ~18 h 28 à 5) —
 *  `null` sans copiste, qui ne produit rien. Même part que la production (`unitsPerHour`). */
export function runeHoursFor(n: number): number | null {
  const s = shareOf(n);
  return s > 0 ? CONTROL.runeHoursPerItem / s : null;
}
/** 🌿 Le temps d'un consommable pour `n` jardiniers (12 h à 1, plus vite à plusieurs) —
 *  `null` sans jardinier. Même part que la production (`unitsPerHour`) : l'affichage disait
 *  « 1 toutes les 12 h » quel que soit l'effectif. */
export function gardenHoursFor(n: number): number | null {
  const s = shareOf(n);
  return s > 0 ? (CONTROL.gardenHoursPerItem * shareOf(1)) / s : null;
}

/** 📜 Combien de runes le Scriptorium a recopiées à `now` (0 ou 1). */
export function runeStock(p: Poi, now: number): number {
  return p.control?.kind === 'scriptorium' ? Math.floor(stockUnits(p, now, 1) + 1e-9) : 0;
}
/** 📜 Où en est la rune en cours de copie, de 0 à 1. */
export function runeProgress(p: Poi, now: number): number {
  if (p.control?.kind !== 'scriptorium') return 0;
  const u = stockUnits(p, now, 1);
  return u >= 1 ? 1 : u;
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

/**
 * 🗼 Le bonus de DÉTECTION des Tours de guet tenues : `towerDetect × part` de la garnison,
 * additionné entre tours. Il allonge le préavis de la base (`baseLeadMs`), donc le moment où
 * un siège est repéré ET le rayon où les armées deviennent visibles sur la carte.
 */
export function controlDetectBoost(map: ExpeditionMap | null | undefined): number {
  let b = 0;
  for (const p of map?.pois ?? [])
    if (p.control?.kind === 'tower' && p.control.owner === 'player')
      b += CONTROL.towerDetect * shareOf(p.control.garrison.length);
  return b;
}

/** ⛲ Les pierres de mana en réserve à `now` (24 h de production au plus). 0 si non tenu. */
export function controlManaStock(p: Poi, now: number, playerLevel: number): number {
  return p.control?.kind === 'mana' ? Math.floor(stockUnits(p, now, playerLevel) + 1e-9) : 0;
}

/** ⛏️ L'or en réserve à `now` (plafonné à `storageMs` de production). 0 si non tenu. */
export function controlStock(p: Poi, now: number, playerLevel: number): number {
  return p.control?.kind === 'mine' ? Math.floor(stockUnits(p, now, playerLevel)) : 0;
}

/**
 * Récolte : ce qu'un point a produit part (or, XP par champion, consommables), et la
 * production repart. ⚠️ Au jardin, la FRACTION d'un consommable en cours reste en réserve
 * (`banked`) : cueillir souvent ne fait rien perdre. `xpBy` = l'XP du camp PAR champion (id →
 * XP), AVANT son plafond (le store la borne, `trainingRoom`) ; `gearXp` = celle de leurs
 * pièces portées (`CONTROL.gearXpMult` fois autant, jamais bornée par le champion).
 */
export function collectControl(
  map: ExpeditionMap,
  id: string,
  now: number,
  playerLevel: number,
): {
  map: ExpeditionMap;
  gold: number;
  mana: number;
  xpBy: Record<string, number>;
  gearXp: Record<string, number>;
  supplies: SupplyStock;
  runes: RuneTier[];
} {
  const p = map.pois.find((x) => x.id === id);
  const none = { map, gold: 0, mana: 0, xpBy: {}, gearXp: {}, supplies: {}, runes: [] };
  const c = p?.control;
  if (!p || !c || c.owner !== 'player' || c.collectedAt === undefined) return none;
  // 🎯⚒️ Le camp : chaque champion récolte SA réserve (et ses pièces le double), et garde la fraction
  // entamée (sauf un champion ramené depuis : ce qui lui reste ne compte plus).
  if (isPerChampKind(c.kind)) {
    const by = champStockBy(p, now, playerLevel);
    const got: Record<string, number> = {};
    const perXp: Record<string, number> = {};
    for (const [aid, v] of Object.entries(by)) {
      const w = Math.floor(v + 1e-9);
      if (w > 0) got[aid] = w;
      if (c.garrison.includes(aid) && v - w > 1e-9) perXp[aid] = v - w;
    }
    if (!Object.keys(got).length) return none;
    const until = Math.min(now, c.attackAt ?? now);
    return {
      ...none,
      map: withControl(map, id, (q) => ({
        ...q,
        control: { ...q.control!, collectedAt: until, banked: 0, perXp },
      })),
      xpBy: got,
      gearXp: Object.fromEntries(
        Object.entries(got).map(([aid, v]) => [aid, Math.round(v * CONTROL.gearXpMult)]),
      ),
    };
  }
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
  // 📜 La couleur de chaque rune recopiée : les chances d'une rune tombée sur un lieu, selon le
  // rang du point face au tien (`placeRuneOdds`). Graine : la CARTE, le point et la dernière
  // récolte — sans la carte, tous les joueurs recevaient la même suite de couleurs.
  const runes: RuneTier[] = [];
  if (c.kind === 'scriptorium') {
    const rng = mulberry32(
      (seedOf(`${map.seed}:${id}:rune:${c.collectedAt}`) ^ 0x1b873593) >>> 0 || 1,
    );
    const odds = placeRuneOdds({
      place: 'control',
      placeRankIndex: characterRank(Math.max(1, playerLevel)).rankIndex,
      playerRankIndex: characterRank(Math.max(1, playerLevel)).rankIndex,
    });
    for (let i = 0; i < whole; i++) runes.push(pickTier(rng, odds));
  }
  const until = Math.min(now, c.attackAt ?? now);
  return {
    map: withControl(map, id, (q) => ({
      ...q,
      control: {
        ...q.control!,
        collectedAt: until,
        // 🌿⛲ La fraction entamée (un consommable, une pierre de mana) reste acquise.
        banked: c.kind === 'garden' || c.kind === 'mana' ? Math.max(0, units - whole) : 0,
      },
    })),
    gold: c.kind === 'mine' ? whole : 0,
    mana: c.kind === 'mana' ? whole : 0,
    xpBy: {},
    gearXp: {},
    supplies,
    runes,
  };
}

/**
 * 📊 OÙ EN EST LA RÉCOLTE, en un mot et une jauge (2026-09-28, demandé : « l'avancement de la
 * récolte en bout de ligne — rune le %, or le montant »). `text` = ce qui attend, dans l'unité
 * du point ; `pct` (0..1) = la jauge : la réserve de 24 h pour ce qui s'accumule (or, XP), la
 * PROCHAINE unité pour ce qui tombe à l'unité (consommable, rune). La tour ne stocke rien :
 * elle dit sa réduction de trajet, sans jauge. ⚠️ Lit `stockUnits`, la même réserve que la
 * récolte — l'étiquette ne peut pas annoncer autre chose que ce que « Récolter » verse.
 */
export interface ControlProgress {
  text: string;
  pct: number | null;
}
/** ⏳ Le temps pour produire `units` au débit `rate` (unités/h) ; `null` sans production. */
function leftFor(units: number, rate: number): string | null {
  return rate > 0 ? formatDuration((units / rate) * 3600_000) : null;
}
export function controlProgress(p: Poi, now: number, playerLevel: number): ControlProgress | null {
  const c = p.control;
  if (!c || c.owner !== 'player') return null;
  const fmt = (n: number) => Math.floor(n + 1e-9).toLocaleString('fr-FR');
  if (c.kind === 'tower') {
    const cut = CONTROL.towerCut * shareOf(c.garrison.length);
    const det = CONTROL.towerDetect * shareOf(c.garrison.length);
    return {
      text: `🧭 −${Math.round(cut * 100)} % trajets · 👁️ +${Math.round(det * 100)} % détection`,
      pct: null,
    };
  }
  // 🎯 Chacun sa réserve : on montre la plus avancée (celle qu'on voit monter en premier).
  if (isPerChampKind(c.kind)) {
    const top = Math.max(0, ...Object.values(champStockBy(p, now, playerLevel)));
    const full = (trainingXpPerHour(playerLevel) * CONTROL.storageMs) / 3600_000;
    return { text: `🎓 +${fmt(top)} XP`, pct: full > 0 ? Math.min(1, top / full) : 0 };
  }
  const units = stockUnits(p, now, playerLevel);
  const rate = unitsPerHour(p, c.garrison.length, playerLevel);
  const cap = Math.max(c.banked ?? 0, (rate * storageMsOf(c.kind)) / 3600_000);
  const fill = cap > 0 ? Math.min(1, units / cap) : 0;
  switch (c.kind) {
    case 'mine':
      return { text: `🪙 ${fmt(units)}`, pct: fill };
    case 'mana':
      return { text: `💠 ${fmt(units)}`, pct: fill };
    case 'garden': {
      const whole = Math.floor(units + 1e-9);
      const next = Math.max(0, units - whole);
      // ⏳ Le temps restant avant le prochain (demandé : « le temps restant en plus du % »),
      // au débit de la garnison actuelle — rien si la réserve est pleine ou sans jardinier.
      const left = fill < 1 ? leftFor(1 - next, rate) : null;
      const pct = `${Math.round(next * 100)} %${left ? ` · ${left}` : ''}`;
      return { text: whole > 0 ? `🎒 ${whole} · ${pct}` : `🎒 ${pct}`, pct: next };
    }
    case 'scriptorium': {
      const r = units >= 1 - 1e-9 ? 1 : units;
      const left = r < 1 ? leftFor(1 - r, rate) : null;
      return {
        text: r >= 1 ? '📜 prête' : `📜 ${Math.round(r * 100)} %${left ? ` · ${left}` : ''}`,
        pct: r,
      };
    }
    default:
      return null;
  }
}

/**
 * 🧺 LA TUILE DE PRODUCTION d'un point tenu (2026-09-29, demandé : « améliorer l'affichage des
 * ressources et temps de récolte des lieux fixes — celui de la rune, l'info est perdue au
 * milieu de tout le détail »). Une seule ligne de texte mêlait ce qui attend, le temps restant
 * et le débit ; la tuile les sépare, du plus important au moins important :
 * - `value` : ce qui attend, en gros (« 412 🪙 », « Prête », « 63 % ») ;
 * - `what` : de quoi il s'agit, en un mot ;
 * - `pct` + `gauge` : la jauge et ce qu'elle dit du TEMPS (« prête dans 5 h 10 », « réserve
 *   pleine dans 7 h ») — c'est l'information qui décide quand revenir ;
 * - `rate` : le débit et l'effectif, en petit.
 * ⚠️ Lit `stockUnits`/`unitsPerHour`, la même réserve que la récolte et que `controlProgress` :
 * la tuile ne peut pas annoncer autre chose que ce que « Récolter » verse.
 */
export interface ControlYieldCard {
  emoji: string;
  value: string;
  what: string;
  pct: number | null;
  gauge: string | null;
  rate: string | null;
  /** Quelque chose attend d'être récolté. */
  ready: boolean;
  /** Réserve pleine : le point ne produit plus tant qu'on ne récolte pas. */
  full: boolean;
}

const WORKER: Record<ControlKind, [string, string]> = {
  mine: ['mineur', 'mineurs'],
  training: ['champion', 'champions'],
  garden: ['jardinier', 'jardiniers'],
  tower: ['guetteur', 'guetteurs'],
  scriptorium: ['copiste', 'copistes'],
  mana: ['gardien', 'gardiens'],
};

export function controlYieldCard(
  p: Poi,
  now: number,
  playerLevel: number,
): ControlYieldCard | null {
  const c = p.control;
  if (!c || c.owner !== 'player') return null;
  const n = c.garrison.length;
  const seats = seatsOf(c.kind);
  const [one, many] = WORKER[c.kind];
  const crew = `${n}/${seats} ${seats > 1 ? many : one}`;
  const fmt = (x: number) => Math.floor(x + 1e-9).toLocaleString('fr-FR');
  const idle = n > 0 ? null : `Aucun ${one} : la production est arrêtée.`;
  if (c.kind === 'tower') {
    const cut = CONTROL.towerCut * shareOf(n);
    const det = CONTROL.towerDetect * shareOf(n);
    return {
      emoji: '🧭',
      value: `−${Math.round(cut * 100)} %`,
      what: 'sur les trajets de toutes tes expéditions',
      pct: null,
      gauge: idle,
      rate: `👁️ +${Math.round(det * 100)} % de détection · ${crew}`,
      ready: false,
      full: false,
    };
  }
  if (isPerChampKind(c.kind)) {
    const top = Math.max(0, ...Object.values(champStockBy(p, now, playerLevel)));
    const perH = trainingXpPerHour(playerLevel);
    const full = (perH * CONTROL.storageMs) / 3600_000;
    const pct = full > 0 ? Math.min(1, top / full) : 0;
    const left = pct < 1 && n > 0 ? leftFor(full - top, perH) : null;
    return {
      emoji: '🎓',
      value: `+${fmt(top)} XP`,
      what: 'pour le champion le plus avancé',
      pct,
      gauge:
        idle ??
        (pct >= 1
          ? 'Réserve pleine — fais-les progresser'
          : left
            ? `Réserve pleine dans ${left}`
            : null),
      rate: `+${Math.round(perH)} XP/h par champion · ⚒️ +${Math.round(campGearXpPerHour(playerLevel))} XP/h par pièce · ${crew}`,
      ready: top >= 1,
      full: pct >= 1,
    };
  }
  const units = stockUnits(p, now, playerLevel);
  const rate = unitsPerHour(p, n, playerLevel);
  const cap = Math.max(c.banked ?? 0, (rate * storageMsOf(c.kind)) / 3600_000);
  const fill = cap > 0 ? Math.min(1, units / cap) : 0;
  switch (c.kind) {
    case 'mine':
    case 'mana': {
      const mine = c.kind === 'mine';
      const unit = mine ? '🪙' : '💠';
      const left = fill < 1 ? leftFor(cap - units, rate) : null;
      return {
        emoji: mine ? '⛏️' : '⛲',
        value: `${fmt(units)} ${unit}`,
        what: mine ? 'd’or en réserve' : 'pierres de mana en réserve',
        pct: fill,
        gauge:
          idle ??
          (fill >= 1
            ? 'Réserve pleine : plus rien ne s’ajoute, récolte'
            : left
              ? `Réserve pleine dans ${left}`
              : null),
        rate: mine
          ? `+${Math.round(rate).toLocaleString('fr-FR')} 🪙/h · ${crew}`
          : `+${Math.round(rate * 24)} 💠/jour · ${crew}`,
        ready: Math.floor(units + 1e-9) > 0,
        full: fill >= 1,
      };
    }
    case 'garden': {
      const whole = Math.floor(units + 1e-9);
      const next = Math.max(0, units - whole);
      const left = fill < 1 ? leftFor(1 - next, rate) : null;
      const every = gardenHoursFor(n);
      return {
        emoji: '🌿',
        value: whole > 0 ? `${whole} 🎒` : `${Math.round(next * 100)} %`,
        what:
          whole > 0
            ? `consommable${whole > 1 ? 's' : ''} prêt${whole > 1 ? 's' : ''}`
            : 'du prochain consommable',
        pct: fill >= 1 ? 1 : next,
        gauge:
          idle ??
          (fill >= 1
            ? 'Réserve pleine : cueille pour que ça reprenne'
            : left
              ? `Prochain dans ${left}`
              : null),
        rate: every ? `1 toutes les ${formatDuration(every * 3600_000)} · ${crew}` : crew,
        ready: whole > 0,
        full: fill >= 1,
      };
    }
    case 'scriptorium': {
      const r = units >= 1 - 1e-9 ? 1 : units;
      const left = r < 1 ? leftFor(1 - r, rate) : null;
      const every = runeHoursFor(n);
      const best = runeHoursFor(seats);
      return {
        emoji: '📜',
        value: r >= 1 ? 'Prête' : `${Math.round(r * 100)} %`,
        what: r >= 1 ? 'une rune t’attend' : 'de la rune en cours de copie',
        pct: r,
        gauge:
          idle ??
          (r >= 1
            ? 'Récupère-la : la copie suivante ne commence qu’après'
            : left
              ? `Prête dans ${left}`
              : null),
        rate:
          (every ? `1 rune toutes les ${formatDuration(every * 3600_000)} · ` : '') +
          crew +
          (best && n < seats ? ` (${formatDuration(best * 3600_000)} au complet)` : ''),
        ready: r >= 1,
        full: r >= 1,
      };
    }
    default:
      return null;
  }
}

/** ⛏️ L'effectif va changer : on met de côté ce qui est déjà produit (au débit d'AVANT),
 *  et la production repart de `at` au nouveau débit. Rien n'est crédité ni perdu. */
function bankAt(p: Poi, at: number, playerLevel: number): ControlState {
  // ⚒️🎯 À la forge et au camp, chacun met de côté SA réserve : le nouveau venu part de zéro.
  if (isPerChampKind(p.control!.kind))
    return { ...p.control!, perXp: champStockBy(p, at, playerLevel), banked: 0, collectedAt: at };
  return { ...p.control!, banked: stockUnits(p, at, playerLevel), collectedAt: at };
}

/** 🏰 Qui occupe un point, garnison ET renforts en route, séparés en champions et miliciens.
 *  Deux limites : la garnison ENTIÈRE ne dépasse pas `MILITIA.perPoint` (5), et les champions
 *  ne dépassent pas les places du point (`seatsOf` : 5, ou 3 au camp et à la forge). */
function occupants(c: ControlState): { champs: number; militia: number } {
  const ids = [...c.garrison, ...(c.reinforcing ?? []).map((r) => r.id)];
  const militia = ids.filter(isMilitiaId).length;
  return { champs: ids.length - militia, militia };
}
/** 🏰 Les places de CHAMPION occupées d'un point : la garnison et les renforts en route. */
export function controlSeats(c: ControlState | undefined | null): number {
  return c ? occupants(c).champs : 0;
}
/** 🏰 Places encore libres dans la garnison, tout confondu (0 si le point n'est pas à nous). */
function garrisonRoom(c: ControlState): number {
  const o = occupants(c);
  return Math.max(0, MILITIA.perPoint - o.champs - o.militia);
}
/** 🏰 Places de champion libres pour un renfort : celles du point, dans la limite de la
 *  garnison entière (0 si le point n'est pas à nous). */
export function controlFreeSeats(c: ControlState | undefined | null): number {
  if (!c || c.owner !== 'player') return 0;
  return Math.max(0, Math.min(seatsOf(c.kind) - controlSeats(c), garrisonRoom(c)));
}
/** 🛡️ Places libres pour des MILICIENS : ce qui reste de la garnison de 5, champions compris. */
export function militiaFreeSeats(c: ControlState | undefined | null): number {
  if (!c || c.owner !== 'player') return 0;
  return garrisonRoom(c);
}

/** 🏰 Pourquoi un renfort ne peut pas partir. SOURCE UNIQUE : l'écran grise avec cette
 *  raison, le store refuse avec elle. */
export type ReinforceBlock = 'notHeld' | 'empty' | 'full';
export function reinforceBlocker(
  c: ControlState | undefined | null,
  count: number,
  /** Des miliciens (leurs places à eux), sinon des champions. */
  militia = false,
): ReinforceBlock | null {
  if (!c || c.owner !== 'player') return 'notHeld';
  if (count <= 0) return 'empty';
  if (count > (militia ? militiaFreeSeats(c) : controlFreeSeats(c))) return 'full';
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
  from?: number,
  /** 🏰 TRANSFERT : le point fixe d'où ils partent (absent = la ville). */
  via?: string,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      reinforcing: [
        ...(p.control!.reinforcing ?? []),
        ...ids.map((x) => ({
          id: x,
          at,
          ...(from === undefined ? {} : { from }),
          ...(via ? { via } : {}),
        })),
      ],
    },
  }));
}

/** 🏰 Un envoi de renforts EN ROUTE, tel que la carte le dessine : un voyage ALLER SIMPLE
 *  (ils restent sur le point, ils ne rentrent pas — d'où `returnAt` = `midAt`). Les
 *  champions partis ensemble (même départ, même arrivée) forment UN convoi. ⚠️ Un renfort
 *  sans `from` (envoyé avant qu'on le retienne) n'est pas dessiné : sans départ, on ne sait
 *  pas où il en est. */
export interface ReinforcementTrip {
  key: string;
  poi: Poi;
  members: string[];
  sentAt: number;
  midAt: number;
  returnAt: number;
  /** 🏰 Parti d'un autre point fixe (transfert) : le trajet se dessine depuis lui. */
  origin?: { x: number; y: number };
  /** 🔙 Un renfort qui a fait demi-tour en chemin : le retour part de là où il a tourné. */
  turnBack?: number;
  /** 🔙 Un transfert déjà revenu d'un demi-tour : il ne rebrousse pas une seconde fois. */
  turned?: boolean;
}
export function reinforcementsEnRoute(map: ExpeditionMap | null | undefined, now: number) {
  const out = new Map<string, ReinforcementTrip>();
  for (const p of map?.pois ?? []) {
    const c = p.control;
    if (c?.owner !== 'player') continue;
    for (const r of c.reinforcing ?? []) {
      if (r.from === undefined || now >= r.at) continue;
      const key = `${p.id}@${r.from}>${r.at}${r.via ? '<' + r.via : ''}`;
      const t = out.get(key);
      if (t) {
        t.members.push(r.id);
        continue;
      }
      const via = r.via ? map!.pois.find((q) => q.id === r.via) : undefined;
      const src = r.turnAt ?? via;
      out.set(key, {
        key,
        poi: p,
        members: [r.id],
        sentAt: r.from,
        midAt: r.at,
        returnAt: r.at,
        ...(src ? { origin: { x: src.x, y: src.y } } : {}),
        ...(r.turnAt ? { turned: true } : {}),
      });
    }
  }
  return [...out.values()];
}

/**
 * 🔙 DES RENFORTS EN ROUTE REBROUSSENT CHEMIN (2026-09-29, demandé : « faire demi-tour à une
 * troupe à nous en cliquant dessus »). Ils quittent les renforts du point et rentrent à la
 * base par le même chemin, en autant de temps qu'ils en ont déjà mis (`turnBack` = la part du
 * chemin faite, pour que la carte les dessine depuis là où ils ont tourné).
 * ⚠️ Seulement les renforts partis de la BASE et dessinés (`from` connu) : un TRANSFERT
 * (`via`) devrait rentrer sur son point d'origine, et sans départ connu on ne sait pas où ils
 * en sont. Rend `null` si aucun des `ids` ne peut faire demi-tour.
 */
export function recallReinforcements(
  map: ExpeditionMap,
  pointId: string,
  ids: readonly string[],
  now: number,
): { map: ExpeditionMap; back: { id: string; at: number; to?: string }[] } | null {
  const target = map.pois.find((p) => p.id === pointId);
  const c = target?.control;
  const want = new Set(ids);
  const all = (c?.reinforcing ?? []).filter((r) => want.has(r.id) && canTurnBack(r, now));
  if (!all.length) return null;
  // ⇄🔙 UN TRANSFERT REPART SUR SON POINT D'ORIGINE (2026-09-29, demandé : « pouvoir faire
  // demi-tour aux miliciens aussi » — les siens étaient en transfert). Il redevient un
  // renfort de ce point, parti de là où il a tourné. Si ce point n'est plus à nous, ou n'a
  // plus la place, il rentre à la BASE comme un renfort parti de la ville.
  const viaId = all.find((r) => r.via)?.via;
  const origin = viaId ? map.pois.find((p) => p.id === viaId) : undefined;
  const moving = all.filter((r) => r.via && r.via === viaId);
  const nMil = moving.filter((r) => isMilitiaId(r.id)).length;
  const nChamp = moving.length - nMil;
  const room =
    !!origin?.control &&
    origin.control.owner === 'player' &&
    controlFreeSeats(origin.control) >= nChamp &&
    militiaFreeSeats(origin.control) >= moving.length;
  const toOrigin = room && target ? moving : [];
  const toOriginIds = new Set(toOrigin.map((r) => r.id));
  const turning = all.filter((r) => !toOriginIds.has(r.id));
  let out = map;
  const backOrigin = toOrigin.map((r) => {
    const from = Math.min(now, r.from!);
    const done = now - from;
    const f = Math.min(1, done / Math.max(1, r.at - from));
    return {
      id: r.id,
      from: now,
      at: now + done,
      via: pointId,
      turnAt: {
        x: origin!.x + (target!.x - origin!.x) * f,
        y: origin!.y + (target!.y - origin!.y) * f,
      },
    };
  });
  if (backOrigin.length) {
    out = withControl(out, origin!.id, (p) => ({
      ...p,
      control: { ...p.control!, reinforcing: [...(p.control!.reinforcing ?? []), ...backOrigin] },
    }));
    const gone0 = toOriginIds;
    out = withControl(out, pointId, (p) => {
      const reinforcing = (p.control!.reinforcing ?? []).filter((r) => !gone0.has(r.id));
      const ctl = { ...p.control! };
      if (reinforcing.length) ctl.reinforcing = reinforcing;
      else delete ctl.reinforcing;
      return { ...p, control: ctl };
    });
  }
  const backTo = backOrigin.map((b) => ({ id: b.id, at: b.at, to: origin!.id }));
  if (!turning.length) return { map: out, back: backTo };
  map = out;
  const gone = new Set(turning.map((r) => r.id));
  const back = turning.map((r) => {
    const from = Math.min(now, r.from!);
    const done = now - from;
    return {
      id: r.id,
      from: now,
      at: now + done,
      turnBack: Math.min(1, done / Math.max(1, r.at - from)),
    };
  });
  return {
    map: withControl(map, pointId, (p) => {
      const reinforcing = (p.control!.reinforcing ?? []).filter((r) => !gone.has(r.id));
      const ctl = { ...p.control!, returning: [...(p.control!.returning ?? []), ...back] };
      if (reinforcing.length) ctl.reinforcing = reinforcing;
      else delete ctl.reinforcing;
      return { ...p, control: ctl };
    }),
    back: [...backTo, ...back.map((b) => ({ id: b.id, at: b.at }))],
  };
}

/** 🔙 Un renfort peut-il rebrousser chemin ? Encore en route, parti à une heure connue, et
 *  pas déjà revenu d'un demi-tour (`turnAt`). ⚠️ Source unique : la carte, la fiche du point
 *  et le store la lisent. */
export function canTurnBack(
  r: { at: number; from?: number; turnAt?: unknown },
  now: number,
): boolean {
  return r.from !== undefined && !r.turnAt && now < r.at;
}

/** 🏠 Des champions ou miliciens RAMENÉS d'un point partent vers la base : on les dessine
 *  sur la carte jusqu'à `at`. ⚠️ Ils doivent déjà être sortis de la garnison et des renforts
 *  (`releaseFromControl`) : ceci ne fait que noter le trajet. */
export function sendHomeFromControl(
  map: ExpeditionMap,
  id: string,
  ids: readonly string[],
  from: number,
  at: number,
): ExpeditionMap {
  if (!ids.length) return map;
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      returning: [...(p.control!.returning ?? []), ...ids.map((x) => ({ id: x, from, at }))],
    },
  }));
}

/** 🏠 Les retours EN ROUTE, tels que la carte les dessine : un voyage réduit à sa phase
 *  RETOUR (le point → la ville), d'où `sentAt` = `midAt` = le départ du point. Ceux partis
 *  ensemble forment UN trajet. */
export function returnsEnRoute(
  map: ExpeditionMap | null | undefined,
  now: number,
): ReinforcementTrip[] {
  const out = new Map<string, ReinforcementTrip>();
  for (const p of map?.pois ?? []) {
    for (const r of p.control?.returning ?? []) {
      if (now >= r.at) continue;
      const key = `${p.id}<${r.from}>${r.at}`;
      const t = out.get(key);
      if (t) t.members.push(r.id);
      else
        out.set(key, {
          key,
          poi: p,
          members: [r.id],
          sentAt: r.from,
          midAt: r.from,
          returnAt: r.at,
          ...(r.turnBack !== undefined ? { turnBack: r.turnBack } : {}),
        });
    }
  }
  return [...out.values()];
}

/** 🏠 Les retours ARRIVÉS quittent la carte ; rend les miliciens rentrés (à remettre à la
 *  base). Rend la MÊME carte si personne n'est arrivé (le store n'écrit pas à vide). */
export function settleReturns(
  map: ExpeditionMap,
  now: number,
): { map: ExpeditionMap; militiaHome: number } {
  let out = map;
  let militiaHome = 0;
  for (const p of map.pois) {
    const back = (p.control?.returning ?? []).filter((r) => r.at <= now);
    if (!back.length) continue;
    militiaHome += back.filter((r) => isMilitiaId(r.id)).length;
    out = withControl(out, p.id, (q) => {
      const rest = (q.control!.returning ?? []).filter((r) => r.at > now);
      const c = { ...q.control! };
      // Clé ABSENTE quand plus personne ne rentre (la carte se compare par JSON).
      if (rest.length) c.returning = rest;
      else delete c.returning;
      return { ...q, control: c };
    });
  }
  return { map: out, militiaHome };
}

/** 🏰 Une garnison coupée à ses places, dans l'ordre d'arrivée : 5 au plus en tout
 *  (`MILITIA.perPoint`), et les champions aux places du point (`seatsOf`). */
function capGarrison(kind: ControlKind, ids: readonly string[]): string[] {
  let champs = 0;
  let total = 0;
  return ids.filter((id) => {
    if (total >= MILITIA.perPoint) return false;
    if (!isMilitiaId(id) && champs >= seatsOf(kind)) return false;
    if (!isMilitiaId(id)) champs++;
    total++;
    return true;
  });
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
          garrison: capGarrison(c.kind, [...c.garrison, r.id]),
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

/** ⚔️ Une reprise approche : point tenu par nous, attaque dans moins de `CONTROL.imminentMs`
 *  (ou déjà due, le temps que le tick la résolve). */
export function attackImminent(p: Poi, now: number): boolean {
  const c = p.control;
  return (
    c?.owner === 'player' && c.attackAt !== undefined && c.attackAt - now <= CONTROL.imminentMs
  );
}

/** Les ids des points sous attaque imminente, joints par « | » — une CHAÎNE stable pour le
 *  calque de la carte, qui ne se re-rend que si la liste change. */
export function imminentControlKey(map: ExpeditionMap | null, now: number): string {
  return (map?.pois ?? [])
    .filter((p) => attackImminent(p, now))
    .map((p) => p.id)
    .join('|');
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

/**
 * 🗂️ LA LISTE DE GESTION DES POINTS FIXES (2026-09-28, demandé : « une icône au-dessus du
 * dézoom qui liste les lieux fixes pour les gérer »). Une ligne par point, dans l'ordre de
 * `CONTROL.kinds`, avec QUI est dessus, QUI y va, et ce qui appelle une action.
 * ⚠️ Rien n'est recalculé ici : l'état « à récolter » est la réponse de `collectControl`
 * lui-même (il rend la même carte quand il n'y a rien), l'alerte est `attackImminent`.
 * `assaults` = les équipes en marche pour PRENDRE un point (elles restent en garnison à
 * l'arrivée, `midAt`).
 */
export type ControlRosterStatus = 'enemy' | 'assault' | 'held' | 'empty' | 'imminent';
/** 🔎 Les filtres de la liste des places fortes (2026-09-28, demandé : « tenu, pas tenu,
 *  vide »). ⚠️ Dérivés du statut, jamais une seconde règle : une place « attaque imminente »
 *  est TENUE (on y a du monde), une place sous notre assaut n'est PAS TENUE. Vide = à nous,
 *  mais sans personne dedans. */
export type ControlFilter = 'held' | 'notHeld' | 'empty';
export const CONTROL_FILTERS: readonly ControlFilter[] = ['held', 'notHeld', 'empty'];
export const CONTROL_FILTER_LABEL: Record<ControlFilter, string> = {
  held: '🏰 Tenues',
  notHeld: '☠️ Pas tenues',
  empty: '⚠️ Vides',
};
export function controlFilterOf(status: ControlRosterStatus): ControlFilter {
  if (status === 'enemy' || status === 'assault') return 'notHeld';
  return status === 'empty' ? 'empty' : 'held';
}
export interface ControlRosterRow {
  poi: Poi;
  kind: ControlKind;
  status: ControlRosterStatus;
  seats: number;
  garrison: string[];
  reinforcing: { id: string; inMs: number }[];
  assault: { ids: string[]; inMs: number } | null;
  /** Il y a quelque chose à récolter (jamais pour la tour de guet, qui ne stocke rien). */
  ready: boolean;
  /** Où en est la récolte, pour le bout de ligne (null si le point n'est pas tenu). */
  progress: ControlProgress | null;
}
export function controlRoster(
  map: ExpeditionMap | null | undefined,
  assaults: readonly { poiId: string; midAt: number; ids: readonly string[] }[],
  now: number,
  playerLevel: number,
): ControlRosterRow[] {
  if (!map) return [];
  const order = (k: ControlKind) => CONTROL.kinds.indexOf(k);
  return map.pois
    .filter((p): p is Poi & { control: ControlState } => !!p.control)
    .sort((a, b) => order(a.control.kind) - order(b.control.kind))
    .map((p) => {
      const c = p.control;
      const held = c.owner === 'player';
      const march = assaults
        .filter((a) => a.poiId === p.id && now < a.midAt)
        .sort((a, b) => a.midAt - b.midAt);
      const assault =
        !held && march.length
          ? { ids: march.flatMap((a) => [...a.ids]), inMs: march[0]!.midAt - now }
          : null;
      const status: ControlRosterStatus = !held
        ? assault || c.assault
          ? 'assault'
          : 'enemy'
        : attackImminent(p, now)
          ? 'imminent'
          : c.garrison.length
            ? 'held'
            : 'empty';
      return {
        poi: p,
        kind: c.kind,
        status,
        seats: seatsOf(c.kind),
        garrison: held
          ? [...c.garrison, ...(c.reinforcing ?? []).filter((r) => r.at <= now).map((r) => r.id)]
          : [],
        reinforcing: held
          ? (c.reinforcing ?? [])
              .filter((r) => r.at > now)
              .map((r) => ({ id: r.id, inMs: r.at - now }))
          : [],
        assault,
        ready: held && collectControl(map, p.id, now, playerLevel).map !== map,
        progress: held ? controlProgress(p, now, playerLevel) : null,
      };
    });
}

/**
 * 🏳️ Un point TENU est NEUTRE (décision de l'utilisateur, 2026-09-28 : « seule la tenue par
 * nous fait que c'est neutre ») : il n'affiche pas de rang et produit au niveau du héros. Le
 * rang n'appartient qu'aux ENNEMIS — ceux qui le défendent, puis ceux qui le reprennent.
 */
export const isHeldControl = (p: Pick<Poi, 'control'>): boolean => p.control?.owner === 'player';
/** 🏳️ La couleur d'un point tenu : ni celle d'un rang, ni l'accent. */
export const HELD_COLOR = '#9a8f7e';
