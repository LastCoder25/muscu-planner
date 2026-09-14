// proceduralContent.ts — CONTENU PROCÉDURAL de l'Aventure (pur/testé). Étend le
// bestiaire / les donjons / les boss AU-DELÀ du contenu écrit à la main (jusqu'au
// niveau ~100) via une CALIBRATION RELATIVE : les stats d'un monstre sont dérivées
// d'un combattant ÉQUILIBRÉ de référence au niveau visé → auto-scaling sans courbe
// polynomiale fragile. Objectif : clear ~90 % au recoLevel (build équilibré), mur
// ~2 niveaux en dessous — même contrat que les donjons écrits à la main.
//
// N'affecte pas l'existant : ces entités sont AJOUTÉES aux tableaux exportés
// (MONSTERS/DUNGEONS/BOSSES/REGIONS) ; le contenu à la main reste la source de
// vérité pour les premiers niveaux.
import { playerCombatant, combatPower, type Combatant } from './combat';
import type { Monster } from '@/data/monsters';
import type { Dungeon, StatKey } from '@/data/dungeons';
import type { Region } from '@/lib/regions';
import type { MilestoneBoss } from '@/data/bosses';
import type { EffectType, ItemSet, SetTier } from '@/lib/items';

// XP de fond cumulée pour atteindre le niveau L (= Σ des coûts de niveau
// 200+(k-1)×100). Forme fermée : 50·(L-1)·(L+2). Miroir de levels.ts (gardé local
// pour rester pur/sans import circulaire).
export function cumXpForLevel(L: number): number {
  const n = Math.max(1, L);
  return 50 * (n - 1) * (n + 2);
}

// Combattant équilibré de RÉFÉRENCE au niveau L : stat de fond = XP/15 répartie en
// 3 buckets égaux (puissance = endurance = agilité) → le « joueur médian » du niveau.
export function refBalancedStat(L: number): number {
  return cumXpForLevel(L) / 3 / 15;
}
export function refFighter(L: number): Combatant {
  const s = refBalancedStat(L);
  return playerCombatant('ref', { puissance: s, endurance: s, agilite: s }, L);
}
/** PUISSANCE CONSEILLÉE pour un contenu de niveau reco. Depuis v0.600 le contenu suppose un
 *  joueur ÉQUIPÉ (gearExpect/bossGearExpect) : la conseillée doit donc être la puissance d'un
 *  joueur ÉQUIPÉ de ce niveau, pas du build NU de référence (sinon elle sous-estimait — un
 *  joueur à 1084 « perdait » contre un boss affiché 707). On multiplie la puissance nue par le
 *  gain de combatPower qu'apporte l'équipement = √(off × pv) des facteurs d'attente d'équipement
 *  (combatPower = √(offense × survie) → un boost O sur l'offense et S sur la survie multiplie la
 *  puissance par √(O·S)). `boss` = attente STEEP (combat solo) ; sinon attente donjon (attrition). */
export function recommendedPower(recoLevel: number, boss = false): number {
  const L = Math.max(1, recoLevel);
  const base = combatPower(refFighter(L));
  const ge = boss ? bossGearExpect(L) : dungeonGearExpect(L);
  // La correction du procédural multiplie PV et dégâts : elle multiplie la puissance attendue.
  const boost = boss ? bossContentBoost(L) : proceduralDungeonBoost(L);
  return Math.round(base * Math.sqrt(ge.off * ge.pv) * boost);
}

// Coefficients de calibration (fittés par simulation, cf. proceduralContent.test) :
// PV monstre = offense/tour du joueur × KPV ; dégâts = PV du joueur × KDMG. Le trio
// escaladant applique un facteur de rôle (weak/mid/strong).
// Fittés par simulation (cf. proceduralContent.test) : clear ~88-90 % au reco pour
// un build équilibré à bas palier (mur ~22-45 % à reco−2), montant à ~97-98 % en
// profondeur (le mur s'adoucit forcément — 2 niveaux = variation minime à haut niveau).
const CALIB = {
  kpv: 5, // PV du « mid » ≈ 5× l'offense/tour du joueur de référence
  kdmg: 0.17, // dégâts du « mid » ≈ 17 % des PV du joueur de référence
  role: { weak: 0.72, mid: 1, strong: 1.32 } as Record<string, number>,
} as const;

