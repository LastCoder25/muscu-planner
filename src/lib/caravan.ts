// caravan.ts — les caravanes : de la logistique LENTE, sans héros et sans énergie.
// Pur/testable, aucune dépendance Vue/Supabase.
//
// ⚠️ POURQUOI CETTE BOUCLE EXISTE. Tout le jeu se paie en ÉNERGIE, donc en sport : un
// joueur qui s'entraîne peu en manque par définition. Mais il a du TEMPS. Une caravane
// consomme donc du temps réel et ZÉRO énergie — c'est le seul axe où il est à égalité.
// Corollaire non négociable : **une caravane ne rapporte JAMAIS d'équipement**. Elle paie
// en LOGISTIQUE (⚡ énergie plafonnée, 🔮 pierres, 🔩 ferraille, 🗝️ clés, un filet d'or),
// c'est-à-dire des devises qui débloquent les AUTRES systèmes au lieu de les remplacer.
// « Le sport est le plafond » reste intact : ce n'est pas le butin qui monte, c'est
// l'accès au jeu qui s'élargit.
//
// ⚠️ ELLE NE VA QUE SUR LES POI DE RÉCOLTE. Division du travail : le héros explore et se
// bat, les caravanes exploitent. Ça résout du même coup la vraie limite de la carte — le
// héros ne peut être qu'à un endroit, et la moitié des POI expirent sans qu'on y touche.
// Comme le héros, la caravane CONSOMME le lieu à son départ.
import {
  mergeEffects,
  effectAsAggregate,
  playerWithGear,
  emptyEffects,
  effectAsAggregate as asAggregate,
  familiarMult,
  RARITY_RANK,
  RANK_ORDER,
  prestigeRankIndex,
  rankRollMult,
  type AggregatedEffects,
  type Item,
} from './items';
import {
  simulateCombat,
  mulberry32,
  combatPower,
  offenseOf,
  survivalOf,
  type Combatant,
} from './combat';
// ⚠️ `trialXpBase` : SOURCE UNIQUE de la base d'XP d'une épreuve (`6 + niveau × 1,6`),
// partagée avec `skirmishXpShares` — un convoi et un combat de groupe évaluent le même
// « niveau du lieu » de la même façon. `deriveSkirmish`/`troopOf`/`SkirmishUnit` : le
// COMBAT DE GROUPE, lu par `roadTroop`/`roadUnits` et par les embuscades (v0.859). Aucun
// cycle : `skirmish.ts` n'importe que `combat.ts`.
import {
  deriveSkirmish,
  skirmishXpShares,
  trialXpBase,
  troopOf,
  type SkirmishUnit,
} from './skirmish';
// ⚠️ Type SEUL : `raid.ts` importera `garrisonCombatant` à l'exécution, donc un import
// de valeur dans l'autre sens créerait un cycle. Le projet applique déjà cette règle
// entre `data/familiars` et `items`.
import { effectsOfTalents, talentRankOf, type TalentInstance } from './talents';
import { FAMILIAR_SPECIES } from '../data/familiars';
import {
  HARVEST_TYPES,
  harvestYield,
  haulPills,
  goldCost,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from './expedition';
import {
  advRarity,
  advRoles,
  advSignatureLevels,
  advStats,
  advTitle,
  escortRoleLevel,
  PROMO_LEVELS,
  type Adventurer,
  type AdvRole,
} from './adventurers';
import {
  ADV_GEAR_DROP,
  ADV_GEAR_SLOTS,
  advGearEffects,
  advGearRoles,
  advGearRoleValue,
  advGearValue,
  LINEAGE_GEAR,
  lineageOf,
  rollAdvGearDrop,
  wornGear,
  type AdvGear,
  type AdvGearSlot,
} from './advGear';

export const CARAVAN = {
  /** Une caravane va PLUS LENTEMENT qu'un héros — c'est ce qui incarne « du temps au lieu
   *  de l'énergie », et ce qui la distingue de l'expédition (rapide, chère en énergie). */
  slow: 1.5,
  /** Escorte maximale par convoi. */
  escortMax: 4,
  /** Taille de l'escorte de RÉFÉRENCE qui sert de mètre-étalon à la route. */
  refEscort: 3,
  /** PV d'un groupe de bandits ≈ N tours d'offense de l'escorte de référence.
   *  ⚠️ RE-MESURÉ à 3 quand l’offense de référence a cessé d’ignorer les signatures : la
   *  même valeur ne veut plus dire la même chose, puisque l’unité elle-même a grandi.
   *  Trio (la référence) 73-94 % selon le niveau, quatuor 97-100 %, duo 17-55 % (bande
   *  re-mesurée avec l'équipement, cf. plus bas ; l'ancienne était 8-33), solo ~0 —
   *  c'est ce gradient qui fait de « combien j'en envoie » une décision. Ne pas le monter
   *  sans re-mesurer : à 2,2 tours, 3 aventuriers gagnaient 100 % PARTOUT et le choix
   *  était mort.
   *  ⚠️ RE-MESURÉ à 2,58 (avec `foeDmgPctPv` 0,26 → 0,275) quand la référence est devenue
   *  ÉQUIPÉE (`refAdvGear`, `ADV_GEAR.k` 0,15). Mesuré AVANT, sans équipement d'aucun
   *  côté : la bande avait déjà dérivé sous son plancher (trio calme 71 % au niveau 26,
   *  69 % au niveau 45). Après, sur 2000 graines aux niveaux 12/20/26/45/70/85 : trio équipé
   *  calme 92/89/76/74/85/89 %, périlleux 26/27/35/25/29/34 % ; le même SANS pièces
   *  91/86/72/63/67/65 % en calme ; solo 0, duo 55/42/20/27/20/17, quatuor 97-100.
   *  (Valeurs après le plancher de valeur à 0,1 dans `advGearValue`.)
   *  ⚠️ La marge est MINCE et structurelle : le calme du niveau 45 et le périlleux du
   *  niveau 26 bougent en sens inverse avec ces deux constantes. */
  foePvTurns: 2.58,
  /** Ils mordent ~N % des PV EFFECTIFS de la référence par coup — `survivalOf`, donc
   *  esquive ET réduction comprises.
   *  ⚠️ EFFECTIFS, et non bruts : les deux croissent avec le niveau, donc une morsure
   *  calée sur les PV bruts rendait le début de partie BEAUCOUP plus dur que la fin
   *  (mesuré : 12 % de tenue au niveau 5 contre 98 % au niveau 70, à escorte égale).
   *  ⚠️ L’ESQUIVE manquait à cette correction jusqu’en v0.797 — la copie locale ne voyait
   *  que la réduction, donc la morsure visait des PV que l’escorte dépassait de plus en
   *  plus à mesure que son agilité montait. */
  foeDmgPctPv: 0.275,
  /** Route dangereuse (`Poi.perilous`, tirée au spawn donc annonçable AVANT le départ). */
  perilousMult: 1.35,
  /** Taille de la troupe d'une embuscade — calme / périlleuse (moteur de groupe, v0.859).
   *  ⚠️ Ce n'est PAS le danger : l'issue reste le combat fondu `roadFoe` (bandes intactes).
   *  C'est le nombre de CORPS entre lesquels ses PV sont répartis — donc combien d'abattus
   *  le journal inscrit, et l'XP qu'ils rapportent (`SKIRMISH.xpPerKill`). */
  troopCalm: 3,
  troopPerilous: 3,
  /** Ce qu'apporte une SIGNATURE de classe (strates ≥ 3), en %. */
  signaturePct: 12,
  /** Un rôle 🧭 raccourcit le trajet, un rôle 🐫 grossit la cargaison — par aventurier. */
  speedPerRole: 0.08,
  speedMax: 0.3,
  haulPerRole: 0.12,
  haulMax: 0.4,
  /** Un 🩺 raccourcit les convalescences de l'équipe. */
  carePerRole: 0.25,
  /** 👁️ ÉCLAIREUR : part d'embuscades ÉVITÉES par cran de compétence.
   *  ⚠️ Ce rôle existait, était attribué à 5 classes, et ne faisait **RIEN** — il n'était
   *  consommé nulle part (constaté v0.757 ; 3 aventuriers sur 10 du vivier réel n'avaient
   *  que lui). Même forme que la cargaison (0,12 par cran, plafond 0,40) : les quatre
   *  rôles restent comparables entre eux. */
  scoutPerRole: 0.12,
  scoutMax: 0.4,
  /** Repos d'un aventurier blessé. */
  hurtMs: 6 * 3600_000,
  /** Formation d'une promotion, et ce que le Centre peut en retirer (asymptotiquement). */
  /** Durée de la 1re promotion (strate 1), Centre non construit. ⚠️ Ce n'est PLUS « la
   *  durée d'une formation » : les rangs suivants DOUBLENT (cf. `stratumTrainMult`). */
  trainMs: 30 * 60_000,
  trainMaxGain: 0.8,
  trainHalf: 30,
  /** Paie par aventurier : socle × strate × niveau du POI^0,7. C'est un PUITS D'OR, mais
   *  calibré pour valoir ~60 % de l'or rapporté — à 26, les salaires valaient 2,6× l'or
   *  brut et le convoi était absurdement déficitaire. La caravane paie en RESSOURCES ;
   *  l'or n'est qu'un filet, et les salaires ne doivent pas l'engloutir. */
  wageBase: 6,
  /** ⚠️ PART DU RENDEMENT D'UNE VISITE DU HÉROS. Des marchands exploitent moins bien
   *  qu'un aventurier — mais ce n'est pas du réalisme, c'est un garde-fou mesuré : à part
   *  pleine, UNE caravane rendait 608 🔩/jour au niveau 26 contre 19 pour la Fonderie
   *  (×32), soit plusieurs crans d'enceinte par jour. La règle « la ferraille doit être
   *  plus dure à obtenir que l'or » (v0.682) serait morte. Avec 0,5 et un nombre de
   *  convois plafonné, les caravanes COMPLÈTENT l'épave du héros au lieu de la remplacer.
   *  ⚠️ Ne pas monter sans re-mesurer `scrapEconomy`. */
  yieldShare: 0.5,
  /** Un convoi de plus tous les N niveaux de Comptoir. ⚠️ Calé sur le vivier : la Guilde
   *  donne 1 aventurier tous les 2 niveaux, donc ~L/6 escortes de 3 au niveau L — le
   *  nombre de convois doit rester SOUS ce plafond humain, sinon on possède des convois
   *  qu'on ne peut pas armer. À 1 tous les 9 niveaux : 12 convois au niveau 100 pour
   *  17 escortes possibles. */
  slotEvery: 9,
  /** Niveaux de Comptoir pour gagner la MOITIÉ de l’accélération possible. */
  speedHalf: 35,
  /** Distance de RÉFÉRENCE de l'XP de mission (0..1) : celle dont le rendement ne bouge
   *  pas. En deçà on apprend moins, au-delà davantage — voir `missionTravelMult`. La
   *  médiane, pour que la courbe de montée mesurée (~8 missions pour le niveau 2, 255
   *  pour le 23) reste vraie du joueur qui prend ce que la carte lui donne. */
  xpRefDist: 0.5,
  /** Part de la valeur d'un convoi qu'une embuscade perdue emporte. */
  lossKeep: 0.55,
} as const;

type CaravanEventKind = 'bandits' | 'cache' | 'detour' | 'calme';

interface CaravanEvent {
  kind: CaravanEventKind;
  /** `bandits` uniquement : l'escorte a-t-elle tenu ? */
  won?: boolean;
  /** `bandits` : bandits abattus / membres tombés (combat de groupe, v0.859). ⚠️ ABSENTS sur
   *  les convois lancés avant la bascule (leur `outcome` est figé au départ). */
  kills?: number;
  fallen?: number;
  text: string;
}

export interface CaravanOutcome {
  gold: number;
  energy: number;
  summonStones: number;
  scrap: number;
  keys: number;
  /** Salaires versés à l'escorte — déduits à part, c'est une DÉPENSE assumée. */
  wages: number;
  /** XP gagnée, PAR AVENTURIER (id → XP).
   *  ⚠️ C'était une MOYENNE : mesuré, un vétéran de niveau 30 passait de 1 à 11 XP sur une
   *  route triviale rien qu'en emmenant trois recrues — le rendement décroissant, qui
   *  existe précisément pour empêcher de farmer le trajet le plus court, se contournait
   *  en ajoutant des passagers. */
  xp: Record<string, number>;
  /** 🗡️ Bandits abattus par aventurier, toutes embuscades confondues. ⚠️ ABSENT sur les
   *  convois lancés avant le combat de groupe (leur `outcome` est figé au départ). */
  kills?: Record<string, number>;
  /** Ids des aventuriers blessés (→ infirmerie) : ceux qui sont TOMBÉS en embuscade. */
  hurt: string[];
  events: CaravanEvent[];
  text: string;
  /** 🗡️ Équipement d'aventurier laissé par une embuscade REPOUSSÉE — lignée de l'escorte,
   *  rang portable par elle (cf. `rollAdvGearDrop`). */
  advGear: Omit<AdvGear, 'id'>[];
}

/** Convois ENCAISSÉS qu’on garde en mémoire. Zéro serait tentant — rien ne les lit —
 *  mais un petit tampon évite qu’un encaissement en cours ne trouve plus sa ligne. */
export const CARAVAN_KEEP_CLAIMED = 5;

/**
 * Borne la liste de convois persistée.
 *
 * ⚠️ ELLE N’ÉTAIT JAMAIS PURGÉE : mesuré sur le compte réel, **35 convois stockés dont
 * 30 déjà encaissés**, et ça ne fait que grossir — la ligne `characters` porte déjà le
 * sac, les talents, les aventuriers et la carte. Rien ne lit un convoi encaissé
 * (`planPushes` les saute, l’écran n’affiche que les voyages en cours ou à récupérer).
 *
 * ⚠️ ON NE JETTE JAMAIS UN CONVOI NON ENCAISSÉ : il porte une cargaison, et elle ne se
 * périme pas. Seuls les encaissés sont taillés, les plus RÉCENTS d’abord.
 *
 * Appliquée au CHARGEMENT : les lignes existantes se soignent toutes seules, sans
 * migration — même politique que les POI périmés et les garnisons obsolètes.
 */
export function pruneCaravans(list: Caravan[], keep = CARAVAN_KEEP_CLAIMED): Caravan[] {
  const done = list.filter((v) => v.claimed);
  if (done.length <= keep) return list;
  const gardes = new Set(
    [...done]
      .sort((a, b) => b.returnAt - a.returnAt)
      .slice(0, Math.max(0, keep))
      .map((v) => v.id),
  );
  return list.filter((v) => !v.claimed || gardes.has(v.id));
}

export interface Caravan {
  id: string;
  /** Copie du POI, comme `ActiveExpedition` : il est retiré de la carte au DÉPART. */
  poi: Poi;
  escort: string[];
  sentAt: number;
  /** Arrivée à l'objectif — le rapport est lisible dès cet instant. */
  midAt: number;
  /** Retour en ville : c'est là seulement que la cargaison se récupère. */
  returnAt: number;
  outcome: CaravanOutcome;
  /** ⚠️ `undefined` = butin DÉJÀ crédité (convois écrits avant l'encaissement manuel),
   *  jamais « à récupérer » — même règle que les rapports d'expédition. */
  claimed?: boolean;
}

/** SURVIE de référence — l’unité dans laquelle on exprime la morsure des bandits.
 *
 * ⚠️ ELLE DÉLÈGUE À `survivalOf` (`combat.ts`), qui compte l’ESQUIVE en plus de la
 * réduction. La copie locale ne voyait que la réduction — or l’esquive monte avec
 * l’agilité, donc avec le niveau : la morsure était calibrée sur des PV que l’escorte
 * dépassait de plus en plus. Même défaut que l’offense, même remède : une seule
 * formule, celle de l’arbitre du jeu. Le ×100 remet `survivalOf` en unité de PV.
 */
function effectivePv(c: Combatant): number {
  return survivalOf(c) * 100;
}
/** Offense par tour — l’unité dans laquelle on exprime les PV adverses.
 *
 * ⚠️ ELLE DÉLÈGUE À `offenseOf` (`combat.ts`), qui compte les SIGNATURES. La copie
 * locale les ignorait alors que `simulateCombat` les applique : chaque signature
 * gagnée par l’escorte la renforçait sans renforcer la route, et un trio passait de
 * 76 % de victoires à 100 % en fin de partie. Le plancher à 1 est conservé — c’est un
 * garde-fou de division, pas une différence de modèle. */
function offensePerRound(c: Combatant): number {
  return Math.max(1, offenseOf(c));
}
/** Le niveau CUMULÉ d'un rôle sur l'escorte. ⚠️ La règle « deux fois la compétence = le
 *  niveau 2 » vit dans `adventurers.ts` : ici on ne fait que la lire, sinon l'écran et le
 *  calcul compteraient chacun à leur façon. */
const countRole = (advs: Adventurer[], role: 'heal' | 'haul' | 'speed' | 'scout'): number =>
  escortRoleLevel(advs, role);

/** Effets apportés par les SIGNATURES de classe de l'escorte (strates hautes). */
function escortEffects(advs: Adventurer[]): AggregatedEffects {
  // ⚠️ L'effet SUIT LE NIVEAU de la signature : la porter deux fois vaut deux crans.
  // C'était déjà le cas — deux entrées identiques que `mergeEffects` additionnait — mais
  // c'était un effet de bord du cumul, pas une règle écrite. Valeur inchangée.
  const list = advs.flatMap((a) =>
    advSignatureLevels(a).map((s) => effectAsAggregate(s.what, CARAVAN.signaturePct * s.level)),
  );
  return list.length ? mergeEffects(...list) : emptyEffects();
}

/** L'escorte comme UN combattant : les stats des membres s'ADDITIONNENT.
 *  ⚠️ Aucun bonus de « diversité » à inventer — `simulateCombat` calcule offense × survie,
 *  donc quatre Guerriers tapent fort et meurent quand un Guerrier + un Homme d'armes +
 *  un Archer tiennent. L'incitation à l'équipe équilibrée est déjà dans le moteur. */
export function escortCombatant(
  advs: Adventurer[],
  name = 'Escorte',
  /** Renfort d'effets EXTÉRIEUR aux aventuriers — le compagnon et le talent qu'on leur
   *  a confiés. Il s'ajoute aux signatures de l'escorte au lieu de les remplacer : un
   *  convoi garde ses propres talents. */
  extra: Partial<AggregatedEffects> = {},
): Combatant {
  const stats = advs.reduce(
    (a, x) => {
      const s = advStats(x);
      return {
        puissance: a.puissance + s.puissance,
        endurance: a.endurance + s.endurance,
        agilite: a.agilite + s.agilite,
      };
    },
    { puissance: 0, endurance: 0, agilite: 0 },
  );
  const level = advs.reduce((m, a) => Math.max(m, a.level), 1);
  return playerWithGear(
    name,
    stats,
    {},
    mergeEffects(escortEffects(advs), { ...emptyEffects(), ...extra }),
    level,
  );
}

/**
 * Les COMPAGNONS d'une escorte : un familier par aventurier, au plus.
 *
 * ⚠️ TROIS EXCLUSIONS, et aucune n'est décorative. Un familier déjà PORTÉ par le héros
 * n'est pas disponible (il se bat ailleurs) ; un familier apparié DEUX FOIS ne compte
 * qu'une (l'écran ne devrait pas le permettre, mais l'écran ne garantit rien) ; un id
 * qui ne désigne plus rien est ignoré plutôt que de faire tomber le combat — un familier
 * vendu laisserait sinon un appariement fantôme.
 */
export function companionsOf(
  advs: Adventurer[],
  owned: Item[],
  heroFamiliarId?: string | null,
): Item[] {
  const pairs = roadPairs(advs, { familiars: owned, talents: [], advGear: [], heroFamiliarId });
  return [...pairs.values()].flatMap((p) => (p.familiar ? [p.familiar] : []));
}

/**
 * Ce que les compagnons apportent, en effets — EXACTEMENT comme au héros (v0.805).
 *
 * ⚠️ PLUS DE BRIDAGE NI DE TERRAIN (demandé par l’utilisateur : « le familier booste
 * l’aventurier comme le héros, que ce soit en défense ou en attaque »). Il valait 40 %
 * de sa stat, sans son niveau d’objet, avec un dressage d’attaque sur la route et de
 * défense au mur plafonné par le Chenil : le même animal annonçait trois valeurs.
 * `familiarMult` est la formule du héros, lue telle quelle.
 *
 * `mult` ne sert qu’à la FATIGUE au rempart (un état, pas une formule).
 */
export function companionEffects(companions: Item[], mult = 1): AggregatedEffects {
  const list = companions.flatMap((f) => {
    const m = familiarMult(f) * mult;
    const parts = [asAggregate(f.effect.type, f.effect.value * m)];
    // La SIGNATURE ✦ d'un familier compte aussi : c'est ce qui fait sa valeur au drop.
    if (f.effect2) parts.push(asAggregate(f.effect2.type, f.effect2.value * m));
    return parts;
  });
  return list.length ? mergeEffects(...list) : emptyEffects();
}

/** Part de l'effet d'un talent qui profite à son aventurier.
 *  ⚠️ Constante SÉPARÉE de `COMPANION_K` bien qu'elles vaillent pareil aujourd'hui : ce
 *  sont deux leviers d'équilibrage distincts, et les fusionner interdirait de corriger
 *  l'un sans déplacer l'autre.
 *  ⚠️ 0,4 × 0,5/0,9 (v0.848) : l'échelle des talents est passée de 0,5 à 0,9 pour que le
 *  talent du HÉROS pèse autant que son familier. Les embuscades de convoi et les sièges ont
 *  été calibrés avec l'ancienne échelle : on compense ici, pour que le talent confié à un
 *  aventurier vaille exactement ce qu'il valait. */
export const ADV_TALENT_K = 0.4 * (0.5 / 0.9);

/** Multiplie tous les canaux d'un agrégat. ⚠️ Balayage des CLÉS de `emptyEffects()`, pas
 *  une liste écrite à la main : ajouter un canal à `AggregatedEffects` sans le brider
 *  ici passerait sinon inaperçu. */
function scaleEffects(e: AggregatedEffects, k: number): AggregatedEffects {
  const out = emptyEffects();
  for (const key of Object.keys(out) as (keyof AggregatedEffects)[]) out[key] = (e[key] ?? 0) * k;
  return out;
}

/**
 * Les TALENTS des aventuriers d'une escorte — un par tête, au plus.
 *
 * ⚠️ Mêmes trois exclusions que les compagnons, et pour les mêmes raisons : un talent
 * ÉQUIPÉ PAR LE HÉROS n'est pas disponible, un talent assigné deux fois ne compte
 * qu'une, un id qui ne désigne plus rien est ignoré. Un talent recyclé laisserait sinon
 * une assignation fantôme.
 */
/**
 * Un aventurier peut-il porter ce talent ? Sa RARETÉ ne dépasse pas celle de sa CLASSE
 * (v0.805 ; demandé par l’utilisateur, choix « rareté de sa classe »).
 *
 * ⚠️ Le pendant du Chenil pour les familiers, mais porté par l’HOMME : chaque promotion
 * débloque la rareté suivante, donc élever un aventurier ouvre ce qu’on peut lui confier.
 * ⚠️ Appliqué AU COMBAT autant qu’au store : un talent confié avant cette règle se soigne
 * tout seul, sans migration — même politique que les compagnons hors d’école.
 */
export function canAdvTalent(adv: Adventurer, t: TalentInstance): boolean {
  return RARITY_RANK[talentRankOf(t)] <= RARITY_RANK[advRarity(adv)];
}

/**
 * Un aventurier peut-il être accompagné de ce familier ? MÊME RÈGLE QUE LES TALENTS (v0.831 ;
 * signalé par l’utilisateur : « des familiers épiques équipés sur des aventuriers bronze »).
 *
 * ⚠️ Le Chenil seul décidait (`canCompanion`) : au Chenil 30 il héberge jusqu’à l’épique,
 * donc un aventurier qui n’a encore que sa première classe — rang Bronze, classe commune —
 * repartait avec un loup épique, pendant que la règle des talents lui interdisait tout ce qui
 * dépasse le commun. Deux compagnons, deux règles : le même homme ne pouvait pas porter un
 * talent inhabituel mais pouvait mener une bête épique.
 * ⚠️ Les DEUX s’appliquent désormais : le Chenil dit ce qu’il sait HÉBERGER, la classe dit ce
 * que l’homme sait MENER. Chaque promotion ouvre la rareté suivante — pour ses deux compagnons.
 * ⚠️ Appliqué au combat autant qu’au store : un familier confié avant cette règle se soigne
 * tout seul (il ne vient plus au rempart), sans migration.
 */
export function canAdvFamiliar(adv: Adventurer, fam: Item): boolean {
  return RARITY_RANK[fam.rarity] <= RARITY_RANK[advRarity(adv)];
}

/** Qui garde quel familier : id du familier → l’aventurier à qui il est confié.
 *
 * ⚠️ SOURCE UNIQUE de « ce familier est pris » pour la vente (store) ET pour l’écran. La
 * fiche lisait encore `base.garrison`, la garnison retirée en v0.777 : un familier resté
 * dans cette vieille liste s’affichait « 🛡️ au mur » et n’était plus vendable, pendant qu’un
 * familier réellement confié proposait « Vendre » — un bouton que le store refusait sans
 * rien dire. Le premier aventurier listé l’emporte si deux prétendent au même. */
export function familiarKeepers(advs: readonly Adventurer[]): Map<string, Adventurer> {
  const keepers = new Map<string, Adventurer>();
  for (const a of advs)
    if (a.familiarId && !keepers.has(a.familiarId)) keepers.set(a.familiarId, a);
  return keepers;
}

export function advTalentsOf(
  advs: Adventurer[],
  owned: TalentInstance[],
  heroTalentIds: readonly string[] = [],
): TalentInstance[] {
  const pairs = roadPairs(advs, { familiars: [], talents: owned, advGear: [], heroTalentIds });
  return [...pairs.values()].flatMap((p) => (p.talent ? [p.talent] : []));
}

/** Ce que ces talents apportent, BRIDÉ.
 *  ⚠️ On force `equipped: true` : le cumul ignore ce qui ne l'est pas, et un talent
 *  confié à un aventurier n'est justement PAS équipé sur le héros — sans ça, la fonction
 *  rendrait zéro en silence. */
export function advTalentEffects(talents: TalentInstance[], k = ADV_TALENT_K): AggregatedEffects {
  if (!talents.length) return emptyEffects();
  return scaleEffects(effectsOfTalents(talents.map((t) => ({ ...t, equipped: true }))), k);
}

/** Ce qu'UN aventurier emmène au combat — la forme partagée par la route et le rempart. */
export interface CompanionSet {
  familiar?: Item;
  talent?: TalentInstance;
  gear?: AdvGear[];
}

/**
 * ⚔️ CE QU'UN AVENTURIER TIRE DE SA PAIRE ET DE SES PIÈCES — UNE seule définition, lue par
 * la route (`roadUnits`) ET par le rempart (`pairEffects`, `raid.ts`). Deux copies
 * finiraient par annoncer une valeur que le combat n'applique pas.
 * `companionMult` : la FATIGUE au rempart (un état, pas une formule) ; 1 partout ailleurs.
 */
export function unitEffects(p: CompanionSet | undefined, companionMult = 1): AggregatedEffects {
  return mergeEffects(
    companionEffects(p?.familiar ? [p.familiar] : [], companionMult),
    advTalentEffects(p?.talent ? [p.talent] : []),
    advGearEffects(p?.gear ?? []),
  );
}

/** Combien de strates un aventurier de ce niveau a pu franchir. */
function strataFor(level: number): number {
  return Math.max(1, PROMO_LEVELS.filter((l) => l <= level).length);
}
/** Aventurier de RÉFÉRENCE : une lignée guerrière promue autant que son niveau l'autorise.
 *  Il ne sert qu'à donner l'échelle de la route — jamais au jeu. */
/** Les trois orientations d’une escorte de référence. ⚠️ TROIS, et pas une : une
 *  lignée 100 % mêlée a **agilité 0** tant qu’elle a peu de classes, donc son
 *  multi-frappe reste à 1,00 — et toute la calibration de la route, qui repose sur la
 *  non-linéarité de l’offense, s’effondrait. Mesuré : au niveau 20 un trio de mêlée pure
 *  gagnait **0 %** de ses embuscades là où un trio mixte en gagne 81 %. Une vraie
 *  escorte n’est jamais monochrome — la référence ne doit pas l’être non plus. */
const REF_LINEAGES: readonly (readonly string[])[] = [
  [
    'guerrier',
    'epeiste',
    'duelliste',
    'maitre_epeiste',
    'maitre_armes',
    'heros',
    'demi_dieu',
    'primarque',
  ],
  [
    'archer',
    'franc_tireur',
    'arbaletrier',
    'arquebusier',
    'maitre_arc',
    'oeil_faucon',
    'lame_destin',
    'tranchant_absolu',
  ],
  [
    'caravanier',
    'muletier',
    'pisteur',
    'maitre_convoi',
    'logisticien',
    'grand_intendant',
    'batisseur',
    'pilier_du_monde',
  ],
];

/** L’aventurier de RÉFÉRENCE d’un niveau donné — ce à quoi la route se calibre.
 *
 *  ⚠️ LA LIGNÉE VA JUSQU’AU BOUT DES 8 STRATES : elle s’arrêtait à 4, donc la route
 *  cessait de monter pendant qu’une escorte réelle continuait — les convois devenaient
 *  triviaux. Le danger de la route est ABSOLU (v0.726), il doit suivre l’échelle
 *  entière de ce qu’on peut aligner.
 *
 *  ⚠️ `slot` choisit l’orientation (mêlée / agile / civile) : un trio de référence en
 *  prend une de chaque. */
export function refAdventurer(level: number, slot = 0): Adventurer {
  const lineage = REF_LINEAGES[Math.abs(Math.floor(slot)) % REF_LINEAGES.length]!;
  return {
    id: 'ref' + slot,
    name: 'Référence',
    seed: 1,
    path: lineage.slice(0, Math.min(lineage.length, strataFor(level))),
    level: Math.max(1, level),
    xp: 0,
  };
}

/** Les espèces des compagnons de RÉFÉRENCE : une par grand canal de combat. */
const REF_SPECIES = ['wolf', 'deer', 'bear'] as const;
/** Jet de référence d’un familier : le jet MOYEN d’un tirage biaisé bas (cf. `rollJetValue`). */
const REF_FAMILIAR_JET = 0.3;

/**
 * Les COMPAGNONS de l’escorte de référence : un familier par aventurier, du rang qu’on
 * peut dropper à ce niveau, jet moyen, niveau d’objet à niveau, sans dressage.
 *
 * ⚠️ POURQUOI (v0.805). Depuis que le familier booste l’aventurier comme le héros, il
 * pèse lourd sur la route : mesuré, un trio accompagné gagnait 92 % de ses embuscades
 * PÉRILLEUSES au niveau 90, contre 39 % sans. Une référence NUE aurait fait du convoi
 * une formalité pour quiconque confie ses familiers — et supprimé la seule décision de
 * la feature (« combien j’en envoie »). C’est la règle des donjons (`gearExpect`) : le
 * contenu se dimensionne sur un joueur ÉQUIPÉ.
 * ⚠️ Sans dressage, délibérément : le dressage se mérite, il doit rester un avantage.
 */
export function refCompanions(level: number): Item[] {
  const rarity = RANK_ORDER[prestigeRankIndex(Math.max(1, level))]!;
  return REF_SPECIES.map((id, i) => {
    const sp = FAMILIAR_SPECIES.find((s) => s.id === id)!;
    return {
      id: `refFam${i}`,
      slot: 'familiar',
      name: sp.name,
      emoji: sp.emoji,
      rarity,
      level: Math.max(1, level),
      baseLevel: Math.max(1, level),
      effect: { type: sp.effect, value: sp.base * rankRollMult(rarity, REF_FAMILIAR_JET) },
      species: sp.id,
      roll: REF_FAMILIAR_JET,
    } satisfies Item;
  });
}

/** Les membres NUS de l’escorte de référence, un par orientation. ⚠️ Extrait pour que
 *  `refAdvGear` lise les lignées sans passer par `refEscortOf`, qui l’appelle. */
function refEscortBare(level: number, n: number = CARAVAN.refEscort): Adventurer[] {
  return Array.from({ length: n }, (_, i) => refAdventurer(level, i));
}

/** Les ids des pièces de référence du membre `i` (cf. `refAdvGear`). */
function refGearIds(i: number): Record<AdvGearSlot, string> {
  return {
    weapon: `refGear${i}weapon`,
    armor: `refGear${i}armor`,
    accessory: `refGear${i}accessory`,
  };
}

/** Jet de référence d’une pièce : le jet MOYEN d’un tirage biaisé bas (même valeur que
 *  les familiers de référence). */
const REF_GEAR_JET = 0.3;

/**
 * L’ÉQUIPEMENT de l’escorte de référence : chaque membre porte ses 3 pièces, niveau d’objet
 * à niveau, de la rareté de SA classe, jet moyen — la règle de `gearExpect` : l’attendu, pas
 * l’exceptionnel.
 *
 * ⚠️ POURQUOI. Une escorte équipée additionne 3 pièces par tête, soit plus qu’un compagnon :
 * sans cette référence, un vivier équipé roulerait sur une route calibrée pour des escortes
 * nues, et « combien j’en envoie » cesserait d’être une décision (même raison que
 * `refCompanions`).
 * ⚠️ LA FORME D’UN TIRAGE : affixe principal = la 1ʳᵉ stat du pool, 2ᵉ affixe (Magique+) =
 * la suivante, valeur et rôle civil par `advGearValue`/`advGearRoleValue` — les formules
 * du tirage lui-même, jamais une copie.
 *
 * `n` : combien de membres équiper (la référence en compte `CARAVAN.refEscort`).
 */
export function refAdvGear(level: number, n: number = CARAVAN.refEscort): AdvGear[] {
  const L = Math.max(1, level);
  // Au-delà de 3 membres les orientations bouclent (`refAdventurer` : slot % 3) — le 4ᵉ
  // est un mêlée, avec les pièces de sa lignée.
  return refEscortBare(L, n).flatMap((a, i) => {
    const lineage = lineageOf(a);
    if (!lineage) return [];
    const def = LINEAGE_GEAR[lineage];
    const rarity = advRarity(a);
    const ids = refGearIds(i);
    return ADV_GEAR_SLOTS.map((slot): AdvGear => {
      const piece = def.pieces[slot];
      const t1 = piece.pool[0]!;
      const g: AdvGear = {
        id: ids[slot],
        lineage,
        slot,
        name: piece.name,
        emoji: piece.emoji,
        rarity,
        roll: REF_GEAR_JET,
        level: L,
        effect: { type: t1, value: advGearValue(t1, rarity, REF_GEAR_JET) },
      };
      const t2 = piece.pool[1];
      if (t2 && RARITY_RANK[rarity] >= RARITY_RANK.magique)
        g.effect2 = { type: t2, value: advGearValue(t2, rarity, REF_GEAR_JET) };
      if (def.role && slot === 'accessory')
        g.role = { kind: def.role, value: advGearRoleValue(def.role, rarity, REF_GEAR_JET) };
      return g;
    });
  });
}

/** L’ESCORTE de référence : `CARAVAN.refEscort` aventuriers, un par orientation, chacun
 *  avec le compagnon de référence de son rang ET ses pièces de référence. */
function refEscortOf(level: number): Adventurer[] {
  return refEscortBare(level).map((a, i) => ({
    ...a,
    familiarId: `refFam${i % REF_SPECIES.length}`,
    gear: refGearIds(i),
  }));
}

/** LES BANDITS DE LA ROUTE.
 *
 *  ⚠️ DANGER **ABSOLU**, fixé par le niveau du POI et le drapeau `perilous` — et surtout
 *  PAS par l'escorte qu'on envoie. On ne réutilise donc pas `ambushCombatant`, qui est
 *  calibré RELATIVEMENT au combattant qu'on lui passe (c'est voulu pour le héros : « une
 *  rencontre de route est un ralentisseur, pas un mur »). Appliqué à une caravane, ce
 *  modèle ferait s'ADAPTER les bandits à l'escorte : une escorte faible affronterait des
 *  bandits faibles, et « combien d'aventuriers j'envoie » ne voudrait plus rien dire —
 *  la feature perdrait sa seule décision. Même virage que le Labyrinthe en v0.563.23.
 *
 *  L'échelle est exprimée en unités d'ESCORTE DE RÉFÉRENCE (`CARAVAN.refEscort`
 *  aventuriers au niveau du POI) : absolue, mais lisible et calibrable. */
export function roadFoe(poi: Poi): Combatant {
  const escort = refEscortOf(poi.level);
  const ref = escortCombatant(
    escort,
    'Référence',
    // ⚠️ La référence est ACCOMPAGNÉE et ÉQUIPÉE : c'est ce que la route attend d'un vivier.
    roadCompanionEffects(escort, {
      familiars: refCompanions(poi.level),
      talents: [],
      advGear: refAdvGear(poi.level),
    }),
  );
  const m = poi.perilous ? CARAVAN.perilousMult : 1;
  return {
    name: poi.perilous ? 'Pillards de la passe' : 'Bandits de grand chemin',
    pv: Math.max(1, Math.round(offensePerRound(ref) * CARAVAN.foePvTurns * m)),
    damage: Math.max(1, Math.round(effectivePv(ref) * CARAVAN.foeDmgPctPv * m)),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
  };
}

/**
 * Taille d’escorte à proposer pour CE convoi — la PART qui lui revient.
 *
 * ⚠️ Signalé : « si j’ai 2 convois et 4 aventuriers, que ça ne me propose pas 4 sur un
 * convoi et 0 sur le second ». Une suggestion qui ne regarde que le convoi courant vide
 * le vivier au premier envoi — et les créneaux restants, qu’on a payés en niveaux de
 * Comptoir, ne servent plus à rien.
 *
 * On arrondit vers le HAUT : à 7 disponibles pour 2 convois, mieux vaut 4 puis 3 que
 * 3 puis 3 en laissant quelqu’un à la maison. Bornée par `CARAVAN.escortMax` — au-delà
 * de 4, mesuré, le convoi tient déjà 93-100 % de ses embuscades et le cinquième ne
 * ferait que supprimer la décision.
 */
export function escortShare(available: number, convoysLeft: number): number {
  const n = Math.max(0, Math.floor(available));
  if (!n) return 0;
  const parts = Math.max(1, Math.floor(convoysLeft));
  return Math.max(1, Math.min(CARAVAN.escortMax, n, Math.ceil(n / parts)));
}

/**
 * Compose une escorte ÉQUILIBRÉE pour ce voyage.
 *
 * ⚠️ « Équilibrée » veut dire DEUX choses, et l’une sans l’autre ne sert à rien :
 * l’effectif est la part qui revient à ce convoi (`escortShare`), et la composition
 * couvre des RÔLES DISTINCTS plutôt que d’empiler la même compétence. Un second 🐫
 * n’ajoute qu’un cran à une cargaison déjà plafonnée, là où un 🧭 raccourcit le trajet
 * et un 👁️ évite des embuscades : ce sont des canaux SÉPARÉS.
 *
 * ⚠️ L’ORDRE DES RÔLES DÉPEND DE LA ROUTE, il n’est pas figé : sur une route périlleuse
 * (deux fois plus de rencontres, annoncées AVANT le départ) l’éclaireur passe devant —
 * c’est le seul rôle qui agit sur le risque lui-même. Ailleurs, la cargaison prime.
 *
 * ⚠️ À rôle égal, on départage par la VRAIE force de l’escorte (`escortCombatant` +
 * `combatPower`, l’arbitre de tout le jeu) — jamais par une somme de stats recopiée :
 * une étiquette qui refait le calcul à sa façon finit par diverger du combat.
 *
 * Ce n’est PAS un optimiseur : il propose une équipe défendable, le joueur tranche.
 */
export function suggestEscort(
  available: Adventurer[],
  poi: Poi,
  convoysLeft: number,
): Adventurer[] {
  const size = escortShare(available.length, convoysLeft);
  if (!size) return [];
  // Une route dangereuse se prépare : éviter la rencontre vaut mieux que la gagner.
  const ordre: AdvRole[] = poi.perilous
    ? ['scout', 'haul', 'heal', 'speed']
    : ['haul', 'speed', 'scout', 'heal'];
  const pool = [...available];
  const team: Adventurer[] = [];
  while (team.length < size && pool.length) {
    const couverts = new Set(team.flatMap((a) => advRoles(a)));
    // Le meilleur rôle NEUF qu'un candidat apporterait — plus il est haut dans l'ordre
    // de la route, plus il compte. Aucun rôle neuf → on juge sur la force seule.
    const apport = (a: Adventurer) => {
      const neufs = advRoles(a).filter((r) => !couverts.has(r));
      const best = neufs.reduce((m, r) => Math.min(m, ordre.indexOf(r)), ordre.length);
      return best === ordre.length ? -1 : ordre.length - best;
    };
    const force = (a: Adventurer) => combatPower(escortCombatant([...team, a]));
    let pick = 0;
    for (let i = 1; i < pool.length; i++) {
      const d = apport(pool[i]!) - apport(pool[pick]!);
      if (d > 0 || (d === 0 && force(pool[i]!) > force(pool[pick]!))) pick = i;
    }
    team.push(...pool.splice(pick, 1));
  }
  return team;
}

/** Trajet ALLER d'une caravane, en minutes : celui d'un héros, ralenti, puis raccourci
 *  par les rôles 🧭 de l'escorte ET par les pièces qui portent ce rôle (`gearSpeed`,
 *  cf. `advGearRoles`) — les deux sous le MÊME plafond.
 *  ⚠️ `comptoirLevel` et `gearSpeed` sont REQUIS : l'écran omettait le Comptoir et
 *  annonçait un trajet plus long que celui que le convoi fait réellement. */
export function caravanLegMin(
  poi: Poi,
  escort: Adventurer[],
  comptoirLevel: number,
  gearSpeed: number,
): number {
  const hero = travelOneWayMin(poi.level, poi.distNorm);
  const speed = Math.min(
    CARAVAN.speedMax,
    countRole(escort, 'speed') * CARAVAN.speedPerRole + Math.max(0, gearSpeed),
  );
  return Math.max(1, Math.round(hero * caravanSlowFor(comptoirLevel) * (1 - speed)));
}

/** ⚠️ LA CARGAISON SE PAIE SUR LA DURÉE QU'UN HÉROS AURAIT MISE, pas sur celle de la
 *  caravane. `travelFactor` est SUPER-LINÉAIRE (exposant 1,4) : payer une caravane sur son
 *  temps réel ferait de sa lenteur une PRIME (ralentir de ×1,5 paierait ×1,75 de plus) et
 *  elle écraserait l'expédition du héros. Le marché doit rester lisible : la caravane
 *  coûte plus de TEMPS (abondant) et zéro ÉNERGIE (rare) ; elle ne rapporte pas plus. */
export function heroEquivalentFactor(poi: Poi): number {
  return tripFactor(poi.level, poi.distNorm);
}

/** Le facteur de trajet d'un POI, à niveau et distance donnés. Extrait pour que l'XP et
 *  la cargaison lisent LA MÊME courbe : deux copies auraient divergé au premier réglage
 *  de `TRAVEL_EXP`, et l'une des deux aurait cessé de payer la distance. */
function tripFactor(level: number, distNorm: number): number {
  return travelFactor((2 * travelOneWayMin(level, distNorm)) / 60);
}

/**
 * Ce que la DISTANCE vaut à l'XP d'une mission.
 *
 * ⚠️ SANS LUI, ALLER LOIN ÉTAIT UNE PERTE SÈCHE POUR LE VIVIER. Le niveau d'un POI
 * découle bien de sa distance (v0.683), donc l'XP montait un peu en s'éloignant — mais
 * le TRAJET, lui, montait vingt fois plus vite. Mesuré au niveau 28 : le POI le plus
 * proche rendait 85 XP/h, le plus lointain 5 — un rapport de 17. Le convoi n'ayant qu'un
 * nombre borné de créneaux, c'est bien le rendement HORAIRE qui décide : la stratégie
 * optimale était de faire la navette au pied de la ville, et les trois quarts de la
 * carte ne servaient plus à rien pour élever ses aventuriers.
 *
 * ⚠️ ON RÉUTILISE LA COURBE DE LA CARGAISON (`travelFactor`, super-linéaire), pas une
 * seconde règle : c'est déjà elle qui fait qu'un long voyage paie plus que
 * proportionnellement. L'XP suit donc la même pente, et « loin » redevient un arbitrage
 * cohérent d'un bout à l'autre de l'économie.
 *
 * ⚠️ RAPPORTÉ À LA DISTANCE MÉDIANE, et c'est ce qui préserve la calibration : une
 * mission de mi-carte vaut exactement ce qu'elle valait. On ne dope pas la montée en
 * niveau, on la REDISTRIBUE — le proche paie moins, le lointain davantage.
 *
 * ⚠️ Il se calcule sur la durée qu'un HÉROS aurait mise, jamais sur celle de la
 * caravane : payer le temps réel ferait de la lenteur une prime (même raison que
 * `heroEquivalentFactor`), et un Comptoir bas niveau rapporterait plus d'XP qu'un haut.
 */
export function missionTravelMult(poi: Poi): number {
  return tripFactor(poi.level, poi.distNorm) / tripFactor(poi.level, CARAVAN.xpRefDist);
}

/** Salaires d'une mission — un PUITS D'OR, et la contrepartie de la prestation. */
export function caravanWages(escort: Adventurer[], poi: Poi): number {
  return escort.reduce(
    (sum, a) =>
      sum + Math.round(CARAVAN.wageBase * strataFor(a.level) * Math.max(1, poi.level) ** 0.7),
    0,
  );
}

/** XP de MISSION d'un membre — le socle, versé quel que soit le résultat, même sans combat.
 *
 *  `ratio` : RENDEMENT DÉCROISSANT quand la route est très en dessous du niveau de
 *  l'aventurier — sans lui, un vétéran engrange sur des routes qui ne lui apprennent rien.
 *  `travel` : la DISTANCE (cf. `missionTravelMult`) — sans lui, la navette au pied de la
 *  ville rendait 17 fois plus d'XP à l'heure que le bout de la carte.
 *
 *  ⚠️ Les deux ne font PAS double emploi : le premier regarde le niveau de la route, le
 *  second son éloignement. Ils se corrèlent (le niveau découle de la distance) sans se
 *  confondre — un vétéran envoyé loin sur une carte de bas niveau reste bridé.
 *  ⚠️ L'ancien bonus forfaitaire par combat traversé (`xpPerFight`, +20 % par embuscade)
 *  est REMPLACÉ par la part des bandits ABATTUS (`skirmishXpShares`), ajoutée dans
 *  `resolveCaravan` : on paie ce qui a été fait, et non plus le simple fait d'avoir croisé du monde. */
export function missionXp(adv: Adventurer, poi: Poi): number {
  const ratio = Math.max(0.15, Math.min(2, poi.level / Math.max(1, adv.level)));
  const travel = missionTravelMult(poi);
  return Math.max(1, Math.round(trialXpBase(poi.level) * Math.min(1, ratio) ** 1.5 * travel));
}

/** Convois simultanés qu'autorise le Comptoir. ⚠️ SECOND garde-fou de l'inflation :
 *  le rendement par convoi est bridé (`yieldShare`), mais c'est le NOMBRE qui multiplie.
 *  Un débutant en a un seul ; le plafond reste bas, et le niveau du Comptoir est lui-même
 *  plafonné par celui du joueur — donc par le sport. */
export function caravanSlots(comptoirLevel: number): number {
  return Math.max(1, 1 + Math.floor(Math.max(0, comptoirLevel) / CARAVAN.slotEvery));
}

/** Ce que le Comptoir apporte ENTRE deux convois gagnés : il accélère les convois.
 *
 *  ⚠️ C'est la réponse à « aucun niveau mort » pour un bâtiment dont la grandeur
 *  naturelle (le nombre de convois) doit rester bornée — on ne veut pas de caravanes par
 *  dizaines. Le NOMBRE monte lentement, la VITESSE continue sans fin. Et elle est
 *  ASYMPTOTIQUE : la caravane se rapproche du temps du héros **sans jamais l'atteindre**,
 *  parce que « plus lente que le héros » est son identité — la rendre plus rapide
 *  retirerait toute raison d'envoyer le héros lui-même. */
export function caravanSlowFor(comptoirLevel: number): number {
  const l = Math.max(0, comptoirLevel);
  const gagne = (CARAVAN.slow - 1) * (l / (l + CARAVAN.speedHalf));
  return CARAVAN.slow - gagne;
}

/** Une caravane peut-elle partir vers ce POI ? Récolte uniquement, escorte non vide. */
/** Ce qu'on peut encore lancer vers ce lieu, selon qui est disponible.
 *
 *  ⚠️ `caravan` NE DÉPEND PAS de la disponibilité du héros, et c'est tout l'objet de
 *  cette fonction. L'écran gardait l'ENSEMBLE du panneau derrière « le héros est là »,
 *  donc envoyer un convoi devenait impossible dès que le héros partait en expédition —
 *  exactement la situation où l'on en a le plus besoin. Un convoi est une voie
 *  PARALLÈLE : c'est sa raison d'être pour qui s'entraîne peu.
 *
 *  ⚠️ En revanche `hero` en dépend : le héros ne peut mener qu'une expédition à la
 *  fois, il est physiquement parti. */
export function poiOffers(
  poi: Poi,
  opts: { heroAway: boolean; comptoirLevel: number },
): { hero: boolean; caravan: boolean } {
  return {
    hero: !opts.heroAway,
    // Les convois n'exploitent que les lieux de RÉCOLTE : le héros se bat, eux ramassent.
    caravan: opts.comptoirLevel > 0 && HARVEST_TYPES.has(poi.type),
  };
}

export function canSendCaravan(poi: Poi, escort: Adventurer[]): boolean {
  return HARVEST_TYPES.has(poi.type) && escort.length > 0 && escort.length <= CARAVAN.escortMax;
}

/** Probabilité de base qu'une jambe de trajet tourne à l'embuscade, AVANT éclaireurs. */
const AMBUSH_BASE = { calme: 0.24, perilous: 0.42 } as const;

/**
 * Ce qu'une jambe de trajet risque vraiment, une fois les éclaireurs comptés.
 *
 * ⚠️ « Repère les embuscades » veut dire les ÉVITER, pas mieux les gagner : ce
 * second terrain est déjà celui des signatures de combat, et deux mécaniques sur le même
 * levier se marchent dessus. Un convoi bien éclairé a donc une alternative à la force
 * brute — passer inaperçu.
 */
export function ambushChance(poi: Poi, escort: Adventurer[]): number {
  const base = poi.perilous ? AMBUSH_BASE.perilous : AMBUSH_BASE.calme;
  const cut = Math.min(CARAVAN.scoutMax, countRole(escort, 'scout') * CARAVAN.scoutPerRole);
  return base * (1 - cut);
}

/** Résout le voyage : les rencontres, la cargaison, la paie, les blessés.
 *  Seedé au DÉPART comme tout le reste — déterministe et hors-ligne. */
/** Ce que le convoi emmène : la réserve du joueur, moins ce que le HÉROS porte.
 *  ⚠️ Pas de `kennelLevel` : le Chenil plafonne le dressage de DÉFENSE, et sur la route
 *  personne ne plafonne ce qu’un familier a appris au combat (cf. `companionEffects`). */
export interface RoadCompanions {
  familiars: Item[];
  talents: TalentInstance[];
  /** 🗡️ Le stock d'équipement des aventuriers. ⚠️ REQUIS, comme `CompanionCtx.advGear` :
   *  un paramètre qu'on peut oublier finit par l'être. Une escorte nue passe `[]`. */
  advGear: AdvGear[];
  heroFamiliarId?: string | null;
  heroTalentIds?: readonly string[];
}

/**
 * 🐾 QUI PORTE QUOI SUR LA ROUTE, par aventurier. Les exclusions de toujours : ce que le
 * HÉROS porte n'est pas disponible, un même familier ou talent confié deux fois ne compte
 * qu'une (le premier du vivier le garde), un id fantôme est ignoré, un talent trop rare
 * pour la classe ne se porte pas, une pièce ne se porte que selon `wornGear`.
 * ⚠️ Pas de Chenil ni de fatigue ici (cf. `companionPairs` au rempart) — comportement
 * inchangé de la route.
 */
export function roadPairs(escort: Adventurer[], road: RoadCompanions): Map<string, CompanionSet> {
  const fams = new Map(road.familiars.map((f) => [f.id, f]));
  const tals = new Map(road.talents.map((t) => [t.id, t]));
  const heroTal = new Set(road.heroTalentIds ?? []);
  const worn = wornGear(escort, road.advGear);
  const prisF = new Set<string>();
  const prisT = new Set<string>();
  const out = new Map<string, CompanionSet>();
  for (const a of escort) {
    const entry: CompanionSet = {};
    const fid = a.familiarId;
    if (fid && fid !== road.heroFamiliarId && !prisF.has(fid)) {
      const f = fams.get(fid);
      if (f) {
        prisF.add(fid);
        entry.familiar = f;
      }
    }
    const tid = a.talentId;
    if (tid && !heroTal.has(tid) && !prisT.has(tid)) {
      const t = tals.get(tid);
      if (t && canAdvTalent(a, t)) {
        prisT.add(tid);
        entry.talent = t;
      }
    }
    const g = worn.get(a.id);
    if (g?.length) entry.gear = g;
    if (entry.familiar || entry.talent || entry.gear) out.set(a.id, entry);
  }
  return out;
}

/** ⚔️ L'escorte en UNITÉS DISTINCTES : chaque aventurier avec SA paire et SES pièces.
 *  ⚠️ Plus de division par l'effectif : elle n'existait que parce que l'escorte était FONDUE
 *  en un seul combattant. Ici chaque loup n'épaule que son homme. */
export function roadUnits(escort: Adventurer[], road: RoadCompanions): SkirmishUnit[] {
  const pairs = roadPairs(escort, road);
  return escort.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: advTitle(a)?.emoji ?? '⚔️',
    level: a.level,
    combatant: escortCombatant([a], a.name, unitEffects(pairs.get(a.id))),
  }));
}

