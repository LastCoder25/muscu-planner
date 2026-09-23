// caravan.ts — les caravanes : de la logistique LENTE, sans héros et sans énergie.
// Pur/testable, aucune dépendance Vue/Supabase.
//
// ⚠️ POURQUOI CETTE BOUCLE EXISTE. Tout le jeu se paie en ÉNERGIE, donc en sport : un
// joueur qui s'entraîne peu en manque par définition. Mais il a du TEMPS. Une caravane
// consomme donc du temps réel et ZÉRO énergie — c'est le seul axe où il est à égalité.
// Corollaire non négociable : **une caravane ne rapporte JAMAIS d'équipement**. Elle paie
// en LOGISTIQUE (⚡ énergie plafonnée, 🔮 pierres, 🗝️ clés, un filet d'or),
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
  prestigeRankIndex,
  type AggregatedEffects,
} from './items';
import { sinceEvent } from './sinceEvent';
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
// COMBAT DE GROUPE, lu par `roadTroop`/`roadUnits` et par les embuscades (v0.864) ;
// `slainByAlly` y vit aussi (mécanisme de groupe, partagé avec les camps). Aucun
// cycle : `skirmish.ts` n'importe que `combat.ts`.
import {
  deriveSkirmish,
  fuseUnits,
  skirmishXpShares,
  slainByAlly,
  trialXpBase,
  troopOf,
  type SkirmishResult,
  type SkirmishUnit,
} from './skirmish';
// ⚠️ `caravan.ts` n'importe RIEN de `raid.ts` : c'est `raid.ts` qui importe ce module à
// l'exécution (`escortCombatant`, `unitEffects`…), donc un import de valeur dans l'autre
// sens créerait un cycle. Le projet applique déjà cette règle entre `data/familiars` et `items`.
import { REF_CHAMPIONS_BY_RANK, type Champion } from '../data/champions';
import {
  PARTY_TARGETS,
  HARVEST_TYPES,
  harvestYield,
  isRiftPoi,
  haulPills,
  goldCost,
  travelFactor,
  poiTravelLevel,
  travelOneWayMin,
  type Poi,
  routePerilous,
  poiRewardLevel,
} from './expedition';
import {
  advRarity,
  advRoles,
  advSignatureLevels,
  advStats,
  advTitle,
  escortRoleLevel,
  grantAdvXp,
  PROMO_LEVELS,
  type Adventurer,
  type AdvRole,
} from './adventurers';
import { rankStartLevel } from './characterRank';
import {
  ADV_GEAR_SLOTS,
  advGearEffects,
  advGearRoles,
  lineageOf,
  makeAdvGear,
  wornGear,
  type AdvGear,
  type AdvGearSlot,
} from './advGear';

export const CARAVAN = {
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
  /** Taille de la troupe d'une embuscade — calme / périlleuse (moteur de groupe, v0.864).
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
  /** 🧭 PART DE LA RÉDUCTION DE L'AVANT-POSTE QUE REÇOIVENT LES CHAMPIONS (v0.1049, demandé
   *  par l'utilisateur : « la moitié »). Le héros en a tout. ⚠️ C'est le RYTHME des camps en
   *  parallèle, donc l'or et les pierres par jour : ne pas bouger sans relancer
   *  `campEconomy.test` et `goldSink.test`. */
  outpostShare: 0.5,
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
  /** Paie par aventurier : socle × strate × niveau du POI^0,7. C'est un PUITS D'OR, mais
   *  calibré pour valoir ~60 % de l'or rapporté — à 26, les salaires valaient 2,6× l'or
   *  brut et le convoi était absurdement déficitaire. La caravane paie en RESSOURCES ;
   *  l'or n'est qu'un filet, et les salaires ne doivent pas l'engloutir. */
  wageBase: 6,
  /** ⚠️ PART DU RENDEMENT D'UNE VISITE DU HÉROS. Des marchands exploitent moins bien
   *  qu'un aventurier — mais ce n'est pas du réalisme, c'est un garde-fou mesuré : à part
   *  pleine, UNE caravane rendait plusieurs crans d'enceinte par jour (mesuré à l'époque de
   *  la ferraille). Avec 0,5 et un nombre de convois plafonné, les caravanes COMPLÈTENT la
   *  visite du héros au lieu de la remplacer.
   *  ⚠️ Ne pas monter sans re-mesurer les débits d'énergie et de pierres. */
  yieldShare: 0.5,
  /** Un convoi de plus tous les N niveaux de Comptoir. ⚠️ Calé sur le vivier : la Guilde
   *  donne 1 aventurier tous les 2 niveaux, donc ~L/6 escortes de 3 au niveau L — le
   *  nombre de convois doit rester SOUS ce plafond humain, sinon on possède des convois
   *  qu'on ne peut pas armer. À 1 tous les 9 niveaux : 12 convois au niveau 100 pour
   *  17 escortes possibles. */
  slotEvery: 9,
  /** 🎓 Part du SOCLE d'XP versée sur une DÉFAITE (v0.1014, demandé par l'utilisateur :
   *  « xp de défaite différente de celle de victoire »). On apprend en perdant — une défaite
   *  coûte déjà la cargaison ou le butin, et l'infirmerie —, mais moins qu'en gagnant. */
  xpLossShare: 0.5,
  /** Part de la valeur d'un convoi qu'une embuscade perdue emporte. */
  lossKeep: 0.55,
} as const;

type CaravanEventKind = 'bandits' | 'cache' | 'detour' | 'calme';

interface CaravanEvent {
  kind: CaravanEventKind;
  /** `bandits` uniquement : l'escorte a-t-elle tenu ? */
  won?: boolean;
  /** `bandits` : bandits ABATTUS sur CETTE embuscade (combat de groupe, v0.864).
   *  ⚠️ Nommé `slain`, pas `kills` : la forme diffère de `CaravanOutcome.kills` (ici un
   *  NOMBRE pour CET événement, là un `Record` PAR aventurier pour tout le voyage) — deux
   *  champs homonymes qui ne disent pas la même chose auraient fini par se confondre.
   *  ABSENT sur les convois lancés avant la bascule (leur `outcome` est figé au départ). */
  slain?: number;
  /** `bandits` : ids des membres mis À TERRE, dans l'ordre de leur chute (le premier tombé
   *  en tête). ⚠️ À terre n'est PAS blessé : sur une embuscade gagnée ils se relèvent, et
   *  seule `convoyHurt` décide qui part à l'infirmerie. Lu par le rapport de convoi ; le
   *  COMPTE des tombés se lit `down?.length` — le champ `fallen` séparé, redondant, est
   *  retiré. ABSENT sur les convois d'avant la bascule. */
  down?: string[];
  text: string;
}

export interface CaravanOutcome {
  gold: number;
  energy: number;
  summonStones: number;
  /** 🔩 LEGACY : ferraille d'un convoi lancé avant son retrait (v0.998). Plus jamais
   *  écrite ; convertie en or à l'encaissement (`SCRAP_TO_GOLD`). */
  scrap?: number;
  keys: number;
  /** 💠 Mana d'une mine de mana résiduel. ⚠️ ABSENT des convois d'avant (2026-09-21) : le
   *  convoi ne le rapportait PAS, alors qu'une mine de mana est le seul lieu qui en donne. */
  mana?: number;
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
  /** Ids des aventuriers blessés (→ infirmerie) : selon `convoyHurt`, le premier tombé de
   *  chaque embuscade PERDUE (jamais ceux d'une embuscade gagnée, restés à terre). */
  hurt: string[];
  events: CaravanEvent[];
  text: string;
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
  /** Renfort d'effets EXTÉRIEUR aux aventuriers — l'équipement qu'ils portent. Il
   *  s'ajoute aux signatures de l'escorte au lieu de les remplacer. */
  extra: Partial<AggregatedEffects> = {},
  /** `false` = le MÊME combattant privé de ses compétences (signatures de classe ou de
   *  champion). Sert au siège à mesurer ce que les compétences ajoutent (`skillMults`,
   *  `raid.ts`) — un second constructeur finirait par diverger de celui-ci. */
  skills = true,
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
    mergeEffects(skills ? escortEffects(advs) : emptyEffects(), { ...emptyEffects(), ...extra }),
    level,
    undefined,
    // Anciens plafonds secs : la route, les sièges, les camps et les failles sont calibrés
    // dessus (hors refonte de l'équipement du héros, cf. `CHANCE_CURVES`).
    { legacyCaps: true },
  );
}

