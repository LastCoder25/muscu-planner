// party.ts — LA MISSION DE GROUPE : envoyer le héros et/ou des aventuriers sur un lieu,
// les faire voyager, déposer le rapport, encaisser. Pur/testable.
//
// ⚠️ POURQUOI CE MODULE EXISTE. Deux lieux s'attaquent en groupe — les CAMPS de faction
// (`camp.ts`) et les FAILLES (`rift.ts`) — et tout ce qui entoure le combat leur est
// COMMUN : la porte d'envoi, le trajet, la colonne `parties`, le cycle de vie, l'XP et les
// blessés à l'encaissement, le rapport 📬. Laisser cette machinerie dans `camp.ts`
// obligerait `rift.ts` à importer les camps (ce qui se lit faux) ou à en recopier une
// seconde version (ce qui divergerait au premier réglage — la leçon que ce projet paie
// à répétition). Les deux modules ne gardent donc que leur RÉSOLUTION.
//
// ⚠️ `startParty` NE CHOISIT PLUS la résolution : elle reçoit l'issue déjà calculée
// (`resolveCamp` ou `resolveIncursion`). La dispatch vit à l'UNIQUE chemin d'envoi
// (le store), au lieu d'être enfouie dans le constructeur du voyage.
//
// ⚠️ Aucun cycle : ce module importe `expedition`, `caravan` et `adventurers` ; aucun des
// trois ne l'importe. `camp.ts` et `rift.ts` l'importent tous les deux.
import { caravanHurtMs, caravanLegMin, type PartyHero } from './caravan';
import {
  CAMP_TYPES,
  PARTY_TARGETS,
  buildMessage,
  isRiftPoi,
  depositMessages,
  goldCost,
  travelOneWayMin,
  type ActiveExpedition,
  type ExpeditionMessage,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { FACTION_EMOJI, FACTION_LABEL } from './raid';
import { advTitle, grantAdvXp, type Adventurer } from './adventurers';
/** Trajet ALLER d'un groupe (minutes) : héros seul → son trajet (Avant-poste compris) ;
 *  avec des aventuriers → le plus LENT des deux (un groupe ne va pas plus vite que ses
 *  marcheurs). ⚠️ Tous les paramètres sont REQUIS, comme `caravanLegMin`. */
export function partyLegMin(
  poi: Poi,
  escort: Adventurer[],
  opts: { hero: boolean; travelMult: number; comptoirLevel: number; gearSpeed: number },
): number {
  const hero = opts.hero
    ? Math.round(travelOneWayMin(poi.level, poi.distNorm) * opts.travelMult)
    : 0;
  const advs = escort.length ? caravanLegMin(poi, escort, opts.comptoirLevel, opts.gearSpeed) : 0;
  return Math.max(1, hero, advs);
}

/**
 * 🕳️ COMBIEN DE CHAMPIONS UNE FAILLE LAISSE ENTRER — et pourquoi c'est un nombre à part.
 *
 * ⚠️ **MESURÉ : au-delà de 3, une faille ne se joue plus.** Part nettoyée d'une faille
 * MÛRE, sans le héros : **1 → 0 % · 2 → 0-2 % · 3 → 62-83 % · 4 → 99-100 % · 5+ → 100 %**,
 * identique aux niveaux 12, 26, 45 et 70. Sur une faille JEUNE : 2 → 32-40 %, 3 → 94-96 %,
 * 4 → 100 %. Le plafond du Panthéon (16 champions au niveau 30, **51** au niveau 100) est
 * donc décoratif ici.
 *
 * ⚠️ **LA CAUSE EST STRUCTURELLE, pas un réglage** : une faille n'a **qu'un seul axe de
 * force** — son niveau. Elle n'a pas d'équivalent de `CAMP_SIZES`, donc rien ne la fait
 * grandir avec le groupe envoyé. Sans ce plafond, « combien j'en envoie » n'a qu'une
 * réponse dès qu'on possède quatre champions.
 *
 * ⚠️ **LES CAMPS N'EN VEULENT PAS**, et c'est mesuré aussi : leur taille (2 à 10) EST
 * déjà le gradateur — un camp de 10 se gagne à 20-61 % avec huit champions et 57-99 %
 * avec dix. Un plafond bas y rendrait les gros repaires impossibles sans le héros, donc
 * retirerait du contenu.
 */
export const RIFT_MAX_PARTY = 3;

/** Le plafond de champions RÉELLEMENT applicable à ce lieu : le plus strict entre celui du
 *  Panthéon et celui du lieu. ⚠️ Source unique — l'écran et le store l'appellent tous deux
 *  à travers `partySendBlocker`, qui la porte.
 *
 *  ⚠️ **LE HÉROS COMPTE DANS LES 3 d'une faille** (décision 2026-09-21). Deux règles qui se
 *  complètent : la v0.982 borne ce qu'il VAUT (au plus deux champions de référence,
 *  `heroPartyCombatant`), celle-ci borne la PLACE qu'il prend. Sans elle, héros + 3
 *  champions valait jusqu'à 5 champions — au-delà du point où une faille cesse de se jouer
 *  (4 → 99-100 %). `hero` est REQUIS : un paramètre qu'on peut
 *  oublier finit par l'être, et l'oubli rendrait une place de trop. Un camp n'est pas
 *  concerné — sa TAILLE est déjà le gradateur. */
export function partyCapFor(poi: Pick<Poi, 'type'>, engage: number, hero: boolean): number {
  const c = Math.max(0, Math.floor(engage));
  return isRiftPoi(poi) ? Math.max(0, Math.min(c, RIFT_MAX_PARTY - (hero ? 1 : 0))) : c;
}

/** Pourquoi un GROUPE ne peut pas partir — `null` s'il le peut.
 *  ⚠️ La taille d'un groupe est bornée par le Panthéon, et **plus strictement encore par
 *  une FAILLE** (`RIFT_MAX_PARTY`) ; les convois gardent `CARAVAN.escortMax`, leur
 *  calibration en dépend.
 *  ⚠️ En revanche un groupe SANS le héros prend un CRÉNEAU DE CONVOI (`convoySlotsFree`,
 *  un seul pool avec les convois) : c'est ce qui borne le NOMBRE de groupes en parallèle,
 *  donc l'or et les pierres par jour. Le héros est à lui seul sa limite.
 *  SOURCE UNIQUE : le store refuse avec cette règle, l'écran dit pourquoi. */
export type PartySendBlock = 'notTarget' | 'empty' | 'slots' | 'tooMany' | 'riftCrowd';
export function partySendBlocker(
  poi: Poi,
  escortCount: number,
  hero: boolean,
  slotsFree: number,
  cap: number,
): PartySendBlock | null {
  if (!PARTY_TARGETS.has(poi.type)) return 'notTarget';
  if (!hero && escortCount <= 0) return 'empty';
  if (!hero && slotsFree <= 0) return 'slots';
  // 🗿 LE PLAFOND DU PANTHÉON (`engageCap`) : on n'engage que N champions à la fois.
  // ⚠️ Il vit ICI et non sur la personne (plus de banc) — mais il doit bien mordre quelque
  // part : un groupe sans maximum est le seul endroit du jeu où l'effectif entier pourrait
  // partir d'un coup, et c'est ce qui rendrait la collection décisive.
  if (escortCount > Math.max(0, Math.floor(cap))) return 'tooMany';
  // 🕳️ …ET LE PLAFOND DE LA FAILLE, plus strict : on distingue les deux refus parce qu'ils
  // ne se corrigent pas pareil — l'un se lève en montant le Panthéon, l'autre jamais.
  if (escortCount > partyCapFor(poi, cap, hero)) return 'riftCrowd';
  return null;
}
export const PARTY_SEND_BLOCK_LABEL: Record<PartySendBlock, string> = {
  notTarget: 'on n’envoie pas de groupe sur ce lieu',
  empty: 'le groupe est vide',
  slots: 'tous les créneaux de convoi sont pris',
  tooMany: 'trop de champions pour ton Panthéon',
  riftCrowd: `une faille ne laisse passer que ${RIFT_MAX_PARTY} membres, héros compris`,
};
export function canSendParty(
  poi: Poi,
  escortCount: number,
  hero: boolean,
  slotsFree: number,
  cap: number,
): boolean {
  return partySendBlocker(poi, escortCount, hero, slotsFree, cap) === null;
}

/** Pourquoi le HÉROS ne peut pas rejoindre le groupe — `null` s'il le peut.
 *  ⚠️ SOURCE UNIQUE : le store (`sendParty`) refuse avec la MÊME règle, l'écran dit POURQUOI
 *  le héros est grisé au lieu de le cacher. Ordre : déjà parti, à l'infirmerie, sans
 *  Avant-poste, sans l'or du départ. */
export type PartyHeroBlock = 'expedition' | 'infirmary' | 'outpost' | 'gold';
export function partyHeroBlocker(ctx: {
  onExpedition: boolean;
  healMs: number;
  outpost: boolean;
  gold: number;
  cost: number;
}): PartyHeroBlock | null {
  if (ctx.onExpedition) return 'expedition';
  if (ctx.healMs > 0) return 'infirmary';
  if (!ctx.outpost) return 'outpost';
  if (ctx.gold < ctx.cost) return 'gold';
  return null;
}
export const PARTY_HERO_BLOCK_LABEL: Record<PartyHeroBlock, string> = {
  expedition: '🧭 déjà en expédition',
  infirmary: '🤕 à l’infirmerie',
  outpost: '🧭 Avant-poste requis',
  gold: '🪙 pas assez d’or',
};

/** Ce que `startParty` a besoin de savoir d'un envoi, quelle que soit la cible. Les entrées
 *  de `resolveCamp` et de `resolveIncursion` le satisfont toutes les deux. */
export interface PartyVoyage {
  poi: Poi;
  hero: PartyHero | null;
  seed: number;
}

/**
 * 🪙 LE PÉAGE D'OR DU HÉROS dans un groupe.
 *
 * ⚠️ **PLUS SUR UN CAMP (v0.980).** Le péage était le prix du butin d'une expédition solo, que
 * le héros faisait tomber ; depuis qu'il n'y compte plus que pour deux champions et que le
 * butin est celui d'un groupe (`resolveCamp`), le lui faire payer rendrait sa présence
 * net-négative. Failles et bandes le gardent (mesuré en v0.932 : c'est le coût de sa présence).
 * ⚠️ SOURCE UNIQUE : `startParty`, le refus du store et la tuile de l'écran le lisent.
 */
export function partyHeroToll(poi: Pick<Poi, 'type' | 'level'>): number {
  return CAMP_TYPES.has(poi.type) ? 0 : goldCost(poi.type, poi.level);
}

/** Construit le voyage d'un groupe. ⚠️ Le coût d'or ne se paie qu'avec le HÉROS
 *  (`partyHeroToll`) ; l'escorte est payée en salaires à l'encaissement.
 *  ⚠️ L'ISSUE EST PASSÉE, jamais calculée ici : c'est le seul chemin d'envoi (le store) qui
 *  choisit la résolution, au lieu que ce constructeur décide pour lui. */
export function startParty(
  input: PartyVoyage,
  now: number,
  legMin: number,
  outcome: ExpeditionOutcome,
): ActiveExpedition {
  const leg = Math.max(1, Math.round(legMin)) * 60_000;
  return {
    poi: input.poi,
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    goldCost: input.hero ? partyHeroToll(input.poi) : 0,
    seed: input.seed >>> 0 || 1,
    outcome,
  };
}

/** Un groupe parti SANS le héros (colonne `characters.parties`, migr. 0077). ⚠️ Un groupe
 *  AVEC le héros vit dans `expedition`, comme toute expédition héros : un seul voyage héros
 *  à la fois. L'`id` distingue plusieurs groupes en route. */
export type ActiveParty = ActiveExpedition & { id: string };

/** Relit la colonne `parties` : un jsonb malformé ne doit jamais faire planter la page.
 *  ⚠️ Une entrée sans POI, sans issue ou sans horodatages est ÉCARTÉE : `buildMessage` la
 *  lirait et lèverait à chaque tick (même politique que `normalizeAdvGearState`). */
export function normalizeParties(v: unknown): ActiveParty[] {
  if (!Array.isArray(v)) return [];
  return (v as Partial<ActiveParty>[]).filter(
    (p): p is ActiveParty =>
      !!p &&
      typeof p === 'object' &&
      typeof p.id === 'string' &&
      !!p.poi &&
      typeof p.poi === 'object' &&
      !!p.outcome &&
      typeof p.outcome === 'object' &&
      Number.isFinite(p.sentAt) &&
      Number.isFinite(p.midAt) &&
      Number.isFinite(p.returnAt),
  );
}

/**
 * ⚔️ Cycle de vie des groupes partis SANS le héros — PUR ; le store ne fait que persister.
 * - à l'arrivée sur le camp (`midAt`) : le rapport est déposé dans la boîte, UNE fois
 *   (`reported` + dédoublonnage par id) ;
 * - au retour (`returnAt`) : le groupe est RETIRÉ de la liste. Ses aventuriers sont libérés
 *   par leur `busyUntil` ; le BUTIN reste à encaisser dans la boîte (`claimed: false`).
 * ⚠️ Une app fermée pendant tout le voyage passe les deux conditions dans le même appel :
 * rapport déposé PUIS groupe retiré — voulu, le butin n'est pas perdu.
 * ⚠️ Le rapport passe par `depositMessages` : jamais doublé, jamais un encaissement dégradé,
 *   boîte taillée par `keepMessages` (jamais un butin à récupérer jeté).
 * ⚠️ `changed` faux ⇒ le store n'écrit rien (le tick bat chaque seconde).
 */
export function settleParties(
  parties: readonly ActiveParty[],
  messages: ExpeditionMessage[],
  now: number,
  cap: number,
): {
  parties: ActiveParty[];
  messages: ExpeditionMessage[];
  fresh: ExpeditionMessage[];
  changed: boolean;
} {
  let box = messages;
  const fresh: ExpeditionMessage[] = [];
  const next: ActiveParty[] = [];
  let changed = false;
  for (const p of parties) {
    let q = p;
    if (now >= p.midAt && !p.reported) {
      const msg = buildMessage(p);
      // ⚠️ `depositMessages` : jamais un doublon, jamais un encaissement dégradé.
      const next = depositMessages(box, [msg], cap);
      if (next !== box) {
        box = next;
        fresh.push(msg);
      }
      q = { ...p, reported: true };
      changed = true;
    }
    if (now >= q.returnAt) {
      changed = true;
      continue;
    }
    next.push(q);
  }
  return { parties: next, messages: box, fresh, changed };
}

/**
 * 🎁 Ce que l'ENCAISSEMENT d'un rapport de groupe change au vivier — PUR.
 * - XP par aventurier (`party.xp`, calculée au départ), plafonnée par la Guilde (`grantAdvXp`) ;
 * - 🤕 les blessés du camp (`party.hurt`) partent à l'infirmerie pour la durée d'un convoi
 *   (`caravanHurtMs`, soigneurs de l'escorte et Infirmerie compris). ⚠️ Jamais RACCOURCIE :
 *   un aventurier déjà alité plus longtemps (siège perdu) garde son échéance ;
 * - `escort` : les membres encore dans le vivier (un renvoyé n'a plus rien à recevoir) ;
 * - `wages` : ENTIER (colonne `gold` entière — cf. le bug de la cargaison décimale, v0.796).
 * ⚠️ Le HÉROS n'y figure jamais : ni XP (elle vient du sport), ni blessure.
 */
export function partyClaimRoster(
  party: PartyResult,
  roster: readonly Adventurer[],
  ctx: { pantheonLevel: number; infirmaryLevel: number; now: number },
): { adventurers: Adventurer[]; escort: Adventurer[]; wages: number } {
  const escort = party.escort
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is Adventurer => !!a);
  const hurtUntil = ctx.now + caravanHurtMs(escort, ctx.infirmaryLevel);
  const hurt = new Set(party.hurt);
  const adventurers = roster.map((a) => {
    const gain = party.xp[a.id];
    if (gain === undefined) return a;
    const up = grantAdvXp(a, gain, ctx.pantheonLevel);
    return hurt.has(a.id) ? { ...up, hurtUntil: Math.max(up.hurtUntil ?? 0, hurtUntil) } : up;
  });
  return { adventurers, escort, wages: Math.max(0, Math.round(party.wages || 0)) };
}

