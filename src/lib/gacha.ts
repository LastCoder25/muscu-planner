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

import { RANK_ORDER, type Rarity } from './items';
import { championsOf, type Champion } from '@/data/champions';
import { awakenOverflow, deployedCount, isDeployed, type Adventurer } from './adventurers';

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

  /** Un plancher tous les N tirages : au moins `floorRarity`. ⚠️ Ce n'est pas du confort —
   *  sans lui, une série de 30 communs d'affilée est banale, et c'est ce qui fait décrocher
   *  un joueur qui n'a pas d'argent réel pour compenser. */
  minorPity: 10,
  floorRarity: 'epique' as Rarity,
} as const;

/**
 * Taux de BASE, avant tout pity. ⚠️ **Ils somment à 1** (testé) : une table qui ne somme
 * pas laisse un reliquat que le tirage attribuerait silencieusement à la dernière entrée.
 *
 * La forme est celle du genre — une descente géométrique, la rareté maximale à ~0,6 % :
 * « à taux nu, on peut tirer 200 fois sans rien », ce que le pity vient corriger.
 */
export const GACHA_RATES: Record<Rarity, number> = {
  commun: 0.3,
  inhabituel: 0.25,
  magique: 0.18,
  rare: 0.12,
  epique: 0.08,
  legendaire: 0.04,
  mythique: 0.024,
  primordial: 0.006,
};

/** La rareté maximale — DÉRIVÉE de l'échelle, jamais écrite : ajouter une rareté un jour
 *  déplacerait le sommet, et une constante en dur pointerait alors sur l'avant-dernière. */
export const TOP_RARITY: Rarity = RANK_ORDER[RANK_ORDER.length - 1]!;

/** Ce que le tirage doit retenir entre deux pulls. ⚠️ DEUX compteurs, pas un : le pity
 *  majeur (rareté maximale) et le mineur (plancher) se remplissent et se vident
 *  indépendamment — un seul compteur ferait remettre le grand pity à zéro chaque fois
 *  qu'on décroche un épique. */
export interface PityState {
  /** Tirages depuis la dernière rareté maximale. */
  sinceTop: number;
  /** Tirages depuis le dernier `floorRarity` ou mieux. */
  sinceFloor: number;
}

export const emptyPity = (): PityState => ({ sinceTop: 0, sinceFloor: 0 });

/** Ce que la LIGNE du joueur retient du tirage (migr. 0081) : le pity, plus un compteur
 *  d'affichage. ⚠️ La collection n'est pas ici — un champion EST un `Adventurer`. */
export interface GachaState extends PityState {
  /** Total tiré, affichage seul. */
  pulls: number;
}

/**
 * Taux de la rareté maximale à ce tirage, pity compris.
 *
 * ⚠️ La rampe est **linéaire de `softPityStart` à `hardPity`**, et elle atteint 1 pile au
 * hard pity : le garanti n'est donc pas un cas particulier greffé à côté de la courbe, il
 * en est le bout. Une rampe qui n'y arriverait pas laisserait un saut visible.
 */
export function topRate(sinceTop: number): number {
  const n = Math.max(0, sinceTop) + 1; // le tirage qu'on est en train de faire
  const base = GACHA_RATES[TOP_RARITY];
  if (n <= GACHA.softPityStart) return base;
  // ⚠️ IL N'Y A PAS DE BRANCHE « HARD PITY » À CÔTÉ DE LA RAMPE, et c'est délibéré : la
  // rampe vaut EXACTEMENT 1 au tirage `hardPity`, donc un `if (n >= hardPity) return 1`
  // ne pourrait JAMAIS mordre — il donnerait la confiance sans la couverture. C'est le
  // motif des v0.751, v0.753 et v0.922, révélé ici encore par une mutation SURVIVANTE :
  // le supprimer ne faisait rougir aucun test. Le `Math.min` ci-dessous est un CLAMP
  // d'arrondi, pas une règle de jeu ; la garantie, elle, vit dans un test.
  const t = (n - GACHA.softPityStart) / (GACHA.hardPity - GACHA.softPityStart);
  return Math.min(1, base + (1 - base) * t);
}

/**
 * 🎰 UN TIRAGE. Rend la rareté obtenue et l'état de pity qui en découle.
 *
 * ⚠️ **PUR ET SANS EFFET DE BORD** : il ne mute pas l'état reçu, il en rend un neuf —
 * c'est ce qui permet de rejouer un tirage pour l'afficher sans le consommer.
 *
 * Ordre des règles, et il compte :
 * 1. le **hard/soft pity** de la rareté maximale, qui prime sur tout ;
 * 2. le **plancher** (`minorPity`), qui ne s'applique qu'à ce qui n'est pas déjà maximal ;
 * 3. le tirage ordinaire.
 */