/** Multiplie tous les canaux d'un agrégat. ⚠️ Balayage des CLÉS de `emptyEffects()`, pas
 *  une liste écrite à la main : ajouter un canal à `AggregatedEffects` sans le diluer
 *  ici passerait sinon inaperçu. */
function scaleEffects(e: AggregatedEffects, k: number): AggregatedEffects {
  const out = emptyEffects();
  for (const key of Object.keys(out) as (keyof AggregatedEffects)[]) out[key] = (e[key] ?? 0) * k;
  return out;
}

/**
 * ⚔️ CE QU'UN AVENTURIER TIRE DE SES PIÈCES — UNE seule définition, lue par la route
 * (`roadUnits`) ET par le rempart (`raid.ts`). Deux copies finiraient par annoncer une
 * valeur que le combat n'applique pas.
 *
 * ⚠️ PLUS DE FAMILIER NI DE TALENT (v0.996, décision de l'utilisateur : « on les garde
 * pour le héros uniquement »). Un champion ne porte plus que son ÉQUIPEMENT ; ce que
 * ses compagnons lui apportaient est rendu dans sa base de stats (`CHAMPION_SOLO`,
 * `adventurers.ts`), mesuré pour que la puissance ne bouge pas.
 */
export function unitEffects(gear: readonly AdvGear[] | undefined): AggregatedEffects {
  return advGearEffects([...(gear ?? [])]);
}

/** Combien de strates un aventurier de ce niveau a pu franchir. */
function strataFor(level: number): number {
  return Math.max(1, PROMO_LEVELS.filter((l) => l <= level).length);
}
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

/**
 * 🏅 L'ÉTALON EN CHAMPIONS — ce à quoi la route, les camps, les failles et les sièges se
 * calibrent **depuis la v0.952**.
 *
 * ⚠️ **ELLE A ATTENDU LE WIPE, et c'est toute la leçon de la v0.795** : la basculer avant
 * aurait rendu les convois impossibles pour les aventuriers existants (mesuré : un trio
 * tombait de 75-88 % à 1-2 % de ses embuscades). L'étalon et le vivier bougent ENSEMBLE.
 *
 * ## ✅ CE QUE LA MESURE A TRANCHÉ (la bloquante de la v0.938)
 *
 * **Les bandes d'embuscade TIENNENT**, les deux camps ayant bougé ensemble — trio sur route
 * calme **75 à 92 %** du niveau 12 au 85 (73-94 avant), sur route périlleuse **23 à 41 %** ;
 * 1 membre 0 %, 2 membres 16-26 %, 4 membres 97-100 %. La courbe est **PLATE** : le choix
 * « combien j'en envoie » est intact.
 *
 * ✅ **ET LE JOUEUR MALCHANCEUX N'EXISTE PAS** (simulé, 3 profils × 20 graines) : il a 3
 * champions à son rang cible **dès le JOUR 2**, et il est **0 % du temps en dessous**. La
 * raison est structurelle — `prestigeRankIndex` monte d'un rang tous les 10 niveaux quand
 * les tirages arrivent par dizaines (47 en 30 jours). ⚠️ C'était le vrai risque : mesuré,
 * un trio **un cran sous** son rang tombe de 76 % à 59 %, et **deux crans** à 1 %.
 *
 * ## ⚠️ CE QUE LA BASCULE A COÛTÉ AILLEURS, mesuré
 *
 * Trois autres surfaces se calibrent sur cet étalon, et deux ont dû être retouchées :
 * - **SIÈGES** : `siegeAttackers` se calibre sur le HÉROS, pas sur le vivier, donc l'armée
 *   ne suit pas quand la garnison double (+5 à +27 points de tenue, enceinte pleine de
 *   retour à 100 % aux niveaux 12-28 — le défaut de la v0.789). **`RAID.guardSiegeK` 1,25 →
 *   0,9** le reproduit (écarts −7 à +9, dans le bruit). ⚠️ Le coefficient traverse donc 1 :
 *   ce n'est plus « un aventurier vaut PLUS derrière ses murs », c'est un réglage.
 * - **FAILLES** : `RIFT_RELIEF` entièrement re-bisectée, même harnais et même cible.
 * - **CAMPS** : ⚠️ **RELEVÉ, NON CORRIGÉ** — ils n'étaient pas dans la campagne de la
 *   v0.943 et sont devenus plus faciles (un groupe de la bonne taille passe de 0,65-0,95 à
 *   0,73-1,00). La cause est identifiée : le combat n'y est serré que par la VARIANCE, or
 *   la référence en champions a **crit 0,03 et 1,05 frappe au niveau 12**. Aucun couple
 *   `pvTurns`/`dmgPctPv` balayé (5 × 4) ne resserre la bande sans rendre un camp de la
 *   bonne taille perdant ailleurs : c'est un chantier de calibration à part.
 *
 * ## Comment elle choisit
 *
 * ⚠️ **TROIS ORIENTATIONS, pour la raison exacte de `REF_LINEAGES`** : une escorte 100 %
 * mêlée a agilité 0, donc multi-frappe 1,00, et toute la calibration de la route — qui
 * repose sur la non-linéarité de l'offense — s'effondre.
 *
 * ⚠️ **ROBUSTE À L'ORDRE DU ROSTER** : on trie par la part de l'axe visé puis par `id`,
 * jamais « les trois premiers ». Sinon **ajouter un champion déplacerait la référence**,
 * donc toute la calibration avec — et rien ne le dirait.
 */
export function refChampionAdv(level: number, slot = 0): Adventurer {
  const cs = refChampions(level);
  const c = cs[Math.abs(Math.floor(slot)) % cs.length]!;
  return {
    id: 'ref' + slot,
    name: c.name,
    seed: 1,
    path: [],
    level: Math.max(1, level),
    xp: 0,
    championId: c.id,
    // ⚠️ SANS ÉVEIL, délibérément : l'Éveil se mérite, il doit rester un avantage,
    // pas une attente.
    copies: 1,
  };
}

/** Les trois champions de référence d'un niveau : ceux de son RANG, FIGÉS
 *  (`REF_CHAMPIONS_BY_RANK`) — la calibration des combats ne bouge pas avec la refonte S/A. */
export function refChampions(level: number): Champion[] {
  const rangs = REF_CHAMPIONS_BY_RANK;
  return rangs[Math.min(rangs.length - 1, prestigeRankIndex(Math.max(1, level)))]!;
}

/** Les membres NUS de l’escorte de référence, un par orientation. ⚠️ Extrait pour que
 *  `refAdvGear` lise les lignées sans passer par `refEscortOf`, qui l’appelle. */
function refEscortBare(level: number, n: number = CARAVAN.refEscort): Adventurer[] {
  return Array.from({ length: n }, (_, i) => refChampionAdv(level, i));
}

/** Les ids des pièces de référence du membre `i` (cf. `refAdvGear`). */
function refGearIds(i: number): Record<AdvGearSlot, string> {
  return {
    weapon: `refGear${i}weapon`,
    armor: `refGear${i}armor`,
    accessory: `refGear${i}accessory`,
    relic: `refGear${i}relic`,
  };
}