// ── ATTENTE D'ÉQUIPEMENT (v0.600) — le contenu suppose un joueur ÉQUIPÉ ──
// Mesuré par simulation (test de calibration) : par rapport au joueur NU de référence,
// un joueur ÉQUIPÉ de son niveau gagne ~×1,3→2,3 d'OFFENSE (dégâts/frappes/crit) et
// ~×1,9→3,6 de SURVIE effective (PV via max_pv%, réduction, vol de vie), et cet écart
// CROÎT avec le niveau (plus d'affixes/rangs débloqués). Sans en tenir compte, un joueur
// équipé roulait sur du contenu +15 niveaux à 100 % → le SPORT n'était plus le plafond.
// On calibre donc les monstres contre cette référence ÉQUIPÉE : PV ∝ boost d'offense (le
// monstre survit aux frappes du joueur), dégâts ∝ boost de survie (il menace ses PV). Le
// facteur suit le niveau → un joueur reste dans sa ligue (~clear à SON niveau, mur à +8/+10),
// quel que soit son niveau. C'est l'ancre de l'anti-runaway côté DIFFICULTÉ (le côté DROP
// est géré par la pyramide de rang centrée niveau).
export function gearExpect(level: number): { off: number; pv: number } {
  const L = Math.max(1, level);
  // Fittés sur la courbe de boost MOYENNÉE (cf. test de calibration) : off ~1,2→2,0,
  // effPV ~2,5→3,8. La survie (max_pv%/réduction/vol de vie) domine dès le bas niveau.
  // Recalibré v0.622 par SIMULATION (cf. calibration geared clear rate). L'ancienne courbe
  // (off ≤1,8 / pv ≤2,3) PLAFONNAIT alors que la puissance du gear CONTINUE de monter avec le
  // niveau (itemLevelMult + raretés hautes) → RUNAWAY dès ~niv.50 (un joueur équipé roulait
  // sur du contenu +15 à ~90-100 %). La pente est volontairement PLUS RAIDE que le boost brut
  // mesuré (offense ~1,5→2,9, survie ~1,6→2,2 de niv.10 à 100) : comme le gear monte lentement
  // PAR NIVEAU mais DOMINE la puissance, il faut que l'attente du contenu profond DÉPASSE le
  // gear d'un joueur sous-niveau, sinon pas de mur. Résultat (sim, joueur bien équipé) : clear
  // à SON niveau ~systématique, MUR à +12/15 (clear +15 : 0-15 % à tous les niveaux, vs 92-100 %
  // avant). Bornes hautes (6,0 / 5,0) = garde-fou fin de partie.
  return {
    off: Math.min(6.0, 1.35 + Math.max(0, L - 8) * 0.035),
    pv: Math.min(5.0, 1.45 + Math.max(0, L - 8) * 0.03),
  };
}

/** Niveau de donjon où l’attente d’équipement s’applique en entier — là où `gearExpect`
 *  commence sa propre pente (`L − 8`). Porté de 4 à 8 en v0.810 : au niveau 4 la Caverne
 *  attendait déjà l’équipement plein, que le joueur ne peut pas avoir (mesuré : 2 % de
 *  victoire à son niveau, équipé du butin de la Clairière). */
const GEAR_EXPECT_FULL_AT = 8;

/** ATTENTE D’ÉQUIPEMENT D’UN DONJON — `gearExpect`, RAMPÉE sur les tout premiers niveaux.
 *
 *  ⚠️ Le 1er donjon est l’AMORÇAGE : l’équipement ne vient QUE des donjons, donc on ne peut
 *  pas y attendre un joueur déjà équipé. Appliquée telle quelle au niveau 1 (×1,35 PV,
 *  ×1,45 dégâts), elle rendait la Clairière ingagnable : mesuré, un joueur de niveau 1 y
 *  gagnait 0 % du temps, nu comme avec du stuff commun. Elle vaut donc ×1 au niveau 1 et
 *  rejoint `gearExpect` au niveau `GEAR_EXPECT_FULL_AT`. Lue par `dungeonFoes` ET par la puissance conseillée : l’écran
 *  doit annoncer ce que le combat applique. */