/**
 * 🗡️ LES BANDITS DE LA ROUTE — une TROUPE à danger ABSOLU.
 *
 * ⚠️ Ce sont les CORPS de l'embuscade (identité, niveau, part de PV), lus par
 * `deriveSkirmish` : l'issue, elle, reste le combat fondu `roadFoe`, calibré sur les bandes.
 * ⚠️ Dimensionnée sur l'escorte de RÉFÉRENCE (`CARAVAN.refEscort` aventuriers au niveau du
 * lieu, accompagnés et équipés), jamais sur l'escorte envoyée : sinon une escorte faible
 * affronterait des bandits faibles et « combien j'en envoie » ne voudrait plus rien dire.
 */
export function roadTroop(poi: Poi): SkirmishUnit[] {
  const ref = roadUnits(refEscortOf(poi.level), {
    familiars: refCompanions(poi.level),
    talents: [],
    advGear: refAdvGear(poi.level),
  });
  const perilous = !!poi.perilous;
  return troopOf(
    ref.map((x) => x.combatant),
    {
      count: perilous ? CARAVAN.troopPerilous : CARAVAN.troopCalm,
      level: poi.level,
      pvTurns: CARAVAN.foePvTurns,
      dmgPctPv: CARAVAN.foeDmgPctPv,
      mult: perilous ? CARAVAN.perilousMult : 1,
      name: perilous ? 'Pillard de la passe' : 'Bandit de grand chemin',
      emoji: '🗡️',
    },
  );
}

