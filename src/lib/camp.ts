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
import { CAMP_GEAR_SEAL_CHANCE, mapGearSeals } from './ascension';
import { mulberry32 } from './combat';
import { forceShare } from './poiDifficulty';
import { offenseOf, simulateCombat, survivalOf, type Combatant } from './combat';
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
  missionXpFor,
  HERO_UNIT_ID,
  partyAllies,
  refEscortUnits,
  type PartyHero,
  type EscortKit,
} from './caravan';
import { SUPPLY_IDS, supplyFx, type SupplyStock } from './supplies';
import {
  campSpecOf,
  goldCost,
  harvestYield,
  rewardTripHours,
  type CampSpec,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { partyFightSeed, partyForecastSeed } from './party';
import { FACTION_EMOJI, FACTION_LABEL, factionRoster } from './raid';
import { type Adventurer } from './adventurers';

export const CAMP = {
  /** Taille de la RÉFÉRENCE : un camp de taille 3 est dimensionné sur 3 aventuriers de
   *  référence (`refEscortUnits`), équipés. */
  refGroup: CARAVAN.refEscort,
  /** PV de l'ennemi fondu ≈ N tours de l'offense du groupe de référence.
   *  ⚠️ MESURÉ avec `dmgPctPv` (grille 1,5→9 × 0,06→0,40, puis 1 000 combats par case, deux
   *  jeux de graines ; `campCalibration.test`). Groupe de N = taille aventuriers de référence,
   *  chacun équipé, contre un camp de bandits — victoire aux niveaux
   *  12/26/45/70 : taille 3 → 0,85/0,90/0,81/0,79 ; taille 10 → 0,84/0,89/0,82/0,82 ; sur
   *  toutes les tailles 0,70 (niv. 70, taille 2) à 0,90 (niv. 26, taille 3). Un de moins :
   *  taille 10 → 0,31/0,57/0,52/0,57 (à 300 combats : 0,31/0,58/0,53/0,57) ; trois contre un
   *  repaire (taille ≥ 5) : ≤ 0,02.
   *  ⚠️ L'ancien réglage (2,6 × 0,27) tombait à ~0,5-0,65 sur les gros repaires aux niveaux
   *  45/70 : des combats de ~6 tours laissaient trop de hasard (trois contre cinq gagnaient
   *  0,14). À 8 × 0,09 un combat dure ~17 tours, jamais le plafond (0 sur 300).
   *  ⚠️ CES CHIFFRES SONT LES MÊMES QUE CEUX DE CLAUDE.md (revue finale) : ils divergeaient,
   *  et deux relevés contradictoires du même réglage finissent par en faire croire un faux. */
  pvTurns: 8,
  /** Morsure ≈ part de la SURVIE du groupe de référence. ⚠️ MESURÉ, cf. `pvTurns`. */
  dmgPctPv: 0.09,
  /** Poids du chef (camp) et du champion (repaire) face à un corps de troupe.
   *  ⚠️ ENTIERS : `campBodies` les réalise en regroupant des parts égales de `troopOf`. */
  chiefWeight: 2,
  championWeight: 4,
  journalMax: 40,
} as const;

export interface PartyInput {
  poi: Poi;
  spec: CampSpec;
  escort: Adventurer[];
  road: EscortKit;
  hero: PartyHero | null;
  seed: number;
  /** ⚠️ REQUIS : le nombre de sceaux d'objet d'un camp ou d'un repaire suit le rang du joueur (`mapGearSeals`). */
  playerLevel: number;
  /** ⚠️ REQUIS : la référence de la prime de rattrapage (`catchUpMult`) — c'est le plafond
   *  que `grantAdvXp` applique, jamais le niveau du joueur. */
  pantheonLevel: number;
}

/**
 * 🗡️ L'ENNEMI FONDU d'un camp — danger ABSOLU.
 * ⚠️ Dimensionné sur le groupe de RÉFÉRENCE du niveau du lieu, jamais sur le groupe envoyé :
 * sinon « combien j'en envoie » ne voudrait plus rien dire (même règle que la route).
 * ⚠️ Linéaire en taille, et la faction n'y entre pas : ISO-MENACE par construction (elle ne
 * change que les noms et le butin).
 * ⚠️ Sauf pour les PETITES forces (taille < 2), corrigées par rang — `forceShare`
 * (poiDifficulty.ts) porte la correction, et le rang affiché lit la MÊME expression.
 */
export function campFoe(poi: Poi, spec: CampSpec, foeMult = 1): Combatant {
  const ref = fuseUnits(refEscortUnits(poi.level), 'Référence');
  // 🔥 `foeMult` : le fumigène (`supplies.ts`). ⚠️ Appliqué ICI, là où la force se calcule,
  // pour que le combat, les corps (`campBodies`) et le pronostic la voient tous.
  const m = forceShare(poi.level, spec.size) * foeMult;
  return {
    name: FACTION_LABEL[spec.faction],
    pv: Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * CAMP.pvTurns * m)),
    damage: Math.max(1, Math.round(survivalOf(ref) * 100 * CAMP.dmgPctPv * m)),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
  };
}

