import { mulberry32, combatPower, type Combatant } from '@/lib/combat';
import {
  rollDrop,
  rollSetPiece,
  setPiecesPerLevel,
  bestGearLoadout,
  playerWithGear,
  mergeEffects,
  dropsPerLevel,
  DROP_CHANCE,
  SLOTS,
  type Item,
} from '@/lib/items';
import { VOIES } from '@/lib/voies';
import { BOSSES } from '@/data/bosses';
import { refBalancedStat } from '@/lib/proceduralContent';
import { rollTalentDrop, talentEffects, talentsEarned, pickBestTalents } from '@/lib/talents';
import { rollActivityFamiliar } from '@/data/familiars';
import { DUNGEONS } from '@/data/dungeons';

/** Joueur ÉQUIPÉ réaliste de niveau `L`, 3 familiers et 10 talents, qui garde le meilleur
 *  build (même enchaînement que `computeGearPlan`).
 *  ⚠️ Il ne portait QUE des objets jusqu'en v0.845 : c'est ce qui laissait les tests verts
 *  pendant qu'un vrai joueur (talent + familier en plus) roulait sur le contenu. On mesure le
 *  joueur qui existe. `companions: false` rend le joueur « objets seuls » (ablation).
 *  ⚠️ v0.894 : il ACCUMULE son butin sur ses 13 derniers niveaux, au volume qu'un niveau
 *  finance (`dropsPerLevel`, ~100 donjons par niveau au niveau 30), dans le donjon le plus
 *  profond de chaque niveau. Il tirait 60 objets d'un coup à son niveau : sous la règle du rang
 *  qui s'ouvre progressivement, un tel joueur n'existe pas. On garde par emplacement les
 *  objets qui apportent le plus au combat, SEULS.
 *  Mis en cache : le build est déterministe et coûteux. */
const cache = new Map<string, GearedBuild>();
const KEEP_PER_SLOT = 10;
/** Donjons du plus profond au moins profond : le 1er dont le reco ≤ l est celui qu'on farme. */
const DEEPEST_FIRST = [...DUNGEONS].sort((a, b) => b.recoLevel - a.recoLevel);

/** Le build DÉTAILLÉ, pour les tests qui ont besoin des pièces et pas seulement du
 *  combattant fondu (le trophée s'ajoute au sac, s'échange, se compare).
 *  ⚠️ `gearedFighter` n'en est que la dernière ligne : un seul modèle de joueur, donc un
 *  seul endroit à corriger le jour où il cesse d'être réaliste. `test/trophy.test.ts`
 *  portait ses propres `geared`/`realistic` — 60 tirages d'un coup au niveau L, un joueur
 *  que la règle d'ouverture du rang (v0.894) ne produit plus. */
export interface GearedBuild {
  stats: { puissance: number; endurance: number; agilite: number };
  /** Le sac : objets gardés + familiers (les talents vivent à part). */
  inv: Item[];
  /** L'équipement retenu par l'optimiseur. */
  eq: Record<string, Item | undefined>;
  /** Les effets des talents ÉQUIPÉS (vide si `companions` est faux). */
  fx: ReturnType<typeof talentEffects>;
  /** ⚔️ Sa VOIE (tournante selon la graine) : il farme aussi le SET de cette voie sur les boss
   *  (2026-09-22 : les sets sont faits pour être portés — un joueur qui porte son set doit
   *  rester dans les bandes de difficulté, donc le joueur de référence le porte aussi). */
  voie: string | null;
}

export function gearedFighter(L: number, seed = 1, companions = true, sets = true): Combatant {
  const b = gearedBuild(L, seed, companions, sets);
  return playerWithGear('geared', b.stats, b.eq, b.fx, L, b.voie);
}

/** Pièces du set de `voie` qu'un joueur ramasse sur ses 13 derniers niveaux, au volume
 *  qu'un niveau finance (`setPiecesPerLevel`), sur le boss de palier le plus profond. */