/**
 * 🎲 Graine du VRAI combat de groupe — toujours PAIRE.
 * ⚠️ PARTAGÉE par les camps (`resolveCamp`) et les failles (`resolveIncursion`) : c'est une
 * règle de la MISSION DE GROUPE, pas de l’un des deux lieux.
 * ⚠️ DISJOINTE PAR CONSTRUCTION des graines du pronostic (`partyForecastSeed`, toujours
 * IMPAIRES) : un % affiché avant l'envoi ne doit jamais rejouer la bataille qui aura lieu,
 * sinon il en révélerait l'issue (doctrine du pronostic de siège, v0.767). L'ancienne paire
 * `(seed + 17)` / `s × 131 + 5` se croisait (graine 119 → 136 = 2ᵉ échantillon).
 * La parité se lit sans connaître la graine du départ : le pronostic est calculé AVANT
 * qu'elle existe. Coût : `seed` et `seed + 2³¹` livrent le même combat (sans effet de jeu).
 */
export function partyFightSeed(seed: number): number {
  return (((seed >>> 0) + 17) * 2) >>> 0;
}

/** 🎲 Graine du i-ème échantillon du pronostic — toujours IMPAIRE (cf. `partyFightSeed`),
 *  étalée par la constante de Fibonacci pour ne pas rejouer des graines voisines. */