export function dungeonGearExpect(level: number): { off: number; pv: number } {
  const ge = gearExpect(level);
  const t = Math.min(1, Math.max(0, (level - 1) / (GEAR_EXPECT_FULL_AT - 1)));
  return { off: 1 + (ge.off - 1) * t, pv: 1 + (ge.pv - 1) * t };
}

// ── CORRECTION DE CALIBRATION DU CONTENU PROCÉDURAL (v0.848, mesuré) ──
// ⚠️ Le procédural (CALIB, BOSS_CALIB) est dérivé d'un joueur de référence qui ne porte QUE
// des objets. Le vrai joueur porte aussi un talent, un familier, des pièces de set et une
// voie : au-delà du contenu écrit à la main, les donjons se nettoyaient à 92-100 % à leur
// niveau et les boss se gagnaient à 73-93 %. Mesuré avec une progression RÉALISTE (butin des
// donjons et boss des 15 derniers niveaux aux taux réels, meilleur talent, familiers du
// Labyrinthe dressés à 30 % du niveau, meilleure des 8 voies ; 3 profils × 3 tirages), le
// renfort qui ramène le joueur à la cible (donjon 70 % à son niveau, boss 55 % au palier)
// vaut ×1,01 à ×1,09 sur le contenu écrit à la main (dans le bruit, non touché) et bondit à
// la JOINTURE avec le procédural. La table ci-dessous EST la mesure (points mesurés).
// ⚠️ Pas dans `gearExpect` : il est aussi lu par les donjons 12-22 et le Labyrinthe, que
// ×1,4 aurait murés. Les donjons portent ce renfort en `foeMult` (point de passage unique
// `dungeonFoes`), les boss dans `BOSSES`, et la puissance conseillée relit les deux.
// ⚠️ RÉDUITE EN v0.857 : familiers et talents sont plafonnés au RANG DU JOUEUR (échelle de
// prestige, un rang tous les 10 niveaux) au lieu du plafond √ (+2 rangs). Mesuré (10 tirages
// d'équipement × 60 combats, même équipement, seuls les rangs des compagnons changent), le
// joueur perd l'équivalent de ×1,06 de PV et dégâts quand l'écart entre les deux échelles vaut
// deux rangs (niveaux 25-49), ×1,04 à un rang (55-70), ×1,00 à zéro (79-94). Chaque point de
// la table est divisé d'autant : la difficulté visée par la v0.848 est conservée.
const PROC_DUNGEON_BOOST: [number, number][] = [
  [25, 1.3],
  [31, 1.32],
  [40, 1.44],
  [55, 1.56],
  [70, 1.56],
  [85, 1.6],
  [94, 1.38],
];
/** Lecture d'une table de points mesurés [niveau, valeur] : interpolée entre deux points,
 *  valeur du bout le plus proche au-delà. */
function interpolate(t: [number, number][], x: number): number {
  const i = t.findIndex(([l]) => x <= l);
  if (i === 0) return t[0]![1];
  if (i < 0) return t.at(-1)![1];
  const [l0, b0] = t[i - 1]!;
  const [l1, b1] = t[i]!;
  return b0 + ((b1 - b0) * (x - l0)) / (l1 - l0);
}
/** Renfort (PV et dégâts) d'un donjon procédural de reco `reco` (1 avant), interpolé. */
function proceduralDungeonBoost(reco: number): number {
  return reco < PROC_DUNGEON_BOOST[0]![0] ? 1 : interpolate(PROC_DUNGEON_BOOST, reco);
}
/** Renfort (PV et dégâts) des boss procéduraux : moyenne des mesures (×1,27 à ×1,41 selon
 *  le palier, écarts dans le bruit). Les boss écrits à la main sont corrigés dans leurs stats.
 *  ⚠️ 1,32 → 1,27 en v0.857 (compagnons plafonnés au rang du joueur) : mesuré ×1,00 à ×1,085
 *  selon le palier, ×1,04 en moyenne. */
const PROC_BOSS_BOOST = 1.27;
export function bossContentBoost(level: number): number {
  return level >= 30 ? PROC_BOSS_BOOST : 1;
}