/**
 * L’ÉQUIPEMENT de l’escorte de référence : chaque membre porte ses 4 pièces B, niveau d’objet
 * à niveau, de la rareté de SA classe — la règle de `gearExpect` : l’attendu, pas
 * l’exceptionnel. Sans jet (v0.1012) : une pièce vaut le plancher de son rang.
 *
 * ⚠️ POURQUOI. Une escorte équipée additionne 4 pièces par tête, soit plus qu’un compagnon :
 * sans cette référence, un vivier équipé roulerait sur une route calibrée pour des escortes
 * nues, et « combien j’en envoie » cesserait d’être une décision (même raison que
 * `refCompanions`).
 * ⚠️ `makeAdvGear`, LA fonction qui fabrique toute pièce du jeu (tirage compris) : cet
 * étalon est ce sur quoi `roadFoe` se calibre, il doit porter l’équipement que le jeu
 * produit RÉELLEMENT. Seul le niveau est forcé à celui du membre.
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
    const rank = advRarity(a);
    const ids = refGearIds(i);
    return ADV_GEAR_SLOTS.map(
      (slot): AdvGear => ({
        ...makeAdvGear({ lineage, slot, rank, grade: 'B' }),
        id: ids[slot],
        level: L,
      }),
    );
  });
}

/** L’ESCORTE de référence : `CARAVAN.refEscort` aventuriers, un par orientation, chacun
 *  avec ses pièces de référence. */
