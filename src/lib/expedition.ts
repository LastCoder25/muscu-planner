// expedition.ts — mode IDLE « Expédition » (pur/testable). Tu envoies ton héros
// explorer un POI d'une carte ; ça prend du TEMPS RÉEL (aller → objectif → retour) ;
// tu reviens chercher le rapport puis le butin. 100 % déterministe (seed + timestamps
// → carte/issue reproductibles, hors-ligne, aucun cron). Distinct du Labyrinthe
// (mode grille actif). Cf. mémoire expedition-idle-design.
//
// NB Date.now() n'est PAS utilisé ici : le `now` (ms epoch) est TOUJOURS passé par
// l'appelant → fonctions pures, testables.
import type { RiftBossReplay } from './rift';
import { characterRank, rankStartLevel, CHARACTER_RANKS } from './characterRank';
import { mulberry32, seedOf, simulateCombat, type Combatant, type CombatEvent } from './combat';
import { rollDrop, ITEM_SETS, type Item } from './items';
import type { RaidFaction } from './raid';
import type { AdvGear } from './advGear';

// ── Types ──
// 'arena' = survie par VAGUES : le héros tient le plus longtemps possible contre des
// vagues de plus en plus fortes (PV reportés) → récompense ∝ vagues tenues.
// 'well'/'shrine'/'archive' = POI de RESSOURCES (v0.658). Pourquoi : mesure faite, le
// butin de la carte n'améliore plus un joueur bien équipé (0 % d'upgrade) car la rareté
// d'un drop est plafonnée par le NIVEAU du joueur — et ce plafond, c'est l'anti-runaway,
// on n'y touche pas. Les ressources, elles, ne se périment JAMAIS : elles se consomment
// à tout niveau. La carte cesse donc d'être une loterie à butin pour devenir une source
// de ressources en temps réel, complémentaire des donjons qui, eux, donnent le stuff.
export type PoiType =
  | 'mine'
  | 'camp'
  | 'lair'
  | 'arena'
  | 'well'
  | 'shrine'
  | 'archive'
  // ⚓ ÉPAVE — **LEGACY, plus jamais générée (v0.999).** Elle était l'unique source de
  // ferraille ; la ferraille retirée (v0.998), elle n'était plus qu'une mine en moins bien
  // (moins d'or, pas d'énergie) et on la choisissait jamais. Le type RESTE pour relire ce
  // qui en porte déjà la trace : rapports de la boîte 📬, convois partis avant, et la cible
  // d'une expédition en cours. `advanceWorld` retire celles qui traînent sur la carte.
  | 'wreck'
  // 🕳️ FAILLE : le seul POI qu'on n'ATTAQUE pas pour son butin mais pour le REFERMER —
  // elle engendre des monstres, et à 7 jours elle déborde sur la base (cf. `rift.ts`).
  | 'rift'
  // 💠 MINE DE MANA RÉSIDUEL : ce qu'une faille laisse en s'effondrant. Récolte pure.
  | 'mana_mine'
  // ⚔️ BANDE EN MARCHE : l'armée d'une faille qui a débordé, en route vers la base. Le
  // SEUL POI qui BOUGE — sa position est recalculée à chaque tick. On l'intercepte pour
  // désarmer le renfort du prochain siège (cf. `rift.ts`).
  | 'warband';

/** Nom d'un POI. ⚠️ `Record<PoiType, …>` : TypeScript exige donc une entrée par type, et
 *  ajouter un POI casse la compilation tant qu'on ne l'a pas nommé. La boîte à messages
 *  avait sa PROPRE table, elle, déclarée `Record<string, string>` — non exhaustive, donc
 *  restée à 4 entrées quand les POI de récolte sont arrivés : un rapport d'épave, de
 *  source, de sanctuaire ou d'archives s'affichait SANS TITRE. Une seule table, désormais. */
export const POI_LABEL: Record<PoiType, string> = {
  mine: 'Mine',
  camp: 'Camp',
  lair: 'Repaire',
  arena: 'Arène',
  well: 'Source vive',
  shrine: "Sanctuaire d'invocation",
  archive: 'Archives englouties',
  wreck: 'Épave de convoi',
  rift: 'Faille',
  mana_mine: 'Mine de mana résiduel',
  warband: 'Bande en marche',
};

/** Emoji d'un point d'intérêt — la carte et le rapport de convoi lisent la MÊME table
 *  (une copie dans le rapport avait déjà divergé sur le repaire et l'épave). */
export const POI_EMO: Record<PoiType, string> = {
  mine: '⛏️',
  camp: '🏕️',
  lair: '👹',
  arena: '🏟️',
  well: '💧',
  shrine: '🔮',
  archive: '📖',
  wreck: '⚓',
  rift: '🕳️',
  mana_mine: '💠',
  warband: '⚔️',
};

/** POI de récolte pure : aucun combat, on ramasse et on rentre (comme la mine). */
export const HARVEST_TYPES: ReadonlySet<PoiType> = new Set<PoiType>([
  'mine',
  'well',
  'shrine',
  'archive',
  'mana_mine',
]);

/** 🏕️ Les POI qu'on ATTAQUE en groupe (étape 3 des camps) : camp = troupe + chef,
 *  repaire = troupe plus grande + champion. */
export const CAMP_TYPES: ReadonlySet<PoiType> = new Set<PoiType>(['camp', 'lair']);
/** 🎯 Les POI qu'on attaque EN GROUPE (héros et/ou aventuriers) : les camps de faction
 *  ET les failles. ⚠️ DISTINCT de `CAMP_TYPES` : celui-ci dit « on y envoie un groupe »,
 *  l'autre dit « ça se résout comme un camp ». Une faille s'envoie pareil et se résout
 *  autrement (`resolveIncursion` : attrition, gardien, mana). Dérivé de `CAMP_TYPES` pour
 *  qu'un nouveau type de camp ouvre l'envoi de groupe tout seul. */
export const PARTY_TARGETS: ReadonlySet<PoiType> = new Set<PoiType>([
  ...CAMP_TYPES,
  'rift',
  'warband',
]);
/** ⚔️ L'armée d'une faille qui a débordé, en route vers la base. */
export const isWarbandPoi = (p: Pick<Poi, 'type'>): boolean => p.type === 'warband';
export const CAMP_FACTIONS: readonly RaidFaction[] = ['bandits', 'betes', 'mortsvivants'];

/**
 * 🕳️ La faction d'une faille — DÉRIVÉE de son id, jamais stockée.
 *
 * ⚠️ Elle vit ICI et non dans `rift.ts` pour la même raison que la maturité : ce module-là
 * importe celui-ci (jamais l'inverse), et la CARTE en a besoin pour donner sa bannière à
 * l'armée qui sort d'une faille. `rift.riftSpecOf` s'y adosse.
 *
 * ⚠️ GÉNÉRATEUR SÉPARÉ (constante XOR propre), patron exact de `campSpecOf` : le spawn ne
 * tire rien de plus, donc la carte reste identique au bit près et une faille d'une carte
 * déjà sauvegardée en a une sans migration.
 */
export function riftFactionOf(id: string): RaidFaction {
  const rng = mulberry32((seedOf(id) ^ 0x1f83d9ab) >>> 0 || 1);
  return CAMP_FACTIONS[Math.floor(rng() * CAMP_FACTIONS.length)]!;
}
/** Taille d'un camp = sa FORCE, en aventuriers de RÉFÉRENCE (cf. `campFoe`). Un gros
 *  repaire en demande nettement plus que trois. ⚠️ MESURÉ, gardé tel quel : les bandes de
 *  `campCalibration.test` tiennent avec ces tailles (cf. `CAMP.pvTurns`). */
export const CAMP_SIZES: { camp: readonly number[]; lair: readonly number[] } = {
  camp: [2, 3, 4],
  lair: [5, 7, 10],
};

export interface CampSpec {
  faction: RaidFaction;
  size: number;
}

/** ⚔️ Ce qu'un GROUPE a vécu sur un camp — porté par l'issue, recopié dans le rapport 📬 et
 *  encaissé par `expeClaim`. ⚠️ Absent des expéditions et rapports d'avant les camps de
 *  faction : tous les lecteurs le traitent comme optionnel. */
export interface PartyResult {
  hero: boolean;
  faction: RaidFaction;
  /** Ids des aventuriers envoyés (le héros n'y figure pas). */
  escort: string[];
  win: boolean;
  foes: number;
  slain: number;
  /** Abattus PAR aventurier. ⚠️ `foesDown` (la liste des corps) n'est plus stocké : seul
   *  son compte (`slain`) servait. Les rapports d'avant le portent encore, sans effet. */
  kills: Record<string, number>;
  heroKills: number;
  /** XP par aventurier : socle de mission + part des abattus (× distance). */
  xp: Record<string, number>;
  /** Aventuriers envoyés à l'infirmerie (défaite : tous ceux qui sont tombés). */
  hurt: string[];
  advGear: Omit<AdvGear, 'id'>[];
  /** Salaires de l'escorte, déduits à l'encaissement. */
  wages: number;
  journal: string[];
  /**
   * 🕳️ Ce qu'il faut pour REJOUER une incursion de faille (`riftStage.ts`) — et rien de
   * plus : le niveau dit qui l'on a croisé, le sillage de PV dit l'attrition.
   *
   * ⚠️ **SA PRÉSENCE EST CE QUI DIT « INCURSION »**, et c'est délibérément la SEULE source :
   * un camp n'en a pas. Deux façons de reconnaître une faille (ce champ et le `poiType` du
   * message) finiraient par se contredire, et l'écran dirait « camp pris » d'un côté et
   * « faille refermée » de l'autre.
   *
   * ⚠️ **ABSENT DES RAPPORTS D'AVANT LA v0.977** : ils se liront comme des camps et n'auront
   * pas de rejeu. On ne l'invente pas — la boîte ne garde que 30 messages, ça se résorbe.
   */
  rift?: {
    level: number;
    maxPv: number;
    pvTrail: number[];
    /** Le duel contre le gardien (`bossReplaySteps`). Absent si la porte ne s'est pas
     *  ouverte, ou d'un rapport d'avant la v0.998 : la scène retombe alors sur un seul coup. */
    boss?: RiftBossReplay;
  };
}

/** FNV-1a 32 bits : un id de POI → une graine. */
function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Faction et taille d'un camp — DÉRIVÉES de l'id, jamais stockées.
 *
 * ⚠️ GÉNÉRATEUR SÉPARÉ, par construction : `spawnOne` ne tire rien de plus, donc la carte
 * reste identique au bit près. ⚠️ Un camp d'une carte sauvegardée AVANT les camps de faction
 * en a une aussi, sans migration ni normalisation. ⚠️ Ni la distance ni le niveau n'y
 * entrent : « de tout un peu partout » (seul le niveau suit la distance, règle v0.683).
 */
export function campSpecOf(poi: Pick<Poi, 'id' | 'type'>): CampSpec | null {
  if (poi.type !== 'camp' && poi.type !== 'lair') return null;
  const rng = mulberry32((hashId(poi.id) ^ 0x6d2b79f5) >>> 0 || 1);
  const faction = CAMP_FACTIONS[Math.floor(rng() * CAMP_FACTIONS.length)]!;
  const sizes = CAMP_SIZES[poi.type];
  return { faction, size: sizes[Math.floor(rng() * sizes.length)]! };
}

export interface Poi {
  id: string;
  type: PoiType;
  /** Route dangereuse, TÉLÉGRAPHIÉE dans l'UI avant l'envoi : plus d'embuscades, mais
   *  une récompense renforcée quand on les repousse. Le choix du POI cesse d'être
   *  « le plus proche » pour devenir un vrai arbitrage risque/gain.
   *  ⚠️ TIRÉ AU SPAWN et jamais retouché : c'est ce qui le rend annonçable. Le harcèlement
   *  des failles, lui, vit dans `riftPeril` — deux CAUSES distinctes, un seul effet
   *  (`routePerilous`), parce que l'écran doit pouvoir dire LAQUELLE et que l'une des deux
   *  est actionnable (refermer ses failles AVANT 7 j empêche toute embuscade). */
  perilous?: boolean;
  /** 🕳️ Harcelé par les monstres EMBUSQUÉS d'une faille qui a débordé (v0.1009 ; avant :
   *  par toute faille ouverte). ⚠️ DÉRIVÉ, recalculé à chaque `advanceWorld` : il s'éteint
   *  tout seul quand l'embuscade expire. Ne jamais l'écrire ailleurs — il serait faux dès
   *  le tick suivant. Le NOM est gardé : il est sérialisé dans les cartes existantes. */
  riftPeril?: boolean;
  /** 🕳️ Niveau sur lequel se calcule le TRAJET (v0.1012). ⚠️ Posé seulement quand le niveau
   *  du lieu NE DÉCOULE PAS de sa distance — une faille (niveau tiré par rang) et ce qu'elle
   *  laisse (mine, bande). Sans lui, une faille Bronze posée au bout de la carte prenait
   *  30 % de temps en moins qu'un autre lieu au même endroit : le trajet ne se lisait plus
   *  sur la carte. Absent → le niveau du lieu (tous les autres POI, et les failles d'avant). */
  travelLevel?: number;
  /** ⚔️ BANDE EN MARCHE uniquement — la faction héritée de sa faille, et son point de
   *  DÉPART. ⚠️ `from` est immuable : la marche s'interpole de là vers la ville, donc la
   *  recalculer depuis la position courante la ferait ralentir à chaque tick sans jamais
   *  arriver. `x`/`y`/`distNorm`, eux, sont RECALCULÉS à chaque `advanceWorld`. */
  faction?: RaidFaction;
  from?: { x: number; y: number };
  setId?: string; // 'lair' uniquement : set ciblé
  level: number;
  x: number; // coord carte (0..100)
  y: number;
  distNorm: number; // distance normalisée ville↔POI (0..1) → temps de trajet
  spawnedAt: number; // ms epoch
  expiresAt: number; // ms epoch (le POI disparaît si non fait)
}

export interface ExpeditionMap {
  seed: number;
  spawnCount: number; // compteur de spawns → rng déterministe par spawn
  pois: Poi[];
  nextSpawnAt: number; // ms epoch du prochain spawn possible
  /** 🕳️ Compteur de failles — SÉPARÉ de `spawnCount`, et c'est volontaire : partagé, une
   *  faille décalerait le flux aléatoire de tous les spawns suivants, donc la carte de
   *  chaque joueur changerait de composition sans raison. Absent des cartes sauvegardées
   *  avant les failles → lu comme 0, aucune migration. */
  riftCount?: number;
  /** ms epoch de la prochaine faille possible (idem : absent = « dès maintenant »). */
  nextRiftAt?: number;
  /** 🐫 Les monstres EMBUSQUÉS autour d'une faille qui a débordé (v0.1009). Absent des
   *  cartes d'avant → aucune embuscade, aucune migration. */
  ambushes?: RiftAmbush[];
}

/** 🐫 Une embuscade laissée par une faille qui a débordé : là où elle était, jusqu'à
 *  `until`. ⚠️ Elle SURVIT à la faille (qui devient une mine de mana) et à la bande qui
 *  marche sur la base : ce sont les monstres qui sont RESTÉS. */
export interface RiftAmbush {
  id: string;
  x: number;
  y: number;
  until: number;
}

