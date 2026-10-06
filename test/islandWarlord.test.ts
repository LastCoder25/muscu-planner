import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, RUINS_SEALS, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  captureControl,
  collectControl,
  controlIdOf,
  controlLootMessage,
  ensureControls,
  retiredHeld,
} from '@/lib/controlPoints';
import {
  ensureIslandConquest,
  islandTargetLabel,
  razeIslandTarget,
  warlordRaids,
  weakestHeld,
} from '@/lib/islandConquest';
import { SORTIE_EVENTS, sortieFires, sortieMinGapMs, sortieThreshold } from '@/lib/sortieClock';
import { characterRank } from '@/lib/characterRank';
import { bossSummonCost } from '@/data/bosses';
import { harvestOver } from './helpers/controlHarvest';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const DAY = 24 * H;
const LV = 70;

function islandMap(id = 4, L = LV): ExpeditionMap {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const kinds = (m: ExpeditionMap) => m.pois.flatMap((p) => (p.control ? [p.control.kind] : []));

/** Deux lieux tenus : le cartographe à 3 champions, le fortin à 1, attaques lointaines. */
function held(m: ExpeditionMap): ExpeditionMap {
  let out = captureControl(m, controlIdOf('cartographer'), ['a', 'b', 'c'], NOW, 7);
  out = captureControl(out, controlIdOf('fort'), ['d'], NOW, 7);
  const far = NOW + 30 * DAY;
  return {
    ...out,
    pois: out.pois.map((p) =>
      p.control?.owner === 'player' ? { ...p, control: { ...p.control, attackAt: far } } : p,
    ),
  };
}
const attackOf = (m: ExpeditionMap, kind: string) =>
  m.pois.find((p) => p.control?.kind === kind)!.control!.attackAt!;

/** Des sorties arrivées aux instants `at` (datées de leur arrivée, comme `recordDeparture`). */
const withSorties = (m: ExpeditionMap, at: number[]): ExpeditionMap => ({
  ...m,
  departures: [...(m.departures ?? []), ...at],
});
/** Le seuil du `n`-ième départ de l'armée, à trois camps debout. */
const warSeuil = (m: ExpeditionMap, n = 0) => sortieThreshold(m.seed, 'warlord', n, 1);
/** `k` sorties, une par heure après `from`. */
const hourly = (k: number, from = NOW) => Array.from({ length: k }, (_, i) => from + (i + 1) * H);
const FAR = NOW + 30 * DAY;

describe('🚩 l’île 4 : l’armée mobile du seigneur de guerre, aux sorties (v1.66.0)', () => {
  it('trois camps de guerre', () => {
    const o = islandMap().pois.filter((p) => p.control?.kind === 'objective');
    expect(o.map((p) => p.control!.name)).toEqual(Array(3).fill('Camp de guerre'));
  });
  it('vise le lieu tenu le moins défendu', () => {
    const m = held(islandMap());
    expect(weakestHeld(m.pois, NOW, m.seed)!.control!.kind).toBe('fort');
  });
  it('à la première lecture, l’horloge part de maintenant : les sorties passées ne comptent pas', () => {
    const m = islandMap();
    expect(m.archipel!.sorties!.warlord).toEqual({ from: NOW, charge: 0, fired: 0 });
    expect(m.archipel!.warAt).toBeUndefined();
    const before = withSorties(held(m), [NOW - 3 * H, NOW - 2 * H, NOW - H, NOW - 1, NOW]);
    expect(warlordRaids(before, NOW + DAY).pois).toBe(before.pois);
  });
  it('sort à l’arrivée de la N-ième sortie, puis attend et marche sur le moins défendu', () => {
    const m0 = held(islandMap());
    const k = warSeuil(m0);
    expect(k).toBeGreaterThanOrEqual(SORTIE_EVENTS.warlord.min);
    expect(k).toBeLessThanOrEqual(SORTIE_EVENTS.warlord.max);
    const times = hourly(k);
    // Une sortie de moins : rien ne bouge.
    const short = warlordRaids(withSorties(m0, times.slice(0, -1)), NOW + DAY);
    expect(attackOf(short, 'fort')).toBe(FAR);
    expect(short.archipel!.sorties!.warlord!.charge).toBe(k - 1);
    const m = warlordRaids(withSorties(m0, times), NOW + DAY);
    const t = times[k - 1]!;
    const fort = m.pois.find((p) => p.control?.kind === 'fort')!.control!;
    expect(fort.attackAt!).toBeGreaterThan(t + H - 1);
    expect(fort.attackAt!).toBeLessThan(t + DAY);
    const camps = m.pois.filter((p) => p.control?.kind === 'objective');
    expect(camps.some((c) => c.x === fort.raidFrom!.x && c.y === fort.raidFrom!.y)).toBe(true);
    expect(attackOf(m, 'cartographer')).toBe(FAR);
    expect(m.archipel!.sorties!.warlord).toEqual({ from: t, charge: 0, fired: 1, last: t });
  });
  it('qui ne sort pas ne voit rien venir, même des jours plus tard', () => {
    const m = held(islandMap());
    expect(warlordRaids(m, NOW + 30 * DAY)).toBe(m);
  });
  it('jamais plus souvent que l’ancienne horloge (12 h à trois camps), même en sortant sans cesse', () => {
    const m = held(islandMap());
    const many = Array.from({ length: 200 }, (_, i) => NOW + (i + 1) * 10 * 60_000);
    const { times } = sortieFires(
      { seed: m.seed, departures: many },
      { from: NOW, charge: 0, fired: 0 },
      'warlord',
      NOW + 40 * H,
      1,
    );
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < times.length; i++)
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(SORTIE_EVENTS.warlord.minGapMs);
  });
  it('moins de camps debout : trois fois plus de sorties et d’écart avec un seul', () => {
    const m = islandMap();
    for (let n = 0; n < 20; n++)
      expect(sortieThreshold(m.seed, 'warlord', n, 3)).toBe(warSeuil(m, n) * 3);
    expect(sortieMinGapMs('warlord', 3)).toBe(3 * SORTIE_EVENTS.warlord.minGapMs);
  });
  it('tous les camps abattus : plus aucune sortie, l’horloge est effacée', () => {
    let m = held(islandMap());
    for (const id of ['isl_obj_0', 'isl_obj_1', 'isl_obj_2']) m = razeIslandTarget(m, id, NOW);
    m = warlordRaids(withSorties(m, hourly(20)), NOW + DAY);
    expect(m.archipel!.sorties?.warlord).toBeUndefined();
    expect(attackOf(m, 'fort')).toBe(FAR);
  });
  it('l’horloge d’avant la v1.66.0 (`warAt`) est effacée sur l’île 4', () => {
    const m0 = held(islandMap());
    const m = warlordRaids({ ...m0, archipel: { ...m0.archipel!, warAt: NOW + H } }, NOW + 2 * H);
    expect(m.archipel!.warAt).toBeUndefined();
    expect(attackOf(m, 'fort')).toBe(FAR);
  });
  it('ne recule jamais une attaque déjà plus proche que son arrivée', () => {
    const m0 = held(islandMap());
    const soon = NOW + H;
    const m1 = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.control?.kind === 'fort' ? { ...p, control: { ...p.control, attackAt: soon } } : p,
      ),
    };
    const k = warSeuil(m1);
    const quick = Array.from({ length: k }, (_, i) => NOW + (i + 1) * 60_000);
    const m = warlordRaids(withSorties(m1, quick), NOW + DAY);
    expect(attackOf(m, 'fort')).toBe(soon);
    expect(attackOf(m, 'cartographer')).toBe(FAR);
  });
  it('branchée sur le tick de la carte', () => {
    const m0 = held(islandMap());
    const m = ensureIslandConquest(withSorties(m0, hourly(warSeuil(m0))), NOW + DAY, LV);
    expect(attackOf(m, 'fort')).toBeLessThan(FAR);
  });
  it('les autres îles n’ont pas d’armée mobile', () => {
    const m = warlordRaids(withSorties(held(islandMap(3, 50)), hourly(30)), NOW + 10 * DAY);
    expect(m.archipel!.sorties?.warlord).toBeUndefined();
    expect(m.archipel!.warAt).toBeUndefined();
  });
  it('la fiche le dit', () => {
    const d = islandTargetLabel(islandMap(), 'isl_obj_0')!.detail;
    expect(d).toContain('MOINS défendu');
    expect(d).toContain('sorties');
  });
  it('📏 rythme mesuré : jamais plus qu’avant, et nettement moins pour qui sort peu', () => {
    // Trois camps debout, 14 jours de sorties régulières, 6 cartes.
    const rate = (kind: 'warlord' | 'convoy', perDay: number) => {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const dep = Array.from(
          { length: 14 * perDay },
          (_, i) => NOW + Math.round(((i + 0.5) * DAY) / perDay),
        );
        total += sortieFires(
          { seed, departures: dep },
          { from: NOW, charge: 0, fired: 0 },
          kind,
          NOW + 14 * DAY,
          1,
        ).times.length;
      }
      return total / 6 / 14;
    };
    // Ancienne horloge à trois camps : armée 36 h / 3 = 2 par jour, convoi 24 h / 3 = 3 par jour.
    const war = [3, 10, 30].map((d) => rate('warlord', d));
    const conv = [3, 10, 30].map((d) => rate('convoy', d));
    expect(war[0]).toBeGreaterThan(0.5);
    expect(war[0]).toBeLessThan(1);
    expect(conv[0]).toBeGreaterThan(0.8);
    expect(conv[0]).toBeLessThan(1.5);
    for (const r of war) expect(r).toBeLessThanOrEqual(2);
    for (const r of conv) expect(r).toBeLessThanOrEqual(3);
    expect(war[0]).toBeLessThan(war[1]!);
    expect(conv[0]).toBeLessThan(conv[1]!);
  });
});

