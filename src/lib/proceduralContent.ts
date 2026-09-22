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
  const ge = gearBudget(L);
  // Le coefficient du contenu multiplie PV et dégâts : il multiplie la puissance attendue.
  const k = boss ? CONTENT_K.boss : CONTENT_K.dungeon;
  return Math.round(base * Math.sqrt(ge.off * ge.pv) * k);
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

// ── 📐 LE BUDGET D'ÉQUIPEMENT (refonte équipement, étape 7) — UNE seule courbe ──
// `gearBudget(L)` = ce que l'équipement COMPLET du joueur de RÉFÉRENCE apporte au niveau L,
// rapporté au même joueur nu : ×attaque (`off`) et ×survie (`pv`). Le joueur de référence
// est celui des tests (`test/helpers/gearedFighter`) : il ACCUMULE son butin niveau après
// niveau sur les 7 emplacements (relique à pouvoir comprise), avec familiers et talent — donc
// l'ouverture progressive des rangs y est DÉJÀ (spec § 5).
// ⚠️ LA TABLE EST LA MESURE (4 graines par niveau, lissée, monotone). Elle REMPLACE l'ancienne
// `gearExpect` à pente écrite à la main ET les cinq tables qui rattrapaient l'écart
// (`ITEM_RANK_RELIEF`, `RANK_OPENING_RELIEF`, `PROC_DUNGEON_BOOST`, `LABY_CONTENT_BOOST`,
// `bossContentBoost`). S'il reste un écart, il se corrige ICI ou dans le coefficient du
// contenu (`CONTENT_K`), jamais dans une table de plus.
// ⚠️ UN SEGMENT PAR RANG, pas une pente lisse : la force du joueur de référence MONTE PAR
// MARCHES, au passage de chaque rang (tous les 10 niveaux — nouvelle rareté, un affixe de plus,
// puis l'effet légendaire), et reste presque plate à l'intérieur d'un rang. Mesuré à chaque
// niveau (6 graines, `offenseOf`/`survivalOf` du joueur équipé rapportés au joueur nu), puis
// ajusté par un segment par rang et rendu non décroissant (le bruit faisait reculer deux
// segments). Marches d'attaque mesurées : +11 % (niveau 32), +25 % (41), +9 % (51), +32 % (61),
// +43 % (71), +35 % (81). C'est cette forme en marches que l'ancienne table « rang × étoile »
// (`RANK_OPENING_RELIEF`) rattrapait après coup : elle est ici DANS le budget (spec § 5).
// ⚠️ LA DERNIÈRE COLONNE est ce que `offenseOf`/`survivalOf` NE VOIENT PAS : effets
// légendaires (dès le rang 51), pouvoir de relique, signatures de set. Elle multiplie l'attaque
// ET la survie attendues. Mesurée APRÈS les deux premières, en vrai combat : multiplicateur de
// monstre qui ramène le joueur de référence à 70 % de nettoyage (donjons, 6 graines × 25) et
// 55 % au palier (boss) — les deux concordent rang par rang (niveaux 51-100 : ×1,14 à ×1,23).
// Re-mesurée quand la puissance affichée a compté le vol de vie pour sa valeur réelle (étape 7) :
// le joueur de référence, qui choisit son équipement à la puissance, en porte davantage.
// ⚠️ 2026-09-22 : les SETS sont remontés pour valoir le coup (+13 à +28 % contre les drops) et
// le joueur de référence farme et PORTE désormais le set de sa voie (`gearedFighter`). Part
// invisible multipliée par l'écart mesuré entre les deux joueurs de référence (8 voies, boss
// et donjon moyennés) : ×1,00 (rang 1) · ×1,07 (2-3) · ×1,07 (4-5) · ×1,08 (6) · ×1,14 (7) ·
// ×1,10 (8) · ×1,22 (9) · ×1,20 (10), puis, rangs 6 à 10, recherche directe du multiplicateur
// qui ramène ce joueur à ~72 % de nettoyage et ~57 % au palier : ×1,06 · ×1,12 · ×1,22 · ×1,11 ·
// ×1,09. Un joueur qui ne porte pas son set est donc en dessous.
// ⚠️ 2026-09-22 (SETS SPÉCIALISÉS : stats de voie, signatures qui s'en nourrissent, puissance
// ré-alignée sur le combat) : recherche directe rang par rang (8 voies × 20 combats, donjon le
// plus profond et boss du palier) du multiplicateur qui ramène le joueur de référence à ~72 %
// et ~57 % — donjon et boss concordent : ×0,94 (rangs 3-4) · ×0,96 (5) · ×1,20 (6) · ×1,21 (7) ·
// ×1,29 (8) · ×1,27 (9-10). Rangs 1-2 inchangés (tutoriel et rampe d'amorçage, déjà testés).
// [premier niveau, dernier, attaque début, fin, survie début, fin, part invisible]
const GEAR_BUDGET_BY_RANK: [number, number, number, number, number, number, number][] = [
  [1, 10, 1.0, 1.27, 1.06, 1.38, 1],
  [11, 20, 1.27, 1.3, 1.38, 1.46, 1.07],
  [21, 30, 1.3, 1.54, 1.5, 1.68, 1.01],
  [31, 40, 1.7, 1.75, 1.77, 1.95, 1.06],
  [41, 50, 1.96, 2.46, 2.0, 2.17, 1.085],
  // ⚠️ RECALÉE (v0.1087) après le conditionnement des procs qui amplifient une stat absente :
  // l'optimiseur cessant d'équiper un objet pour un pouvoir qui ne se déclenchera jamais, le
  // joueur de référence gagne 7 à 17 points de clear à partir du niveau 55. Facteur MESURÉ par
  // bissection du multiplicateur de monstre qui le ramène à son taux d'avant : boss 40 ×1,004
  // (rien), donjon 49 ×1,001 (rien), boss 55 ×1,061, boss 70 ×1,099, donjon 79 ×1,064,
  // boss 85 ×1,086. Sous le niveau 50, rien ne bouge — les effets légendaires n'arrivent
  // qu'au rang Légendaire. Le segment 91-100 n'est pas mesuré : il prend la moyenne (×1,08).
  [51, 60, 2.74, 2.8, 2.2, 2.46, 1.8],
  [61, 70, 3.58, 3.74, 2.72, 3.1, 1.99],
  [71, 80, 4.76, 4.85, 3.14, 3.77, 1.98],
  [81, 90, 5.62, 5.62, 3.95, 4.15, 1.98],
  [91, 100, 5.65, 6.19, 4.15, 4.2, 1.95],
];
export function gearBudget(level: number): { off: number; pv: number } {
  const L = Math.min(100, Math.max(1, level));
  const seg = GEAR_BUDGET_BY_RANK.find(([l0, l1]) => L >= l0 && L <= l1)!;
  const [l0, l1, o0, o1, p0, p1, hidden] = seg;
  const t = (L - l0) / (l1 - l0);
  return { off: (o0 + (o1 - o0) * t) * hidden, pv: (p0 + (p1 - p0) * t) * hidden };
}
/** L'équipement que tout contenu suppose : le budget (spec § 5). */
export function gearExpect(level: number): { off: number; pv: number } {
  return gearBudget(level);
}
/** Attente d'un DONJON : le budget. (La rampe d'amorçage d'avant est dans le budget lui-même :
 *  mesuré, il vaut ×1 au niveau 1 — l'équipement ne vient que des donjons.) */