function refEscortOf(level: number): Adventurer[] {
  return refEscortBare(level).map((a, i) => ({ ...a, gear: refGearIds(i) }));
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
  // ⚠️ La référence est ÉQUIPÉE : c'est ce que la route attend d'un vivier. Son
  // attribution est posée PAR CONSTRUCTION (l'étalon de la route, pas un vivier de joueur).
  // ⚠️ Plus de compagnon (v0.996) : ce qu'il apportait est désormais dans la base de stats
  // du champion (`CHAMPION_SOLO`), donc la route reste calibrée au même niveau.
  const stock = new Map(refAdvGear(poi.level).map((g) => [g.id, g]));
  const pairs = new Map(
    escort.map((a): [string, AdvGear[]] => [
      a.id,
      ADV_GEAR_SLOTS.flatMap((s) => {
        const g = a.gear?.[s] ? stock.get(a.gear[s]) : undefined;
        return g ? [g] : [];
      }),
    ]),
  );
  const ref = escortCombatant(escort, 'Référence', pairedEscortEffects(escort, pairs));
  const m = routePerilous(poi) ? CARAVAN.perilousMult : 1;
  return {
    name: routePerilous(poi) ? 'Pillards de la passe' : 'Bandits de grand chemin',
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
  const ordre: AdvRole[] = routePerilous(poi)
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

/** Trajet ALLER d'une équipe de champions, en minutes : celui du HÉROS, Avant-poste compris
 *  (`travelMult`), puis raccourci par les rôles 🧭 de l'escorte ET par les pièces qui portent
 *  ce rôle (`gearSpeed`, cf. `advGearRoles`) — les deux sous le MÊME plafond.
 *
 *  ⚠️ PLUS DE LENTEUR PROPRE (v0.1036) : le ×1,5 incarnait le CONVOI, disparu au profit des
 *  équipes.
 *  ⚠️ ET L'AVANT-POSTE ACCÉLÈRE LES CHAMPIONS (v0.1047, choix de l'utilisateur) : depuis qu'il
 *  AGRANDIT la carte (`revealRadius`), les lieux s'éloignent en moyenne, et sans sa réduction
 *  un aller-retour d'équipe dépassait 28 h au bout de la carte en fin de partie. Mesuré sur le
 *  trajet MOYEN : ×1,1 à ×1,3 voyages/jour jusqu'au niveau 30, ×1,6 à ×1,8 au-delà du 40 —
 *  la carte agrandie absorbe une partie de la réduction (sur la carte fixe d'avant : ×2,4).
 *  ⚠️ v0.1049 (demandé : « la moitié ») : les champions n'en reçoivent plus que
 *  `CARAVAN.outpostShare` = 0,5 (`championOutpostMult`). Mesuré sur la carte agrandie
 *  (`campEconomy.test`, 8 graines, Avant-poste au niveau du joueur), part entière → moitié :
 *  camps/jour 9,3 → 8,9 · 11,8 → 10,5 · 15,3 → 13,0 aux niveaux 12 / 26 / 60 ; or des camps
 *  +29 → +29 · +23 → +21 · +29 → +23 % du revenu de référence ; pierres +19 → +17 ·
 *  +28 → +23 · +42 → +34 %.
 *  La cargaison reste payée sur le temps du héros (`heroEquivalentFactor`).
 *  ⚠️ `travelMult` est REQUIS : l'oublier annoncerait un trajet sans Avant-poste. */
export function caravanLegMin(
  poi: Poi,
  escort: Adventurer[],
  gearSpeed: number,
  travelMult: number,
): number {
  const hero = travelOneWayMin(poiTravelLevel(poi), poi.distNorm);
  const speed = Math.min(
    CARAVAN.speedMax,
    countRole(escort, 'speed') * CARAVAN.speedPerRole + Math.max(0, gearSpeed),
  );
  return Math.max(1, Math.round(hero * championOutpostMult(travelMult) * (1 - speed)));
}

/** 🧭 Le multiplicateur de trajet des CHAMPIONS, dérivé de celui du héros (`travelTimeMult`) :
 *  ils reçoivent `CARAVAN.outpostShare` de sa réduction (v0.1049). ⚠️ Dérivé, jamais une
 *  seconde courbe par niveau d'Avant-poste qui finirait par diverger de celle du héros. */
export function championOutpostMult(heroMult: number): number {
  const cut = Math.min(1, Math.max(0, 1 - heroMult));
  return 1 - cut * CARAVAN.outpostShare;
}

/** ⚠️ LA CARGAISON SE PAIE SUR LA DURÉE QU'UN HÉROS AURAIT MISE, pas sur celle de la
 *  caravane. `travelFactor` est SUPER-LINÉAIRE (exposant 1,4) : payer une caravane sur son
 *  temps réel ferait de sa lenteur une PRIME (ralentir de ×1,5 paierait ×1,75 de plus) et
 *  elle écraserait l'expédition du héros. Le marché doit rester lisible : la caravane
 *  coûte plus de TEMPS (abondant) et zéro ÉNERGIE (rare) ; elle ne rapporte pas plus. */
export function heroEquivalentFactor(poi: Poi): number {
  return tripFactor(poiTravelLevel(poi), poi.distNorm);
}

/** Le facteur de trajet d'un POI, à niveau et distance donnés (la cargaison). */
function tripFactor(level: number, distNorm: number): number {
  return travelFactor((2 * travelOneWayMin(level, distNorm)) / 60);
}

/** Salaires d'une mission — un PUITS D'OR, et la contrepartie de la prestation. */
export function caravanWages(escort: Adventurer[], poi: Poi): number {
  return escort.reduce(
    (sum, a) =>
      sum +
      Math.round(CARAVAN.wageBase * strataFor(a.level) * Math.max(1, poiRewardLevel(poi)) ** 0.7),
    0,
  );
}

/** 🎓 XP de MISSION d'un aventurier (v0.1014, refonte demandée par l'utilisateur : « on ne
 *  relie plus l'xp à la distance mais au niveau de l'évent ; une xp fixe selon le niveau de
 *  l'évent, de l'xp par ennemi abattu, et une xp de défaite différente de la victoire »).
 *
 *  `socle × issue + part des abattus` :
 *  - le SOCLE ne dépend que du NIVEAU du lieu (`trialXpBase`), versé même sans combat ;
 *  - l'ISSUE : plein sur une victoire, `CARAVAN.xpLossShare` sur une défaite ;
 *  - la PART DES ABATTUS (`skirmishXpShares`, calculée par l'appelant) : chaque ennemi
 *    tombé vaut une part de la base de SON niveau, partagée entre les présents.
 *
 *  ⚠️ PLUS AUCUNE DISTANCE (l'ancien `missionTravelMult` est retiré) : depuis la v0.1013 le
 *  niveau d'un lieu ne suit plus son éloignement, et la difficulté se lit sur le niveau.
 *  ⚠️ Le RENDEMENT DÉCROISSANT reste (`ratio`) : sans lui, un vétéran engrangerait sur des
 *  lieux qui ne lui apprennent rien.
 *  ⚠️ SOURCE UNIQUE des quatre missions (convoi, camp, incursion, interception) : une
 *  copie par lieu aurait divergé au premier réglage. */
export function missionXp(adv: Adventurer, poi: Poi, won: boolean): number {
  const ratio = Math.max(0.15, Math.min(2, poi.level / Math.max(1, adv.level)));
  const issue = won ? 1 : CARAVAN.xpLossShare;
  return Math.max(
    1,
    Math.round(trialXpBase(poiRewardLevel(poi)) * Math.min(1, ratio) ** 1.5 * issue),
  );
}

/** 👥 LE PARTAGE DE L'XP D'UNE MISSION (v0.1038, décision de l'utilisateur : les équipes ne
 *  sont plus bornées à 3 — « plus il y a de champions plus l'XP est divisée, c'est tout »).
 *  Jusqu'à `XP_TEAM_REF` membres, rien ne change (toute la calibration de la montée en niveau
 *  est faite sur ces équipes) ; au-delà, le socle d'une mission se partage à parts égales.
 *  ⚠️ Le HÉROS compte pour `HERO_XP_WEIGHT` : il VAUT deux champions dans un groupe
 *  (`heroPartyCombatant`), il en prend donc deux parts — perdues, son XP vient du sport. */
export const XP_TEAM_REF = 3;
export const HERO_XP_WEIGHT = 2;
/**
 * Facteur appliqué au socle de chaque champion (1 jusqu'à `XP_TEAM_REF` membres).
 *
 * ⚠️ PLANCHER À `xpLossShare` (v0.1095, mesuré ; décision de l'utilisateur : « si le lieu est
 * trop dur il faut envoyer tout le monde, mais du coup on ne peut pas les envoyer ailleurs —
 * en soi c'est déjà un inconvénient, donc il faudrait que l'XP suive »). Sans lui, au-delà de
 * 6 membres le partage tombait SOUS ce que rapporte un échec : mesuré, sur les lieux qui ne
 * se gagnent qu'à 8, la meilleure stratégie était d'envoyer 3 champions et de PERDRE
 * (9,9 contre 8,1 XP/h/champion) — gagner à 8 rendait `3/8 = 37,5 %` du socle quand perdre à
 * 3 en rend 50 %. On punissait celui qui monte l'équipe nécessaire pour venir à bout d'un
 * lieu dur, alors que le COÛT D'OPPORTUNITÉ le punit déjà (ces champions ne sont nulle part
 * ailleurs).
 *
 * ⚠️ Le plancher EST `xpLossShare`, et il en est DÉRIVÉ : la propriété garantie est « une
 * victoire ne rapporte jamais moins qu'un échec avec l'escorte de référence », et elle doit
 * suivre si cette part change.
 *
 * ⚠️ Il ne crée AUCUNE incitation à sur-remplir : le plancher vaut la moitié du socle, donc
 * un champion en surnombre rapporte toujours moins qu'à `XP_TEAM_REF`. Il supprime une
 * punition, il n'ajoute pas de prime.
 */
export function missionXpSplit(escortCount: number, hero: boolean): number {
  const weight = Math.max(1, escortCount) + (hero ? HERO_XP_WEIGHT : 0);
  return Math.max(CARAVAN.xpLossShare, Math.min(1, XP_TEAM_REF / weight));
}

/** Le pas de la prime de rattrapage : UN RANG de retard (10 niveaux) double l'apprentissage.
 *  ⚠️ DÉRIVÉ de l'échelle de prestige, jamais écrit — `rankStartLevel(1)` est le ★1 du rang
 *  suivant, donc le niveau juste avant est le ★5 du premier rang. */
const CATCH_UP_RANK = rankStartLevel(1) - 1;

/**
 * 🎓 UN CHAMPION EN RETARD APPREND PLUS VITE — la prime de RATTRAPAGE (v0.1097, mesurée ;
 * demandée par l'utilisateur : « il faut que les bronze gagnent beaucoup d'XP quand ils
 * combattent en or noir… que ça ne prenne pas des semaines ou des mois à monter un champion
 * qu'on tire en bronze, surtout quand on sera au rang max »).
 *
 * ⚠️ **CE QUI CLOCHAIT, MESURÉ.** Le socle d'une mission ne dépend que du NIVEAU DU LIEU
 * (`missionXp` écrête le ratio à 1) : un champion de niveau 1 sur un lieu de niveau 100
 * touchait donc EXACTEMENT les 166 XP d'un champion de niveau 100 au même endroit. Il n'était
 * pas pénalisé — mais il n'avait aucune prime, alors que le coût d'un rattrapage, lui, est
 * QUADRATIQUE (`advXpToNext` est linéaire en niveau) : 8 150 XP pour rejoindre un joueur de
 * niveau 26, **112 860 pour un joueur de niveau 100**. Mesuré à 6 missions/jour, ascensions
 * gratuites : **29 jours à P=26 mais 114 à P=100**. C'est le « des mois » refusé.
 *
 * ⚠️ **LA PRIME SUIT LE RETARD EN NIVEAUX, PAS EN PROPORTION — et c'est le seul choix qui
 * supprime la DÉRIVE.** Une prime en part du retard (`1 + K(1 − L/P)`) accélère tout le monde
 * du même facteur : mesurée à K=12, elle laissait P=100 **4,0× plus long** que P=26, la dérive
 * intacte. La forme retenue croît avec l'écart ABSOLU, donc le multiplicateur grandit avec le
 * niveau du monde — ce que la fiction dit déjà : plus la maison a d'avance, plus le nouveau
 * venu apprend au contact. Mesuré, la dérive tombe de **4,0× à 2,3×**, et ce qu'il en reste
 * est LOGARITHMIQUE (le calcul le donne : missions ≈ 13,75 · pas · ln P).
 *
 * ⚠️ **LE PAS EST UN RANG** (`CATCH_UP_RANK`), donc la règle se dit en une phrase : **un rang
 * de retard double l'apprentissage**. Mesuré à 6 missions/jour : **16 / 25 / 33 / 36 jours**
 * aux niveaux 26 / 50 / 80 / 100, contre 29 / 57 / 91 / 114 avant.
 *
 * ⚠️ **ELLE VAUT EXACTEMENT 1 À NIVEAU** : un champion à jour ne gagne rien, donc la
 * calibration mesurée de la montée en niveau (`advXpToNext`) n'est pas déplacée. Et elle est
 * discrète au petit retard (2 niveaux → ×1,20, 5 → ×1,50) : la mesure des sceaux de la
 * v0.1017, calibrée sur « un trio 5 niveaux en retard », est assistée, pas annulée.
 *
 * ⚠️ **LA RÉFÉRENCE EST LE PANTHÉON, PAS LE NIVEAU DU JOUEUR** — c'est le plafond que
 * `grantAdvXp` applique. Sur le niveau du joueur, un champion déjà au plafond du Panthéon
 * recevrait encore une prime pour un retard qu'il n'a pas le droit de combler : le
 * multiplicateur annoncerait un gain que rien ne peut convertir.
 *
 * ⚠️ **AUCUN FARM POSSIBLE** : elle s'éteint exactement quand il rattrape, et garder un
 * champion bas ne paie rien (il est faible, perd ses missions — `xpLossShare` — et occupe un
 * créneau). Le sport reste le plafond : `grantAdvXp` cape toujours au Panthéon.
 *
 * ⚠️ **ON NE DÉPLACE PAS LE GOULOT VERS L'ATTENTE.** Mesuré à part, réunir les sceaux d'un
 * champion neuf coûte **14 jours** à P=100 (2 failles/jour) : l'XP en coûtait 114, elle en
 * coûte 36. Elle reste donc le goulot dominant — « faire jouer ses champions » demeure ce qui
 * les monte, au lieu d'« attendre un sceau ».
 */
export function catchUpMult(advLevel: number, pantheonLevel: number): number {
  const gap = Math.max(0, Math.max(1, pantheonLevel) - Math.max(1, advLevel));
  return 1 + gap / CATCH_UP_RANK;
}

/** L'XP de chaque membre d'une mission : socle (selon l'issue, partagé au-delà de
 *  `XP_TEAM_REF` membres, et primé s'il est en retard) + sa part des abattus (déjà divisée
 *  entre les présents).
 *  `hero` est REQUIS : l'oublier rendrait deux parts de trop aux champions.
 *  `pantheonLevel` est REQUIS : c'est la référence de la prime de rattrapage, et un
 *  paramètre qu'on peut oublier finit par l'être — l'omettre éteindrait la prime en silence.
 *  ⚠️ LA PRIME NE TOUCHE QUE LE SOCLE, jamais la part des abattus : cette dernière est bornée
 *  par `SKIRMISH.carryMargin`, le garde-fou anti-portage (« un vétéran élèverait des recrues
 *  à sa place en les emmenant hors de leur ligue »). L'y appliquer l'annulerait. Mesuré, elle
 *  ne pèse de toute façon que ~6 % de l'XP d'un champion très en retard, précisément à cause
 *  de cette marge. */
export function missionXpFor(
  escort: readonly Adventurer[],
  poi: Poi,
  won: boolean,
  shares: Record<string, number>,
  hero: boolean,
  pantheonLevel: number,
): Record<string, number> {
  const split = missionXpSplit(escort.length, hero);
  const xp: Record<string, number> = {};
  for (const a of escort)
    xp[a.id] =
      Math.max(
        1,
        Math.round(missionXp(a, poi, won) * split * catchUpMult(a.level, pantheonLevel)),
      ) + Math.round(shares[a.id] ?? 0);
  return xp;
}

/** Convois simultanés qu'autorise le Comptoir. ⚠️ SECOND garde-fou de l'inflation :
 *  le rendement par convoi est bridé (`yieldShare`), mais c'est le NOMBRE qui multiplie.
 *  Un débutant en a un seul ; le plafond reste bas, et le niveau du Comptoir est lui-même
 *  plafonné par celui du joueur — donc par le sport. */
export function caravanSlots(comptoirLevel: number): number {
  return Math.max(1, 1 + Math.floor(Math.max(0, comptoirLevel) / CARAVAN.slotEvery));
}

/** 🐫⚔️ Créneaux de convoi ENCORE LIBRES — UN SEUL pool pour les convois ET les groupes
 *  partis SANS le héros (revue finale des camps, arbitrage).
 *  ⚠️ Sans ce partage, rien ne bornait les groupes : seul le vivier les limitait, et une
 *  sonde « tous les camps pris » mesurait ~7-8 camps/jour, soit +58 % du revenu d'or de
 *  référence au niveau 26. Un groupe AVEC le héros n'y figure pas : le héros est à lui seul
 *  sa limite (un voyage à la fois).
 *  `trips` : tout ce qui porte un `returnAt` — convois et groupes sans le héros ; un voyage
 *  est en cours tant que `now < returnAt` (même règle que l'écran et `sendCaravan`). */
export function convoySlotsFree(
  comptoirLevel: number,
  trips: readonly { returnAt: number }[],
  now: number,
): number {
  const busy = trips.filter((t) => now < t.returnAt).length;
  return Math.max(0, caravanSlots(comptoirLevel) - busy);
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
 *  fois, il est physiquement parti.
 *
 *  ⚔️ `party` (étape 3 des camps) : un camp ou un repaire s'attaque en GROUPE — le héros,
 *  ou au moins un aventurier disponible ET un créneau de convoi libre (`convoySlotsFree` :
 *  un groupe sans le héros prend un créneau, comme un convoi). ⚠️ `advsAvailable` et
 *  `slotsFree` sont REQUIS : un appelant qui les oublierait fermerait (ou ouvrirait) les
 *  camps en silence dès que le héros part. */
export function poiOffers(
  poi: Poi,
  opts: { heroAway: boolean; comptoirLevel: number; advsAvailable: number; slotsFree: number },
): { hero: boolean; caravan: boolean; party: boolean } {
  return {
    // ⚠️ `hero` = l'EXPÉDITION SOLO, et une faille n'en est pas une : on y entre EN GROUPE
    // (`party`), même quand le héros y va seul — c'est ce qui fait résoudre l'incursion par
    // `resolveIncursion` au lieu de `resolveOutcome`, qui la traitait comme une MINE D'OR
    // (de l'or et de l'énergie pour rien, v0.926). Ce refus RESTE donc, et `resolveOutcome`
    // lève toujours : deux verrous, une ceinture et des bretelles.
    // ⚓ Une ÉPAVE est un type retiré (v0.999) : rien ne peut plus y être envoyé.
    hero: !opts.heroAway && !isRiftPoi(poi) && poi.type !== 'wreck',
    // 🚫 Plus de convoi (2026-09-21) : une ÉQUIPE part sur les lieux de récolte à sa place.
    // Le champ reste (ceux déjà en route s'encaissent), mais on n'en lance plus.
    caravan: false,
    // ⚔️ Un CAMP — ET UNE FAILLE — s'attaquent en GROUPE : le héros (sa propre limite), ou
    // au moins un aventurier disponible avec un créneau de convoi libre. `PARTY_TARGETS` est
    // la source unique de « on y envoie un groupe » ; ce que ça résout (camp ou incursion) se
    // décide à l'unique chemin d'envoi.
    party:
      PARTY_TARGETS.has(poi.type) &&
      (!opts.heroAway || (opts.advsAvailable > 0 && opts.slotsFree > 0)),
  };
}

/** ⚠️ `cap` = le plafond d'engagement du Panthéon (`engageCap`), REQUIS : il borne une
 *  escorte comme il borne un groupe ou le rempart. `escortMax` le domine dès qu'on a un
 *  Panthéon de niveau 6 — en dessous, c'est le Panthéon qui décide. */
export function canSendCaravan(poi: Poi, escort: Adventurer[], cap: number): boolean {
  return (
    HARVEST_TYPES.has(poi.type) &&
    escort.length > 0 &&
    escort.length <= Math.min(CARAVAN.escortMax, Math.max(0, Math.floor(cap)))
  );
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
  const base = routePerilous(poi) ? AMBUSH_BASE.perilous : AMBUSH_BASE.calme;
  const cut = Math.min(CARAVAN.scoutMax, countRole(escort, 'scout') * CARAVAN.scoutPerRole);
  return base * (1 - cut);
}

/** 🗡️ Ce que l'escorte emmène : le STOCK d'équipement des aventuriers.
 *  ⚠️ REQUIS partout (route, camps, failles, rempart) : un paramètre qu'on peut oublier
 *  finit par l'être. Une escorte nue passe `{ advGear: [] }`. */
export interface EscortKit {
  advGear: AdvGear[];
}

/**
 * 🗡️ QUI PORTE QUOI : les pièces que chacun porte RÉELLEMENT (`wornGear` — lignée, rareté
 * de la classe, une pièce un porteur). UNE règle pour la route ET le rempart.
 */
export function escortGear(advs: Adventurer[], kit: EscortKit): Map<string, AdvGear[]> {
  return wornGear(advs, kit.advGear);
}

/** ⚔️ L'escorte en UNITÉS DISTINCTES : chaque aventurier avec SES pièces.
 *  `gear` = `escortGear(escort, kit)`, calculé UNE fois par l'appelant : le combattant
 *  fondu et les unités lisent la même attribution. */
export function roadUnits(escort: Adventurer[], gear: Map<string, AdvGear[]>): SkirmishUnit[] {
  return escort.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: advTitle(a)?.emoji ?? '⚔️',
    level: a.level,
    combatant: escortCombatant([a], a.name, unitEffects(gear.get(a.id))),
  }));
}