export function pullRarity(
  rng: () => number,
  pity: PityState,
): { rarity: Rarity; pity: PityState } {
  const r = rng();
  let rarity: Rarity;

  if (r < topRate(pity.sinceTop)) {
    rarity = TOP_RARITY;
  } else if (pity.sinceFloor + 1 >= GACHA.minorPity) {
    // ⚠️ On re-tire DANS la tranche ≥ plancher plutôt que de rendre le plancher lui-même :
    // sinon le 10ᵉ tirage serait toujours exactement `floorRarity`, jamais mieux, et la
    // garantie se lirait comme un plafond.
    rarity = pickAtLeast(rng, GACHA.floorRarity);
  } else {
    rarity = pickWeighted(rng);
  }

  const top = rarity === TOP_RARITY;
  const atFloor = rankOf(rarity) >= rankOf(GACHA.floorRarity);
  return {
    rarity,
    pity: {
      sinceTop: top ? 0 : pity.sinceTop + 1,
      sinceFloor: atFloor ? 0 : pity.sinceFloor + 1,
    },
  };
}

const rankOf = (r: Rarity): number => RANK_ORDER.indexOf(r);

/** Tirage pondéré ordinaire sur toute l'échelle. */
function pickWeighted(rng: () => number): Rarity {
  let x = rng();
  for (const r of RANK_ORDER) {
    x -= GACHA_RATES[r];
    if (x < 0) return r;
  }
  // Repli d'arrondi flottant : la dernière rareté non nulle.
  return RANK_ORDER[RANK_ORDER.length - 1]!;
}

/** Tirage pondéré RESTREINT aux raretés ≥ `min`, poids d'origine conservés. */
function pickAtLeast(rng: () => number, min: Rarity): Rarity {
  const pool = RANK_ORDER.filter((r) => rankOf(r) >= rankOf(min));
  const total = pool.reduce((s, r) => s + GACHA_RATES[r], 0);
  let x = rng() * total;
  for (const r of pool) {
    x -= GACHA_RATES[r];
    if (x < 0) return r;
  }
  return pool[pool.length - 1]!;
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
// 🎰 TIRER UN CHAMPION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🎰 UN TIRAGE COMPLET : une rareté, puis un champion DANS cette rareté.
 *
 * ⚠️ **UNIFORME DANS LA RARETÉ**, et c'est ce qui fait la vitesse de l'Éveil : à 4
 * champions par rareté, un champion PRÉCIS tombe à un quart du taux de sa rareté. C'est
 * pour ça que la taille du pool se décide avant d'écrire le roster, pas après.
 */
export function pullChampion(
  rng: () => number,
  pity: PityState,
): { champion: Champion; pity: PityState } {
  const r = pullRarity(rng, pity);
  const pool = championsOf(r.rarity);
  // ⚠️ Un repli VIDE serait un trou silencieux : si une rareté n'a aucun champion, le
  // tirage doit échouer bruyamment plutôt que rendre autre chose que ce qu'il annonce.
  // ⚠️ INATTEIGNABLE tant que le roster est complet — `champions.test.ts` exige 4 champions
  // à CHAQUE rareté, donc aucune mutation de cette ligne ne peut faire rougir un test. Une
  // ceinture pour le jour où quelqu'un retire une rareté du roster, pas une règle de jeu.
  if (!pool.length) throw new Error(`Aucun champion de rareté ${r.rarity}`);
  return { champion: pool[Math.floor(rng() * pool.length)]!, pity: r.pity };
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
  /** Engagé d'office ? (il restait une place au Panthéon) */
  deployed: boolean;
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
 * ⚠️ **ON ENGAGE D'OFFICE TANT QU'IL RESTE UNE PLACE** : sans ça, un joueur tire son
 * premier champion et il ne se passe RIEN — il est en collection, donc indisponible pour
 * les convois comme pour la défense, sans que rien ne l'explique. Au-delà du plafond, le
 * joueur arbitre lui-même.
 */
export function grantChampion(
  advs: Adventurer[],
  champ: Champion,
  opts: { id: string; deployCap: number; seed?: number },
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
      deployed: isDeployed(prev),
    };
  }
  const deployed = deployedCount(advs) < opts.deployCap;
  const neuf: Adventurer = {
    id: opts.id,
    name: champ.name,
    // ⚠️ La graine ne sert qu'aux offres de classe, qu'un champion n'a pas — mais le type
    // l'exige, et la dériver de son id vaut mieux qu'un zéro qui ferait croire à un oubli.
    seed: opts.seed ?? [...champ.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
    path: [], // un champion a une IDENTITÉ, pas un chemin (v0.939)
    championId: champ.id,
    copies: 1,
    deployed,
    level: 1,
    xp: 0,
  };
  return { advs: [...advs, neuf], copies: 1, duplicate: false, manaBack: 0, deployed };
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
 * (`canWearAdvGear` inchangé). Même chose pour les compagnons et les talents confiés.
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