// ── LABYRINTHE : force des créatures (v0.851, mesuré) ──
// ⚠️ Même défaut que le procédural en v0.848 : les créatures lisaient `gearExpect` seul, calé
// sur un joueur qui ne porte que des objets. Mesuré sur le VRAI parcours (toutes les salles
// d'un étage comme l'auto, pièges, repos, gardien ; joueur à 60 drops + 3 familiers + talent,
// 5 tirages × 40 runs), un build complet nettoyait 98-100 % de ses paliers à leur niveau dès le
// palier 12 — et les deux premiers à 1 %, faute de la rampe de début de partie des donjons.
// Correctif : la rampe (`dungeonGearExpect`) et un renfort par palier qui ramène le build
// complet à ~70 % au niveau conseillé (~90 % sur les deux paliers d'initiation). La table EST
// la mesure : un point par palier (les écarts entre voisins suivent le nombre d'étages et le
// roster, ils ne sont pas lissés).
// ⚠️ RÉDUITE EN v0.857 (familiers et talents plafonnés au rang du joueur) : chaque palier est
// divisé par ce que le joueur a perdu À SON NIVEAU CONSEILLÉ — mesuré ×1,07 (Cryptes), ×1,05
// (Abysse, Gouffre, Astral), ×1,04 (Sans-fond), ×1,07 (Chaos), ×1,02 (Néant), ×1,00 ailleurs.
const LABY_CONTENT_BOOST: [number, number][] = [
  [2, 0.7],
  [3, 0.79],
  [6, 1.07],
  [12, 1.37],
  [20, 1.3],
  [28, 1.51],
  [40, 1.61],
  [52, 1.72],
  [66, 1.8],
  [85, 1.67],
];
/** PV et dégâts de base d'une créature du Labyrinthe (avant son archétype), pour un palier de
 *  niveau conseillé `level`, à la profondeur `depth` (0 surface → 1 fond). Source UNIQUE : le
 *  combat (`makeMonster`) et l'estimation du % de réussite (`estimMon`) la lisent tous deux. */
export function labyrinthFoeBase(
  level: number,
  isBoss: boolean,
  depth: number,
): { pv: number; damage: number } {
  const ref = refFighter(level);
  const d = 0.85 + 0.55 * depth; // 0,85 (surface) → 1,4 (fond)
  // Coussin bas niveau sur les dégâts : 0,5 à L1 → 1 à L18+ (petits nombres + variance).
  const lowEase = 0.5 + 0.5 * Math.min(1, level / 18);
  const ge = dungeonGearExpect(level);
  const k = interpolate(LABY_CONTENT_BOOST, level);
  return {
    pv: refOffensePerRound(ref) * (isBoss ? 5.5 : 2.8) * d * ge.off * k,
    damage: ref.pv * (isBoss ? 0.07 : 0.05) * d * lowEase * ge.pv * k,
  };
}

export type MonsterRole = 'weak' | 'mid' | 'strong';

// Offense/tour attendue du joueur de référence (dégâts × frappes × (1+crit)).
function refOffensePerRound(f: Combatant): number {
  return f.damage * (f.strikes ?? 1) * (1 + f.crit);
}

// Pools thématiques pour nommer/illustrer les monstres profonds (cyclés par index).
const PROC_MONSTERS: { emoji: string; name: string }[] = [
  { emoji: '👺', name: 'Oni ancestral' },
  { emoji: '🦂', name: 'Scorpion de brume' },
  { emoji: '🕷️', name: 'Tisseur du vide' },
  { emoji: '🐲', name: 'Wyrm des abysses' },
  { emoji: '👽', name: 'Effroi stellaire' },
  { emoji: '🦖', name: 'Colosse primordial' },
  { emoji: '🧟', name: 'Fléau sans nom' },
  { emoji: '🐉', name: 'Drakéide du chaos' },
  { emoji: '💀', name: 'Roi de cendres' },
  { emoji: '🌑', name: 'Éclipse vivante' },
  { emoji: '⚡', name: 'Fureur du firmament' },
  { emoji: '🔮', name: 'Oracle dévorant' },
];