/** Id de l'unité du héros dans un groupe — jamais celui d'un aventurier (`adv_…`). */
export const HERO_UNIT_ID = 'hero';

export interface PartyHero {
  name: string;
  level: number;
  combatant: Combatant;
}

/**
 * 🧝 CE QUE VAUT LE HÉROS DANS UN GROUPE — au plus `HERO_PARTY_WORTH` champions de
 * référence de SON niveau (v0.980, mesuré ; décision de l'utilisateur).
 *
 * ⚠️ **SANS CETTE BORNE, LE HÉROS ÉCRASAIT TOUT LE CONTENU DES CHAMPIONS.** Sa puissance suit
 * l'XP de sport et son équipement ; celle d'un champion suit une courbe linéaire et un
 * équipement bridé. Mesuré, à rang et niveau égaux, équipés tous les deux : **×2 au niveau 5,
 * ×8 au 12, ×34 au 30, ×87 au 60, ×216 au 100**. Il refermait donc seul, à 100 %, des
 * failles de 40 à 60 niveaux au-dessus de lui, et le plafond de 3 champions ne bornait rien.
 *
 * ⚠️ **ON BORNE ICI, PAS LE HÉROS** : sa courbe est « le sport est le plafond », et tout son
 * contenu (donjons, boss, Labyrinthe, sièges) est calé dessus. On ne touche qu'à ce qu'il
 * apporte quand il rejoint un groupe calibré sur des champions (failles, camps, bandes).
 *
 * ⚠️ **SUR LES CARACTÉRISTIQUES DES CHAMPIONS, PAS SUR LES SIENNES.** Un premier essai
 * plafonnait sa puissance en gardant son critique et son multi-frappe : mesuré, il valait
 * alors 1 champion aux niveaux 12-45 mais 2 au niveau 70 (son multi-frappe rend le combat
 * plus régulier que ce que `offenseOf` prévoit). Ici il vaut EXACTEMENT K champions, par
 * construction, à tous les niveaux.
 *
 * ⚠️ **UNE BORNE, JAMAIS UN PLANCHER** : un héros plus faible que K champions (tout début
 * de partie) garde sa propre force, canal par canal.
 */