/**
 * 🐾🧠 CE QUE LES COMPAGNONS APPORTENT SUR LA ROUTE — enfin branché.
 *
 * ⚠️ LE SOCLE EXISTAIT DEPUIS LA v0.758 ET N’ÉTAIT APPELÉ NULLE PART : `companionEffects('atk')`
 * n’avait aucun appelant, `escortCombatant` portait déjà un paramètre `extra` laissé vide, et
 * `companionsOf`/`advTalentsOf` n’étaient lus que par leurs tests. « Le compagnon suit son
 * homme PARTOUT, convoi comme rempart » n’était donc vrai qu’à moitié — il ne comptait qu’au mur.
 *
 * ⚠️ ON DIVISE PAR L’EFFECTIF, et c’est ce qui rend la route ÉQUIVALENTE au rempart. Là-bas
 * chaque aventurier est une unité distincte : son loup ne booste que LUI, donc quatre loups
 * font quatre combattants +x %, pas un groupe +4x %. Ici l’escorte est FONDUE en un seul
 * combattant dont les stats s’additionnent — cumuler les pourcentages y appliquerait quatre
 * fois le bonus à la totalité des dégâts. La moyenne redonne exactement le bon compte : une
 * escorte entièrement accompagnée vaut UN compagnon de bonus, et un seul loup sur quatre en
 * vaut le quart. C’est aussi ce qui interdit structurellement le retour du « pool global »
 * que la v0.777 avait supprimé.
 *
 * ⚠️ LA FATIGUE N’EST PAS LUE ICI, délibérément : le sort du convoi est tiré au DÉPART
 * (`startCaravan`) alors qu’il se joue des heures plus tard — « fatigué au moment du tirage »
 * ne voudrait rien dire. Elle reste au rempart, où l’instant du combat est celui du calcul.
 */
