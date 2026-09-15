// camp.ts — les CAMPS DE FACTION de la carte (étape 3). Pur/testable.
//
// Un camp (`camp` / `lair`) s'attaque avec un GROUPE : le héros (oui/non) et autant
// d'aventuriers disponibles qu'on veut. Départ comme un convoi (temps réel, zéro énergie).
//
// ⚠️ UN COMBAT FONDU, LU PAR `deriveSkirmish`. Le groupe est fondu LINÉAIREMENT
// (`fuseUnits` : Σ offense, Σ survie), l'ennemi est un combattant fondu à danger ABSOLU
// (`campFoe` : niveau et taille du camp, jamais le groupe envoyé), et ses corps en sont
// DÉRIVÉS (`campBodies` → `troopOf` : la somme des corps EST la force du combat).
// ⚠️ POURQUOI UNE FUSION LINÉAIRE ET PAS CELLE DE LA ROUTE : cf. `fuseUnits`. Conséquence
// voulue : la victoire se joue sur le RAPPORT (groupe / taille du camp) — un gros camp
// demande nettement plus que trois aventuriers, et rien ne borne la taille du groupe.
// ⚠️ AUCUNE FERRAILLE : elle ne vient plus que de l'épave et de la Fonderie (v0.856 : retirée
// des cadavres de la base ; v0.890 : retirée du recyclage, « beaucoup trop de ferraille »).
import { mulberry32, offenseOf, simulateCombat, survivalOf, type Combatant } from './combat';
import {
  deriveSkirmish,
  fuseUnits,
  skirmishXpShares,
  slainByAlly,
  troopOf,
  type SkirmishResult,
  type SkirmishUnit,
} from './skirmish';
import {
  CARAVAN,
  caravanHurtMs,
  caravanLegMin,
  caravanWages,
  missionTravelMult,
  missionXp,
  refEscortUnits,
  roadPairs,
  roadUnits,
  type RoadCompanions,
} from './caravan';
import {
  CAMP_TYPES,
  HARVEST,
  buildMessage,
  campHeroOutcome,
  goldCost,
  harvestYield,
  keepMessages,
  travelFactor,
  travelOneWayMin,
  type ActiveExpedition,
  type CampSpec,
  type ExpeditionMessage,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { FACTION_EMOJI, FACTION_LABEL, factionRoster } from './raid';
import { rollAdvGearDrop, type AdvGear } from './advGear';
import { advTitle, grantAdvXp, type Adventurer } from './adventurers';

export const CAMP = {
  /** Taille de la RÉFÉRENCE : un camp de taille 3 est dimensionné sur 3 aventuriers de
   *  référence (`refEscortUnits`), accompagnés et équipés. */
  refGroup: CARAVAN.refEscort,
  /** PV de l'ennemi fondu ≈ N tours de l'offense du groupe de référence.
   *  ⚠️ MESURÉ avec `dmgPctPv` (grille 1,5→9 × 0,06→0,40, puis 1 000 combats par case, deux
   *  jeux de graines ; `campCalibration.test`). Groupe de N = taille aventuriers de référence,
   *  chacun accompagné et équipé, contre un camp de bandits — victoire aux niveaux
   *  12/26/45/70 : taille 3 → 0,85/0,90/0,81/0,79 ; taille 10 → 0,84/0,89/0,82/0,82 ; sur
   *  toutes les tailles 0,70 (niv. 70, taille 2) à 0,90 (niv. 26, taille 3). Un de moins :
   *  taille 10 → 0,31/0,57/0,52/0,57 ; trois contre un repaire (taille ≥ 5) : ≤ 0,02.
   *  ⚠️ L'ancien réglage (2,6 × 0,27) tombait à 0,46-0,56 sur les gros repaires au niveau 45 :
   *  des combats de ~6 tours laissaient trop de hasard (trois contre cinq gagnaient 0,14).
   *  À 8 × 0,09 un combat dure ~17 tours, jamais le plafond (0 sur 300). */
  pvTurns: 8,
  /** Morsure ≈ part de la SURVIE du groupe de référence. ⚠️ MESURÉ, cf. `pvTurns`. */
  dmgPctPv: 0.09,
  /** Poids du chef (camp) et du champion (repaire) face à un corps de troupe.
   *  ⚠️ ENTIERS : `campBodies` les réalise en regroupant des parts égales de `troopOf`. */
  chiefWeight: 2,
  championWeight: 4,
  /** Butin SANS le héros, en part des sources existantes.
   *  ⚠️ `groupGoldShare` MESURÉ : l'or NET (or − salaires) d'un camp de bandits doit rester
   *  sous l'or moyen d'une MINE de même niveau et distance (40 graines). À 0,6 le plus gros
   *  repaire (taille 10) en rendait 2,25 / 2,12 / 1,90 fois plus aux niveaux 20/26/40 ; à 0,25 : cf.
   *  `campCalibration.test` (E2). ⚠️ `banditGoldMult` et `stoneShare` : non contraints par
   *  une bande, inchangés. */
  groupGoldShare: 0.25,
  banditGoldMult: 1.5,
  stoneShare: 0.5,
  campPieces: 1,
  lairPieces: 2,
  journalMax: 40,
} as const;

/** Id de l'unité du héros dans un groupe — jamais celui d'un aventurier (`adv_…`). */
export const HERO_UNIT_ID = 'hero';

export interface PartyHero {
  name: string;
  level: number;
  combatant: Combatant;
}

export interface PartyInput {
  poi: Poi;
  spec: CampSpec;
  escort: Adventurer[];
  road: RoadCompanions;
  hero: PartyHero | null;
  seed: number;
  /** ⚠️ REQUIS : niveau RÉEL du joueur (anti-runaway des butins). */
  playerLevel: number;
}

/**
 * 🗡️ L'ENNEMI FONDU d'un camp — danger ABSOLU.
 * ⚠️ Dimensionné sur le groupe de RÉFÉRENCE du niveau du lieu, jamais sur le groupe envoyé :
 * sinon « combien j'en envoie » ne voudrait plus rien dire (même règle que la route).
 * ⚠️ Linéaire en taille, et la faction n'y entre pas : ISO-MENACE par construction (elle ne
 * change que les noms et le butin).
 */
export function campFoe(poi: Poi, spec: CampSpec): Combatant {
  const ref = fuseUnits(refEscortUnits(poi.level), 'Référence');
  const m = Math.max(0, spec.size) / CAMP.refGroup;
  return {
    name: FACTION_LABEL[spec.faction],
    pv: Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * CAMP.pvTurns * m)),
    damage: Math.max(1, Math.round(survivalOf(ref) * 100 * CAMP.dmgPctPv * m)),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
  };
}