export const HERO_PARTY_WORTH = 2;

export function heroPartyCombatant(hero: PartyHero): Combatant {
  const ref = refEscortUnits(hero.level);
  const f = fuseUnits(ref, hero.name);
  const k = HERO_PARTY_WORTH / ref.length;
  const off = Math.min(1, offenseOf(hero.combatant) / Math.max(1e-9, offenseOf(f) * k));
  const surv = Math.min(1, survivalOf(hero.combatant) / Math.max(1e-9, survivalOf(f) * k));
  return {
    ...f,
    pv: Math.max(1, Math.round(f.pv * k * surv)),
    damage: Math.max(1, f.damage * k * off),
  };
}

/** Les unités du groupe : aventuriers (SES pièces, règle unique `escortGear`) puis
 *  le héros, BORNÉ à `HERO_PARTY_WORTH` champions (`heroPartyCombatant`).
 *  ⚠️ EXPORTÉE pour l'écran : le % affiché (`campWinPct`) doit fondre EXACTEMENT le groupe
 *  que `resolveCamp` fera combattre — une seconde construction (oublier `escortGear`, poser
 *  le héros autrement) annoncerait un pronostic sur un autre groupe. */
export function partyAllies(
  escort: Adventurer[],
  kit: EscortKit,
  hero: PartyHero | null,
): SkirmishUnit[] {
  const units = roadUnits(escort, escortGear(escort, kit));
  if (hero)
    units.push({
      id: HERO_UNIT_ID,
      name: hero.name,
      emoji: '🧝',
      level: hero.level,
      combatant: heroPartyCombatant(hero),
    });
  return units;
}
/** 🧭 Les unités de RÉFÉRENCE d'un niveau : `CARAVAN.refEscort` aventuriers, un par
 *  orientation, équipés (`refAdvGear`). ⚠️ SOURCE UNIQUE du mètre-étalon des CAMPS et des
 *  FAILLES. `roadFoe` garde SA propre référence (`escortCombatant` + une attribution posée
 *  PAR CONSTRUCTION), dont la calibration des bandes d'embuscade a été mesurée à part. */
export function refEscortUnits(level: number): SkirmishUnit[] {
  const escort = refEscortOf(level);
  return roadUnits(escort, escortGear(escort, { advGear: refAdvGear(level) }));
}

/**
 * 🗡️ LES BANDITS DE LA ROUTE — une TROUPE à danger ABSOLU.
 *
 * ⚠️ Ce sont les CORPS de l'embuscade (identité, niveau, part de PV), lus par
 * `deriveSkirmish` : l'issue reste le combat fondu `roadFoe`, calibré sur les bandes.
 * ⚠️ UNE SEULE FORCE, par construction : on reçoit LE combattant qui livre le combat
 * (`foe`, déjà calculé par l'appelant) et on le répartit (`troopOf`) — les corps ne
 * peuvent pas porter une autre force que lui. Le danger ABSOLU vient de `roadFoe` (escorte
 * de RÉFÉRENCE, jamais l'escorte envoyée). `poi` ne donne que le nombre, le niveau et le nom.
 */
export function roadTroop(foe: Combatant, poi: Poi): SkirmishUnit[] {
  const perilous = routePerilous(poi);
  return troopOf(foe, {
    count: perilous ? CARAVAN.troopPerilous : CARAVAN.troopCalm,
    level: poi.level,
    name: perilous ? 'Pillard de la passe' : 'Bandit de grand chemin',
    emoji: '🗡️',
  });
}

/** Ce que les PIÈCES de l'escorte apportent sur la route, en effets.
 *
 * ⚠️ ON DIVISE PAR L’EFFECTIF : sur la route l’escorte est FONDUE en un seul combattant
 * dont les stats s’additionnent — cumuler les pourcentages y appliquerait quatre fois le
 * bonus à la totalité des dégâts. La moyenne redonne le bon compte, exactement comme au
 * rempart où chaque pièce n’épaule que son homme. */
export function roadGearEffects(escort: Adventurer[], kit: EscortKit): AggregatedEffects {
  return pairedEscortEffects(escort, escortGear(escort, kit));
}

/** Le cœur de `roadGearEffects`, sur une attribution DÉJÀ calculée (`escortGear`) :
 *  `resolveCaravan` la construit une fois pour le combattant fondu ET pour les unités. */