/** XP de DRESSAGE d’un familier qui a escorté un convoi (v0.805 ; « une expérience
 *  globale, montée par les convois et les défenses »).
 *  ⚠️ Calée sur le rapport des aventuriers : un siège gagné vaut ~1,6 convoi. Un siège
 *  de niveau 28 rend ~1 000 XP, un convoi de niveau 28 en rend ~560 — et on en envoie
 *  plusieurs par jour, là où un siège tombe au plus une fois. */
export function caravanFamiliarXp(poi: Poi): number {
  return Math.round(Math.max(1, poi.level) * 20);
}

export function roadCompanionEffects(
  escort: Adventurer[],
  road: RoadCompanions,
): AggregatedEffects {
  if (!escort.length) return emptyEffects();
  const fams = companionsOf(escort, road.familiars, road.heroFamiliarId);
  const tals = advTalentsOf(escort, road.talents, road.heroTalentIds);
  // 🗡️ Ce qu'ils PORTENT — même division par l'effectif que les compagnons, pour la même
  // raison : l'escorte est fondue en un seul combattant.
  const worn = wornGear(escort, road.advGear);
  if (!fams.length && !tals.length && !worn.size) return emptyEffects();
  return scaleEffects(
    mergeEffects(
      companionEffects(fams),
      advTalentEffects(tals),
      advGearEffects([...worn.values()].flat()),
    ),
    1 / escort.length,
  );
}

