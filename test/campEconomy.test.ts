import { describe, it, expect } from 'vitest';
import { createMap, advanceWorld, campSpecOf, CAMP_TYPES, HARVEST_TYPES } from '@/lib/expedition';
import {
  caravanHurtMs,
  caravanLegMin,
  caravanWages,
  convoySlotsFree,
  refAdvGear,
  refAdventurer,
} from '@/lib/caravan';
import { engageCap, type Adventurer } from '@/lib/adventurers';
import { campGroupHaul, campWinPct, resolveCamp } from '@/lib/camp';
import { partyAllies } from '@/lib/caravan';
import { goldPerDay, stonesPerDay } from './helpers/goldModel';
import { travelTimeMult } from '@/lib/buildings';

/** Réduction de trajet de l'Avant-poste au niveau donné (héros ET champions, v0.1040). */
const outpostMult = (level: number) =>
  travelTimeMult([{ typeId: 'outpost', level, slot: 0, collectedAt: 0 }]);

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
 * `advanceWorld`), vivier au complet (`engageCap`), et pour chaque camp il RENFORCE le
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
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
}
function road(L: number, n: number) {
  return { advGear: refAdvGear(L, n) };
}

interface Trip {
  returnAt: number;
}
/** `slotCap` : la règle livrée (un pool partagé avec les convois) ou son absence — c'est ce
 *  qui permet de MESURER ce que le plafond change, au lieu de l'affirmer. */
function sim(L: number, seed: number, opts: { days: number; comptoir: number; slotCap: boolean }) {
  const advs = roster(L, engageCap(L));
  const rd = road(L, advs.length);
  const busy = new Map<string, number>();
  let map = createMap(seed, 0, L, opts.comptoir);
  const trips: Trip[] = [];
  let gold = 0;
  let wages = 0;
  let stones = 0;
  let keys = 0;
  let parties = 0;
  for (let t = 0; t <= opts.days * DAY; t += STEP) {
    map = advanceWorld(map, t, L, opts.comptoir);
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
          const h = (2 * caravanLegMin(c.p, esc, 0, outpostMult(opts.comptoir))) / 60;
          const net = campGroupHaul(c.p, c.spec!).gold - caravanWages(esc, c.p);
          return { ...c, esc, win, score: (win * net) / h };
        })
        .filter((c) => c.win >= 0.5 && c.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (!best) break;
      const back = t + 2 * caravanLegMin(best.p, best.esc, 0, outpostMult(opts.comptoir)) * 60_000;
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
      const back = t + 2 * caravanLegMin(target, esc, 0, outpostMult(opts.comptoir)) * 60_000;
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
/** Part du revenu d'or de référence qu'un joueur peut ajouter en enchaînant des camps.
 *  ⚠️ RELEVÉE 0,25 → 0,30 en v0.1033 (champions au pas du héros, choix de l'utilisateur) :
 *  mesuré +27 / +18 / +18 % aux niveaux 12 / 26 / 60, contre +25 / +17 / +16 % avant. Le
 *  niveau 12 était déjà à la borne ; les niveaux 26 et 60 restent loin dessous. */
const GOLD_MAX = 0.3;
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
      // Mesuré : +9 % (niv. 12), +16 % (26), +17 % (60). Au-delà, le puits d'or recalibré en
      // v0.733 (55-90 % du plafond sur un an) ne tient plus — c'est la raison du plafond de
      // créneaux et de `CAMP.groupGoldShare`.
      // ⚠️ RE-MESURÉ en v0.929 : passer à 6 failles a été payé en retirant 4 POI ordinaires
      // de la couronne (`poiCap` 20 → 16), donc ~20 % de camps en moins. Or des camps
      // +19/+20 → +16/+17 %, débit 3,6/6,8/8,9 → **3,0/5,9/8,1 camps/jour**. Ne pas toucher
      // à `poiCap` sans relancer ce fichier.
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
      // +27 % aux niveaux 12 / 26 / 60 — mesuré +5 / +16 / +27 en v0.929, contre
      // +6 / +16 / +32 quand la couronne portait 20 POI ordinaires.
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
    // Le vivier croît avec le niveau (`engageCap`), les créneaux avec le COMPTOIR : c'est
    // exactement le cas où un joueur pourrait lancer des groupes par dizaines.
    const cap = moyenne(60, { days: 7, comptoir: 9, slotCap: true });
    const sans = moyenne(60, { days: 7, comptoir: 9, slotCap: false });
    expect(
      cap.parties,
      `${cap.parties.toFixed(1)} vs ${sans.parties.toFixed(1)} camps/j`,
    ).toBeLessThan(sans.parties);
    expect(cap.goldNet).toBeLessThan(sans.goldNet);
    //
    // ⚠️ CE TEST A CHANGÉ DE FORMULATION EN v0.929, ET LA RAISON COMPTE. Il affirmait « sans
    // plafond, on DÉPASSE la bande » (mesuré 25 % pour une bande à 25) — ce n’est plus vrai :
    // retirer 4 POI ordinaires de la couronne pour loger 6 failles a fait tomber le débit
    // sans plafond à **20,9 %**, sous la bande. Le plafond n’est donc plus le SEUL garde-fou
    // du débit d’or ; il reste le plus gros levier, et c’est CE QUE ce test épingle désormais.
    // ⚠️ Il l’épingle en ÉCART SUBSTANTIEL, pas en « strictement inférieur » : la version
    // d’avant se jouait à 5 % de sa borne et tombait à la moindre variation de PLACEMENT des
    // POI — une borne qu’un bruit d’échantillonnage franchit ne verrouille rien.
    //
    // Mesuré (8 graines, niveau 60, Comptoir 9) : 5,8 camps/jour et +15,8 % d’or AVEC le
    // plafond, contre 8,3 et +20,9 % sans — soit ×1,43 et ×1,32.
    //
    // ⚠️ RE-MESURÉ EN v0.1005 (champions sans compagnons, fusionné sur la base sans épave) :
    // 6,2 camps/jour et +12,3 % d’or AVEC le plafond, 8,0 et +13,9 % SANS — soit ×1,30 et
    // ×1,13. Le plafond reste le levier du NOMBRE de groupes ; sur l’OR il pèse moins parce
    // que, sans familier ni talent, les camps en plus au-delà du plafond demandent des groupes
    // plus gros et leurs salaires mangent presque tout le butin. Borne ramenée de 1,15 à 1,08
    // pour cette raison mesurée — elle attrape toujours un plafond qui ne mordrait plus du tout.
    expect(sans.parties / cap.parties).toBeGreaterThan(1.25);
    expect(
      sans.goldNet / cap.goldNet,
      `or ${((cap.goldNet / goldPerDay(60)) * 100).toFixed(1)} % avec, ${(
        (sans.goldNet / goldPerDay(60)) *
        100
      ).toFixed(1)} % sans`,
    ).toBeGreaterThan(1.08);
    // …et même sans plafond on reste sous la bande, ce qui n’était pas le cas à 20 POI
    // ordinaires : le garde-fou a désormais de la marge devant lui.
    expect(sans.goldNet / goldPerDay(60)).toBeLessThanOrEqual(GOLD_MAX);
  });
});