// ── OR : la suite de la courbe écrite à la main, pas une échelle neuve ────────────────
// ⚠️ LE DÉFAUT QU'ON CORRIGE ICI (mesuré). La formule était `2500 + reco × 180` : un socle
// PLAT qui ne devait rien au contenu précédent. Résultat, une FALAISE à la jointure — le
// donjon reco 22 (écrit à la main) rendait 7 120 or, le reco 25 (procédural) en rendait
// **21 180**, soit ×2,97 en un pas là où toute la courbe monte de ×1,05 à ×1,25. Rapporté
// au coût d'un niveau de bâtiment, l'économie devenait 2,3× plus lâche à partir du niveau
// 25 (ratio 0,091 → 0,213) puis se resserrait lentement : un plateau d'or facile posé
// exactement là où le joueur arrive en fin de contenu écrit.
// On repart donc du DERNIER monstre écrit et on continue linéairement. Mesuré : le saut à
// la jointure tombe à ×1,39 (dans la bande des pas voisins) et le ratio or/coût descend
// régulièrement de 0,099 à 0,049 — sans plateau. ⚠️ La fin de courbe est INCHANGÉE
// (reco 94 : 59 970 contre 58 936) : on ne rabote pas l'end-game, on supprime la falaise.
const HAND_LAST_RECO = 22; // dernier donjon écrit à la main (faille_chaos)
const HAND_LAST_GOLD = 2540; // or de son monstre le plus profond (MONSTERS, tier 17)
const PROC_GOLD_SLOPE = 240; // or gagné par niveau de reco au-delà (calé par simulation)

/** Monstre procédural pour un donjon de reco `reco` et un rôle dans le trio. Stats
 *  calibrées relativement au joueur de référence du niveau. `seedIdx` sélectionne le
 *  skin (emoji/nom) de façon déterministe. */
export function proceduralMonster(reco: number, role: MonsterRole, seedIdx: number): Monster {
  const f = refFighter(reco);
  const roleMult = CALIB.role[role] ?? 1;
  // ⚠️ PAS de `gearExpect` ICI. L’attente d’équipement est appliquée par `dungeonFoes`,
  // qui est le point de passage UNIQUE de tous les donjons — écrits à la main comme
  // procéduraux. L’appliquer aussi à la génération la faisait compter DEUX FOIS pour les
  // seuls monstres procéduraux : mesuré, un joueur équilibré et ÉQUIPÉ DE SON NIVEAU
  // clearait 0 % à reco 25, 6 % à 28, 0 % à 40 et 0 % à 79 — tout le contenu au-delà du
  // niveau ~22 était muré, alors que la calibration v0.622 annonçait « clear à son
  // niveau ». Une seule application redonne 73 à 98 %.
  // ⚠️ Le test officiel ne pouvait pas l’attraper : il mesure `proceduralDungeonMonsters`
  // en direct, un chemin que le jeu n’emprunte jamais (ni la 2e application, ni la rampe
  // de difficulté). Il mesure désormais via `dungeonFoes`, le vrai chemin.
  const pv = Math.round(refOffensePerRound(f) * CALIB.kpv * roleMult);
  const damage = Math.round(f.pv * CALIB.kdmg * roleMult);
  const skin =
    PROC_MONSTERS[
      ((seedIdx % PROC_MONSTERS.length) + PROC_MONSTERS.length) % PROC_MONSTERS.length
    ]!;
  // Crit/esquive/initiative modestes, un peu plus « féroces » pour le strong.
  const crit = role === 'strong' ? 0.12 : 0.08;
  return {
    id: `proc_mon_${reco}_${role}`,
    name: skin.name,
    emoji: skin.emoji,
    tier: 17 + reco, // au-delà du bestiaire écrit (chaos = tier 17)
    pv,
    damage,
    crit,
    dodge: 0.05,
    initiative: 16,
    energyCost: 100 + reco * 4,
    gold: Math.round((HAND_LAST_GOLD + (reco - HAND_LAST_RECO) * PROC_GOLD_SLOPE) * roleMult),
    hint: 'Contenu profond : build complet, tout au max.',
  };
}

// ── Donjons + régions procéduraux (reco 25 → 94, au-delà du contenu écrit) ──

// Le contenu écrit à la main va jusqu'à faille_chaos (reco 22). Le procédural prend
// le relais à partir de reco 25, tous les 3 niveaux, groupé en régions de 3 donjons.
const PROC_START_RECO = 25;
const PROC_STEP = 3;
const PROC_REGION_SIZE = 3;
export const PROC_REGION_COUNT = 8; // 8 régions × 3 donjons = 24 donjons (reco 25→94)

