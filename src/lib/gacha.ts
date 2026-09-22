/**
 * 🎰 GACHA DE CHAMPIONS — étape 1 : les TAUX et le PITY.
 *
 * ⚠️ **PAS ENCORE BRANCHÉ** : aucun écran ne lit ce module, aucun champion n'existe, et
 * rien n'a changé pour le joueur. Même découpage que `siegeBattle.ts` (v0.754), les camps
 * et les failles : la lib d'abord, pure et mesurée, le câblage ensuite.
 * Cf. `docs/superpowers/specs/2026-09-19-gacha-design.md`.
 *
 * ## Pourquoi CETTE brique en premier
 *
 * La spec pose les taux et le pity comme « à calibrer **une fois connu le débit de pierres
 * de mana** » — donc après les failles. Ce débit est mesuré depuis la v0.936 (**63 · 91 ·
 * 157 · 240 💠/jour** aux niveaux 12 · 30 · 60 · 100, en fermant une faille par jour), et
 * c'est lui qui fixe le **prix d'un tirage**. Écrire les 32 champions avant aurait été
 * écrire 32 kits sans savoir à quelle fréquence on les voit.
 *
 * ## ⚠️ CE QUI N'EST PAS ICI, ET POURQUOI
 *
 * - **Le roster** (32 champions) : c'est de l'écriture de contenu, pas de la calibration.
 * - **CE QU'UN CHAMPION VAUT** — budget, stats, Éveil — vit dans `adventurers.ts`, à côté
 *   de `STRATUM_BUDGET` et d'`advStats`, dont c'est le pendant exact. ⚠️ Ça y vit pour une
 *   raison de fond autant que de voisinage : `advStats` doit pouvoir rendre les stats d'un
 *   champion, et `adventurers.ts` ne peut pas importer ce module sans créer un **cycle**.
 * - **Le rang et l'équipement** : ils réutilisent l'existant (`characterRank`,
 *   `canWearAdvGear`) et ne se calibrent pas ici.
 *
 * Ce module ne répond qu'à une question : **à quel rythme voit-on quoi ?**
 */

import { championsOf, PULL_GRADES, type Champion, type PullGrade } from '@/data/champions';
import { awakenOverflow, type Adventurer } from './adventurers';

export const GACHA = {
  /**
   * 💠 Prix d'un tirage, en pierres de mana.
   *
   * ⚠️ **DÉRIVÉ DU DÉBIT MESURÉ, pas choisi.** Le débit des failles (v0.936 : 63 · 91 · 157
   * · 240 💠/jour aux niveaux 12 · 30 · 60 · 100) fixe ce prix, et le prix fixe le rythme
   * du gacha. Mesuré à 110, raretés MAXIMALES par an : **10,3 · 12,2 · 16,6 · 21,9** — la
   * bande « 10 à 20 » que la spec vise, tenue sur toute la plage réaliste.
   *
   * ⚠️ Balayé : 55 → 14-37/an · 75 → 12-29 · 90 → 11-25 · **110 → 10-22**. Le déplacer
   * sans re-mesurer `riftManaDebit.test` romprait le lien failles → mana → tirage, qui EST
   * la boucle.
   *
   * ✅ **Et il se lit sans notice** : fermer une faille mûre rend 1,1 tirage au niveau 12,
   * 2,3 au niveau 30, 6,9 au niveau 100 — « une faille, un tirage ou deux ».
   *
   * ⚠️ **PRIX FIXE, jamais indexé sur le niveau** : c'est le débit qui monte (×3,8 du
   * niveau 12 au 100), et c'est voulu — un prix qui le suivrait annulerait la progression.
   * Et surtout **aucune remise de bâtiment** : c'est exactement la remise de l'Autel des
   * boss, retirée en v0.799 parce qu'elle coupait le lien farm → boss.
   */
  pullCost: 110,

  /**
   * 🎰 LE LOT DE 10 — « un peu moins cher, comme dans les gacha » (demandé).
   *
   * ⚠️ **9 PAYÉS POUR 10**, et le chiffre est MESURÉ, pas choisi. La spec (v0.937) vise
   * **10 à 20 raretés maximales par an** sur la plage réaliste (niveaux 12 à 60). Or
   * **le lot devient le mode NORMAL** dès qu'on peut se le payer : la remise s'applique
   * donc à presque tous les tirages, et elle déplace le débit d'autant. Balayé sur un
   * an simulé (40 graines × 4 niveaux) — raretés maximales au niveau 60 : **0 % → 17,9
   * · 5 % → 19,0 · 10 % → 19,9 · 15 % → 20,9 · 20 % → 22,3**. **À 15 % on SORT de la
   * bande** ; 10 % la tient, de justesse. Le déplacer sans re-mesurer romprait le lien
   * failles → mana → tirage.
   *
   * ⚠️ **CE N'EST PAS LA REMISE INTERDITE.** CLAUDE.md proscrit toute **remise de
   * BÂTIMENT** sur `pullCost` (c'est celle de l'Autel des boss, retirée en v0.799) :
   * elle dépend d'un second système qu'on fait monter en parallèle, donc elle coupe le
   * lien entre le farm et le tirage. Une remise de LOT est fixe, ne dépend de rien, et
   * ne fait que translater le rythme d'un facteur connu.
   *
   * ✅ **ET LE LOT A DÉJÀ UNE VALEUR SANS ELLE** : le plancher tombant tous les 10, un
   * lot de 10 contient **au moins un épique+ par construction**. La remise ajoute une
   * raison de grouper, elle n'en crée pas la seule.
   */
  multiCount: 10,
  multiPaid: 9,

  /** Un tirage OFFERT par jour — il a déjà son emplacement (`claimDailyLogin`, avec sa
   *  série et son jour de grâce). ⚠️ C'est le filet du joueur qui ne combat pas : sans lui,
   *  celui qui n'a pas l'énergie d'entrer dans une faille ne tire jamais. */
  freePullsPerDay: 1,

  /** Le tirage au-delà duquel la rareté maximale est GARANTIE. Norme du genre (90). */
  hardPity: 90,

  /** Le tirage à partir duquel le taux de la rareté maximale MONTE. ⚠️ Sans ce « soft
   *  pity », l'essentiel des tirages hauts tomberait pile au hard pity et la loterie
   *  n'existerait plus — on compterait juste jusqu'à 90. */
  softPityStart: 75,

  /** Un A (ou mieux) garanti tous les N tirages. ⚠️ Ce n'est pas du confort — sans lui,
   *  une série de 30 B d'affilée est banale, et c'est ce qui fait décrocher un joueur qui
   *  n'a pas d'argent réel pour compenser. */
  minorPity: 10,
} as const;

