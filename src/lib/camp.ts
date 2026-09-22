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
import { lairGearSeals } from './ascension';
import { prestigeRankIndex } from './items';
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
  caravanWages,
  missionXpFor,
  HERO_UNIT_ID,
  partyAllies,
  refEscortUnits,
  type PartyHero,
  type EscortKit,
} from './caravan';
import {
  campSpecOf,
  goldCost,
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type CampSpec,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
  poiRewardLevel,
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
  /** Butin SANS le héros, en part des sources existantes.
   *  ⚠️ `groupGoldShare` MESURÉ DEUX FOIS. (1) L'or NET (or − salaires) d'un camp de bandits
   *  doit rester sous l'or moyen d'une MINE de même niveau et distance (40 graines,
   *  `campCalibration.test` E2) : à 0,6 le plus gros repaire en rendait 2,25 / 2,12 / 1,90 fois
   *  plus aux niveaux 20/26/40. (2) Surtout, le DÉBIT de camps en parallèle
   *  (`campEconomy.test`) : à 0,25 un joueur qui optimise ajoutait +24 à +26 % du revenu d'or
   *  de référence, hors bande ; à 0,18 il ajoute **+9 % (niv. 12), +19 % (26), +20 % (60)**.
   *  ⚠️ `stoneShare` MESURÉ de même : à 0,5 les pierres d'un jour de camps valaient jusqu'à
   *  +105 % d'une journée de donjons (les pierres financent les BOSS, le donjon doit rester la
   *  source) ; à 0,11 → +6 / +16 / +32 %. `banditGoldMult` inchangé (la faction module, elle ne
   *  décide pas du débit). */
  groupGoldShare: 0.18,
  banditGoldMult: 1.5,
  stoneShare: 0.11,
  journalMax: 40,
} as const;

export interface PartyInput {
  poi: Poi;
  spec: CampSpec;
  escort: Adventurer[];
  road: EscortKit;
  hero: PartyHero | null;
  seed: number;
  /** ⚠️ REQUIS : plafonne le rang des sceaux d'objet d'un repaire (`lairGearSeals`). */
  playerLevel: number;
}

/**
 * 🧍 CORRECTION DES PETITES FORCES, PAR RANG (2026-09-22, mesuré ; demandé par l'utilisateur :
 * « aplanir la courbe par niveau »). La force d'un camp est une fraction LINÉAIRE du trio de
 * référence fondu : juste pour 2 contre 2 et 3 contre 3 (74-100 % à tous les niveaux), faux
 * pour UN champion contre une force de taille 1 — un champion seul n'a pas la forme équilibrée
 * du trio, et les champions de haut rang sont plus SPÉCIALISÉS. Mesuré (moyenne des 3 champions
 * de référence contre une taille 1) : 83-86 % aux rangs 0-3, puis 75 · 69 · 61 · 51 · 49 · 46 %
 * aux rangs 4 à 9. Chaque valeur est bisectée pour ramener ce cas à ~82 % (la valeur des
 * premiers rangs) ; les rangs 0-3, déjà dans la bande, restent à 1 (on ne durcit rien).
 * ⚠️ Pleine à la taille 1, elle s'efface linéairement jusqu'à la taille 2 (`smallForceWeight`) :
 * au-delà, la calibration mesurée des camps est intacte.
 */
export const SMALL_FORCE_RELIEF: readonly number[] = [
  1, 1, 1, 1, 0.96, 0.93, 0.82, 0.85, 0.85, 0.84,
];

/** Poids de la correction selon la taille : 1 jusqu'à la taille 1, 0 à partir de 2. */
export function smallForceWeight(size: number): number {
  return Math.min(1, Math.max(0, 2 - size));
}

/** Multiplicateur de force d'une force de taille `size` au niveau `level`. */
export function smallForceMult(level: number, size: number): number {
  const i = Math.min(SMALL_FORCE_RELIEF.length - 1, prestigeRankIndex(Math.max(1, level)));
  return 1 + smallForceWeight(size) * (SMALL_FORCE_RELIEF[i]! - 1);
}