/** Recos de tous les donjons procéduraux (ordre croissant). */
export function proceduralRecos(): number[] {
  const n = PROC_REGION_COUNT * PROC_REGION_SIZE;
  return Array.from({ length: n }, (_, i) => PROC_START_RECO + i * PROC_STEP);
}

const PROC_STAT_CYCLE: StatKey[] = ['endurance', 'puissance', 'agilite'];
const PROC_DUNGEON_SKINS: { emoji: string; name: string }[] = [
  { emoji: '🕯️', name: 'Sanctuaire oublié' },
  { emoji: '🌋', name: 'Caldeira maudite' },
  { emoji: '🕸️', name: 'Nid du vide' },
  { emoji: '🌀', name: 'Vortex hurlant' },
  { emoji: '🪐', name: 'Ruine astrale' },
  { emoji: '🦴', name: 'Ossuaire titanesque' },
  { emoji: '🌌', name: 'Brèche cosmique' },
  { emoji: '🔥', name: 'Cœur de l’enfer' },
];

/** Génère les 3 monstres (trio escaladant) d'un donjon procédural de reco donné. */
export function proceduralDungeonMonsters(reco: number): Monster[] {
  return (['weak', 'mid', 'strong'] as const).map((r, i) => proceduralMonster(reco, r, reco + i));
}

/** Donjon procédural pour une reco donnée (index global pour le skin/stat). */
export function proceduralDungeon(reco: number, index: number): Dungeon {
  const skin = PROC_DUNGEON_SKINS[index % PROC_DUNGEON_SKINS.length]!;
  const mons = proceduralDungeonMonsters(reco);
  return {
    id: `proc_dungeon_${reco}`,
    name: skin.name,
    emoji: skin.emoji,
    tier: 15 + (reco - 22), // continue le tier de faille_chaos (15)
    energyCost: 96 + (reco - 22) * 4,
    monsterIds: mons.map((m) => m.id),
    recoLevel: reco,
    hintStat: PROC_STAT_CYCLE[index % PROC_STAT_CYCLE.length]!,
    hint: 'Palier profond — trio escaladant. Build complet, tout au max.',
    dropLevel: reco - 1,
    dropLuck: 1,
    foeMult: proceduralDungeonBoost(reco),
  };
}

const PROC_REGION_SKINS: { emoji: string; color: string; name: string; blurb: string }[] = [
  {
    emoji: '🕯️',
    color: '#C9A24A',
    name: 'Sanctuaires Perdus',
    blurb: 'Reliques d’un âge d’or effondré.',
  },
  { emoji: '🌋', color: '#FF6A45', name: 'Terres Calcinées', blurb: 'Le feu du monde à nu.' },
  { emoji: '🕸️', color: '#9A6BFF', name: 'Toile du Vide', blurb: 'Là où la réalité s’effiloche.' },
  {
    emoji: '🌀',
    color: '#3FB6C6',
    name: 'Spirales Hurlantes',
    blurb: 'Des vents qui broient les âmes.',
  },
  { emoji: '🪐', color: '#6B8BFF', name: 'Confins Astraux', blurb: 'Au bord des étoiles mortes.' },
  {
    emoji: '🦴',
    color: '#B0A18A',
    name: 'Ossuaires Titanesques',
    blurb: 'Le cimetière des colosses.',
  },
  {
    emoji: '🌌',
    color: '#B07CFF',
    name: 'Brèches Cosmiques',
    blurb: 'Le tissu du réel se déchire.',
  },
  {
    emoji: '🔥',
    color: '#FF3B6B',
    name: 'Cœur de l’Enfer',
    blurb: 'Le fond de tout. Il n’y a plus rien après.',
  },
];

/** Régions procédurales groupant les donjons procéduraux (3 par région). */
export function proceduralRegions(): Region[] {
  const recos = proceduralRecos();
  const out: Region[] = [];
  for (let r = 0; r < PROC_REGION_COUNT; r++) {
    const skin = PROC_REGION_SKINS[r % PROC_REGION_SKINS.length]!;
    const ids = recos
      .slice(r * PROC_REGION_SIZE, (r + 1) * PROC_REGION_SIZE)
      .map((reco) => `proc_dungeon_${reco}`);
    out.push({
      id: `proc_region_${r}`,
      name: skin.name,
      emoji: skin.emoji,
      color: skin.color,
      blurb: skin.blurb,
      dungeonIds: ids,
    });
  }
  return out;
}