/** ⚠️ CE QUI COMPTE DANS LE QUOTA GÉNÉRAL (`poiCap`/`poiFloor`, 20). Les **failles** ont
 *  le LEUR (`riftCap`/`riftFloor`) et les **mines résiduelles** ne sont pas un spawn mais
 *  la CONSÉQUENCE d'un débordement. Les faire entrer dans le quota volerait des places aux
 *  mines, camps, puits et épaves — dont l'économie est MESURÉE (`campEconomy`, `goldSink`,
 *  `scrapEconomy`) : les failles s'AJOUTENT à la carte, elles ne la remplacent pas. */
// ⚠️ Hors quota : ce sont des CONSÉQUENCES, pas des spawns. Les failles ont leur propre
// quota ; la mine résiduelle et la bande en marche sont ce qu'une faille LAISSE en
// débordant. Les compter volerait une place à une mine, un camp ou une épave — or le débit
// de la carte est mesuré (`campEconomy`, `goldSink`).
const OUT_OF_QUOTA: ReadonlySet<PoiType> = new Set<PoiType>(['rift', 'mana_mine', 'warband']);

/** 🎲 PLUS AUCUN DÉGRADÉ DE DISTANCE (v0.1013). Le niveau d'un lieu est tiré au hasard dans
 *  la fenêtre (`placePoiOfType`), celui d'une faille par rang (`riftLevelFor`) : aucun des
 *  deux ne découle de l'éloignement, donc le filtre `levelFitsDistance` (qui élaguait ce qui
 *  était « trop fort pour sa distance », v0.688) est RETIRÉ — il aurait effacé au tick suivant
 *  tout lieu fort tiré près de la ville, et avec lui les exemptions qu'il fallait lui
 *  arracher pour la faille, sa mine et la bande en marche. Seul le TRAJET reste lié à la
 *  distance (`travelLevel`). */
export const isQuotaPoi = (p: Pick<Poi, 'type'>): boolean => !OUT_OF_QUOTA.has(p.type);
export const isRiftPoi = (p: Pick<Poi, 'type'>): boolean => p.type === 'rift';

/**
 * 🐫 Cette route est-elle dangereuse ? — **LE SEUL prédicat**, deux causes.
 *
 * `perilous` est tiré au spawn et ne bouge jamais ; `riftPeril` est dérivé des failles
 * ouvertes à portée et s'éteint quand on les referme. Les CONSOMMATEURS (`roadFoe`,
 * `ambushChance`, le nombre de jambes, le butin, les rencontres du héros) ne doivent
 * connaître que l'effet — sinon l'un d'eux finirait par oublier l'une des deux causes,
 * et une route irradiée serait dangereuse pour le combat mais pas pour les embuscades.
 */
export const routePerilous = (p: Pick<Poi, 'perilous' | 'riftPeril'>): boolean =>
  !!p.perilous || !!p.riftPeril;

export interface ExpeditionOutcome {
  win: boolean;
  gold: number; // crédité au RETOUR
  energy: number; // ⚡ énergie de jeu (mines uniquement) → crédite login_energy
  summonStones: number; // 🔮 pierres d'invocation → coût des boss de palier
  /** 💠 Pierres de mana — la monnaie du gacha de champions. ⚠️ Elle n'a pas encore de
   *  PUITS (le gacha n'existe pas) : elle s'ACCUMULE, et c'est l'ordre voulu
   *  (failles → pierres de mana → gacha). À ne pas confondre avec une devise MORTE, dont
   *  le puits a été retiré — ici il arrive. */
  mana: number;
  item: Omit<Item, 'id'> | null; // la « prise » principale (pièce de set / objet) ou null
  items?: Omit<Item, 'id'>[]; // ARÈNE : plusieurs objets (1 par palier de vagues) ; `item` = le 1er
  key: number; // clé de Labyrinthe (consolation rare)
  reconBonus: number; // +fraction de réussite au prochain essai (échec)
  /** Multiplicateur sur la jambe RETOUR (1 = normal). Un passage découvert ou un
   *  contretemps ramènent le héros plus tôt — le seul effet qui joue sur le TEMPS. */
  returnMult: number;
  waves?: number; // 'arena' uniquement : nombre de vagues tenues
  party?: PartyResult; // ⚔️ camp de faction attaqué en groupe
  text: string; // texte du rapport
}

export interface ActiveExpedition {
  poi: Poi;
  sentAt: number;
  midAt: number; // arrivée à l'objectif (résolution + rapport)
  returnAt: number; // retour en ville (butin crédité)
  goldCost: number;
  seed: number;
  outcome: ExpeditionOutcome; // calculé au DÉPART, révélé/crédité aux timestamps
  reported?: boolean; // le rapport a-t-il déjà été déposé dans la boîte (à midAt) ?
}

// Rapport déposé dans la boîte à messages 📬 à l'arrivée à l'objectif.
export interface ExpeditionMessage {
  id: string;
  /** ⚠️ OPTIONNEL depuis que la boîte porte AUSSI le coffre de Défi 360 (v0.715) : un
   *  coffre ne vient d'aucun point d'intérêt. Lui inventer un type de POI bidon aurait
   *  mis un mensonge dans la donnée pour éviter un point d’interrogation dans le type —
   *  et l'écran aurait affiché « Puits » sur un coffre. */
  poiType?: PoiType;
  /** Titre imposé (le coffre). Sinon le libellé vient de POI_LABEL. */
  title?: string;
  /** Coffre de fin de Défi 360 : change l’icône, le titre et l’animation d’ouverture. */
  chest?: boolean;
  setId?: string;
  level: number;
  win: boolean;
  text: string;
  gold: number;
  energy: number; // ⚡ énergie gagnée (mines)
  summonStones?: number; // 🔮
  /** 🔩 LEGACY : ferraille d'un rapport déposé avant son retrait (v0.998). Plus jamais
   *  écrite ; convertie en or à l'encaissement (`SCRAP_TO_GOLD`). */
  scrap?: number;
  mana?: number; // 💠 pierres de mana (mine résiduelle d'une faille)
  tickets?: number; // 🎟️ tickets d'invocation (coffres gagnés par le sport, v0.992)
  itemName?: string; // legacy : nom seul (anciens messages) — repli d'affichage
  item?: Omit<Item, 'id'>; // objet gagné COMPLET (rareté/effet/niveau) → détail dans la boîte
  itemCount?: number; // ARÈNE : nombre total d'objets ramenés (> 1) — le reste va au sac
  items?: Omit<Item, 'id'>[]; // TOUS les objets ramenés : c'est le message qui les porte
  key: number;
  waves?: number; // 'arena' : vagues tenues
  party?: PartyResult; // ⚔️ rapport d'un groupe de camp (absent des rapports d'avant)
  resolvedAt: number; // ms epoch (midAt)
  /** À partir de quand le butin peut être récupéré = le retour en ville. Avant, le héros
   *  est encore sur la route : on lit le rapport, on ne touche pas au chargement. */
  claimAt?: number;
  /** ⚠️ `undefined` signifie DÉJÀ CRÉDITÉ, jamais « à récupérer ». Les messages écrits
   *  avant le passage en récupération manuelle ont été crédités automatiquement ; les
   *  traiter comme non réclamés offrirait leur butin une seconde fois. Seuls les messages
   *  écrits depuis portent `false` explicitement. */
  claimed?: boolean;
  read: boolean;
}

/** Le butin de ce message est-il à récupérer ? (cf. la note sur `claimed`.) */
/** Titre d'un message de la boîte. ⚠️ Source unique : la boîte lisait POI_LABEL[poiType]
 *  directement, ce qui rendait tout message SANS POI impossible à nommer. */
export function messageTitle(m: ExpeditionMessage): string {
  return m.title ?? (m.poiType ? POI_LABEL[m.poiType] : 'Rapport');
}
export function isClaimable(m: ExpeditionMessage, now: number): boolean {
  return m.claimed === false && now >= (m.claimAt ?? m.resolvedAt);
}

/** Taille de la boîte 📬 — UNE seule valeur pour tous ses écrivains. ⚠️ Elle valait 20 dans
 *  deux d'entre eux (`expeTick`, `expeSettle`) et 30 dans les six autres : la même boîte se
 *  taillait donc différemment selon l'écriture qui passait en dernier, et un rapport lu
 *  pouvait disparaître plus tôt sans raison. */
export const MESSAGES_CAP = 30;

/** Taille la boîte 📬 SANS jamais jeter un butin à récupérer. ⚠️ Un `slice` brut pouvait
 *  pousser dehors un rapport non encaissé — et avec lui l'XP d'un groupe entier.
 *  On garde les `cap` messages les plus récents (la liste est du plus récent au plus
 *  ancien), PLUS tout message plus ancien encore `claimed === false`. Ordre conservé.
 *  ⚠️ Un butin en attente ne chasse donc JAMAIS un message récent : la boîte garde ce
 *  qu'elle montrait, elle ne fait que sauver ce qu'elle aurait perdu. */
export function keepMessages(list: ExpeditionMessage[], cap: number): ExpeditionMessage[] {
  return list.filter((m, i) => i < cap || m.claimed === false);
}

/**
 * 📬 DÉPOSE des rapports dans la boîte COURANTE — sans jamais dégrader un encaissement ni
 * doubler un message. SOURCE UNIQUE des écrivains de la boîte (`expeTick`, `expeSettle`,
 * `settleParties`, encaissement, marquage « lu »).
 *
 * ⚠️ LE DOUBLE ENCAISSEMENT (revue finale des camps). `expeSettle` REMPLAÇAIT le rapport
 * déjà déposé par `buildMessage(...)`, qui porte `claimed: false` : un butin encaissé entre le
 * retour et ce tick redevenait encaissable — or, objets, XP de l'escorte, pièces d'aventurier.
 * Trois règles ici :
 * - un message dont l'id est DÉJÀ dans la boîte n'est JAMAIS remplacé (la boîte fait foi) ;
 * - `claimedIds` : les encaissements PARTIS mais pas encore relus du serveur — ils restent
 *   `claimed: true` même si une ligne relue entre-temps dit encore `false` ;
 * - rien de neuf, rien de marqué → la MÊME référence (le store n'écrit pas à vide).
 * Les nouveaux messages passent devant, taillés par `keepMessages` (jamais un butin jeté).
 */
export function depositMessages(
  box: ExpeditionMessage[],
  fresh: readonly ExpeditionMessage[],
  cap: number,
  claimedIds: ReadonlySet<string> = new Set(),
): ExpeditionMessage[] {
  let marked = false;
  const base = box.map((m) => {
    if (m.claimed !== false || !claimedIds.has(m.id)) return m;
    marked = true;
    return { ...m, claimed: true, read: true };
  });
  const seen = new Set(base.map((m) => m.id));
  const added: ExpeditionMessage[] = [];
  for (const m of fresh) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    added.unshift(m); // le dernier déposé passe devant, comme `[msg, ...box]`
  }
  if (!added.length) return marked ? base : box;
  return keepMessages([...added, ...base], cap);
}

/** Ce qu'une expédition a rapporté, prêt à afficher. ⚠️ SOURCE UNIQUE des deux écrans
 *  (modale de collecte ET boîte à messages 📬) : chacun listait ses devises à la main, et
 *  les deux avaient été oubliées lors de l'ajout des POI de RÉCOLTE (v0.658) — une épave
 *  affichait donc un butin VIDE.
 *  Ajouter une devise ici la fait apparaître partout. */
export function haulPills(o: {
  gold?: number;
  energy?: number;
  summonStones?: number;
  key?: number;
  mana?: number;
  tickets?: number;
}): { emoji: string; n: number }[] {
  return (
    [
      { emoji: '🪙', n: o.gold ?? 0 },
      { emoji: '⚡', n: o.energy ?? 0 },
      { emoji: '🔮', n: o.summonStones ?? 0 },
      { emoji: '🗝️', n: o.key ?? 0 },
      { emoji: '💠', n: o.mana ?? 0 },
      { emoji: '🎟️', n: o.tickets ?? 0 },
    ] as const
  )
    .filter((p) => p.n > 0)
    .map((p) => ({ emoji: p.emoji, n: p.n }));
}

/** L'objet à montrer dans un message de la boîte, et combien d'autres il porte.
 *  ⚠️ `item` n'est pas toujours posé : le coffre du boss entre amis ne portait que `items`,
 *  et son trophée n'apparaissait donc pas dans les récompenses. On lit les deux. */
export function messageLoot(m: {
  item?: Omit<Item, 'id'>;
  items?: Omit<Item, 'id'>[];
  itemCount?: number;
}): { item: Omit<Item, 'id'>; more: number } | null {
  const item = m.item ?? m.items?.[0];
  if (!item) return null;
  const count = Math.max(m.itemCount ?? 0, m.items?.length ?? 1);
  return { item, more: Math.max(0, count - 1) };
}

/** Construit le message de rapport d'une expédition (déposé à l'arrivée à l'objectif). */
export function buildMessage(exp: ActiveExpedition): ExpeditionMessage {
  const o = exp.outcome;
  return {
    id: `msg_${exp.poi.id}_${exp.sentAt}`,
    poiType: exp.poi.type,
    ...(exp.poi.setId ? { setId: exp.poi.setId } : {}),
    level: exp.poi.level,
    win: o.win,
    text: o.text,
    gold: o.gold,
    energy: o.energy,
    ...(o.summonStones ? { summonStones: o.summonStones } : {}),
    ...(o.mana ? { mana: o.mana } : {}),
    ...(o.item ? { itemName: o.item.name, item: o.item } : {}),
    ...(o.items && o.items.length > 1 ? { itemCount: o.items.length } : {}),
    // Les objets vivent DANS le message : c'est lui qui sera encaissé, donc c'est lui
    // qui doit tout porter (l'arène en rend plusieurs).
    ...(o.items && o.items.length ? { items: o.items } : o.item ? { items: [o.item] } : {}),
    key: o.key,
    ...(o.waves !== undefined ? { waves: o.waves } : {}),
    ...(o.party ? { party: o.party } : {}),
    resolvedAt: exp.midAt,
    claimAt: exp.returnAt,
    claimed: false,
    read: false,
  };
}

// ── Constantes (tunables ; éco chiffrée affinée par simulation en phase 6) ──
/** Réglages des POI de RÉCOLTE (devises vivantes). Premier calage : à ajuster à l'usage. */
export const HARVEST = {
  /** 💠 Mine de mana résiduel. ⚠️ ÉCHELLE PROVISOIRE : les coûts du gacha n'existent pas
   *  encore, donc aucun de ces deux nombres ne peut être calibré aujourd'hui. Ce qui est
   *  vrai et testé, c'est le RATIO « fermer une faille > l'ignorer et ramasser sa mine »
   *  (cf. `rift.ts`). */
  manaBase: 3,
  manaPerLevel: 0.5,
  wellEnergyMax: 200, // ~5 runs de donjon : un complément net, pas une séance de sport
  keyChance: 0.12, // clé de Labyrinthe en prime occasionnelle
  /** Trajet (facteur de voyage) à partir duquel une archive rend une 2ᵉ clé : aller loin
   *  paie plus, ici aussi. */
  archiveFarKeyAt: 6,
} as const;