/** ⚰️ LA TROUPE d'une force de taille `size`, meneur NON compris — ce que `campBodies`
 *  répartit. ⚠️ C'est ELLE la primitive : l'écran ajoute le meneur (`campBodyCount`), le
 *  moteur ne le retranche pas — on n'ajoute plus 1 pour le retirer aussitôt. */
function campTroopCount(size: number): number {
  return Math.max(1, Math.round(size));
}

/** 👾 COMBIEN d'ennemis une force de taille `size` aligne : la troupe, plus son meneur.
 *  ⚠️ Écrit UNE fois et lu par `campBodies` comme par l'écran : annoncer un nombre que le
 *  combat ne produit pas serait pire que de ne rien annoncer.
 *  ⚠️ Et ce nombre NE DIT PAS la difficulté — il arrondit, donc une force de 1,5 et une force
 *  de 2 alignent toutes deux 3 corps. C'est le RANG du lieu qui porte la difficulté. */
export function campBodyCount(size: number): number {
  return campTroopCount(size) + 1;
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
  const n = campTroopCount(spec.size);
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

/**
 * 💰 CE QUE PORTENT LES ENNEMIS (v0.1166, conçu avec l'utilisateur : « de l'or selon les ennemis
 * du lieu, une quantité par ennemi selon son niveau et s'il est élite ou pas » ; « pas d'or
 * sur les monstres, par logique » ; « des consommables sur les bêtes, des pierres d'invocation
 * sur les morts-vivants »).
 *
 * Chaque corps porte le butin de SA faction, pondéré par son POIDS (troupe ×1, chef ×2,
 * champion de repaire ×4 — les poids du combat, jamais une seconde table) et indexé sur SON
 * niveau (le niveau du lieu) :
 * - 🗡️ **bandits** → une BOURSE d'or (`purseGold`) — les seuls à en porter ;
 * - 💀 **morts-vivants** → des pierres d'invocation 🔮 ;
 * - 🐺 **bêtes** → une chance de consommable 🎒 (on dépèce ce qu'on a abattu).
 * ⚠️ Mêmes règles pour les gardes d'un lieu de récolte que pour un camp : un garde reste un
 * ennemi, il porte ce que porte sa faction.
 */
export const LOOT = {
  /** Bourse d'un bandit de troupe, en part du coût d'un camp de son niveau.
   *  ⚠️ MESURÉ : un camp de bandits rend en bourses l'or qu'il rendait avant (cf. test). */
  purseShare: 0.033,
  /** Pierres d'un mort-vivant de troupe, en part d'une visite de sanctuaire de son niveau.
   *  ⚠️ Un peu PLUS qu'avant : les morts-vivants ne donnent plus d'or. */
  stoneShare: 0.024,
  /** Chance qu'une bête de troupe laisse un consommable (× son poids, plafonné à 1). */
  beastDrop: 0.2,
} as const;

/** Poids d'un corps : la troupe vaut 1, le meneur les poids du combat (`campBodies`). */
function bodyWeight(poi: Pick<Poi, 'type'>, id: string): number {
  if (id !== 'campChef') return 1;
  return poi.type === 'lair' ? CAMP.championWeight : CAMP.chiefWeight;
}

/** 🪙 La bourse d'un bandit de TROUPE de niveau `level` (un meneur porte son poids en plus). */
export function purseGold(level: number): number {
  const L = Math.max(1, level);
  return goldCost('camp', L) * (1 + rewardTripHours(L) * 0.1) * LOOT.purseShare;
}

/** 🔮 Les pierres d'un mort-vivant de TROUPE de niveau `level` (non arrondies). */
function undeadStones(level: number): number {
  return harvestYield('shrine', Math.max(1, level)).summonStones * LOOT.stoneShare;
}

/** Un entier stable par corps (`camp3` → 3, le meneur → 997). */
function hashBody(id: string): number {
  const m = /^camp([0-9]+)$/.exec(id);
  return m ? Number(m[1]) : 997;
}

/** Ce que laissent des ennemis abattus. */
export interface BodyLoot {
  gold: number;
  summonStones: number;
  supplies: SupplyStock;
}

/** Les ids des corps d'une force (dans l'ordre de `campBodies`), sans la construire. */
export function campBodyIds(spec: Pick<CampSpec, 'size'>): string[] {
  const n = campTroopCount(spec.size);
  return [...Array.from({ length: n }, (_, i) => `camp${i}`), 'campChef'];
}

/**
 * 💰 LE BUTIN DES CORPS `ids` — somme de ce que chacun porte. Arrondi UNE fois, à la fin
 * (des parts fractionnaires arrondies corps par corps gonfleraient le total).
 * ⚠️ Les consommables des bêtes sont tirés sur un générateur À PART (`seed`, constante XOR
 * propre) et PROPRE À CHAQUE CORPS : un corps donne la même chose qu'on ramasse toute la
 * troupe ou seulement ceux qu'on a abattus, et le combat garde ses valeurs seedées.
 */
export function bodyLoot(
  poi: Pick<Poi, 'type' | 'level'>,
  spec: Pick<CampSpec, 'faction'>,
  ids: readonly string[],
  seed: number,
): BodyLoot {
  let gold = 0;
  let stones = 0;
  const supplies: SupplyStock = {};
  for (const id of ids) {
    const w = bodyWeight(poi, id);
    const rng = mulberry32(((seed ^ 0x7c3d91a5) + hashBody(id) * 2654435761) >>> 0 || 1);
    if (spec.faction === 'bandits') gold += purseGold(poi.level) * w;
    else if (spec.faction === 'mortsvivants') stones += undeadStones(poi.level) * w;
    else if (rng() < Math.min(1, LOOT.beastDrop * w)) {
      const sid = SUPPLY_IDS[Math.floor(rng() * SUPPLY_IDS.length)]!;
      supplies[sid] = (supplies[sid] ?? 0) + 1;
    }
  }
  return { gold: Math.round(gold), summonStones: Math.round(stones), supplies };
}

/** 🏷️ Ce que portent TOUS les ennemis d'une force, en ESPÉRANCE (pour la fiche du lieu) :
 *  or et pierres exacts, consommables en moyenne. Lit les MÊMES poids que `bodyLoot`. */
export function forceLootPreview(
  poi: Pick<Poi, 'type' | 'level'>,
  spec: CampSpec,
): { gold: number; summonStones: number; supplies: number } {
  const ids = campBodyIds(spec);
  const weight = ids.reduce((s, id) => s + bodyWeight(poi, id), 0);
  return {
    gold: spec.faction === 'bandits' ? Math.round(purseGold(poi.level) * weight) : 0,
    summonStones:
      spec.faction === 'mortsvivants' ? Math.round(undeadStones(poi.level) * weight) : 0,
    supplies:
      spec.faction === 'betes'
        ? ids.reduce((s, id) => s + Math.min(1, LOOT.beastDrop * bodyWeight(poi, id)), 0)
        : 0,
  };
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

/** Ce que laisse chaque faction, dit en toutes lettres (fiche d'un camp ou d'un lieu gardé). */
export const FACTION_LOOT_LABEL: Record<CampSpec['faction'], string> = {
  bandits: 'bourses d’or 🪙',
  mortsvivants: 'pierres d’invocation 🔮',
  betes: 'consommables 🎒',
};

/** 🏷️ Ce qu'un camp rapporte, annoncé sur la carte AVANT l'envoi.
 *  ⚠️ Écrit À CÔTÉ de la règle qu'il décrit (`bodyLoot`), et testé contre elle : chaque
 *  faction laisse SA ressource (v0.1166 : bandits → bourses d'or, morts-vivants → pierres,
 *  bêtes → consommables). ⚠️ Jamais de ferraille, de clé, ni d'équipement de champion (il ne
 *  vient QUE du tirage, v0.1012).
 *  ⚠️ UNE SEULE ligne depuis la v0.980 : le héros ne change plus le butin. */
export function campRewardLabel(poi: Poi): string {
  const spec = campSpecOf(poi);
  if (!spec) return '';
  const devise = FACTION_LOOT_LABEL[spec.faction];
  // ⚜️ Camp et repaire laissent leurs sceaux d'objet (`mapGearSeals`) ; la chance ne s'annonce
  // que si elle n'est pas certaine.
  const sure = poi.type === 'lair' || CAMP_GEAR_SEAL_CHANCE >= 1;
  return sure
    ? `${devise} + sceaux d’objet ⚜️`
    : `${devise} + sceaux d’objet ⚜️ (${Math.round(CAMP_GEAR_SEAL_CHANCE * 100)} % de chance)`;
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

/** Ce qu'un combat contre une force de camp laisse derrière lui. */
export interface CampFight {
  skirmish: SkirmishResult;
  foes: number;
  slain: number;
  /** Abattus PAR aventurier (le héros n'y figure pas). */
  kills: Record<string, number>;
  heroKills: number;
  /** Parts d'XP des abattus, par aventurier (`skirmishXpShares`). */
  shares: Record<string, number>;
  journal: string[];
}

/**
 * ⚔️ LE COMBAT contre une force de camp — celui d'un camp, ET celui des gardes d'un lieu de
 * récolte (`harvestGuardOf`, 2026-09-22). ⚠️ UNE SEULE implémentation : le % affiché
 * (`campWinPct`), le camp et la récolte gardée rejouent exactement le même choc, sur la
 * graine PAIRE du départ (`partyFightSeed`), jamais sur celles du pronostic.
 */
export function fightCampForce(input: PartyInput): CampFight {
  const { poi, spec, escort, hero, seed } = input;
  const allies = partyAllies(escort, input.road, hero);
  const foe = campFoe(poi, spec, supplyFx(input.road.supplies).guardMult);
  const bodies = campBodies(poi, spec, foe);
  const group = fuseUnits(allies, 'Groupe');
  const fight = simulateCombat(group, foe, { seed: partyFightSeed(seed), goldOnWin: 0 });
  const d = deriveSkirmish(
    { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
    allies,
    bodies,
    seed,
  );
  const slainBy = slainByAlly(allies, d);
  return {
    skirmish: d,
    foes: bodies.length,
    slain: d.foesDown.length,
    kills: Object.fromEntries(escort.map((a) => [a.id, slainBy[a.id] ?? 0])),
    heroKills: hero ? (slainBy[HERO_UNIT_ID] ?? 0) : 0,
    shares: skirmishXpShares(escort, bodies, d),
    journal: campJournal(d, allies, bodies),
  };
}

/**
 * ⚔️ La résolution d'une attaque de camp (seedée au DÉPART, révélée aux horodatages).
 *
 * - Combat : `simulateCombat(groupe fondu, campFoe)` ; le groupe est lu par `deriveSkirmish`.
 * - XP : socle `missionXp` + part des abattus (`skirmishXpShares`) PARTAGÉE ENTRE LES SEULS
 *   AVENTURIERS, le socle selon l'issue (défaite = `CARAVAN.xpLossShare`), sans distance (v0.1014).
 *   ⚠️ Le héros n'en prend pas : son XP vient du sport, et le compter parmi les présents
 *   diluerait la part du vivier à chaque fois qu'on l'emmène — précisément ce qui rend les
 *   gros camps jouables. Ses abattus restent au total partagé ; la MARGE DE PORTAGE empêche
 *   toujours un héros de faire monter des recrues hors de leur ligue.
 * - Butin, AVEC ou SANS le héros (v0.980) : gagné → `campGroupHaul` (plus aucune pièce de
 *   champion depuis la v0.1012 : elles ne viennent QUE du tirage) ; perdu → rien. ⚠️ Le héros n'y compte plus que pour deux champions
 *   (`heroPartyCombatant`) : lui faire tomber le butin d'une expédition solo (or à l'équilibre
 *   du péage, pièce de set) n'avait plus de sens — et il ne paie plus de péage ici
 *   (`partyHeroToll`).
 * ⚠️ `poi.perilous` d'un camp reste tiré au spawn, mais n'a AUCUN effet sur une attaque.
 */
export function resolveCamp(input: PartyInput): ExpeditionOutcome {
  const { poi, spec, escort, hero } = input;
  const g = fightCampForce(input);
  const d = g.skirmish;
  const party: PartyResult = {
    hero: !!hero,
    faction: spec.faction,
    escort: escort.map((a) => a.id),
    win: d.win,
    foes: g.foes,
    slain: g.slain,
    kills: g.kills,
    heroKills: g.heroKills,
    xp: missionXpFor(escort, poi, d.win, g.shares, input.pantheonLevel),
    hurt: campHurt(d, escort),
    journal: g.journal,
  };
  const tag = `${FACTION_EMOJI[spec.faction]} ${party.slain}/${party.foes} abattus.`;

  const haul = forceHaul(input, spec, d);
  // ⚜️ Un REPAIRE ou un CAMP pris laisse ses sceaux d'objet (camp : `CAMP_GEAR_SEAL_CHANCE`). ⚠️ Tirage
  // sur un générateur À PART : le combat et le butin gardent leurs valeurs seedées.
  const seals =
    d.win && (poi.type === 'lair' || poi.type === 'camp')
      ? mapGearSeals(
          poi.type,
          mulberry32((input.seed ^ 0x2f6b9c1d) >>> 0 || 1)(),
          input.playerLevel,
        )
      : null;
  return {
    win: d.win,
    ...(seals ? { seals } : {}),
    gold: haul.gold,
    energy: 0,
    summonStones: haul.summonStones,
    mana: 0,
    item: null,
    items: [],
    ...(Object.keys(haul.supplies).length ? { supplies: haul.supplies } : {}),
    key: 0, // ⚠️ jamais de clé d'un camp
    reconBonus: 0,
    returnMult: 1,
    text: d.win ? `⚔️ Camp pris ! ${tag}` : `💀 Repoussés. ${tag}`,
    party,
  };
}

/**
 * 💰 CE QU'UNE FORCE LAISSE — camp comme gardes d'un lieu de récolte (`bodyLoot`).
 * - Victoire : ce que portaient TOUS les ennemis.
 * - Défaite : ce que portaient ceux qu'on a ABATTUS (décision de l'utilisateur) ; le 📯 cor de
 *   retraite garantit au moins `retreatShare` du butin entier, devise par devise.
 */
export function forceHaul(
  input: Pick<PartyInput, 'poi' | 'road' | 'seed'>,
  spec: CampSpec,
  d: Pick<SkirmishResult, 'win' | 'foesDown'>,
): BodyLoot {
  const all = campBodyIds(spec);
  const full = bodyLoot(input.poi, spec, all, input.seed);
  if (d.win) return full;
  const down = new Set(d.foesDown);
  const got = bodyLoot(
    input.poi,
    spec,
    all.filter((id) => down.has(id)),
    input.seed,
  );
  const retreat = supplyFx(input.road.supplies).retreatShare;
  if (retreat <= 0) return got;
  return {
    gold: Math.max(got.gold, Math.round(full.gold * retreat)),
    summonStones: Math.max(got.summonStones, Math.round(full.summonStones * retreat)),
    supplies: got.supplies,
  };
}

/** 🎯 % de victoire affiché avant l'envoi — le MÊME combat fondu, rejoué sur des graines
 *  dérivées, déterministes et JAMAIS égales à celle du vrai combat (parité, cf. plus haut). */
export function campWinPct(
  poi: Poi,
  spec: CampSpec,
  allies: readonly SkirmishUnit[],
  samples: number,
  /** 🔥 Le fumigène — le MÊME multiplicateur que la résolution (`fightCampForce`). */
  foeMult = 1,
): number {
  if (!allies.length) return 0;
  const group = fuseUnits(allies, 'Groupe');
  const foe = campFoe(poi, spec, foeMult);
  const n = Math.max(1, samples);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(group, foe, { seed: partyForecastSeed(s), goldOnWin: 0 }).win) w++;
  return w / n;
}
