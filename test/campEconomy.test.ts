import { describe, it, expect } from 'vitest';
import { createMap, advanceWorld, campSpecOf, CAMP_TYPES, HARVEST_TYPES } from '@/lib/expedition';
import {
  caravanHurtMs,
  caravanLegMin,
  caravanWages,
  convoySlotsFree,
  refAdvGear,
  refAdventurer,
  refCompanions,
} from '@/lib/caravan';
import { guildRoster, type Adventurer } from '@/lib/adventurers';
import { campGroupHaul, campWinPct, partyAllies, resolveCamp } from '@/lib/camp';
import { goldPerDay, stonesPerDay } from './helpers/goldModel';

/**
 * 💰 LE DÉBIT DES CAMPS EN PARALLÈLE, mesuré contre le MÊME revenu de référence que le puits
 * d'or (`test/helpers/goldModel`).
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE. Les camps se prennent SANS le héros : jusqu'à la revue
 * finale, rien ne bornait le nombre de groupes en parallèle (ni Comptoir, ni `escortMax`) —
 * seul le vivier. `campCalibration` (E2) compare UN camp à UNE mine, `scrapEconomy` (E3)
 * ajoute UN camp par jour : aucun des deux ne voit le DÉBIT. Mesuré alors : ~7-8 camps/jour,
 * soit +58 % du revenu d'or de référence au niveau 26, et ~+4,6 clés/jour (hors de la bande
 * de 2 à 5 runs de Labyrinthe par jour, v0.799).
 *
 * Deux garde-fous en sont sortis : un groupe sans le héros prend un CRÉNEAU DE CONVOI
 * (`convoySlotsFree`, un seul pool), et un camp ne rend AUCUNE clé. Ce test encode le
 * résultat pour qu'il ne dérive plus en silence.
 *
 * ⚠️ LA SIMULATION EST CELLE D'UN JOUEUR QUI OPTIMISE : carte réelle (`createMap` /
 * `advanceWorld`), vivier au complet (`guildRoster`), et pour chaque camp il RENFORCE le
 * groupe jusqu'à une victoire probable puis choisit le meilleur rendement espéré par heure de
 * créneau. C'est une BORNE HAUTE : elle ignore que les camps DÉPLACENT des convois (un
 * aventurier en camp n'est pas en convoi), dont l'or n'est pas compté ici.
 */
const DAY = 86_400_000;
const STEP = 10 * 60_000;

