import { mulberry32, combatPower, type Combatant } from '@/lib/combat';
import { rollDrop, bestGearLoadout, playerWithGear, OWN_RANK, SLOTS, type Item } from '@/lib/items';
import { levelCost } from '@/lib/levels';
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
 *  finance (`OWN_RANK`, ~100 donjons par niveau au niveau 30), dans le donjon le plus profond
 *  de chaque niveau. Il tirait 60 objets d'un coup à son niveau : sous la règle du rang qui
 *  s'ouvre progressivement, un tel joueur n'existe pas (il n'aurait presque rien de son rang,
 *  et aucun jet farmé sur le rang d'en dessous). On garde par emplacement les objets qui
 *  apportent le plus au combat, seuls.
 *  Mis en cache : le build est déterministe et coûteux. */
const cache = new Map<string, Combatant>();
const KEEP_PER_SLOT = 10;
export function gearedFighter(L: number, seed = 1, companions = true): Combatant {
  const key = `${L}:${seed}:${companions}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = mulberry32(seed * 7919 + L);
  const s = refBalancedStat(L);
  const stats = { puissance: s, endurance: s, agilite: s };
  const solo = new Map<string, number>();
  const score = (it: Item) => {
    let v = solo.get(it.id);
    if (v == null) {
      v = combatPower(playerWithGear('s', stats, { [it.slot]: it }, undefined, L));
      solo.set(it.id, v);
    }
    return v;
  };
  const bySlot = new Map<string, Item[]>();
  let n = 0;
  for (let l = Math.max(1, L - 12); l <= L; l++) {
    const dg = [...DUNGEONS]
      .filter((x) => x.recoLevel <= l)
      .sort((a, b) => b.recoLevel - a.recoLevel)[0]!;
    // Tirages de `rollDrop` (60 % de réussite) qui donnent `dropsPerClear` objets par donjon.
    const rolls = Math.round(
      ((levelCost(l) * OWN_RANK.energyExtra) / OWN_RANK.energyPerClear) *
        (OWN_RANK.dropsPerClear / 0.6),
    );
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
      const arr = bySlot.get(it.slot) ?? [];
      arr.push(it);
      if (arr.length > 3 * KEEP_PER_SLOT) {
        arr.sort((a, b) => score(b) - score(a));
        arr.length = KEEP_PER_SLOT;
      }
      bySlot.set(it.slot, arr);
    }
  }
  const inv: Item[] = [];
  for (const slot of SLOTS)
    inv.push(
      ...(bySlot.get(slot) ?? []).sort((a, b) => score(b) - score(a)).slice(0, KEEP_PER_SLOT),
    );
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
