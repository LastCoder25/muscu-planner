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
import { LIGHT_HURT } from './skirmish';
import { supplyFx, supplyUselessWhy, SUPPLIES, type SupplyId, type SupplyTarget } from './supplies';
import {
  PARTY_TARGETS,
  HARVEST_TYPES,
  isRiftPoi,
  isWarbandPoi,
  poiForceOf,
  VEIN_MAX_CHAMPIONS,
  dwellMsFor,
  buildMessage,
  depositMessages,
  poiTravelLevel,
  travelOneWayMin,
  travelPosition,
  EXPE,
  type ActiveExpedition,
  type ExpeditionMessage,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
  poiLabel,
  warbandAt,
  citadelRestingUntil,
  RAZE_KINDS,
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

/**
 * ⚔️ LE POINT DE RENCONTRE d'une interception. Une bande en marche AVANCE vers la ville
 * pendant que le groupe marche vers elle : on ne va pas là où on l'a vue, on va là où on
 * la CROISERA. C'est le plus petit temps `τ` (minutes) tel que le trajet jusqu'à la
 * position qu'elle aura à `now + τ` tienne en `τ` — les deux colonnes y arrivent ensemble.
 *
 * - `legOf` est la règle de trajet du voyage (`partyLegMin` et ses rôles, rations,
 *   Avant-poste) : on ne la recopie pas, on la rejoue sur la position future.
 * - Recherche dichotomique : le trajet ne fait que RACCOURCIR à mesure que la bande
 *   approche, donc « on l'a rejointe » ne se dément plus une fois vrai.
 * - Si elle atteint la ville avant qu'on la rejoigne, la rencontre a lieu au pied des murs.
 * - Tout autre lieu est immobile : son trajet est inchangé.
 *
 * ⚠️ Le lieu rendu est la bande À LA RENCONTRE (même id, même faction, même force, `from`
 * gardé) : c'est là que le groupe se rend et d'où il revient — le retour vaut l'aller.
 */
export function interceptLeg(
  poi: Poi,
  now: number,
  legOf: (p: Poi) => number,
): { poi: Poi; legMin: number } {
  if (poi.type !== 'warband' || !poi.from) return { poi, legMin: legOf(poi) };
  const at = (min: number) => warbandAt(poi, now + min * 60_000);
  const joined = (min: number) => legOf(at(min)) <= min;
  const end = Math.max(1, Math.ceil((poi.expiresAt - now) / 60_000));
  if (!joined(end)) {
    const walls = at(end);
    return { poi: walls, legMin: legOf(walls) };
  }
  let lo = 1;
  let hi = end;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (joined(mid)) hi = mid;
    else lo = mid + 1;
  }
  return { poi: at(lo), legMin: lo };
}

/**
 * ⚔️🧭 LE POINT DE RENCONTRE D'UNE ATTAQUE COMBINÉE sur une armée en marche : la PREMIÈRE
 * minute où TOUS les groupes peuvent être là où elle sera (chacun à son pas, depuis chez
 * lui). Chacun partira à « rencontre − son trajet » (`planWings`). Sur un lieu fixe, c'est le
 * plus long trajet, comme avant. `joined` faux : l'armée arrive avant qu'ils puissent tous la
 * rejoindre — la rencontre se ferait sous les murs, à l'arrivée.
 * ⚠️ Balayage minute par minute plutôt qu'une dichotomie : une armée qui marche sur la ville
 * peut s'ÉLOIGNER d'un point fixe, donc « tous sont là » n'est pas monotone dans le temps.
 */
export function meetAll(
  poi: Poi,
  now: number,
  legOfs: readonly ((p: Poi) => number)[],
): { poi: Poi; min: number; joined: boolean } {
  if (poi.type !== 'warband' || !poi.from)
    return { poi, min: Math.max(1, ...legOfs.map((f) => f(poi))), joined: true };
  const end = Math.max(1, Math.ceil((poi.expiresAt - now) / 60_000));
  for (let m = 1; m <= end; m++) {
    const at = warbandAt(poi, now + m * 60_000);
    if (legOfs.every((f) => f(at) <= m)) return { poi: at, min: m, joined: true };
  }
  const walls = warbandAt(poi, now + end * 60_000);
  return { poi: walls, min: Math.max(end, ...legOfs.map((f) => f(walls))), joined: false };
}