export function partyForecastSeed(i: number): number {
  return (Math.imul((i >>> 0) + 1, 0x9e3779b1) | 1) >>> 0;
}

interface PartyReportMember {
  id: string;
  name: string;
  emoji: string;
  xp: number;
  kills: number;
  hurt: boolean;
  /** Plus dans le vivier : sa ligne reste, l'XP a bien été versée. */
  gone: boolean;
  /** Son identité de champion (portrait), `null` pour un aventurier d'avant les champions
   *  ou parti du vivier — l'écran retombe alors sur l'emoji. */
  championId: string | null;
}
export interface PartyReport {
  hero: boolean;
  win: boolean;
  factionLabel: string;
  factionEmoji: string;
  /** ⚠️ Une INCURSION de faille, pas un camp. Dérivé de la seule source possible
   *  (`party.rift`) : le rapport disait « camp pris » quand on refermait une faille. */
  isRift: boolean;
  /** Ce qui s'est passé, dans les mots du lieu. */
  verdict: string;
  slain: number;
  foes: number;
  heroKills: number;
  members: PartyReportMember[];
  totalXp: number;
  wages: number;
  journal: string[];
}

/** 📜 Le rapport d'un groupe, lisible après coup dans la boîte 📬. ⚠️ Tout vient du
 *  résultat STOCKÉ (`PartyResult`, tiré au départ), jamais d'un recalcul — même règle que
 *  `caravanReport`. ⚠️ Aucune ferraille : un camp n'en rend pas, le rapport n'en parle pas.
 *  Un aventurier renvoyé depuis garde sa ligne (son XP a bien été versée). */