function roster(L: number, n: number): Adventurer[] {
  return Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    familiarId: `refFam${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
}
function road(L: number, n: number) {
  const base = refCompanions(L);
  return {
    familiars: Array.from({ length: n }, (_, i) => ({
      ...base[i % base.length]!,
      id: `refFam${i}`,
    })),
    talents: [],
    advGear: refAdvGear(L, n),
  };
}

interface Trip {
  returnAt: number;
}
/** `slotCap` : la règle livrée (un pool partagé avec les convois) ou son absence — c'est ce
 *  qui permet de MESURER ce que le plafond change, au lieu de l'affirmer. */
function sim(L: number, seed: number, opts: { days: number; comptoir: number; slotCap: boolean }) {
  const advs = roster(L, guildRoster(L));
  const rd = road(L, advs.length);
  const busy = new Map<string, number>();
  let map = createMap(seed, 0, L);
  const trips: Trip[] = [];
  let gold = 0;
  let wages = 0;
  let stones = 0;
  let keys = 0;
  let parties = 0;
  for (let t = 0; t <= opts.days * DAY; t += STEP) {
    map = advanceWorld(map, t, L);
    // ⚔️ D'abord les camps (le pire cas pour l'or : on leur donne tous les créneaux).
    for (;;) {
      if (opts.slotCap && convoySlotsFree(opts.comptoir, trips, t) <= 0) break;
      const free = advs.filter((a) => (busy.get(a.id) ?? 0) <= t);
      const best = map.pois
        .map((p) => ({ p, spec: campSpecOf(p) }))
        .filter((c) => CAMP_TYPES.has(c.p.type) && c.spec && c.spec.size <= free.length)
        .map((c) => {
          let esc = free.slice(0, c.spec!.size);
          let win = campWinPct(c.p, c.spec!, partyAllies(esc, rd, null), 8);
          for (let n = c.spec!.size + 1; win < 0.7 && n <= free.length; n++) {
            esc = free.slice(0, n);
            win = campWinPct(c.p, c.spec!, partyAllies(esc, rd, null), 8);
          }
          const h = (2 * caravanLegMin(c.p, esc, opts.comptoir, 0)) / 60;
          const net = campGroupHaul(c.p, c.spec!).gold - caravanWages(esc, c.p);
          return { ...c, esc, win, score: (win * net) / h };
        })
        .filter((c) => c.win >= 0.5 && c.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (!best) break;
      const back = t + 2 * caravanLegMin(best.p, best.esc, opts.comptoir, 0) * 60_000;
      const o = resolveCamp({
        poi: best.p,
        spec: best.spec!,
        escort: best.esc,
        road: rd,
        hero: null,
        seed: (t ^ (best.p.level * 2654435761)) >>> 0 || 1,
        playerLevel: L,
      });
      gold += o.gold;
      wages += o.party!.wages;
      stones += o.summonStones;
      keys += o.key;
      parties++;
      const hurt = new Set(o.party!.hurt);
      const hurtMs = caravanHurtMs(best.esc, 0);
      for (const a of best.esc) busy.set(a.id, back + (hurt.has(a.id) ? hurtMs : 0));
      trips.push({ returnAt: back });
      map = { ...map, pois: map.pois.filter((p) => p.id !== best.p.id) };
    }
    // Les créneaux restants partent en convois : ils prennent des aventuriers ET des lieux de
    // récolte, donc ils font tourner la carte (plus de spawns, donc plus de camps).
    for (;;) {
      if (convoySlotsFree(opts.comptoir, trips, t) <= 0) break;
      const free = advs.filter((a) => (busy.get(a.id) ?? 0) <= t);
      if (free.length < 3) break;
      const target = map.pois.find((p) => HARVEST_TYPES.has(p.type));
      if (!target) break;
      const esc = free.slice(0, 3);
      const back = t + 2 * caravanLegMin(target, esc, opts.comptoir, 0) * 60_000;
      for (const a of esc) busy.set(a.id, back);
      trips.push({ returnAt: back });
      map = { ...map, pois: map.pois.filter((p) => p.id !== target.id) };
    }
  }
  return {
    goldNet: (gold - wages) / opts.days,
    stones: stones / opts.days,
    keys: keys / opts.days,
    parties: parties / opts.days,
  };
}

const NIV = [12, 26, 60];
// ⚠️ HUIT graines, pas deux. Avec deux, la démonstration du plafond de créneaux (ligne
// « sans plafond, on dépasse la bande ») se jouait à 5 % de sa borne : la moindre variation
// de PLACEMENT des POI la faisait tomber — c'est arrivé en ajoutant 2 failles à la couronne,
// alors que le profil moyen des POI ne bougeait que de 0,6 % sur 23 200 tirages. On mesure
// donc le joueur MÉDIAN, pas celui qui a eu de la chance (même correctif qu'en v0.730).
const SEEDS = [12345, 777, 31337, 4242, 9001, 555, 60613, 1024];
/** Part du revenu d'or de référence qu'un joueur peut ajouter en enchaînant des camps. */
const GOLD_MAX = 0.25;
/** Part de la production de pierres d'une journée de donjons. */
const STONES_MAX = 0.5;

function moyenne(L: number, opts: { days: number; comptoir: number; slotCap: boolean }) {
  const runs = SEEDS.map((s) => sim(L, s, opts));
  const m = (k: keyof (typeof runs)[0]) => runs.reduce((acc, r) => acc + r[k], 0) / runs.length;
  return { goldNet: m('goldNet'), stones: m('stones'), keys: m('keys'), parties: m('parties') };
}

describe('💰 le débit des camps de faction ne double pas l’économie', { timeout: 30_000 }, () => {
  it('⚠️ or NET par jour ≤ un quart du revenu de référence, à tous les niveaux', () => {
    for (const L of NIV) {
      const r = moyenne(L, { days: 7, comptoir: L, slotCap: true });
      const part = r.goldNet / goldPerDay(L);
      // Mesuré : +9 % (niv. 12), +19 % (26), +20 % (60). Au-delà, le puits d'or recalibré en
      // v0.733 (55-90 % du plafond sur un an) ne tient plus — c'est la raison du plafond de
      // créneaux et de `CAMP.groupGoldShare`.
      expect(part, `niveau ${L} : +${(part * 100).toFixed(0)} % d’or`).toBeLessThanOrEqual(
        GOLD_MAX,
      );
      // …et le camp reste un vrai gain : un butin dérisoire ferait passer ce test pour rien.
      expect(part, `niveau ${L} : +${(part * 100).toFixed(0)} % d’or`).toBeGreaterThan(0.03);
      expect(r.parties, `niveau ${L} : ${r.parties.toFixed(1)} camps/jour`).toBeGreaterThan(1.5);
    }
  });

  it('⚠️ pierres d’invocation : au plus la moitié d’une journée de donjons', () => {
    for (const L of NIV) {
      const r = moyenne(L, { days: 7, comptoir: L, slotCap: true });
      const part = r.stones / stonesPerDay(L);
      // Les pierres financent les BOSS : le donjon doit rester la source. Mesuré : +6 / +16 /
      // +32 % aux niveaux 12 / 26 / 60.
      expect(part, `niveau ${L} : +${(part * 100).toFixed(0)} % de 🔮`).toBeLessThanOrEqual(
        STONES_MAX,
      );
    }
  });

  it('⚠️ AUCUNE clé : le Labyrinthe garde sa bande de 2 à 5 runs/jour (v0.799)', () => {
    for (const L of NIV) {
      expect(moyenne(L, { days: 7, comptoir: L, slotCap: true }).keys, `niveau ${L}`).toBe(0);
    }
  });

  it('⚠️ le PLAFOND DE CRÉNEAUX mord vraiment : un gros vivier sur un petit Comptoir', () => {
    // Le vivier croît avec le niveau (`guildRoster`), les créneaux avec le COMPTOIR : c'est
    // exactement le cas où un joueur pourrait lancer des groupes par dizaines.
    const cap = moyenne(60, { days: 7, comptoir: 9, slotCap: true });
    const sans = moyenne(60, { days: 7, comptoir: 9, slotCap: false });
    expect(
      cap.parties,
      `${cap.parties.toFixed(1)} vs ${sans.parties.toFixed(1)} camps/j`,
    ).toBeLessThan(sans.parties);
    expect(cap.goldNet).toBeLessThan(sans.goldNet);
    // Sans plafond, on dépasse la bande — c'est ce qu'il empêche.
    expect(sans.goldNet / goldPerDay(60)).toBeGreaterThan(GOLD_MAX * 0.95);
  });
});
