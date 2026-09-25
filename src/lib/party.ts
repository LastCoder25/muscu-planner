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
import { sinceEvent } from './sinceEvent';
import { supplyFx, supplyUselessWhy, SUPPLIES, type SupplyId, type SupplyTarget } from './supplies';
import {
  PARTY_TARGETS,
  isRiftPoi,
  isWarbandPoi,
  poiForceOf,
  buildMessage,
  depositMessages,
  poiTravelLevel,
  travelOneWayMin,
  type ActiveExpedition,
  type ExpeditionMessage,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { FACTION_EMOJI, FACTION_LABEL } from './raid';
import { advTitle, grantAdvXp, type Adventurer } from './adventurers';
/** Trajet ALLER d'un groupe (minutes) : le héros profite de toute la réduction de
 *  l'Avant-poste, les champions de la moitié (v0.1049, `championOutpostMult`) ; le groupe va au pas du plus LENT (sans rôle 🧭, c'est le héros). ⚠️ Tous les paramètres sont REQUIS, comme `caravanLegMin`. */
export function partyLegMin(
  poi: Poi,
  escort: Adventurer[],
  opts: { hero: boolean; travelMult: number; gearSpeed: number; supplies?: readonly SupplyId[] },
): number {
  // 🥖 Les rations : pour les champions, SOUS le plafond du rôle 🧭 (elles s'ajoutent à leur
  // vitesse) ; pour le héros, qui n'a pas de rôle, directement.
  const speed = supplyFx(opts.supplies).speed;
  const hero = opts.hero
    ? Math.round(travelOneWayMin(poiTravelLevel(poi), poi.distNorm) * opts.travelMult * (1 - speed))
    : 0;
  const advs = escort.length
    ? caravanLegMin(poi, escort, opts.gearSpeed + speed, opts.travelMult)
    : 0;
  return Math.max(1, hero, advs);
}

/** 🎒 Ce que ce voyage offre aux consommables (`supplyUselessWhy`). ⚠️ Vit ICI et non dans
 *  `supplies.ts` : il lit `poiForceOf`, et `expedition.ts` importe déjà `supplies.ts`. */
export function supplyTarget(poi: Poi, hero: boolean, escort: number): SupplyTarget {
  return {
    type: poi.type,
    fights: isRiftPoi(poi) || isWarbandPoi(poi) || !!poiForceOf(poi),
    hero,
    escort,
  };
}

/** Pourquoi on ne peut pas emporter ces consommables sur ce voyage — `null` s'ils servent
 *  tous. ⚠️ SOURCE UNIQUE de l'écran (tuile grisée et sa raison) et du store (refus). */
export function suppliesBlocker(ids: readonly SupplyId[], t: SupplyTarget): string | null {
  if (new Set(ids).size !== ids.length) return 'un consommable est choisi deux fois';
  for (const id of ids) {
    const why = supplyUselessWhy(id, t);
    if (why) return `${SUPPLIES[id].name} : ${why}`;
  }
  return null;
}

/**
 * 👥 LA TAILLE D'UNE ÉQUIPE N'EST PLUS BORNÉE QUE PAR LE PANTHÉON (v0.1038, décision de
 * l'utilisateur : « permettre aux expéditions de partir à plus que 3 pour abattre les events
 * plus haut niveau ; plus il y a de champions plus l'XP est divisée, c'est tout »). SOURCE DE
 * VÉRITÉ, override les « 3 places, le héros en prend 2 » de la v0.1020.
 *
 * ⚠️ Ce que le nombre coûte désormais : l'XP. Au-delà de 3 champions (le héros n'en prend pas),
 * le socle de la mission se partage (`missionXpSplit`, caravan.ts). Une équipe nombreuse
 * abat ce qu'une petite ne peut pas, mais chacun y apprend moins.
 * ⚠️ Mesuré avant (v0.979) : une faille mûre passe de 62-83 % à 3 membres à 99-100 % à 4 —
 * c'est voulu : sur une faille de son rang on en envoie 3, sur une faille plus haute plus.
 */
/** Le plafond de champions d'une équipe : celui du Panthéon (`engageCap`). ⚠️ Source unique —
 *  l'écran et le store l'appellent tous deux à travers `partySendBlocker`. */
export function partyCapFor(engage: number): number {
  return Math.max(0, Math.floor(engage));
}

/** Pourquoi une ÉQUIPE ne peut pas partir — `null` s'il le peut.
 *  ⚠️ Une équipe SANS le héros prend un CRÉNEAU de l'Avant-poste (`convoySlotsFree`, le même
 *  pool que les convois d'avant) : c'est ce qui borne le NOMBRE d'équipes en parallèle, donc
 *  l'or et les pierres par jour. L'équipe du héros n'en prend pas : il est sa propre limite.
 *  SOURCE UNIQUE : le store refuse avec cette règle, l'écran dit pourquoi. */
export type PartySendBlock = 'notTarget' | 'empty' | 'slots' | 'tooMany' | 'hopeless';
export function partySendBlocker(
  poi: Poi,
  escortCount: number,
  hero: boolean,
  slotsFree: number,
  cap: number,
  /** 🎯 Chance de revenir vainqueur (`partyWinChance`), `null` quand il n'y a RIEN à
   *  combattre (récolte sans gardes) ou rien à simuler. ⚠️ REQUIS : un paramètre qu'on peut
   *  oublier finit par l'être, et l'omettre rouvrirait en silence le départ perdu d'avance.
   *  ⚠️ `null` ne vaut PAS zéro — le confondre interdirait la récolte. */
  winChance: number | null,
): PartySendBlock | null {
  if (!PARTY_TARGETS.has(poi.type)) return 'notTarget';
  if (!hero && escortCount <= 0) return 'empty';
  if (!hero && slotsFree <= 0) return 'slots';
  // 🗿 LE PLAFOND DU PANTHÉON (`engageCap`) : on n'engage que N champions à la fois.
  if (escortCount > partyCapFor(cap)) return 'tooMany';
  // 💀 PERDU D'AVANCE (demandé par l'utilisateur) : aucune victoire sur tout l'échantillon
  // de pronostic. ⚠️ Le seuil est le ZÉRO STRICT, et c'est délibéré — la mesure rejoue le
  // VRAI combat, donc « 0 sur 40 » veut dire qu'aucune graine n'a jamais vu ce groupe
  // revenir. Y mettre un plancher (« moins de 5 % ») interdirait des paris que le joueur a
  // le droit de prendre ; ici il n'y a pas de pari, seulement une certitude.
  if (winChance !== null && winChance <= 0) return 'hopeless';
  return null;
}
export const PARTY_SEND_BLOCK_LABEL: Record<PartySendBlock, string> = {
  hopeless: 'perdu d’avance — aucun d’eux n’en reviendrait vainqueur',
  notTarget: 'on n’envoie pas d’équipe sur ce lieu',
  empty: 'l’équipe est vide',
  slots: 'tous les créneaux d’équipe de l’Avant-poste sont pris',
  tooMany: 'trop de champions pour ton Panthéon',
};
export function canSendParty(
  poi: Poi,
  escortCount: number,
  hero: boolean,
  slotsFree: number,
  cap: number,
  winChance: number | null,
): boolean {
  return partySendBlocker(poi, escortCount, hero, slotsFree, cap, winChance) === null;
}

/** Pourquoi le HÉROS ne peut pas rejoindre le groupe — `null` s'il le peut.
 *  ⚠️ SOURCE UNIQUE : le store (`sendParty`) refuse avec la MÊME règle, l'écran dit POURQUOI
 *  le héros est grisé au lieu de le cacher. Ordre : déjà parti, à l'infirmerie, sans
 *  Avant-poste. ⚠️ Plus de péage d'or (v0.1069, décision de l'utilisateur) : envoyer le
 *  héros ne coûte plus rien, en groupe comme seul. */
export type PartyHeroBlock = 'expedition' | 'infirmary' | 'outpost';
export function partyHeroBlocker(ctx: {
  onExpedition: boolean;
  healMs: number;
  outpost: boolean;
}): PartyHeroBlock | null {
  if (ctx.onExpedition) return 'expedition';
  if (ctx.healMs > 0) return 'infirmary';
  if (!ctx.outpost) return 'outpost';
  return null;
}
export const PARTY_HERO_BLOCK_LABEL: Record<PartyHeroBlock, string> = {
  expedition: '🧭 déjà en expédition',
  infirmary: '🤕 à l’infirmerie',
  outpost: '🧭 Avant-poste requis',
};

/** Ce que `startParty` a besoin de savoir d'un envoi, quelle que soit la cible. Les entrées
 *  de `resolveCamp` et de `resolveIncursion` le satisfont toutes les deux. */
export interface PartyVoyage {
  poi: Poi;
  hero: PartyHero | null;
  seed: number;
}

/** Construit le voyage d'un groupe. ⚠️ AUCUN coût d'envoi (v0.1069), et aucun salaire :
 *  les champions ne sont pas payés.
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
    goldCost: 0,
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
 * 🎓 L'XP DES CHAMPIONS TOMBE À L'ARRIVÉE DU RAPPORT (demandé par l'utilisateur : « voir
 * l'animation de l'évolution quand le rapport arrive, et plus sur la récompense, qui n'est
 * pas sur tous les events »). Verse `party.xp` des rapports FRAIS (`fresh`) et les marque
 * `xpGranted` dans la boîte — la MÊME écriture, sinon l'encaissement la reverserait.
 * - un rapport déjà marqué, ou sans groupe, ne verse rien ;
 * - rend les MÊMES références quand il n'y a rien à faire (le store n'écrit pas à vide) ;
 * - `granted` : les messages effectivement crédités, pour l'animation.
 * ⚠️ Les blessures restent à l'ENCAISSEMENT (`partyClaimRoster`).
 */
export function grantReportXp(
  box: ExpeditionMessage[],
  fresh: readonly ExpeditionMessage[],
  roster: Adventurer[],
  pantheonLevel: number,
): { messages: ExpeditionMessage[]; adventurers: Adventurer[]; granted: ExpeditionMessage[] } {
  const ids = new Set(box.map((m) => m.id));
  const granted = fresh.filter((m) => m.party && !m.xpGranted && ids.has(m.id));
  if (!granted.length) return { messages: box, adventurers: roster, granted };
  let adventurers = roster;
  for (const m of granted) {
    const xp = m.party!.xp;
    adventurers = adventurers.map((a) => {
      const gain = xp[a.id];
      return gain === undefined ? a : grantAdvXp(a, gain, pantheonLevel);
    });
  }
  const done = new Set(granted.map((m) => m.id));
  const messages = box.map((m) => (done.has(m.id) ? { ...m, xpGranted: true } : m));
  return { messages, adventurers, granted };
}

/**
 * 🎁 Ce que l'ENCAISSEMENT d'un rapport de groupe change au vivier — PUR.
 * - XP par aventurier (`party.xp`, calculée au départ), plafonnée par la Guilde (`grantAdvXp`)
 *   — ⚠️ SEULEMENT si elle n'a pas déjà été versée à l'arrivée du rapport (`xpGranted`) ;
 * - 🤕 les blessés du camp (`party.hurt`) partent à l'infirmerie pour la durée d'un convoi
 *   (`caravanHurtMs`, soigneurs de l'escorte et Infirmerie compris). ⚠️ Jamais RACCOURCIE :
 *   un aventurier déjà alité plus longtemps (siège perdu) garde son échéance ;
 * - `escort` : les membres encore dans le vivier (un renvoyé n'a plus rien à recevoir).
 * ⚠️ Le HÉROS n'y figure jamais : ni XP (elle vient du sport), ni blessure.
 */
export function partyClaimRoster(
  party: PartyResult,
  roster: readonly Adventurer[],
  /** ⚠️ `backAt` est REQUIS : c'est le RETOUR du groupe en ville, l'instant d'où court la
   *  convalescence. `now` ne sert qu'à écarter celle qui est déjà écoulée. Optionnel, il
   *  serait oublié au premier appelant — et c'est exactement le défaut qu'on corrige. */
  ctx: {
    pantheonLevel: number;
    infirmaryLevel: number;
    backAt: number;
    now: number;
    /** ⚠️ REQUIS : l'XP a-t-elle déjà été versée à l'arrivée (`grantReportXp`) ? L'oublier
     *  la verserait deux fois. */
    xpGranted: boolean;
  },
): { adventurers: Adventurer[]; escort: Adventurer[] } {
  const escort = party.escort
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is Adventurer => !!a);
  // ⏱️ DEPUIS LE RETOUR DU GROUPE, pas depuis le clic « Encaisser » — même règle que les
  // convois et que le siège. `null` = déjà écoulée, personne ne part à l'infirmerie.
  // 🩹 La trousse de soins emportée divise la convalescence (`healMult`, posé au départ).
  const hurtUntil = sinceEvent(
    ctx.backAt,
    caravanHurtMs(escort, ctx.infirmaryLevel) * (party.healMult ?? 1),
    ctx.now,
  );
  const hurt = new Set(party.hurt);
  const adventurers = roster.map((a) => {
    const gain = party.xp[a.id];
    if (gain === undefined) return a;
    const up = ctx.xpGranted ? a : grantAdvXp(a, gain, ctx.pantheonLevel);
    return hurtUntil && hurt.has(a.id)
      ? { ...up, hurtUntil: Math.max(up.hurtUntil ?? 0, hurtUntil) }
      : up;
  });
  return { adventurers, escort };
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
    journal: party.journal,
  };
}