/**
 * Taux de BASE par lettre, avant tout pity (refonte 2026-09-21 : ceux du genre).
 * ⚠️ **Ils somment à 1** (testé) : une table qui ne somme pas laisse un reliquat que le
 * tirage attribuerait silencieusement à la dernière entrée.
 *
 * Mesuré en P0 (200 joueurs × 1 an) avec le pity et le plancher : **taux S effectif 1,56 %**,
 * celui de Genshin (~1,6 %).
 */
export const GACHA_RATES: Record<PullGrade, number> = {
  S: 0.006,
  A: 0.051,
  B: 0.943,
};

/** La lettre du sommet — celle que le grand pity garantit. */
export const TOP_GRADE: PullGrade = 'S';
/** La lettre garantie tous les `minorPity` tirages (ou mieux). */
export const FLOOR_GRADE: PullGrade = 'A';

/** Ce que le tirage doit retenir entre deux pulls. ⚠️ DEUX compteurs, pas un : le pity
 *  majeur (S) et le mineur (A) se remplissent et se vident indépendamment — un seul
 *  compteur ferait remettre le grand pity à zéro chaque fois qu'on décroche un A. */
export interface PityState {
  /** Tirages depuis le dernier S. */
  sinceTop: number;
  /** Tirages depuis le dernier A ou mieux. */
  sinceFloor: number;
}

export const emptyPity = (): PityState => ({ sinceTop: 0, sinceFloor: 0 });

/** Ce que la LIGNE du joueur retient du tirage (migr. 0081) : le pity, plus un compteur
 *  d'affichage. ⚠️ La collection n'est pas ici — un champion EST un `Adventurer`. */
export interface GachaState extends PityState {
  /** Total tiré, affichage seul. */
  pulls: number;
  /** Version du gacha. `2` = refonte S/A/B (2026-09-21). Absent = ancien système, que le
   *  store remplace UNE fois (reset des champions + compensation). */
  v?: number;
  /** 🎟️ Tickets de bienvenue du Panthéon déjà versés ? La MARQUE qui rend le versement
   *  unique — à la pose comme au rattrapage des comptes qui l'avaient déjà bâti. */
  welcomed?: boolean;
}

/** 🎰 Version courante du gacha — celle que `settleGachaReset` pose après le reset. */
export const GACHA_VERSION = 2;

