// fortressAssault.ts — 🏰 L'ASSAUT D'UNE FORTERESSE ENNEMIE, À RENDEMENT DÉCROISSANT. Pur/testé.
//
// ⚖️ DÉCISION DE L'UTILISATEUR (2026-10-19) : « arriver lvl 55 ou 60 avec 10 ou 30 champions
// n'a pas le même impact », mais « je veux quand même que le joueur actif soit récompensé ».
// Sans règle, l'attaque combinée additionne tout le vivier : 30 champions prenaient la
// forteresse de fin d'île bien avant 10. Désormais les `full` champions les plus forts comptent
// en entier, chaque suivant `decay` fois le précédent (7ᵉ 70 %, 8ᵉ 49 %…) : la force d'un vivier
// infini plafonne à `full + decay / (1 − decay)` champions (≈ 8,3). Le héros compte toujours en
// entier (il est déjà borné à `HERO_PARTY_WORTH` champions).
// ⚠️ SEULE la fusion du groupe est pondérée (`fortressGroup`) : le récit du combat (qui tombe,
// qui abat qui) garde les unités telles qu'elles sont — un champion compté à 24 % n'est pas
// plus fragile, il pèse moins dans la balance.
// ⚠️ Seulement contre une forteresse ENNEMIE : la défense d'une forteresse tenue garde sa règle.
import { combatPowerRaw } from './combat';
import type { Combatant } from './combat';
import { fuseUnits, type SkirmishUnit } from './skirmish';
import type { Poi } from './expedition';

export const FORTRESS_ASSAULT = {
  /** Champions comptés en entier. */
  full: 6,
  /** Ce que vaut chaque champion suivant, rapporté au précédent. */
  decay: 0.7,
} as const;

const HERO_ID = 'hero';

/** 🏰 Le lieu est-il une forteresse ennemie (la cible de fin d'île) ? */
export function isEnemyFortress(poi: Pick<Poi, 'type' | 'control'>): boolean {
  return (
    poi.type === 'control' && poi.control?.kind === 'fortress' && poi.control.owner === 'enemy'
  );
}

/** Le poids du `rank`-ième champion (0 = le plus fort). */
export function fortressRankWeight(rank: number): number {
  const { full, decay } = FORTRESS_ASSAULT;
  return rank < full ? 1 : Math.pow(decay, rank - full + 1);
}

/**
 * ⚖️ Le poids de chaque unité du groupe, par id : les champions (et miliciens) classés du plus
 * fort au plus faible (`combatPowerRaw`, égalité départagée par l'id : stable), le héros à 1.
 */
export function fortressWeights(units: readonly SkirmishUnit[]): Map<string, number> {
  const out = new Map<string, number>();
  const ranked = units
    .filter((u) => u.id !== HERO_ID)
    .map((u) => ({ id: u.id, p: combatPowerRaw(u.combatant) }))
    .sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  ranked.forEach((u, i) => out.set(u.id, fortressRankWeight(i)));
  if (units.some((u) => u.id === HERO_ID)) out.set(HERO_ID, 1);
  return out;
}

/** Un combattant ramené à `w` de sa force : PV et dégâts (survie et offense sont linéaires). */
function scaled(c: Combatant, w: number): Combatant {
  if (w >= 1) return c;
  return { ...c, pv: Math.max(1, c.pv * w), damage: Math.max(1e-6, c.damage * w) };
}

/** 🏰 Le groupe FONDU qui combat une forteresse ennemie : chaque unité à son poids. */
export function fortressGroup(units: readonly SkirmishUnit[], name: string): Combatant {
  const w = fortressWeights(units);
  return fuseUnits(
    units.map((u) => ({ ...u, combatant: scaled(u.combatant, w.get(u.id) ?? 1) })),
    name,
  );
}

/** Le groupe fondu contre `poi` : pondéré contre une forteresse ennemie, plein sinon. */
export function assaultGroup(
  poi: Pick<Poi, 'type' | 'control'>,
  units: readonly SkirmishUnit[],
  name: string,
): Combatant {
  return isEnemyFortress(poi) ? fortressGroup(units, name) : fuseUnits(units, name);
}