/** Multiplicateur de CARGAISON d'une escorte : rôles 🐫 + pièces qui portent ce rôle,
 *  sous UN plafond. ⚠️ Extrait pour être éprouvé directement : un plafond qu'on ne peut
 *  vérifier qu'à travers un voyage entier est un plafond qu'on ne vérifie pas. */
export function caravanHaulMult(escort: Adventurer[], stock: AdvGear[]): number {
  return (
    1 +
    Math.min(
      CARAVAN.haulMax,
      countRole(escort, 'haul') * CARAVAN.haulPerRole + advGearRoles(escort, stock).haul,
    )
  );
}

export function resolveCaravan(
  poi: Poi,
  escort: Adventurer[],
  seed: number,
  /** ⚠️ REQUIS, pas optionnel : un paramètre qu’on peut oublier finit par l’être, et c’est
   *  exactement ce qui a laissé ce socle inerte pendant vingt-six versions. Une escorte
   *  sans compagnon se déclare avec des listes vides. */
  road: RoadCompanions,
  /** ⚠️ REQUIS : niveau RÉEL du joueur. Ne sert qu'au tirage d'équipement d'aventurier
   *  (anti-runaway) — le combat de la route n'en dépend pas. */
  playerLevel: number,
): CaravanOutcome {
  const rng = mulberry32(seed >>> 0 || 1);
  // 🗡️ GÉNÉRATEUR SÉPARÉ pour l'équipement d'aventurier : `rng` est déjà seedé et lu par
  // des tests qui figent une valeur exacte (bandes d'embuscade, cargaison, temps de
  // trajet…) — un tirage de plus sur CE flux décalerait tous les tirages suivants. Même
  // idiome que le reste du projet (`(seed ^ constante) >>> 0 || 1`), même constante que
  // `lootCorpses` (deux flux distincts, l'un du seed d'un cadavre, l'autre du seed d'un
  // voyage : aucun risque de collision entre les deux).
  const gearRng = mulberry32((seed ^ 0x27d4eb2f) >>> 0 || 1);
  const events: CaravanEvent[] = [];
  const hurt: string[] = [];
  const advGear: Omit<AdvGear, 'id'>[] = [];
  let mult = 1;
  let keysBonus = 0;

  // ⚔️ L'issue d'une embuscade reste le COMBAT FONDU calibré (`guards` contre `foe`) : les
  // bandes de route en dépendent. Le groupe — qui tombe, qui abat qui — n'est qu'une LECTURE
  // de son journal (`deriveSkirmish`), jamais un second combat.
  const foe = roadFoe(poi);
  const guards = escortCombatant(escort, 'Escorte', roadCompanionEffects(escort, road));
  // Unités et troupe calculées à la première embuscade seulement (la troupe dérive d'une
  // escorte de référence entière : inutile sur une route tranquille).
  let group: { units: SkirmishUnit[]; troop: SkirmishUnit[] } | null = null;
  const kills: Record<string, number> = Object.fromEntries(escort.map((a) => [a.id, 0]));
  const xpShare: Record<string, number> = Object.fromEntries(escort.map((a) => [a.id, 0]));
  // Une rencontre par jambe de trajet — deux fois plus sur une route dangereuse.
  const legs = poi.perilous ? 4 : 2;
  const base = poi.perilous ? AMBUSH_BASE.perilous : AMBUSH_BASE.calme;
  const amb = ambushChance(poi, escort);
  for (let i = 0; i < legs; i++) {
    const roll = rng();
    if (roll < amb) {
      const legSeed = (seed + i * 7919) >>> 0;
      const r = simulateCombat(guards, { ...foe }, { seed: legSeed, goldOnWin: 0 });
      group ??= { units: roadUnits(escort, road), troop: roadTroop(poi) };
      // ⚠️ `deriveSkirmish` tire sur SON générateur (graine de la jambe) : `rng` n'est pas lu,
      // donc les rencontres suivantes et la cargaison restent celles du combat fondu.
      const d = deriveSkirmish(
        { log: r.log, win: r.win, allyPv: guards.pv, foePv: foe.pv },
        group.units,
        group.troop,
        legSeed,
      );
      const abattus = d.foesDown.length;
      const pl = abattus > 1 ? 's' : '';
      events.push({
        kind: 'bandits',
        won: r.win,
        kills: abattus,
        fallen: d.down.length,
        text: r.win
          ? `Une embuscade repoussée (${abattus} bandit${pl} abattu${pl}).`
          : `Des bandits emportent une part du convoi (${abattus} abattu${pl} sur ${group.troop.length}).`,
      });
      for (const a of escort) kills[a.id] = (kills[a.id] ?? 0) + (d.killsBy[a.id] ?? 0);
      const parts = skirmishXpShares(escort, group.troop, d);
      for (const a of escort) xpShare[a.id] = (xpShare[a.id] ?? 0) + (parts[a.id] ?? 0);
      // 🤕 Le JOURNAL dit qui est tombé : ceux-là partent à l'infirmerie, gagné ou perdu.
      // ⚠️ Il remplace le tirage d'UNE victime au hasard : une embuscade PERDUE fait tomber
      // TOUTE l'escorte (le combattant fondu est à zéro), donc toute l'escorte est blessée.
      for (const id of d.down) if (!hurt.includes(id)) hurt.push(id);
      if (r.win) {
        mult *= 1.12;
        // 🗡️ Une embuscade REPOUSSÉE peut laisser une pièce d'équipement d'aventurier —
        // jamais une embuscade subie, on ne fouille pas les bandits qui ont gagné. Tirée
        // sur `gearRng` (cf. plus haut), jamais `rng`.
        // ⚠️ `playerLevel` = le VRAI niveau du joueur, jamais `poi.level` : un lieu peut
        // être 10 niveaux au-dessus de lui, et l'anti-runaway se lit sur le joueur.
        const piece = rollAdvGearDrop(gearRng, escort, {
          chance: ADV_GEAR_DROP.ambush,
          level: poi.level,
          luck: poi.perilous ? 0.3 : 0.1,
          playerLevel,
        });
        if (piece) advGear.push(piece);
      } else {
        mult *= CARAVAN.lossKeep;
        // ⚠️ TIRAGE CONSERVÉ, résultat ignoré : il désignait l'ancienne victime unique. Le
        // retirer décalerait `rng` après chaque défaite — rencontres et cargaison des jambes
        // suivantes changeraient, et la route ne serait plus celle qui a été calibrée.
        rng();
      }
      // ⚠️ Les bandes SUIVANTES repartent de `base`, pas de `amb` : ce que l'éclaireur
      // fait éviter doit devenir une ROUTE CALME, jamais une cache. Sinon il ne
      // réduirait pas le risque, il fabriquerait du butin — et son libellé mentirait.
      // Sans éclaireur, `amb === base` et les bandes sont EXACTEMENT celles d'avant.
    } else if (roll >= base && roll < 0.34) {
      events.push({ kind: 'cache', text: 'Une cache oubliée le long de la route.' });
      mult *= 1.1;
      keysBonus += rng() < 0.25 ? 1 : 0;
    } else if (roll >= base && roll < 0.42) {
      events.push({ kind: 'detour', text: 'Un pont coupé : le convoi allonge.' });
      mult *= 0.92;
    } else {
      events.push({ kind: 'calme', text: 'Route tranquille.' });
    }
  }

  const tfH = heroEquivalentFactor(poi);
  const haul = caravanHaulMult(escort, road.advGear);
  const k = mult * haul;
  const raw = harvestYield(poi.type, poi.level, tfH);
  const y = {
    energy: raw.energy * CARAVAN.yieldShare,
    summonStones: raw.summonStones * CARAVAN.yieldShare,
    scrap: raw.scrap * CARAVAN.yieldShare,
    keys: raw.keys,
  };
  const wages = caravanWages(escort, poi);
  // XP = le socle de mission (toujours versé) + la part des bandits abattus (partagée).
  const xp: Record<string, number> = {};
  for (const a of escort) xp[a.id] = missionXp(a, poi) + (xpShare[a.id] ?? 0);

  return {
    // ⚠️ Le plafond d'énergie s'applique APRÈS les multiplicateurs : « complément, jamais
    // substitut au sport » est un invariant, pas une base qu'un bon voyage dépasserait.
    gold: Math.round(goldCost(poi.type, poi.level) * 0.3 * k),
    // ⚠️ L'ARRONDI EN DERNIER, et ce n'est pas cosmétique : `y.energy` vaut la part
    // brute × `yieldShare` (0,5), donc il tombe sur un DEMI. Avec l'arrondi à
    // l'intérieur du `min`, dès que les multiplicateurs valaient ≥ 1 c'était la valeur
    // FRACTIONNAIRE qui gagnait — et `login_energy` est une colonne ENTIÈRE : la
    // sauvegarde partait en `invalid input syntax for type integer: "1234.5"`, la
    // promesse était rejetée sans que rien ne l'attrape, et le joueur cliquait
    // « Récupérer » sans qu'il ne se passe RIEN. Une cargaison était irrécupérable à vie.
    energy: Math.round(Math.min(y.energy, y.energy * k)),
    summonStones: Math.round(y.summonStones * k),
    scrap: Math.round(y.scrap * k),
    keys: Math.round(y.keys * Math.min(1.2, k)) + keysBonus,
    wages,
    xp,
    kills,
    hurt,
    events,
    text: events.map((e) => e.text).join(' '),
    advGear,
  };
}