/**
 * ⚔️⏱️ TROP TARD POUR L'INTERCEPTER : une armée en marche (bande sortie d'une faille OU armée
 * de campagne) qui atteindra sa cible avant que l'équipe la rejoigne. Le choc tomberait
 * après l'attaque — il ne changerait rien, donc on ne part pas. `legMin` est l'aller rendu
 * par `interceptLeg` (ou la minute commune de `meetAll`) : quand la rencontre n'a pas lieu,
 * il vaut déjà le trajet jusqu'aux murs, donc au-delà de l'arrivée de l'armée.
 * ⚠️ SOURCE UNIQUE : l'écran (bouton grisé et sa raison) et le store (refus) la lisent.
 */
export function interceptTooLate(
  poi: Pick<Poi, 'type' | 'expiresAt'>,
  now: number,
  legMin: number,
): boolean {
  return isWarbandPoi(poi) && now + legMin * 60_000 >= poi.expiresAt;
}

/** 🎒 Ce que ce voyage offre aux consommables (`supplyUselessWhy`). ⚠️ Vit ICI et non dans
 *  `supplies.ts` : il lit `poiForceOf`, et `expedition.ts` importe déjà `supplies.ts`. */
export function supplyTarget(poi: Poi, hero: boolean, escort: number): SupplyTarget {
  return {
    type: poi.type,
    fights: isRiftPoi(poi) || isWarbandPoi(poi) || !!poiForceOf(poi),
    harvest: HARVEST_TYPES.has(poi.type),
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
export function partyCapFor(
  engage: number,
  /** Le lieu visé : un filon plafonne à `VEIN_MAX_CHAMPIONS`. */
  poi?: Pick<Poi, 'type'> | null,
): number {
  // 🐺 Une tanière : AUCUN plafond (2026-10-01, décision de l'utilisateur : « c'est un monstre
  // qui donne de l'XP et qui peut être attaqué en surnombre »). Ni le Panthéon ni la taille du
  // groupe ne la bornent ; la bête garde sa force (`CAMP_SIZES.den`), c'est le partage d'XP
  // (`missionXpSplit`) qui fait payer le surnombre.
  if (poi?.type === 'den') return Number.POSITIVE_INFINITY;
  const panth = Math.max(0, Math.floor(engage));
  // 💎 Un filon : 3 champions au plus (le héros n'y va pas, cf. `partyHeroBlocker`).
  if (poi?.type === 'vein') return Math.min(panth, VEIN_MAX_CHAMPIONS);
  return panth;
}

/** ⚔️ UNE CIBLE QU'ON PEUT AFFAIBLIR sans la battre : une armée en marche — celle d'un siège
 *  ou d'une reprise (`fieldCut`/`retakeCut`) comme la bande d'une faille
 *  (`RiftOverflow.cut`). Ses pertes sont GARDÉES, donc l'attaquer à 0 % a encore un sens.
 *  ⚠️ Une faille (incursion), un camp, un lieu gardé ne gardent rien d'un échec. */
export function canWeaken(poi: Pick<Poi, 'type'>): boolean {
  return poi.type === 'warband';
}

/** Pourquoi une ÉQUIPE ne peut pas partir — `null` s'il le peut.
 *  🧭 Plus de créneaux d'Avant-poste (limite retirée, demandé) : le NOMBRE d'équipes en
 *  parallèle n'est borné que par le vivier disponible. SOURCE UNIQUE : le store refuse avec cette règle, l'écran dit pourquoi. */
export type PartySendBlock =
  | 'notTarget'
  | 'tooLate'
  | 'empty'
  | 'tooMany'
  | 'hopeless'
  | 'controlEmpty'
  | 'controlHeld'
  | 'citadelHidden'
  | 'citadelResting'
  | 'fortressLocked'
  | 'objectiveLocked'
  | 'veinHero'
  | 'veinFull';
export function partySendBlocker(
  poi: Poi,
  escortCount: number,
  hero: boolean,
  cap: number,
  /** 🎯 Chance de revenir vainqueur (`partyWinChance`, gardes seuls), `null` quand il n'y a
   *  RIEN à combattre ou rien à simuler. ⚠️ REQUIS : un paramètre qu'on peut oublier finit
   *  par l'être, et l'omettre rouvrirait en silence le départ perdu d'avance.
   *  ⚠️ `null` ne vaut PAS zéro — le confondre interdirait la récolte. */
  winChance: number | null,
  /** 🏯 L'instant du départ : une citadelle abattue est inattaquable pendant sa trêve.
   *  ⚠️ REQUIS, comme `winChance`. */
  now: number,
): PartySendBlock | null {
  if (!PARTY_TARGETS.has(poi.type)) return 'notTarget';
  // 🏰 Un point de contrôle s'attaque avec AUTANT de champions qu'on veut, héros compris
  // (v0.1239, demandé par l'utilisateur) : on choisit ensuite qui y RESTE (1 à 3, le héros
  // jamais — il rentre). Il faut donc au moins un champion pour l'occuper.
  if (poi.type === 'control') {
    // ⚔️ Une équipe qui y marche déjà ne bloque plus : on peut l'attaquer plusieurs fois à la
    // fois, la première qui le prend l'emporte (`supersedeLate`).
    if (poi.control?.owner !== 'enemy') return 'controlHeld';
    // 🏯 Cachée dans le brouillard : on ne l'atteint pas avant que l'Avant-poste la découvre.
    if (poi.control.kind === 'citadel' && poi.control.discoveredAt === undefined)
      return 'citadelHidden';
    // 🏯 Abattue : elle se reconstruit pendant sa trêve, on ne l'attaque pas.
    if (citadelRestingUntil(poi, now) > 0) return 'citadelResting';
    // 🏝️ La forteresse portuaire ne s'attaque qu'après assez d'objectifs abattus (le verrou).
    if (poi.control.kind === 'fortress' && poi.control.locked) return 'fortressLocked';
    // 🏝️ Les objectifs, eux, attendent que les deux avant-postes soient tenus.
    if (poi.control.kind === 'objective' && poi.control.locked) return 'objectiveLocked';
    // 🏯🏝️ Ce qu'on abat ne se tient pas : le héros seul peut l'attaquer. 🧝 Un point ordinaire
    // se tient par au moins un champion OU le héros, qui y reste alors (étape 6 bis).
    if (escortCount <= 0 && !hero && !RAZE_KINDS.has(poi.control.kind)) return 'controlEmpty';
  }
  // 💎 Un filon : 1 à 3 CHAMPIONS, jamais le héros (décision de l'utilisateur).
  if (poi.type === 'vein') {
    if (hero) return 'veinHero';
    if (escortCount > VEIN_MAX_CHAMPIONS) return 'veinFull';
  }
  if (!hero && escortCount <= 0) return 'empty';
  // 🗿 LE PLAFOND DU PANTHÉON (`engageCap`) : on n'engage que N champions à la fois.
  if (escortCount > partyCapFor(cap, poi)) return 'tooMany';
  // 💀 PERDU D'AVANCE (rétabli en v0.1375, demandé par l'utilisateur) : aucune victoire sur
  // tout l'échantillon de pronostic. ⚠️ SAUF contre une ARMÉE EN MARCHE (`canWeaken`) : là,
  // un échec ampute durablement l'armée — c'est la raison d'y aller, même à 0 %. Partout
  // ailleurs un départ condamné ne change rien au monde, et ne paie plus que ce qu'il a
  // entamé (`missionXpFor`, `dealt`).
  if (winChance !== null && winChance <= 0 && !canWeaken(poi)) return 'hopeless';
  return null;
}
/** 🧝 Le héros peut-il RESTER en garnison sur ce lieu s'il est pris ? Tout point fixe qui se
 *  tient (la forteresse comprise), jamais ce qu'on abat (citadelle, objectif). */
export function heroCanStay(poi: Pick<Poi, 'type' | 'control'> | null | undefined): boolean {
  const c = poi?.type === 'control' ? poi.control : undefined;
  return !!c && c.owner === 'enemy' && (c.kind === 'fortress' || !RAZE_KINDS.has(c.kind));
}

/** 🧝 Le héros reste-t-il ? À la forteresse toujours (elle le garde pour la traversée) ; seul,
 *  sans champion, toujours (il faut quelqu'un pour tenir) ; sinon, selon le choix à l'envoi. */
export function heroStaysAt(
  poi: Pick<Poi, 'type' | 'control'> | null | undefined,
  escortCount: number,
  chosen: boolean,
): boolean {
  if (!heroCanStay(poi)) return false;
  return poi!.control!.kind === 'fortress' || escortCount <= 0 || chosen;
}

export const PARTY_SEND_BLOCK_LABEL: Record<PartySendBlock, string> = {
  hopeless: 'perdu d’avance — aucun d’eux n’en reviendrait vainqueur',
  tooLate: 'trop tard — l’armée atteindra sa cible avant ton équipe',
  notTarget: 'on n’envoie pas d’équipe sur ce lieu',
  empty: 'l’équipe est vide',
  tooMany: 'trop de champions pour ton Panthéon',
  controlEmpty: 'il faut au moins un champion ou le héros pour occuper le point',
  citadelHidden:
    'cette citadelle est encore cachée — agrandis ta carte (Avant-poste) pour l’atteindre',
  citadelResting: 'cette citadelle vient d’être abattue — elle se reconstruit pendant sa trêve',
  fortressLocked: 'la forteresse est verrouillée — abats d’abord les objectifs de l’île',
  objectiveLocked:
    'prends d’abord les deux avant-postes de l’île (Tour de guet, Camp d’entraînement)',
  controlHeld: 'ce point n’est pas à prendre : il est déjà à toi',
  veinHero: 'un filon s’extrait par les champions seuls — le héros n’y va pas',
  veinFull: 'un filon n’accueille que 3 champions',
};
export function canSendParty(
  poi: Poi,
  escortCount: number,
  hero: boolean,
  cap: number,
  winChance: number | null,
  now: number,
): boolean {
  return partySendBlocker(poi, escortCount, hero, cap, winChance, now) === null;
}

/** Pourquoi le HÉROS ne peut pas rejoindre le groupe — `null` s'il le peut.
 *  ⚠️ SOURCE UNIQUE : le store (`sendParty`) refuse avec la MÊME règle, l'écran dit POURQUOI
 *  le héros est grisé au lieu de le cacher. Ordre : déjà parti, à l'infirmerie, sans
 *  Avant-poste. ⚠️ Plus de péage d'or (v0.1069, décision de l'utilisateur) : envoyer le
 *  héros ne coûte plus rien, en groupe comme seul. */
export type PartyHeroBlock = 'expedition' | 'infirmary' | 'outpost' | 'vein';
export function partyHeroBlocker(ctx: {
  onExpedition: boolean;
  healMs: number;
  outpost: boolean;
  /** Le lieu visé. ⚠️ REQUIS : un filon s'extrait par les CHAMPIONS seuls (décision de
   *  l'utilisateur), et l'oublier y laisserait partir le héros. */
  poi: Pick<Poi, 'type'> | null;
}): PartyHeroBlock | null {
  if (ctx.poi?.type === 'vein') return 'vein';
  if (ctx.onExpedition) return 'expedition';
  if (ctx.healMs > 0) return 'infirmary';
  if (!ctx.outpost) return 'outpost';
  return null;
}
export const PARTY_HERO_BLOCK_LABEL: Record<PartyHeroBlock, string> = {
  expedition: '🧭 déjà en expédition',
  infirmary: '🤕 à l’infirmerie',
  outpost: '🧭 Avant-poste requis',
  vein: '💎 un filon s’extrait par les champions seuls',
};

/** Ce que `startParty` a besoin de savoir d'un envoi, quelle que soit la cible. Les entrées
 *  de `resolveCamp` et de `resolveIncursion` le satisfont toutes les deux. */
export interface PartyVoyage {
  poi: Poi;
  hero: PartyHero | null;
  seed: number;
  /** Combien de CHAMPIONS partent (héros non compris) : un filon s'extrait d'autant plus
   *  vite qu'ils sont nombreux (`dwellMsFor`). ⚠️ REQUIS : oublié, un filon prendrait 6 h
   *  quelle que soit l'équipe. */
  champions: number;
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
  const f = outcome.turnBack;
  // 🔙 Demi-tour : l'aller s'arrête en chemin, le retour dure autant que le chemin fait.
  const leg = Math.max(1, Math.round(legMin)) * 60_000 * (f ?? 1);
  // 🔍 La fouille d'un héros tombé : on reste sur place, le rapport tombe à la fin.
  const dwell = f === undefined ? dwellMsFor(input.poi, input.champions) : 0;
  return {
    poi: input.poi,
    sentAt: now,
    midAt: now + leg + dwell,
    returnAt: now + 2 * leg + dwell,
    ...(dwell ? { dwellMs: dwell } : {}),
    ...(f !== undefined ? { turnBack: f } : {}),
    goldCost: 0,
    seed: input.seed >>> 0 || 1,
    outcome,
  };
}

/** 🏰 Qui RESTE en garnison si l'assaut prend le point : les choisis (sinon l'escorte),
 *  coupés aux places — la MÊME règle que le rapport (`stay`) et `captureControl`. */
export function assaultStayers(
  escortIds: readonly string[],
  stayIds: readonly string[] | undefined,
  seats: number,
): string[] {
  const picked = stayIds?.filter((id) => escortIds.includes(id)) ?? [];
  return (picked.length ? picked : [...escortIds]).slice(0, Math.max(0, seats));
}

/** Les champions d'UN voyage : son groupe (`crew`) pour un groupe d'attaque combinée, sinon
 *  l'escorte du rapport. ⚠️ Le rapport d'une attaque combinée est PARTAGÉ par tous ses groupes :
 *  lire son escorte ferait montrer (et rentrer) tout le monde sur chaque tuile. */
export function tripCrew(v: Pick<ActiveExpedition, 'crew' | 'outcome'>): string[] {
  return v.crew ?? v.outcome.party?.escort ?? [];
}

/** 🦸 Le héros voyage-t-il avec CE groupe ? ⚠️ Signalé : « deux retours d'attaque combinée,
 *  le héros dans les deux ». Le rapport d'une attaque combinée est partagé : il dit que le
 *  héros a combattu, pas avec QUEL groupe il rentre. Le groupe du héros vit dans
 *  `expedition` ; un groupe d'attaque combinée (`crew`) ou son compagnon (`wingOf`) rangé
 *  dans `parties` ne le porte donc jamais. */
export function partyCarriesHero(
  v: Pick<ActiveExpedition, 'crew' | 'wingOf' | 'outcome'>,
): boolean {
  return !v.crew && !v.wingOf && !!v.outcome.party?.hero;
}

/** 🏰 Un assaut de point fixe GAGNÉ : le retour passe à celui de ceux qui rentrent
 *  (`returnLegs.won`, 0 = personne). Rend la MÊME référence sinon (perdu, ou pas un assaut). */
export function shortenWonReturn<T extends ActiveExpedition>(v: T): T {
  if (!v.returnLegs || !v.outcome.win) return v;
  const returnAt = v.midAt + Math.max(0, Math.round(v.returnLegs.won)) * 60_000;
  return returnAt < v.returnAt ? { ...v, returnAt } : v;
}

/** Les champions encore en route du voyage (retour prévu à `oldAt`) rentrent désormais à
 *  `newAt`. Ceux déjà postés (`busyUntil` 0) ne bougent pas. Même référence si rien. */
export function rescheduleReturners(
  advs: Adventurer[],
  ids: readonly string[],
  oldAt: number,
  newAt: number,
): Adventurer[] {
  if (oldAt === newAt) return advs;
  const set = new Set(ids);
  let changed = false;
  const out = advs.map((a) => {
    if (!set.has(a.id) || a.busyUntil !== oldAt) return a;
    changed = true;
    return { ...a, busyUntil: newAt };
  });
  return changed ? out : advs;
}

/**
 * 🔙 LE DEMI-TOUR DEMANDÉ (2026-09-29, demandé : « faire faire demi-tour à une troupe à nous
 * en cliquant dessus »). Une équipe encore en route vers son lieu rebrousse chemin : elle
 * revient par le même chemin, en autant de temps qu'elle en a mis pour arriver là.
 *
 * ⚠️ RIEN N'EST GAGNÉ NI PERDU : l'issue a été tirée au départ, mais le lieu n'est jamais
 * atteint — aucun rapport (`reported` posé d'office, donc ni XP, ni butin, ni blessé), et les
 * blessures de l'issue sont effacées pour que le retour d'une sortie ne renvoie personne à
 * la base (`splitSorties`, `sortiesHome`).
 *
 * Refusé (`recallBlocker`) :
 * - `arrived` : l'équipe est sur place (ou le rapport est tombé) — trop tard ;
 * - `turned` : elle rebrousse déjà chemin (embuscade perdue à l'aller, ou déjà rappelée) ;
 * - `combined` : un groupe d'une attaque combinée — les autres groupes marchent au même
 *   rendez-vous, le rappeler seul changerait l'issue commune tirée au départ.
 */
export type RecallBlock = 'arrived' | 'turned' | 'combined';

/** 🔙 Ce qu'on peut faire rebrousser chemin sur la carte : le voyage du héros, une équipe,
 *  ou des renforts en route vers un point fixe (`recallReinforcements`). */
export type RecallTarget =
  | { kind: 'hero' }
  | { kind: 'party'; id: string }
  | { kind: 'reinf'; pointId: string; ids: readonly string[] }
  /** 🏠🔙 Un retour vers la base d'un point fixe qui y retourne (`recallReturns`). */
  | { kind: 'return'; pointId: string; ids: readonly string[] };

export const RECALL_BLOCK_LABEL: Record<RecallBlock, string> = {
  arrived: 'elle est déjà arrivée',
  turned: 'elle rebrousse déjà chemin',
  combined: 'elle fait partie d’une attaque combinée',
};

type Recallable = Pick<
  ActiveExpedition,
  'sentAt' | 'midAt' | 'dwellMs' | 'reported' | 'turnBack' | 'wingOf' | 'crew' | 'recalled'
>;

/**
 * ⚠️ UN DEMI-TOUR FORCÉ N'EST PAS ENCORE ARRIVÉ (signalé : « j'ai envoyé une équipe mais je
 * n'ai pas le demi-tour possible »). Une embuscade perdue à l'aller est tirée au DÉPART
 * (`turnBack`, `midAt` = l'instant où elle frappe) : tant qu'on n'y est pas, l'équipe marche
 * encore vers le lieu et peut rebrousser chemin — la refuser trahissait l'issue.
 */
export function recallBlocker(v: Recallable, now: number): RecallBlock | null {
  if (v.wingOf || v.crew) return 'combined';
  if (v.recalled) return 'turned';
  if (v.reported || now >= v.midAt - Math.max(0, v.dwellMs ?? 0))
    return v.turnBack !== undefined ? 'turned' : 'arrived';
  return null;
}

/** 🔙 Le voyage tel que le JOUEUR le voit : un demi-tour forcé à venir est gommé (arrivée au
 *  lieu, retour complet), sans quoi l'écran de demi-tour annoncerait l'embuscade. */
export function recallWindow(v: Recallable & { returnAt: number }): {
  sentAt: number;
  arriveAt: number;
  returnAt: number;
} {
  const tb = v.turnBack ?? 1;
  const arrive = v.midAt - Math.max(0, v.dwellMs ?? 0);
  return {
    sentAt: v.sentAt,
    arriveAt: v.sentAt + (arrive - v.sentAt) / tb,
    returnAt: v.sentAt + (v.returnAt - v.sentAt) / tb,
  };
}

/** Le voyage rappelé à `now`, ou `null` s'il ne peut pas l'être. ⚠️ Le retour dure le
 *  chemin déjà fait (un départ différé compte à partir de `sentAt`). */
export function recallVoyage<T extends ActiveExpedition>(v: T, now: number): T | null {
  if (recallBlocker(v, now)) return null;
  const arriveAt = v.midAt - Math.max(0, v.dwellMs ?? 0);
  const done = Math.max(0, now - v.sentAt);
  // Un demi-tour forcé à venir raccourcissait déjà l'aller : la part faite se rapporte au
  // chemin COMPLET, pour que le tracé parte bien de là où l'équipe se trouve.
  const f = Math.min(1, done / Math.max(1, arriveAt - v.sentAt)) * (v.turnBack ?? 1);
  const party = v.outcome.party;
  const out = {
    ...v,
    midAt: now,
    returnAt: now + done,
    turnBack: f,
    reported: true,
    recalled: true,
    baseSplit: true,
    outcome: party ? { ...v.outcome, party: { ...party, hurt: [], lightHurt: [] } } : v.outcome,
  };
  delete out.dwellMs;
  delete out.returnLegs;
  return out;
}

/**
 * 🏥 QUI RENTRE À LA BASE au lieu de reprendre son poste (2026-09-29, décision de
 * l'utilisateur : « rapatrier les blessés à la base quel que soit le point de départ »).
 * Sur une SORTIE d'un point fixe (`homeId`, attaque combinée comprise) : les BLESSÉS
 * (`hurt` et `lightHurt`) — et TOUT LE MONDE si le point n'est plus à nous (on ne marche
 * pas vers un lieu perdu). `members` = ceux de CE voyage (le store les connaît par leur
 * `busyUntil`). Un voyage parti de la base rentre déjà à la base : rien à faire.
 */
export function baseWalkers(
  p: Pick<ActiveExpedition, 'homeId' | 'outcome'>,
  members: readonly string[],
  homeHeld: boolean,
): string[] {
  if (!p.homeId || !members.length) return [];
  if (!homeHeld) return [...members];
  const party = p.outcome.party;
  const sick = new Set([...(party?.hurt ?? []), ...(party?.lightHurt ?? [])]);
  return members.filter((id) => sick.has(id));
}

/**
 * 🏥 Le trajet DIRECT vers la base de ceux qui quittent un voyage à `at` : il part de là où
 * ils sont (le lieu de mission à l'arrivée, ou le chemin du retour si leur point tombe en
 * route) et va à la ville. Sa durée = `legMs` (le trajet lieu → ville à leur pas) au
 * prorata de la distance qui reste. ⚠️ C'est un voyage de RETOUR pur (`sentAt` = `midAt`
 * = `at`) : il ne dépose aucun rapport (`wingOf`) et ne porte
 * aucun butin — le rapport du groupe l'a déjà.
 */
export function walkToBase(
  p: ActiveParty,
  ids: readonly string[],
  at: number,
  legMs: number,
): ActiveParty {
  const town = EXPE.town;
  const from = at <= p.midAt ? { x: p.poi.x, y: p.poi.y } : travelPosition(p, at);
  const full = Math.hypot(p.poi.x - town.x, p.poi.y - town.y);
  const left = Math.hypot(from.x - town.x, from.y - town.y);
  const share = full > 0 ? Math.min(1, left / full) : 1;
  const party = p.outcome.party;
  return {
    id: `${p.id}~base@${at}`,
    poi: { ...p.poi, x: from.x, y: from.y },
    sentAt: at,
    midAt: at,
    returnAt: at + Math.max(60_000, Math.round(legMs * share)),
    goldCost: 0,
    seed: p.seed,
    reported: true,
    baseSplit: true,
    wingOf: p.id,
    outcome: {
      ...p.outcome,
      gold: 0,
      energy: 0,
      summonStones: 0,
      mana: 0,
      key: 0,
      item: null,
      items: [],
      supplies: undefined,
      seals: undefined,
      runes: undefined,
      ...(party ? { party: { ...party, escort: [...ids] } } : {}),
    },
  };
}

/** 🏥 Le voyage d'origine, SANS ceux partis à la base : ils ne sont plus dessinés avec lui,
 *  ni comptés dehors jusqu'à son retour. `null` si PERSONNE de ce voyage ne reste
 *  (`remaining` : ses membres qui reprennent leur poste — ⚠️ l'escorte d'un groupe d'attaque
 *  combinée liste TOUS les groupes, on ne peut pas le lire sur elle). */
export function withoutWalkers(
  p: ActiveParty,
  ids: readonly string[],
  remaining: number,
): ActiveParty | null {
  if (remaining <= 0) return null;
  const party = p.outcome.party;
  const out = new Set(ids);
  const escort = (party?.escort ?? []).filter((id) => !out.has(id));
  return {
    ...p,
    baseSplit: true,
    ...(party ? { outcome: { ...p.outcome, party: { ...party, escort } } } : {}),
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
    // ⚔️🧭 Un compagnon d'attaque combinée ne rapporte rien : le groupe principal le fait.
    if (now >= p.midAt && !p.reported && !p.wingOf) {
      const msg = buildMessage(p);
      // ⚠️ `depositMessages` : jamais un doublon, jamais un encaissement dégradé.
      const next = depositMessages(box, [msg], cap);
      if (next !== box) {
        box = next;
        fresh.push(msg);
      }
      // 🏰 Assaut pris : ceux qui ne restent pas rentrent à leur propre pas.
      q = shortenWonReturn({ ...p, reported: true });
      changed = true;
    }
    // ⚔️🧭 Un groupe-compagnon d'attaque combinée ne rapporte rien, mais il arrive lui aussi :
    // point pris, SES membres qui ne restent pas rentrent à leur pas (0 → plus personne).
    if (now >= p.midAt && !p.reported && p.wingOf) {
      q = shortenWonReturn({ ...p, reported: true });
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
  const fullMs = caravanHurtMs(escort, ctx.infirmaryLevel) * (party.healMult ?? 1);
  const hurt = new Set(party.hurt);
  const light = new Set((party.lightHurt ?? []).filter((id) => !hurt.has(id)));
  const adventurers = roster.map((a) => {
    const gain = party.xp[a.id];
    if (gain === undefined) return a;
    const up = ctx.xpGranted ? a : grantAdvXp(a, gain, ctx.pantheonLevel);
    // 🏠 L'infirmerie est À LA BASE : la convalescence ne court qu'une fois le champion
    // RENTRÉ. Un blessé encore en route (retour d'une sortie par la base, groupe d'une
    // attaque combinée qui rentre plus tard, garnison délogée qui marche) est occupé
    // jusqu'à son arrivée (`busyUntil`) : c'est de là que part son temps de soin.
    const home = Math.max(ctx.backAt, a.busyUntil ?? 0);
    // 🩹 Victoire serrée : une convalescence COURTE (`LIGHT_HURT.msShare`), mêmes soigneurs.
    const ms = hurt.has(a.id) ? fullMs : light.has(a.id) ? fullMs * LIGHT_HURT.msShare : null;
    const until = ms === null ? null : sinceEvent(home, ms, ctx.now);
    return until ? { ...up, hurtUntil: Math.max(up.hurtUntil ?? 0, until) } : up;
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
  /** 🩹 Blessé LÉGER : victoire serrée, convalescence courte. */
  lightHurt: boolean;
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

/**
 * 🧭 LES DÉPARTS D'UN GROUPE, un par champion : ceux d'un point fixe portent son id et son
 * nom, ceux de la base n'y figurent pas. Une attaque combinée passe un groupe par départ.
 */
export function partyOrigins(
  groups: readonly {
    ids: readonly string[];
    origin: (Pick<Poi, 'id' | 'type' | 'control'> & Parameters<typeof poiLabel>[0]) | null;
  }[],
): Record<string, { id: string; label: string }> {
  const out: Record<string, { id: string; label: string }> = {};
  for (const g of groups) {
    if (!g.origin) continue;
    const at = { id: g.origin.id, label: poiLabel(g.origin) };
    for (const id of g.ids) out[id] = at;
  }
  return out;
}

/** 🧭 Pose les départs sur le rapport du groupe (rien à faire sans rapport de groupe). */
export function withOrigins(
  o: ExpeditionOutcome,
  from: Record<string, { id: string; label: string }>,
): ExpeditionOutcome {
  return o.party ? { ...o, party: { ...o.party, from } } : o;
}

/** 📜 Le rapport d'un groupe, lisible après coup dans la boîte 📬. ⚠️ Tout vient du
 *  résultat STOCKÉ (`PartyResult`, tiré au départ), jamais d'un recalcul — même règle que
 *  `caravanReport`. ⚠️ Aucune ferraille : un camp n'en rend pas, le rapport n'en parle pas.
 *  Un aventurier renvoyé depuis garde sa ligne (son XP a bien été versée). */
export function partyReport(party: PartyResult, roster: readonly Adventurer[]): PartyReport {
  const hurt = new Set(party.hurt);
  const light = new Set(party.lightHurt ?? []);
  const members = party.escort.map((id): PartyReportMember => {
    const adv = roster.find((a) => a.id === id);
    return {
      id,
      name: adv?.name ?? 'Champion parti',
      emoji: (adv && advTitle(adv)?.emoji) || '⚔️',
      xp: Math.max(0, Math.round(party.xp[id] ?? 0)),
      kills: Math.max(0, Math.round(party.kills[id] ?? 0)),
      hurt: hurt.has(id),
      lightHurt: !hurt.has(id) && light.has(id),
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
    verdict: party.late
      ? 'arrivés trop tard'
      : party.rift
        ? party.win
          ? 'faille refermée'
          : 'la faille tient'
        : party.battle
          ? party.win
            ? 'bande rompue'
            : 'la bande passe'
          : party.win
            ? 'camp pris'
            : party.turnedBack
              ? 'demi-tour en chemin'
              : party.roadLost
                ? 'pris, embuscade perdue'
                : 'repoussé',
    slain: party.slain,
    foes: party.foes,
    heroKills: party.heroKills,
    members,
    totalXp: members.reduce((s, m) => s + m.xp, 0),
    journal: party.journal,
  };
}

/**
 * 🔙 CE QUE L'ÉCRAN DE DEMI-TOUR MONTRE (demandé : « un truc plus design avec le détail »).
 * Le chemin déjà fait, ce qui reste jusqu'au lieu, et les deux retours comparés : on rentre
 * en autant de temps qu'on a marché (`recallVoyage`, `recallReinforcements`) — ou, si l'on
 * continue, à `returnAt` (absent pour des renforts : ils restent sur le point).
 * ⚠️ `backMs` suit la règle du demi-tour lui-même : un aperçu qui la recalculerait autrement
 * annoncerait un retour que le voyage ne fera pas.
 */
export interface RecallPreview {
  /** Déjà marché (ms). */
  walkedMs: number;
  /** Encore à marcher jusqu'au lieu (ms). */
  toGoMs: number;
  /** Part du chemin aller faite (0..1). */
  frac: number;
  /** Retour à la base si l'on fait demi-tour (ms). */
  backMs: number;
  /** Retour à la base si l'on continue (ms), `null` si l'on reste sur place. */
  homeIfContinueMs: number | null;
}

export function recallPreview(
  v: { sentAt: number; arriveAt: number; returnAt?: number },
  now: number,
): RecallPreview {
  const walkedMs = Math.max(0, now - v.sentAt);
  const leg = Math.max(1, v.arriveAt - v.sentAt);
  return {
    walkedMs,
    toGoMs: Math.max(0, v.arriveAt - now),
    frac: Math.min(1, walkedMs / leg),
    backMs: walkedMs,
    homeIfContinueMs: v.returnAt === undefined ? null : Math.max(0, v.returnAt - now),
  };
}
