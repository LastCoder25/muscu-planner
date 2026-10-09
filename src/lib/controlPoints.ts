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
import { activeIsland, islandPacified } from './archipelago';
import { islandDefenseLine, islandPoint, islandPort, islandPortSpan } from './islandShape';
import { enemyWaitMs, freshSortieClock, sortieFires } from './sortieClock';
import type { SortieClock } from './expedition';
import { mulberry32, seedOf } from './combat';
import {
  advAscensionCap,
  advAscensionReady,
  advBankedLevel,
  advXpToNext,
  type Adventurer,
} from './adventurers';
import { caravanLegMin, catchUpMult, partyAllies, type EscortKit } from './caravan';
import {
  advGearAtRankCap,
  advGearNextRank,
  grantAdvGearXp,
  wornGear,
  type AdvGear,
} from './advGear';
import { characterRank, rankStartLevel } from './characterRank';
import { campWinPct } from './camp';
import { MILITIA, isMilitiaId, militiaUnits, type IslandMilitia } from './militia';
import { SKILLS, SKILL_MAX_LEVEL, type RuneTier, type SkillId } from './skillRunes';
import { labyKeyPriceAt } from '../data/labyrinths';
import { bossSummonCost } from '../data/bosses';
import type { SkirmishUnit } from './skirmish';
import { trialXpBase } from './skirmish';
import { riftClearMana } from './rift';
import { pickBoost, pickSupply, type SupplyStock } from './supplies';
import {
  ARCHIPEL_TRAVEL_LEVEL,
  archipelFloor,
  RUINS_SEALS,
  ruinsChampionSeals,
  CAMP_FACTIONS,
  CARTO_TYPES,
  cartoPick,
  POI_LABEL,
  type CartoType,
  CONTROL_MAX_GARRISON,
  CONTROL_KIND_EMO,
  CONTROL_KIND_LABEL,
  EXPE,
  RAZE_KINDS,
  distNormAt,
  mineVeinGold,
  revealRadius,
  riftLevelFor,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type PostedHero,
  controlWorkforce,
  type ExpeditionMessage,
  type Poi,
} from './expedition';

/** 🪬 L'autel des runes : heures pour 1 rune « à partir du bleu » au complet (le labo en dérive). */
const ALTAR_HOURS_PER_RUNE = 48;

export const CONTROL = {
  /** Les points de contrôle de la carte : ⛏️ mine d'or · 🎯 camp d'entraînement · 🌿 jardin
   *  d'herboriste · 🗼 tour de guet. ⚠️ L'ORDRE compte : il fixe la place de chacun autour
   *  de la ville (un quart de tour d'écart), et la mine, première, garde celle d'avant. */
  // 🗼 Plus de tour de guet sur la carte (retirée le 2026-10-02, demande de l'utilisateur).
  kinds: ['mine', 'training', 'garden', 'scriptorium', 'mana'] as readonly ControlKind[],
  /** 📖 Les archives (île 2) : une entrée du palier de l'île toutes les 48 h, garnison au
   *  complet (étape 0 de l'archipel : +20 à +24 % de clés). */
  archiveHoursPerEntry: 48,
  /**
   * 🏝️ LES SPÉCIALITÉS DES ÎLES 3 À 5, aux débits DÉCIDÉS à l'étape 0 de l'archipel (roadmap,
   * « Les lieux fixes ») — garnison au complet :
   * - ⚱️ ossuaire (île 3) : la part de sceaux de champion d'une ruine (9 × (1 + rang du héros))
   *   toutes les 6 jours, AU RYTHME DE L'ARSENAL depuis le 2026-10-08 (« les sceaux de
   *   champion sont très durs à avoir ») : même besoin qu'en sceaux d'objet, même offre ;
   * - ⚒️ arsenal (île 4) : ⅙ de la part d'objet d'une ruine / jour (+20 %) ;
   * - 🌀 cercle d'invocation (île 4, le « sanctuaire d'invocation » de la roadmap, renommé :
   *   c'est déjà le nom d'un lieu de récolte) : 1 tentative de boss de l'île / 2 jours (+18 %) ;
   * - 🪬 autel des runes (île 5) : 1 rune multicolore / 2 jours, « à partir du bleu » : elle
   *   ne s'ouvre jamais verte (`runeBank.BLESSED_ODDS`).
   */
  // ⚖️ Au rythme de l'arsenal depuis le 2026-10-08 : même besoin, même offre (cf. RUINS_SEALS).
  ossuaryHoursPerRuin: 144,
  /** 💎 Lapidaire (île 3, 2026-10-03) : heures de polissage pour passer une compétence du
   *  niveau 1 au 2, selon sa couleur ; chaque niveau au-dessus en demande la moitié de plus
   *  (`lapidaryHours`). Une verte 1 → 2 en un jour, une dorée 4 → 5 en vingt. Premier calage. */
  lapidaryHours: { green: 24, blue: 48, violet: 96, gold: 192 } as Record<RuneTier, number>,
  arsenalHoursPerRuin: 144,
  circleHoursPerAttempt: 48,
  altarHoursPerRune: ALTAR_HOURS_PER_RUNE,
  /** ⚗️ Laboratoire (île 5, 2026-10-04, décision de l'utilisateur : « comme l'autel de rune mais
   *  sans la rareté de base de l'autel » et « si la rareté est supérieure, le temps est
   *  supérieur ») : même formule que l'autel, 1 rune multicolore « à partir du VIOLET »
   *  (`runeBank.EXALTED_ODDS`, jamais verte ni bleue) — deux fois plus longue à venir.
   *  ⚠️ DÉRIVÉE de `altarHoursPerRune` : si l'autel bouge, le labo suit. */
  labHoursPerRune: 2 * ALTAR_HOURS_PER_RUNE,
  /** Où ils se posent : cette fraction du rayon révélé SANS Avant-poste — visible dès le
   *  début, quel que soit l'Avant-poste. */
  distFrac: 0.62,
  /** 🏝️ Sur une île : cette part de la terre utile à leur angle (v1.28.0, « espace les
   *  lieux ») — à mi-chemin entre la ville et la côte, au lieu de serrés autour de la base. */
  islandFrac: 0.42,
  /** Le délai CALME d'une reprise (v1.67.0) : 3 jours, moins jusqu'à `retakeJitter`, après la
   *  prise ou la défense — tenir un lieu n'est jamais gratuit, même sans sortir. Ce sont tes
   *  SORTIES qui la rapprochent (`sortieRetakes`, `SORTIE_EVENTS.retake` : toutes les 2 à 4
   *  sorties, jamais à moins d'un jour d'écart), comme le harcèlement le faisait à l'horloge
   *  (« plus la carte est utilisée, plus elle harcèle », décision du 2026-09-30). */
  retakeMaxMs: 72 * 3600_000,
  /** Part retirée au plus du délai calme, tirée à chaque attaque. */
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
  /** 🧪 Distillerie (île 5, 2026-10-03) : comme le jardin, mais elle ne distille que des
   *  BOOSTS de vitesse (`pickBoost`, leurs poids de butin) — un toutes les 12 h pour un
   *  distillateur, plus vite à plusieurs (`garrisonShare`). */
  distilleryHoursPerItem: 12,
  /** 🧱 Fortin (île 4, 2026-10-03) : il ne produit rien. Tenu par 3, il retire cette part à
   *  la troupe qui vient reprendre CHACUN des autres lieux tenus de l'île (×0,5/0,8/1/1,15/1,3
   *  de cette part de 1 à 5, `garrisonShare`). Appliqué APRÈS le plafond de tenue de 90 %
   *  (`retakeBoost`), comme le cran : un lieu épaulé par un fortin peut tenir mieux que 90 %. */
  fortCut: 0.25,
  /** 📜 Scriptorium (2026-09-27, demandé : « comme le jardin, mais pour les compétences ») :
   *  recopie une RUNE de compétence. Depuis le 2026-09-28 (demandé : « comme les autres lieux
   *  fixes »), il garde jusqu'à 5 copistes (3 avant le 2026-09-28) et produit selon l'effectif (`garrisonShare`) : une
   *  rune toutes les `runeHoursPerItem` heures À PLEIN — 3 copistes 24 h, 2 → 30 h, 1 → 48 h
   *  (le rythme d'avant, inchangé pour qui n'en poste qu'un). ⚠️ Les runes sont RARES : toutes
   *  sources confondues, un joueur régulier en gagne 0,27 à 0,87 par jour (spec des runes) ;
   *  tenu plein en continu, le Scriptorium en ajoute 1 par jour (choix de l'utilisateur).
   *  🪬 Depuis la bascule des runes multicolores (2026-09-30, spec § 3) : 24 → 16 h, et il
   *  recopie une rune MULTICOLORE (la couleur se tire à l'ouverture). Sa réserve tient UNE
   *  rune (une seule attend d'être ramassée), quel que soit l'effectif. */
  runeHoursPerItem: 16,
  /** 🕯️ Hospice (île 3, 2026-10-04) : il ne produit rien. Tenu, la convalescence d'un champion
   *  blessé sur l'île est DIVISÉE par `1 + hospiceCut × part` (part = `garrisonShare` rapportée
   *  à la garnison pleine) : ÷2 au complet, rien sans personne (`hospiceHealMult`). */
  hospiceCut: 1,
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

/**
 * 🏅 LES CRANS D'UN POINT FIXE (2026-09-30, décisions de l'utilisateur) : l'ANCIENNETÉ.
 *
 * - Tenu : **+1 cran par charge** — 24 h avec 3 en garnison, plus vite ou plus lentement
 *   selon l'effectif, bloqué sans personne (cf. plus bas) —, jusqu'à `TIER.max` (10).
 * - Perdu (reprise ou abandon) : **−1 tout de suite**, puis **−1 toutes les 24 h** tant que
 *   l'ennemi le tient. Repris par le joueur, il repart des crans qui lui restent.
 * - Chaque cran : `yieldPerTier` de production en plus (or, mana, consommables, runes, XP du
 *   camp, effets de la tour) ET `threatPerTier` de troupe ennemie en plus à la reprise — un
 *   point riche est plus convoité (décision de l'utilisateur : « l'objectif sera d'intercepter
 *   les armées pour tenir le plus longtemps possible »). La menace s'ajoute APRÈS le plafond de
 *   90 % de tenue (`retakeBoost`) : un vieux point se garde en interceptant ses assaillants.
 *   ⚠️ MESURÉ (garnison de 3 champions de référence, niveaux 12/30/60, 60 combats) : une
 *   garnison forte, ramenée à ~89 %, tient ~75 % face à une troupe ×1,4 et ~72 % à ×1,5 ; une
 *   garnison à niveau passe de ~63 % à ~48 % — une pente, pas un mur.
 * ⚠️ Le cran se DÉDUIT du temps (`controlTier`) : l'état ne retient que la valeur posée au
 * dernier changement (`tier`), la part du cran suivant déjà chargée (`tierCharge`) et leur
 * instant (`tierAt`). Un point tenu d'avant la règle (sans `tierAt`) compte depuis sa prise
 * (`since`) : son ancienneté est reconnue.
 *
 * 🏅👥 LE RYTHME SUIT LA GARNISON (2026-10-01, demandé par l'utilisateur : « sans personne, le
 * délai est bloqué ; plus il y a de garnison, plus il est rapide ») : un cran tenu se charge à
 * la vitesse `garrisonShare` (la courbe de la production, champions ET miliciens) — vide :
 * BLOQUÉ · 1 : 48 h · 2 : 30 h · 3 : 24 h (l'ancienne règle) · 4 : ~20 h 52 · 5 : ~18 h 28.
 * ⚠️ Le rythme est celui de la garnison ACTUELLE : chaque changement d'effectif fige la
 * progression (`rebaseTier`, appelé par `bankAt`), comme la production. La baisse chez
 * l'ennemi, elle, reste −1 par 24 h.
 */
export const TIER = {
  max: 10,
  dayMs: 24 * 3600_000,
  yieldPerTier: 0.05,
  threatPerTier: 0.05,
} as const;

/** L'instant d'où le cran compte : `tierAt`, sinon la prise d'un point tenu d'avant la règle. */
const tierRef = (c: ControlState): number | undefined =>
  c.tierAt ?? (c.owner === 'player' ? c.since : undefined);

/** 🏅👥 La vitesse de charge d'un cran (1 = un cran par 24 h). Tenu : selon la garnison
 *  (0 sans personne) ; chez l'ennemi : la baisse, toujours 1. */
export function tierRate(c: ControlState): number {
  return c.owner === 'player' ? shareOf(controlWorkforce(c)) : 1;
}

/** 🏅👥 La durée d'un cran pour une garnison de `n` (champions ET miliciens) ; `null` : bloqué. */
export function tierStepMs(n: number): number | null {
  const r = shareOf(n);
  return r > 0 ? TIER.dayMs / r : null;
}

/** La progression (en crans, fractionnaire) accumulée depuis `tierRef`, charge comprise. */
function tierProgress(c: ControlState, ref: number, at: number): number {
  return (c.tierCharge ?? 0) + (Math.max(0, at - ref) * tierRate(c)) / TIER.dayMs;
}

/** 🏅 Le cran d'un point à `at`. */
export function controlTier(c: ControlState | undefined, at: number): number {
  if (!c) return 0;
  const base = Math.max(0, Math.min(TIER.max, c.tier ?? 0));
  const ref = tierRef(c);
  if (ref === undefined) return base;
  const steps = Math.floor(tierProgress(c, ref, at));
  return c.owner === 'player' ? Math.min(TIER.max, base + steps) : Math.max(0, base - steps);
}

/** 🏅👥 L'effectif va changer à `at` : on FIGE le cran et la part déjà chargée, pour que la
 *  suite se charge au rythme de la nouvelle garnison. Rien n'est perdu ni gagné. */
function rebaseTier(c: ControlState, at: number): ControlState {
  const ref = tierRef(c);
  if (c.owner !== 'player' || ref === undefined) return c;
  const tier = controlTier(c, at);
  const p = tierProgress(c, ref, at);
  const charge = tier >= TIER.max ? 0 : p - Math.floor(p);
  return { ...c, tier, tierAt: at, tierCharge: charge };
}

/** L'instant du prochain changement de cran après `t` ; `null` si rien ne bouge plus. */
function nextTierAt(c: ControlState, t: number): number | null {
  const ref = tierRef(c);
  if (ref === undefined) return null;
  const tier = controlTier(c, t);
  if (c.owner === 'player' ? tier >= TIER.max : tier <= 0) return null;
  const rate = tierRate(c);
  if (rate <= 0) return null;
  const k = Math.floor(tierProgress(c, ref, t)) + 1;
  // ⚠️ Arrondi flottant : jamais à `t` lui-même, sinon la boucle d'intégration piétinerait.
  return Math.max(t + 1, ref + ((k - (c.tierCharge ?? 0)) * TIER.dayMs) / rate);
}

/** 🏅 Le multiplicateur de production d'un cran. */
export const tierYieldMult = (tier: number): number => 1 + TIER.yieldPerTier * tier;
/** 🏅 Le multiplicateur de la troupe de reprise d'un cran. */
export const tierThreatMult = (tier: number): number => 1 + TIER.threatPerTier * tier;

/** 🏅 Les HEURES pondérées par le cran entre `from` et `to` : ∫ `tierYieldMult` dt. Le cran
 *  change en route : on intègre cran par cran, sinon récolter tard paierait tout le passé au
 *  cran d'aujourd'hui. */
function tierHours(c: ControlState, from: number, to: number): number {
  if (to <= from) return 0;
  // 🏝️ Socle d'une île pacifiée : SANS crans, le temps compte à plat.
  if (c.flatTier) return (to - from) / 3600_000;
  let acc = 0;
  let t = from;
  while (t < to) {
    const next = nextTierAt(c, t);
    const end = next === null ? to : Math.min(to, next);
    acc += tierYieldMult(controlTier(c, t)) * (end - t);
    t = end;
  }
  return acc / 3600_000;
}

/** 🏅 Le temps avant le prochain changement de cran (montée si tenu, baisse si ennemi) ;
 *  `null` quand plus rien ne bouge (au plafond, à 0 chez l'ennemi, ou garnison vide). */
export function nextTierInMs(c: ControlState | undefined, now: number): number | null {
  if (!c) return null;
  const next = nextTierAt(c, now);
  return next === null ? null : next - now;
}

/** 🏅 Ce que la fiche d'un point dit de son cran : titre et détail. `null` pour un point ennemi
 *  sans cran (rien à perdre, rien à dire). */
export function controlTierLabel(
  c: ControlState | undefined,
  now: number,
): { title: string; detail: string } | null {
  if (!c) return null;
  const tier = controlTier(c, now);
  const next = nextTierInMs(c, now);
  const pct = (x: number) => Math.round((x - 1) * 100);
  if (c.owner === 'player') {
    const gain = tier
      ? `+${pct(tierYieldMult(tier))} % de production · assaillants +${pct(tierThreatMult(tier))} %`
      : 'aucun bonus encore';
    const up =
      tier >= TIER.max
        ? ' · au maximum'
        : next !== null
          ? ` · prochain cran dans ${formatDuration(next)}`
          : ' · bloqué : personne en garnison';
    return { title: `🏅 Cran ${tier}/${TIER.max}`, detail: gain + up };
  }
  if (tier <= 0) return null;
  const down = next !== null ? ` · en perd un dans ${formatDuration(next)}` : '';
  return {
    title: `🏅 Cran ${tier}/${TIER.max}`,
    detail: `reprends-le vite : il repart de là${down}`,
  };
}

/** 🏅 La ligne du rapport de chute : le cran perdu. Vide si le point n'en avait pas. */
export function tierLostLabel(tierBefore: number): string {
  return tierBefore > 0
    ? ` 🏅 Le lieu perd un cran (${tierBefore} → ${tierBefore - 1}) — reprends-le vite.`
    : '';
}

/** 🏅 Le cran à la prochaine attaque : c'est lui qui dimensionne la troupe de reprise. */
const tierAtAttack = (c: ControlState | undefined): number =>
  c?.attackAt !== undefined ? controlTier(c, c.attackAt) : controlTier(c, 0);

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
  archives: PRODUCER_SEATS,
  ossuary: PRODUCER_SEATS,
  arsenal: PRODUCER_SEATS,
  circle: PRODUCER_SEATS,
  altar: PRODUCER_SEATS,
  mana: PRODUCER_SEATS,
  mine: PRODUCER_SEATS,
  training: CONTROL_MAX_GARRISON,
  garden: PRODUCER_SEATS,
  distillery: PRODUCER_SEATS,
  fort: PRODUCER_SEATS,
  cartographer: PRODUCER_SEATS,
  hospice: PRODUCER_SEATS,
  lab: PRODUCER_SEATS,
  // 💎 UN seul champion, et personne pour le défendre (pas de milice : `garrisonCap`).
  lapidary: 1,
  tower: PRODUCER_SEATS,
  // 🏯 La citadelle ne se tient pas : on l'abat, personne n'y reste.
  citadel: 0,
  // 🏝️ Les objectifs de l'île se TIENNENT une fois pris (étape 6 bis). 5 champions
  // (2026-10-04, demandé : « la garnison des objectifs est passée à 3 au lieu de 5 ») : la
  // garnison entière, comme les lieux qui produisent.
  objective: PRODUCER_SEATS,
  // 🏰 La forteresse PRISE se tient, garnison SANS LIMITE, comme la base (décision de
  // l'utilisateur, 2026-10-02 : « la forteresse a une garnison sans limite »).
  fortress: Infinity,
};
export const seatsOf = (kind: ControlKind): number => CONTROL_SEATS[kind];
/** 🏰 Combien RESTERONT si l'assaut prend CE point : ses places, 0 pour un objectif qu'on
 *  abat (`razes`, les nids). ⚠️ Lu par l'écran d'envoi ET le store : un nid ne garde personne. */
export const holdSeats = (c: Pick<ControlState, 'kind' | 'razes'>): number =>
  c.razes ? 0 : seatsOf(c.kind);