/** Temps de formation d'une promotion, raccourci par le Centre. ⚠️ ASYMPTOTIQUE : chaque
 *  niveau retire encore un peu, de moins en moins, et une formation garde TOUJOURS une
 *  durée — un Centre de niveau 100 ne doit pas rendre les promotions instantanées.
 *  L'ancien `1 − 0,04 × niveau` plafonnait à 0,25 dès le niveau 20 : 81 niveaux morts. */
export function trainMsFor(trainingLevel: number, stratum = 1): number {
  const l = Math.max(0, trainingLevel);
  const gain = CARAVAN.trainMaxGain * (l / (l + CARAVAN.trainHalf));
  return Math.round(CARAVAN.trainMs * (1 - gain) * stratumTrainMult(stratum));
}

/** Ce que coûte en TEMPS le rang visé, relativement à la 1re promotion.
 *
 *  ⚠️ La durée ne dépendait QUE du Centre : devenir Primordial coûtait exactement le
 *  même temps que devenir Inhabituel. Un palier qui ne se paie pas n'est pas un palier.
 *
 *  ⚠️ LE TEMPS DOUBLE À CHAQUE RANG, et c'est un choix plus RAIDE que le pas de rareté
 *  du projet (1,219, qui régit les stats) : monter d'un rang doit se SENTIR, et une
 *  échelle géométrique franche se lit sans notice (« le double du précédent »). Ancré
 *  sur une 1re promotion TRÈS RAPIDE (`CARAVAN.trainMs`), pour que le début de partie
 *  reste fluide — c'est précisément là que vit le joueur peu sportif que cette boucle
 *  vise, et il ne doit pas attendre une nuit pour sa première classe. */
