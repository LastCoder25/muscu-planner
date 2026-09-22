import { expect, it } from 'vitest';
import { combatPower, mulberry32 } from '@/lib/combat';
import {
  bestGearLoadout,
  playerWithGear,
  rollDrop,
  rollSetPiece,
  VOIE_SETS,
  SLOTS,
  type Equipped,
  type Item,
  type ItemSlot,
} from '@/lib/items';
import { refBalancedStat } from '@/lib/proceduralContent';

function pool(seed: number, L: number, perSlot: number, slots: readonly ItemSlot[]): Item[] {
  const rng = mulberry32(seed);
  const by = new Map<string, Item[]>();
  let n = 0;
  while ([...slots].some((s) => (by.get(s)?.length ?? 0) < perSlot) && n < 20000) {
    n++;
    const set = rng() < 0.35;
    const d = set
      ? rollSetPiece(rng, { setId: VOIE_SETS[Math.floor(rng() * 3)]!.id, level: L, playerLevel: L })
      : rollDrop(rng, { cleared: true, defeated: 1, level: L, luck: 0.5, playerLevel: L });
    if (!d || !slots.includes(d.slot)) continue;
    const arr = by.get(d.slot) ?? [];
    if (arr.length >= perSlot) continue;
    arr.push({ ...d, id: `i${seed}-${n}` } as Item);
    by.set(d.slot, arr);
  }
  return [...by.values()].flat();
}

// Refonte de l'équipement (étape 6) : 7 emplacements. L'ancien balayage exhaustif avait une
// boucle imbriquée par emplacement ; la montée pas à pas qui le remplace doit retrouver le
// même résultat. Mesuré à l'écriture : 120/120 sur 4 emplacements, 39/40 sur 7 (le 40e à
// 0,07 % du meilleur), 21 ms sur un sac de 805 objets (≈ 3 s avant).
it('l’équipement conseillé retrouve le meilleur build, vite, sur 7 emplacements', () => {
  const L = 40;
  const s = refBalancedStat(L);
  const stats = { puissance: s, endurance: s, agilite: s };
  const SL4: ItemSlot[] = ['weapon', 'armor', 'accessory', 'relic'];
  let agree = 0;
  let total = 0;
  let worst = 1;
  for (let seed = 1; seed <= 120; seed++) {
    const inv = pool(seed, L, 5, SL4);
    const voie = VOIE_SETS[seed % 3]!.id.replace('voie:', '');
    const got = bestGearLoadout('T', stats, {}, inv, L, {}, voie);
    const pGot = combatPower(playerWithGear('T', stats, got, {}, L, voie));
    // Recherche exhaustive vraie : toutes les combinaisons (vide compris).
    const by = SL4.map((sl) => [undefined, ...inv.filter((i) => i.slot === sl)]);
    let pBest = -1;
    for (const a of by[0]!)
      for (const b of by[1]!)
        for (const c of by[2]!)
          for (const d of by[3]!) {
            const e: Equipped = {};
            if (a) e.weapon = a;
            if (b) e.armor = b;
            if (c) e.accessory = c;
            if (d) e.relic = d;
            const p = combatPower(playerWithGear('T', stats, e, {}, L, voie));
            if (p > pBest) pBest = p;
          }
    total++;
    if (pGot >= pBest) agree++;
    worst = Math.min(worst, pGot / pBest);
  }
  expect(agree).toBe(total); // 4 emplacements : toujours le meilleur
  expect(worst).toBe(1);
  // 7 emplacements, petits sacs : exhaustif vrai (4^7 combinaisons).
  let ag7 = 0;
  let worst7 = 1;
  for (let seed = 1; seed <= 40; seed++) {
    const inv = pool(seed + 500, L, 3, SLOTS);
    const voie = VOIE_SETS[seed % 3]!.id.replace('voie:', '');
    const got = bestGearLoadout('T', stats, {}, inv, L, {}, voie);
    const pGot = combatPower(playerWithGear('T', stats, got, {}, L, voie));
    const lists = SLOTS.map((sl) => [undefined, ...inv.filter((i) => i.slot === sl)]);
    let pBest = -1;
    const rec = (k: number, e: Equipped) => {
      if (k === SLOTS.length) {
        const q = combatPower(playerWithGear('T', stats, e, {}, L, voie));
        if (q > pBest) pBest = q;
        return;
      }
      for (const it of lists[k]!) {
        const f = { ...e };
        if (it) f[SLOTS[k]!] = it;
        rec(k + 1, f);
      }
    };
    rec(0, {});
    if (pGot >= pBest) ag7++;
    worst7 = Math.min(worst7, pGot / pBest);
  }
  // 7 emplacements : presque toujours le meilleur. ⚠️ 39 et pas moins, mesuré : sans les
  // échanges par paires on tombe à 37, sans le départ glouton à 38, sans les départs par
  // set à 38 (et 115/120 sur 4 emplacements). Graines fixes, donc résultat stable.
  expect(ag7).toBeGreaterThanOrEqual(39);
  expect(worst7).toBeGreaterThan(0.99); // …et jamais loin quand il ne l'est pas
  // Temps sur 7 emplacements, gros sac.
  for (const n of [800]) {
    const inv = pool(999, L, Math.ceil(n / SLOTS.length), SLOTS);
    const t0 = performance.now();
    const got = bestGearLoadout('T', stats, {}, inv, L, {}, 'gardien');
    const t = performance.now() - t0;
    expect(inv.length).toBeGreaterThan(780);
    expect(Object.keys(got).length).toBe(SLOTS.length); // tous les emplacements remplis
    expect(t).toBeLessThan(2000); // cible de l'étude : moins de 2 s
  }
}, 3000000);