export function dungeonGearExpect(level: number): { off: number; pv: number } {
  return gearBudget(level);
}
/** Attente d'un BOSS : le budget aussi. Le boss se distingue par son coefficient (`CONTENT_K`). */
export function bossGearExpect(level: number): { off: number; pv: number } {
  return gearBudget(level);
}

/** 🎚️ COEFFICIENT DE DIFFICULTÉ par type de contenu (PV ET dégâts), MESURÉ sur le joueur de
 *  référence : donjon ~70 % de nettoyage à son niveau, boss 50-60 % au palier, Labyrinthe ~70 %
 *  au niveau conseillé. Un seul nombre par type — c'est ce qui remplace les tables.
 *  Mesuré (multiplicateur qui amène le joueur de référence à sa cible) : donjons ×1,0 sur toute
 *  la chaîne une fois le budget posé ; boss générés ×1,17 en moyenne (0,98 à 1,38, sans pente) —
 *  les 5 boss écrits à la main ont été ramenés à leur base dans `bosses.ts`.
 *  ⚠️ Pas `as const` : les sondes de calibration le font varier (sans effet en jeu). */
export const CONTENT_K: { dungeon: number; boss: number; laby: number } = {
  dungeon: 1,
  boss: 1.17,
  laby: 1.47,
};