export function stratumTrainMult(stratum: number): number {
  return 2 ** (Math.max(1, Math.round(stratum)) - 1);
}

/** Durée de convalescence d'un blessé, raccourcie par les 🩺 de l'escorte ET par
 *  l'Infirmerie (le même bâtiment qui soigne le héros et les familiers). */
export function caravanHurtMs(escort: Adventurer[], infirmaryLevel = 0): number {
  const care = Math.min(0.6, countRole(escort, 'heal') * CARAVAN.carePerRole);
  const inf = Math.max(0.25, 1 - Math.max(0, infirmaryLevel) * 0.05);
  return Math.round(CARAVAN.hurtMs * (1 - care) * inf);
}

/** Prépare un convoi : le POI est consommé par l'appelant, comme pour le héros. */
export function startCaravan(
  id: string,
  poi: Poi,
  escort: Adventurer[],
  now: number,
  seed: number,
  road: RoadCompanions,
  /** ⚠️ REQUIS : le trajet du convoi dépend du Comptoir — l'oublier le rallongerait. */
  comptoirLevel: number,
  /** ⚠️ REQUIS : niveau RÉEL du joueur (cf. `resolveCaravan`). */
  playerLevel: number,
): Caravan {
  const leg =
    caravanLegMin(poi, escort, comptoirLevel, advGearRoles(escort, road.advGear).speed) * 60_000;
  return {
    id,
    poi,
    escort: escort.map((a) => a.id),
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    outcome: resolveCaravan(poi, escort, seed, road, playerLevel),
    claimed: false,
  };
}