/**
 * ⚰️ LES CORPS du camp — la force de `campFoe`, RÉPARTIE par `troopOf` : Σ PV = PV du
 * combat, Σ dégâts = dégâts du combat, au point près.
 * Troupe : `size` corps pris dans le roster de la faction, dans son ordre ; dernier = chef
 * (camp) ou champion (repaire), plus lourd. Le poids du meneur est réalisé en demandant à
 * `troopOf` `size + poids` parts égales et en fondant les `poids` dernières en un seul corps :
 * les bornes cumulées sont celles de poids `[1, …, 1, poids]` — une seule force de troupe,
 * jamais une seconde répartition écrite à la main.
 * ⚠️ Pas de silhouette de nombre (`countMult`) : l'XP des abattus se compte PAR CORPS, une
 * horde de bêtes paierait plus qu'une bande de brigands à force égale.
 * ⚠️ INVARIANT : les SOMMES exactes priment sur un plancher par corps. C'est le combattant
 * fondu qui se bat, les corps n'en sont qu'une LECTURE : si le total est plus petit que le
 * nombre de parts, un corps peut valoir 0 dégât (voire 0 PV — il tombe au premier coup, cf.
 * `deriveSkirmish`), jamais une valeur négative ni NaN. Un `Math.max(1, …)` par corps
 * gonflerait la troupe au-delà de ce que le combat applique. Hors d'atteinte avec
 * `campFoe` aujourd'hui (des milliers de points pour ≤ 14 parts), testé sur un ennemi forcé.
 * `foe` : l'ennemi fondu déjà calculé par l'appelant (`resolveCamp`) — une seule force, et
 * pas de second calcul de la référence.
 */
export function campBodies(
  poi: Poi,
  spec: CampSpec,
  foe: Combatant = campFoe(poi, spec),
): SkirmishUnit[] {
  const roster = factionRoster(spec.faction);
  const troop = roster.slice(0, -1);
  const lead = roster[roster.length - 1]!;
  const n = Math.max(1, Math.round(spec.size));
  const leadW = poi.type === 'lair' ? CAMP.championWeight : CAMP.chiefWeight;
  const parts = troopOf(foe, {
    count: n + leadW,
    level: poi.level,
    name: lead.name,
    emoji: lead.emoji,
  });
  const skin = (u: SkirmishUnit, id: string, s: { name: string; emoji: string }): SkirmishUnit => ({
    ...u,
    id,
    name: s.name,
    emoji: s.emoji,
    combatant: { ...u.combatant, name: s.name },
  });
  const bodies = parts.slice(0, n).map((u, i) => skin(u, `camp${i}`, troop[i % troop.length]!));
  const rest = parts.slice(n);
  const chief = skin(rest[0]!, 'campChef', lead);
  chief.combatant.pv = rest.reduce((s, u) => s + u.combatant.pv, 0);
  chief.combatant.damage = rest.reduce((s, u) => s + u.combatant.damage, 0);
  return [...bodies, chief];
}

