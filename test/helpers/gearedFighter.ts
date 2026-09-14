import { mulberry32, combatPower, type Combatant } from '@/lib/combat';
import { rollDrop, bestGearLoadout, playerWithGear, type Item } from '@/lib/items';
import { refBalancedStat } from '@/lib/proceduralContent';
import { rollTalentDrop, talentEffects, talentsEarned, pickBestTalents } from '@/lib/talents';
import { rollActivityFamiliar } from '@/data/familiars';

/** Joueur ÉQUIPÉ réaliste de niveau `L` : farme ~60 objets à son niveau, 3 familiers et 10
 *  talents, et garde le meilleur build (même enchaînement que `computeGearPlan`).
 *  ⚠️ Il ne portait QUE des objets jusqu'en v0.845 : c'est ce qui laissait les tests verts
 *  pendant qu'un vrai joueur (talent + familier en plus) roulait sur le contenu. On mesure le
 *  joueur qui existe. `companions: false` rend le joueur « objets seuls » (ablation).
 *  Mis en cache : le build est déterministe et coûteux. */
const cache = new Map<string, Combatant>();
export function gearedFighter(L: number, seed = 1, companions = true): Combatant {
  const key = `${L}:${seed}:${companions}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = mulberry32(seed * 7919 + L);
  const inv: Item[] = [];
  for (let i = 0; i < 60; i++) {
    const d = rollDrop(rng, { cleared: true, defeated: 1, level: L, luck: 0.4, playerLevel: L });
    if (d) inv.push({ ...d, id: 'i' + i });
  }
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
  const s = refBalancedStat(L);
  const stats = { puissance: s, endurance: s, agilite: s };
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
