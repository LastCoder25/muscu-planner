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
import {
  advAscensionCap,
  advAscensionReady,
  advBankedLevel,
  advXpToNext,
  type Adventurer,
} from './adventurers';
import { catchUpMult, partyAllies, type EscortKit } from './caravan';
import {
  advGearAtRankCap,
  advGearNextRank,
  grantAdvGearXp,
  wornGear,
  type AdvGear,
} from './advGear';
import { pickTier, placeRuneOdds, type RuneTier } from './skillRunes';
import { characterRank, rankStartLevel } from './characterRank';
import { campWinPct } from './camp';
import { MILITIA, isMilitiaId, militiaUnits } from './militia';
import type { SkirmishUnit } from './skirmish';
import { trialXpBase } from './skirmish';
import { riftClearMana } from './rift';
import { pickSupply, type SupplyStock } from './supplies';
import {
  CAMP_FACTIONS,
  CONTROL_MAX_GARRISON,
  CONTROL_KIND_EMO,
  CONTROL_KIND_LABEL,
  EXPE,
  distNormAt,
  harvestGold,
  revealRadius,
  recentDepartures,
  riftLevelFor,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type ExpeditionMessage,
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
  /** 🗺️ « La carte est une mine de ressources : plus le joueur l'utilise, plus elle le
   *  harcèle » (décision de l'utilisateur, 2026-09-30). Harcèlement plein à ce nombre de
   *  départs sur 7 jours (3 par jour) ; aucun départ → le rythme le plus calme. */
  harassRefDepartures: 21,
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
   *  couleur suit les chances d'un lieu À TON RANG (`placeRuneOdds`, cas `equal`) : tenu, le
   *  point est neutre, son rang caché n'y entre pas. Sa
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

/**
 * 🏅 LES CRANS D'UN POINT FIXE (2026-09-30, décisions de l'utilisateur) : l'ANCIENNETÉ.
 *
 * - Tenu : **+1 cran toutes les 24 h**, jusqu'à `TIER.max` (10).
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
 * dernier changement de camp (`tier`) et son instant (`tierAt`). Un point tenu d'avant la règle
 * (sans `tierAt`) compte depuis sa prise (`since`) : son ancienneté est reconnue.
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

/** 🏅 Le cran d'un point à `at`. */
export function controlTier(c: ControlState | undefined, at: number): number {
  if (!c) return 0;
  const base = Math.max(0, Math.min(TIER.max, c.tier ?? 0));
  const ref = tierRef(c);
  if (ref === undefined) return base;
  const days = Math.floor(Math.max(0, at - ref) / TIER.dayMs);
  return c.owner === 'player' ? Math.min(TIER.max, base + days) : Math.max(0, base - days);
}

/** 🏅 Le multiplicateur de production d'un cran. */
export const tierYieldMult = (tier: number): number => 1 + TIER.yieldPerTier * tier;
/** 🏅 Le multiplicateur de la troupe de reprise d'un cran. */
export const tierThreatMult = (tier: number): number => 1 + TIER.threatPerTier * tier;

/** 🏅 Les HEURES pondérées par le cran entre `from` et `to` : ∫ `tierYieldMult` dt. Le cran
 *  change en route (+1 par jour tenu) : on intègre jour par jour, sinon récolter tard paierait
 *  tout le passé au cran d'aujourd'hui. */
function tierHours(c: ControlState, from: number, to: number): number {
  if (to <= from) return 0;
  const ref = tierRef(c);
  if (ref === undefined) return (tierYieldMult(controlTier(c, from)) * (to - from)) / 3600_000;
  let acc = 0;
  let t = from;
  while (t < to) {
    const tier = controlTier(c, t);
    const k = Math.floor((t - ref) / TIER.dayMs);
    const end = tier >= TIER.max ? to : Math.min(to, ref + (k + 1) * TIER.dayMs);
    acc += tierYieldMult(tier) * (end - t);
    t = end;
  }
  return acc / 3600_000;
}

/** 🏅 Le temps avant le prochain changement de cran (montée si tenu, baisse si ennemi) ;
 *  `null` quand plus rien ne bouge (au plafond, ou à 0 chez l'ennemi). */
export function nextTierInMs(c: ControlState | undefined, now: number): number | null {
  if (!c) return null;
  const tier = controlTier(c, now);
  if (c.owner === 'player' ? tier >= TIER.max : tier <= 0) return null;
  const ref = tierRef(c);
  if (ref === undefined) return null;
  const k = Math.floor(Math.max(0, now - ref) / TIER.dayMs);
  return ref + (k + 1) * TIER.dayMs - now;
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
    const up = next !== null ? ` · prochain cran dans ${formatDuration(next)}` : ' · au maximum';
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
  mana: PRODUCER_SEATS,
  mine: PRODUCER_SEATS,
  training: CONTROL_MAX_GARRISON,
  garden: PRODUCER_SEATS,
  tower: PRODUCER_SEATS,
  // 🏯 La citadelle ne se tient pas : on l'abat, personne n'y reste.
  citadel: 0,
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
  // 🏯 Inutilisé : les citadelles ont leurs propres angles (`CITADEL.sites`).
  citadel: 0,
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
  citadel: 'une trêve de 3 jours sur les points qu’elle attaque',
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
  /** ⚔️ Les raids d'une citadelle DÉCOUVERTE, sur n'importe quel lieu tenu : tous les 4 jours
   *  quand on n'utilise pas la carte, chaque jour quand on l'utilise à fond (± 25 %). Plusieurs
   *  citadelles découvertes = plusieurs raids, qui peuvent tomber en même temps. */
  raidMaxMs: 96 * 3600_000,
  raidMinMs: 24 * 3600_000,
  /** Au plus ce nombre de raids rattrapés d'un coup après une absence (un lieu ne porte de
   *  toute façon qu'une attaque à la fois). */
  raidCatchUp: 8,
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
export const isCitadelFound = (p: Pick<Poi, 'control'> | null | undefined): boolean =>
  isCitadel(p) && p!.control!.discoveredAt !== undefined;

/** 🗺️ Le harcèlement de la carte, de 0 (on n'y va jamais) à 1 (3 départs par jour sur la
 *  semaine) : il règle le rythme des reprises ET des raids de citadelle. */
export function mapHarass(map: Pick<ExpeditionMap, 'departures'>, now: number): number {
  return Math.min(1, recentDepartures(map, now).length / CONTROL.harassRefDepartures);
}

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
export function citadelIndexOf(kind: ControlKind, present: readonly number[]): number | null {
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
export function rageRate(activeDays7: number): number {
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
  CITADEL.sites.forEach((site, i) => {
    const id = citadelIdOf(i);
    if (out.some((p) => p.id === id)) return;
    out = [
      ...out,
      {
        id,
        type: 'control',
        level,
        travelLevel: level,
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
      travelLevel: level,
      control: { ...c, size, ...(found !== undefined ? { discoveredAt: found } : {}) },
    };
  });
  const harass = mapHarass(map, now);
  return citadelRaids(gateAttacks(stampAnger(out), now, harass), now, harass);
}

/** 🌫️ La citadelle du secteur de ce point est-elle encore CACHÉE ? Elle l'attaque quand même,
 *  2× moins souvent (`CITADEL.hiddenSlow`) — on ne peut pas encore l'abattre. Sans
 *  citadelle sur la carte (carte d'avant les citadelles) : non. */
export function attackerHidden(pois: readonly Poi[], kind: ControlKind): boolean {
  const id = citadelIdFor(pois, kind);
  if (!id) return false;
  const cit = pois.find((p) => p.id === id);
  return !!cit && !isCitadelFound(cit);
}

/** ⚔️ Tout point tenu a une attaque prévue. Celui qui n'en a pas (la règle « une citadelle
 *  cachée n'attaque pas », v0.1388, est abandonnée le 2026-09-30) en reçoit une à partir de
 *  maintenant, au rythme du harcèlement (jamais pendant une trêve). N'écrit que ce qui change. */
function gateAttacks(pois: Poi[], now: number, harass: number): Poi[] {
  let out = pois;
  pois.forEach((p, k) => {
    const c = p.control;
    if (!c || c.owner !== 'player' || c.kind === 'citadel' || c.attackAt !== undefined) return;
    const id = citadelIdFor(pois, c.kind);
    const truce = (id && pois.find((q) => q.id === id)?.control?.truceUntil) || 0;
    const hidden = attackerHidden(pois, c.kind);
    const attackAt = Math.max(now + retakeDelayMs(p.id, now, harass, hidden), truce);
    if (out === pois) out = [...pois];
    out[k] = { ...p, control: { ...c, attackAt } };
  });
  return out;
}

/** ⚔️ Le délai jusqu'au prochain raid d'une citadelle découverte. */
export function raidDelayMs(id: string, from: number, harass: number): number {
  const r = mulberry32((seedOf(`${id}:raid:${from}`) ^ 0x5ad1c3e7) >>> 0 || 1)();
  const h = Math.min(1, Math.max(0, harass));
  const { raidMinMs: lo, raidMaxMs: hi } = CITADEL;
  const aim = hi - h * (hi - lo);
  return Math.min(hi, Math.max(lo, aim * (1 + (r * 2 - 1) * CONTROL.retakeJitter)));
}

/** ⚔️ LES RAIDS : chaque citadelle DÉCOUVERTE frappe, à son rythme, un lieu tenu tiré au
 *  hasard n'importe où sur la carte — elle avance son attaque prévue (un lieu ne porte
 *  qu'une attaque à la fois). Pendant sa trêve elle ne raide pas, et un lieu couvert par la
 *  trêve de SA citadelle n'est pas visé (la trêve promet des jours sans reprise).
 *  N'écrit que ce qui change. */
export function citadelRaids(pois: Poi[], now: number, harass: number): Poi[] {
  let out = pois;
  CITADEL_IDS.forEach((cid) => {
    const k = out.findIndex((p) => p.id === cid);
    const cit = k < 0 ? null : out[k]!;
    if (!cit || !isCitadelFound(cit)) return;
    const cc = cit.control!;
    const truce = cc.truceUntil ?? 0;
    let raidAt = cc.raidAt ?? Math.max(now, truce) + raidDelayMs(cid, now, harass);
    let n = 0;
    while (raidAt <= now && n < CITADEL.raidCatchUp) {
      n++;
      if (raidAt >= truce) {
        const targets = out.filter(
          (p) =>
            p.control?.owner === 'player' &&
            p.control.kind !== 'citadel' &&
            p.control.attackAt !== undefined &&
            p.control.attackAt > raidAt &&
            truceUntilFor({ pois: out } as ExpeditionMap, p.control.kind) <= raidAt,
        );
        if (targets.length) {
          const r = mulberry32((seedOf(`${cid}:target:${raidAt}`) ^ 0x1f83d9ab) >>> 0 || 1)();
          const t = targets[Math.floor(r * targets.length)]!;
          const at = raidAt;
          out = out.map((p) =>
            p.id === t.id ? { ...p, control: { ...p.control!, attackAt: at } } : p,
          );
        }
      }
      raidAt = Math.max(raidAt, truce) + raidDelayMs(cid, raidAt, harass);
    }
    // Rattrapage borné : on repart de maintenant.
    if (raidAt <= now) raidAt = now + raidDelayMs(cid, now, harass);
    if (raidAt === cc.raidAt) return;
    out = out.map((p) => (p.id === cid ? { ...p, control: { ...p.control!, raidAt } } : p));
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
  return spotAt(
    map,
    CONTROL_QUARTER[kind],
    EXPE.distMin + CONTROL.distFrac * (revealRadius(1) - EXPE.distMin),
  );
}

/** Un lieu fixe : à `quarter` quarts de tour de l'angle de la mine, à la distance `d`. */
function spotAt(map: ExpeditionMap, quarter: number, d: number): Pick<Poi, 'x' | 'y' | 'distNorm'> {
  const rng = mulberry32((map.seed ^ seedOf('ctl:mine:0')) >>> 0 || 1);
  const ang = rng() * Math.PI * 2 + (quarter * Math.PI) / 2;
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
  outpostLevel: number,
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
    if (!c || c.owner !== 'enemy' || c.kind === 'citadel') return p;
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
  const kept = healed.filter(
    (p) => !p.control || p.control.kind === 'citadel' || CONTROL.kinds.includes(p.control.kind),
  );
  // 🏯 Les citadelles : posées si elles manquent, niveau, place et troupe tenus à jour.
  const all = syncCitadels([...kept, ...add], map, now, playerLevel, outpostLevel);
  const changed = all.length !== map.pois.length || all.some((p, i) => p !== map.pois[i]);
  if (!changed) return map;
  return { ...map, pois: all };
}

/** Délai avant la prochaine attaque (graine : le lieu et l'instant) : visé entre 3 jours (on
 *  n'utilise pas la carte) et 1 jour (harcèlement plein, `mapHarass`), ± `retakeJitter`,
 *  borné à [1 j, 3 j] — le DOUBLE si la citadelle du secteur est cachée (`hiddenSlow`).
 *  ⚠️ `harass` et `hidden` sont REQUIS.
 *  ⚠️ L'instant n'est JAMAIS annoncé au joueur (décision de l'utilisateur) : ni sur la fiche
 *  du point, ni par une notification de préavis — seule l'attaque elle-même se dit. Seule
 *  exception (2026-09-28) : `attackImminent`, qui prévient dans les `CONTROL.imminentMs`
 *  dernières heures, sans jamais donner l'heure. */
export function retakeDelayMs(id: string, from: number, harass: number, hidden: boolean): number {
  const r = mulberry32((seedOf(`${id}:atk:${from}`) ^ 0x2c1b3c6d) >>> 0 || 1)();
  const h = Math.min(1, Math.max(0, harass));
  const slow = hidden ? CITADEL.hiddenSlow : 1;
  const { retakeMinMs: lo, retakeMaxMs: hi, retakeJitter: j } = CONTROL;
  const aim = hi - h * (hi - lo);
  return slow * Math.min(hi, Math.max(lo, aim * (1 + (r * 2 - 1) * j)));
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
      // 🏯 Jamais pendant la trêve d'une citadelle abattue ; 🌫️ plus lent si elle est cachée.
      attackAt: Math.max(
        at + retakeDelayMs(id, at, mapHarass(map, at), attackerHidden(map.pois, p.control!.kind)),
        truceUntilFor(map, p.control!.kind),
      ),
      activity: activeDays7,
      assault: false,
      // 🏅 Repris : il repart des crans qui lui restaient (ceux que l'ennemi n'a pas usés).
      tier: controlTier(p.control, at),
      tierAt: at,
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
      // 🏅 Perdu : −1 cran tout de suite, puis −1 toutes les 24 h chez l'ennemi.
      tier: Math.max(0, controlTier(p.control, at) - 1),
      tierAt: at,
      // 🏠 Ceux déjà sur le chemin du retour ne sont plus là : le lieu tombe sans eux, ils
      // finissent leur trajet (sinon un milicien en route vers la base disparaîtrait).
      // 🔙 Les renforts encore en route les rejoignent : ils font demi-tour.
      ...(returning.length ? { returning } : {}),
    };
    const level = won?.level ?? controlLevel(`${map.seed}:${id}`, retakes, playerLevel);
    return { ...p, level, control: next };
  });
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
      // 🏯 Jamais pendant la trêve d'une citadelle abattue.
      attackAt: Math.max(
        at + retakeDelayMs(id, at, mapHarass(map, at), attackerHidden(map.pois, p.control!.kind)),
        truceUntilFor(map, p.control!.kind),
      ),
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
  // 🏅 La troupe grossit aussi avec le cran du point (`retakeForce`) : même règle ici.
  const threat =
    tierThreatMult(tierAtAttack(p.control)) *
    rageMult(
      p.control?.angerSince,
      p.control?.attackAt ?? p.control?.angerSince ?? 0,
      activityOf(p.control),
    );
  return garrisonHoldChance(p, allies, retakeBoost(p, allies) * threat);
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
  // 🏅 Un vieux point est plus convoité : sa troupe grossit avec son cran à l'heure de
  // l'attaque (APRÈS le plafond de tenue, cf. `TIER`).
  const threat =
    tierThreatMult(tierAtAttack(p.control)) *
    rageMult(
      p.control?.angerSince,
      p.control?.attackAt ?? p.control?.angerSince ?? 0,
      activityOf(p.control),
    );
  return { ...f, size: ((f.size * seats) / CONTROL.maxGarrison) * boost * threat };
}

const shareOf = (n: number) =>
  CONTROL.garrisonShare[Math.min(CONTROL.garrisonShare.length - 1, Math.max(0, n))] ?? 0;

/** 🗼 La réduction de trajet et le bonus de détection d'une tour TENUE à `now` : selon son
 *  effectif (`garrisonShare`) ET son cran (`tierYieldMult`). */
const towerCutOf = (c: ControlState, now: number): number =>
  CONTROL.towerCut * shareOf(c.garrison.length) * tierYieldMult(controlTier(c, now));
const towerDetectOf = (c: ControlState, now: number): number =>
  CONTROL.towerDetect * shareOf(c.garrison.length) * tierYieldMult(controlTier(c, now));

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
 * depuis — arrêtée à l'heure de l'attaque. ⚠️ SANS PLAFOND (2026-09-29, demandé : « supprime
 * le plafond de 24 h ») : la production est versée toute seule (`autoCollectControls`), donc
 * une absence ne doit rien coûter — tout ce qui a été produit pendant arrive au retour.
 */
function stockUnits(p: Poi, now: number, playerLevel: number): number {
  const c = p.control;
  if (!c || c.owner !== 'player' || c.collectedAt === undefined) return 0;
  const until = Math.min(now, c.attackAt ?? now);
  const rate = unitsPerHour(p, c.garrison.length, playerLevel);
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
      const s = pickSupply(rng());
      supplies[s] = (supplies[s] ?? 0) + 1;
    }
  }
  // 📜 La couleur de chaque rune recopiée : les chances d'une rune tombée sur un lieu À TON
  // RANG (`placeRuneOdds`, ton rang des deux côtés — tenu, le point est neutre, son rang caché
  // n'y entre pas). Graine : la CARTE, le point et la dernière
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
  const perH = unitsPerHour(p, c.garrison.length, playerLevel) * tierYieldMult(controlTier(c, now));
  const per = (x: number) => Math.round(x).toLocaleString('fr-FR');
  if (isPerChampKind(c.kind)) return { text: `🎓 +${per(perH)} XP/h`, pct: null };
  if (c.kind === 'mine') return { text: `🪙 +${per(perH)}/h`, pct: null };
  if (c.kind === 'mana') return { text: `💠 +${per(perH * 24)}/j`, pct: null };
  const units = stockUnits(p, now, playerLevel);
  const rate = perH;
  switch (c.kind) {
    case 'garden': {
      const whole = Math.floor(units + 1e-9);
      const next = Math.max(0, units - whole);
      // ⏳ Le temps restant avant le prochain (demandé : « le temps restant en plus du % »),
      // au débit de la garnison actuelle — rien sans jardinier.
      const left = leftFor(1 - next, rate);
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
  citadel: ['assaillant', 'assaillants'],
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
  const idle = n > 0 ? null : `Aucun ${one} : la production est arrêtée.`;
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
  const tierMult = tierYieldMult(controlTier(c, now));
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
    case 'garden': {
      const whole = Math.floor(units + 1e-9);
      const next = Math.max(0, units - whole);
      const left = leftFor(1 - next, rate);
      const every = (gardenHoursFor(n) ?? 0) / tierMult || null;
      return {
        emoji: '🌿',
        value: whole > 0 ? `${whole} 🎒` : `${Math.round(next * 100)} %`,
        what:
          whole > 0
            ? `consommable${whole > 1 ? 's' : ''} prêt${whole > 1 ? 's' : ''}`
            : 'du prochain consommable',
        pct: next,
        gauge: idle ?? (left ? `Prochain dans ${left}` : null),
        rate: every ? `1 toutes les ${formatDuration(every * 3600_000)} · ${crew}` : crew,
        ready: whole > 0,
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
  const ids = [...c.garrison, ...(c.reinforcing ?? []).map((r) => r.id), ...(c.away ?? [])];
  const militia = ids.filter(isMilitiaId).length;
  return { champs: ids.length - militia, militia };
}
/** 🏰 Les places de CHAMPION occupées d'un point : la garnison, les renforts en route et
 *  ceux partis en sortie qui y reviennent (`away`, leur place leur est gardée). */
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
): ReinforceBlock | null {
  if (!c || c.owner !== 'player') return 'notHeld';
  if (champs <= 0 && militia <= 0) return 'empty';
  if (champs > 0) {
    const b = reinforceBlocker(c, champs);
    if (b) return b;
  }
  if (militia > 0 && militia > militiaFreeSeats(c) - Math.max(0, champs)) return 'full';
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
  assault: { ids: string[]; inMs: number } | null;
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
          away: held ? [...(c.away ?? [])] : [],
          assault,
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
/** 🏳️ La couleur d'un point tenu : ni celle d'un rang, ni l'accent. */
export const HELD_COLOR = '#9a8f7e';

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
  runes: readonly RuneTier[],
): ExpeditionMessage | null {
  const nSup = Object.values(supplies).reduce((n, x) => n + (x ?? 0), 0);
  if (!nSup && !runes.length) return null;
  const kind = p.control?.kind;
  const label = kind ? CONTROL_LABEL[kind] : 'Place forte';
  const what = [
    nSup ? `${nSup} consommable${nSup > 1 ? 's' : ''}` : '',
    runes.length ? `${runes.length} rune${runes.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' et ');
  return {
    id: `ctlloot_${p.id}_${at}`,
    title: `${kind ? CONTROL_EMO[kind] : '🏰'} ${label} : ${what}`,
    level: p.level,
    win: true,
    text: runes.length
      ? `Ta garnison a produit ${what}, rangé${nSup + runes.length > 1 ? 's' : ''} dans ton stock. Les runes se posent depuis la fiche d’un champion.`
      : `Ta garnison a produit ${what}, rangé${nSup > 1 ? 's' : ''} dans ton stock.`,
    gold: 0,
    energy: 0,
    key: 0,
    ...(nSup ? { supplies } : {}),
    ...(runes.length ? { runes: [...runes] } : {}),
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
 * `m` milicien, `r` renfort en route (sa place est déjà prise), `f` libre. Rien pour un point
 * ennemi : on ne connaît pas sa garnison. Une CHAÎNE, pour une prop à identité stable
 * (la couche des lieux ne se re-dessine que si elle change).
 */
export function garrisonDots(row: ControlRosterRow): string {
  if (row.poi.control?.owner !== 'player') return '';
  const champs = row.garrison.filter((id) => !isMilitiaId(id)).length;
  const mil = row.garrison.length - champs;
  const filled = 'c'.repeat(champs) + 'm'.repeat(mil) + 'r'.repeat(row.reinforcing.length);
  return filled + 'f'.repeat(Math.max(0, row.seats - filled.length));
}