/** 🏰 La garnison ENTIÈRE d'un point : ses places de champion PLUS ses places de milice
 *  (deux réserves séparées depuis le 2026-10-08), sans limite pour la forteresse. */
export const garrisonCap = (kind: ControlKind): number => seatsOf(kind) + militiaSeatsOf(kind);
/** 🛡️ Sa garnison le DÉFEND-elle ? Pas le lapidaire : son champion polit, il ne se bat pas —
 *  le lieu ne se protège qu'en interceptant l'armée qui marche dessus. ⚠️ Lu par la reprise
 *  (store) ET par chaque pronostic de tenue. */
export const defendsControl = (kind: ControlKind | undefined): boolean => kind !== 'lapidary';
/** 🛡️ Les places de MILICE d'un point, À PART de celles des champions (2026-10-08, décision
 *  de l'utilisateur : « seuls les miliciens défendent les lieux fixes ; champions et héros y
 *  restent postés, produisent, et interceptent »). 5 sur un lieu de production, 0 là où aucun
 *  milicien ne va (objectif, forteresse, citadelle) et au lapidaire. */
export const militiaSeatsOf = (kind: ControlKind): number =>
  RAZE_KINDS.has(kind) || kind === 'lapidary' ? 0 : MILITIA.perPoint;
/** 🛡️ Les champions et le héros postés DÉFENDENT-ils ce point ? Seulement là où aucune milice
 *  ne va (objectif tenu, forteresse) : ailleurs, seuls les miliciens combattent la reprise.
 *  ⚠️ SOURCE UNIQUE : la bataille du store et chaque pronostic de tenue la lisent. */
export const champsDefend = (kind: ControlKind | undefined): boolean =>
  !!kind && defendsControl(kind) && militiaSeatsOf(kind) === 0;
/** 🛡️ Ceux qui COMBATTENT la reprise d'un point : les miliciens de `ids`, et les champions
 *  et le héros seulement là où ils défendent (`champsDefend`). Personne au lapidaire. */
export function controlAllies(
  kind: ControlKind | undefined,
  champs: readonly Adventurer[],
  kit: EscortKit,
  hero: PostedHero | null,
  ids: readonly string[],
  playerLevel: number,
): SkirmishUnit[] {
  if (!defendsControl(kind)) return [];
  if (champsDefend(kind)) return partyAllies([...champs], kit, hero);
  return militiaUnits([...ids], playerLevel);
}
/** 🛡️ Ce membre de garnison (`ids` d'une garnison : champion ou `mil:`) COMBAT-il la reprise ?
 *  La règle de `controlAllies`, lue membre par membre (compte des défenseurs, part de chacun). */
export const memberDefends = (kind: ControlKind | undefined, id: string): boolean =>
  defendsControl(kind) && (isMilitiaId(id) ? !champsDefend(kind) : champsDefend(kind));
/** 🛡️ Combien COMBATTRONT : les membres qui défendent (`memberDefends`), plus le héros là où
 *  les champions défendent. */
export const defenderCount = (
  kind: ControlKind | undefined,
  ids: readonly string[],
  hero: boolean,
): number =>
  ids.filter((id) => memberDefends(kind, id)).length + (hero && champsDefend(kind) ? 1 : 0);
/** 🧭 L'angle de chaque point autour de la ville, en quarts de tour. Les quatre premiers
 *  gardent leur place ; la demi-place entre la mine et le camp est libre depuis le retrait de
 *  la Forge de campagne (2026-09-29). */
const CONTROL_QUARTER: Record<ControlKind, number> = {
  mine: 0,
  training: 1,
  garden: 2,
  tower: 3,
  // 📜 La place de la tour de guet, retirée le 2026-10-02 (sa citadelle garde une cible).
  scriptorium: 3,
  // 📖 Île 2 (2026-10-04, 3ᵉ lieu de l'île) : la place du camp, qui n'y est pas — à un quart
  // de tour de l'ossuaire (2,5) et du scriptorium (3), plutôt qu'à 45° de l'ossuaire.
  archives: 1,
  // ⚱️ Île 3 : la place du scriptorium, qui n'y est pas.
  ossuary: 2.5,
  // ⚒️ Île 3 (2026-10-03) : face au camp, assez loin de lui pour un rang différent.
  arsenal: 3,
  // 🌀 Île 4 (2026-10-04, 3ᵉ lieu de l'île) : la place du camp (fortin en 2, cartographe en 3).
  circle: 1,
  // 🗿 Île 5 : la place du jardin, qui n'y est pas.
  altar: 2,
  // 🧪 Île 5 : la place de la tour de guet (camp en 1, autel en 2).
  distillery: 3,
  // 🧱 Île 4 : la place du jardin (camp en 1).
  fort: 2,
  // 🗺️ Île 4 : la place de la tour de guet (camp en 1, fortin en 2).
  cartographer: 3,
  // 💎 Île 3 : la place du jardin (camp en 1, arsenal en 3).
  lapidary: 2,
  // 🕯️ Île 3 : la place du camp (lapidaire en 2, arsenal en 3).
  hospice: 1,
  // ⚗️ Île 5 : la place du camp (autel en 2, distillerie en 3).
  lab: 1,
  // ⛲ La place laissée libre par la Forge de campagne (2026-09-29), entre la mine et le camp.
  mana: 0.5,
  // 🏯 Inutilisé : les citadelles ont leurs propres angles (`CITADEL.sites`).
  citadel: 0,
  // 🏝️ Inutilisés : objectifs et forteresse ont leur place (`islandConquest`).
  objective: 0,
  fortress: 0,
};