export const EXPE = {
  mapSize: 200, // côté de la carte (coord 0..mapSize) — GRANDE, on pan/zoom dessus
  town: { x: 100, y: 100 }, // ville de départ (CENTRE de la carte)
  // Rythme, TROIS fois recalibré. v0.658 : avec 10 POI au plancher et des durées de vie
  // de 12→48 h, la carte était TOUJOURS pleine — aucune rareté, aucun arbitrage — d'où
  // une forte réduction (bande 3-6, moyenne 4,2). v0.665 : la carte ayant perdu son
  // anneau de bâtiments (déménagé sur l'écran « Ma base »), elle paraissait vide → bande
  // 5-9, moyenne 6,4. v0.671 : densité DOUBLÉE → bande **10-18, moyenne 11,9**, mesurée
  // sur 7 jours × 40 graines. Elle ne colle toujours JAMAIS au plafond (0 % du temps) :
  // des POI expirent encore avant qu'on les fasse, donc choisir reste un vrai arbitrage.
  // ⚠️ Doubler le nombre OBLIGE à resserrer `minDistPoi` — cf. la note sur cette clé.
  // 20 POI en permanence : la carte est toujours peuplée, et comme le NIVEAU découle
  // désormais de la distance, cette densité est ce qui rend le dégradé lisible — il faut
  // du monde à toutes les distances pour qu'on voie la pente.
  // ⚠️ **16, ET C'EST LE PRIX DES 6 FAILLES** (v0.929, décision de l'utilisateur). La
  // couronne ne porte que **22 POI** sans chevauchement (mesuré : 0 à 22, **105 à 26**), et
  // `minDistPoi` n'est pas un levier (105/159/138/46/1629 à 14/12/11/10/9). Passer de 2 à 6
  // failles imposait donc de rendre 4 places : **-20 % de lieux ordinaires**, donc mines,
  // camps et épaves en moins — d'où la re-mesure de `campEconomy`, `goldSink` et
  // `scrapEconomy`, dont les bornes étaient calibrées sur 20.
  poiCap: 16,
  poiFloor: 16,
  /**
   * 🕳️ Failles simultanées — quota PROPRE, en plus des 16 (cf. `isQuotaPoi`).
   *
   * **6 au plafond**, ce que demandait la spec d'origine (« 3 à 6 simultanées, de rangs
   * variés »), payé par `poiCap` 20 → 16 : le total reste à **22 POI**, le seul chiffre que
   * la couronne tienne à 0 chevauchement.
   *
   * ⚠️ **LE PLANCHER RESTE À 2, ET CE N'EST PAS UN OUBLI.** `riftFloor` spawne SANS
   * CONDITION : à 6, une carte neuve ferait naître les six **au même instant**, donc six
   * armées au même instant sept jours plus tard, puis un silence de sept jours — une
   * PULSATION, pas un rythme. À 2, l'horloge (8-16 h) remplit jusqu'à 6 en ~2 jours et les
   * âges se **désynchronisent d'eux-mêmes**, sans jamais antidater une faille (ce qui
   * offrirait une armée immédiate à un joueur qui vient d'ouvrir sa carte).
   *
   * ⚠️ **C'est le PLANCHER qui empilait**, pas le plafond — mesuré : cap 4/plancher 2 → 15
   * chevauchements, cap 4/plancher **3** → 102.
   */
  riftCap: 6,
  riftFloor: 2,
  /** Rythme d'apparition d'une faille. ⚠️ Volontairement plus LENT que celui des POI
   *  ordinaires (1-2 h) : une faille vit 7 jours, donc le quota se remplit de toute façon,
   *  et un spawn rapide ne ferait que le saturer d'un coup après chaque effondrement. C'est
   *  le PLANCHER (`riftFloor`) qui garantit qu'il y a toujours de quoi aller refermer. */
  /** ⚠️ **8-16 h → 4-8 h (v0.965, mesuré ; signalé : « je n'ai que des Or noir comme mon
   *  rang »).** Le tirage du RANG était correct — c'est le NOMBRE de brèches ouvertes qui
   *  ne l'était pas. Mesuré sur 60 jours : un joueur qui referme **2 failles par jour** —
   *  c'est-à-dire qui JOUE — n'en voyait plus que **3,1 en moyenne, soit 2,4 rangs**
   *  distincts, et **6 % du temps seulement** il en avait 5 ou plus. Avec deux ou trois
   *  brèches sous les yeux, la variété promise (« six rangs variés, sinon *laquelle je
   *  referme* n'est pas une question ») ne peut pas se manifester.
   *
   *  À 4-8 h : **5,5 failles et 3,2 rangs** en refermant 2/jour, **5,6 / 3,2** à 3/jour
   *  (contre 2,1 / 1,8 avant) — la carte tient à TOUS les rythmes de jeu testés.
   *
   *  ⚠️ **LES DEUX INVARIANTS EN JEU ONT ÉTÉ MESURÉS AVANT, pas supposés.** Les
   *  **débordements** (donc les sièges renforcés, v0.933) ne bougent **pas du tout** :
   *  0,80/j si l'on ne referme rien, **0,00 dès une fermeture par jour**, à toutes les
   *  cadences — c'est le PLAFOND de 6 qui borne, jamais l'horloge. Et l'**irradiation**
   *  des routes (v0.934) ne monte que de **19 % à 23 %** à 2 fermetures/jour, en laissant
   *  ~8,8 routes de récolte propres : les convois ont toujours où aller. */
  riftSpawnMinMs: 8 * 3600_000,
  riftSpawnJitterMs: 8 * 3600_000,
  perilousChance: 0.18, // ~1 POI sur 5 signalé « route dangereuse » avant l'envoi
  // ⚠️ L'écart mini doit SUIVRE la densité. À 20 POI dans la couronne (rayon 18→64), un
  // écart de 20 occuperait 53 % de la surface : le placement aléatoire échouerait ses
  // 6 essais et les POI se poseraient les uns sur les autres. À 14, on retombe à 26 %.
  minDistPoi: 14, // écart mini entre POI (placement espacé)

  /** 🐫 **HARCÈLEMENT DES CONVOIS — les monstres embusqués d'une faille qui a DÉBORDÉ.**
   *
   *  ⚠️ **RÈGLE v0.1009 (demandée par l'utilisateur ; override la v0.934)** : une faille
   *  qui MÛRIT ne harcèle PLUS rien. Le harcèlement ne commence qu'au DÉBORDEMENT (7 j),
   *  quand les monstres sortent — et l'armée se SCINDE : une partie s'EMBUSQUE autour de
   *  la faille pendant `ambushMs` (2 jours), l'autre marche sur la base (la bande qu'on
   *  intercepte, puis le siège renforcé, inchangés). Refermer ses failles avant 7 jours
   *  empêche donc TOUTE embuscade ; une fois sorties, on attend ou on escorte plus fort.
   *
   *  Les lieux dans le rayon deviennent périlleux. ⚠️ **AUCUN NOUVEAU MODÈLE DE COMBAT** — on
   *  réutilise un drapeau déjà calibré et verrouillé par des tests (trio sur route calme
   *  73-94 % d'embuscades repoussées, sur route périlleuse 8-35 %, un quatuor y remontant
   *  à 98 %). La parade est donc d'envoyer un aventurier de plus, pas de renoncer.
   *
   *  ⚠️ **ET SURTOUT PAS la seconde moitié de la spec** (« `roadFoe` mis à l'échelle du
   *  rang de la faille ») : `perilous` coûte déjà ça, et toucher `roadFoe` invaliderait la
   *  calibration MESURÉE sur laquelle repose toute la boucle des convois.
   *
   *  **Pourquoi le renfort de siège ne suffisait pas** : perdre un siège coûte peu (du
   *  stock non récolté, des réparations), on peut donc accepter le pari indéfiniment. Le
   *  harcèlement frappe **là où la base ne protège pas** — un rempart ne défend pas une
   *  cargaison sur la route.
   *
   *  ⚠️ **CES CONSTANTES VIVENT ICI, PAS DANS `RIFT`**, et ce n'est pas un rangement par
   *  défaut : un rayon s'exprime en **coordonnées de carte** et son plancher EST
   *  `minDistPoi` (juste au-dessus) — c'est de la géométrie de carte. Les mettre dans
   *  `rift.ts` créerait en prime un cycle d'import (`rift.ts` importe déjà ce module).
   *
   *  _(Mesure de l'ancienne règle, v0.934 — harcèlement DÈS l'ouverture, rayon croissant :
   *  on ne ferme rien → 21 % des lieux de récolte · 1 fermeture/jour → 14 % · 2/jour → 1 %.
   *  La nouvelle mesure est dans `riftHarass.test`.)_
   *
   *  Le rayon est celui d'une faille MÛRE sous l'ancienne règle (`irradMax`) : les
   *  monstres sortent à pleine maturité, il n'y a plus rien à faire grandir.
   */
  irradMax: 25,
  /** Durée d'une embuscade après le débordement (demandé : « pendant 2 jours »). */
  ambushMs: 2 * 24 * 3600_000,
  // Bandes de distance : on en cycle 5 au lieu de 3 (répartition proche/moyen/lointain ; depuis la v0.1013 le niveau ne suit plus la distance, seul le trajet). Avant, la
  // granularité des bandes EST la granularité de la difficulté proposée — 3 bandes ne
  // donnaient que trois marches sur toute la fenêtre de niveaux.
  distBands: 5, // bandes de distance parcourues à tour de rôle (cf. placePoi)
  /** 🕳️ Écart MAXIMAL d'une faille « au-dessus » du joueur, en part de SON niveau (v0.980).
   *  ⚠️ MESURÉ avec le groupe complet (héros borné à deux champions + 3 champions, faille
   *  mûre / jeune) : à l'écart maximal, niveau 12 (+3) ~100/100 %, 26 (+7) ~75/97 %,
   *  45 (+11) ~50/95 %, 70 (+18) ~70/98 %. Le niveau étant tiré uniformément dans l'écart,
   *  la plupart des failles « au-dessus » sont plus douces que ce maximum. */
  riftAboveShare: 0.25,
  // 30 → 18 (v0.667) : l'anneau de bâtiments occupait cette couronne, son départ pour
  // l'écran « Ma base » y a laissé un trou et la ville avait l'air isolée.
  distMin: 18, // distance mini ville↔POI (coord ; la ville est au centre)
  // ⚠️ Le maxi est BORNÉ PAR LA CÔTE, pas choisi librement : à 88 il valait le rayon
  // NOMINAL du littoral, qui pince par endroits — les POI d'un renfoncement se
  // retrouvaient donc dessinés en pleine mer. Cf. `landRadius()`, qui donne le rayon
  // garanti de terre ferme, et le test qui vérifie que distMax reste dessous.
  distMax: 64, // distance maxi (rayon → POI tout autour, 360°)
  spawnMinMs: 3600_000, // intervalle de spawn : 1 h..2 h (jitter)
  spawnJitterMs: 3600_000,
  lifespanMs: {
    mine: 20 * 3600_000,
    camp: 10 * 3600_000,
    lair: 26 * 3600_000,
    arena: 48 * 3600_000, // l'arène reste l'événement long (fait pour la nuit)
    well: 14 * 3600_000,
    shrine: 16 * 3600_000,
    archive: 14 * 3600_000,
    wreck: 18 * 3600_000,
    // ⚠️ LA FAILLE VIT EXACTEMENT SA MATURATION : à 7 jours elle déborde et s'effondre.
    // Son « expiration » n'est donc pas un oubli de la carte mais l'événement lui-même —
    // c'est `rift.ts` qui la remplace alors par sa mine, avant tout filtrage.
    rift: 7 * 24 * 3600_000,
    mana_mine: 36 * 3600_000,
    // ⚔️ LA FENÊTRE D'INTERCEPTION. Un jour plein : c'est ce qu'il faut pour qu'un joueur
    // qui ouvre l'app une fois par jour ait sa chance, et un aller vers elle coûte déjà
    // 1 h 30 à 7 h. Quand elle expire, l'armée a rejoint la sienne — le marquage reste et
    // le prochain siège est renforcé.
    warband: 24 * 3600_000,
  },
  travelOneWayMinMin: 8, // trajet aller (min) : 8 min (proche) → 150 min (loin) × niveau
  travelOneWayMaxMin: 150,
  // Coût = base × niveau^1.6 → VRAI puits d'or (2026‑08‑12). Repère : un donjon
  // rapporte ~1600 or à reco10, ~4920 à reco20 ; un repaire coûte ~6k (niv10) → ~20k
  // (niv20) = plusieurs runs de donjon pour une pièce de set (l'or s'écoule).
  // ARÈNE (ticket 2d616665) : événement RARE fait pour la nuit → coût d'or ÉLEVÉ
  // (le plus cher), placée LOIN (trajet long) et récompense grasse (∝ vagues).
  // Les POI de ressources coûtent peu d'or : leur intérêt est ce qu'ils RAPPORTENT en
  // devises vivantes, pas un pari sur du butin.
  goldCostBase: {
    mine: 22,
    camp: 65,
    lair: 155,
    arena: 240,
    well: 30,
    shrine: 48,
    archive: 34,
    wreck: 26,
    // ⚠️ « ENTRER EST GRATUIT » portait sur le MANA et l'ÉNERGIE (décision de
    // l'utilisateur : ne jamais être à sec le jour où il faut défendre). L'or, lui, est le
    // péage UNIVERSEL de la carte et l'un des deux seuls puits d'or du jeu : en exempter
    // les failles créerait une activité gratuite qui paie. Aligné sur un camp.
    rift: 65,
    mana_mine: 30,
    // ⚔️ Aligné sur un camp : c'est le même geste (on y envoie un groupe se battre). Le
    // péage d'or reste universel — mais l'interception ne PAIE presque rien, elle ÉVITE
    // une perte, donc on ne va pas au-delà.
    warband: 65,
  },
  goldCostExp: 1.6,
  failRefund: 0.4, // échec : fraction de l'or remboursée (< coût → jamais un profit ; adouci 0,3→0,4 pour un pari raté moins punitif, ticket 86331df3)
  // ÉNERGIE des mines : BORNÉE (ticket a0d16472). Le facteur temps `tf` n'est pas
  // plafonné (un trajet long × haut niveau donnait ~1300 ⚡ pour une seule expé, ce qui
  // contredit « l'énergie est un complément, jamais un substitut au sport »). On limite
  // le tf pris en compte ET on cape la valeur finale à ~1 run.
  mineEnergyTfCap: 2.5, // l'énergie ne profite pas des longs trajets comme le loot
  mineEnergyMax: 60, // plafond dur par expédition (≈ 1 run)
  arenaMaxItems: 8, // garde-fou d'inventaire : une run très longue ne noie pas le sac
} as const;

// Arène : survie par vagues, SANS fin fixe. La difficulté croît de façon
// EXPONENTIELLE (×/vague) → les dégâts de l'assaillant finissent TOUJOURS par
// dépasser les PV+soin du héros, quel que soit son build (le multi-frappe et le vol
// de vie, bornés par des stats fixes, ne peuvent pas suivre une croissance
// géométrique) → la run se termine forcément par la mort. `maxWaves` n'est plus qu'un
// GARDE-FOU anti-boucle (jamais atteint en pratique). Ramp calibré par simulation
// (2026‑08‑15) : un build de référence tient ~5-9 vagues nu, ~15-30 bien équipé.
export const ARENA = {
  maxWaves: 500, // garde-fou anti-boucle infinie (la mort arrive bien avant)
  healPct: 0.16, // régén entre deux vagues (l'Endurance compte)
  pvBase: 0.42, // vague 0 = 42 % d'un camp de même niveau (démarrage doux)
  pvGrow: 1.15, // ×1,15 de PV par vague (croissance géométrique)
  dmgBase: 0.5,
  dmgGrow: 1.14, // ×1,14 de dégâts par vague → attrition qui accélère → fin garantie
} as const;