/** La cargaison est-elle récupérable ? Le convoi doit être RENTRÉ, et pas déjà encaissé.
 *  ⚠️ `claimed === undefined` = déjà crédité, jamais « à récupérer ». */
export function isCaravanClaimable(c: Caravan, now: number): boolean {
  return c.claimed === false && now >= c.returnAt;
}

// ── 📜 RAPPORT DE CONVOI (v0.853 ; demandé par l’utilisateur : « les aventuriers concernés et
// leur gain d’XP, pour voir la différence entre un long convoi et un court, et rappeler le
// temps de voyage ») ─────────────────────────────────────────────────────────────────────

interface CaravanReportMember {
  id: string;
  name: string;
  emoji: string;
  xp: number;
  hurt: boolean;
  /** Plus dans le vivier (renvoyé depuis) : on garde sa ligne, l’XP a bien été versée. */
  gone: boolean;
}
export interface CaravanReport {
  /** Durée TOTALE du voyage, aller et retour. */
  travelMs: number;
  members: CaravanReportMember[];
  totalXp: number;
  /** XP par aventurier et par heure de voyage — le chiffre qui compare un convoi long à
   *  un court, puisque c’est le temps que l’escorte passe immobilisée. */
  xpPerHour: number;
  /** Cargaison BRUTE (les salaires sont une dépense à part, cf. `wages`). */
  pills: { emoji: string; n: number }[];
  wages: number;
  events: CaravanEvent[];
}

/**
 * Ce qu’un convoi a rapporté, lisible après coup.
 *
 * ⚠️ Tout vient du convoi STOCKÉ (`outcome` tiré au départ), jamais d’un recalcul : le
 * rapport dit ce qui a été versé, pas ce que la formule du jour verserait. Les montants sont
 * arrondis comme à l’encaissement (des cargaisons anciennes portent des demis).
 */
export function caravanReport(van: Caravan, roster: readonly Adventurer[]): CaravanReport {
  const o = van.outcome;
  const hurt = new Set(o.hurt);
  const members = van.escort.map((id): CaravanReportMember => {
    const adv = roster.find((a) => a.id === id);
    return {
      id,
      name: adv?.name ?? 'Aventurier parti',
      emoji: (adv && advTitle(adv)?.emoji) || '⚔️',
      xp: Math.max(0, Math.round(o.xp[id] ?? 0)),
      hurt: hurt.has(id),
      gone: !adv,
    };
  });
  const totalXp = members.reduce((n, m) => n + m.xp, 0);
  const travelMs = Math.max(0, van.returnAt - van.sentAt);
  const hours = travelMs / 3_600_000;
  const ent = (n: number) => Math.max(0, Math.round(n || 0));
  return {
    travelMs,
    members,
    totalXp,
    xpPerHour: members.length && hours > 0 ? totalXp / members.length / hours : 0,
    pills: haulPills({
      gold: ent(o.gold),
      energy: ent(o.energy),
      scrap: ent(o.scrap),
      summonStones: ent(o.summonStones),
      key: ent(o.keys),
    }),
    wages: ent(o.wages),
    events: o.events,
  };
}

/** Les convois déjà ENCAISSÉS, du plus récent au plus ancien (l’historique des rapports).
 *  ⚠️ `claimed === undefined` compte aussi : ce sont des convois crédités avant
 *  l’encaissement manuel, leur rapport existe. */
export function claimedCaravans(list: readonly Caravan[]): Caravan[] {
  return list.filter((c) => c.claimed !== false).sort((a, b) => b.returnAt - a.returnAt);
}