export function partyReport(party: PartyResult, roster: readonly Adventurer[]): PartyReport {
  const hurt = new Set(party.hurt);
  const members = party.escort.map((id): PartyReportMember => {
    const adv = roster.find((a) => a.id === id);
    return {
      id,
      name: adv?.name ?? 'Champion parti',
      emoji: (adv && advTitle(adv)?.emoji) || '⚔️',
      xp: Math.max(0, Math.round(party.xp[id] ?? 0)),
      kills: Math.max(0, Math.round(party.kills[id] ?? 0)),
      hurt: hurt.has(id),
      gone: !adv,
      championId: adv?.championId ?? null,
    };
  });
  return {
    hero: party.hero,
    win: party.win,
    factionLabel: FACTION_LABEL[party.faction],
    factionEmoji: FACTION_EMOJI[party.faction],
    isRift: !!party.rift,
    verdict: party.rift
      ? party.win
        ? 'faille refermée'
        : 'la faille tient'
      : party.win
        ? 'camp pris'
        : 'repoussé',
    slain: party.slain,
    foes: party.foes,
    heroKills: party.heroKills,
    members,
    totalXp: members.reduce((s, m) => s + m.xp, 0),
    wages: Math.max(0, Math.round(party.wages)),
    journal: party.journal,
  };
}
