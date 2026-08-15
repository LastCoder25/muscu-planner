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
import { playerCombatant, type Combatant } from './combat';
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

/** Monstre procédural pour un donjon de reco `reco` et un rôle dans le trio. Stats
 *  calibrées relativement au joueur de référence du niveau. `seedIdx` sélectionne le
 *  skin (emoji/nom) de façon déterministe. */
export function proceduralMonster(reco: number, role: MonsterRole, seedIdx: number): Monster {
  const f = refFighter(reco);
  const roleMult = CALIB.role[role] ?? 1;
  const pv = Math.round(refOffensePerRound(f) * CALIB.kpv * roleMult);
  const damage = Math.round(f.pv * CALIB.kdmg * roleMult);
  const skin = PROC_MONSTERS[((seedIdx % PROC_MONSTERS.length) + PROC_MONSTERS.length) % PROC_MONSTERS.length]!;
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
    gold: Math.round(2500 + reco * 180 * roleMult),
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
  };
}

const PROC_REGION_SKINS: { emoji: string; color: string; name: string; blurb: string }[] = [
  { emoji: '🕯️', color: '#C9A24A', name: 'Sanctuaires Perdus', blurb: 'Reliques d’un âge d’or effondré.' },
  { emoji: '🌋', color: '#FF6A45', name: 'Terres Calcinées', blurb: 'Le feu du monde à nu.' },
  { emoji: '🕸️', color: '#9A6BFF', name: 'Toile du Vide', blurb: 'Là où la réalité s’effiloche.' },
  { emoji: '🌀', color: '#3FB6C6', name: 'Spirales Hurlantes', blurb: 'Des vents qui broient les âmes.' },
  { emoji: '🪐', color: '#6B8BFF', name: 'Confins Astraux', blurb: 'Au bord des étoiles mortes.' },
  { emoji: '🦴', color: '#B0A18A', name: 'Ossuaires Titanesques', blurb: 'Le cimetière des colosses.' },
  { emoji: '🌌', color: '#B07CFF', name: 'Brèches Cosmiques', blurb: 'Le tissu du réel se déchire.' },
  { emoji: '🔥', color: '#FF3B6B', name: 'Cœur de l’Enfer', blurb: 'Le fond de tout. Il n’y a plus rien après.' },
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
function bossGearMult(level: number): number {
  const L = Math.max(1, level);
  return 1 + 0.006 * L + 0.0001 * L * L;
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
  return { id: `proc_set_${milestone}`, name: skin.name, emoji: skin.emoji, theme: skin.theme, tiers };
}

/** Boss de palier procédural pour `milestone` (30,35,…,100). Stats calibrées
 *  relativement au joueur de référence du palier. */
export function proceduralBoss(milestone: number, index: number): MilestoneBoss {
  const f = refFighter(milestone);
  const skin = BOSS_SKINS[index % BOSS_SKINS.length]!;
  const g = bossGearMult(milestone); // le boss se joue équipé → on scale au gear du palier
  const pv = Math.round(refOffensePerRound(f) * BOSS_CALIB.kpv * g);
  const damage = Math.round(f.pv * BOSS_CALIB.kdmg * g);
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