/** 🤕 INFIRMERIE DES CAMPS : une défaite envoie à l'infirmerie TOUS les aventuriers tombés.
 *  ⚠️ ≠ `convoyHurt` (un seul blessé) : un convoi subit une embuscade en chemin, un camp est
 *  l'épreuve qu'on est venu chercher — on en connaît la taille avant de partir. Une victoire
 *  n'en blesse aucun (à terre, relevés). Le HÉROS n'est jamais blessé. */
export function campHurt(
  d: Pick<SkirmishResult, 'win' | 'down'>,
  escort: readonly { id: string }[],
): string[] {
  if (d.win) return [];
  const ids = new Set(escort.map((a) => a.id));
  return d.down.filter((id) => ids.has(id));
}

/** 💰 Le butin d'un camp pris SANS le héros — DÉRIVÉ des sources existantes, jamais une
 *  table à part : l'or d'un camp, les pierres une part du SANCTUAIRE, les clés des bêtes
 *  celles des ARCHIVES. La FACTION décide de la devise dominante, comme au siège
 *  (`FACTION_LOOT`). Proportionnel à la taille.
 *  ⚠️ JAMAIS DE FERRAILLE (cf. en tête de fichier). */
export function campGroupHaul(
  poi: Poi,
  spec: CampSpec,
  rng: () => number,
): { gold: number; summonStones: number; key: number } {
  const L = Math.max(1, poi.level);
  const rthH = (2 * travelOneWayMin(L, poi.distNorm)) / 60;
  const tfH = travelFactor(rthH);
  const k = Math.max(0, spec.size) / CAMP.refGroup;
  const gold = Math.round(
    goldCost('camp', L) *
      (1 + rthH * 0.1) *
      CAMP.groupGoldShare *
      k *
      (spec.faction === 'bandits' ? CAMP.banditGoldMult : 1),
  );
  const summonStones =
    spec.faction === 'mortsvivants'
      ? Math.round(harvestYield('shrine', L, tfH).summonStones * CAMP.stoneShare * k)
      : 0;
  const key =
    spec.faction === 'betes'
      ? harvestYield('archive', L, tfH).keys
      : rng() < HARVEST.keyChance
        ? 1
        : 0;
  return { gold, summonStones, key };
}

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

/** ⚠️ AUCUNE taille maximale : le vivier disponible est la seule limite (les convois gardent
 *  `CARAVAN.escortMax`, leur calibration en dépend). */
export function canSendParty(poi: Poi, escortCount: number, hero: boolean): boolean {
  return CAMP_TYPES.has(poi.type) && (hero || escortCount > 0);
}

/** Les unités du groupe : aventuriers (SA paire, SES pièces, règle unique `roadPairs`) puis
 *  le héros, unité de plus avec son combattant RÉEL. */
function partyUnits(input: PartyInput): SkirmishUnit[] {
  const units = roadUnits(input.escort, roadPairs(input.escort, input.road));
  if (input.hero)
    units.push({
      id: HERO_UNIT_ID,
      name: input.hero.name,
      emoji: '🧝',
      level: input.hero.level,
      combatant: input.hero.combatant,
    });
  return units;
}

/** Le récit : qui abat qui, borné. */
function campJournal(d: SkirmishResult, allies: SkirmishUnit[], bodies: SkirmishUnit[]): string[] {
  const all = new Map([...allies, ...bodies].map((u) => [u.id, u]));
  const foeIds = new Set(bodies.map((b) => b.id));
  const lines = d.kills.map((k) => {
    const killer = all.get(k.killer);
    const victim = all.get(k.victim);
    const verbe = foeIds.has(k.victim) ? 'abat' : 'met à terre';
    return `${killer?.emoji ?? '⚔️'} ${killer?.name ?? '?'} ${verbe} ${victim?.emoji ?? ''} ${victim?.name ?? '?'}`.trim();
  });
  return lines.length > CAMP.journalMax
    ? [...lines.slice(0, CAMP.journalMax), `… et ${lines.length - CAMP.journalMax} de plus.`]
    : lines;
}