/**
 * 🗡️ L'ENNEMI FONDU d'un camp — danger ABSOLU.
 * ⚠️ Dimensionné sur le groupe de RÉFÉRENCE du niveau du lieu, jamais sur le groupe envoyé :
 * sinon « combien j'en envoie » ne voudrait plus rien dire (même règle que la route).
 * ⚠️ Linéaire en taille, et la faction n'y entre pas : ISO-MENACE par construction (elle ne
 * change que les noms et le butin).
 * ⚠️ Sauf pour les PETITES forces (taille < 2), corrigées par rang : `smallForceMult`.
 */
export function campFoe(poi: Poi, spec: CampSpec): Combatant {
  const ref = fuseUnits(refEscortUnits(poi.level), 'Référence');
  const m = (Math.max(0, spec.size) / CAMP.refGroup) * smallForceMult(poi.level, spec.size);
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
 *  table à part : l'or d'un camp, les pierres une part du SANCTUAIRE. La FACTION module :
 *  les bandits paient plus d'or, les morts-vivants ajoutent des pierres. Or et pierres
 *  proportionnels à la taille ; déterministe (aucun tirage).
 *  ⚠️ JAMAIS DE FERRAILLE (cf. en tête de fichier).
 *  ⚠️ JAMAIS DE CLÉ (revue finale, arbitrage) : les clés nourrissent le Labyrinthe, dont la
 *  bande de 2 à 5 runs/jour est une décision récente (v0.794/v0.799). Les bêtes rendaient
 *  1-2 clés d'archives par camp quelle que soit la taille (+4 à +5 clés/jour mesurées).
 *  ⚠️ Depuis la v0.980 c'est AUSSI le butin d'un groupe AVEC le héros : il n'y compte plus
 *  que pour deux champions (`heroPartyCombatant`), rien ne justifie qu'il fasse tomber le
 *  butin d'une expédition solo. */
export function campGroupHaul(poi: Poi, spec: CampSpec): { gold: number; summonStones: number } {
  // 🪙 Récompense sur le niveau de RÉCOMPENSE (`poiRewardLevel`), pas le niveau de rang.
  const L = Math.max(1, poiRewardLevel(poi));
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
  return { gold, summonStones };
}

/** 🏷️ Ce qu'un camp rapporte, annoncé sur la carte AVANT l'envoi.
 *  ⚠️ Écrit À CÔTÉ de la règle qu'il décrit (`campGroupHaul`), et testé contre elle : la
 *  faction module le butin (bandits → or en quantité, morts-vivants → or + pierres, bêtes
 *  → or). ⚠️ Jamais de ferraille, de clé, ni d'équipement de champion (il ne vient QUE du
 *  tirage, v0.1012).
 *  ⚠️ UNE SEULE ligne depuis la v0.980 : le héros ne change plus le butin. */
export function campRewardLabel(poi: Poi): string {
  const spec = campSpecOf(poi);
  if (!spec) return '';
  const devise =
    spec.faction === 'mortsvivants'
      ? 'or 🪙 + pierres 🔮'
      : spec.faction === 'bandits'
        ? 'or 🪙 en quantité'
        : 'or 🪙';
  return poi.type === 'lair' ? `${devise} + sceau d’objet ⚜️` : devise;
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
  const foe = campFoe(poi, spec);
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
    xp: missionXpFor(escort, poi, d.win, g.shares, !!hero),
    hurt: campHurt(d, escort),
    wages: caravanWages(escort, poi),
    journal: g.journal,
  };
  const tag = `${FACTION_EMOJI[spec.faction]} ${party.slain}/${party.foes} abattus.`;

  const haul = d.win ? campGroupHaul(poi, spec) : { gold: 0, summonStones: 0 };
  // ⚜️ Un REPAIRE pris laisse un sceau d'objet (v0.1047) — leur seule source.
  const seals = d.win && poi.type === 'lair' ? lairGearSeals(poi.level, input.playerLevel) : null;
  return {
    win: d.win,
    ...(seals ? { seals } : {}),
    gold: haul.gold,
    energy: 0,
    summonStones: haul.summonStones,
    mana: 0,
    item: null,
    items: [],
    key: 0, // ⚠️ jamais de clé sans le héros (cf. `campGroupHaul`)
    reconBonus: 0,
    returnMult: 1,
    text: d.win ? `⚔️ Camp pris ! ${tag}` : `💀 Repoussés. ${tag}`,
    party,
  };
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
    if (simulateCombat(group, foe, { seed: partyForecastSeed(s), goldOnWin: 0 }).win) w++;
  return w / n;
}