/** 🌀 Un cercle d’invocation d’une sauvegarde d’avant la règle des 4 lieux fixes. */
function withOldCircle(m: ExpeditionMap): ExpeditionMap {
  const ars = m.pois.find((q) => q.id === controlIdOf('arsenal'))!;
  const id = controlIdOf('circle');
  return {
    ...m,
    pois: [...m.pois, { ...ars, id, x: ars.x + 20, control: { ...ars.control!, kind: 'circle' } }],
  };
}

describe('⚒️🌀 l’arsenal (île 3), et le cercle d’invocation retiré', () => {
  it('l’île 3 porte l’arsenal, l’île 4 le fortin — et plus aucun camp d’entraînement', () => {
    const k = kinds(islandMap(3));
    expect(k).toContain('arsenal');
    expect(k).not.toContain('training');
    expect(k).not.toContain('mine');
    expect(k).not.toContain('mana');
    const k4 = kinds(islandMap(4));
    expect(k4).toContain('fort');
    expect(k4).not.toContain('training');
    expect(k4).not.toContain('arsenal');
    expect(k).not.toContain('circle');
    expect(k).not.toContain('tower');
    expect(k).not.toContain('garden');
    expect(k).not.toContain('ossuary');
  });
  it('l’arsenal : ⅙ de la part d’objet d’une ruine par jour au complet (étape 0)', () => {
    const id = controlIdOf('arsenal');
    let m = islandMap(3);
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Arsenal');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const ruin = RUINS_SEALS.gearPerRank * (1 + characterRank(LV).rankIndex);
    const got = harvestOver(m, id, NOW, 144, LV);
    // ⚠️ Au cran du jour du point (qui monte avec le temps tenu), d’où la marge basse.
    expect(got.gearSeals).toBeGreaterThanOrEqual(Math.floor(ruin * 0.85));
    expect(got.gearSeals).toBeLessThanOrEqual(Math.ceil(ruin * 1.6));
    expect(got.gold + got.mana + got.keys + got.summon).toBe(0);
    const one = captureControl(islandMap(3), id, ['a'], NOW, 7);
    // Un seul armurier : environ moitié moins (share 1 contre 3).
    expect(harvestOver(one, id, NOW, 144, LV).gearSeals).toBeLessThanOrEqual(got.gearSeals * 0.6);
  });
  it('un cercle tenu d’avant la règle est rappelé, et produit jusque-là', () => {
    const id = controlIdOf('circle');
    let m = withOldCircle(islandMap(3));
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Cercle');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const price = bossSummonCost(LV);
    const got = collectControl(m, id, NOW + 48 * H, LV);
    expect(got.summon).toBeGreaterThanOrEqual(Math.floor(price * 0.85));
    expect(got.summon).toBeLessThanOrEqual(Math.ceil(price * 1.6));
    expect(got.gold + got.mana + got.gearSeals + got.keys).toBe(0);
    expect(retiredHeld(m).map((q) => q.id)).toEqual([id]);
    const one = captureControl(withOldCircle(islandMap(3)), id, ['a'], NOW, 7);
    expect(collectControl(one, id, NOW + 48 * H, LV).summon).toBeLessThanOrEqual(got.summon * 0.6);
  });
  it('le rapport dit les sceaux', () => {
    const p = islandMap(3).pois.find((q: Poi) => q.id === controlIdOf('arsenal'))!;
    expect(controlLootMessage(p, NOW, {}, 0, 0, 0, 5)!.title).toContain('5 sceaux d’objet');
  });
});