// ── Boss de palier + sets procéduraux (paliers 30 → 100, tous les 5 niveaux) ──

const BOSS_START = 30;
const BOSS_STEP = 5;
export const BOSS_MILESTONES: number[] = Array.from(
  { length: (100 - BOSS_START) / BOSS_STEP + 1 },
  (_, i) => BOSS_START + i * BOSS_STEP,
); // [30,35,...,100]

// Boss = combat SOLO plus coriace qu'un donjon (fittés par simulation, cf. test).
const BOSS_CALIB = { kpv: 11, kdmg: 0.28 } as const;

// Facteur de GEAR (2026‑08‑15, simulation globale) : contrairement aux donjons, un
// boss se joue quasi toujours ÉQUIPÉ. Or le gear est de plus en plus fort avec le
// niveau (dropMagnitude × itemLevelMult → ratio puissance équipé/nu mesuré ~1,3× au
// niv.10, ~1,7× au 50, ~2,7× au 80). Un boss dérivé du combattant NU était donc
// trivialisé (100 % équipé). On scale ses PV/dégâts par ce facteur (≈ gearRatio^0,72)
// → boss ~50-60 % ÉQUIPÉ au palier (challenge réel, télégraphié par le winPct live).
// ATTENTE D'ÉQUIPEMENT des BOSS (v0.600) — un boss est un combat SOLO (pas d'attrition
// de trio), donc plus « single-target burst » : la survie du joueur (max_pv%/vol de vie)
// pèse encore plus. On calibre plus RAIDE que les donjons (gearExpect) pour que le boss
// challenge un joueur équipé à SON palier (~55-70 %) et MURE un joueur sous-niveau. Appliqué
// UNIFORMÉMENT à tous les boss (main + procéduraux) dans bosses.ts (BOSSES.map).
export function bossGearExpect(level: number): { off: number; pv: number } {
  const L = Math.max(1, level);
  return {
    off: Math.min(3.4, 1.0 + Math.max(0, L - 5) * 0.035),
    pv: Math.min(7, 1.0 + Math.max(0, L - 5) * 0.1),
  };
}

const BOSS_SKINS: { emoji: string; name: string }[] = [
  { emoji: '👺', name: 'Shogun des Ombres' },
  { emoji: '🐙', name: 'Souverain des Abysses' },
  { emoji: '🦅', name: 'Roi-Rapace du Firmament' },
  { emoji: '🕷️', name: 'Reine du Vide' },
  { emoji: '🐍', name: 'Serpent-Monde' },
  { emoji: '👁️', name: 'Regard Primordial' },
  { emoji: '🦖', name: 'Tyran des Âges' },
  { emoji: '🌑', name: 'Dévoreur d’Éclipses' },
  { emoji: '⚔️', name: 'Champion Déchu' },
  { emoji: '🩸', name: 'Seigneur Écarlate' },
  { emoji: '🌪️', name: 'Fléau Tournoyant' },
  { emoji: '💠', name: 'Cristal Conscient' },
  { emoji: '🔱', name: 'Trident du Chaos' },
  { emoji: '☄️', name: 'Comète Vivante' },
  { emoji: '♾️', name: 'Gardien de l’Infini' },
];
const SET_SKINS: { emoji: string; name: string; theme: string }[] = [
  { emoji: '👺', name: 'Masque du Shogun', theme: 'Offensif : frappe et achève.' },
  { emoji: '🐙', name: 'Étreinte Abyssale', theme: 'Vampirique et tenace.' },
  { emoji: '🦅', name: 'Serres du Firmament', theme: 'Crit et vitesse.' },
  { emoji: '🕷️', name: 'Soie du Vide', theme: 'Défensif-punisseur.' },
  { emoji: '🐍', name: 'Écaille-Monde', theme: 'Mur de PV et épines.' },
  { emoji: '👁️', name: 'Œil Primordial', theme: 'Crit dévastateur.' },
  { emoji: '🦖', name: 'Cuir du Tyran', theme: 'Dégâts bruts et survie.' },
  { emoji: '🌑', name: 'Voile d’Éclipse', theme: 'Vol de vie et fureur.' },
  { emoji: '⚔️', name: 'Armure Déchue', theme: 'Défense et riposte.' },
  { emoji: '🩸', name: 'Parure Écarlate', theme: 'Fureur du berserk.' },
  { emoji: '🌪️', name: 'Manteau Tournoyant', theme: 'Vitesse et esquive.' },
  { emoji: '💠', name: 'Éclat Conscient', theme: 'Équilibre parfait.' },
  { emoji: '🔱', name: 'Insigne du Chaos', theme: 'Tout-puissant.' },
  { emoji: '☄️', name: 'Traînée de Comète', theme: 'Élan implacable.' },
  { emoji: '♾️', name: 'Sceau de l’Infini', theme: 'Le set ultime.' },
];
// Combos d'effets de set (2/3/4 pièces) cyclés pour varier les thèmes de build.
const SET_TIER_THEMES: [EffectType, EffectType, EffectType][] = [
  ['damage_pct', 'crit_pct', 'lifesteal_pct'],
  ['max_pv_pct', 'dmg_reduction_pct', 'thorns_pct'],
  ['crit_pct', 'damage_pct', 'max_pv_pct'],
  ['lifesteal_pct', 'max_pv_pct', 'damage_pct'],
  ['dmg_reduction_pct', 'thorns_pct', 'max_pv_pct'],
];