function pairedEscortEffects(
  escort: Adventurer[],
  gear: Map<string, AdvGear[]>,
): AggregatedEffects {
  if (!escort.length || !gear.size) return emptyEffects();
  return scaleEffects(advGearEffects([...gear.values()].flat()), 1 / escort.length);
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

/**
 * 🤕 QUI PART À L'INFIRMERIE après une embuscade de CONVOI — la politique du convoi, pas celle
 * de la dérivation (`deriveSkirmish` dit seulement qui est tombé).
 *
 * - Embuscade GAGNÉE : personne. Les membres à terre se relèvent (« à terre » au rapport).
 * - Embuscade PERDUE : UN SEUL blessé, le PREMIER tombé du journal — déterministe, et le même
 *   volume que l'ancienne victime tirée au hasard.
 *
 * ⚠️ POURQUOI PAS « tous les tombés » : mesuré, 72 à 83 % des embuscades GAGNÉES font tomber
 * au moins un membre (une victoire calibrée entame plus d'un tiers des PV fondus). Blesser les
 * tombés multipliait par 2,5 à 7 les voyages calmes avec un blessé — le joueur occasionnel,
 * dont les convois sont la boucle, aurait perdu des aventuriers disponibles. Les camps (étape 3)
 * appliquent leur propre règle sur le même résultat, sans toucher à la dérivation.
 */
export function convoyHurt(result: Pick<SkirmishResult, 'win' | 'down'>): string[] {
  if (result.win) return [];
  const first = result.down[0];
  return first ? [first] : [];
}

export function resolveCaravan(
  poi: Poi,
  escort: Adventurer[],
  seed: number,
  /** ⚠️ REQUIS, pas optionnel : un paramètre qu’on peut oublier finit par l’être. Une
   *  escorte nue se déclare avec `{ advGear: [] }`. */
  kit: EscortKit,
  /** ⚠️ REQUIS : la référence de la prime de rattrapage (`catchUpMult`) — c'est le plafond
   *  que `grantAdvXp` applique, jamais le niveau du joueur. */
  pantheonLevel: number,
): CaravanOutcome {
  // ⚠️ Plus aucun équipement de champion sur la route (v0.1012) : il ne vient QUE du tirage.
  // Le générateur dédié qui le tirait a disparu avec lui — il ne lisait rien du flux `rng`,
  // donc les bandes d'embuscade et la cargaison seedées ne bougent pas.
  const rng = mulberry32(seed >>> 0 || 1);
  const events: CaravanEvent[] = [];
  const hurt: string[] = [];
  let mult = 1;
  let keysBonus = 0;

  // ⚔️ L'issue d'une embuscade reste le COMBAT FONDU calibré (`guards` contre `foe`) : les
  // bandes de route en dépendent. Le groupe — qui tombe, qui abat qui — n'est qu'une LECTURE
  // de son journal (`deriveSkirmish`), jamais un second combat.
  const foe = roadFoe(poi);
  // 🗡️ Qui porte quoi, calculé UNE fois : le combattant fondu et les unités en sont deux lectures.
  const pairs = escortGear(escort, kit);
  const guards = escortCombatant(escort, 'Escorte', pairedEscortEffects(escort, pairs));
  // Unités et troupe calculées à la première embuscade seulement (inutiles sur une route
  // tranquille). La troupe EST `foe` réparti en corps (`roadTroop` → `troopOf`).
  let group: { units: SkirmishUnit[]; troop: SkirmishUnit[] } | null = null;
  const kills: Record<string, number> = Object.fromEntries(escort.map((a) => [a.id, 0]));
  const xpShare: Record<string, number> = Object.fromEntries(escort.map((a) => [a.id, 0]));
  // 🎓 Un convoi est une VICTOIRE s'il n'a perdu aucune embuscade (sans combat compris).
  let lost = false;
  // Une rencontre par jambe de trajet — deux fois plus sur une route dangereuse.
  const legs = routePerilous(poi) ? 4 : 2;
  const base = routePerilous(poi) ? AMBUSH_BASE.perilous : AMBUSH_BASE.calme;
  const amb = ambushChance(poi, escort);
  for (let i = 0; i < legs; i++) {
    const roll = rng();
    if (roll < amb) {
      const legSeed = (seed + i * 7919) >>> 0;
      const r = simulateCombat(guards, { ...foe }, { seed: legSeed, goldOnWin: 0 });
      group ??= { units: roadUnits(escort, pairs), troop: roadTroop(foe, poi) };
      // ⚠️ `deriveSkirmish` tire sur SON générateur (graine de la jambe) : `rng` n'est pas lu,
      // donc les rencontres suivantes et la cargaison restent celles du combat fondu.
      const d = deriveSkirmish(
        { log: r.log, win: r.win, allyPv: guards.pv, foePv: foe.pv },
        group.units,
        group.troop,
        legSeed,
      );
      const abattus = d.foesDown.length;
      events.push({
        kind: 'bandits',
        won: r.win,
        slain: abattus,
        down: [...d.down],
        text: r.win ? 'Une embuscade repoussée.' : 'Des bandits emportent une part du convoi.',
      });
      // 🛡️ `slainByAlly` : jamais `d.killsBy`, qui mélange les deux sens sous la même clé
      // (cf. sa doc) — un id d'aventurier qui collisionnerait avec un id de troupe (`foe0`)
      // ne doit jamais hériter des abattus que CE corps de troupe a scorés contre un autre.
      const parAmb = slainByAlly(escort, d);
      for (const a of escort) kills[a.id] = (kills[a.id] ?? 0) + (parAmb[a.id] ?? 0);
      const parts = skirmishXpShares(escort, group.troop, d);
      for (const a of escort) xpShare[a.id] = (xpShare[a.id] ?? 0) + (parts[a.id] ?? 0);
      // 🤕 Le journal dit qui est À TERRE ; la POLITIQUE d'infirmerie est celle du convoi.
      for (const id of convoyHurt(d)) if (!hurt.includes(id)) hurt.push(id);
      if (r.win) {
        mult *= 1.12;
      } else {
        lost = true;
        mult *= CARAVAN.lossKeep;
        // ⚠️ TIRAGE CONSERVÉ, résultat ignoré : il désignait l'ancienne victime au hasard,
        // remplacée par le PREMIER tombé (`convoyHurt`). Les rencontres des jambes suivantes
        // se tirent APRÈS lui sur `rng` : le retirer décalerait leur tirage et la cargaison,
        // et la route ne serait plus celle qui a été calibrée (vérifié par mutation).
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
  const haul = caravanHaulMult(escort, kit.advGear);
  const k = mult * haul;
  const raw = harvestYield(poi.type, poiRewardLevel(poi), tfH);
  const y = {
    energy: raw.energy * CARAVAN.yieldShare,
    summonStones: raw.summonStones * CARAVAN.yieldShare,
    keys: raw.keys,
    mana: raw.mana * CARAVAN.yieldShare,
  };
  const wages = caravanWages(escort, poi);
  // XP = le socle (plein si aucune embuscade perdue, réduit sinon) + la part des abattus.
  const xp = missionXpFor(escort, poi, !lost, xpShare, false, pantheonLevel);

  return {
    // ⚠️ Le plafond d'énergie s'applique APRÈS les multiplicateurs : « complément, jamais
    // substitut au sport » est un invariant, pas une base qu'un bon voyage dépasserait.
    gold: Math.round(goldCost(poi.type, poiRewardLevel(poi)) * 0.3 * k),
    // ⚠️ L'ARRONDI EN DERNIER, et ce n'est pas cosmétique : `y.energy` vaut la part
    // brute × `yieldShare` (0,5), donc il tombe sur un DEMI. Avec l'arrondi à
    // l'intérieur du `min`, dès que les multiplicateurs valaient ≥ 1 c'était la valeur
    // FRACTIONNAIRE qui gagnait — et `login_energy` est une colonne ENTIÈRE : la
    // sauvegarde partait en `invalid input syntax for type integer: "1234.5"`, la
    // promesse était rejetée sans que rien ne l'attrape, et le joueur cliquait
    // « Récupérer » sans qu'il ne se passe RIEN. Une cargaison était irrécupérable à vie.
    energy: Math.round(Math.min(y.energy, y.energy * k)),
    summonStones: Math.round(y.summonStones * k),
    keys: Math.round(y.keys * Math.min(1.2, k)) + keysBonus,
    mana: Math.round(y.mana * k),
    wages,
    xp,
    kills,
    hurt,
    events,
    text: events.map((e) => e.text).join(' '),
  };
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
  kit: EscortKit,
  /** ⚠️ REQUIS : réduction de trajet de l'Avant-poste (`travelTimeMult`). */
  travelMult: number,
  /** ⚠️ REQUIS : la référence de la prime de rattrapage. L'issue étant FIGÉE au départ,
   *  c'est le Panthéon de CE moment — comme le reste du rapport, annoncé puis tenu. */
  pantheonLevel: number,
): Caravan {
  const leg =
    caravanLegMin(poi, escort, advGearRoles(escort, kit.advGear).speed, travelMult) * 60_000;
  return {
    id,
    poi,
    escort: escort.map((a) => a.id),
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    outcome: resolveCaravan(poi, escort, seed, kit, pantheonLevel),
    claimed: false,
  };
}

/** La cargaison est-elle récupérable ? Le convoi doit être RENTRÉ, et pas déjà encaissé.
 *  ⚠️ `claimed === undefined` = déjà crédité, jamais « à récupérer ». */
export function isCaravanClaimable(c: Caravan, now: number): boolean {
  return c.claimed === false && now >= c.returnAt;
}

/**
 * 🎁 Ce que l'ENCAISSEMENT d'un convoi change au vivier — PUR, jumeau de `partyClaimRoster`.
 * - XP par aventurier (`outcome.xp`, calculée au départ), plafonnée par la Guilde ;
 * - 🤕 les blessés (`outcome.hurt`, règle `convoyHurt` : le premier tombé d'une embuscade
 *   PERDUE) partent à l'infirmerie pour `caravanHurtMs` (🩺 de l'escorte + Infirmerie) ;
 * - `escort` : les membres encore dans le vivier (un renvoyé n'a plus rien à recevoir) ;
 * - `wages` : ENTIER (colonne `gold` entière — cf. le bug de la cargaison décimale, v0.796).
 *
 * ⚠️ UNE CONVALESCENCE NE SE RACCOURCIT JAMAIS : on prend le MAXIMUM de l'échéance en cours
 * et de la nouvelle. Le store écrasait `hurtUntil`, donc encaisser un convoi pouvait REMETTRE
 * DEBOUT plus tôt un aventurier déjà alité plus longtemps (siège perdu, v0.887) — alors que
 * `partyClaimRoster` respectait déjà la règle. Cette divergence est la raison d'être de cette
 * fonction : la règle vit désormais à UN seul endroit par voie, testée.
 * ⚠️ Le HÉROS n'y figure jamais : ni XP (elle vient du sport), ni blessure de convoi.
 */
export function caravanClaimRoster(
  van: Caravan,
  roster: readonly Adventurer[],
  ctx: { pantheonLevel: number; infirmaryLevel: number; now: number },
): { adventurers: Adventurer[]; escort: Adventurer[]; wages: number } {
  const o = van.outcome;
  const escort = van.escort
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is Adventurer => !!a);
  // ⏱️ DEPUIS LE RETOUR DU CONVOI, pas depuis le clic « Encaisser » : le blessé arrive à
  // l'infirmerie quand le convoi rentre, et encaisser deux jours plus tard ne doit pas lui
  // faire recommencer sa convalescence. C'était le même défaut que le siège, en PIRE — le
  // décalage n'était pas borné par un tick mais par le moment où l'on pense à encaisser.
  // ⚠️ `null` = elle est déjà écoulée : il est debout, on ne pose pas un état mort.
  const hurtUntil = sinceEvent(van.returnAt, caravanHurtMs(escort, ctx.infirmaryLevel), ctx.now);
  const hurt = new Set(o.hurt);
  const adventurers = roster.map((a) => {
    const gain = o.xp[a.id];
    if (gain === undefined) return a;
    const up = grantAdvXp(a, gain, ctx.pantheonLevel);
    return hurtUntil && hurt.has(a.id)
      ? { ...up, hurtUntil: Math.max(up.hurtUntil ?? 0, hurtUntil) }
      : up;
  });
  return { adventurers, escort, wages: Math.max(0, Math.round(o.wages || 0)) };
}

// ── 📜 RAPPORT DE CONVOI (v0.853 ; demandé par l’utilisateur : « les aventuriers concernés et
// leur gain d’XP, pour voir la différence entre un long convoi et un court, et rappeler le
// temps de voyage ») ─────────────────────────────────────────────────────────────────────

interface CaravanReportMember {
  id: string;
  name: string;
  emoji: string;
  xp: number;
  /** Bandits abattus par LUI sur ce voyage. 0 pour un convoi d'avant le combat de groupe
   *  (son `outcome` n'a pas de `kills` du tout). */
  kills: number;
  hurt: boolean;
  /** Mis À TERRE dans une embuscade, gagnée OU perdue, sans partir à l'infirmerie. Sur une
   *  embuscade perdue toute l'escorte tombe, mais seul le premier tombé est blessé
   *  (`convoyHurt`) : les autres étaient eux aussi à terre, et le rapport doit le dire.
   *  ⚠️ Mutuellement exclusif avec `hurt` : un membre blessé reste 🤕, on ne lui ajoute pas
   *  ce second marqueur. Toujours `false` sur un convoi d'avant le combat de groupe (ses
   *  events n'ont pas `down`). */
  knockedDown: boolean;
  /** Plus dans le vivier (renvoyé depuis) : on garde sa ligne, l’XP a bien été versée. */
  gone: boolean;
}
export interface CaravanReport {
  /** Durée TOTALE du voyage, aller et retour. */
  travelMs: number;
  members: CaravanReportMember[];
  totalXp: number;
  /** 0 pour un convoi lancé AVANT le combat de groupe (pas de `kills` dans son `outcome`) :
   *  l'écran n'affiche alors pas de décompte qui mentirait. */
  totalKills: number;
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
  // 🩹 À TERRE dans N'IMPORTE QUELLE embuscade (gagnée ou perdue) ; `hurt` l'emporte plus bas.
  // ABSENT sur un convoi d'avant le combat de groupe (ses events n'ont pas `down`).
  const knockedDown = new Set(o.events.flatMap((e) => e.down ?? []));
  const members = van.escort.map((id): CaravanReportMember => {
    const adv = roster.find((a) => a.id === id);
    return {
      id,
      name: adv?.name ?? 'Champion parti',
      emoji: (adv && advTitle(adv)?.emoji) || '⚔️',
      xp: Math.max(0, Math.round(o.xp[id] ?? 0)),
      kills: Math.max(0, Math.round(o.kills?.[id] ?? 0)),
      hurt: hurt.has(id),
      knockedDown: knockedDown.has(id) && !hurt.has(id),
      gone: !adv,
    };
  });
  const totalXp = members.reduce((n, m) => n + m.xp, 0);
  const totalKills = members.reduce((n, m) => n + m.kills, 0);
  const travelMs = Math.max(0, van.returnAt - van.sentAt);
  const hours = travelMs / 3_600_000;
  const ent = (n: number) => Math.max(0, Math.round(n || 0));
  return {
    travelMs,
    members,
    totalXp,
    totalKills,
    xpPerHour: members.length && hours > 0 ? totalXp / members.length / hours : 0,
    pills: haulPills({
      gold: ent(o.gold),
      energy: ent(o.energy),
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