export const CONTROL_EMO = CONTROL_KIND_EMO;
export const CONTROL_LABEL = CONTROL_KIND_LABEL;
/** Ce qu'un point rapporte, en quelques mots. */
export const CONTROL_YIELD: Record<ControlKind, string> = {
  mine: 'or 🪙 en continu',
  training: 'XP pour la garnison 🎓 et son équipement ⚒️',
  garden: 'consommables 🎒',
  distillery: 'boosts de vitesse ⚡',
  fort: 'des reprises affaiblies sur tes autres lieux de l’île 🛡️',
  cartographer: 'le lieu de ton choix, plus souvent sur l’île 🗺️',
  lapidary: 'un niveau de plus sur une compétence de son champion 💎',
  hospice: 'des champions blessés de l’île guéris plus vite 🕯️',
  lab: 'runes multicolores violettes ou mieux 🟣',
  tower: 'trajets plus courts 🧭',
  scriptorium: 'runes de compétence',
  archives: 'clés du Labyrinthe',
  ossuary: 'sceaux de champion 🔱',
  arsenal: 'sceaux d’objet ⚜️',
  circle: 'pierres d’invocation 🔮',
  altar: 'runes multicolores 🪬',
  mana: 'pierres de mana 💠 en continu',
  citadel: 'une trêve de 3 jours sur les points qu’elle attaque',
  objective: 'un pas vers la pacification de l’île',
  fortress: 'l’île pacifiée : plus aucune attaque',
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

/**
 * 🏯 LES CITADELLES ENNEMIES (2026-09-30, décisions de l'utilisateur) : l'endgame OFFENSIF des
 * points fixes. C'est d'elles que partent les reprises.
 *
 * - **L'ennemi est là dès le départ, caché dans le brouillard** : quatre citadelles, une par
 *   quart, chacune à une distance différente (`sites`). Chaque point est attaqué par la plus
 *   proche de lui (en angle). 🌫️ **Cachée, elle attaque aussi, 2× moins souvent**
 *   (`hiddenSlow` : on ne peut pas encore l'abattre). **Découverte, elle lance en plus des
 *   RAIDS sur n'importe quel lieu tenu** (`citadelRaids`). Toutes ces cadences suivent
 *   l'UTILISATION de la carte (`mapHarass`, départs des 7 derniers jours) : « la carte est une
 *   mine de ressources, plus on l'utilise plus elle harcèle » (décision de l'utilisateur,
 *   2026-09-30 — remplace « si je la vois, elle me voit »).
 * - **On les DÉCOUVRE en agrandissant la carte** (l'Avant-poste) : une citadelle se révèle
 *   quand le disque révélé l'atteint (`discoveredAt`, jamais repris). Cachée, elle ne se voit
 *   pas et ne s'attaque pas.
 * - Jamais tenues : on en attaque une en groupe (héros compris, comme un camp) ; gagnée, elle
 *   est ABATTUE puis se reconstruit aussitôt, un PALIER plus haut.
 * - **Son niveau est toujours celui du joueur** : elle monte avec le sport. Ce qui monte à
 *   chaque destruction, c'est son PALIER — sa troupe grossit (`perPalier`), et son butin avec
 *   (celui d'un camp, qui suit la taille). **Un échec, ou 7 jours sans la battre : palier −1.**
 * - **Tenir les points qu'elle attaque l'affaiblit** (`perHeldPoint` par point).
 * - **L'abattre offre une TRÊVE à ces points** (`truceMs`) : aucune reprise avant sa fin.
 * - **SA COLÈRE** (décision de l'utilisateur, option A) : une fois DÉCOUVERTE, chaque jour sans
 *   l'abattre (après la fin de sa trêve) grossit ses armées de `ragePerDay`, jusqu'à
 *   `rageMaxDays` jours. L'abattre remet le compteur à zéro. ⚠️ Jamais tant qu'elle est
 *   cachée : on ne punit pas ce qu'on ne peut pas atteindre.
 * - **Loin, donc cher en temps** : de ~3 h 40 (la première) à ~7 h (la quatrième) d'aller au
 *   niveau 30, avant les réductions. ⚠️ Posées hors du disque révélé : exemptées de l'élagage
 *   « hors de la carte ».
 * ⚠️ MESURÉ (combat fondu, champions de référence nus, 60 combats) : un héros + 3 champions
 *   battent une troupe de 4 à 58-100 % (niveaux 12 à 90), de 5 à 13-98 %, de 6 à 0-65 %.
 */
export const CITADEL = {
  /** Sa troupe au palier 0, sans point tenu, en champions de référence. */
  baseSize: 4,
  /** +15 % de troupe par palier. */
  perPalier: 0.15,
  /** −10 % de troupe par point tenu parmi ceux qu'elle attaque. */
  perHeldPoint: 0.1,
  /** La trêve offerte en l'abattant : 3 jours (le délai le plus long d'une reprise). */
  truceMs: 72 * 3600_000,
  /** Palier −1 par semaine sans victoire. */
  decayMs: 7 * 24 * 3600_000,
  /** 🌫️ Une citadelle CACHÉE attaque aussi les points de son secteur, mais 2× moins souvent :
   *  on ne peut pas encore l'abattre pour s'offrir une trêve. */
  hiddenSlow: 2,
  /** 😡 Colère : +5 % d'armée par jour sans l'abattre, au plus 10 jours (+50 %). */
  ragePerDay: 0.05,
  rageMaxDays: 10,
  /** Les citadelles : leur angle (en quarts de tour, même repère que `CONTROL_QUARTER` — chacune
   *  entre deux points) et leur distance à la ville. Découvertes à l'Avant-poste ~3, ~12, ~32
   *  et ~70 (`citadelRevealLevel`). La deuxième est EN FACE de la première. */
  sites: [
    { quarter: 0.25, dist: 55 },
    { quarter: 2.25, dist: 70 },
    { quarter: 1.25, dist: 85 },
    { quarter: 3.25, dist: 100 },
  ] as readonly { quarter: number; dist: number }[],
} as const;

const DAY_MS = 24 * 3600_000;

export const citadelIdOf = (i: number): string => `ctl_citadel_${i}`;
const CITADEL_IDS = CITADEL.sites.map((_, i) => citadelIdOf(i));
export const isCitadel = (p: Pick<Poi, 'control'> | null | undefined): boolean =>
  p?.control?.kind === 'citadel';
export const isCitadelId = (id: string): boolean => CITADEL_IDS.includes(id);
/** 🏯 Une citadelle découverte (donc visible et attaquable). */
const isCitadelFound = (p: Pick<Poi, 'control'> | null | undefined): boolean =>
  isCitadel(p) && p!.control!.discoveredAt !== undefined;

/** 🏯 Le niveau d'Avant-poste qui fait découvrir la citadelle `i`. */
export function citadelRevealLevel(i: number): number {
  const d = CITADEL.sites[i]!.dist;
  for (let L = 1; L <= 100; L++) if (revealRadius(L) >= d) return L;
  return 100;
}

/** 🏯 Les citadelles présentes sur la carte (leurs index dans `sites`). */
function presentCitadels(pois: readonly Poi[]): number[] {
  return CITADEL_IDS.flatMap((id, i) => (pois.some((p) => p.id === id) ? [i] : []));
}

/** 🏯 Parmi `present`, la citadelle la plus proche (en angle) d'un type de point ; `null`
 *  s'il n'y en a aucune. */
function citadelIndexOf(kind: ControlKind, present: readonly number[]): number | null {
  const q = CONTROL_QUARTER[kind];
  let best: number | null = null;
  let bestD = Infinity;
  for (const i of present) {
    const d = Math.abs(((q - CITADEL.sites[i]!.quarter + 6) % 4) - 2);
    if (d < bestD - 1e-9) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** 🏯 L'id de la citadelle qui attaque ce type de point sur cette carte, ou `null`. */
export function citadelIdFor(pois: readonly Poi[], kind: ControlKind): string | null {
  const i = citadelIndexOf(kind, presentCitadels(pois));
  return i === null ? null : citadelIdOf(i);
}

/** 🏯 Les types de points qu'une citadelle attaque sur cette carte. */
export function citadelTargets(pois: readonly Poi[], i: number): ControlKind[] {
  const present = presentCitadels(pois);
  return CONTROL.kinds.filter((k) => citadelIndexOf(k, present) === i);
}

/** 🏯 Le palier EFFECTIF à `now` : celui posé, moins une semaine d'inactivité par cran. */
export function citadelPalier(c: ControlState | undefined, now: number): number {
  if (!c) return 0;
  const base = Math.max(0, c.palier ?? 0);
  const idle =
    c.palierAt === undefined ? 0 : Math.floor(Math.max(0, now - c.palierAt) / CITADEL.decayMs);
  return Math.max(0, base - idle);
}

/** 😡 Depuis quand une citadelle s'énerve : sa découverte, ou la fin de sa dernière trêve si
 *  elle est plus récente. `undefined` tant qu'elle est cachée. */
function rageSinceOf(c: ControlState): number | undefined {
  if (c.discoveredAt === undefined) return undefined;
  return Math.max(c.discoveredAt, c.truceUntil ?? 0);
}

/** 😡 Ce que la colère ajoute par jour, selon les jours actifs sur 7 : pleine à 7/7, nulle
 *  à 0 — un joueur peu actif n'est pas harcelé comme un joueur actif (même règle que le délai
 *  des reprises, `retakeDelayMs`). */
function rageRate(activeDays7: number): number {
  return (CITADEL.ragePerDay * Math.min(7, Math.max(0, activeDays7))) / 7;
}

/** 😡 Le multiplicateur d'armée d'une colère commencée à `since`, à l'instant `at`.
 *  ⚠️ `activeDays7` est REQUIS : l'oublier ferait s'énerver au rythme d'un joueur actif. */
export function rageMult(since: number | undefined, at: number, activeDays7: number): number {
  if (since === undefined) return 1;
  const days = Math.floor(Math.max(0, at - since) / DAY_MS);
  return 1 + rageRate(activeDays7) * Math.min(CITADEL.rageMaxDays, days);
}

/** 😡 L'activité notée sur un point à la programmation de son attaque (7 pour un point d'avant). */
const activityOf = (c: ControlState | undefined): number => c?.activity ?? 7;

/** 🏯 Combien de points qu'elle attaque le joueur tient. */
function heldFor(pois: readonly Poi[], i: number): number {
  const present = presentCitadels(pois);
  return pois.filter(
    (p) =>
      p.control?.owner === 'player' &&
      p.control.kind !== 'citadel' &&
      citadelIndexOf(p.control.kind, present) === i,
  ).length;
}

/** 🏯 Sa troupe, en champions de référence, pour un palier et un nombre de points tenus. */
export function citadelSize(palier: number, held: number): number {
  const weak = Math.max(0, 1 - CITADEL.perHeldPoint * Math.max(0, held));
  return CITADEL.baseSize * (1 + CITADEL.perPalier * Math.max(0, palier)) * weak;
}

/** 🏯 La trêve en cours sur un point (celle de la citadelle qui l'attaque), 0 sinon. */
export function truceUntilFor(map: ExpeditionMap | null | undefined, kind: ControlKind): number {
  const id = map ? citadelIdFor(map.pois, kind) : null;
  return (id && map!.pois.find((p) => p.id === id)?.control?.truceUntil) || 0;
}

/** 😡 Chaque point porte le début de la colère de SA citadelle (`angerSince`) : la troupe de
 *  reprise se dimensionne sans relire la carte. N'écrit que ce qui change. */
function stampAnger(pois: Poi[]): Poi[] {
  const present = presentCitadels(pois);
  const since = new Map(
    pois.filter(isCitadel).map((p) => [p.id, rageSinceOf(p.control!)] as const),
  );
  let out = pois;
  pois.forEach((p, k) => {
    const c = p.control;
    if (!c || c.kind === 'citadel') return;
    const i = citadelIndexOf(c.kind, present);
    const s = i === null ? undefined : since.get(citadelIdOf(i));
    if (c.angerSince === s) return;
    const next = { ...c };
    if (s === undefined) delete next.angerSince;
    else next.angerSince = s;
    if (out === pois) out = [...pois];
    out[k] = { ...p, control: next };
  });
  return out;
}

/** 🏯 Les citadelles à jour : posées si elles manquent, découvertes quand le disque révélé les
 *  atteint, niveau (celui du joueur), place et troupe rafraîchis ; la citadelle unique d'avant
 *  (`ctl_citadel`, v0.1378) est retirée ; puis la colère est reportée sur les points. Rend le
 *  MÊME tableau quand rien ne change. */
function syncCitadels(
  pois: Poi[],
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  outpostLevel: number,
): Poi[] {
  const level = Math.max(1, playerLevel);
  const reach = revealRadius(outpostLevel);
  let out = pois.some((p) => p.id === controlIdOf('citadel'))
    ? pois.filter((p) => p.id !== controlIdOf('citadel'))
    : pois;
  // 🏝️ SUR UNE ÎLE, PAS DE CITADELLE : posées de 55 à 100 unités, elles tomberaient en mer
  // (la côte peut passer à 60), et ce sont les camps de l'île qui attaquent (`attackSlow`).
  // Celles d'une carte qui bascule s'en vont (sauf pendant un assaut : l'équipe y marche).
  if (map.archipel) {
    const kept = out.filter((p) => !isCitadel(p) || p.control!.assault);
    const slow0 = (k: ControlKind) => attackSlow({ pois: kept, archipel: map.archipel }, k);
    if (islandPacified(map)) return gateAttacks(kept, now, slow0, true, true);
    return sortieRetakes(map, gateAttacks(kept, now, slow0, false, true), now, slow0);
  }
  CITADEL.sites.forEach((site, i) => {
    const id = citadelIdOf(i);
    if (out.some((p) => p.id === id)) return;
    out = [
      ...out,
      {
        id,
        type: 'control',
        level,
        travelLevel: map.archipel ? ARCHIPEL_TRAVEL_LEVEL : level,
        ...spotAt(map, site.quarter, site.dist),
        spawnedAt: now,
        expiresAt: EXPE.lifespanMs.control,
        control: {
          kind: 'citadel',
          owner: 'enemy',
          garrison: [],
          retakes: 0,
          faction: enemyForce(`${map.seed}:${id}`, 0).faction,
          size: 0,
          palier: 0,
          palierAt: now,
        },
      },
    ];
  });
  CITADEL.sites.forEach((site, i) => {
    const k = out.findIndex((p) => p.id === citadelIdOf(i));
    if (k < 0) return;
    const p = out[k]!;
    const c = p.control!;
    // ⚠️ Pas pendant un assaut : la troupe affrontée est celle annoncée au départ.
    if (c.assault) return;
    const spot = spotAt(map, site.quarter, site.dist);
    const size = citadelSize(citadelPalier(c, now), heldFor(out, i));
    const found = c.discoveredAt ?? (reach >= site.dist ? now : undefined);
    if (
      p.level === level &&
      p.x === spot.x &&
      p.y === spot.y &&
      Math.abs(c.size - size) < 1e-9 &&
      found === c.discoveredAt
    )
      return;
    out = [...out];
    out[k] = {
      ...p,
      ...spot,
      level,
      travelLevel: map.archipel ? ARCHIPEL_TRAVEL_LEVEL : level,
      control: { ...c, size, ...(found !== undefined ? { discoveredAt: found } : {}) },
    };
  });
  // 🕊️ Île pacifiée : ni reprise, ni raid.
  const slowOf = (k: ControlKind) => attackSlow({ pois: out, archipel: map.archipel }, k);
  if (islandPacified(map)) return gateAttacks(stampAnger(out), now, slowOf, true);
  const gated = sortieRetakes(map, gateAttacks(stampAnger(out), now, slowOf), now, slowOf);
  return citadelRaids(map, gated, now);
}

/** 🌫️ La citadelle du secteur de ce point est-elle encore CACHÉE ? Elle l'attaque quand même,
 *  2× moins souvent (`CITADEL.hiddenSlow`) — on ne peut pas encore l'abattre. Sans
 *  citadelle sur la carte (carte d'avant les citadelles) : non. */
export function attackerHidden(
  map: Pick<ExpeditionMap, 'pois' | 'archipel'>,
  kind: ControlKind,
): boolean {
  // 🏝️ Sur une île, ce sont les camps de l'île qui attaquent, pas une citadelle.
  if (map.archipel) return false;
  const pois = map.pois;
  const id = citadelIdFor(pois, kind);
  if (!id) return false;
  const cit = pois.find((p) => p.id === id);
  return !!cit && !isCitadelFound(cit);
}

/** ⚔️ Tout point tenu a une attaque prévue. Celui qui n'en a pas (la règle « une citadelle
 *  cachée n'attaque pas », v0.1388, est abandonnée le 2026-09-30) en reçoit une à partir de
 *  maintenant, au rythme calme (jamais pendant une trêve). N'écrit que ce qui change. */
function gateAttacks(
  pois: Poi[],
  now: number,
  slowOf: (kind: ControlKind) => number,
  pacified = false,
  capLate = false,
): Poi[] {
  let out = pois;
  // 🕊️ Île pacifiée : plus aucune attaque — on RETIRE celles qui étaient prévues.
  if (pacified) {
    pois.forEach((p, k) => {
      const c = p.control;
      if (!c || (c.attackAt === undefined && c.raidAt === undefined)) return;
      if (out === pois) out = [...pois];
      const { attackAt: _a, raidAt: _r, ...rest } = c;
      void _a;
      void _r;
      out[k] = { ...p, control: rest };
    });
    return out;
  }
  pois.forEach((p, k) => {
    const c = p.control;
    // 🏰 La forteresse prise n'est jamais reprise (décision de l'utilisateur, 2026-10-02).
    if (!c || c.owner !== 'player' || c.kind === 'citadel' || c.kind === 'fortress') return;
    // 🏝️ Une attaque prévue sur l'ANCIEN rythme (plus loin que le maximum du nouveau) est
    // retirée et reprogrammée : sinon elle tomberait des jours après ce que la règle dit.
    // Le maximum n'est jamais dépassé par un nouveau tirage, donc rien ne boucle.
    if (
      capLate &&
      c.attackAt !== undefined &&
      c.attackAt > now + CONTROL.retakeMaxMs * slowOf(c.kind)
    ) {
      const attackAt = now + retakeCalmMs(p.id, now, slowOf(c.kind));
      if (out === pois) out = [...pois];
      out[k] = { ...p, control: { ...c, attackAt } };
      return;
    }
    if (c.attackAt !== undefined) return;
    const id = citadelIdFor(pois, c.kind);
    const truce = (id && pois.find((q) => q.id === id)?.control?.truceUntil) || 0;
    const attackAt = Math.max(now + retakeCalmMs(p.id, now, slowOf(c.kind)), truce);
    if (out === pois) out = [...pois];
    out[k] = { ...p, control: { ...c, attackAt } };
  });
  return out;
}

/**
 * ⚔️ LES RETAKES RAPPROCHÉES PAR TES SORTIES (v1.67.0, `SORTIE_EVENTS.retake`) : chaque lieu tenu
 * a son horloge (`ControlState.sorties`) ; toutes les 2 à 4 sorties (× son facteur
 * `attackSlow`), une armée sort, attend 1 à 3 h, et sa reprise est avancée à cet instant —
 * jamais pendant une trêve, jamais une attaque déjà plus proche, jamais deux à moins d'un jour
 * (× le facteur) : le rythme le plus soutenu de l'ancien harcèlement. N'écrit que ce qui change.
 */
function sortieRetakes(
  map: Pick<ExpeditionMap, 'departures' | 'seed'>,
  pois: Poi[],
  now: number,
  slowOf: (kind: ControlKind) => number,
): Poi[] {
  let out = pois;
  pois.forEach((p, k) => {
    const c = p.control;
    if (!c || c.owner !== 'player' || c.attackAt === undefined) return;
    if (c.kind === 'citadel' || c.kind === 'fortress') return;
    const old = c.sorties ?? freshSortieClock(now, c.since);
    const slow = slowOf(c.kind);
    const { times, clock } = sortieFires(map, old, 'retake', now, slow, p.id);
    let attackAt = c.attackAt;
    const truce = truceUntilFor({ pois: out } as ExpeditionMap, c.kind);
    for (const t of times)
      attackAt = Math.min(attackAt, Math.round(Math.max(t + enemyWaitMs(p.id, t), truce)));
    if (clock === c.sorties && attackAt === c.attackAt) return;
    if (out === pois) out = [...pois];
    out[k] = { ...p, control: { ...c, attackAt, sorties: clock } };
  });
  return out;
}

/** 🗺️ L'horloge de sorties d'un point qui vient d'être pris ou défendu à `at` : la charge
 *  repart de zéro et l'écart minimal se compte depuis `at`. */
function restClock(clock: SortieClock | undefined, at: number): SortieClock {
  return { ...(clock ?? freshSortieClock(at)), charge: 0, last: at };
}

/** ⚔️ LES RAIDS : chaque citadelle DÉCOUVERTE frappe, toutes les `SORTIE_EVENTS.raid` sorties
 *  (v1.67.0, son horloge `sorties` ; avant : 1 à 4 jours selon le harcèlement), un lieu tenu
 *  tiré au hasard n'importe où sur la carte : après 1 à 3 h d'attente, elle avance son attaque
 *  prévue (un lieu ne porte qu'une attaque à la fois). Pendant sa trêve elle ne raide pas, et
 *  un lieu couvert par la trêve de SA citadelle n'est pas visé (la trêve promet des jours sans
 *  reprise). `raidAt` : l'horloge d'avant, retirée. N'écrit que ce qui change. */
export function citadelRaids(
  map: Pick<ExpeditionMap, 'departures' | 'seed'>,
  pois: Poi[],
  now: number,
): Poi[] {
  let out = pois;
  CITADEL_IDS.forEach((cid) => {
    const k = out.findIndex((p) => p.id === cid);
    const cit = k < 0 ? null : out[k]!;
    if (!cit || !isCitadelFound(cit)) return;
    const { raidAt: _r, ...cc } = cit.control!;
    void _r;
    const truce = cc.truceUntil ?? 0;
    const { times, clock } = sortieFires(map, cc.sorties, 'raid', now, 1, cid);
    for (const t of times) {
      if (t < truce) continue;
      const at = Math.round(t + enemyWaitMs(cid, t));
      const targets = out.filter(
        (p) =>
          p.control?.owner === 'player' &&
          p.control.kind !== 'citadel' &&
          p.control.attackAt !== undefined &&
          p.control.attackAt > at &&
          truceUntilFor({ pois: out } as ExpeditionMap, p.control.kind) <= at,
      );
      if (!targets.length) continue;
      const r = mulberry32((seedOf(`${cid}:target:${t}`) ^ 0x1f83d9ab) >>> 0 || 1)();
      const tg = targets[Math.floor(r * targets.length)]!;
      out = out.map((p) =>
        p.id === tg.id ? { ...p, control: { ...p.control!, attackAt: at } } : p,
      );
    }
    if (_r === undefined && clock === cc.sorties) return;
    out = out.map((p) => (p.id === cid ? { ...p, control: { ...cc, sorties: clock } } : p));
  });
  return out;
}

/** 🏯 Abattue à `at` : palier +1 (à partir du palier effectif), trêve posée sur les points
 *  qu'elle attaque, nouvelle bannière, colère remise à zéro ; leurs reprises prévues sont
 *  repoussées après la trêve. */
export function razeCitadel(map: ExpeditionMap, id: string, at: number): ExpeditionMap {
  const i = CITADEL_IDS.indexOf(id);
  const cit = map.pois.find((p) => p.id === id);
  if (i < 0 || !cit?.control) return map;
  const c = cit.control;
  const present = presentCitadels(map.pois);
  const truceUntil = at + CITADEL.truceMs;
  const retakes = c.retakes + 1;
  const palier = citadelPalier(c, at) + 1;
  return {
    ...map,
    pois: stampAnger(
      map.pois.map((p) => {
        if (p.id === id)
          return {
            ...p,
            control: {
              ...c,
              assault: false,
              retakes,
              faction: enemyForce(`${map.seed}:${id}`, retakes).faction,
              palier,
              palierAt: at,
              truceUntil,
              size: citadelSize(palier, heldFor(map.pois, i)),
            },
          };
        const pc = p.control;
        if (
          pc?.owner !== 'player' ||
          pc.kind === 'citadel' ||
          citadelIndexOf(pc.kind, present) !== i ||
          pc.attackAt === undefined ||
          pc.attackAt >= truceUntil
        )
          return p;
        return { ...p, control: { ...pc, attackAt: truceUntil } };
      }),
    ),
  };
}

/** 🏯 Repoussés : palier −1 (jamais sous 0), l'assaut se lève. */
export function repelledAtCitadel(map: ExpeditionMap, id: string, at: number): ExpeditionMap {
  const i = CITADEL_IDS.indexOf(id);
  if (i < 0) return map;
  return {
    ...map,
    pois: map.pois.map((p) => {
      if (p.id !== id || !p.control) return p;
      const palier = Math.max(0, citadelPalier(p.control, at) - 1);
      return {
        ...p,
        control: {
          ...p.control,
          assault: false,
          palier,
          palierAt: at,
          size: citadelSize(palier, heldFor(map.pois, i)),
        },
      };
    }),
  };
}

/** 🏯 Les citadelles que l'Avant-poste vient de DÉCOUVRIR entre deux états de la carte : une
 *  citadelle présente et cachée avant, découverte après. ⚠️ Sans carte d'avant (création), rien :
 *  on n'annonce pas au joueur ce qu'il n'a jamais vu caché. */
export function newlyDiscoveredCitadels(
  prev: ExpeditionMap | null | undefined,
  next: ExpeditionMap,
): string[] {
  if (!prev) return [];
  return next.pois
    .filter((p) => isCitadelFound(p))
    .filter((p) => {
      const was = prev.pois.find((q) => q.id === p.id);
      return !!was && isCitadel(was) && was.control!.discoveredAt === undefined;
    })
    .map((p) => p.id);
}

/** 🏯 Ce que l'animation de découverte annonce. */
export function citadelDiscoveryFx(
  map: ExpeditionMap,
  ids: readonly string[],
): { title: string; subtitle: string } {
  const kinds = ids.flatMap((id) => citadelTargets(map.pois, CITADEL_IDS.indexOf(id)));
  const targets = kinds.map((k) => CONTROL_KIND_LABEL[k]);
  return {
    title: ids.length > 1 ? `${ids.length} citadelles découvertes !` : 'Citadelle découverte !',
    subtitle:
      (targets.length
        ? `Elle${ids.length > 1 ? 's attaquent' : ' attaque'} : ${targets.join(', ')}`
        : 'Une forteresse ennemie sort du brouillard') +
      ' · abats-la pour offrir 3 jours de trêve · sa colère monte chaque jour',
  };
}

/** 🏯 Ce que la fiche dit d'une citadelle : palier, points qu'elle attaque, colère, trêve, et
 *  ce qui l'affaiblit. */
export function citadelLabel(
  map: ExpeditionMap | null | undefined,
  id: string,
  now: number,
  activeDays7: number,
): { title: string; detail: string } | null {
  const i = CITADEL_IDS.indexOf(id);
  const c = map?.pois.find((p) => p.id === id)?.control;
  if (i < 0 || !c) return null;
  const palier = citadelPalier(c, now);
  const held = heldFor(map.pois, i);
  const truce = (c.truceUntil ?? 0) - now;
  const targets = citadelTargets(map.pois, i).map((k) => CONTROL_KIND_LABEL[k]);
  const rage = Math.round((rageMult(rageSinceOf(c), now, activeDays7) - 1) * 100);
  const weak = held
    ? ` · affaiblie de ${Math.round(CITADEL.perHeldPoint * held * 100)} % par tes points tenus`
    : '';
  return {
    title: `🏯 Palier ${palier}${rage > 0 ? ` · 😡 +${rage} %` : ''}`,
    detail:
      (targets.length ? `elle attaque : ${targets.join(', ')}` : 'elle n’attaque aucun point') +
      (truce > 0
        ? ` · trêve encore ${formatDuration(truce)}`
        : ` · ses armées grossissent de ${Math.round(rageRate(activeDays7) * 1000) / 10} % par jour sans l’abattre (colère +${rage} %) · abats-la : 3 jours sans reprise sur ces points`) +
      weak +
      ' · un échec ou 7 jours sans la battre : palier −1.',
  };
}

/** 🏝️ Le niveau d'un point fixe ENNEMI sur une île (étape 6 bis, décision de l'utilisateur) :
 *  il MONTE EN S'ÉLOIGNANT DU PORT D'ARRIVÉE — le bas de la tranche de l'île près du port, le haut
 *  vers l'intérieur et la forteresse. La progression se lit sur la carte. ⚠️ Exception
 *  assumée à « la difficulté ne dépend pas de la distance », qui reste vraie pour les lieux
 *  tirés et pour les ASSAILLANTS (`attackerLevel`). Jamais au-dessus du joueur. */
export function islandControlLevel(
  map: Pick<ExpeditionMap, 'archipel'>,
  at: { x: number; y: number },
  playerLevel: number,
): number {
  const id = map.archipel?.island ?? 1;
  const floor = archipelFloor(map);
  const top = Math.max(floor, Math.max(1, playerLevel));
  // ⚓ Mesuré depuis le PORT D'ARRIVÉE (le village sur les îles 2 à 5) : sur l'île 1, la base
  // est au centre et les lieux fixes l'entourent à égale distance — c'est la route du port à
  // la forteresse qui y donne la progression.
  const port = islandPort(id);
  const frac = Math.min(1, Math.hypot(at.x - port.x, at.y - port.y) / islandPortSpan(id));
  return Math.min(Math.max(1, playerLevel), Math.round(floor + frac * (top - floor)));
}

/** Le niveau (donc le rang) d'un point : tiré comme celui d'une faille — entre Bronze et le
 *  rang du joueur, jamais lié à la distance. Re-tiré à chaque reprise. */
function controlLevel(
  id: string,
  retakes: number,
  playerLevel: number,
  floorLevel: number,
): number {
  const rng = mulberry32((seedOf(`${id}:lv:${retakes}`) ^ 0x7a3d91c3) >>> 0 || 1);
  // ⚠️ JAMAIS AU-DESSUS DU JOUEUR : le tirage des failles garde une place « au-dessus », or un
  // point FIXE tiré là restait hors d'atteinte jusqu'à ce qu'on le prenne — c'est-à-dire pour
  // toujours. Marquer cette place « prise » (`pris` = un niveau au-dessus) l'écarte du tirage.
  const pl = Math.max(1, playerLevel);
  return Math.min(pl, riftLevelFor(rng, pl, [pl + 1], false, floorLevel));
}

/** 🛡️ Les places des points fixes de l'île `id`, dans l'ordre de ses types : la LIGNE DE
 *  DÉFENSE entre le point de départ et la forteresse (`islandDefenseLine`, demandé le
 *  2026-10-04 : ils étaient posés à un angle tiré autour du centre, sans rapport avec l'axe). */
export function islandControlSpots(id: number): { kind: ControlKind; x: number; y: number }[] {
  const kinds = ISLAND_KINDS[id] ?? [];
  const line = islandDefenseLine(id, kinds.length);
  return kinds.map((kind, i) => ({ kind, ...line[i]! }));
}

/** Où se pose un point : FIXE. Sur une île, sa place sur la ligne de défense ; un type que
 *  l'île n'a pas (retiré mais encore tenu) garde l'ancienne règle, à `CONTROL.islandFrac` de
 *  la terre utile à son angle. Ailleurs, dérivé de la graine de la carte et du type. */
export function controlSpot(
  map: Pick<ExpeditionMap, 'seed' | 'archipel'>,
  kind: ControlKind,
): Pick<Poi, 'x' | 'y' | 'distNorm'> {
  const id = map.archipel?.island;
  if (id !== undefined) {
    const s = islandControlSpots(id).find((c) => c.kind === kind);
    if (s) {
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      return { x, y, distNorm: distNormAt(Math.hypot(x - EXPE.town.x, y - EXPE.town.y)) };
    }
    return spotAt(map, CONTROL_QUARTER[kind], (ang) => islandPoint(id, ang, CONTROL.islandFrac));
  }
  // Chaque point a son angle, en quarts de tour à partir de l'angle de la MINE (tiré comme
  // avant : une mine déjà posée ne bouge pas). ⚠️ UNE TABLE, pas l'index dans `kinds` : un
  // cinquième type divisait le tour en cinq, et le nouveau point tombait à 18° d'un point
  // déjà posé (les points existants gardent leur place, elle n'est calculée qu'une fois).
  return spotAt(
    map,
    CONTROL_QUARTER[kind],
    EXPE.distMin + CONTROL.distFrac * (revealRadius(1) - EXPE.distMin),
  );
}

/** Un lieu fixe : à `quarter` quarts de tour de l'angle de la mine, à la distance `d` de la
 *  ville (ou au point `d(angle)`, vu du centre d'une île pour suivre sa côte). */
function spotAt(
  map: Pick<ExpeditionMap, 'seed'>,
  quarter: number,
  dist: number | ((ang: number) => { x: number; y: number }),
): Pick<Poi, 'x' | 'y' | 'distNorm'> {
  const rng = mulberry32((map.seed ^ seedOf('ctl:mine:0')) >>> 0 || 1);
  const ang = rng() * Math.PI * 2 + (quarter * Math.PI) / 2;
  const p =
    typeof dist === 'number'
      ? { x: EXPE.town.x + Math.cos(ang) * dist, y: EXPE.town.y + Math.sin(ang) * dist }
      : dist(ang);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  return { x, y, distNorm: distNormAt(Math.hypot(x - EXPE.town.x, y - EXPE.town.y)) };
}

/** 🏰 TOUS les types de points qui se TIENNENT (carte ordinaire et îles) : ceux qu'on n'abat
 *  pas. ⚠️ DÉRIVÉ de `CONTROL_SEATS` (exhaustive par construction) : une liste écrite à la main
 *  avait oublié la distillerie, qu'aucune invasion ne frappait. */
export const ALL_CONTROL_KINDS: readonly ControlKind[] = [
  ...CONTROL.kinds,
  ...(Object.keys(CONTROL_SEATS) as ControlKind[]).filter(
    (k) => !RAZE_KINDS.has(k) && !CONTROL.kinds.includes(k),
  ),
];

/**
 * 🏝️ LES POINTS FIXES DE CHAQUE ÎLE (roadmap, « Répartition ») : le socle (mine, camp, source
 * de mana) partout, plus les spécialités de l'île. Carte ordinaire : la liste d'origine.
 * 🗼 PAS DE TOUR DE GUET SUR LES ÎLES (v1.28.1, décision de l'utilisateur : « enlève les tours
 * de guet, les îles sont plus petites ») — la Tour de guet de la BASE, elle, reste.
 */
const ISLAND_KINDS: Record<number, readonly ControlKind[]> = {
  // 🎯 PLUS DE CAMP D'ENTRAÎNEMENT SUR LES ÎLES (2026-10-03, décision de l'utilisateur) : un
  // camp encore tenu est rappelé puis effacé (`retiredHeld`), comme la tour de guet. Il reste
  // sur la carte ordinaire (`CONTROL.kinds`).
  // 🏝️ AUCUN DOUBLON D'UNE ÎLE À L'AUTRE (décision de
  // l'utilisateur, 2026-10-03 : « les îles produisent selon le niveau du joueur, pas besoin de
  // remettre les mêmes lieux fixes sur d'autres îles »). Une île QUITTÉE continue de produire
  // (`autoCollectControls`), au niveau du joueur : une 2ᵉ mine sur l'île 2 ne ferait
  // qu'empiler de l'or. Le camp, lui, est sur chaque île : il entraîne les champions POSTÉS
  // là où l'on se bat. ⚠️ Les archives (clés) et le cercle (pierres d'invocation), retirés
  // un temps pour ne rien verser à la partie héros, reviennent sur les îles 2 et 4
  // (2026-10-04, décision de l'utilisateur : trois lieux fixes par île).
  // Un lieu retiré encore tenu est rappelé puis effacé (`retiredHeld`).
  1: ['mine', 'mana', 'garden'],
  // 🏝️ TROIS LIEUX FIXES PAR ÎLE (2026-10-04, décision de l'utilisateur) : archives (île 2),
  // hospice (île 3), cercle d'invocation (île 4), laboratoire (île 5).
  2: ['scriptorium', 'ossuary', 'archives'],
  3: ['lapidary', 'arsenal', 'hospice'],
  4: ['cartographer', 'fort', 'circle'],
  5: ['altar', 'distillery', 'lab'],
};
export function controlKindsOf(map: Pick<ExpeditionMap, 'archipel'>): readonly ControlKind[] {
  return (map.archipel && ISLAND_KINDS[map.archipel.island]) || CONTROL.kinds;
}

/** 🛡️🏝️ Ce qu'une île impose à la milice (`militiaCap`) : une garnison PLEINE
 *  (`MILITIA.perPoint`) sur chacun de ses lieux fixes, et sa tranche de niveaux. `null` hors
 *  archipel. */
export function islandMilitiaOf(
  map: Pick<ExpeditionMap, 'archipel'> | null | undefined,
): IslandMilitia | null {
  const a = map?.archipel;
  if (!a) return null;
  return {
    seats: controlKindsOf({ archipel: a }).length * MILITIA.perPoint,
    minLevel: Math.max(1, a.levelFloor ?? 1),
    maxLevel: a.levelCap,
  };
}

/** ⚒️🌀🗿 L'unité produite et ce qu'en dit la tuile, pour les spécialités des îles 4 et 5. */
const UNIT_LOOK: Record<
  'ossuary' | 'arsenal' | 'circle' | 'altar' | 'lab',
  { unit: string; what: string }
> = {
  ossuary: { unit: '🔱', what: 'du prochain sceau de champion, versé directement' },
  arsenal: { unit: '⚜️', what: 'du prochain sceau d’objet, versé directement' },
  circle: { unit: '🔮', what: 'de la prochaine pierre d’invocation, versée directement' },
  altar: { unit: '🪬', what: 'de la prochaine rune, versée directement' },
  lab: { unit: '🟣', what: 'de la prochaine rune violette ou mieux, versée directement' },
};

/** 🗑️ Un point d'un type retiré est-il encore occupé (garnison, renforts, retours, héros) ? */
function retiredOccupied(c: ControlState): boolean {
  return (
    c.garrison.length > 0 ||
    !!c.reinforcing?.length ||
    !!c.returning?.length ||
    !!c.hero ||
    !!c.heroComing
  );
}

/** 🗑️ Les points TENUS d'un type retiré (la tour de guet) où il reste une garnison ou le
 *  héros : le store les rappelle, après quoi `ensureControls` les retire de la carte. */
export function retiredHeld(map: ExpeditionMap): Poi[] {
  const kinds = controlKindsOf(map);
  return map.pois.filter(
    (p) =>
      p.control?.owner === 'player' &&
      !RAZE_KINDS.has(p.control.kind) &&
      !kinds.includes(p.control.kind) &&
      (p.control.garrison.length > 0 || !!p.control.hero || !!p.control.heroComing),
  );
}

/** Pose les points de contrôle MANQUANTS sur la carte (tenus par l'ennemi). Rend la même
 *  carte quand il ne manque rien : le store n'écrit pas à vide. */
export function ensureControls(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  outpostLevel: number,
): ExpeditionMap {
  const add: Poi[] = [];
  const kinds = controlKindsOf(map);
  for (const kind of kinds) {
    const id = controlIdOf(kind);
    if (map.pois.some((p) => p.id === id)) continue;
    const spot = controlSpot(map, kind);
    add.push({
      id,
      type: 'control',
      level: map.archipel
        ? islandControlLevel(map, spot, playerLevel)
        : controlLevel(`${map.seed}:${id}`, 0, playerLevel, archipelFloor(map)),
      // Le trajet suit la DISTANCE (le lieu est fixe), pas le rang tiré.
      travelLevel: map.archipel ? ARCHIPEL_TRAVEL_LEVEL : Math.max(1, playerLevel),
      ...spot,
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
  // 🛡️ Sur une île, un lieu fixe qui n'est pas sur SA place y retourne, tenu ou non : la ligne
  // de défense (2026-10-04) est arrivée après des lieux déjà posés, que la boucle ci-dessus ne
  // touche jamais (signalé : un Ossuaire resté à 38 unités de sa place, collé aux Archives).
  // Seule la position bouge — garnison, production, rang et attaque prévue restent.
  const islandSpots = map.archipel ? islandControlSpots(map.archipel.island) : [];
  const healed = map.pois.map((p0) => {
    const c = p0.control;
    let p = p0;
    const spot = c && islandSpots.find((sp) => sp.kind === c.kind);
    if (spot && (p.x !== Math.round(spot.x) || p.y !== Math.round(spot.y)))
      p = { ...p, ...controlSpot(map, c.kind) };
    if (!c || c.owner !== 'enemy' || RAZE_KINDS.has(c.kind)) return p;
    // 🏝️ Sur une île, un point jamais pris suit sa distance au port (un point repris garde
    // le rang de ses assaillants).
    if (map.archipel && !c.retakes) {
      const lv = islandControlLevel(map, p, playerLevel);
      const big = c.size > Math.max(...CONTROL.captureSizes);
      if (lv === p.level && !big) return p;
      const key = `${map.seed}:${p.id}`;
      return { ...p, level: lv, control: big ? { ...c, ...enemyForce(key, c.retakes) } : c };
    }
    const tooHigh = p.level > Math.max(1, playerLevel);
    // 🏝️ Sous le rang d'entrée de l'île (carte qui change d'île) : re-tiré aussi, si le joueur
    // a lui-même atteint ce rang.
    const floorRank = characterRank(archipelFloor(map)).rankIndex;
    const tooLow =
      characterRank(p.level).rankIndex < floorRank &&
      characterRank(Math.max(1, playerLevel)).rankIndex >= floorRank;
    const tooBig = c.size > Math.max(...CONTROL.captureSizes);
    if (!tooHigh && !tooLow && !tooBig) return p;
    const key = `${map.seed}:${p.id}`;
    return {
      ...p,
      level:
        tooHigh || tooLow ? controlLevel(key, c.retakes, playerLevel, archipelFloor(map)) : p.level,
      control: tooBig ? { ...c, ...enemyForce(key, c.retakes) } : c,
    };
  });
  // 🗑️ Un point d'un type RETIRÉ (la Forge de campagne, fondue dans le camp le 2026-09-29)
  // quitte la carte. ⚠️ Sa garnison est libérée d'elle-même : la disponibilité d'un champion
  // se DÉDUIT de la carte. Vérifié en base avant le retrait : aucun joueur n'en tenait une.
  // ⚠️ Sauf s'il est OCCUPÉ : il reste tant qu'il a une garnison, des renforts en route, des
  // champions qui en rentrent ou le héros (le store rappelle d'abord tout le monde,
  // `retiredHeld`) — puis il part.
  const kept = healed.filter(
    (p) =>
      !p.control ||
      RAZE_KINDS.has(p.control.kind) ||
      kinds.includes(p.control.kind) ||
      (p.control.owner === 'player' && retiredOccupied(p.control)),
  );
  // 🏯 Les citadelles quittent l'île SANS être perdues (mises de côté, rendues en sortant).
  const { pois: stashed, stash } = stashCitadels([...kept, ...add], map, now);
  // 🏯 Les citadelles : posées si elles manquent, niveau, place et troupe tenus à jour.
  const all = syncCitadels(stashed, map, now, playerLevel, outpostLevel);
  const changed =
    stash !== map.citadelStash ||
    all.length !== map.pois.length ||
    all.some((p, i) => p !== map.pois[i]);
  if (!changed) return map;
  const out: ExpeditionMap = { ...map, pois: all };
  if (stash) out.citadelStash = stash;
  else delete out.citadelStash;
  return out;
}

/**
 * 🏯🏝️ LES CITADELLES NE SE PERDENT PAS SUR UNE ÎLE (2026-10-02, signalé par l'utilisateur :
 * « les 2 citadelles prises hier ne sont plus grisées alors que ça ne fait pas 3 j »).
 * `syncCitadels` les retire en mode archipel (elles tomberaient en mer) puis les REPOSAIT
 * À NEUF en sortant : palier 0, aucune trêve, aucune destruction — basculer l'interrupteur
 * effaçait trois jours de trêve. Elles sont désormais mises de côté sur la carte
 * (`citadelStash`) et rendues telles quelles. ⚠️ Une citadelle en plein ASSAUT reste sur
 * l'île (l'équipe y marche, cf. `syncCitadels`). ⚠️ Au retour, un raid prévu pendant l'île
 * est REPROGRAMMÉ (`raidAt` retiré) : sinon `citadelRaids` rattraperait jusqu'à 8 raids d'un coup.
 */
function stashCitadels(
  pois: Poi[],
  map: ExpeditionMap,
  now: number,
): { pois: Poi[]; stash: Poi[] | undefined } {
  const prev = map.citadelStash;
  if (map.archipel) {
    const leaving = pois.filter((p) => isCitadel(p) && !p.control!.assault);
    if (!leaving.length) return { pois, stash: prev };
    const ids = new Set(leaving.map((p) => p.id));
    return {
      pois: pois.filter((p) => !ids.has(p.id)),
      stash: [...(prev ?? []).filter((p) => !ids.has(p.id)), ...leaving],
    };
  }
  if (!prev) return { pois, stash: undefined };
  const back = prev
    .filter((s) => !pois.some((p) => p.id === s.id))
    .map((s) => {
      const c = s.control!;
      if (c.raidAt === undefined || c.raidAt > now) return s;
      const rest: ControlState = { ...c };
      delete rest.raidAt;
      return { ...s, control: rest };
    });
  return { pois: [...pois, ...back], stash: undefined };
}

/** Délai CALME avant la prochaine attaque (graine : le lieu et l'instant) : 3 jours, moins
 *  jusqu'à `retakeJitter`, × `slowBy` (`attackSlow` : citadelle cachée, lieu d'île…). Les
 *  sorties la rapprochent ensuite (`sortieRetakes`).
 *  ⚠️ L'instant n'est JAMAIS annoncé au joueur (décision de l'utilisateur) : ni sur la fiche
 *  du point, ni par une notification de préavis — seule l'attaque elle-même se dit. Seule
 *  exception (2026-09-28) : `attackImminent`, qui prévient dans les `CONTROL.imminentMs`
 *  dernières heures, sans jamais donner l'heure. */
/**
 * 🏝️ LE RYTHME DES REPRISES SUR UNE ÎLE (décision de l'utilisateur, 2026-10-04) : ce sont la
 * forteresse et les objectifs ennemis encore debout qui attaquent.
 * - un LIEU FIXE pris est attaqué « de temps en temps » : ×1,5 le délai de base (1,5 à 4,5 j) ;
 * - un OBJECTIF pris, l'ennemi tient à le récupérer : ×0,5 (12 h à 1,5 j).
 * Le délai de base vient du harcèlement (`retakeDelayMs`, 1 à 3 j). Pacifiée, plus aucune.
 * ⚠️ Remplace « chaque camp abattu les espace » (v1.12) : prendre les objectifs rendait l'île
 * PLUS calme (×4 avec la forteresse seule), l'inverse de ce que l'ennemi ferait.
 */
export const ISLAND_ATTACK = { place: 1.5, objective: 0.5 } as const;

/**
 * ⚔️ Le facteur des reprises d'un point (multiplie `retakeDelayMs`) :
 * - hors archipel : 2 si la citadelle de son secteur est encore cachée (`hiddenSlow`), 1 sinon ;
 * - 🏝️ sur une île : `ISLAND_ATTACK` selon que le point est un objectif ou un autre lieu fixe.
 */
export function attackSlow(
  map: Pick<ExpeditionMap, 'pois' | 'archipel'>,
  kind: ControlKind,
): number {
  if (activeIsland(map))
    return kind === 'objective' ? ISLAND_ATTACK.objective : ISLAND_ATTACK.place;
  return attackerHidden(map, kind) ? CITADEL.hiddenSlow : 1;
}
export function retakeCalmMs(id: string, from: number, slowBy: number): number {
  const r = mulberry32((seedOf(`${id}:atk:${from}`) ^ 0x2c1b3c6d) >>> 0 || 1)();
  // Un facteur sous 1 ACCÉLÈRE (objectif pris sur une île) ; plancher pour une valeur folle.
  const slow = Math.max(0.1, slowBy);
  return Math.round(slow * CONTROL.retakeMaxMs * (1 - r * CONTROL.retakeJitter));
}

/** Remplace un point dans la carte. */
function withControl(map: ExpeditionMap, id: string, f: (p: Poi) => Poi): ExpeditionMap {
  return { ...map, pois: map.pois.map((p) => (p.id === id && p.control ? f(p) : p)) };
}

/** 💎 Ce que le lapidaire a poli depuis la dernière récolte. */
export interface LapisGain {
  advId: string;
  skill: SkillId;
  hours: number;
}

/** 💎 Les heures pour passer `id` de `level` à `level + 1` (`CONTROL.lapidaryHours`). */
export function lapidaryHours(id: SkillId, level: number): number {
  return CONTROL.lapidaryHours[SKILLS[id].tier] * (1 + 0.5 * (Math.max(1, level) - 1));
}

/**
 * 💎 Verse les heures du lapidaire sur la compétence : +1 niveau chaque fois que le temps de
 * son niveau est atteint, 5 au plus. ⚠️ Les heures sont GARDÉES sur le champion
 * (`lapisHours`), pas sur le lieu : perdu ou quitté, le travail fait reste acquis. Une
 * compétence qu'il n'a pas, ou au maximum, ne reçoit rien.
 */
export function applyLapis(
  advs: Adventurer[],
  g: LapisGain | undefined,
): { advs: Adventurer[]; up: number } {
  // ⚠️ Rien à verser → le MÊME tableau : le store compare par identité pour ne pas écrire.
  if (!g || g.hours <= 0) return { advs, up: 0 };
  let up = 0;
  let changed = false;
  const next = advs.map((a) => {
    if (a.id !== g.advId) return a;
    const skills = a.skills ?? [];
    const i = skills.findIndex((s) => s.id === g.skill);
    if (i < 0 || skills[i]!.level >= SKILL_MAX_LEVEL) return a;
    changed = true;
    let level = skills[i]!.level;
    let h = (a.lapisHours?.[g.skill] ?? 0) + g.hours;
    while (level < SKILL_MAX_LEVEL && h + 1e-9 >= lapidaryHours(g.skill, level)) {
      h -= lapidaryHours(g.skill, level);
      level++;
      up++;
    }
    const hours = { ...(a.lapisHours ?? {}) };
    if (level >= SKILL_MAX_LEVEL) delete hours[g.skill];
    else hours[g.skill] = h;
    return {
      ...a,
      skills: skills.map((s, k) => (k === i ? { ...s, level } : s)),
      lapisHours: hours,
    };
  });
  return { advs: changed ? next : advs, up };
}

/** 💎 Le lapidaire tenu change la compétence qu'il polit. Refus (carte inchangée) : pas un
 *  lapidaire, pas à nous, ou une compétence inconnue. */
export function setLapisSkill(
  map: ExpeditionMap,
  id: string,
  skill: SkillId,
  now: number,
): ExpeditionMap {
  const c = map.pois.find((p) => p.id === id)?.control;
  if (!c || c.kind !== 'lapidary' || c.owner !== 'player') return map;
  if (!(skill in SKILLS) || c.lapis === skill) return map;
  // ⚠️ Le temps part de MAINTENANT : sans compétence choisie le lieu n'a rien poli, et ce
  // qui a été poli sur l'ancienne a été récolté juste avant (store).
  return withControl(map, id, (p) => ({
    ...p,
    control: { ...p.control!, lapis: skill, collectedAt: now, banked: 0 },
  }));
}

/** 🗺️ Le CARTOGRAPHE tenu change le type qu'il fait revenir. Refus (carte inchangée) : pas un
 *  cartographe, pas à nous, ou un type hors de `CARTO_TYPES`. */
export function setCartoFavor(map: ExpeditionMap, id: string, favor: CartoType): ExpeditionMap {
  const c = map.pois.find((p) => p.id === id)?.control;
  if (!c || c.kind !== 'cartographer' || c.owner !== 'player') return map;
  if (!(CARTO_TYPES as readonly string[]).includes(favor) || c.favor === favor) return map;
  return withControl(map, id, (p) => ({ ...p, control: { ...p.control!, favor } }));
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
  /** 🧝 Le héros qui RESTE en garnison (étape 6 bis), avec son instantané de combat. */
  hero?: PostedHero,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      owner: 'player',
      // 🧝 Le héros qui reste prend 2 places sur les 5 (`champSeatsWithHero`).
      garrison: garrison.slice(0, champSeatsWithHero(p.control!, !!hero)),
      ...(hero ? { hero: true, heroUnit: hero } : {}),
      since: at,
      collectedAt: at,
      // 🏯 Jamais pendant la trêve d'une citadelle abattue ; 🌫️ plus lent si elle est cachée.
      // 🕊️ Jamais sur une île pacifiée.
      attackAt: islandPacified(map)
        ? undefined
        : Math.max(
            at + retakeCalmMs(id, at, attackSlow(map, p.control!.kind)),
            truceUntilFor(map, p.control!.kind),
          ),
      sorties: restClock(p.control!.sorties, at),
      activity: activeDays7,
      assault: false,
      // 🏅 Repris : il repart des crans qui lui restaient (ceux que l'ennemi n'a pas usés).
      tier: controlTier(p.control, at),
      tierAt: at,
      tierCharge: 0,
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
export function attackerLevel(
  map: Pick<ExpeditionMap, 'seed' | 'archipel'>,
  p: Poi,
  playerLevel: number,
): number {
  const c = p.control;
  return controlLevel(
    `${map.seed}:${p.id}@${c?.attackAt ?? 0}`,
    (c?.retakes ?? 0) + 1,
    playerLevel,
    archipelFloor(map),
  );
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

/** 🧭 Où en est le héros sur la ligne départ → lieu (la base, ou le lieu qu'il a quitté,
 *  `origin`), à l'instant `t` de sa marche vers un poste. */
export function walkPoint(
  p: Pick<Poi, 'x' | 'y'>,
  c: { from: number; at: number; origin?: { x: number; y: number } },
  t: number,
): { x: number; y: number; at: number } {
  const span = c.at - c.from;
  const f = span > 0 ? Math.min(1, Math.max(0, (t - c.from) / span)) : 1;
  const o = c.origin ?? EXPE.town;
  return { x: o.x + (p.x - o.x) * f, y: o.y + (p.y - o.y) * f, at: t };
}

/** 🔙 Le héros en route vers un poste fait demi-tour à `t` : combien de temps (ms) pour
 *  rentrer à la BASE, à son pas de l'aller. Parti de la base, autant qu'il a déjà marché ;
 *  parti d'un autre lieu (`origin`), la distance qui le sépare de la base à ce pas — et non
 *  le chemin déjà fait, qui ne mène pas à la base. */
export function walkHomeMs(
  p: Pick<Poi, 'x' | 'y'>,
  c: { from: number; at: number; origin?: { x: number; y: number } },
  t: number,
): number {
  const walked = Math.max(0, t - c.from);
  if (!c.origin) return walked;
  const span = Math.max(0, c.at - c.from);
  const length = Math.hypot(p.x - c.origin.x, p.y - c.origin.y);
  if (!span || !length) return walked;
  const at = walkPoint(p, c, t);
  return Math.round((span / length) * Math.hypot(at.x - EXPE.town.x, at.y - EXPE.town.y));
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
  // 🧝 Le héros encore EN ROUTE vers ce point fait demi-tour : il rentre à la base depuis là
  // où il est (`walkHomeMs`) (le héros posté, lui, est rappelé par le store).
  const lostPoi = map.pois.find((p) => p.id === id);
  const coming = lostPoi?.control?.heroComing;
  const back =
    lostPoi && coming && coming.at > at
      ? {
          heroReturnAt: Math.max(map.heroReturnAt ?? 0, at + walkHomeMs(lostPoi, coming, at)),
          heroReturnFrom: walkPoint(lostPoi, coming, at),
        }
      : {};
  const lost = withControl(map, id, (p) => {
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
      // 🏅 Perdu : −1 cran tout de suite, puis −1 toutes les 24 h chez l'ennemi.
      tier: Math.max(0, controlTier(p.control, at) - 1),
      tierAt: at,
      // 🏠 Ceux déjà sur le chemin du retour ne sont plus là : le lieu tombe sans eux, ils
      // finissent leur trajet (sinon un milicien en route vers la base disparaîtrait).
      // 🔙 Les renforts encore en route les rejoignent : ils font demi-tour.
      ...(returning.length ? { returning } : {}),
    };
    const level =
      won?.level ?? controlLevel(`${map.seed}:${id}`, retakes, playerLevel, archipelFloor(map));
    return { ...p, level, control: next };
  });
  return { ...lost, ...back };
}

/** 📜 Garde sur le lieu le rapport de sa dernière attaque (repoussée ou non), pour sa fiche.
 *  ⚠️ Une copie ENCAISSÉE : le vrai rapport vit dans la boîte, c'est lui qu'on encaisse — la
 *  copie ne doit jamais pouvoir verser le butin une seconde fois. */
export function withLastAttack(
  map: ExpeditionMap,
  id: string,
  msg: ExpeditionMessage,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: { ...p.control!, lastAttack: { ...msg, claimed: true, read: true } },
  }));
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
    control: {
      ...p.control!,
      // 🏯 Jamais pendant la trêve d'une citadelle abattue ; 🕊️ jamais sur une île pacifiée.
      attackAt: islandPacified(map)
        ? undefined
        : Math.max(
            at + retakeCalmMs(id, at, attackSlow(map, p.control!.kind)),
            truceUntilFor(map, p.control!.kind),
          ),
      sorties: restClock(p.control!.sorties, at),
      activity: activeDays7,
    },
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
  /** 🧱🏹 L'enceinte divise la troupe ennemie (`fortifyMult`, ≥ 1). */
  fort = 1,
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
      { faction: 'bandits', size: ((size * seats) / CONTROL.maxGarrison) * (boost / fort) },
      allies,
      samples,
    );
  return w / CONTROL.sizes.length;
}

/** 🎲 De combien l'ennemi grossit sa troupe face à CETTE garnison : 1 tant qu'elle ne tient
 *  pas plus de `CONTROL.maxHold` (le cas normal), sinon juste assez pour y redescendre.
 *  ⚠️ Un champion faible n'est donc jamais pénalisé ; seul un choix « sans risque » l'est. */
export function retakeBoost(p: Poi, allies: readonly SkirmishUnit[], fort = 1): number {
  const hold = (b: number) => garrisonHoldChance(p, allies, b, CONTROL.holdSamples, fort);
  if (!allies.length || hold(1) <= CONTROL.maxHold) return 1;
  let lo = 1;
  let hi = 2;
  while (hold(hi) > CONTROL.maxHold && hi < 256) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (hold(mid) > CONTROL.maxHold) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 🛡️ Ce que l'écran annonce : la tenue réelle, renfort ennemi compris (donc ≤ `maxHold`).
 *  ⚠️ `fort` REQUIS (`fortifyMult`) : oublié, l'écran annoncerait une tenue sans l'enceinte
 *  alors que la bataille la compte. */
export function garrisonHold(p: Poi, allies: readonly SkirmishUnit[], fort: number): number {
  // 💎 Le lapidaire ne se défend pas (`defendsControl`).
  if (!defendsControl(p.control?.kind)) return 0;
  // 🏅 La troupe grossit aussi avec le cran du point (`retakeForce`) : même règle ici.
  const threat =
    tierThreatMult(tierAtAttack(p.control)) *
    rageMult(
      p.control?.angerSince,
      p.control?.attackAt ?? p.control?.angerSince ?? 0,
      activityOf(p.control),
    );
  return garrisonHoldChance(
    p,
    allies,
    retakeBoost(p, allies, fort) * threat * (p.control?.fortMult ?? 1),
    CONTROL.holdSamples,
    fort,
  );
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
): { present: string[]; late: string[]; hero: PostedHero | null; heroLate: boolean } {
  const present = [...c.garrison];
  const late: string[] = [];
  for (const r of [...(c.reinforcing ?? []), ...extra]) {
    if (attackAt === null || r.at <= attackAt) present.push(r.id);
    else late.push(r.id);
  }
  const hero = heroAtAttack(c, attackAt);
  return { present, late, hero, heroLate: !hero && !!c.heroComing };
}

/** 🧝 Le héros qui DÉFENDRA le point : posté, ou en route et arrivé AU PLUS TARD à l'attaque
 *  (la règle de `settleReinforcements`). ⚠️ Même lecture que la bataille du store : un héros
 *  posté sans instantané (`heroUnit`) n'y combat pas, ni ici. */
export function heroAtAttack(c: ControlState, attackAt: number | null): PostedHero | null {
  if (c.hero) return c.heroUnit ?? null;
  const h = c.heroComing;
  return h && (attackAt === null || h.at <= attackAt) ? h.unit : null;
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
  /** 🧱🏹 `fortifyMult`, REQUIS. */
  fort: number,
  /** 🧝 Le héros qui défendra (`heroAtAttack`), REQUIS : oublié, l'écran annoncerait une
   *  tenue sans lui alors que la bataille le compte. */
  hero: PostedHero | null,
): number {
  const set = new Set(ids);
  const champs = advs.filter((a) => set.has(a.id));
  const allies = controlAllies(p.control?.kind, champs, kit, hero, ids, playerLevel);
  return garrisonHold({ ...p, level: Math.max(1, playerLevel) }, allies, fort);
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
  // 🏅 Un vieux point est plus convoité : sa troupe grossit avec son cran à l'heure de
  // l'attaque (APRÈS le plafond de tenue, cf. `TIER`).
  const threat =
    tierThreatMult(tierAtAttack(p.control)) *
    rageMult(
      p.control?.angerSince,
      p.control?.attackAt ?? p.control?.angerSince ?? 0,
      activityOf(p.control),
    );
  // 🧱 Un fortin tenu sur l'île affaiblit la troupe (après le plafond de tenue, comme le cran).
  const fort = p.control?.fortMult ?? 1;
  return { ...f, size: ((f.size * seats) / CONTROL.maxGarrison) * boost * threat * fort };
}

const shareOf = (n: number) =>
  CONTROL.garrisonShare[Math.min(CONTROL.garrisonShare.length - 1, Math.max(0, n))] ?? 0;

/** 🗼 La réduction de trajet et le bonus de détection d'une tour TENUE à `now` : selon son
 *  effectif (`garrisonShare`) ET son cran (`tierYieldMult`). */
const towerCutOf = (c: ControlState, now: number): number =>
  CONTROL.towerCut * shareOf(controlWorkforce(c)) * tierYieldMult(controlTier(c, now));
const towerDetectOf = (c: ControlState, now: number): number =>
  CONTROL.towerDetect * shareOf(controlWorkforce(c)) * tierYieldMult(controlTier(c, now));

/**
 * ⛏️ Le NIVEAU DE RÉCOMPENSE de la mine d'un lieu fixe, pour un héros de niveau `L` : continu,
 * sans palier (2026-09-30, mesuré ; demandé : « fais au mieux »).
 * ⚠️ AVANT, on passait par `harvestGold` sur une mine fictive portant l'id du lieu : sa
 * « difficulté » venait de GARDES tirés sur cet id — des gardes que le lieu fixe n'a pas.
 * D'où des paliers : aucun gain du niveau 10 au 20 ni du 85 au 100, et un débit qui valait de
 * 25 % à 100 % du filon au niveau du héros, en dents de scie.
 * La courbe reproduit la MÊME magnitude moyenne (le débit n'a pas été mesuré contre le puits
 * d'or : on lisse, on ne le déplace pas) : le niveau du héros jusqu'à 10 (le plancher de début
 * de partie, `EXPE.earlySpawnCapLevel`), puis une montée douce, puis `lateK × L − lateOff`.
 */
const MINE_LEVEL = { earlySlope: 0.2, lateK: 0.85, lateOff: 10 } as const;
export function controlMineLevel(L: number): number {
  const l = Math.max(1, L);
  const cap = EXPE.earlySpawnCapLevel;
  const early = Math.min(l, cap) + Math.max(0, l - cap) * MINE_LEVEL.earlySlope;
  return Math.max(early, MINE_LEVEL.lateK * l - MINE_LEVEL.lateOff);
}

/** ⛏️ L'or produit par heure pour une garnison de `n` champions. */
export function controlGoldPerHour(_p: Pick<Poi, 'id'>, n: number, playerLevel: number): number {
  const haul = mineVeinGold(controlMineLevel(playerLevel));
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
  // 🏝️ La règle de l'île (mine recalée, socle pacifié), absente hors du mode archipel.
  return baseUnitsPerHour(p, n, playerLevel) * (p.control?.yieldMult ?? 1);
}
/** 🏅🏝️ Le multiplicateur de cran AU CRAN D'AUJOURD'HUI, 1 pour un socle pacifié (sans crans). */
function yieldTierMult(c: ControlState, now: number): number {
  return c.flatTier ? 1 : tierYieldMult(controlTier(c, now));
}
function baseUnitsPerHour(p: Poi, n: number, playerLevel: number): number {
  switch (p.control?.kind) {
    case 'mine':
      return controlGoldPerHour(p, n, playerLevel);
    case 'training':
      return n > 0 ? trainingXpPerHour(playerLevel) : 0;
    case 'distillery':
      return shareOf(n) / shareOf(1) / CONTROL.distilleryHoursPerItem;
    case 'lapidary':
      // 💎 Des HEURES de polissage, versées sur la compétence choisie (`applyLapis`). Sans
      // compétence choisie rien n'est versé (`collectControl`), et la choisir remet l'horloge
      // à zéro (`setLapisSkill`).
      return n > 0 ? 1 : 0;
    case 'garden':
      // Un jardinier : un consommable toutes les 12 h, comme avant ; plus de monde, plus vite.
      return shareOf(n) / shareOf(1) / CONTROL.gardenHoursPerItem;
    case 'scriptorium':
      return shareOf(n) / CONTROL.runeHoursPerItem;
    case 'archives':
      // 📖 Une entrée du palier de l'île toutes les 48 h au complet (étape 0 de l'archipel).
      return (labyKeyPriceAt(playerLevel) * shareOf(n)) / CONTROL.archiveHoursPerEntry;
    case 'ossuary':
      // ⚱️ La part de champion d'une ruine du rang du héros (9 × (1 + rang)) toutes les 144 h
      // au complet, comme l'arsenal : 1 sceau / 16 h en Bronze ; elle grossit avec chaque rang.
      return (ruinsChampionSeals(playerLevel) * shareOf(n)) / CONTROL.ossuaryHoursPerRuin;
    case 'arsenal':
      // ⚒️ La part d'objet d'une ruine (9 × (1 + rang)) toutes les 144 h au complet.
      return (
        (RUINS_SEALS.gearPerRank *
          (1 + characterRank(Math.max(1, playerLevel)).rankIndex) *
          shareOf(n)) /
        CONTROL.arsenalHoursPerRuin
      );
    case 'altar':
      // 🪬 Une rune toutes les 48 h au complet.
      return shareOf(n) / CONTROL.altarHoursPerRune;
    case 'lab':
      // ⚗️ La formule de l'autel, deux fois plus lente (runes « à partir du violet »).
      return shareOf(n) / CONTROL.labHoursPerRune;
    case 'circle':
      // 🌀 Une tentative de boss de l'île toutes les 48 h au complet.
      return (bossSummonCost(playerLevel) * shareOf(n)) / CONTROL.circleHoursPerAttempt;
    case 'mana':
      return controlManaPerHour(n, playerLevel);
    default:
      return 0;
  }
}

/**
 * La production en réserve à `now`, dans l'unité du point, NON arrondie : ce qui était
 * mis de côté quand l'effectif a changé (`banked`), plus ce que l'effectif ACTUEL a produit
 * depuis — arrêtée à l'heure de l'attaque. ⚠️ SANS PLAFOND (2026-09-29, demandé : « supprime
 * le plafond de 24 h ») : la production est versée toute seule (`autoCollectControls`), donc
 * une absence ne doit rien coûter — tout ce qui a été produit pendant arrive au retour.
 */
function stockUnits(p: Poi, now: number, playerLevel: number): number {
  const c = p.control;
  if (!c || c.owner !== 'player' || c.collectedAt === undefined) return 0;
  const until = Math.min(now, c.attackAt ?? now);
  const rate = unitsPerHour(p, controlWorkforce(c), playerLevel);
  // 🏅 Chaque heure au cran QU'ELLE avait (`tierHours`).
  return (c.banked ?? 0) + rate * tierHours(c, c.collectedAt, until);
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
const isPerChampKind = (k: ControlKind | undefined): k is 'training' => k === 'training';

/**
 * 🎯 L'XP accumulée par CHAQUE champion au camp à `now`, non arrondie (ses pièces portées
 * en reçoivent `CONTROL.gearXpMult` fois autant à la récolte). Chacun a sa propre réserve (demandé : les
 * champions n'arrivent pas en même temps — une valeur commune donnerait à un renfort arrivé
 * tard l'XP de ceux qui étaient là avant lui) : elle part de ce qu'il avait quand l'effectif
 * a changé (`perXp`) et ne court que tant qu'il est EN GARNISON — un renfort en route
 * n'apprend rien, un champion ramené garde ce qu'il a gagné jusqu'à la récolte. Elle court
 * sans plafond de temps, arrêtée à l'heure de l'attaque. Les miliciens n'apprennent rien.
 */
function champStockBy(p: Poi, now: number, playerLevel: number): Record<string, number> {
  const c = p.control;
  if (!c || !isPerChampKind(c.kind) || c.owner !== 'player' || c.collectedAt === undefined)
    return {};
  const until = Math.min(now, c.attackAt ?? now);
  // 🏅 Chaque heure au cran qu'elle avait (`tierHours`).
  const hours = tierHours(c, c.collectedAt, until);
  const rate = trainingXpPerHour(playerLevel);
  // Lieu d'avant `perXp` : la réserve commune valait pour chaque champion posté.
  const legacy = c.perXp === undefined ? (c.banked ?? 0) : 0;
  const out: Record<string, number> = { ...c.perXp };
  for (const id of c.garrison) {
    if (isMilitiaId(id)) continue;
    const b = out[id] ?? legacy;
    // ⚠️ Sans plafond de temps (2026-09-29) : c'est `trainingRoom` qui borne ce qu'il reçoit.
    out[id] = b + rate * hours;
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

/** 🧱 La part qu'un fortin de `n` sentinelles retire aux reprises (0 sans personne). */
export function fortCutFor(n: number): number {
  return CONTROL.fortCut * shareOf(n);
}

/** 🕯️ Le diviseur de convalescence d'un hospice de `n` soigneurs : `1 + hospiceCut × part`,
 *  la part étant `garrisonShare` RAPPORTÉE à la garnison pleine — 1 sans personne, 2 au complet. */
export function hospiceDivisor(n: number): number {
  return 1 + (CONTROL.hospiceCut * shareOf(n)) / shareOf(PRODUCER_SEATS);
}

/**
 * 🕯️ LE FACTEUR DE L'HOSPICE sur la convalescence d'un CHAMPION blessé sur l'île : 1 hors
 * archipel, sans hospice tenu ou sans soigneur ; ½ avec une garnison pleine (règle : « les
 * champions blessés de l'île guérissent plus vite, jusqu'à 2× »). Il ne produit rien, comme le
 * fortin. ⚠️ SOURCE UNIQUE, lue par le store là où une blessure de champion est POSÉE
 * (`partyClaimRoster` — missions, lieux fixes perdus — et le siège de la base) : il multiplie
 * la DURÉE de soin au moment où elle est fixée. Le HÉROS n'est pas concerné.
 */
export function hospiceHealMult(
  map: Pick<ExpeditionMap, 'archipel' | 'pois'> | null | undefined,
): number {
  if (!map?.archipel) return 1;
  let m = 1;
  for (const p of map.pois)
    if (p.control?.kind === 'hospice' && p.control.owner === 'player')
      m = Math.min(m, 1 / hospiceDivisor(controlWorkforce(p.control)));
  return m;
}

/**
 * 🧱 LE FACTEUR DU FORTIN pour la troupe qui reprend un AUTRE lieu tenu de la carte : 1 sans
 * fortin tenu (ou sans sentinelle). Le fortin ne se couvre pas lui-même : sa propre garnison
 * le défend. ⚠️ SOURCE UNIQUE, posée sur chaque lieu par `ensureIslandConquest` (`fortMult`),
 * puis lue par la reprise réelle (`retakeForce`) ET le pronostic (`garrisonHold`).
 */
export function fortMultOf(pois: readonly Poi[], forId: string): number {
  let m = 1;
  for (const p of pois)
    if (p.id !== forId && p.control?.kind === 'fort' && p.control.owner === 'player')
      m *= 1 - fortCutFor(controlWorkforce(p.control));
  return m;
}

/**
 * 🗼 Le multiplicateur de trajet des TOURS DE GUET tenues : `1 − towerCut × part`. Il
 * MULTIPLIE le trajet déjà réduit par l'Avant-poste (décision de l'utilisateur) — on ne
 * l'ajoute pas à sa réduction, sinon les deux se plafonneraient ensemble.
 */
export function controlTravelMult(map: ExpeditionMap | null | undefined, now: number): number {
  let m = 1;
  for (const p of map?.pois ?? [])
    if (p.control?.kind === 'tower' && p.control.owner === 'player')
      m *= 1 - towerCutOf(p.control, now);
  return m;
}

/**
 * 🗼 Le bonus de DÉTECTION des Tours de guet tenues : `towerDetect × part` de la garnison,
 * additionné entre tours. Il allonge le préavis de la base (`baseLeadMs`), donc le moment où
 * un siège est repéré ET le rayon où les armées deviennent visibles sur la carte.
 */
export function controlDetectBoost(map: ExpeditionMap | null | undefined, now: number): number {
  let b = 0;
  for (const p of map?.pois ?? [])
    if (p.control?.kind === 'tower' && p.control.owner === 'player')
      b += towerDetectOf(p.control, now);
  return b;
}

/** ⛲ Les pierres de mana en réserve à `now`. 0 si non tenu. */
export function controlManaStock(p: Poi, now: number, playerLevel: number): number {
  return p.control?.kind === 'mana' ? Math.floor(stockUnits(p, now, playerLevel) + 1e-9) : 0;
}

/** ⛏️ L'or en réserve à `now`. 0 si non tenu. */
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
  runes: number;
  /** 🪬 Parmi `runes`, celles de l'autel (« à partir du bleu »). */
  blessedRunes: number;
  /** ⚗️ Parmi `runes`, celles du laboratoire (« à partir du violet »). */
  exaltedRunes: number;
  /** 📖 Clés du Labyrinthe (les archives). */
  keys: number;
  /** ⚱️ Pierres d'invocation (l'ossuaire). */
  summon: number;
  /** ⚒️ Sceaux d'objet (l'arsenal). */
  gearSeals: number;
  /** 🗿 Sceaux de champion (l'autel des runes), au rang `champSealRank`. */
  champSeals: number;
  champSealRank: number;
  /** 💎 Les heures de polissage du lapidaire (`applyLapis`). */
  lapis?: LapisGain;
} {
  const p = map.pois.find((x) => x.id === id);
  const none = {
    map,
    gold: 0,
    mana: 0,
    xpBy: {},
    gearXp: {},
    supplies: {},
    runes: 0,
    blessedRunes: 0,
    exaltedRunes: 0,
    keys: 0,
    summon: 0,
    gearSeals: 0,
    champSeals: 0,
    champSealRank: 0,
  };
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
  // 💎 Le lapidaire verse des HEURES, fraction comprise : rien ne s'arrondit ni ne se perd.
  if (c.kind === 'lapidary') {
    const advId = c.garrison.find((g) => !isMilitiaId(g));
    if (units <= 0 || !advId || !c.lapis) return none;
    const until = Math.min(now, c.attackAt ?? now);
    return {
      ...none,
      map: withControl(map, id, (q) => ({
        ...q,
        control: { ...q.control!, collectedAt: until, banked: 0 },
      })),
      lapis: { advId, skill: c.lapis as SkillId, hours: units },
    };
  }
  const whole = Math.floor(units + 1e-9);
  if (whole <= 0) return none;
  const supplies: SupplyStock = {};
  if (c.kind === 'garden' || c.kind === 'distillery') {
    const rng = mulberry32((seedOf(`${id}:${c.collectedAt}`) ^ 0x6a09e667) >>> 0 || 1);
    const pick = c.kind === 'distillery' ? pickBoost : pickSupply;
    for (let i = 0; i < whole; i++) {
      const s = pick(rng());
      supplies[s] = (supplies[s] ?? 0) + 1;
    }
  }
  // 📜 Des runes MULTICOLORES : leur couleur se tire à l'ouverture (`runeBank.openRune`).
  // ⚗️ Le laboratoire en verse aussi — toutes « à partir du violet ».
  const runes = c.kind === 'scriptorium' || c.kind === 'altar' || c.kind === 'lab' ? whole : 0;
  const until = Math.min(now, c.attackAt ?? now);
  return {
    map: withControl(map, id, (q) => ({
      ...q,
      control: {
        ...q.control!,
        collectedAt: until,
        // 🌿⛲⛏️ La fraction entamée reste acquise (une pièce d'or, un consommable, une pierre
        // de mana) : la récolte est AUTOMATIQUE et fréquente (`autoCollectable`), sans ce
        // report chaque passage jetterait une fraction.
        banked: Math.max(0, units - whole),
      },
    })),
    gold: c.kind === 'mine' ? whole : 0,
    mana: c.kind === 'mana' ? whole : 0,
    xpBy: {},
    gearXp: {},
    supplies,
    runes,
    blessedRunes: c.kind === 'altar' ? whole : 0,
    exaltedRunes: c.kind === 'lab' ? whole : 0,
    keys: c.kind === 'archives' ? whole : 0,
    summon: c.kind === 'circle' ? whole : 0,
    gearSeals: c.kind === 'arsenal' ? whole : 0,
    champSeals: c.kind === 'ossuary' ? whole : 0,
    champSealRank: characterRank(Math.max(1, playerLevel)).rankIndex,
  };
}

/**
 * 📊 OÙ EN EST LA RÉCOLTE, en un mot et une jauge (2026-09-28, demandé : « l'avancement de la
 * récolte en bout de ligne — rune le %, or le montant »). `text` = ce qui attend, dans l'unité
 * du point ; `pct` (0..1) = la jauge : rien pour ce qui est versé au fil de l'eau (or, XP), la
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
  if (c.kind === 'lapidary') {
    const sk = c.lapis ? SKILLS[c.lapis as SkillId] : null;
    return {
      text: sk ? `💎 Polit ${sk.emoji} ${sk.name}` : '💎 Choisis la compétence à polir',
      pct: null,
    };
  }
  if (c.kind === 'cartographer') {
    const k = cartoPick([p]);
    return {
      text: k
        ? `🗺️ ${POI_LABEL[k.favor]} : ${Math.round(k.chance * 100)} % des lieux tirés`
        : '🗺️ Choisis le lieu à faire revenir',
      pct: null,
    };
  }
  if (c.kind === 'hospice') {
    return {
      text: `🕯️ convalescence ÷${hospiceDivisor(controlWorkforce(c)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} sur l’île`,
      pct: null,
    };
  }
  if (c.kind === 'fort') {
    return {
      text: `🛡️ −${Math.round(fortCutFor(controlWorkforce(c)) * 100)} % sur les reprises voisines`,
      pct: null,
    };
  }
  if (c.kind === 'tower') {
    const cut = towerCutOf(c, now);
    const det = towerDetectOf(c, now);
    return {
      text: `🧭 −${Math.round(cut * 100)} % trajets · 👁️ +${Math.round(det * 100)} % détection`,
      pct: null,
    };
  }
  // 🎓⛏️⛲ Versé directement (2026-09-29) : on dit le débit, il n'y a plus de jauge.
  // 🏅 Le débit AU CRAN D'AUJOURD'HUI.
  const perH = unitsPerHour(p, controlWorkforce(c), playerLevel) * yieldTierMult(c, now);
  const per = (x: number) => Math.round(x).toLocaleString('fr-FR');
  if (isPerChampKind(c.kind)) return { text: `🎓 +${per(perH)} XP/h`, pct: null };
  if (c.kind === 'mine') return { text: `🪙 +${per(perH)}/h`, pct: null };
  if (c.kind === 'mana') return { text: `💠 +${per(perH * 24)}/j`, pct: null };
  const units = stockUnits(p, now, playerLevel);
  const rate = perH;
  switch (c.kind) {
    case 'distillery':
    case 'garden': {
      const whole = Math.floor(units + 1e-9);
      const next = Math.max(0, units - whole);
      // ⏳ Le temps restant avant le prochain (demandé : « le temps restant en plus du % »),
      // au débit de la garnison actuelle — rien sans jardinier.
      const left = leftFor(1 - next, rate);
      const pct = `${Math.round(next * 100)} %${left ? ` · ${left}` : ''}`;
      const e = c.kind === 'distillery' ? '⚡' : '🎒';
      return { text: whole > 0 ? `${e} ${whole} · ${pct}` : `${e} ${pct}`, pct: next };
    }
    case 'scriptorium': {
      const r = units >= 1 - 1e-9 ? 1 : units;
      const left = r < 1 ? leftFor(1 - r, rate) : null;
      return {
        text: r >= 1 ? '📜 prête' : `📜 ${Math.round(r * 100)} %${left ? ` · ${left}` : ''}`,
        pct: r,
      };
    }
    case 'archives': {
      const next = Math.max(0, units - Math.floor(units + 1e-9));
      const left = leftFor(1 - next, rate);
      return { text: `🗝️ ${Math.round(next * 100)} %${left ? ` · ${left}` : ''}`, pct: next };
    }
    case 'ossuary':
    case 'arsenal':
    case 'circle':
    case 'altar':
    case 'lab': {
      const next = Math.max(0, units - Math.floor(units + 1e-9));
      const left = leftFor(1 - next, rate);
      const e = UNIT_LOOK[c.kind].unit;
      return { text: `${e} ${Math.round(next * 100)} %${left ? ` · ${left}` : ''}`, pct: next };
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
  distillery: ['distillateur', 'distillateurs'],
  fort: ['sentinelle', 'sentinelles'],
  cartographer: ['arpenteur', 'arpenteurs'],
  lapidary: ['lapidaire', 'lapidaires'],
  hospice: ['soigneur', 'soigneurs'],
  lab: ['alchimiste', 'alchimistes'],
  tower: ['guetteur', 'guetteurs'],
  scriptorium: ['copiste', 'copistes'],
  archives: ['archiviste', 'archivistes'],
  ossuary: ['fossoyeur', 'fossoyeurs'],
  arsenal: ['armurier', 'armuriers'],
  circle: ['invocateur', 'invocateurs'],
  altar: ['ritualiste', 'ritualistes'],
  mana: ['gardien', 'gardiens'],
  citadel: ['assaillant', 'assaillants'],
  objective: ['assaillant', 'assaillants'],
  fortress: ['assaillant', 'assaillants'],
};

export function controlYieldCard(
  p: Poi,
  now: number,
  playerLevel: number,
): ControlYieldCard | null {
  const c = p.control;
  // 🏰🏳️ La forteresse et les objectifs ne produisent rien : ils se tiennent.
  if (!c || c.owner !== 'player' || c.kind === 'fortress' || c.kind === 'objective') return null;
  // 🧝 Le héros posté vaut 2 travailleurs — sauf au camp, où chacun n'apprend que pour lui.
  const n = isPerChampKind(c.kind) ? c.garrison.length : controlWorkforce(c);
  const seats = seatsOf(c.kind);
  const [one, many] = WORKER[c.kind];
  const crew = `${n}/${seats} ${seats > 1 ? many : one}`;
  const idle = n > 0 ? null : `Aucun ${one} : la production est arrêtée.`;
  if (c.kind === 'lapidary') {
    const sk = c.lapis ? SKILLS[c.lapis as SkillId] : null;
    return {
      emoji: '💎',
      value: sk ? `${sk.emoji} ${sk.name}` : '—',
      what: sk ? 'polie : un niveau de plus au bout du temps' : 'choisis ci-dessous la compétence',
      pct: null,
      gauge: idle,
      rate: `${crew} · personne ne le défend : intercepte l’armée`,
      ready: false,
      full: false,
    };
  }
  if (c.kind === 'cartographer') {
    const k = cartoPick([p]);
    return {
      emoji: '🗺️',
      value: k ? `${Math.round(k.chance * 100)} %` : '—',
      what: k
        ? `des lieux tirés sur l’île deviennent : ${POI_LABEL[k.favor]}`
        : 'choisis ci-dessous le lieu à faire revenir',
      pct: null,
      gauge: idle,
      rate: crew,
      ready: false,
      full: false,
    };
  }
  if (c.kind === 'hospice') {
    return {
      emoji: '🕯️',
      value: `÷${hospiceDivisor(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`,
      what: 'sur la convalescence des champions blessés de l’île',
      pct: null,
      gauge: idle,
      rate: crew,
      ready: false,
      full: false,
    };
  }
  if (c.kind === 'fort') {
    return {
      emoji: '🛡️',
      value: `−${Math.round(fortCutFor(n) * 100)} %`,
      what: 'de troupe ennemie sur chacun de tes autres lieux de l’île',
      pct: null,
      gauge: idle,
      rate: crew,
      ready: false,
      full: false,
    };
  }
  if (c.kind === 'tower') {
    const cut = towerCutOf(c, now);
    const det = towerDetectOf(c, now);
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
  // 🎓 Plus de réserve (2026-09-29) : l'XP arrive directement aux champions (`AUTO_COLLECT_MS`).
  const tierMult = yieldTierMult(c, now);
  if (isPerChampKind(c.kind)) {
    const perH = trainingXpPerHour(playerLevel) * tierMult;
    return {
      emoji: '🎓',
      value: `+${Math.round(perH).toLocaleString('fr-FR')} XP/h`,
      what: 'par champion, versée directement',
      pct: null,
      gauge: idle,
      rate: `⚒️ +${Math.round(campGearXpPerHour(playerLevel) * tierMult)} XP/h par pièce portée · ${crew}`,
      ready: false,
      full: false,
    };
  }
  const units = stockUnits(p, now, playerLevel);
  const rate = unitsPerHour(p, n, playerLevel) * tierMult;
  switch (c.kind) {
    case 'mine':
    case 'mana': {
      // ⛏️⛲ Plus de réserve (2026-09-29) : versé directement au joueur.
      const mine = c.kind === 'mine';
      return {
        emoji: mine ? '⛏️' : '⛲',
        value: mine
          ? `+${Math.round(rate).toLocaleString('fr-FR')} 🪙/h`
          : `+${Math.round(rate * 24)} 💠/jour`,
        what: mine ? 'd’or, versé directement' : 'pierres de mana, versées directement',
        pct: null,
        gauge: idle,
        rate: crew,
        ready: false,
        full: false,
      };
    }
    case 'distillery':
    case 'garden': {
      const boost = c.kind === 'distillery';
      const whole = Math.floor(units + 1e-9);
      const next = Math.max(0, units - whole);
      const left = leftFor(1 - next, rate);
      // 🧪 Même rythme que le jardin (12 h pour un, `garrisonShare` à plusieurs).
      const every = (gardenHoursFor(n) ?? 0) / tierMult || null;
      const thing = boost ? 'boost' : 'consommable';
      return {
        emoji: boost ? '🧪' : '🌿',
        value: whole > 0 ? `${whole} ${boost ? '⚡' : '🎒'}` : `${Math.round(next * 100)} %`,
        what:
          whole > 0
            ? `${thing}${whole > 1 ? 's' : ''} prêt${whole > 1 ? 's' : ''}`
            : `du prochain ${thing}`,
        pct: next,
        gauge: idle ?? (left ? `Prochain dans ${left}` : null),
        rate: every ? `1 toutes les ${formatDuration(every * 3600_000)} · ${crew}` : crew,
        ready: whole > 0,
        full: false,
      };
    }
    case 'archives': {
      const next = Math.max(0, units - Math.floor(units + 1e-9));
      const left = leftFor(1 - next, rate);
      return {
        emoji: '📖',
        value: `${Math.round(next * 100)} %`,
        what: 'de la prochaine clé du Labyrinthe, versée directement',
        pct: next,
        gauge: idle ?? (left ? `Prochaine clé dans ${left}` : null),
        rate: `${(rate * 24).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} 🗝️/jour · ${crew}`,
        ready: false,
        full: false,
      };
    }
    case 'ossuary':
    case 'arsenal':
    case 'circle':
    case 'altar':
    case 'lab': {
      const next = Math.max(0, units - Math.floor(units + 1e-9));
      const left = leftFor(1 - next, rate);
      const look = UNIT_LOOK[c.kind];
      return {
        emoji: CONTROL_EMO[c.kind],
        value: `${Math.round(next * 100)} %`,
        what: look.what,
        pct: next,
        gauge: idle ?? (left ? `Prochain dans ${left}` : null),
        rate: `${(rate * 24).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${look.unit}/jour · ${crew}`,
        ready: false,
        full: false,
      };
    }
    case 'scriptorium': {
      const r = units >= 1 - 1e-9 ? 1 : units;
      const left = r < 1 ? leftFor(1 - r, rate) : null;
      const every = (runeHoursFor(n) ?? 0) / tierMult || null;
      const best = (runeHoursFor(seats) ?? 0) / tierMult || null;
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
export function bankAt(p: Poi, at: number, playerLevel: number): ControlState {
  // 🏅👥 Le cran aussi : la suite se charge au rythme de la NOUVELLE garnison. ⚠️ Figé APRÈS
  // le calcul de la réserve, qui doit voir les crans passés tels qu'ils étaient.
  const c = rebaseTier(p.control!, at);
  // ⚒️🎯 À la forge et au camp, chacun met de côté SA réserve : le nouveau venu part de zéro.
  if (isPerChampKind(c.kind))
    return { ...c, perXp: champStockBy(p, at, playerLevel), banked: 0, collectedAt: at };
  return { ...c, banked: stockUnits(p, at, playerLevel), collectedAt: at };
}

/** 🏰 Qui occupe un point, garnison ET renforts en route, séparés en champions et miliciens.
 *  Deux limites : la garnison ENTIÈRE ne dépasse pas `MILITIA.perPoint` (5), et les champions
 *  ne dépassent pas les places du point (`seatsOf` : 5, ou 3 au camp et à la forge). */
function occupants(
  c: ControlState,
  /** 🛡️ Compter les miliciens EN ROUTE (oui par défaut). Pour les places de CHAMPION, non :
   *  un milicien en route ne réserve rien — il peut partir vers un lieu plein et fait
   *  demi-tour s'il n'y trouve pas de place (`settleReinforcements`). */
  militiaEnRoute = true,
): { champs: number; militia: number } {
  const ids = [
    ...c.garrison,
    ...(c.reinforcing ?? []).map((r) => r.id).filter((id) => militiaEnRoute || !isMilitiaId(id)),
    ...(c.away ?? []),
  ];
  const militia = ids.filter(isMilitiaId).length;
  return { champs: ids.length - militia + heroSeatsIn(c), militia };
}
/** 🧝 Les places que le héros occupe sur un point : 2 (`MILITIA.heroSeats`) s'il y est posté
 *  ou en route pour y être, 0 sinon. Il compte comme DEUX champions. */
export function heroSeatsIn(c: ControlState | undefined | null): number {
  return c && (c.hero || c.heroComing || c.heroAway) ? MILITIA.heroSeats : 0;
}
/** 🧝 Combien de CHAMPIONS resteront si l'assaut prend ce point, le héros y restant ou non
 *  (`holdSeats` : 0 pour un nid qu'on abat). Il en prend 2 sur les 5. */
export function champSeatsWithHero(c: Pick<ControlState, 'kind' | 'razes'>, hero: boolean): number {
  return Math.max(0, holdSeats(c) - (hero ? MILITIA.heroSeats : 0));
}

/** 🧝 Pourquoi le héros ne peut pas rejoindre la garnison d'un point tenu. SOURCE UNIQUE :
 *  l'écran grise avec cette raison, le store refuse avec elle. */
export type HeroPostBlock = 'notHeld' | 'here' | 'noSeat' | 'full';
export const HERO_POST_BLOCK_LABEL: Record<HeroPostBlock, string> = {
  notHeld: 'ce point n’est pas à toi',
  here: 'le héros y est déjà (ou en route)',
  noSeat: 'ce lieu n’a pas la place pour le héros',
  full: 'il faut 2 places libres pour le héros',
};
export function heroPostBlocker(c: ControlState | undefined | null): HeroPostBlock | null {
  if (!c || c.owner !== 'player') return 'notHeld';
  if (c.hero || c.heroComing || c.heroAway) return 'here';
  if (seatsOf(c.kind) < MILITIA.heroSeats) return 'noSeat';
  if (controlFreeSeats(c) < MILITIA.heroSeats) return 'full';
  return null;
}
/** 🧝 Le héros part rejoindre la garnison d'un point tenu : ses places lui sont réservées
 *  tout de suite, il devient défenseur à `at` (son arrivée). `origin` : il part en ligne
 *  directe d'un autre lieu (sinon de la base). */
export function sendHeroToControl(
  map: ExpeditionMap,
  id: string,
  from: number,
  at: number,
  unit: PostedHero,
  origin?: { x: number; y: number },
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      heroComing: { at, from, unit, ...(origin ? { origin: { x: origin.x, y: origin.y } } : {}) },
    },
  }));
}
/** 🏰 Les places de CHAMPION occupées d'un point : la garnison, les renforts en route et
 *  ceux partis en sortie qui y reviennent (`away`, leur place leur est gardée). */
export function controlSeats(c: ControlState | undefined | null): number {
  return c ? occupants(c).champs : 0;
}
/** 🛡️ Places de milice encore libres (miliciens en route compris). */
function militiaRoom(c: ControlState): number {
  return Math.max(0, militiaSeatsOf(c.kind) - occupants(c).militia);
}
/**
 * 🏰 Places de champion libres pour un renfort (champion OU héros) : celles du point
 * (`seatsOf`). Les miliciens ont LEURS places à part (`militiaSeatsOf`, 2026-10-08) : un
 * champion ne déloge plus personne. Seuls les champions (garnison, renforts, places gardées
 * des sortants) et le héros bornent. 0 si le point n'est pas à nous.
 */
export function controlFreeSeats(c: ControlState | undefined | null): number {
  if (!c || c.owner !== 'player') return 0;
  return Math.max(0, seatsOf(c.kind) - occupants(c, false).champs);
}
/** 🛡️ Ce lieu reçoit-il des miliciens ? Tenu par nous, et pas un objectif, la forteresse ni
 *  la citadelle. ⚠️ Indépendant des places (2026-10-06, demandé : « envoyer des miliciens en
 *  garnison même si le lieu est plein ») : on les envoie AVANT que des champions partent en
 *  sortie ; à l'arrivée, ils s'installent s'il y a de la place, sinon ils font demi-tour. */
export function acceptsMilitia(c: ControlState | undefined | null): boolean {
  return !!c && c.owner === 'player' && !RAZE_KINDS.has(c.kind);
}
/** 🛡️⚔️ Des miliciens peuvent-ils MARCHER vers ce lieu ? Comme `acceptsMilitia`, mais aussi
 *  vers un lieu ENNEMI (2026-10-06, demandé : « pré-envoyer une garnison si une attaque
 *  arrivera entre-temps »). À l'arrivée (`settleReinforcements`) : pris entre-temps, ils
 *  occupent les places libres ; toujours ennemi (ou pris APRÈS leur arrivée), demi-tour vers
 *  la base. Jamais vers un objectif, la forteresse ni la citadelle. */
export function militiaMayHead(c: ControlState | undefined | null): boolean {
  return !!c && !RAZE_KINDS.has(c.kind);
}
/** 🏰 Places libres dans la garnison, TOUT CONFONDU : celles de champion PLUS celles de milice
 *  (deux réserves séparées depuis le 2026-10-08). 0 si le point n'est pas à nous. */
export function garrisonFreeSeats(c: ControlState | undefined | null): number {
  if (!c || c.owner !== 'player') return 0;
  return controlFreeSeats(c) + militiaRoom(c);
}
/** 🛡️ Places libres pour des MILICIENS : les places de milice du point (`militiaSeatsOf`),
 *  miliciens en route compris. Les champions ne les prennent jamais. */
export function militiaFreeSeats(c: ControlState | undefined | null): number {
  if (!c || c.owner !== 'player') return 0;
  // 🛡️ PAS DE MILICIEN DANS LES OBJECTIFS, LA FORTERESSE NI LA CITADELLE (2026-10-04, décision
  // de l'utilisateur : « seulement dans les lieux fixes de production et les bases »). Source
  // unique : renforts, transferts, envoi depuis la base et milice des îles rangées la lisent.
  return militiaRoom(c);
}

/** 🏰 Pourquoi un renfort ne peut pas partir. SOURCE UNIQUE : l'écran grise avec cette
 *  raison, le store refuse avec elle. */
export type ReinforceBlock = 'notHeld' | 'empty' | 'full' | 'heroHere' | 'heroNoSeat' | 'noMilitia';
export function reinforceBlocker(
  c: ControlState | undefined | null,
  count: number,
  /** Des miliciens (leurs places à eux), sinon des champions. */
  militia = false,
): ReinforceBlock | null {
  // 🛡️ Des miliciens partent même vers un lieu plein ou ENNEMI : ils font demi-tour à
  // l'arrivée si le lieu n'a pas de place pour eux (`militiaMayHead`). Les champions, eux,
  // ont besoin d'un lieu tenu et d'une place.
  if (militia && c) {
    if (count <= 0) return 'empty';
    return militiaMayHead(c) ? null : 'noMilitia';
  }
  if (!c || c.owner !== 'player') return 'notHeld';
  if (count <= 0) return 'empty';
  if (count > controlFreeSeats(c)) return 'full';
  return null;
}
export const REINFORCE_BLOCK_LABEL: Record<ReinforceBlock, string> = {
  notHeld: 'ce point n’est pas à toi',
  empty: 'choisis au moins un champion',
  full: 'plus assez de places sur ce point',
  heroHere: 'le héros y est déjà (ou en route)',
  heroNoSeat: 'ce lieu n’a pas la place pour le héros',
  noMilitia: 'ce lieu ne reçoit pas de miliciens',
};

/** 🏠 UN DÉPART DEPUIS LA BASE (2026-09-29, demandé : « la base cliquable pour voir les
 *  effectifs, et les envoyer ailleurs comme depuis les lieux fixes ») : des champions ET des
 *  miliciens vers le même point tenu. ⚠️ Les deux se disputent la garnison de 5 : les
 *  champions prennent leurs places d'abord (celles qui leur sont réservées), les miliciens
 *  ce qui RESTE ensuite — sinon l'écran proposerait un envoi que le second appel du store
 *  refuserait, la moitié du renfort déjà partie. Rend `null` si tout peut partir. */
export function baseSendBlocker(
  c: ControlState | undefined | null,
  champs: number,
  militia: number,
  /** 🧝 Le héros part aussi (2026-10-05) : il prend 2 places de champion (`MILITIA.heroSeats`),
   *  servies AVANT les champions — l'ordre des envois de la page. */
  hero = false,
): ReinforceBlock | null {
  if (!c || c.owner !== 'player') return 'notHeld';
  if (champs <= 0 && militia <= 0 && !hero) return 'empty';
  if (hero) {
    const h = heroPostBlocker(c);
    if (h === 'here') return 'heroHere';
    if (h === 'noSeat') return 'heroNoSeat';
    if (h) return h;
  }
  const seats = champs + (hero ? MILITIA.heroSeats : 0);
  if (seats > 0) {
    const b = reinforceBlocker(c, seats);
    if (b) return b;
  }
  // 🛡️ Les miliciens ne prennent la place de personne : ils partent même si le lieu est plein
  // et font demi-tour à l'arrivée s'il l'est encore (`settleReinforcements`).
  if (militia > 0 && !acceptsMilitia(c)) return 'noMilitia';
  return null;
}

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
    // 🛡️⚔️ Aussi vers un lieu ENNEMI : des miliciens envoyés à l'avance (`militiaMayHead`).
    if (!c) continue;
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
    militiaFreeSeats(origin.control) >= nMil;
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

/**
 * 🔙 UN RETOUR VERS LA BASE REBROUSSE CHEMIN (2026-09-30, signalé : « quand je fais revenir une
 * garnison, je n'ai pas de demi-tour »). Ceux ramenés d'un point et encore en route y
 * retournent, en autant de temps qu'ils ont déjà marché : ils redeviennent des RENFORTS du
 * point, partis de là où ils ont tourné (`turnAt`, donc pas de second demi-tour). Rend la
 * raison d'un refus, ou la carte et l'arrivée de chacun.
 * ⚠️ Seulement vers un point encore À NOUS et qui a la place de TOUS (champions ET miliciens :
 * la garnison de 5) — un demi-tour partiel laisserait deviner qui est reparti. Un retour qui
 * est lui-même un demi-tour (`turnBack`) ne rebrousse pas une seconde fois.
 */
export type ReturnRecallBlock = 'arrived' | 'turned' | 'notHeld' | 'full';
export const RETURN_RECALL_LABEL: Record<ReturnRecallBlock, string> = {
  arrived: 'ils sont déjà rentrés',
  turned: 'ils ont déjà fait demi-tour',
  notHeld: 'ce lieu n’est plus à toi',
  full: 'plus assez de places sur ce lieu',
};
export function recallReturns(
  map: ExpeditionMap,
  pointId: string,
  ids: readonly string[],
  now: number,
): { map: ExpeditionMap; back: { id: string; at: number }[] } | { block: ReturnRecallBlock } {
  const p = map.pois.find((q) => q.id === pointId);
  const c = p?.control;
  const want = new Set(ids);
  const list = (c?.returning ?? []).filter((r) => want.has(r.id) && now < r.at);
  if (!p || !c || !list.length) return { block: 'arrived' };
  if (list.some((r) => r.turnBack !== undefined)) return { block: 'turned' };
  if (c.owner !== 'player') return { block: 'notHeld' };
  // 🛡️ Seuls les CHAMPIONS ont besoin d'une place pour faire demi-tour. Les miliciens
  // repartent même vers un lieu plein (champions, héros) : à l'arrivée, sans place, ils
  // rentrent à pied à la base (`settleReinforcements`) — la règle d'un envoi de milice.
  const nChamps = list.filter((r) => !isMilitiaId(r.id)).length;
  if (nChamps > 0 && controlFreeSeats(c) < nChamps) return { block: 'full' };
  const town = EXPE.town;
  const back = list.map((r) => {
    const from = Math.min(now, r.from);
    const done = now - from;
    const f = Math.min(1, done / Math.max(1, r.at - from));
    return {
      id: r.id,
      from: now,
      at: now + done,
      turnAt: { x: p.x + (town.x - p.x) * f, y: p.y + (town.y - p.y) * f },
    };
  });
  const gone = new Set(back.map((b) => b.id));
  return {
    map: withControl(map, pointId, (q) => {
      const returning = (q.control!.returning ?? []).filter((r) => !gone.has(r.id));
      const ctl = {
        ...q.control!,
        reinforcing: [...(q.control!.reinforcing ?? []), ...back],
      };
      if (returning.length) ctl.returning = returning;
      else delete ctl.returning;
      return { ...q, control: ctl };
    }),
    back: back.map((b) => ({ id: b.id, at: b.at })),
  };
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

/**
 * ⚡ BOOST D'UN TRAJET DE POINT FIXE (2026-09-30, demandé : « les consommables de réduction du
 * temps de trajet depuis les tuiles d'expédition »). Un renfort en route (`reinf`) arrive
 * `gainMs` plus tôt ; un retour vers la base (`return`) rentre `gainMs` plus tôt. On ne touche
 * que les entrées de CE convoi : ses `members`, avec l'échéance `at` qu'il affiche — deux
 * envois vers le même point ne se confondent pas. Le départ (`from`) ne bouge pas : le tracé
 * avance plus vite, comme pour un voyage ordinaire (`boostVoyage`). Même carte si rien ne
 * correspond ou si le gain est nul.
 */
export function boostControlTrip(
  map: ExpeditionMap,
  pointId: string,
  kind: 'reinf' | 'return',
  members: readonly string[],
  at: number,
  gainMs: number,
): ExpeditionMap {
  if (gainMs <= 0) return map;
  const who = new Set(members);
  const hit = (r: { id: string; at: number }) => who.has(r.id) && r.at === at;
  const c = map.pois.find((p) => p.id === pointId)?.control;
  const list = kind === 'reinf' ? c?.reinforcing : c?.returning;
  if (!list?.some(hit)) return map;
  return withControl(map, pointId, (p) => {
    const ctl = { ...p.control! };
    if (kind === 'reinf')
      ctl.reinforcing = (ctl.reinforcing ?? []).map((r) =>
        hit(r) ? { ...r, at: r.at - gainMs } : r,
      );
    else
      ctl.returning = (ctl.returning ?? []).map((r) => (hit(r) ? { ...r, at: r.at - gainMs } : r));
    return { ...p, control: ctl };
  });
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

/** 🏰 Une garnison coupée à ses places, dans l'ordre d'arrivée : les champions aux places du
 *  point (`seatsOf`), les miliciens aux leurs (`militiaSeatsOf`) — deux réserves séparées. */
function capGarrison(kind: ControlKind, ids: readonly string[], heroSeats = 0): string[] {
  // 🧝 Le héros posté occupe déjà 2 places de champion.
  let champs = heroSeats;
  let militia = 0;
  return ids.filter((id) => {
    if (isMilitiaId(id)) {
      if (militia >= militiaSeatsOf(kind)) return false;
      militia++;
      return true;
    }
    if (champs >= seatsOf(kind)) return false;
    champs++;
    return true;
  });
}

/** 🏰 Les renforts ARRIVÉS rejoignent la garnison. ⚠️ Seulement ceux arrivés AVANT la
 *  prochaine attaque : une attaque due se résout d'abord avec la garnison qui était là, un
 *  renfort encore en route ne combat pas. Rend la même carte si rien n'arrive. */
/**
 * 📬 LES MILICIENS RENVOYÉS À LA BASE PAR `settleReinforcements` (revue du 2026-10-08) : un
 * milicien arrivé sur un lieu plein ou encore ennemi repartait sans un mot — on le retrouvait à
 * la base sans savoir pourquoi. Compare la carte avant/après et rend un message par lieu.
 * Rien à encaisser : la boîte le dit, c'est tout.
 */
export function militiaSentBackMessages(
  before: ExpeditionMap,
  after: ExpeditionMap,
): ExpeditionMessage[] {
  const out: ExpeditionMessage[] = [];
  for (const p of after.pois) {
    const c = p.control;
    if (!c?.returning?.length) continue;
    const prev = before.pois.find((q) => q.id === p.id)?.control;
    const was = new Set((prev?.returning ?? []).map((r) => r.id));
    const fresh = c.returning.filter((r) => isMilitiaId(r.id) && !was.has(r.id));
    if (!fresh.length) continue;
    const back = fresh.length;
    const name = CONTROL_KIND_LABEL[c.kind];
    const parts: string[] = [];
    if (back)
      parts.push(
        `${back} milicien${back > 1 ? 's' : ''} arrivé${back > 1 ? 's' : ''} ${
          c.owner === 'player' ? 'sans place libre' : 'sur un lieu encore ennemi'
        } fai${back > 1 ? 'nt' : 't'} demi-tour`,
      );
    const at = Math.min(...fresh.map((r) => r.from));
    out.push({
      id: `milback_${p.id}_${at}`,
      poiType: 'control',
      title: `🛡️ Miliciens renvoyés · ${name}`,
      level: p.level,
      win: true,
      text: `${parts.join(' ; ')} : ${fresh.length > 1 ? 'ils rentrent' : 'il rentre'} à pied à la base.`,
      gold: 0,
      energy: 0,
      key: 0,
      resolvedAt: at,
      read: false,
    });
  }
  return out;
}

export function settleReinforcements(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  /** 🛡️ Le trajet à pied d'un milicien de ce point jusqu'à la base (ms), pour ceux qui
   *  arrivent sans place (demi-tour). Le store passe le vrai (Avant-poste, tour de guet) ; sans lui, le trajet
   *  d'une équipe sans rôle ni accélération. */
  militiaLegMs: (p: Poi) => number = (p) => caravanLegMin(p, [], 0, 1) * 60_000,
): ExpeditionMap {
  let out = map;
  for (const p0 of map.pois) {
    const c0 = p0.control;
    if (!c0 || (!c0.reinforcing?.length && !c0.heroComing)) continue;
    // 🛡️⚔️ UN LIEU TOUJOURS ENNEMI : les miliciens arrivés font demi-tour vers la base.
    // ⚠️ Pas tant qu'un assaut y marche : son issue (tirée, pas encore réglée) décide s'ils
    // trouvent le lieu à nous. Le retour part de LEUR arrivée, donc attendre ne décale rien.
    if (c0.owner !== 'player') {
      if (c0.assault) continue;
      const back = (c0.reinforcing ?? []).filter((r) => r.at <= now);
      if (!back.length) continue;
      const leg = militiaLegMs(p0);
      const gone = new Set(back.map((r) => r.id));
      const rest = (c0.reinforcing ?? []).filter((r) => !gone.has(r.id));
      const c: ControlState = {
        ...c0,
        returning: [
          ...(c0.returning ?? []),
          ...back.map((r) => ({ id: r.id, from: r.at, at: r.at + leg })),
        ],
      };
      if (rest.length) c.reinforcing = rest;
      else delete c.reinforcing;
      out = withControl(out, p0.id, (p) => ({ ...p, control: c }));
      continue;
    }
    const limit = Math.min(now, c0.attackAt ?? now);
    const arrived = (c0.reinforcing ?? []).filter((r) => r.at <= limit).sort((a, b) => a.at - b.at);
    const heroIn = c0.heroComing && c0.heroComing.at <= limit ? c0.heroComing : null;
    if (!arrived.length && !heroIn) continue;
    let p = p0;
    for (const r of arrived) {
      // 🛡️⚔️ Arrivé AVANT la prise (le tick passe après les deux) : le lieu était encore
      // ennemi, il fait demi-tour comme s'il l'avait trouvé tel quel — et la réserve n'est pas
      // arrêtée à un instant d'avant la prise.
      const since = p.control!.since;
      const early = isMilitiaId(r.id) && since !== undefined && r.at < since;
      const c = early ? p.control! : bankAt(p, r.at, playerLevel);
      const hs = heroSeatsIn(c);
      const garrison = [...c.garrison];
      const bumped: string[] = [];
      const next = early ? garrison : capGarrison(c.kind, [...garrison, r.id], hs);
      // Un milicien qui arrive sans place (d'autres miliciens l'ont prise avant lui) rentre à
      // pied : il ne disparaît jamais.
      if (isMilitiaId(r.id) && !next.includes(r.id)) bumped.push(r.id);
      const leg = militiaLegMs(p);
      p = {
        ...p,
        control: {
          ...c,
          garrison: next,
          reinforcing: (c.reinforcing ?? []).filter((x) => x.id !== r.id),
          ...(bumped.length
            ? {
                returning: [
                  ...(c.returning ?? []),
                  ...bumped.map((id) => ({ id, from: r.at, at: r.at + leg })),
                ],
              }
            : {}),
        },
      };
    }
    // 🧝 Le héros arrivé prend sa place de champion (déjà réservée). Il ne déloge personne :
    // les miliciens ont leurs places à part.
    if (heroIn) {
      const { heroComing: _h, ...c } = bankAt(p, heroIn.at, playerLevel);
      void _h;
      p = { ...p, control: { ...c, hero: true, heroUnit: heroIn.unit } };
    }
    const done = p;
    out = withControl(out, p0.id, () => done);
  }
  return out;
}

/**
 * 🏰 « Ramener » la sélection, est-ce RAPPELER TOUTE LA GARNISON (`recallControl`, qui laisse
 * le lieu sans défense et renvoie à la base TOUS les champions postés) ? Seulement si la
 * sélection couvre TOUT LE MONDE : ceux sur le lieu, ceux en route (`turning`), et personne
 * en sortie (`away`, leur place les attend).
 * ⚠️ Signalé (Archives) : ramener le seul milicien présent pendant que 4 champions étaient en
 * route comptait comme « toute la garnison » (ceux en route étaient retranchés du total) — le
 * rappel complet renvoyait alors aussi les champions à la base.
 */
export function recallIsWhole(
  sel: { onPoint: number; turning: number },
  occupants: { total: number; away: number },
): boolean {
  return sel.onPoint > 0 && occupants.away === 0 && sel.onPoint + sel.turning >= occupants.total;
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

/** Réécrit la liste des sortants d'un point : clé ABSENTE quand elle est vide (la carte se
 *  compare par JSON, et un point sans sortie ne doit pas différer d'avant la règle). */
function withAway(p: Poi, away: readonly string[]): Poi {
  const c = { ...p.control! };
  if (away.length) c.away = [...away];
  else delete c.away;
  return { ...p, control: c };
}

/**
 * ⚔️🏰 UNE SORTIE PART D'UN POINT FIXE (2026-09-30, demandé : « leur garder leur slot ») :
 * les champions quittent la garnison — ils ne produisent ni ne défendent plus, ce qui est
 * déjà produit reste en réserve — mais leur PLACE leur reste (`away`). Sans elle, un renfort
 * pouvait la prendre pendant qu'ils étaient dehors, et ils rentraient à pied à la base.
 */
export function sortieLeaves(
  map: ExpeditionMap,
  id: string,
  ids: readonly string[],
  now: number,
  playerLevel: number,
): ExpeditionMap {
  return holdAway(releaseFromControl(map, id, ids, now, playerLevel), id, ids);
}

/** ⚔️🏰 Garde une place à ces sortants sur le point (sans toucher à la garnison). */
export function holdAway(map: ExpeditionMap, id: string, ids: readonly string[]): ExpeditionMap {
  if (!ids.length) return map;
  return withControl(map, id, (p) =>
    withAway(p, [...new Set([...(p.control!.away ?? []), ...ids])]),
  );
}

/** ⚔️🏰 Rend les places gardées de ces sortants (retour, ou départ vers la base). Rend la
 *  MÊME carte si aucun n'en avait une (le store n'écrit pas à vide). */
export function freeAway(map: ExpeditionMap, id: string, ids: readonly string[]): ExpeditionMap {
  const p = map.pois.find((q) => q.id === id);
  const away = p?.control?.away ?? [];
  const gone = new Set(ids);
  if (!away.some((x) => gone.has(x))) return map;
  return withControl(map, id, (q) =>
    withAway(
      q,
      away.filter((x) => !gone.has(x)),
    ),
  );
}

/**
 * ⚔️🏰 Ne garde que les places dont le sortant revient VRAIMENT ici. `stillAway(point, id)`
 * est la vérité du store (un voyage en cours revient sur ce point avec lui) : un blessé
 * renvoyé à la base, un champion posté ailleurs par la mission, un voyage disparu libèrent
 * leur place. Ne fait que RETIRER — une place n'est gardée qu'au départ (`sortieLeaves`).
 * Rend la MÊME carte si rien ne change.
 */
export function pruneAway(
  map: ExpeditionMap,
  stillAway: (pointId: string, advId: string) => boolean,
): ExpeditionMap {
  let out = map;
  for (const p of map.pois) {
    const away = p.control?.away;
    if (!away?.length) continue;
    const keep = away.filter((x) => stillAway(p.id, x));
    if (keep.length !== away.length) out = withControl(out, p.id, (q) => withAway(q, keep));
  }
  return out;
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
/** 🧭 D'où part une troupe : le point fixe posé à `origin` (un voyage ne garde que les
 *  coordonnées de son départ), ou `null` = la base (pas d'`origin`, ou plus de point là). */
export function tripOriginPoi(
  pois: readonly Poi[] | null | undefined,
  origin: { x: number; y: number } | undefined,
): Poi | null {
  if (!origin || !pois) return null;
  return (
    pois.find(
      (p) => !!p.control && Math.abs(p.x - origin.x) < 0.5 && Math.abs(p.y - origin.y) < 0.5,
    ) ?? null
  );
}

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
  /** ⚔️🏰 Partis en sortie, ils reviennent : leur place est gardée (`away`). */
  away: string[];
  /** ⚔️⏳ Ceux de la garnison réservés pour une attaque combinée qui part d'ici : encore là,
   *  mais engagés (dessinés comme en expédition). */
  engaged: string[];
  assault: { ids: string[]; inMs: number } | null;
  /** 🧝 Le héros sur ce point : `posted` (en garnison), `coming` (en route), `away` (en sortie)
   *  ou `engaged` (encore là, réservé par une attaque combinée en attente) — 2 places. */
  hero: 'posted' | 'coming' | 'away' | 'engaged' | null;
  /** Où en est la récolte, pour le bout de ligne (null si le point n'est pas tenu). */
  progress: ControlProgress | null;
}
export function controlRoster(
  map: ExpeditionMap | null | undefined,
  assaults: readonly { poiId: string; midAt: number; ids: readonly string[] }[],
  now: number,
  playerLevel: number,
  /** ⚔️⏳ Les champions réservés par une attaque combinée en attente (`waitingFrom`).
   *  ⚠️ REQUIS : oublier ce paramètre les dessinerait libres. */
  engagedIds: ReadonlySet<string>,
  /** 🧝⏳ Le point d'où le héros attend une attaque combinée (`attackHeroWaitingAt`).
   *  ⚠️ REQUIS, comme `engagedIds` : l'oublier le dessinerait posté (bleu). */
  heroEngagedAt: string | null,
): ControlRosterRow[] {
  if (!map) return [];
  const order = (k: ControlKind) => ALL_CONTROL_KINDS.indexOf(k);
  return (
    map.pois
      // 🏯 La citadelle n'est pas un point à tenir : elle vit sur la carte, pas dans la liste.
      .filter(
        (p): p is Poi & { control: ControlState } => !!p.control && p.control.kind !== 'citadel',
      )
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
            : controlWorkforce(c)
              ? 'held'
              : 'empty';
        return {
          poi: p,
          kind: c.kind,
          status,
          seats: holdSeats(c),
          garrison: held
            ? [...c.garrison, ...(c.reinforcing ?? []).filter((r) => r.at <= now).map((r) => r.id)]
            : [],
          reinforcing: held
            ? (c.reinforcing ?? [])
                .filter((r) => r.at > now)
                .map((r) => ({ id: r.id, inMs: r.at - now }))
            : [],
          away: held ? [...(c.away ?? [])] : [],
          engaged: held ? c.garrison.filter((id) => engagedIds.has(id)) : [],
          assault,
          hero:
            held && c.hero
              ? heroEngagedAt === p.id
                ? 'engaged'
                : 'posted'
              : held && c.heroComing
                ? 'coming'
                : held && c.heroAway
                  ? 'away'
                  : null,
          progress: held ? controlProgress(p, now, playerLevel) : null,
        };
      })
  );
}

/**
 * 🏳️ Un point TENU est NEUTRE (décision de l'utilisateur, 2026-09-28 : « seule la tenue par
 * nous fait que c'est neutre ») : il n'affiche pas de rang et produit au niveau du héros. Le
 * rang n'appartient qu'aux ENNEMIS — ceux qui le défendent, puis ceux qui le reprennent.
 */
export const isHeldControl = (p: Pick<Poi, 'control'>): boolean => p.control?.owner === 'player';
/** 🏳️ La couleur d'un point tenu : ni celle d'un rang, ni l'accent, ni celle d'un trajet
 *  (héros bleu, équipes violet, renforts vert). ⚠️ Même valeur que `--held` (app.scss). */
export const HELD_COLOR = '#ff6fb5';

/**
 * 🏰 PLUS DE RÉSERVE À RÉCOLTER (2026-09-29, demandé : « faire directement une augmentation de
 * l'or du joueur quand la garnison en produit, et pareil pour l'XP, les champions en garnison
 * augmentent directement »). Ce qu'un point tenu produit est VERSÉ tout seul, au fil des
 * passages du cycle de vie de la carte : l'or et le mana au joueur, l'XP aux champions et à
 * leurs pièces, les consommables et les runes au stock. Un passage par minute au plus et par
 * point : l'or n'a pas besoin d'arriver à la seconde, et chaque passage est une écriture.
 * La tour de guet ne produit rien. ⚠️ Hors de l'app, la production court toujours, SANS
 * plafond (2026-09-29), et arrive d'un coup à la prochaine ouverture.
 */
export const AUTO_COLLECT_MS = 60_000;
export function autoCollectable(map: ExpeditionMap | null | undefined, now: number): Poi[] {
  return (map?.pois ?? []).filter((p) => {
    const c = p.control;
    return (
      !!c &&
      c.owner === 'player' &&
      c.kind !== 'tower' &&
      c.collectedAt !== undefined &&
      now - c.collectedAt >= AUTO_COLLECT_MS
    );
  });
}

/** 🌟 Ce qui VIENT de devenir prêt pour l'ascension : un champion (son ★5 plein) ou une pièce
 *  (au ★5 de son rang, avec un rang au-dessus). Comparé AVANT / APRÈS : ce qui l'était déjà
 *  n'est pas annoncé à nouveau. */
export function newAscensions(
  before: readonly Adventurer[],
  after: readonly Adventurer[],
  stockBefore: readonly AdvGear[],
  stockAfter: readonly AdvGear[],
): { champs: Adventurer[]; gear: AdvGear[] } {
  const was = new Set(before.filter(advAscensionReady).map((a) => a.id));
  const gearReady = (g: AdvGear) => advGearAtRankCap(g) && advGearNextRank(g) != null;
  const gearWas = new Set(stockBefore.filter(gearReady).map((g) => g.id));
  return {
    champs: after.filter((a) => advAscensionReady(a) && !was.has(a.id)),
    gear: stockAfter.filter((g) => gearReady(g) && !gearWas.has(g.id)),
  };
}

/** 📬 Le rapport d'un lieu fixe qui a produit un consommable ou une rune. ⚠️ DÉJÀ CRÉDITÉ
 *  (`claimed` absent) : il se lit, il ne se récupère pas. */
export function controlLootMessage(
  p: Poi,
  at: number,
  supplies: SupplyStock,
  runes: number,
  /** 📖 Clés des archives. */
  keys = 0,
  /** ⚱️ Pierres d'invocation de l'ossuaire. */
  summon = 0,
  /** ⚒️ Sceaux d'objet de l'arsenal. */
  gearSeals = 0,
  /** 🗿 Sceaux de champion de l'autel des runes. */
  champSeals = 0,
): ExpeditionMessage | null {
  const nSup = Object.values(supplies).reduce((n, x) => n + (x ?? 0), 0);
  if (!nSup && !runes && !keys && !summon && !gearSeals && !champSeals) return null;
  const kind = p.control?.kind;
  const label = kind ? CONTROL_LABEL[kind] : 'Place forte';
  const what = [
    nSup ? `${nSup} consommable${nSup > 1 ? 's' : ''}` : '',
    runes ? `${runes} rune${runes > 1 ? 's' : ''}` : '',
    keys ? `${keys} clé${keys > 1 ? 's' : ''} du Labyrinthe` : '',
    summon ? `${summon} pierre${summon > 1 ? 's' : ''} d’invocation` : '',
    gearSeals ? `${gearSeals} sceau${gearSeals > 1 ? 'x' : ''} d’objet` : '',
    champSeals ? `${champSeals} sceau${champSeals > 1 ? 'x' : ''} de champion` : '',
  ]
    .filter(Boolean)
    .join(' et ');
  return {
    id: `ctlloot_${p.id}_${at}`,
    title: `${kind ? CONTROL_EMO[kind] : '🏰'} ${label} : ${what}`,
    level: p.level,
    win: true,
    text: runes
      ? `Ta garnison a produit ${what}, rangé${nSup + runes > 1 ? 's' : ''} dans ton stock. Les runes s’ouvrent au Panthéon.`
      : `Ta garnison a produit ${what}, rangé${nSup > 1 ? 's' : ''} dans ton stock.`,
    gold: 0,
    energy: 0,
    key: 0,
    ...(nSup ? { supplies } : {}),
    ...(runes ? { runes } : {}),
    resolvedAt: at,
    read: false,
  };
}

/** 📬 Le rapport « prêt pour l'ascension » (champion ou pièce) né au camp d'entraînement. */
/**
 * 🔔 Le texte de la notification d'un rapport de place forte (2026-09-29, demandé : « pour les
 * notif fais comme celles déjà présentes ») — une ligne `$q.notify`, comme les attaques
 * repoussées ou reprises. Une seule définition : la carte et l'Aventure disent la même chose.
 */
/** ⛏️ Au-delà de cette absence, l'or récolté par un lieu fixe est ANNONCÉ (demandé,
 *  2026-10-04 : « le matin je n'ai pas l'impression d'avoir la récolte de la nuit »). En
 *  dessous, la récolte de chaque minute reste silencieuse — sinon un message par minute. */
export const AWAY_HARVEST_MS = 60 * 60_000;

/**
 * ⛏️ Le rapport de ce qu'un lieu fixe a produit en OR pendant une absence (`since` = sa
 * dernière récolte). `null` sous `AWAY_HARVEST_MS` ou sans or. ⚠️ L'or est DÉJÀ versé :
 * le message ne porte pas `claimed`, il se lit, il ne s'encaisse pas.
 */
export function controlGoldMessage(
  p: Poi,
  at: number,
  gold: number,
  since: number,
): ExpeditionMessage | null {
  const g = Math.floor(gold);
  if (g < 1 || at - since < AWAY_HARVEST_MS) return null;
  const kind = p.control?.kind;
  const label = kind ? CONTROL_LABEL[kind] : 'Place forte';
  const n = g.toLocaleString('fr-FR');
  return {
    id: `ctlgold_${p.id}_${at}`,
    title: `${kind ? CONTROL_EMO[kind] : '🏰'} ${label} : ${n} 🪙 pendant ton absence`,
    level: p.level,
    win: true,
    text: `Ta garnison a produit ${n} 🪙 en ${formatDuration(at - since)}, versés dans ton or.`,
    gold: g,
    energy: 0,
    key: 0,
    resolvedAt: at,
    read: false,
  };
}

export function controlNoticeText(m: ExpeditionMessage): string {
  const title = m.title ?? '🏰 Place forte';
  return m.id.startsWith('ascend_')
    ? `${title} — l’ascension se fait au Panthéon.`
    : `${title} — rapport dans ta boîte 📬`;
}

export function ascensionMessage(
  at: number,
  found: { champs: readonly Adventurer[]; gear: readonly AdvGear[] },
  owners: ReadonlyMap<string, string>,
): ExpeditionMessage | null {
  const lines = [
    ...found.champs.map((a) => `🌟 ${a.name}`),
    ...found.gear.map((g) => `⚒️ ${g.name}${owners.get(g.id) ? ` (${owners.get(g.id)})` : ''}`),
  ];
  if (!lines.length) return null;
  const one = lines.length === 1;
  return {
    id: `ascend_${at}_${[...found.champs.map((a) => a.id), ...found.gear.map((g) => g.id)].join('.')}`,
    title: one ? '🌟 Prêt pour l’ascension' : `🌟 ${lines.length} prêts pour l’ascension`,
    level: 1,
    win: true,
    text: `${lines.join(' · ')} — ${one ? 'il bute' : 'ils butent'} sur le ★5 de ${one ? 'son' : 'leur'} rang : l’ascension se fait au Panthéon.`,
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: at,
    read: false,
  };
}

/**
 * ⚫ LA GARNISON EN POINTS, sous le fort sur la carte (demandé : « voir d'un coup d'œil les
 * garnisons »). Une lettre par place, dans l'ordre de la liste « Places fortes » : `c` champion,
 * `m` milicien, `r` EN ROUTE vers le point — renfort, transfert depuis une autre place forte,
 * champion PARTI EN SORTIE depuis ce point (il attaque ailleurs et y reviendra, `away`), ou
 * équipe d'ASSAUT sur un point ennemi (sa place est déjà prise sans y être, demandé :
 * « voir si un lieu fixe est complet avec les troupes en transfert ou en attaque ») —, `f`
 * libre. Rien pour un point ennemi sans assaut : on ne connaît pas sa garnison. Une CHAÎNE,
 * pour une prop à identité stable (la couche des lieux ne se re-dessine que si elle change).
 */
/**
 * 🧝 OÙ EST LE HÉROS, D'UN COUP D'ŒIL (demandé : « deux ronds reliés pour qu'on voie où est le
 * héros »). Les places du héros (`h` posté, `g` en route) se dessinent comme UNE pastille
 * de deux points reliés : on rend l'indice du premier point de chaque paire.
 */
export function heroDotLinks(dots: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < dots.length; i++) {
    const d = dots[i];
    if ((d === 'h' || d === 'g') && dots[i + 1] === d) {
      out.push(i);
      i += MILITIA.heroSeats - 1;
    }
  }
  return out;
}

export function garrisonDots(row: ControlRosterRow): string {
  // 🏰 La FORTERESSE n'a pas de limite de places (`seats` = Infinity) : on ne dessine que ce
  // qui l'occupe, jamais de place libre. ⚠️ Sans ça `'f'.repeat(Infinity)` levait une erreur
  // qui faisait tomber TOUT le rendu de la carte (signalé : carte noire après la prise).
  const free = (used: number) =>
    Number.isFinite(row.seats) ? 'f'.repeat(Math.max(0, row.seats - used)) : '';
  if (row.poi.control?.owner !== 'player') {
    // ⚔️ Un point ennemi qu'on attaque : nos champions en marche occupent déjà leurs places
    // (au plus celles du point — ceux en trop rentrent après la prise).
    if (!row.assault) return '';
    const go = Math.min(row.assault.ids.length, row.seats);
    return 'r'.repeat(go) + free(go);
  }
  // ⚔️⏳ Un champion réservé pour une attaque combinée est encore là, mais engagé : il se
  // dessine comme en expédition (demandé : « les montrer comme occupés »).
  const engaged = new Set(row.engaged);
  const allChamps = row.garrison.filter((id) => !isMilitiaId(id)).length;
  const mil = row.garrison.length - allChamps;
  const champs = allChamps - row.garrison.filter((id) => engaged.has(id)).length;
  const enRoute = row.reinforcing.length + row.away.length + engaged.size;
  // 🧝 Le héros prend 2 places (`MILITIA.heroSeats`) : 2 points `h` en garnison, 2 points `r`
  // en route (signalé : « le héros prend 2 places mais je vois encore 5 boules »).
  // `g` : le héros EN ROUTE (orange comme une troupe en marche, mais reconnaissable : ses 2
  // points sont reliés, cf. `heroDotLinks`).
  const hero = row.hero ? (row.hero === 'posted' ? 'h' : 'g').repeat(MILITIA.heroSeats) : '';
  const filled = hero + 'c'.repeat(champs) + 'm'.repeat(mil) + 'r'.repeat(enRoute);
  return filled + free(filled.length);
}

/**
 * ⚫⚫ LA GARNISON EN DEUX RANGÉES (demandé, 2026-10-06 : « la première pour le héros et les
 * champions, la seconde pour les miliciens »). Mêmes lettres et MÊME COMPTE de points que
 * `garrisonDots`, répartis : en haut le héros, les champions et ceux en route vers le point
 * (renfort, sortie, réservés pour une attaque combinée) ; en dessous les miliciens, présents puis en route (lettre `n` : une couleur à eux, distincte des champions
 * en route, demandé 2026-10-06). Une rangée vide n'est pas rendue (`''`).
 */
export function garrisonDotRows(row: ControlRosterRow): [string, string] {
  if (row.poi.control?.owner !== 'player') return [garrisonDots(row), ''];
  const engaged = new Set(row.engaged);
  const champsHere = row.garrison.filter((id) => !isMilitiaId(id) && !engaged.has(id)).length;
  const mil = row.garrison.filter(isMilitiaId).length;
  const milComing = row.reinforcing.filter((r) => isMilitiaId(r.id)).length;
  const champComing = row.reinforcing.length - milComing + row.away.length + engaged.size;
  const hero = row.hero ? (row.hero === 'posted' ? 'h' : 'g').repeat(MILITIA.heroSeats) : '';
  const top = hero + 'c'.repeat(champsHere) + 'r'.repeat(champComing);
  // 🚶 Les miliciens en route ont leur lettre (`n`) : une autre couleur que les champions en route.
  const bottom = 'm'.repeat(mil) + 'n'.repeat(milComing);
  // ⚫ DEUX LIGNES PLEINES, LES CASES VIDES EN NOIR (demandé, 2026-10-06 : « deux lignes de 5,
  // un emplacement noir quand personne n'est là ») : la ligne du haut compte les places d'un
  // champion (`row.seats`, 5 sur un lieu de production), celle du bas les places d'un milicien
  // (`garrisonCap`, 5) — aucune là où ils n'entrent pas (objectifs, forteresse, lapidaire).
  // Deux réserves SÉPARÉES depuis le 2026-10-08 (`controlFreeSeats` / `militiaFreeSeats` font
  // foi) : seule la ligne du bas défend. Sans limite (forteresse) : aucune case vide.
  const pad = (s: string, n: number) =>
    Number.isFinite(n) ? s + 'f'.repeat(Math.max(0, n - s.length)) : s;
  const milSeats = militiaSeatsOf(row.kind);
  return [pad(top, row.seats), pad(bottom, milSeats)];
}
