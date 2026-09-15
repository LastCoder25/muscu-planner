import { mulberry32, combatPower, type Combatant } from '@/lib/combat';
import {
  rollDrop,
  bestGearLoadout,
  playerWithGear,
  dropsPerLevel,
  DROP_CHANCE,
  SLOTS,
  type Item,
} from '@/lib/items';
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
const cache = new Map<string, Combatant>();
const KEEP_PER_SLOT = 10;
/** Donjons du plus profond au moins profond : le 1er dont le reco ≤ l est celui qu'on farme. */
const DEEPEST_FIRST = [...DUNGEONS].sort((a, b) => b.recoLevel - a.recoLevel);

export function gearedFighter(L: number, seed = 1, companions = true): Combatant {
  const key = `${L}:${seed}:${companions}`;
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
  const fx = (ids: string[]) =>
    talentEffects(talents.map((t) => ({ ...t, equipped: ids.includes(t.id) })));
  // 1re passe sans polissage (point de départ du choix de talent), comme `computeGearPlan`.
  const draft = bestGearLoadout('g', stats, {}, inv, L, {}, undefined, undefined, false);
  const ids = pickBestTalents(talents, talentsEarned(L), (x) =>
    combatPower(playerWithGear('g', stats, draft, fx(x), L)),
  );
  const eff = fx(ids);
  const p = playerWithGear(
    'geared',
    stats,
    bestGearLoadout('g', stats, draft, inv, L, eff),
    eff,
    L,
  );
  cache.set(key, p);
  return p;
}