/**
 * Taux du S à ce tirage, pity compris.
 *
 * ⚠️ La rampe est **linéaire de `softPityStart` à `hardPity`**, et elle atteint 1 pile au
 * hard pity : le garanti n'est donc pas un cas particulier greffé à côté de la courbe, il
 * en est le bout. Une rampe qui n'y arriverait pas laisserait un saut visible.
 */
export function topRate(sinceTop: number): number {
  const n = Math.max(0, sinceTop) + 1; // le tirage qu'on est en train de faire
  const base = GACHA_RATES[TOP_GRADE];
  if (n <= GACHA.softPityStart) return base;
  // ⚠️ IL N'Y A PAS DE BRANCHE « HARD PITY » À CÔTÉ DE LA RAMPE, et c'est délibéré : la
  // rampe vaut EXACTEMENT 1 au tirage `hardPity`, donc un `if (n >= hardPity) return 1`
  // ne pourrait JAMAIS mordre. Le `Math.min` ci-dessous est un CLAMP d'arrondi.
  const t = (n - GACHA.softPityStart) / (GACHA.hardPity - GACHA.softPityStart);
  return Math.min(1, base + (1 - base) * t);
}

/**
 * 🎰 UN TIRAGE : la lettre obtenue et l'état de pity qui en découle.
 *
 * ⚠️ **PUR ET SANS EFFET DE BORD** : il ne mute pas l'état reçu, il en rend un neuf.
 *
 * Ordre des règles, et il compte :
 * 1. le S, au taux du moment (pity compris) — il prime sur tout, **y compris le 10ᵉ
 *    tirage** : la garantie dit « A OU MIEUX », et le « mieux » ne vaut que le taux du S
 *    à cet instant (comme dans le genre). ⚠️ L'ancien plancher re-tirait dans toute la
 *    tranche haute et la dépassait 45 fois sur 100 : c'est ce qui épuisait la collection.
 * 2. le plancher (`minorPity`) : A garanti ;
 * 3. le tirage ordinaire : A au taux de base, B sinon.
 */
export function pullGrade(
  rng: () => number,
  pity: PityState,
): { grade: PullGrade; pity: PityState } {
  const r = rng();
  const top = topRate(pity.sinceTop);
  let grade: PullGrade;
  if (r < top) grade = 'S';
  else if (pity.sinceFloor + 1 >= GACHA.minorPity) grade = 'A';
  else if (r < top + GACHA_RATES.A) grade = 'A';
  else grade = 'B';
  return {
    grade,
    pity: {
      sinceTop: grade === 'S' ? 0 : pity.sinceTop + 1,
      sinceFloor: grade === 'B' ? pity.sinceFloor + 1 : 0,
    },
  };
}

/**
 * 📊 CE QUE L'ÉCRAN DOIT DIRE DES CHANCES (v0.966) — les taux s'affichent, c'est l'usage
 * du genre et une obligation légale dans plusieurs pays.
 */
export interface GachaOdds {
  /** Les taux de base, du plus bas au plus haut. */
  rates: { grade: PullGrade; pct: number }[];
  /** Un tirage sur N est garanti A ou mieux. */
  floorEvery: number;
  /** Tirages restants avant le prochain A garanti (1 = le prochain). */
  nextFloorIn: number;
  /** Chance actuelle du S, pity compris. */
  topPct: number;
  /** Tirages restants avant le S garanti. */
  nextTopIn: number;
}

export function gachaOdds(pity: PityState): GachaOdds {
  return {
    rates: PULL_GRADES.map((g) => ({ grade: g, pct: GACHA_RATES[g] * 100 })),
    floorEvery: GACHA.minorPity,
    nextFloorIn: Math.max(1, GACHA.minorPity - pity.sinceFloor),
    topPct: topRate(pity.sinceTop) * 100,
    nextTopIn: Math.max(1, GACHA.hardPity - pity.sinceTop),
  };
}

/** 💠 Ce qu'un tirage OFFERT vaut en mana. ⚠️ Dérivé du prix, jamais un second nombre :
 *  le jour où `pullCost` bouge, le filet suit. Versé par le bonus de connexion, qui a déjà
 *  sa série et son jour de grâce — c'est le filet du joueur qui ne combat pas : sans lui,
 *  celui qui n'a pas l'énergie d'entrer dans une faille ne tire jamais. */
export function dailyFreeMana(): number {
  return GACHA.freePullsPerDay * GACHA.pullCost;
}

