/**
 * ⚡🔮 CE QUE DES ÉQUIPES SANS LE HÉROS RAMÈNENT PAR JOUR (v0.1210, mesuré).
 *
 * Le joueur modélisé ouvre l'app 3 fois par jour et remplit TOUS ses créneaux d'équipe avec des
 * champions de référence, défaites comprises. Mesuré à parts pleines (v0.1189) puis à moitié
 * pour l'énergie (v0.1201) : l'énergie valait jusqu'à 2,2× une journée de sport et les pierres
 * jusqu'à 246 % d'une journée de donjons. D'où `CARAVAN.energyShare` et `stonesShare` à 0,2.
 * Mesuré après : énergie 0,19 / 0,42 / 0,59 / 0,87× le sport, pierres 31 / 36 / 39 / 49 % des
 * donjons (niveaux 12 / 30 / 60 / 100). v1.8.0 : sanctuaires 2× plus rares et 2,5× plus riches
 * → 47 / 35 / 47 / 45 %. ⚠️ Toucher aux parts, aux sources ou aux sanctuaires
 * sans relancer ce fichier, c'est rouvrir « complément, jamais substitut au sport ».
 */
import { describe, it, expect } from 'vitest';
import { createMap, advanceWorld, HARVEST_TYPES, harvestGuardOf } from '@/lib/expedition';
import {
  caravanHurtMs,
  caravanLegMin,
  refAdvGear,
  refAdventurer,
  partyAllies,
} from '@/lib/caravan';
import { engageCap, type Adventurer } from '@/lib/adventurers';
import { campWinPct } from '@/lib/camp';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { travelTimeMult } from '@/lib/buildings';
import { sessionXp } from '@/lib/athlete';
import { stonesPerDay } from './helpers/goldModel';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const OPENINGS = [8, 13, 20]; // le joueur ouvre l'app 3 fois par jour
const seance = sessionXp({
  duration_min: 60,
  exercises: [{ performed: Array.from({ length: 15 }, () => ({ reps: 10, load_kg: 40 })) }],
} as unknown as Parameters<typeof sessionXp>[0]);
const sportParJour = (seance * 4) / 7;

function sim(L: number, seed: number, days: number, first: 'well' | 'shrine') {
  const advs: Adventurer[] = Array.from({ length: engageCap(L) }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
  const rd = { advGear: refAdvGear(L, advs.length) };
  const busy = new Map<string, number>();
  const mult = travelTimeMult([{ typeId: 'outpost', level: L, slot: 0, collectedAt: 0 }]);
  let map = createMap(seed, 0, L, L);
  const trips: { returnAt: number }[] = [];
  let energy = 0;
  let stones = 0;
  let wells = 0;
  for (let d = 0; d < days; d++)
    for (const h of OPENINGS) {
      const t = d * DAY + h * HOUR;
      map = advanceWorld(map, t, L, L);
      for (;;) {
        const free = advs.filter((a) => (busy.get(a.id) ?? 0) <= t);
        if (free.length < 3) break;
        // Sources d'abord (l'énergie), puis sanctuaires (pierres), puis le reste.
        const rank = (p: { type: string }) =>
          p.type === first ? 0 : p.type === 'well' || p.type === 'shrine' ? 1 : 2;
        const cands = map.pois
          .filter((p) => HARVEST_TYPES.has(p.type))
          .sort((a, b) => rank(a) - rank(b));
        let pick: { p: (typeof cands)[number]; esc: Adventurer[] } | null = null;
        for (const p of cands) {
          const spec = harvestGuardOf(p);
          let esc = free.slice(0, 3);
          if (spec) {
            let win = campWinPct(p, spec, partyAllies(esc, rd, null), 6);
            for (let k = 4; win < 0.7 && k <= free.length; k++) {
              esc = free.slice(0, k);
              win = campWinPct(p, spec, partyAllies(esc, rd, null), 6);
            }
            if (win < 0.5) continue;
          }
          pick = { p, esc };
          break;
        }
        if (!pick) break;
        const back = t + 2 * caravanLegMin(pick.p, pick.esc, 0, mult) * 60_000;
        const o = resolveHarvestParty({
          poi: pick.p,
          escort: pick.esc,
          road: rd,
          hero: null,
          seed: (t ^ (pick.p.level * 2246822519)) >>> 0 || 1,
          playerLevel: L,
          pantheonLevel: L,
        });
        energy += o.energy;
        stones += o.summonStones;
        if (pick.p.type === 'well') wells++;
        const hurt = new Set(o.party?.hurt ?? []);
        for (const a of pick.esc)
          busy.set(a.id, back + (hurt.has(a.id) ? caravanHurtMs(pick.esc, 0) : 0));
        trips.push({ returnAt: back });
        map = { ...map, pois: map.pois.filter((q) => q.id !== pick!.p.id) };
      }
    }
  return { energy: energy / days, stones: stones / days, wells: wells / days };
}

const moyenne = (L: number, first: 'well' | 'shrine') => {
  const runs = [11, 22, 33].map((s) => sim(L, s, 5, first));
  return {
    energy: runs.reduce((a, r) => a + r.energy, 0) / runs.length,
    stones: runs.reduce((a, r) => a + r.stones, 0) / runs.length,
  };
};

describe('⚡🔮 les équipes restent un complément', { timeout: 300_000 }, () => {
  it('énergie (sources d’abord) : sous une journée de sport, même au niveau 100', () => {
    for (const L of [30, 100]) {
      const r = moyenne(L, 'well').energy / sportParJour;
      expect(r, `niveau ${L} : ${r.toFixed(2)}× le sport`).toBeLessThan(1);
      expect(r, `niveau ${L} : ça rapporte quand même`).toBeGreaterThan(0.1);
    }
  });
  it('pierres (sanctuaires d’abord) : au plus la moitié d’une journée de donjons', () => {
    for (const L of [30, 100]) {
      const r = moyenne(L, 'shrine').stones / stonesPerDay(L);
      expect(r, `niveau ${L} : ${(100 * r).toFixed(0)} % des donjons`).toBeLessThanOrEqual(0.55);
      expect(r, `niveau ${L} : ça rapporte quand même`).toBeGreaterThan(0.1);
    }
  });
});