/**
 * ⚔️ La résolution d'une attaque de camp (seedée au DÉPART, révélée aux horodatages).
 *
 * - Combat : `simulateCombat(groupe fondu, campFoe)` ; le groupe est lu par `deriveSkirmish`.
 * - XP : socle `missionXp` + part des abattus (`skirmishXpShares`) PARTAGÉE ENTRE LES SEULS
 *   AVENTURIERS, × `missionTravelMult` comme pour un convoi (la distance paie toute l'XP).
 *   ⚠️ Le héros n'en prend pas : son XP vient du sport, et le compter parmi les présents
 *   diluerait la part du vivier à chaque fois qu'on l'emmène — précisément ce qui rend les
 *   gros camps jouables. Ses abattus restent au total partagé ; la MARGE DE PORTAGE empêche
 *   toujours un héros de faire monter des recrues hors de leur ligue.
 * - Avec le héros : le butin ACTUEL (`campHeroOutcome`), jamais de pièce d'aventurier.
 * - Sans le héros : gagné → `campGroupHaul` + pièce(s) d'aventurier ; perdu → rien.
 * ⚠️ `gearRng` SÉPARÉ : une pièce ne décale jamais la clé du butin de groupe (`rng`).
 */
export function resolveCamp(input: PartyInput): ExpeditionOutcome {
  const { poi, spec, escort, hero, seed, playerLevel } = input;
  const rng = mulberry32(seed >>> 0 || 1);
  const gearRng = mulberry32((seed ^ 0x27d4eb2f) >>> 0 || 1);
  const allies = partyUnits(input);
  const foe = campFoe(poi, spec);
  const bodies = campBodies(poi, spec, foe);
  const group = fuseUnits(allies, 'Groupe');
  const fight = simulateCombat(group, foe, { seed: campFightSeed(seed), goldOnWin: 0 });
  const d = deriveSkirmish(
    { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
    allies,
    bodies,
    seed,
  );
  const slainBy = slainByAlly(allies, d);
  const kills: Record<string, number> = Object.fromEntries(
    escort.map((a) => [a.id, slainBy[a.id] ?? 0]),
  );
  const shares = skirmishXpShares(escort, bodies, d);
  const travel = missionTravelMult(poi);
  const xp: Record<string, number> = {};
  for (const a of escort) xp[a.id] = missionXp(a, poi) + Math.round((shares[a.id] ?? 0) * travel);

  const advGear: Omit<AdvGear, 'id'>[] = [];
  if (!hero && d.win) {
    const n = poi.type === 'lair' ? CAMP.lairPieces : CAMP.campPieces;
    for (let i = 0; i < n; i++) {
      const piece = rollAdvGearDrop(gearRng, escort, {
        chance: 1,
        level: poi.level,
        luck: Math.min(0.6, spec.size / 20),
        playerLevel,
      });
      if (piece) advGear.push(piece);
    }
  }

  const party: PartyResult = {
    hero: !!hero,
    faction: spec.faction,
    size: spec.size,
    escort: escort.map((a) => a.id),
    win: d.win,
    foes: bodies.length,
    slain: d.foesDown.length,
    foesDown: [...d.foesDown],
    kills,
    heroKills: hero ? (slainBy[HERO_UNIT_ID] ?? 0) : 0,
    xp,
    hurt: campHurt(d, escort),
    advGear,
    wages: caravanWages(escort, poi),
    journal: campJournal(d, allies, bodies),
  };
  const tag = `${FACTION_EMOJI[spec.faction]} ${party.slain}/${party.foes} abattus.`;

  if (hero) {
    const o = campHeroOutcome(rng, poi, d.win, playerLevel);
    return { ...o, text: `${o.text} ${tag}`, party };
  }
  const haul = d.win ? campGroupHaul(poi, spec, rng) : { gold: 0, summonStones: 0, key: 0 };
  return {
    win: d.win,
    gold: haul.gold,
    energy: 0,
    summonStones: haul.summonStones,
    // ⚠️ Champ requis par `ExpeditionOutcome` : un camp ne donne JAMAIS de ferraille.
    scrap: 0,
    item: null,
    items: [],
    key: haul.key,
    reconBonus: 0,
    returnMult: 1,
    text: d.win ? `⚔️ Camp pris par ton groupe ! ${tag}` : `💀 Ton groupe a été repoussé. ${tag}`,
    party,
  };
}

/** Construit le voyage d'un groupe. ⚠️ Le coût d'or ne se paie qu'avec le HÉROS (c'est le
 *  prix d'une expédition héros, inchangé) ; l'escorte est payée en salaires à l'encaissement. */
export function startParty(input: PartyInput, now: number, legMin: number): ActiveExpedition {
  const leg = Math.max(1, Math.round(legMin)) * 60_000;
  return {
    poi: input.poi,
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    goldCost: input.hero ? goldCost(input.poi.type, input.poi.level) : 0,
    seed: input.seed >>> 0 || 1,
    outcome: resolveCamp(input),
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
 * ⚠️ La boîte est taillée par `keepMessages` (jamais un butin à récupérer jeté).
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
      if (!box.some((m) => m.id === msg.id)) {
        box = keepMessages([msg, ...box], cap);
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
  ctx: { guildLevel: number; infirmaryLevel: number; now: number },
): { adventurers: Adventurer[]; escort: Adventurer[]; wages: number } {
  const escort = party.escort
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is Adventurer => !!a);
  const hurtUntil = ctx.now + caravanHurtMs(escort, ctx.infirmaryLevel);
  const hurt = new Set(party.hurt);
  const adventurers = roster.map((a) => {
    const gain = party.xp[a.id];
    if (gain === undefined) return a;
    const up = grantAdvXp(a, gain, ctx.guildLevel);
    return hurt.has(a.id) ? { ...up, hurtUntil: Math.max(up.hurtUntil ?? 0, hurtUntil) } : up;
  });
  return { adventurers, escort, wages: Math.max(0, Math.round(party.wages || 0)) };
}

/**
 * 🎲 Graine du VRAI combat d'un camp (`resolveCamp`) — toujours PAIRE.
 * ⚠️ DISJOINTE PAR CONSTRUCTION des graines du pronostic (`campForecastSeed`, toujours
 * IMPAIRES) : un % affiché avant l'envoi ne doit jamais rejouer la bataille qui aura lieu,
 * sinon il en révélerait l'issue (doctrine du pronostic de siège, v0.767). L'ancienne paire
 * `(seed + 17)` / `s × 131 + 5` se croisait (graine 119 → 136 = 2ᵉ échantillon).
 * La parité se lit sans connaître la graine du départ : le pronostic est calculé AVANT
 * qu'elle existe. Coût : `seed` et `seed + 2³¹` livrent le même combat (sans effet de jeu).
 */
export function campFightSeed(seed: number): number {
  return (((seed >>> 0) + 17) * 2) >>> 0;
}

/** 🎲 Graine du i-ème échantillon du pronostic — toujours IMPAIRE (cf. `campFightSeed`),
 *  étalée par la constante de Fibonacci pour ne pas rejouer des graines voisines. */
export function campForecastSeed(i: number): number {
  return (Math.imul((i >>> 0) + 1, 0x9e3779b1) | 1) >>> 0;
}

/** 🎯 % de victoire affiché avant l'envoi — le MÊME combat fondu, rejoué sur des graines
 *  dérivées, déterministes et JAMAIS égales à celle du vrai combat (parité, cf. plus haut). */
export function campWinPct(
  poi: Poi,
  spec: CampSpec,
  allies: readonly SkirmishUnit[],
  samples: number,
): number {
  if (!allies.length) return 0;
  const group = fuseUnits(allies, 'Groupe');
  const foe = campFoe(poi, spec);
  const n = Math.max(1, samples);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(group, foe, { seed: campForecastSeed(s), goldOnWin: 0 }).win) w++;
  return w / n;
}

export interface PartyReportMember {
  id: string;
  name: string;
  emoji: string;
  xp: number;
  kills: number;
  hurt: boolean;
  /** Plus dans le vivier : sa ligne reste, l'XP a bien été versée. */
  gone: boolean;
}
export interface PartyReport {
  hero: boolean;
  factionLabel: string;
  factionEmoji: string;
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
      name: adv?.name ?? 'Aventurier parti',
      emoji: (adv && advTitle(adv)?.emoji) || '⚔️',
      xp: Math.max(0, Math.round(party.xp[id] ?? 0)),
      kills: Math.max(0, Math.round(party.kills[id] ?? 0)),
      hurt: hurt.has(id),
      gone: !adv,
    };
  });
  return {
    hero: party.hero,
    factionLabel: FACTION_LABEL[party.faction],
    factionEmoji: FACTION_EMOJI[party.faction],
    slain: party.slain,
    foes: party.foes,
    heroKills: party.heroKills,
    members,
    totalXp: members.reduce((s, m) => s + m.xp, 0),
    wages: Math.max(0, Math.round(party.wages)),
    journal: party.journal,
  };
}
