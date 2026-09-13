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
  famLevel,
  famAtkMult,
  famDefMult,
  type AggregatedEffects,
  type Item,
} from './items';
import { simulateCombat, mulberry32, combatPower, type Combatant } from './combat';
// ⚠️ Type SEUL : `raid.ts` importera `garrisonCombatant` à l'exécution, donc un import
// de valeur dans l'autre sens créerait un cycle. Le projet applique déjà cette règle
// entre `data/familiars` et `items`.
import { effectsOfTalents, type TalentInstance } from './talents';
import {
  HARVEST_TYPES,
  harvestYield,
  goldCost,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from './expedition';
import {
  advRoles,
  advSignatureLevels,
  advStats,
  escortRoleLevel,
  PROMO_LEVELS,
  type Adventurer,
  type AdvRole,
} from './adventurers';

export const CARAVAN = {
  /** Une caravane va PLUS LENTEMENT qu'un héros — c'est ce qui incarne « du temps au lieu
   *  de l'énergie », et ce qui la distingue de l'expédition (rapide, chère en énergie). */
  slow: 1.5,
  /** Escorte maximale par convoi. */
  escortMax: 4,
  /** Taille de l'escorte de RÉFÉRENCE qui sert de mètre-étalon à la route. */
  refEscort: 3,
  /** PV d'un groupe de bandits ≈ N tours d'offense de l'escorte de référence.
   *  Mesuré à 5 : 3 aventuriers (la référence) tiennent 67-95 % selon le niveau, 4 tiennent
   *  93-100 %, 2 seulement 3-41 %. C'est ce gradient qui fait de « combien j'en envoie »
   *  une décision — à 2,2 tours, 3 aventuriers gagnaient 100 % PARTOUT et le choix était mort. */
  foePvTurns: 4,
  /** Ils mordent ~N % des PV EFFECTIFS de la référence (PV ÷ (1 − réduction)) par coup.
   *  ⚠️ EFFECTIFS, et non bruts : la réduction de dégâts croît avec le niveau, donc une
   *  morsure calée sur les PV bruts rendait le début de partie BEAUCOUP plus dur que la
   *  fin (mesuré : 12 % de tenue au niveau 5 contre 98 % au niveau 70, à escorte égale). */
  foeDmgPctPv: 0.22,
  /** Route dangereuse (`Poi.perilous`, tirée au spawn donc annonçable AVANT le départ). */
  perilousMult: 1.35,
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
  /** Ce qu'une embuscade RÉELLEMENT traversée ajoute à l'XP, par combat (gagné OU perdu).
   *  ⚠️ Remplace un +30 % forfaitaire versé dès que la route était étiquetée « périlleuse » :
   *  mesuré, l'XP était identique (49) qu'il y ait eu 1, 2 ou 3 embuscades — on payait
   *  l'étiquette, pas l'épreuve. Une route périlleuse tirant deux fois plus de rencontres,
   *  elle reste naturellement plus formatrice, mais parce qu'il s'y passe quelque chose. */
  xpPerFight: 0.2,
  xpFightMax: 0.6,
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
  /** Ids des aventuriers blessés (→ infirmerie). */
  hurt: string[];
  events: CaravanEvent[];
  text: string;
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

/** PV EFFECTIFS : ce qu’il faut vraiment infliger pour tomber, réduction comprise. */
function effectivePv(c: Combatant): number {
  return c.pv / Math.max(0.35, 1 - (c.dmgReduction ?? 0));
}
/** Offense par tour d'un combattant — l'unité dans laquelle on exprime les PV adverses. */
function offensePerRound(c: Combatant): number {
  return Math.max(1, c.damage * (c.strikes ?? 1) * (1 + c.crit));
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

/** Part de l'effet d'un compagnon qui profite à son aventurier.
 *  ⚠️ BRIDÉE, et pour la même raison que `GARRISON_K` au chenil : un familier de haut
 *  rang porte des pourcentages calibrés pour le HÉROS, dont la puissance croît en ~L⁴.
 *  Collés tels quels sur une escorte, ils écraseraient la calibration des embuscades —
 *  mesurée, et sur laquelle repose le seul vrai choix de la feature (« combien
 *  j'envoie »). */
export const COMPANION_K = 0.4;

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
  const byId = new Map(owned.map((i) => [i.id, i]));
  const taken = new Set<string>();
  const out: Item[] = [];
  for (const a of advs) {
    const id = a.familiarId;
    if (!id || id === heroFamiliarId || taken.has(id)) continue;
    const f = byId.get(id);
    if (!f) continue;
    taken.add(id);
    out.push(f);
  }
  return out;
}

/**
 * Ce que les compagnons apportent, en effets.
 *
 * ⚠️ LE DRESSAGE SUIT LE TERRAIN, et c'est ce qui garde les deux carrières du familier
 * vivantes : sur la route il se bat (`'atk'`), au rempart il défend (`'def'`). Le même
 * animal ne vaut donc pas la même chose aux deux endroits — exactement ce que le chenil
 * faisait déjà, mais rattaché à un homme plutôt qu'à un mur.
 */
/**
 * Niveau de dressage DÉFENSIF effectif d'un familier : plafonné par le CHENIL.
 *
 * ⚠️ C'est le bâtiment qui entraîne — un familier ne peut pas dépasser l'école qui le
 * forme. La règle vivait en TROIS exemplaires (ici en ligne, `cappedDefLevel` dans
 * `raid.ts`, et recopiée dans le panneau de la Guilde) : le jour où le Chenil accorde
 * une tolérance, l'écran afficherait « 🛡️ 3/5 » pendant que le combat en compterait 5.
 */
export function cappedDefLevel(fam: Item, kennelLevel: number): number {
  return Math.min(famLevel(fam.defXp, 'def'), Math.max(0, kennelLevel));
}

export function companionEffects(
  companions: Item[],
  kind: 'atk' | 'def',
  k = COMPANION_K,
  /** Plafond de DRESSAGE imposé par le Chenil — le 3ᵉ levier du bâtiment, et celui
   *  qui le garde vivant jusqu’au niveau 100. C’est lui qui entraîne : un familier ne
   *  peut pas dépasser l’école qui le forme. ⚠️ Ne vaut QUE pour `'def'` — sur la
   *  route, personne ne plafonne ce qu’il a appris au combat. */
  capLevel?: number,
): AggregatedEffects {
  const list = companions.flatMap((f) => {
    const def = capLevel === undefined ? famLevel(f.defXp, 'def') : cappedDefLevel(f, capLevel);
    const mult = k * (kind === 'atk' ? famAtkMult(famLevel(f.atkXp, 'atk')) : famDefMult(def));
    const parts = [asAggregate(f.effect.type, f.effect.value * mult)];
    // La SIGNATURE ✦ d'un familier compte aussi : c'est ce qui fait sa valeur au drop.
    if (f.effect2) parts.push(asAggregate(f.effect2.type, f.effect2.value * mult));
    return parts;
  });
  return list.length ? mergeEffects(...list) : emptyEffects();
}

/** Part de l'effet d'un talent qui profite à son aventurier.
 *  ⚠️ Constante SÉPARÉE de `COMPANION_K` bien qu'elles vaillent pareil aujourd'hui : ce
 *  sont deux leviers d'équilibrage distincts, et les fusionner interdirait de corriger
 *  l'un sans déplacer l'autre. */
export const ADV_TALENT_K = 0.4;

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
export function advTalentsOf(
  advs: Adventurer[],
  owned: TalentInstance[],
  heroTalentIds: readonly string[] = [],
): TalentInstance[] {
  const byId = new Map(owned.map((t) => [t.id, t]));
  const hero = new Set(heroTalentIds);
  const taken = new Set<string>();
  const out: TalentInstance[] = [];
  for (const a of advs) {
    const id = a.talentId;
    if (!id || hero.has(id) || taken.has(id)) continue;
    const t = byId.get(id);
    if (!t) continue;
    taken.add(id);
    out.push(t);
  }
  return out;
}

/** Ce que ces talents apportent, BRIDÉ.
 *  ⚠️ On force `equipped: true` : le cumul ignore ce qui ne l'est pas, et un talent
 *  confié à un aventurier n'est justement PAS équipé sur le héros — sans ça, la fonction
 *  rendrait zéro en silence. */
export function advTalentEffects(talents: TalentInstance[], k = ADV_TALENT_K): AggregatedEffects {
  if (!talents.length) return emptyEffects();
  return scaleEffects(effectsOfTalents(talents.map((t) => ({ ...t, equipped: true }))), k);
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

/** L’ESCORTE de référence : `CARAVAN.refEscort` aventuriers, un par orientation. */
function refEscortOf(level: number): Adventurer[] {
  return Array.from({ length: CARAVAN.refEscort }, (_, i) => refAdventurer(level, i));
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
  const ref = escortCombatant(refEscortOf(poi.level), 'Référence');
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
 *  par les rôles 🧭 de l'escorte. */
export function caravanLegMin(poi: Poi, escort: Adventurer[], comptoirLevel = 0): number {
  const hero = travelOneWayMin(poi.level, poi.distNorm);
  const speed = Math.min(CARAVAN.speedMax, countRole(escort, 'speed') * CARAVAN.speedPerRole);
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

/** XP gagnée par chaque membre — trois termes, et chacun répond à un abus précis.
 *
 *  `ratio` : RENDEMENT DÉCROISSANT quand la route est très en dessous du niveau de
 *  l'aventurier — sans lui, un vétéran engrange sur des routes qui ne lui apprennent rien.
 *  `travel` : la DISTANCE (cf. `missionTravelMult`) — sans lui, la navette au pied de la
 *  ville rendait 17 fois plus d'XP à l'heure que le bout de la carte.
 *  `learned` : les embuscades RÉELLEMENT traversées, gagnées ou perdues.
 *
 *  ⚠️ Les deux premiers ne font PAS double emploi : le premier regarde le niveau de la
 *  route, le second son éloignement. Ils se corrèlent (le niveau découle de la distance)
 *  sans se confondre — un vétéran envoyé loin sur une carte de bas niveau reste bridé. */
export function missionXp(adv: Adventurer, poi: Poi, fights = 0): number {
  const ratio = Math.max(0.15, Math.min(2, poi.level / Math.max(1, adv.level)));
  const base = 6 + poi.level * 1.6;
  const travel = missionTravelMult(poi);
  const learned = 1 + Math.min(CARAVAN.xpFightMax, Math.max(0, fights) * CARAVAN.xpPerFight);
  return Math.max(1, Math.round(base * Math.min(1, ratio) ** 1.5 * travel * learned));
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
  heroFamiliarId?: string | null;
  heroTalentIds?: readonly string[];
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
export function roadCompanionEffects(
  escort: Adventurer[],
  road: RoadCompanions,
): AggregatedEffects {
  if (!escort.length) return emptyEffects();
  const fams = companionsOf(escort, road.familiars, road.heroFamiliarId);
  const tals = advTalentsOf(escort, road.talents, road.heroTalentIds);
  if (!fams.length && !tals.length) return emptyEffects();
  return scaleEffects(
    mergeEffects(companionEffects(fams, 'atk'), advTalentEffects(tals)),
    1 / escort.length,
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
): CaravanOutcome {
  const rng = mulberry32(seed >>> 0 || 1);
  const events: CaravanEvent[] = [];
  const hurt: string[] = [];
  let mult = 1;
  let keysBonus = 0;

  const foe = roadFoe(poi);
  const guards = escortCombatant(escort, 'Escorte', roadCompanionEffects(escort, road));
  // Une rencontre par jambe de trajet — deux fois plus sur une route dangereuse.
  const legs = poi.perilous ? 4 : 2;
  const base = poi.perilous ? AMBUSH_BASE.perilous : AMBUSH_BASE.calme;
  const amb = ambushChance(poi, escort);
  for (let i = 0; i < legs; i++) {
    const roll = rng();
    if (roll < amb) {
      const r = simulateCombat(guards, { ...foe }, { seed: (seed + i * 7919) >>> 0, goldOnWin: 0 });
      events.push({
        kind: 'bandits',
        won: r.win,
        text: r.win ? 'Une embuscade repoussée.' : 'Des bandits emportent une part du convoi.',
      });
      if (r.win) mult *= 1.12;
      else {
        mult *= CARAVAN.lossKeep;
        const victim = escort[Math.floor(rng() * escort.length)];
        if (victim && !hurt.includes(victim.id)) hurt.push(victim.id);
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
  const haul = 1 + Math.min(CARAVAN.haulMax, countRole(escort, 'haul') * CARAVAN.haulPerRole);
  const k = mult * haul;
  const raw = harvestYield(poi.type, poi.level, tfH);
  const y = {
    energy: raw.energy * CARAVAN.yieldShare,
    summonStones: raw.summonStones * CARAVAN.yieldShare,
    scrap: raw.scrap * CARAVAN.yieldShare,
    keys: raw.keys,
  };
  const wages = caravanWages(escort, poi);
  const fights = events.filter((e) => e.kind === 'bandits').length;
  const xp: Record<string, number> = {};
  for (const a of escort) xp[a.id] = missionXp(a, poi, fights);

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
    hurt,
    events,
    text: events.map((e) => e.text).join(' '),
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
  comptoirLevel = 0,
): Caravan {
  const leg = caravanLegMin(poi, escort, comptoirLevel) * 60_000;
  return {
    id,
    poi,
    escort: escort.map((a) => a.id),
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    outcome: resolveCaravan(poi, escort, seed, road),
    claimed: false,
  };
}

/** La cargaison est-elle récupérable ? Le convoi doit être RENTRÉ, et pas déjà encaissé.
 *  ⚠️ `claimed === undefined` = déjà crédité, jamais « à récupérer ». */
export function isCaravanClaimable(c: Caravan, now: number): boolean {
  return c.claimed === false && now >= c.returnAt;
}