/** Fenêtre de niveaux de spawn : **[niveau, niveau+10]** (v0.658).
 *
 *  L'ancienne fenêtre `[niveau−5, niveau+3]` remplissait la carte de POI qu'un joueur
 *  équipé écrase sans y penser. Mesuré : le taux de victoire est de **100 % à TOUS les
 *  écarts, jusqu'à +10** — le combat de POI n'est pas un risque, donc rien ne justifiait
 *  de brider vers le bas. Monter le plancher et le plafond augmente le RENDEMENT (or,
 *  poussière, ressources suivent `poi.level`) sans rendre quoi que ce soit inatteignable.
 *  ⚠️ Ça n'améliore PAS la rareté du butin : elle reste centrée sur `min(contenu, joueur)`
 *  — c'est l'anti-runaway, et il est intentionnel. */
export function spawnWindow(playerLevel: number): { min: number; max: number } {
  const base = Math.max(1, playerLevel);
  return { min: base, max: base + 10 };
}

/** Coût en OR pour envoyer une expédition = base × niveau^1.6 (vrai puits d'or). */
export function goldCost(type: PoiType, level: number): number {
  return Math.round(EXPE.goldCostBase[type] * Math.pow(Math.max(1, level), EXPE.goldCostExp));
}

/** ⚠️ FACTEUR DE VOYAGE — **SUPER-LINÉAIRE**, et c'est tout l'objet de cette fonction.
 *  Tant que la récompense montait proportionnellement au trajet, la distance n'était
 *  qu'une taxe de temps : deux POI proches rapportaient autant qu'un lointain, dans le
 *  même délai, et rien ne justifiait jamais d'aller loin. Ici le rendement par heure
 *  CROÎT avec la durée.
 *  **Calé sur un voyage de référence** (`TRAVEL_REF_H`) pour ne PAS inflater l'économie :
 *  à cette durée la valeur est exactement l'ancienne (0,5 + h). En deçà on gagne un peu
 *  moins, au-delà nettement plus — mesuré, un aller-retour de 6 h rend ~39 % de plus
 *  qu'avant, un de 1,5 h ~20 % de moins. Le total moyen ne bouge donc quasiment pas :
 *  c'est un ARBITRAGE qu'on crée, pas un cadeau.
 *  Le plafond existe toujours (un trajet interminable ne doit pas tout multiplier), mais
 *  il est repoussé — à 6 h il écrasait justement le haut de la courbe qu'on veut valoriser. */
const TRAVEL_EXP = 1.4;
export const TRAVEL_REF_H = 3;
export const TRAVEL_CAP_H = 9;
export function travelFactor(roundTripH: number): number {
  const h = Math.min(Math.max(0, roundTripH), TRAVEL_CAP_H);
  const ref = 0.5 + TRAVEL_REF_H;
  return ref * Math.pow((0.5 + h) / ref, TRAVEL_EXP);
}

/** Le niveau sur lequel se calcule le trajet d'un POI — ⚠️ SOURCE UNIQUE : tout calcul de
 *  trajet (héros, convoi, groupe, cargaison, XP) passe par elle, sinon une moitié de l'écran
 *  annoncerait une durée que l'autre ne pratique pas. */
export function poiTravelLevel(p: Pick<Poi, 'level' | 'travelLevel'>): number {
  return p.travelLevel ?? p.level;
}

/** Trajet ALLER (minutes) selon distance + niveau. Round-trip = 2×. */
export function travelOneWayMin(level: number, distNorm: number): number {
  const base =
    EXPE.travelOneWayMinMin +
    (EXPE.travelOneWayMaxMin - EXPE.travelOneWayMinMin) * clamp01(distNorm);
  return Math.round(base * (1 + Math.max(0, level) * 0.02));
}

/** Adversaire d'un POI (Combatant) pour la résolution auto — scalé au niveau.
 *  Calibrage provisoire (affiné par simulation en phase 6). */
export function poiCombatant(level: number, type: PoiType): Combatant {
  const t = type === 'lair' ? 1.35 : 1; // le repaire est plus coriace
  const L = Math.max(1, level);
  // Échelle niveau² : la puissance du joueur croît ~niveau² (stats = XP/15, XP
  // quadratique). Un adversaire LINÉAIRE devenait trivial dès le niveau 10 → on
  // scale en L² (calibré sur le gradient sain du niveau 5, cf. simulation 2026‑08‑12).
  const name =
    type === 'lair' ? 'Gardien du repaire' : type === 'camp' ? 'Chef de camp' : 'Éboulement';
  return {
    name,
    // PV ~L³ (le multi-frappe fait croître l'offense du joueur ~L⁴ → un L² devenait
    // trivial en fin de jeu). Dégâts ~L² (check de survie constant relatif aux PV joueur).
    // RECALIBRÉ (2026‑08‑15, ticket 86331df3) : coefs 2,9/5,5 → 2,0/3,9 — un héros
    // de niveau approprié gagnait ~28-53 % des camps et ~2-26 % des repaires (net
    // négatif, pas rentable). Désormais camp ~90 % (option fiable), repaire ~45-88 %
    // (le pari, meilleur si sur-niveau) ; le winPct affiché prévient avant l'envoi.
    pv: Math.round((2.0 * L * L * L + 40) * t),
    damage: Math.round((3.9 * L * L + 12) * t),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
    strikes: 1,
  };
}

/** Adversaire de la vague `wave` d'une arène de niveau `level` — dérivé d'un camp,
 *  démarrage doux puis rampe de PV/dégâts par vague (attrition croissante). */
function arenaWaveCombatant(level: number, wave: number): Combatant {
  const base = poiCombatant(level, 'camp');
  return {
    ...base,
    name: `Assaillant · vague ${wave + 1}`,
    pv: Math.max(1, Math.round(base.pv * ARENA.pvBase * Math.pow(ARENA.pvGrow, wave))),
    damage: Math.max(1, Math.round(base.damage * ARENA.dmgBase * Math.pow(ARENA.dmgGrow, wave))),
  };
}

/** Simule une arène : vagues consécutives (difficulté exponentielle), PV reportés
 *  (+ petite régén), jusqu'à la MORT (le cap n'est qu'un garde-fou anti-boucle).
 *  Renvoie le nombre de vagues TENUES (vaincues). Seedé/pur. */
/** Une vague livrée, avec de quoi la REJOUER (log seedé). */
interface ArenaFight {
  wave: number; // 1-based
  monster: string;
  maxPv: number;
  win: boolean;
  rounds: number;
  startPv: number; // PV du héros au DÉBUT de la vague (attrition)
  log: CombatEvent[];
}
export interface ArenaRun {
  waves: number; // vagues TENUES (gagnées)
  fights: ArenaFight[]; // toutes les vagues livrées, la dernière étant perdue
  finalPv: number;
}

/** Enchaîne les vagues jusqu'à la mort, en CONSERVANT chaque combat (pour le rejeu).
 *  PV reportés d'une vague à l'autre + régén partielle : l'Endurance compte. La rampe
 *  géométrique garantit que la mort finit toujours par arriver. */
export function runArena(hero: Combatant, level: number, seed: number): ArenaRun {
  let pv = hero.pv;
  let waves = 0;
  const fights: ArenaFight[] = [];
  for (let w = 0; w < ARENA.maxWaves; w++) {
    const foe = arenaWaveCombatant(level, w);
    const startPv = pv;
    const r = simulateCombat(hero, foe, {
      seed: seed + w * 1009,
      goldOnWin: 0,
      startPlayerPv: pv,
    });
    pv = r.log.length ? r.log[r.log.length - 1]!.playerPv : pv;
    fights.push({
      wave: w + 1,
      monster: foe.name,
      maxPv: foe.pv,
      win: r.win,
      rounds: r.rounds,
      startPv,
      log: r.log,
    });
    if (!r.win) break;
    waves++;
    pv = Math.min(hero.pv, pv + Math.round(hero.pv * ARENA.healPct));
  }
  return { waves, fights, finalPv: Math.max(0, pv) };
}

/** Compte de vagues seul (POI d'expédition idle) — même simulation, pas de copie. */
export function simulateArena(hero: Combatant, level: number, seed: number): number {
  return runArena(hero, level, seed).waves;
}

// ── Arène JOUABLE (mode direct d'Aventure) : coût en énergie et récompenses ──
export const ARENA_PLAY = {
  energyBase: 12, // coût d'entrée à bas niveau
  energyPerLevel: 0.6,
  energyCap: 30, // plafonné comme les donjons : le jeu ne rationne pas l'effort sportif
  goldPerWave: 14, // or par vague tenue, mis à l'échelle du niveau
  dropEvery: 3, // un tirage de butin tous les N paliers de vagues
} as const;

/** Coût d'entrée dans l'arène (plafonné). */
export function arenaEnergyCost(level: number): number {
  return Math.min(
    ARENA_PLAY.energyCap,
    Math.round(ARENA_PLAY.energyBase + Math.max(0, level) * ARENA_PLAY.energyPerLevel),
  );
}
/** Récompenses d'une run : or ∝ vagues×niveau, et un tirage de butin tous les
 *  `dropEvery` paliers — la `luck` monte avec les vagues (aller loin paie). */