/** Combien de tirages un débit de mana offre par jour, tirage gratuit compris. */
export function pullsPerDay(manaPerDay: number): number {
  return Math.max(0, manaPerDay) / GACHA.pullCost + GACHA.freePullsPerDay;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎰 TIRER
// ─────────────────────────────────────────────────────────────────────────────

/** Prix d'un lot. ⚠️ DÉRIVÉ du prix unitaire : un second nombre écrit à la main
 *  divergerait au premier réglage.
 *  ⚠️ `unit` est INJECTABLE **pour que ce soit vérifiable** : au prix d'aujourd'hui
 *  (110 × 9) « dérivé » et « 990 en dur » rendent la même chose, donc aucun test ne
 *  peut les distinguer — la mutation SURVIVAIT. Le test passe un autre prix. */
export const multiPullCost = (unit: number = GACHA.pullCost): number => unit * GACHA.multiPaid;

/** Un tirage : sa lettre, et le champion s'il y en a un. */
export interface PullResult {
  grade: PullGrade;
  /** `null` = une PIÈCE d'équipement (tirée par le store, qui connaît le vivier) : c'est
   *  TOUJOURS un B. Un S ou un A est TOUJOURS un champion. La LETTRE de la pièce, elle, se
   *  tire à part (`rollGearGrade`) : les pièces A et S sortent des tirages B. */
  champion: Champion | null;
}

/**
 * 🎰 UN TIRAGE COMPLET : une lettre, puis le champion DANS la lettre (un B = une pièce).
 *
 * ⚠️ **UNIFORME DANS LA LETTRE**, et c'est ce qui fait la vitesse de l'Éveil : un champion
 * PRÉCIS tombe à 1/N du taux « champion » de sa lettre.
 */
export function pullChampion(rng: () => number, pity: PityState): PullResult & { pity: PityState } {
  const r = pullGrade(rng, pity);
  if (r.grade === 'B') return { grade: 'B', champion: null, pity: r.pity };
  const pool = championsOf(r.grade);
  // ⚠️ INATTEIGNABLE tant que le roster a des S et des A (`champions.test.ts`) : une ceinture
  // pour le jour où quelqu'un vide une lettre, pas une règle de jeu.
  if (!pool.length) throw new Error(`Aucun champion de lettre ${r.grade}`);
  return { grade: r.grade, champion: pool[Math.floor(rng() * pool.length)]!, pity: r.pity };
}

/**
 * 🗡️ LA LETTRE D'UNE PIÈCE tirée par un B — décision de l'utilisateur (2026-09-21 : « les
 * pièces A et S d'item sont sur les pièces B d'items »). Un tirage A ou S reste TOUJOURS un
 * champion ; c'est la pièce d'un B qui peut briller.
 * ⚠️ Aux taux de BASE (`GACHA_RATES` : ~94 % B, ~5 % A, ~0,6 % S), SANS pity : le pity est
 * celui des CHAMPIONS, il ne doit pas être entamé ni avancé par l'équipement.
 */
export function rollGearGrade(rng: () => number): PullGrade {
  const r = rng();
  if (r < GACHA_RATES.S) return 'S';
  if (r < GACHA_RATES.S + GACHA_RATES.A) return 'A';
  return 'B';
}

/**
 * 🎰 UN LOT DE TIRAGES, avec le pity qui S'ENCHAÎNE d'un tirage au suivant.
 *
 * ⚠️ **C'est la MÊME fonction que le tirage à l'unité**, appelée n fois — pas un second
 * chemin : un lot qui aurait sa propre loterie finirait par mentir à la notice des chances.
 */
export function pullMany(
  rng: () => number,
  pity: PityState,
  count: number,
): { results: PullResult[]; pity: PityState } {
  let p = pity;
  const results: PullResult[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const r = pullChampion(rng, p);
    p = r.pity;
    results.push({ grade: r.grade, champion: r.champion });
  }
  return { results, pity: p };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏅 CE QU'UN TIRAGE AJOUTE AU VIVIER
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qu'une copie DE TROP rend, quand l'Éveil est au bout. ⚠️ La moitié du prix d'un
 *  tirage : assez pour que « un tirage n'est jamais perdu » soit vrai, jamais assez pour
 *  qu'on y gagne — sinon farmer le même commun deviendrait une source de mana. */
export const OVERFLOW_MANA = Math.round(GACHA.pullCost / 2);

export interface Granted {
  advs: Adventurer[];
  /** Combien d'exemplaires on possède APRÈS ce tirage. */
  copies: number;
  /** Déjà possédé ? (donc un cran d'Éveil, ou une conversion) */
  duplicate: boolean;
  /** 💠 rendus quand la copie ne réveille plus rien. */
  manaBack: number;
}

/**
 * 🏅 AJOUTE UN CHAMPION TIRÉ AU VIVIER — ou le RÉVEILLE s'il est déjà là.
 *
 * ⚠️ **UN CHAMPION EST UN `Adventurer`**, pas une entité de plus : c'est la décision de la
 * v0.942, et c'est elle qui fait que les convois, les camps, la défense, l'équipement et
 * les compagnons le voient **sans une ligne de câblage**.
 *
 * ⚠️ **LA COPIE DE TROP N'EST PAS COMPTÉE.** La retenir gonflerait `copies` sans rien
 * donner, et l'écran annoncerait « 9 exemplaires » pour un Éveil bloqué à 6 — un compteur
 * qui monte sans que rien ne bouge se lit comme une panne. Elle se convertit en mana.
 *
 * ⚠️ **AUCUN BANC : un champion tiré est utilisable tout de suite.** Le plafond du
 * Panthéon (`engageCap`) borne désormais l'ENGAGEMENT — combien partent ensemble, combien
 * tiennent le rempart — pas la personne. Un tirage ne peut donc plus être mort-né, ce qui
 * était l'inverse de ce qu'un gacha promet.
 */
export function grantChampion(
  advs: Adventurer[],
  champ: Champion,
  opts: { id: string; seed?: number },
): Granted {
  const i = advs.findIndex((a) => a.championId === champ.id);
  if (i >= 0) {
    const prev = advs[i]!;
    const avant = Math.max(1, Math.floor(prev.copies ?? 1));
    const trop = awakenOverflow(avant + 1);
    const copies = trop ? avant : avant + 1;
    return {
      advs: advs.map((a, j) => (j === i ? { ...a, copies } : a)),
      copies,
      duplicate: true,
      manaBack: trop ? OVERFLOW_MANA : 0,
    };
  }
  const neuf: Adventurer = {
    id: opts.id,
    name: champ.name,
    // ⚠️ La graine ne sert qu'aux offres de classe, qu'un champion n'a pas — mais le type
    // l'exige, et la dériver de son id vaut mieux qu'un zéro qui ferait croire à un oubli.
    seed: opts.seed ?? [...champ.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
    path: [], // un champion a une IDENTITÉ, pas un chemin (v0.939)
    championId: champ.id,
    copies: 1,
    level: 1,
    xp: 0,
  };
  return { advs: [...advs, neuf], copies: 1, duplicate: false, manaBack: 0 };
}

/**
 * 🗑️ LE WIPE : les aventuriers d'AVANT les champions s'en vont, compensés en mana.
 *
 * ⚠️ **MESURÉ EN BASE AVANT DE DÉCIDER : le wipe ne détruit AUCUN investissement.** Les 21
 * aventuriers des comptes réels n'ont **qu'une seule classe** — la première promotion tombe
 * au niveau 11 (`PROMO_LEVELS`), le plus avancé est à 9. L'arbre de classes n'a donc jamais
 * servi à personne, et c'est un argument de plus pour le remplacer plutôt que le compléter.
 *
 * ⚠️ **ET L'ÉQUIPEMENT SURVIT** : les pièces vivent dans `adv_gear.stock`, un aventurier
 * n'en porte que les **ids**. Les 105 pièces des comptes réels sont rangées par LIGNÉE, et
 * les 6 lignées ne bougent pas — un champion de lignée X porte les pièces de X
 * (`canWearAdvGear` inchangé).
 *
 * ⚠️ **UN CONVOI EN COURS N'EST PAS PERDU** (vérifié : deux en vol sur la base réelle).
 * `caravanClaimRoster` filtre déjà les escortes introuvables et le rapport les affiche
 * « Champion parti » (`gone`) : la cargaison s'encaisse, seule l'XP de l'escorte s'en va
 * — et elle allait de toute façon disparaître avec eux.
 *
 * ⚠️ **IDEMPOTENT** : sans aucun legacy, il rend la MÊME référence et zéro mana.
 */
export function wipeLegacyAdventurers(advs: Adventurer[]): { advs: Adventurer[]; mana: number } {
  const partants = advs.filter((a) => !a.championId);
  if (!partants.length) return { advs, mana: 0 };
  return {
    advs: advs.filter((a) => !!a.championId),
    // Un TIRAGE chacun : la compensation se dit dans la monnaie de ce qui les remplace,
    // pas en or — on rend de quoi invoquer autant de champions qu'on perd de recrues.
    mana: partants.length * GACHA.pullCost,
  };
}