/** 🌀 RAMPE D'ATTRITION DU LABYRINTHE — 0,4 au niveau 2, 1 à partir du niveau 40.
 *  ⚠️ Mesurée, pas choisie : palier par palier, le multiplicateur qui amène le joueur de
 *  référence à sa cible (90 % sur les paliers d'initiation, 70 % ailleurs) vaut ×0,59 · 0,66 ·
 *  0,72 · 0,85 · 0,88 · 1,16 puis ×1,47 à partir du niveau 40 (Chaos, Astral, Néant, Infini).
 *  Le Labyrinthe est une LONGUE attrition : régénération, vol de vie, effets légendaires et
 *  pouvoir de relique y pèsent sur toute une descente, et le joueur de début de partie n'en a
 *  aucun. Les donjons, eux, suivent le budget sans pente (×1,0 sur toute la chaîne). */
function labyAttritionRamp(level: number): number {
  return (
    (0.4 + 0.6 * Math.min(1, Math.max(0, level - 2) / 38)) * interpolate(LABY_SPEC_RELIEF, level)
  );
}

/** ⚠️ 2026-09-22 — SETS SPÉCIALISÉS : recherche directe, palier par palier (8 voies × 16
 *  descentes), du multiplicateur qui ramène le joueur de référence à ~70 % à son niveau.
 *  Le budget d'équipement a été relevé pour les donjons et les boss dès le rang 6 ; une
 *  longue descente ne suit pas la même pente (la barrière de départ ne sert plus qu'une fois
 *  par descente). Paliers d'initiation (≤ 20) inchangés : ils visent 90 %, déjà testés. */
const LABY_SPEC_RELIEF: [number, number][] = [
  [6, 1],
  [12, 1.2],
  [20, 1],
  [28, 0.88],
  [40, 0.66],
  [52, 0.5],
  [66, 0.6],
  [85, 0.7],
];

/** Lecture d'une table de points mesurés [niveau, valeur] : interpolée entre deux points,
 *  valeur du bout le plus proche au-delà.
 *  ⚠️ EXPORTÉE : `rift.ts` lit sa propre table de renfort avec la MÊME fonction — deux
 *  interpolations écrites séparément finiraient par ne plus arrondir pareil. */
export function interpolate(t: [number, number][], x: number): number {
  const i = t.findIndex(([l]) => x <= l);
  if (i === 0) return t[0]![1];
  if (i < 0) return t.at(-1)![1];
  const [l0, b0] = t[i - 1]!;
  const [l1, b1] = t[i]!;
  return b0 + ((b1 - b0) * (x - l0)) / (l1 - l0);
}

