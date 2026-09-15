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
  campHeroOutcome,
  goldCost,
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type ActiveExpedition,
  type CampSpec,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { FACTION_EMOJI, FACTION_LABEL, factionRoster } from './raid';
import { rollAdvGearDrop, type AdvGear } from './advGear';
import type { Adventurer } from './adventurers';

export const CAMP = {
  /** Taille de la RÉFÉRENCE : un camp de taille 3 est dimensionné sur 3 aventuriers de
   *  référence (`refEscortUnits`), accompagnés et équipés. */
  refGroup: CARAVAN.refEscort,
  /** PV de l'ennemi fondu ≈ N tours de l'offense du groupe de référence. ⚠️ MESURÉ (Task 5). */
  pvTurns: 2.6,
  /** Morsure ≈ part de la SURVIE du groupe de référence. ⚠️ MESURÉ (Task 5). */
  dmgPctPv: 0.27,
  /** Poids du chef (camp) et du champion (repaire) face à un corps de troupe.
   *  ⚠️ ENTIERS : `campBodies` les réalise en regroupant des parts égales de `troopOf`. */
  chiefWeight: 2,
  championWeight: 4,
  /** Butin SANS le héros, en part des sources existantes. ⚠️ MESURÉS (Task 5). */
  groupGoldShare: 0.6,
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
 */
export function campBodies(poi: Poi, spec: CampSpec): SkirmishUnit[] {
  const foe = campFoe(poi, spec);
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
  const bodies = campBodies(poi, spec);
  const group = fuseUnits(allies, 'Groupe');
  const foe = campFoe(poi, spec);
  const fight = simulateCombat(group, foe, { seed: (seed + 17) >>> 0, goldOnWin: 0 });
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

/** 🎯 % de victoire affiché avant l'envoi — le MÊME combat fondu, rejoué sur des graines
 *  dérivées (jamais celle du vrai départ). */
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
    if (simulateCombat(group, foe, { seed: s * 131 + 5, goldOnWin: 0 }).win) w++;
  return w / n;
}