function voieSetPool(L: number, rng: () => number, voie: string): Item[] {
  const out: Item[] = [];
  let n = 0;
  for (let l = Math.max(1, L - 12); l <= L; l++) {
    const boss = [...BOSSES].filter((b) => b.unlockLevel <= l).pop();
    if (!boss) continue;
    const x = setPiecesPerLevel(l);
    const k = Math.floor(x) + (rng() < x % 1 ? 1 : 0);
    for (let i = 0; i < k; i++)
      out.push({
        ...rollSetPiece(rng, {
          setId: `voie:${voie}`,
          level: boss.dropLevel,
          luck: 0.6,
          playerLevel: l,
        }),
        id: `s${n++}`,
      } as Item);
  }
  return out;
}

export function gearedBuild(L: number, seed = 1, companions = true, sets = true): GearedBuild {
  const key = `${L}:${seed}:${companions}:${sets}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = mulberry32(seed * 7919 + L);
  const s = refBalancedStat(L);
  const stats = { puissance: s, endurance: s, agilite: s };
  // Top KEEP_PER_SLOT par emplacement, gardé TRIÉ (décroissant) : chaque objet est noté une
  // fois, et rejeté d'emblée s'il ne bat pas le dernier gardé.
  const top = new Map<string, { it: Item; v: number }[]>();
  let n = 0;
  for (let l = Math.max(1, L - 12); l <= L; l++) {
    const dg = DEEPEST_FIRST.find((x) => x.recoLevel <= l) ?? DEEPEST_FIRST.at(-1)!;
    // Tirages de `rollDrop` qui donnent en moyenne `dropsPerLevel(l)` objets.
    const rolls = Math.round(dropsPerLevel(l) / DROP_CHANCE.cleared);
    for (let i = 0; i < rolls; i++) {
      const d = rollDrop(rng, {
        cleared: true,
        defeated: 1,
        level: dg.dropLevel,
        luck: dg.dropLuck,
        playerLevel: l,
      });
      if (!d) continue;
      const it = { ...d, id: 'i' + n++ } as Item;
      const arr = top.get(it.slot) ?? [];
      const v = combatPower(playerWithGear('s', stats, { [it.slot]: it }, undefined, L));
      if (arr.length >= KEEP_PER_SLOT && v <= arr[arr.length - 1]!.v) continue;
      const at = arr.findIndex((x) => x.v < v);
      arr.splice(at < 0 ? arr.length : at, 0, { it, v });
      if (arr.length > KEEP_PER_SLOT) arr.pop();
      top.set(it.slot, arr);
    }
  }
  const inv: Item[] = SLOTS.flatMap((slot) => (top.get(slot) ?? []).map((x) => x.it));
  const voie = sets ? VOIES[(seed - 1) % VOIES.length]!.id : null;
  if (voie) inv.push(...voieSetPool(L, mulberry32(seed * 101 + L), voie));
  const talents = [];
  if (companions) {
    for (let i = 0; i < 3; i++)
      inv.push({
        ...rollActivityFamiliar(rng, { level: L, luck: 0.4, playerLevel: L }),
        id: 'f' + i,
      });
    for (let i = 0; i < 10; i++)
      talents.push({
        ...rollTalentDrop(rng, { level: L, luck: 0.4, playerLevel: L }),
        id: 't' + i,
      });
  }
  const fx = (ids: string[]) => {
    const t = talentEffects(talents.map((t) => ({ ...t, equipped: ids.includes(t.id) })));
    return t;
  };
  // 1re passe sans polissage (point de départ du choix de talent), comme `computeGearPlan`.
  const draft = bestGearLoadout('g', stats, {}, inv, L, fx([]), voie, undefined, false);
  const ids = pickBestTalents(talents, talentsEarned(L), (x) =>
    combatPower(playerWithGear('g', stats, draft, fx(x), L, voie)),
  );
  const eff = fx(ids);
  const build: GearedBuild = {
    stats,
    inv,
    eq: bestGearLoadout('g', stats, draft, inv, L, eff, voie),
    fx: eff,
    voie,
  };
  cache.set(key, build);
  return build;
}