/** Set procédural lâché par le boss de palier `milestone`. */
export function proceduralSet(milestone: number, index: number): ItemSet {
  const skin = SET_SKINS[index % SET_SKINS.length]!;
  const combo = SET_TIER_THEMES[index % SET_TIER_THEMES.length]!;
  const tiers: SetTier[] = [
    { pieces: 2, type: combo[0], base: 9 },
    { pieces: 3, type: combo[1], base: 7 },
    { pieces: 4, type: combo[2], base: 11 },
  ];
  return {
    id: `proc_set_${milestone}`,
    name: skin.name,
    emoji: skin.emoji,
    theme: skin.theme,
    tiers,
  };
}

/** Boss de palier procédural pour `milestone` (30,35,…,100). Stats calibrées
 *  relativement au joueur de référence du palier. */
export function proceduralBoss(milestone: number, index: number): MilestoneBoss {
  const f = refFighter(milestone);
  const skin = BOSS_SKINS[index % BOSS_SKINS.length]!;
  // Baseline NU (refFighter) ; l'attente d'équipement (bossGearExpect) est appliquée
  // UNIFORMÉMENT à tous les boss dans bosses.ts (BOSSES.map) → main + proc cohérents.
  const pv = Math.round(refOffensePerRound(f) * BOSS_CALIB.kpv);
  const damage = Math.round(f.pv * BOSS_CALIB.kdmg);
  return {
    id: `proc_boss_${milestone}`,
    name: skin.name,
    emoji: skin.emoji,
    unlockLevel: milestone,
    energyCost: 100 + (milestone - 25) * 3,
    gold: 1500 + (milestone - 25) * 120,
    setId: `proc_set_${milestone}`,
    dropLevel: milestone,
    hint: 'Boss de palier profond : build complet, tout au max, un peu de chance.',
    combatant: {
      name: skin.name,
      pv,
      damage,
      crit: 0.14,
      dodge: 0.08,
      initiative: 24,
    },
  };
}

/** Tout le contenu procédural, assemblé. */
export function buildProceduralContent(): {
  monsters: Monster[];
  dungeons: Dungeon[];
  regions: Region[];
  bosses: MilestoneBoss[];
  sets: ItemSet[];
} {
  const recos = proceduralRecos();
  const monsters: Monster[] = [];
  const dungeons: Dungeon[] = [];
  recos.forEach((reco, i) => {
    monsters.push(...proceduralDungeonMonsters(reco));
    dungeons.push(proceduralDungeon(reco, i));
  });
  const bosses = BOSS_MILESTONES.map((m, i) => proceduralBoss(m, i));
  const sets = BOSS_MILESTONES.map((m, i) => proceduralSet(m, i));
  return { monsters, dungeons, regions: proceduralRegions(), bosses, sets };
}

// Contenu procédural calculé UNE fois au chargement, à concaténer aux tableaux
// écrits à la main (MONSTERS/DUNGEONS/REGIONS). Ne référence AUCUN de ces tableaux
// (génération autonome) → import type-only vers monsters/dungeons/regions, pas de
// cycle runtime.
export const PROCEDURAL = buildProceduralContent();