export function arenaRewards(
  waves: number,
  level: number,
): { gold: number; drops: number; luck: number } {
  const w = Math.max(0, waves);
  return {
    gold: Math.round(w * ARENA_PLAY.goldPerWave * (1 + Math.max(0, level) * 0.12)),
    drops: Math.floor(w / ARENA_PLAY.dropEvery),
    luck: Math.min(1, w * 0.05),
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// Placement espacé (reject-sampling) d'un POI TOUT AUTOUR de la ville (360°).
// `minFrac` (0..1) force une distance MINIMALE (l'arène spawn loin → trajet de nuit).
/** Place un POI autour de la ville.
 *
 *  `band` (0 = proche, 1 = intermédiaire, 2 = lointain) STRATIFIE le tirage : les spawns
 *  parcourent les trois tiers à tour de rôle au lieu de tirer une distance au hasard.
 *  Pourquoi : un tirage uniforme ne GARANTIT aucune répartition — avec 6 POI à l'écran on
 *  pouvait n'avoir que du lointain (mesuré : 7 % seulement à moins de 35 de la ville, un
 *  aller-retour médian de 4 h 42). Comme les bandes se succèdent, la moyenne reste celle
 *  d'un tirage uniforme : la carte se répartit visiblement, **sans que les temps de trajet
 *  ni l'économie ne bougent**. `minFrac` (l'arène, qu'on veut loin) prime sur la bande. */
function placePoi(
  rng: () => number,
  minFrac = 0,
  band?: number,
): { x: number; y: number; distNorm: number } {
  const { town, distMin, distMax, mapSize } = EXPE;
  const pad = 10;
  const lo = distMin + clamp01(minFrac) * (distMax - distMin);
  // Tiers visé (ignoré si un plancher explicite a déjà resserré la fenêtre).
  const nb = EXPE.distBands;
  const b = band === undefined || minFrac > 0 ? null : ((band % nb) + nb) % nb;
  for (let tries = 0; tries < 40; tries++) {
    const ang = rng() * Math.PI * 2; // angle libre → POI dans tous les sens
    const span = distMax - lo;
    const dd = b === null ? lo + rng() * span : lo + ((b + rng()) / nb) * span;
    const x = Math.round(town.x + Math.cos(ang) * dd);
    const y = Math.round(town.y + Math.sin(ang) * dd);
    if (x < pad || x > mapSize - pad || y < pad || y > mapSize - pad) continue;
    return { x, y, distNorm: clamp01((dd - distMin) / (distMax - distMin)) };
  }
  return { x: town.x + lo, y: town.y, distNorm: clamp01((lo - distMin) / (distMax - distMin)) };
}

/** Crée une carte neuve avec `seedPois` POI d'entrée (à la 1re visite). Par défaut,
 *  on démarre AU PLANCHER (`poiFloor`) → la carte n'est jamais quasi-vide au début. */
export function createMap(
  seed: number,
  now: number,
  playerLevel: number,
  seedPois = EXPE.poiFloor,
): ExpeditionMap {
  const map: ExpeditionMap = {
    seed: seed >>> 0 || 1,
    spawnCount: 0,
    pois: [],
    nextSpawnAt: now,
    riftCount: 0,
    nextRiftAt: now,
  };
  for (let i = 0; i < seedPois; i++) spawnOne(map, now, playerLevel);
  // 🕳️ On sème aussi le PLANCHER de failles : sans elles, une carte neuve n'aurait ni accès
  // au mana ni siège à venir jusqu'au premier `advanceWorld`.
  for (let i = 0; i < EXPE.riftFloor; i++) spawnRift(map, now, playerLevel);
  map.nextSpawnAt = now + EXPE.spawnMinMs;
  map.nextRiftAt = now + EXPE.riftSpawnMinMs;
  return map;
}

// Fait apparaître 1 POI (déterministe via seed + spawnCount), placé espacé.
function spawnOne(map: ExpeditionMap, now: number, playerLevel: number): void {
  const rng = mulberry32((map.seed + map.spawnCount * 2654435761) >>> 0);
  map.spawnCount++;
  // Pondération : la MOITIÉ des spawns sont des POI de RESSOURCES (v0.658). C'est le
  // cœur du correctif : à haut niveau la carte ne peut plus produire de butin utile,
  // mais elle peut toujours produire des devises qui, elles, ne se périment pas.
  let type = pick(rng, [
    'mine',
    'mine',
    'camp',
    'camp',
    'lair',
    'arena',
    'well',
    'well',
    'shrine',
    'shrine',
    'archive',
    'archive',
    // ⚓ Plus d'ÉPAVE (v0.999) : sans la ferraille, elle doublait la mine en moins bien.
  ] as const);
  // UNE SEULE arène à la fois sur la carte (ticket 2d616665) → sinon on rabat sur camp.
  if (type === 'arena' && map.pois.some((p) => p.type === 'arena')) type = 'camp';
  placePoiOfType(map, now, playerLevel, type, rng, `poi_${map.seed}_${map.spawnCount}`);
}

/**
 * 🕳️ Fait apparaître une FAILLE — même placement, compteur et flux aléatoire SÉPARÉS.
 *
 * ⚠️ POURQUOI UN FLUX À PART : partagé avec `spawnCount`, chaque faille décalerait le
 * tirage de tous les spawns suivants — la carte de chaque joueur changerait de composition
 * sans qu'on ait touché à une pondération. Et l'espace d'ids est distinct (`rift_…`), donc
 * aucune collision possible avec un POI ordinaire.
 */
/**
 * 🕳️ Niveau d'une faille — tiré par **RANG**, entre Bronze et le rang du joueur.
 *
 * ⚠️ **C'EST LA SEULE EXCEPTION AU DÉGRADÉ DE DISTANCE**, et elle est délibérée : six
 * brèches ouvertes en même temps doivent offrir des rangs VARIÉS, sinon
 * « laquelle je referme » n'est pas une question. Une fenêtre [niveau, +10] indexée sur la
 * distance ne couvre qu'un rang et demi : elle ne pouvait pas produire cette variété.
 *
 * ⚠️ **UN CRAN « AU-DESSUS » DEPUIS LA v0.980** (décision de l'utilisateur, qui renverse
 * celle de la v0.929). Elle ne tenait que parce que le HÉROS aurait tout écrasé : mesuré, seul
 * et équipé, il refermait à 100 % des failles de 40 à 60 niveaux au-dessus de lui. Depuis
 * qu'il ne vaut plus que deux champions dans un groupe (`heroPartyCombatant`), une faille
 * au-dessus de soi redevient un vrai pari. Le pool de rangs compte donc un emplacement de
 * plus, « au-dessus » (`top + 1`), tiré comme les autres.
 *
 * ⚠️ **L'ÉCART EST PROPORTIONNEL AU NIVEAU, pas d'un rang** (`EXPE.riftAboveShare`) : un
 * rang couvre 10 niveaux, soit +83 % au niveau 12 et +14 % au niveau 70 — mesuré avec le
 * groupe complet (héros borné + 3 champions), la même faille « +1 rang » était
 * infranchissable au niveau 12 (0 %) et une formalité au niveau 70 (98 %). Le niveau est
 * tiré dans [joueur + 1, joueur × (1 + part)] ; son RANG affiché est ce qu'il est, souvent
 * le même que le joueur en début de partie — la fiche dit « +N niveaux » à part.
 *
 * ⚠️ Pour les rangs ordinaires, le niveau reste borné par celui du joueur, sinon la tranche
 * du rang courant déborderait au-dessus de lui sans le dire.
 *
 * Le rang est tiré UNIFORMÉMENT : on veut réellement voir du Bronze à côté de son propre
 * rang, pas une cloche qui ramènerait tout au milieu.
 *
 * ⚠️ **ET ON ÉVITE LES RANGS DÉJÀ OUVERTS (v0.965 ; signalé : « je n'ai que des Or noir
 * comme mon rang »).** Le tirage était bon — mesuré, 39 % Bronze / 26 % Argent / 22 % Or
 * / 13 % Or noir pour un joueur Or noir — mais il est **SANS MÉMOIRE**, et un joueur qui
 * REFERME ses failles (c'est-à-dire qui joue) n'en garde que 2 ou 3 ouvertes : avec deux
 * brèches et quatre rangs possibles, **une fois sur quatre elles portent le même**. La
 * variété promise ne pouvait donc pas se voir. On tire parmi les rangs LIBRES, repli sur
 * tous quand ils sont pris — le patron `leurre` de la roulette d'invocation (v0.962).
 *
 * ⚠️ **LE LEVIER ÉVIDENT — DOUBLER LA CADENCE DE SPAWN — A ÉTÉ ESSAYÉ, MESURÉ, PUIS
 * REJETÉ.** À 4-8 h la carte gardait bien 5,5 brèches et 3,2 rangs même en refermant
 * 2/jour (contre 3,1 et 2,4)… mais **trois tests tombaient** : « tenir le rythme garde
 * les routes propres » (v0.934) et « attendre paie plus que fermer vite » (v0.936) sont
 * calibrés SUR cette cadence — c'est elle, le rythme auquel le joueur doit tenir. Ce
 * garde-ci ne touche ni la cadence, ni le nombre, ni les niveaux possibles : aucun de
 * ces invariants n'est en jeu.
 *
 * ⚠️ `pris` est REQUIS : un paramètre qu'on peut oublier finit par l'être (v0.751,
 * v0.805), et l'oublier ici ramènerait exactement le défaut signalé. ⚠️ Ce sont des
 * NIVEAUX (v0.980), plus des rangs : « au-dessus » n'est pas un rang, c'est un écart au
 * joueur — seul `riftSlotOf` sait les ranger.
 */
export function riftLevelFor(
  rng: () => number,
  playerLevel: number,
  /** NIVEAUX des failles DÉJÀ ouvertes. `[]` = aucune contrainte (tirage uniforme). */
  pris: readonly number[],
): number {
  const top = characterRank(playerLevel).rankIndex;
  const above = top + 1;
  const taken = new Set(pris.map((lv) => riftSlotOf(lv, playerLevel)));
  const libres: number[] = [];
  for (let i = 0; i <= above; i++) if (!taken.has(i)) libres.push(i);
  const pool = libres.length ? libres : Array.from({ length: above + 1 }, (_, i) => i);
  const r = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  if (r === above) return playerLevel + 1 + Math.floor(rng() * riftAboveSpan(playerLevel));
  const lo = rankStartLevel(r);
  // Fin de la tranche du rang `r`, bornée par le niveau du joueur. ⚠️ Dérivée de
  // `rankStartLevel`, jamais écrite : l'échelle de prestige est la seule autorité.
  const hi = Math.min(
    playerLevel,
    r + 1 < CHARACTER_RANKS.length ? rankStartLevel(r + 1) - 1 : playerLevel,
  );
  return Math.max(1, lo + Math.floor(rng() * Math.max(1, hi - lo + 1)));
}

/** Nombre de niveaux « au-dessus » possibles : [joueur + 1, joueur + span]. */
export function riftAboveSpan(playerLevel: number): number {
  return Math.max(1, Math.round(Math.max(1, playerLevel) * EXPE.riftAboveShare));
}

/** L'emplacement d'une faille dans le tirage : son rang, ou `top + 1` si elle est au-dessus
 *  du joueur — c'est ce qui permet d'éviter d'en reposer deux « au-dessus » d'affilée. */
export function riftSlotOf(level: number, playerLevel: number): number {
  return level > playerLevel
    ? characterRank(playerLevel).rankIndex + 1
    : characterRank(level).rankIndex;
}

function spawnRift(map: ExpeditionMap, now: number, playerLevel: number): void {
  const n = map.riftCount ?? 0;
  const rng = mulberry32(((map.seed ^ 0x52ff3a1d) + n * 2654435761) >>> 0 || 1);
  map.riftCount = n + 1;
  placePoiOfType(
    map,
    now,
    playerLevel,
    'rift',
    rng,
    `rift_${map.seed}_${n + 1}`,
    // ⚠️ Les rangs DÉJÀ sur la carte, pour ne pas en reposer un identique tant qu'il
    // reste du choix : c'est ce qui rend la variété VISIBLE quand on n'a que deux ou
    // trois brèches ouvertes.
    riftLevelFor(
      rng,
      playerLevel,
      map.pois.filter(isRiftPoi).map((p) => p.level),
    ),
  );
}

/** Place un POI de type IMPOSÉ : espacement, niveau tiré au hasard (trajet dérivé de la distance), durée de vie.
 *  ⚠️ EXTRAIT de `spawnOne` sans rien réordonner — le tirage du TYPE reste en tête chez
 *  l'appelant, donc le flux aléatoire d'un spawn ordinaire est inchangé au bit près. */
function placePoiOfType(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  type: PoiType,
  rng: () => number,
  id: string,
  /** 🕳️ Niveau IMPOSÉ (failles seulement) : tiré par RANG, il ne vient pas de la distance. */
  forcedLevel?: number,
): void {
  const win = spawnWindow(playerLevel);
  // L'arène spawn LOIN (trajet long, fait pour la nuit) ; les autres, n'importe où.
  const minFrac = type === 'arena' ? 0.8 : 0;
  // La bande tourne avec le compteur de spawns → proche, moyen, lointain à tour de rôle.
  const band = map.spawnCount;
  // Espacement. ⚠️ Deux corrections d'un même défaut : la boucle abandonnait au bout de
  // 6 essais ET reprenait le DERNIER tirage — donc un tirage qui venait justement d'être
  // rejeté. Sur une carte dense, elle posait ainsi des POI les uns sur les autres
  // (mesuré : 17 paires chevauchantes sur quelques jours de simulation). On tente plus
  // longtemps, et surtout on GARDE LE MEILLEUR candidat : à défaut d'un emplacement
  // parfait, on prend le moins mauvais au lieu du dernier venu.
  let pos = placePoi(rng, minFrac, band);
  const clearance = (p: { x: number; y: number }) =>
    map.pois.length ? Math.min(...map.pois.map((q) => dist(q.x, q.y, p.x, p.y))) : Infinity;
  let best = clearance(pos);
  for (let k = 0; k < 24 && best < EXPE.minDistPoi; k++) {
    const cand = placePoi(rng, minFrac, band);
    const gap = clearance(cand);
    if (gap > best) {
      best = gap;
      pos = cand;
    }
  }
  // 🎲 LE NIVEAU EST TIRÉ AU HASARD dans la fenêtre, SANS RAPPORT avec la distance (v0.1013,
  // demandé par l'utilisateur). Il découlait de la distance depuis la v0.683 (« près = faible,
  // loin = fort ») : choisir un lieu revenait à lire une seule échelle. Désormais un repaire
  // +10 peut se poser à deux pas de la ville, et un puits facile au bout de la carte — la
  // difficulté se LIT sur la pastille de niveau, plus sur l'éloignement.
  // ⚠️ UNIFORME, et c'est ce qui préserve l'économie : les bandes de distance étant parcourues
  // à tour de rôle, l'ancien niveau couvrait déjà la fenêtre uniformément. La MOYENNE des
  // niveaux (donc de l'or, des pierres, du coût) ne bouge pas, seule sa corrélation disparaît.
  // ⚠️ Le tirage REMPLACE celui de la gigue (un seul `rng()`, comme avant) : le flux aléatoire
  // des spawns suivants n'est pas décalé.
  const span = win.max - win.min;
  const roll = rng();
  const level = forcedLevel ?? win.min + Math.min(span, Math.floor(roll * (span + 1)));
  // Le TRAJET, lui, reste lié à la distance : il se calcule sur le niveau que l'éloignement
  // justifie (`travelLevel`, v0.1012), sinon un lieu fort près de la ville mettrait autant
  // de temps qu'un lieu lointain — le trajet ne se lirait plus sur la carte.
  const travelLevel = win.min + Math.round(pos.distNorm * span);
  // Route dangereuse : tirée AU SPAWN pour être annoncée avant l'envoi (télégraphiée).
  const perilous = rng() < EXPE.perilousChance;
  const poi: Poi = {
    id,
    type,
    ...(perilous ? { perilous: true } : {}),
    // ⚠️ `setId` ne rapporte plus rien depuis la v0.980 (un repaire paie le butin d'un groupe,
    // plus une pièce de set du héros) — mais le TIRAGE reste : le retirer décalerait le flux
    // aléatoire de tous les spawns suivants, donc la carte de chaque joueur.
    ...(type === 'lair' && ITEM_SETS.length ? { setId: pick(rng, ITEM_SETS).id } : {}),
    level,
    travelLevel,
    x: pos.x,
    y: pos.y,
    distNorm: pos.distNorm,
    spawnedAt: now,
    expiresAt: now + EXPE.lifespanMs[type],
  };
  map.pois.push(poi);
}

/**
 * 🕳️ Les failles PRÉSENTES dont l'heure de débordement est passée.
 *
 * ⚠️ **UNE SEULE DÉFINITION DU PRÉDICAT**, et c'est tout l'intérêt de l'exporter :
 * `advanceWorld` s'en sert pour les remplacer par leur mine, l'appelant pour en marquer
 * la base. Deux copies de « a-t-elle débordé ? » finiraient par désigner deux ensembles
 * différents — et on aurait alors des mines sans armée, ou des armées sans mine.
 *
 * ⚠️ **À LIRE AVANT `advanceWorld`** : lui les retire de la carte. C'est le seul instant
 * où elles sont encore là.
 */

/**
 * Maturité 0..1 d'une faille — **LA SEULE définition de la courbe du temps d'une faille**.
 *
 * ⚠️ Elle vit ICI et non dans `rift.ts` parce que ce module-là importe celui-ci (jamais
 * l'inverse), et que la population de `rift.ts` en dépend. `rift.riftMaturity` s'y adosse :
 * deux implémentations de « quel âge a-t-elle ? » finiraient par répondre différemment.
 */
export function riftMaturityAt(spawnedAt: number, now: number): number {
  return Math.min(1, Math.max(0, (now - spawnedAt) / EXPE.lifespanMs.rift));
}

/**
 * 🐫 Les lieux HARCELÉS par une embuscade en cours — les ids, jamais les objets.
 *
 * ⚠️ **RÈGLE v0.1009** : seules les **embuscades** (monstres sortis d'une faille qui a
 * DÉBORDÉ, pendant `EXPE.ambushMs`) harcèlent. Une faille qui mûrit ne touche plus rien —
 * c'est ce qui rend « refermer avant 7 jours » décisif.
 *
 * ⚠️ **DÉRIVÉ, JAMAIS FIGÉ.** L'ensemble change dès qu'une embuscade commence ou expire :
 * un drapeau posé une fois pour toutes resterait allumé sur une route redevenue sûre.
 *
 * ⚠️ **NI UNE FAILLE NI UNE BANDE EN MARCHE NE SONT « HARCELÉES »** : on va s'y battre de
 * toute façon, « route dangereuse » n'y voudrait rien dire (même règle que les camps).
 *
 * ⚠️ **LA DISTANCE EST CELLE AU LIEU, pas à la route** : le joueur doit pouvoir LIRE sur
 * la carte pourquoi sa route est dangereuse — l'auréole de l'embuscade autour du lieu.
 */
export function irradiatedPoiIds(
  pois: readonly Poi[],
  ambushes: readonly RiftAmbush[] | undefined,
  now: number,
): Set<string> {
  const out = new Set<string>();
  const live = (ambushes ?? []).filter((a) => a.until > now);
  if (!live.length) return out;
  for (const p of pois) {
    if (isRiftPoi(p) || p.type === 'warband') continue;
    if (live.some((a) => Math.hypot(p.x - a.x, p.y - a.y) <= EXPE.irradMax)) out.add(p.id);
  }
  return out;
}

export function riftOverflows(map: ExpeditionMap, now: number): Poi[] {
  return map.pois.filter((p) => isRiftPoi(p) && now >= p.spawnedAt + EXPE.lifespanMs.rift);
}

/** Fait avancer le monde jusqu'à `now` : expire les POI périmés (sauf la cible d'une
 *  expédition en cours) et fait apparaître au plus 1 POI si l'heure est venue. Pur. */
export function advanceWorld(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  protectedPoiId?: string,
): ExpeditionMap {
  // 🕳️ DÉBORDEMENT D'ABORD, avant tout filtrage : une faille arrivée à maturité
  // s'effondre et laisse une MINE DE MANA RÉSIDUEL. ⚠️ Si on filtrait d'abord, la faille
  // serait simplement « expirée » (sa durée de vie EST sa maturation) et la mine n'aurait
  // jamais existé. L'id de la mine est DÉRIVÉ de celui de la faille : rejouer ce passage
  // ne peut pas la dupliquer, et une absence longue laisse des mines DATÉES de leur
  // débordement — donc déjà périmées si c'était il y a plus de 36 h, et le filtre juste
  // en dessous s'en charge. On ne punit pas l'absence, on ne la récompense pas non plus.
  // 🕳️ ET SON ARMÉE MARCHE SUR LA BASE : c'est `riftOverflows` (juste au-dessus) qui les
  // désigne, et l'appelant qui en marque la base AVANT de persister cette carte — sinon
  // la faille disparaîtrait d'ici sans que personne n'ait vu son armée sortir.
  const over = riftOverflows(map, now);
  const gone = new Set(over.map((p) => p.id));
  const collapsed: Poi[] = over.map((p) => {
    const at = p.spawnedAt + EXPE.lifespanMs.rift;
    return {
      id: `${p.id}_mine`,
      type: 'mana_mine',
      level: p.level,
      ...(p.travelLevel !== undefined ? { travelLevel: p.travelLevel } : {}),
      x: p.x,
      y: p.y,
      distNorm: p.distNorm,
      spawnedAt: at,
      expiresAt: at + EXPE.lifespanMs.mana_mine,
    };
  });
  // ⚔️ ET SON ARMÉE SE MET EN MARCHE. Elle naît à l'emplacement de la faille et fond vers
  // la ville ; on a `lifespanMs.warband` pour l'intercepter. ⚠️ Elle porte la MÊME faction
  // que sa faille (la carte annonce donc le butin du siège avant même la Tour de guet) et
  // garde son point de départ dans `from` : sans lui, la marche repartirait de la position
  // courante à chaque tick et n'avancerait jamais.
  const warbands: Poi[] = over.map((p) => {
    const at = p.spawnedAt + EXPE.lifespanMs.rift;
    return {
      id: `${p.id}_war`,
      type: 'warband',
      level: p.level,
      ...(p.travelLevel !== undefined ? { travelLevel: p.travelLevel } : {}),
      faction: riftFactionOf(p.id),
      from: { x: p.x, y: p.y },
      x: p.x,
      y: p.y,
      distNorm: p.distNorm,
      spawnedAt: at,
      expiresAt: at + EXPE.lifespanMs.warband,
    };
  });
  // ⚠️ On retire EXACTEMENT celles qu'on vient de remplacer (par leur id), jamais en
  // rejouant le prédicat : deux lectures peuvent diverger d'une faille et laisser un
  // doublon — la faille ET sa mine — sur la carte.
  const withMines =
    collapsed.length || warbands.length
      ? [...map.pois.filter((p) => !gone.has(p.id)), ...collapsed, ...warbands]
      : map.pois;
  // 🐫 ET UNE PARTIE RESTE EMBUSQUÉE autour de la faille pendant `ambushMs` (v0.1009). Datée
  // du DÉBORDEMENT, pas de l'instant du calcul : une absence longue ne la prolonge pas, et
  // une embuscade déjà finie pendant l'absence est aussitôt retirée ci-dessous. Rejouer ce
  // passage ne peut pas la dupliquer : la faille est retirée de la carte DANS CE MÊME
  // passage, elle ne déborde donc jamais deux fois (un dédoublonnage écrit ici était
  // inatteignable — une mutation l'a montré, il est retiré).
  const ambushes = [
    ...(map.ambushes ?? []),
    ...over.map((p) => ({
      id: `${p.id}_ambush`,
      x: p.x,
      y: p.y,
      until: p.spawnedAt + EXPE.lifespanMs.rift + EXPE.ambushMs,
    })),
  ].filter((a) => a.until > now);
  const next: ExpeditionMap = {
    seed: map.seed,
    spawnCount: map.spawnCount,
    nextSpawnAt: map.nextSpawnAt,
    riftCount: map.riftCount ?? 0,
    nextRiftAt: map.nextRiftAt ?? now,
    // ⚠️ Clé ABSENTE quand il n'y a rien : sinon chaque carte gagnerait un `ambushes: []`
    // et différerait de la précédente (l'appelant compare par `JSON.stringify` pour décider
    // s'il persiste).
    ...(ambushes.length ? { ambushes } : {}),
    // On écarte les POI expirés ET ceux qui ne tiennent plus dans la carte : une carte
    // sauvegardée avant que `distMax` ne soit borné par le littoral (v0.668) porte des
    // POI dessinés en pleine mer, et ils survivraient jusqu'à 48 h. On les périme donc
    // au chargement — même politique que les bâtiments dont le type a disparu du
    // registre. La cible d'une expédition EN COURS est toujours préservée : le héros y
    // est physiquement, on ne la fait pas disparaître sous ses pieds.
    // ⚓ Et les ÉPAVES, type retiré (v0.999) : une carte sauvegardée avant en porte encore.
    pois: withMines.filter(
      (p) => p.id === protectedPoiId || (p.type !== 'wreck' && p.expiresAt > now && withinLand(p)),
    ),
  };
  // ⚠️ LES QUOTAS SE COMPTENT SÉPARÉMENT (`isQuotaPoi`) : une faille ou une mine qui
  // entrerait dans les 20 volerait une place à une mine d'or, un camp ou une récolte — dont
  // l'économie est MESURÉE. Les failles S'AJOUTENT à la carte.
  const quota = () => next.pois.filter(isQuotaPoi).length;
  const rifts = () => next.pois.filter(isRiftPoi).length;
  // Rattrapage : après une longue absence, l'heure de spawn a pu être dépassée
  // PLUSIEURS fois → on fait apparaître autant de POI que d'intervalles écoulés
  // (jusqu'au cap), sinon la carte restait à 1 spawn/ouverture et se vidait.
  let guard = 0;
  while (now >= next.nextSpawnAt && quota() < EXPE.poiCap && guard++ < EXPE.poiCap) {
    spawnOne(next, now, playerLevel);
    const rng = mulberry32((next.seed + next.spawnCount * 40503) >>> 0);
    next.nextSpawnAt = next.nextSpawnAt + EXPE.spawnMinMs + Math.floor(rng() * EXPE.spawnJitterMs);
  }
  // PLANCHER : la carte ne descend jamais sous `poiFloor` activités → on complète
  // immédiatement (les activités de base sont toujours dispo ; la rareté/churn ne
  // joue qu'entre le plancher et le cap).
  while (quota() < EXPE.poiFloor) spawnOne(next, now, playerLevel);
  if (next.nextSpawnAt <= now) next.nextSpawnAt = now + EXPE.spawnMinMs;

  // 🕳️ FAILLES : même mécanique, quota et horloge PROPRES. ⚠️ Le plancher garantit qu'il y
  // a toujours de quoi aller refermer quelque chose — une carte sans faille, et le joueur
  // n'a plus d'accès au mana ni de siège à venir.
  let rGuard = 0;
  while (now >= (next.nextRiftAt ?? now) && rifts() < EXPE.riftCap && rGuard++ < EXPE.riftCap) {
    spawnRift(next, now, playerLevel);
    const rng = mulberry32(((next.seed ^ 0x1b873593) + (next.riftCount ?? 0) * 40503) >>> 0 || 1);
    next.nextRiftAt =
      (next.nextRiftAt ?? now) + EXPE.riftSpawnMinMs + Math.floor(rng() * EXPE.riftSpawnJitterMs);
  }
  while (rifts() < EXPE.riftFloor) spawnRift(next, now, playerLevel);
  if ((next.nextRiftAt ?? now) <= now) next.nextRiftAt = now + EXPE.riftSpawnMinMs;
  // 🐫 HARCÈLEMENT DES CONVOIS — dérivé EN DERNIER, une fois la carte stable (débordements
  // retirés, embuscades posées ou expirées, spawns et plancher posés). Seules les
  // EMBUSCADES comptent depuis la v0.1009 : une faille ouverte ne harcèle plus rien.
  // ⚠️ On n'écrit le drapeau QUE s'il change quelque chose : `advanceWorld` est comparé au
  // précédent par l'appelant (`JSON.stringify`) pour décider s'il persiste. Poser un
  // `riftPeril: false` sur chaque POI ferait différer l'objet à chaque tick et écrirait la
  // carte en base toutes les secondes.
  // ⚔️ LA MARCHE — recalculée à chaque tick, comme l'irradiation, et pour la même raison :
  // c'est un ÉTAT DÉRIVÉ du temps. Elle avance en ligne droite de `from` vers la ville sur
  // toute sa durée de vie ; `distNorm` suit, donc l'intercepter tard coûte un trajet plus
  // court — mais il reste moins de temps pour le faire.
  next.pois = next.pois.map((p) => {
    if (p.type !== 'warband' || !p.from) return p;
    const t = clamp01((now - p.spawnedAt) / Math.max(1, p.expiresAt - p.spawnedAt));
    const x = p.from.x + (EXPE.town.x - p.from.x) * t;
    const y = p.from.y + (EXPE.town.y - p.from.y) * t;
    if (x === p.x && y === p.y) return p;
    const d = Math.hypot(x - EXPE.town.x, y - EXPE.town.y);
    const distNorm = clamp01((d - EXPE.distMin) / (EXPE.distMax - EXPE.distMin));
    return { ...p, x, y, distNorm };
  });
  const irr = irradiatedPoiIds(next.pois, next.ambushes, now);
  next.pois = next.pois.map((p) => {
    const on = irr.has(p.id);
    if (on === !!p.riftPeril) return p;
    if (!on) {
      // ⚠️ On RETIRE la clé au lieu de la mettre à `false` : elle est sérialisée en JSONB,
      // et un `riftPeril: false` sur chaque POI gonflerait la carte sans rien dire de plus.
      const rest = { ...p };
      delete rest.riftPeril;
      return rest;
    }
    return { ...p, riftPeril: true };
  });
  return next;
}

/** Position interpolée du héros + compteurs, selon la phase (aller/retour). */
/** Ce qu'il faut pour situer un voyageur sur la carte : une destination et trois
 *  horodatages. ⚠️ Volontairement STRUCTUREL, et non `ActiveExpedition` : un convoi
 *  (`Caravan`) fait exactement le même aller-retour, et deux copies de cette
 *  interpolation divergeraient à la première retouche. */
export interface Voyage {
  poi: Poi;
  sentAt: number;
  midAt: number;
  returnAt: number;
}

/** Avancement d’un voyage sur SA DURÉE TOTALE (aller + retour), et l’endroit où tombe
 *  l’objectif. ⚠️ Distinct de `travelPosition().frac`, qui n’avance que DANS la phase
 *  courante et repart donc à zéro au demi-tour : une barre pilotée par lui reculerait
 *  en plein milieu du trajet, ce qui se lit comme un bug. */
export function voyageProgress(v: Voyage, now: number): { overall: number; mid: number } {
  const total = Math.max(1, v.returnAt - v.sentAt);
  return {
    overall: clamp01((now - v.sentAt) / total),
    mid: clamp01((v.midAt - v.sentAt) / total),
  };
}

/** Position d'un voyageur (héros OU convoi) à l'instant `now`. */
export function travelPosition(
  exp: Voyage,
  now: number,
): {
  x: number;
  y: number;
  phase: 'outbound' | 'return' | 'done';
  frac: number; // avancement de la phase courante (0..1)
  remainToObjectiveMs: number;
  remainTotalMs: number;
} {
  const { town } = EXPE;
  const p = exp.poi;
  const remainTotalMs = Math.max(0, exp.returnAt - now);
  if (now < exp.midAt) {
    const frac = clamp01((now - exp.sentAt) / Math.max(1, exp.midAt - exp.sentAt));
    return {
      x: town.x + (p.x - town.x) * frac,
      y: town.y + (p.y - town.y) * frac,
      phase: 'outbound',
      frac,
      remainToObjectiveMs: Math.max(0, exp.midAt - now),
      remainTotalMs,
    };
  }
  if (now < exp.returnAt) {
    const frac = clamp01((now - exp.midAt) / Math.max(1, exp.returnAt - exp.midAt));
    return {
      x: p.x + (town.x - p.x) * frac,
      y: p.y + (town.y - p.y) * frac,
      phase: 'return',
      frac,
      remainToObjectiveMs: 0,
      remainTotalMs,
    };
  }
  return { x: town.x, y: town.y, phase: 'done', frac: 1, remainToObjectiveMs: 0, remainTotalMs: 0 };
}

/** Réglages des rencontres de TRAJET (aller / retour). */
export const TRAVEL = {
  // Probabilités PAR JAMBE de trajet. Calibrées pour qu'une rencontre reste une ÉPICE :
  // au premier réglage, 91 % des expéditions en portaient une et le butin moyen montait
  // à ×1,23 — autrement dit un bonus permanent de 23 % déguisé en aléa. Ici ~45 % des
  // voyages se passent sans rien, et la moyenne des gains retombe près de 1 : ce sont
  // les écarts qui font l'intérêt, pas un cadeau systématique.
  ambushChance: 0.14,
  cacheChance: 0.05, // trouvaille pacifique (pas de combat)
  merchantChance: 0.05, // marchand errant : troque ton or contre des vivres
  shortcutChance: 0.04, // passage découvert : retour raccourci, sans perte
  setbackChance: 0.05, // contretemps : demi-cargaison, mais retour bien plus tôt
  winMult: 1.2, // butin renforcé si l'embuscade est repoussée
  loseMult: 0.7, // butin écorné si elle est subie
  cacheMult: 1.15,
  merchantGoldMult: 0.55, // il achète ton or…
  merchantResMult: 1.4, // …et paie en ressources (puits d'or supplémentaire)
  shortcutReturnMult: 0.7, // jambe RETOUR raccourcie
  setbackReturnMult: 0.5,
  setbackHaulMult: 0.5, // on rentre vite, mais à moitié chargé
  // Route dangereuse (télégraphiée au départ) : deux fois plus d'embuscades, et une
  // récompense doublée quand on les repousse → le choix du POI redevient un arbitrage.
  perilAmbushMult: 2,
  perilRewardBonus: 0.5, // +50 % sur le gain d'une embuscade repoussée
  // Le rôdeur est calibré RELATIVEMENT au héros (même principe que le Labyrinthe), et
  // non en échelle absolue. Avec un `poiCombatant` (PV ~L³), l'embuscade était
  // ARITHMÉTIQUEMENT imbattable sans équipement — mesuré : 0 % de victoire nu, 100 %
  // équipé. Un héros peu équipé rentrait donc la cargaison écornée à TOUS les coups, et
  // deux fois depuis qu'il y a deux jambes de trajet. Une rencontre de route est un
  // ralentisseur, pas un mur : le vrai risque vit dans le POI lui-même.
  foePvTurns: 2.4, // PV du rôdeur ≈ 2,4 tours de dégâts du héros
  foeDmgPctPv: 0.07, // il mord ~7 % des PV max du héros par coup
} as const;

/** Assaillant de trajet, calibré sur le HÉROS : toujours un vrai obstacle, jamais un mur.
 *  Un build franchement bancal peut encore perdre — mais ce n'est plus mécanique. */
export function ambushCombatant(hero: Combatant, level: number): Combatant {
  const base = poiCombatant(Math.max(1, level - 1), 'camp');
  const perTurn = Math.max(1, hero.damage * (hero.strikes ?? 1));
  return {
    ...base,
    name: 'Rôdeur embusqué',
    pv: Math.max(1, Math.round(perTurn * TRAVEL.foePvTurns)),
    damage: Math.max(1, Math.round(hero.pv * TRAVEL.foeDmgPctPv)),
  };
}

export type TravelLeg = 'out' | 'back';
type TravelKind = 'ambush' | 'cache' | 'merchant' | 'shortcut' | 'setback';
export interface TravelEncounter {
  leg: TravelLeg;
  kind: TravelKind;
  won: boolean; // hors 'ambush' → toujours true
}

/** Rencontres sur la route, tirées au DÉPART comme le reste (déterministe, hors-ligne).
 *
 *  Une expédition sans aléa n'est qu'un distributeur : c'est ce qui rendait les POI de
 *  récolte plats. Ces rencontres redonnent de la variance ET la seule voie par laquelle
 *  une récolte peut lâcher un objet — sans toucher à la récompense de base.
 *
 *  Le multiplicateur s'applique à TOUT le butin (or comme ressources) : une jambe de
 *  trajet ratée écorne la cargaison, une embuscade repoussée l'enrichit. */
export function rollTravelEncounters(
  rng: () => number,
  hero: Combatant,
  poi: Poi,
  seed: number,
  playerLevel?: number,
  legs: TravelLeg[] = ['out', 'back'],
): {
  encounters: TravelEncounter[];
  goldMult: number;
  resMult: number;
  returnMult: number;
  drops: Omit<Item, 'id'>[];
  keys: number;
  text: string;
} {
  const encounters: TravelEncounter[] = [];
  const drops: Omit<Item, 'id'>[] = [];
  let goldMult = 1;
  let resMult = 1;
  let returnMult = 1;
  let keys = 0;
  let text = '';
  const LEG_FR: Record<TravelLeg, string> = { out: "à l'aller", back: 'au retour' };
  const peril = routePerilous(poi);
  const ambushP = TRAVEL.ambushChance * (peril ? TRAVEL.perilAmbushMult : 1);
  const both = (k: number) => {
    goldMult *= k;
    resMult *= k;
  };

  legs.forEach((leg, i) => {
    const roll = rng();
    if (roll < ambushP) {
      const won = simulateCombat(hero, ambushCombatant(hero, poi.level), {
        seed: seed + 31 + i * 17,
        goldOnWin: 0,
      }).win;
      encounters.push({ leg, kind: 'ambush', won });
      if (won) {
        both(TRAVEL.winMult + (peril ? TRAVEL.perilRewardBonus : 0));
        // Un assaillant vaincu = un tirage d'objet, comme un monstre de donjon. Au niveau
        // de l'embuscade (poi.level − 1) : la dépouille vaut ce que valait l'adversaire.
        const spoil = rollDrop(rng, {
          cleared: true,
          defeated: 1,
          level: Math.max(1, poi.level - 1),
          luck: 0.35,
          spread: 1,
          playerLevel,
        });
        text += ` ⚔️ Embuscade repoussée ${LEG_FR[leg]}`;
        if (spoil) {
          drops.push(spoil);
          text += ` (+ ${spoil.name} sur la dépouille)`;
        }
        text += ' !';
      } else {
        both(TRAVEL.loseMult);
        text += ` 🩸 Embuscade subie ${LEG_FR[leg]} — cargaison écornée.`;
      }
      return;
    }
    // Les autres rencontres se partagent la probabilité restante, en cascade.
    let acc = ambushP;
    if (roll < (acc += TRAVEL.cacheChance)) {
      // Trouvaille pacifique : pas de combat, juste une bonne surprise.
      encounters.push({ leg, kind: 'cache', won: true });
      both(TRAVEL.cacheMult);
      keys += 1;
      text += ` 🗝️ Cache oubliée repérée ${LEG_FR[leg]} — clé et vivres récupérés.`;
    } else if (roll < (acc += TRAVEL.merchantChance)) {
      // Marchand errant : convertit de l'or en ressources → puits d'or de plus.
      encounters.push({ leg, kind: 'merchant', won: true });
      goldMult *= TRAVEL.merchantGoldMult;
      resMult *= TRAVEL.merchantResMult;
      text += ` 🧺 Marchand errant croisé ${LEG_FR[leg]} — de l'or troqué contre des vivres.`;
    } else if (roll < (acc += TRAVEL.shortcutChance)) {
      // Passage découvert : pur gain de TEMPS, sans contrepartie.
      encounters.push({ leg, kind: 'shortcut', won: true });
      returnMult *= TRAVEL.shortcutReturnMult;
      text += ` 🧭 Passage découvert ${LEG_FR[leg]} — le retour sera plus court.`;
    } else if (roll < acc + TRAVEL.setbackChance) {
      // Contretemps : on écourte le voyage. Moitié moins de cargaison, mais le héros
      // est de nouveau disponible bien plus tôt — un mal pour un bien quand on enchaîne.
      encounters.push({ leg, kind: 'setback', won: false });
      both(TRAVEL.setbackHaulMult);
      returnMult *= TRAVEL.setbackReturnMult;
      text += ` ⛈️ Contretemps ${LEG_FR[leg]} — demi-cargaison, mais retour anticipé.`;
    }
  });

  return { encounters, goldMult, resMult, returnMult, drops, keys, text };
}

// ── Résolution (au DÉPART, seedée → révélée/créditée aux timestamps) ──
const FAIL_TEXT: Record<PoiType, string[]> = {
  lair: [
    'Le gardien était trop coriace. En battant en retraite, ton héros a détaché une clé rouillée d’un cadavre.',
    'Repli sous le feu. Dans la fuite, il a raflé un peu d’or et une babiole.',
    'Vaincu mais vivant : il ressort couvert de blessures… et de notes sur les défenses du repaire.',
  ],
  camp: [
    'Le camp était mieux gardé que prévu. Retraite en bon ordre, quelques piécettes récupérées.',
    'Embuscade évitée de justesse : bredouille côté butin, mais une faille repérée dans leur garde.',
  ],
  mine: [
    'Le filon s’est effondré avant l’extraction complète. Ton héros remonte les mains presque vides.',
  ],
  arena: ['La foule gronde : ton héros est tombé dès les premières vagues.'],
  // Récolte : pas de combat, donc jamais d'échec — entrées présentes pour l'exhaustivité.
  well: ['La source s’est tarie avant l’extraction.'],
  shrine: ['Le sanctuaire est resté muet.'],
  archive: ['Les galeries se sont effondrées avant la salle de lecture.'],
  wreck: ['L’épave s’est enfoncée avant qu’on ait pu la démonter.'],
  rift: [
    'Le gardien tient toujours la porte : la faille reste ouverte, et son armée viendra.',
    'Repli hors de la faille. Les monstres abattus ont rendu leur mana — la brèche, elle, se refermera d’elle-même en crachant.',
  ],
  mana_mine: ['Le mana résiduel s’était déjà dissipé.'],
  warband: [
    'La bande a tenu bon. Elle poursuit sa marche vers ta base — prépare l’enceinte.',
    'Repli forcé : ils sont trop nombreux. Le siège sera rude.',
  ],
};
const WIN_TEXT: Record<PoiType, string[]> = {
  lair: [
    '🏆 Repaire nettoyé ! Le trésor du set est à toi.',
    '🏆 Le gardien tombe — la relique est récupérée.',
  ],
  camp: ['🏆 Camp dispersé ! Butin ramassé.', '🏆 Victoire nette au camp.'],
  mine: ['⛏️ Filon exploité — ressources chargées.', '⛏️ Extraction réussie.'],
  well: ['💧 Source canalisée — énergie siphonnée.', '💧 La source a rendu sa charge.'],
  shrine: [
    '🔮 Sanctuaire honoré — pierres d’invocation récupérées.',
    '🔮 Les runes ont cédé leurs pierres.',
  ],
  archive: [
    '📖 Archives fouillées — des clés oubliées dans un tiroir.',
    '📖 Les rayonnages ont livré leurs secrets… et leurs clés.',
  ],
  wreck: [
    '⚓ Épave démontée — le métal s’est bien revendu.',
    '⚓ La carcasse a rendu tout son métal, et un bon prix.',
  ],
  arena: ['🏟️ L’arène acclame ton champion !'],
  rift: [
    '🕳️ Faille refermée — le gardien est tombé, aucune armée n’en sortira.',
    '🕳️ La brèche se scelle derrière ton groupe.',
  ],
  mana_mine: [
    '💠 Mana résiduel récolté — ce que la faille a laissé en s’effondrant.',
    '💠 Les derniers éclats de mana sont embarqués.',
  ],
  warband: [
    '⚔️ Bande dispersée ! L’armée de la faille ne renforcera pas le prochain siège.',
    '⚔️ Interceptée et mise en déroute — ta base respirera.',
  ],
};

/** Calcule l'issue d'une expédition (seedée). Le butin est crédité au RETOUR. */
/** Ce que RAPPORTE un POI de récolte, hors rencontres de trajet. `tfH` = `travelFactor`
 *  du trajet (super-linéaire : aller loin paie plus que proportionnellement).
 *
 *  ⚠️ SOURCE UNIQUE : le héros ET les caravanes lisent cette table. Une copie aurait
 *  divergé au premier réglage — c${A}est exactement le piège des libellés de POI et du
 *  test de ferraille, deux fois rencontré dans ce projet. */
export function harvestYield(
  type: PoiType,
  level: number,
  tfH: number,
): { energy: number; summonStones: number; keys: number; mana: number } {
  const L = Math.max(1, level);
  let energy = 0;
  let summonStones = 0;
  let keys = 0;
  let mana = 0;
  if (type === 'well') {
    // Complément d'énergie, jamais un substitut au sport : borné à ~5 runs de donjon.
    energy = Math.min(HARVEST.wellEnergyMax, Math.round((8 + L * 2) * tfH));
  } else if (type === 'shrine') {
    // Calé sur le coût d'un boss (`1 + ⌊niv/5⌋`) → une visite ≈ une tentative et demie.
    summonStones = Math.max(2, Math.round((1 + L / 5) * (0.8 + tfH * 0.25)));
  } else if (type === 'mana_mine') {
    // 💠 Ce qu'une faille laisse en s'effondrant. ⚠️ La MAGNITUDE vit dans `rift.ts`
    // (`residualMineOf`), qui la calcule sur ce que la faille valait à maturité : une
    // seconde échelle ici finirait par contredire l'invariant « fermer paie nettement mieux
    // qu'ignorer ». Cette table ne porte donc que la part de TRAJET, comme pour les autres
    // récoltes — aller loin paie plus que proportionnellement.
    // ⚠️ TRAJET **AMORTI**, l'idiome du sanctuaire (`0.8 + tfH × 0.25`) et non `× tfH` :
    // le facteur brut monte jusqu'à ~14 au trajet plafond, et une mine cherchée très loin
    // rapportait alors PLUS que fermer la faille au niveau 5 (ratio mesuré 0,92 quand
    // l'invariant en exige 2,5). Aller loin paie toujours plus, mais dans une bande.
    mana = Math.max(
      1,
      Math.round((HARVEST.manaBase + L * HARVEST.manaPerLevel) * (0.8 + tfH * 0.25)),
    );
  } else if (type === 'archive') {
    // ARCHIVES → 🗝️ clés du Labyrinthe. Elles n'avaient aucune source dédiée (drops
    // rares + la Porte), et le Labyrinthe est la SEULE source de familiers : un robinet
    // modeste, télégraphié, qui récompense le trajet — deux clés si l'on va loin.
    keys = 1 + (tfH >= HARVEST.archiveFarKeyAt ? 1 : 0);
  }
  return { energy, summonStones, keys, mana };
}

export function resolveOutcome(
  hero: Combatant,
  poi: Poi,
  seed: number,
  playerLevel?: number, // cap anti-runaway : rang des drops plafonné à min(contenu, joueur)
): ExpeditionOutcome {
  const rng = mulberry32(seed >>> 0 || 1);
  const cost = goldCost(poi.type, poi.level);

  // ── RÉCOLTE DE RESSOURCES (well / shrine / archive / mana_mine) : aucun combat, jamais
  // d'échec. Ces POI paient en devises VIVANTES — celles qui se DÉPENSENT encore quelque
  // part — et JAMAIS en butin, que la carte ne peut structurellement plus produire.
  // ⚠️ VIVANTES = ⚡ énergie, 🔮 pierres d'invocation, 🗝️ clés, 🪙 or, 💠 mana.
  // MORTES = ✨ poussière, 📜 parchemins, 💎 pierres, 🧩 fragments, 🖋️ encre : plus aucune
  // fonction ne les dépense. Les ARCHIVES payaient justement en 🧩 + 🖋️ — un POI entier
  // qui versait de la monnaie de singe, ce que la v0.658 prétendait avoir corrigé. Elles
  // rendent désormais des CLÉS, qui n'avaient aucune source dédiée. Un test l'interdit.
  if (HARVEST_TYPES.has(poi.type) && poi.type !== 'mine') {
    const rthH = (2 * travelOneWayMin(poiTravelLevel(poi), poi.distNorm)) / 60;
    const tfH = travelFactor(rthH); // super-linéaire : aller loin paie PLUS que proportionnellement
    const { energy, summonStones, keys, mana } = harvestYield(poi.type, poi.level, tfH);
    // Une récolte sans aléa n'est qu'un distributeur : les rencontres de trajet lui
    // rendent de la variance, et sont la SEULE voie par laquelle elle peut lâcher un objet.
    const tr = rollTravelEncounters(rng, hero, poi, seed, playerLevel);
    const k = tr.resMult;
    return {
      win: true,
      gold: Math.round(cost * 0.35 * tr.goldMult), // symbolique : la paie est en ressources
      // Le plafond s'applique APRÈS le bonus de trajet : « complément, jamais
      // substitut au sport » est un invariant, pas une valeur de base qu'un bon
      // voyage pourrait dépasser.
      energy: Math.min(HARVEST.wellEnergyMax, Math.round(energy * k)),
      summonStones: Math.round(summonStones * k),
      mana: Math.round(mana * k),
      item: tr.drops[0] ?? null,
      items: tr.drops,
      key: keys + (rng() < HARVEST.keyChance ? 1 : 0) + tr.keys,
      reconBonus: 0,
      returnMult: tr.returnMult,
      text: pick(rng, WIN_TEXT[poi.type]) + tr.text,
    };
  }

  // ── ARÈNE : gauntlet de survie par vagues (nuit) → RÉCOMPENSE GRASSE ∝ vagues. ──
  // Chère en or (puits) + trajet long, mais paie beaucoup en poussière/pierres/gear.
  if (poi.type === 'arena') {
    const rthA = (2 * travelOneWayMin(poiTravelLevel(poi), poi.distNorm)) / 60;
    const tfA = travelFactor(rthA);
    const waves = simulateArena(hero, poi.level, seed + 17);
    const good = waves >= 6; // « belle performance » (pour le ton du rapport / notif)
    // Or : on rend une part du coût (sink net) mais la vraie paie est en ressources.
    const gold =
      Math.round((poi.level * 12 + waves * poi.level * 7) * (1 + (tfA - 0.5) * 0.4)) +
      Math.round(cost * 0.25);
    // Récompense par vague RELEVÉE (2026‑08‑18, ticket arène) : l'arène était strictement
    // dominée par un camp (moins de poussière pour un coût d'or 4× plus élevé). Tenir
    // longtemps devient une VRAIE grosse paie de ressources → justifie la dépense d'or.
    // Parchemins d'enchant : faucet SECONDAIRE et modeste (le donjon reste la source
    // principale) — ∝ vagues tenues, sans le multiplicateur de trajet (déjà encodé par
    // les vagues). NB : quantités ex-« pierres » (rares) volontairement réduites.
    // BUTIN : un TIRAGE PAR VAGUE TENUE (même principe qu'un donjon, qui tire une fois
    // par monstre vaincu). `cleared: false` → ~30 %/vague : tenir 10 vagues rapporte ~3
    // objets, 20 vagues ~6 — plus généreux que l'ancien palier de 5 vagues (1 objet/5),
    // sans inonder le sac. La luck monte avec les vagues → tenir longtemps paie en QUALITÉ
    // autant qu'en quantité. Plafond dur = garde-fou d'inventaire sur les très longues runs.
    const items: Omit<Item, 'id'>[] = [];
    for (let w = 0; w < waves && items.length < EXPE.arenaMaxItems; w++) {
      const d = rollDrop(rng, {
        cleared: false, // ≈ 30 % par vague
        defeated: 1,
        level: poi.level,
        luck: Math.min(0.95, 0.35 + w * 0.05),
        spread: 0,
        playerLevel,
      });
      if (d) items.push(d);
    }
    const key = rng() < Math.min(0.4, waves * 0.03) ? 1 : 0;
    const text =
      waves === 0
        ? pick(rng, FAIL_TEXT.arena)
        : `🏟️ ${waves} vague${waves > 1 ? 's' : ''} tenue${waves > 1 ? 's' : ''} !${good ? ' La foule est en délire.' : ''}`;
    return {
      win: good,
      gold,
      mana: 0,
      energy: 0,
      // ⚠️ L'arène versait des fragments 🧩 et de l'encre 🖋️ — devises MORTES. C'était la
      // SEULE fuite réelle qui restait : produite ici, recopiée dans le message, affichée
      // au joueur, puis créditée par `expeClaim`. Elle paie désormais en pierres
      // d'invocation, qui se dépensent (les boss).
      summonStones: 3 + Math.floor(waves * 0.8) + Math.round(waves * 0.6),
      item: items[0] ?? null,
      items,
      key,
      reconBonus: 0,
      returnMult: 1,
      waves,
      text,
    };
  }

  // ⚠️ Un CAMP ou un REPAIRE ne passe plus par ici : il s'attaque en GROUPE (`resolveCamp`).
  // `expeSend` le refuse, et une expédition héros d'avant les
  // camps de faction porte son issue DÉJÀ tirée au départ (`startExpedition`) — rien ne la
  // rejoue. L'ancienne branche (gardien `poiCombatant`) n'avait plus aucun chemin : retirée.
  if (CAMP_TYPES.has(poi.type)) throw new Error('Un camp se résout par resolveCamp.');
  // ⚠️ GARDE INDISPENSABLE, et il manquait : sans lui une FAILLE tombait dans la branche
  // finale — celle de la MINE D'OR. Un joueur y envoyait son héros et récoltait de l'or et
  // de l'énergie, en silence et sans le moindre combat. Une faille se referme par une
  // INCURSION (`simulateIncursion`), et tant qu'elle n'est pas branchée `poiOffers` refuse
  // l'envoi — ce qui grise le lieu sur la carte (v0.738 : « le gris veut dire rien ne peut y
  // être envoyé »). Ce garde est la ceinture : aucun chemin ne peut la résoudre en silence.
  if (isRiftPoi(poi)) throw new Error('Une faille se referme par une incursion (rift.ts).');
  // Mine = récolte (pas de combat) ; les rencontres de trajet lui rendent de la variance.
  const base = mineOutcome(rng, poi);
  // Rencontres de trajet — MÊME helper que les récoltes (aller ET retour), pour ne pas
  // maintenir deux fois la même règle.
  const tr = rollTravelEncounters(rng, hero, poi, seed, playerLevel);
  const items = [...(base.items ?? []), ...tr.drops];
  return {
    ...base,
    gold: Math.round(base.gold * tr.goldMult),
    item: items[0] ?? null,
    items,
    key: base.key + tr.keys,
    returnMult: tr.returnMult,
    text: base.text + tr.text,
  };
}

/** Durée aller-retour en heures, et le facteur de temps historique `0,5 + h`. */
function tripHours(poi: Poi): { rth: number; tf: number } {
  const rth = (2 * travelOneWayMin(poiTravelLevel(poi), poi.distNorm)) / 60;
  return { rth, tf: 0.5 + rth };
}

/** MINE : récolte d'or et d'énergie, sans combat (hors rencontres de trajet).
 *
 *  HAUL SCALÉ AU TEMPS DE TRAJET (aller-retour) : une expédition de plusieurs heures
 *  doit VALOIR le coup (avant : reward ∝ niveau seul → dérisoire vs un donjon actif).
 *  MINE = INVESTISSEMENT D'OR (+ temps réel) → doit rapporter nettement plus que le coût.
 *  Rendement = coût × (1,3 + `travelFactor(rth)`) : reine de l'or, et d'autant plus loin. */
function mineOutcome(rng: () => number, poi: Poi): ExpeditionOutcome {
  const { rth, tf } = tripHours(poi);
  const cost = goldCost(poi.type, poi.level);
  // MINE = reine de l'or, et d'autant plus loin (coût × 1,3 + facteur de voyage).
  const gold = Math.round(cost * (1.3 + travelFactor(rth)));
  // ÉNERGIE : un complément borné du sport, jamais un substitut (ticket a0d16472).
  const energy = Math.min(
    EXPE.mineEnergyMax,
    Math.round((4 + poi.level * 1.5) * Math.min(tf, EXPE.mineEnergyTfCap)),
  );
  return {
    win: true,
    gold,
    mana: 0,
    energy,
    summonStones: 0,
    item: null,
    items: [],
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    text: pick(rng, WIN_TEXT[poi.type]),
  };
}

// ── Fond de carte : PARCHEMIN dessiné à l'encre (style « livre d'aventure ») ──
type MotifKind = 'mountain' | 'tree' | 'dune';
interface Motif {
  kind: MotifKind;
  d: string; // path prêt à rendre (encre)
  x: number; // pour l'ordre de rendu (peintre : du fond vers l'avant)
  y: number;
}
export interface Terrain {
  coast: string; // contour de la CÔTE (continent) — path fermé
  features: Motif[]; // reliefs dessinés (chaînes de montagnes, forêts, dunes)
  rivers: string[]; // rivières serpentant depuis les reliefs
  /** Décor de prairie (v0.749) : touffes d'herbe et taches plus sombres, sur la terre
   *  ferme uniquement. Même langage que le sol de la Base. */
  tufts: string[];
  patches: { cx: number; cy: number; rx: number; ry: number }[];
}

const f1 = (v: number) => v.toFixed(1);

// Blob organique fermé (lissé) autour de (cx,cy).
/** Contour irrégulier fermé. ⚠️ Son rayon ne descend JAMAIS sous `r × COAST.min` : c'est
 *  ce plancher qui garantit que les POI restent sur la terre ferme (cf. `landRadius`).
 *  Avant, le rayon variait de 0,74 à 1,20 × r — la côte pinçait donc jusqu'à ~65 alors
 *  que les POI allaient jusqu'à 88 : ceux tombés dans un renfoncement flottaient en mer. */
function blobPath(rng: () => number, cx: number, cy: number, r: number, n: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (COAST.min + rng() * COAST.span);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const mid = (i: number): [number, number] => {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  let d = `M ${f1(mid(n - 1)[0])} ${f1(mid(n - 1)[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(i);
    d += ` Q ${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`;
  }
  return d + ' Z';
}

// Un pic de montagne dessiné à l'encre (contour + versant hachuré).
function peakPath(x: number, y: number, s: number): string {
  const bx = x - 3.4 * s;
  const cx = x + 3.4 * s;
  const py = y - 3.6 * s;
  return `M ${f1(bx)} ${f1(y + 1.6 * s)} L ${f1(x)} ${f1(py)} L ${f1(cx)} ${f1(y + 1.6 * s)} M ${f1(x)} ${f1(py)} L ${f1(x - 1.1 * s)} ${f1(y - 0.3 * s)}`;
}
/** Un conifère : triangle + tronc. Partagé avec la Base (mêmes arbres partout). */
export function treePath(x: number, y: number, s: number): string {
  return `M ${f1(x)} ${f1(y - 3 * s)} L ${f1(x - 1.7 * s)} ${f1(y + 1 * s)} L ${f1(x + 1.7 * s)} ${f1(y + 1 * s)} Z M ${f1(x)} ${f1(y + 1 * s)} L ${f1(x)} ${f1(y + 2.2 * s)}`;
}
// Une dune (arc d'encre).
function dunePath(x: number, y: number, s: number): string {
  return `M ${f1(x - 4 * s)} ${f1(y)} Q ${f1(x)} ${f1(y - 2.2 * s)} ${f1(x + 4 * s)} ${f1(y)}`;
}
/**
 * Une rivière serpentant depuis (x,y) vers l'extérieur (path lissé).
 *
 * ⚠️ ELLE S'ARRÊTE À LA CÔTE. Sans cette borne, le tracé continuait tout droit sur sa
 * longueur (30 à 60) sans savoir où finit la terre : des rivières coulaient EN PLEINE
 * MER et sortaient du cadre. Le défaut existait depuis l'origine — l'encre monochrome
 * le rendait invisible, le sol peint l'a montré du premier coup d'œil. Le fleuve se
 * jette donc à l'eau : on coupe au premier point hors du rayon de terre ferme.
 */
function riverPath(rng: () => number, x: number, y: number, dir: number, len: number): string {
  const C = EXPE.mapSize / 2;
  const shore = landRadius() + 2; // un cheveu au-delà : l'embouchure touche la mer
  let px = x;
  let py = y;
  let d = `M ${f1(px)} ${f1(py)}`;
  const steps = 5 + Math.floor(len / 10);
  let a = dir;
  for (let i = 0; i < steps; i++) {
    a += (rng() - 0.5) * 1.1; // serpente
    const seg = len / steps;
    const mx = px + Math.cos(a) * seg * 0.5;
    const my = py + Math.sin(a) * seg * 0.5;
    const nx = px + Math.cos(a) * seg;
    const ny = py + Math.sin(a) * seg;
    if (Math.hypot(nx - C, ny - C) > shore) break; // la rivière se jette à la mer
    px = nx;
    py = ny;
    d += ` Q ${f1(mx)} ${f1(my)} ${f1(px)} ${f1(py)}`;
  }
  return d;
}

/** Réglages du littoral. `min`/`span` = fraction du rayon nominal : le contour va donc de
 *  `min` à `min + span`. Le PLANCHER est ce qui compte — c'est lui qui garantit la terre
 *  ferme sous les POI. */
const COAST = { r: 0.44, min: 0.86, span: 0.28, pinch: 0.988 } as const;

/** Rayon de terre ferme GARANTI autour de la ville. La courbe de côte étant tracée en
 *  Bézier par les milieux des points de contrôle, elle passe légèrement en deçà du
 *  plancher entre deux points bas : `pinch` l'encaisse. Tout POI doit tenir là-dedans. */
export function landRadius(): number {
  return EXPE.mapSize * COAST.r * COAST.min * COAST.pinch;
}

/** Un POI tient-il dans la fenêtre de la carte ? Sert à PÉRIMER les POI des cartes
 *  sauvegardées avant que `distMax` ne soit borné par le littoral (v0.668) : sans ça, un
 *  joueur garderait jusqu'à 48 h des POI dessinés en pleine mer. Petite tolérance pour ne
 *  pas balayer un POI parfaitement légitime posé pile sur la limite. */
function withinLand(p: { x: number; y: number }): boolean {
  return Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y) <= EXPE.distMax + 1;
}

/** Terrain de la carte (déterministe pour un `seed`) : côte + reliefs + rivières (encre). */
export function expeditionTerrain(seed: number): Terrain {
  const rng = mulberry32(seed >>> 0 || 1);
  const C = EXPE.mapSize / 2; // centre de la carte
  // Continent : grand contour irrégulier, très découpé (détaillé).
  const coast = blobPath(rng, C, C, EXPE.mapSize * COAST.r, 20);
  const features: Motif[] = [];
  const rivers: string[] = [];
  const push = (kind: MotifKind, x: number, y: number, s: number) => {
    const d =
      kind === 'mountain'
        ? peakPath(x, y, s)
        : kind === 'tree'
          ? treePath(x, y, s)
          : dunePath(x, y, s);
    features.push({ kind, d, x, y });
  };
  // Amas de relief (chaîne / forêt / désert) répartis dans le continent — nombre
  // et étalement mis à l'échelle de la carte (plus grande = plus de reliefs, étalés).
  const clusters = 8 + Math.floor(rng() * 4);
  const spread = EXPE.mapSize * 0.3; // rayon d'étalement des amas (reste dans la côte)
  const centers: [number, number][] = [];
  for (let c = 0; c < clusters; c++) {
    let cx = C;
    let cy = C;
    for (let tries = 0; tries < 24; tries++) {
      const a = rng() * Math.PI * 2;
      const rr = EXPE.mapSize * 0.1 + rng() * spread;
      cx = C + Math.cos(a) * rr;
      cy = C + Math.sin(a) * rr;
      if (centers.every(([px, py]) => Math.hypot(px - cx, py - cy) > 24)) break;
    }
    centers.push([cx, cy]);
    const kind: MotifKind = (['mountain', 'tree', 'dune', 'mountain', 'tree'] as const)[
      Math.floor(rng() * 5)
    ]!;
    if (kind === 'mountain') {
      const dir = rng() * Math.PI;
      const n = 5 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) * (3.4 + rng());
        push(
          'mountain',
          cx + Math.cos(dir) * t + (rng() - 0.5) * 2.5,
          cy + Math.sin(dir) * t + (rng() - 0.5) * 2.5,
          0.9 + rng() * 0.8,
        );
      }
      // Une rivière descend souvent de la montagne.
      if (rng() < 0.7) rivers.push(riverPath(rng, cx, cy, rng() * Math.PI * 2, 30 + rng() * 30));
    } else if (kind === 'tree') {
      const n = 12 + Math.floor(rng() * 9);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const rr = rng() * 12;
        push('tree', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.8 + rng() * 0.6);
      }
    } else {
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++)
        push('dune', cx + (rng() - 0.5) * 16, cy + (rng() - 0.5) * 12, 0.9 + rng() * 0.7);
    }
  }
  // Ordre peintre : du fond (haut) vers l'avant (bas).
  features.sort((a, b) => a.y - b.y);
  // ⚠️ Décor de prairie tiré d'un rng SÉPARÉ : ajouté après coup, il ne doit pas décaler
  // les tirages de la côte, des reliefs et des rivières (sorties byte-identiques).
  const dec = mulberry32((seed ^ 0x5bd1e995) >>> 0 || 7);
  const inland = landRadius() - 6;
  const tufts: string[] = [];
  const patches: Terrain['patches'] = [];
  for (let i = 0; i < 400 && tufts.length < 70; i++) {
    const x = dec() * EXPE.mapSize;
    const y = dec() * EXPE.mapSize;
    const dc = Math.hypot(x - C, y - C);
    if (dc > inland || dc < 14) continue; // ni en mer, ni sous la ville
    const h = 1.6 + dec() * 1.2;
    tufts.push(
      `M${f1(x)} ${f1(y)} l-0.9 -${f1(h * 0.8)} M${f1(x)} ${f1(y)} l0 -${f1(h)} M${f1(x)} ${f1(y)} l0.9 -${f1(h * 0.8)}`,
    );
  }
  for (let i = 0; i < 120 && patches.length < 12; i++) {
    const cx = dec() * EXPE.mapSize;
    const cy = dec() * EXPE.mapSize;
    const dc = Math.hypot(cx - C, cy - C);
    if (dc > inland - 6 || dc < 16) continue;
    patches.push({ cx: +f1(cx), cy: +f1(cy), rx: +f1(5 + dec() * 8), ry: +f1(2.5 + dec() * 3.5) });
  }
  return { coast, features, rivers, tufts, patches };
}

/** Construit une expédition (au moment de l'envoi). `now` = ms epoch. `travelMult`
 *  (< 1 = plus rapide) applique la réduction de trajet de l'avant-poste. */
export function startExpedition(
  hero: Combatant,
  poi: Poi,
  now: number,
  seed: number,
  travelMult = 1,
  playerLevel?: number, // cap anti-runaway sur le rang des drops
): ActiveExpedition {
  const oneWayMs = Math.round(
    travelOneWayMin(poiTravelLevel(poi), poi.distNorm) * 60_000 * travelMult,
  );
  const outcome = resolveOutcome(hero, poi, seed, playerLevel);
  // Seule la jambe RETOUR bouge : l'aller et le dépôt du rapport (midAt) restent intacts,
  // le héros a bien atteint l'objectif avant que la route ne décide de sa vitesse.
  const backMs = Math.round(oneWayMs * (outcome.returnMult || 1));
  return {
    poi,
    sentAt: now,
    midAt: now + oneWayMs,
    returnAt: now + oneWayMs + backMs,
    goldCost: goldCost(poi.type, poi.level),
    seed: seed >>> 0 || 1,
    outcome,
  };
}