// ── LABYRINTHE : force des créatures ──
// Même règle que les donjons : le budget × le coefficient du Labyrinthe (`CONTENT_K.laby`).
// Source UNIQUE : le combat (`makeMonster`) et l'estimation du % de réussite la lisent tous deux.
export function labyrinthFoeBase(
  level: number,
  isBoss: boolean,
  depth: number,
): { pv: number; damage: number } {
  const ref = refFighter(level);
  const d = 0.85 + 0.55 * depth; // 0,85 (surface) → 1,4 (fond)
  // Coussin bas niveau sur les dégâts : 0,5 à L1 → 1 à L18+ (petits nombres + variance).
  const lowEase = 0.5 + 0.5 * Math.min(1, level / 18);
  const ge = gearBudget(level);
  const k = CONTENT_K.laby * labyAttritionRamp(level);
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
// UN nom par donjon, rangés PAR RÉGION (3 par ligne, dans l'ordre de `PROC_REGION_SKINS`) :
// chaque donjon porte le thème de la région qui le contient. ⚠️ Avant, 8 noms tournaient
// sur 24 donjons (`index % 8`) — chacun revenait trois fois, et sans rapport avec sa région
// (qui, elle, se calcule par `index / 3`). Un test exige 24 noms distincts.
const PROC_DUNGEON_SKINS: { emoji: string; name: string }[] = [
  // Sanctuaires Perdus
  { emoji: '🕯️', name: 'Sanctuaire oublié' },
  { emoji: '🏛️', name: 'Nef effondrée' },
  { emoji: '📿', name: 'Reliquaire scellé' },
  // Terres Calcinées
  { emoji: '🌋', name: 'Caldeira maudite' },
  { emoji: '🔥', name: 'Forge des cendres' },
  { emoji: '♨️', name: 'Plaine de braise' },
  // Toile du Vide
  { emoji: '🕸️', name: 'Nid du vide' },
  { emoji: '🕷️', name: 'Tanière tisseuse' },
  { emoji: '🧵', name: 'Trame effilochée' },
  // Spirales Hurlantes
  { emoji: '🌀', name: 'Vortex hurlant' },
  { emoji: '🌪️', name: 'Œil du cyclone' },
  { emoji: '💨', name: 'Couloir des vents' },
  // Confins Astraux
  { emoji: '🪐', name: 'Ruine astrale' },
  { emoji: '☄️', name: 'Cratère stellaire' },
  { emoji: '🌠', name: 'Observatoire mort' },
  // Ossuaires Titanesques
  { emoji: '🦴', name: 'Ossuaire titanesque' },
  { emoji: '💀', name: 'Charnier des géants' },
  { emoji: '⚰️', name: 'Crypte colossale' },
  // Brèches Cosmiques
  { emoji: '🌌', name: 'Brèche cosmique' },
  { emoji: '🕳️', name: 'Gouffre du réel' },
  { emoji: '✴️', name: 'Déchirure primordiale' },
  // Cœur de l'Enfer
  { emoji: '👹', name: 'Antichambre infernale' },
  { emoji: '⛓️', name: 'Geôle des damnés' },
  { emoji: '🔥', name: 'Cœur de l’enfer' },
];

/** Génère les 3 monstres (trio escaladant) d'un donjon procédural de reco donné. */
export function proceduralDungeonMonsters(reco: number): Monster[] {
  return (['weak', 'mid', 'strong'] as const).map((r, i) => proceduralMonster(reco, r, reco + i));
}

/** Donjon procédural pour une reco donnée (index global pour le skin/stat). */
export function proceduralDungeon(reco: number, index: number): Dungeon {
  const skin = PROC_DUNGEON_SKINS[index] ?? PROC_DUNGEON_SKINS[index % PROC_DUNGEON_SKINS.length]!;
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
    // Couvre les PROC_STEP − 1 niveaux jusqu'au donjon suivant. ⚠️ Avec `dropLevel = reco`,
    // aux niveaux 41, 51 et 71 (débuts de rang) aucun donjon n'avait un butin à son
    // niveau (40 → 43, 49 → 52, 70 → 73) : le nouveau rang y était introuvable en donjon.
    // Sans risque : la référence du tirage est min(dropLevel, niveau joueur), donc un
    // joueur AU niveau conseillé voit exactement le même butin qu'avant.
    dropLevel: reco + PROC_STEP - 1,
    dropLuck: 1,
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
