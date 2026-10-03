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
  WARLORD,
  ensureIslandConquest,
  islandTargetLabel,
  razeIslandTarget,
  warlordRaids,
  weakestHeld,
} from '@/lib/islandConquest';
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

/** Deux lieux tenus : la mine à 3 champions, l’arsenal à 1, attaques lointaines. */
function held(m: ExpeditionMap): ExpeditionMap {
  let out = captureControl(m, controlIdOf('mine'), ['a', 'b', 'c'], NOW, 7);
  out = captureControl(out, controlIdOf('arsenal'), ['d'], NOW, 7);
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

describe('🚩 l’île 4 : l’armée mobile du seigneur de guerre', () => {
  it('trois camps de guerre', () => {
    const o = islandMap().pois.filter((p) => p.control?.kind === 'objective');
    expect(o.map((p) => p.control!.name)).toEqual(Array(3).fill('Camp de guerre'));
  });
  it('vise le lieu tenu le moins défendu', () => {
    const m = held(islandMap());
    expect(weakestHeld(m.pois, NOW, m.seed)!.control!.kind).toBe('arsenal');
  });
  it('à son heure, avance l’attaque du moins défendu et seulement elle', () => {
    let m = warlordRaids(held(islandMap()), NOW);
    const at = m.archipel!.warAt!;
    expect(at).toBeGreaterThan(NOW);
    expect(at - NOW).toBeLessThanOrEqual((WARLORD.raidMs / 3) * (1 + WARLORD.jitter));
    m = warlordRaids(m, at);
    expect(attackOf(m, 'arsenal')).toBe(at);
    expect(attackOf(m, 'mine')).toBe(NOW + 30 * DAY);
    expect(m.archipel!.warAt!).toBeGreaterThan(at);
    // Même carte tant qu’elle n’est pas due.
    expect(warlordRaids(m, at + 1)).toBe(m);
  });
  it('plus de camps debout, plus de sorties ; tous abattus, plus aucune', () => {
    let m = held(islandMap());
    for (const id of ['isl_obj_0', 'isl_obj_1']) m = razeIslandTarget(m, id, NOW);
    // Une sortie toute neuve (on retire l’échéance tirée à trois camps).
    const fresh = { ...m, archipel: { ...m.archipel!, warAt: undefined } };
    const one = warlordRaids(fresh, NOW).archipel!.warAt! - NOW;
    expect(one).toBeGreaterThanOrEqual(WARLORD.raidMs * (1 - WARLORD.jitter) - 1);
    m = razeIslandTarget(warlordRaids(m, NOW), 'isl_obj_2', NOW);
    m = warlordRaids(m, NOW + 10 * DAY);
    expect(m.archipel!.warAt).toBeUndefined();
    expect(attackOf(m, 'arsenal')).toBe(NOW + 30 * DAY);
  });
  it('ne recule jamais une attaque déjà plus proche que la sortie', () => {
    const m0 = held(islandMap());
    const soon = NOW + H;
    const m1 = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.control?.kind === 'arsenal' ? { ...p, control: { ...p.control, attackAt: soon } } : p,
      ),
      archipel: { ...m0.archipel!, warAt: NOW + 12 * H },
    };
    const m = warlordRaids(m1, NOW + 12 * H);
    expect(attackOf(m, 'arsenal')).toBe(soon);
    expect(attackOf(m, 'mine')).toBe(NOW + 12 * H);
  });
  it('branchée sur le tick de la carte', () => {
    const m0 = held(islandMap());
    const at = m0.archipel!.warAt!;
    const m = ensureIslandConquest(m0, at, LV);
    expect(attackOf(m, 'arsenal')).toBe(at);
  });
  it('les autres îles n’ont pas d’armée mobile', () => {
    const m = warlordRaids(held(islandMap(3, 50)), NOW + 10 * DAY);
    expect(m.archipel!.warAt).toBeUndefined();
  });
  it('la fiche le dit', () => {
    expect(islandTargetLabel(islandMap(), 'isl_obj_0')!.detail).toContain('MOINS défendu');
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

describe('⚒️🌀 l’arsenal, et le cercle d’invocation retiré', () => {
  it('l’île 4 porte le socle + l’arsenal seulement (4 lieux fixes)', () => {
    const k = kinds(islandMap());
    for (const x of ['mine', 'training', 'mana', 'arsenal']) expect(k).toContain(x);
    expect(k).not.toContain('circle');
    expect(k).not.toContain('tower');
    expect(k).not.toContain('garden');
    expect(k).not.toContain('ossuary');
  });
  it('l’arsenal : ⅙ de la part d’objet d’une ruine par jour au complet (étape 0)', () => {
    const id = controlIdOf('arsenal');
    let m = islandMap();
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Arsenal');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const ruin = RUINS_SEALS.gearPerRank * (1 + characterRank(LV).rankIndex);
    const got = harvestOver(m, id, NOW, 144, LV);
    // ⚠️ Au cran du jour du point (qui monte avec le temps tenu), d’où la marge basse.
    expect(got.gearSeals).toBeGreaterThanOrEqual(Math.floor(ruin * 0.85));
    expect(got.gearSeals).toBeLessThanOrEqual(Math.ceil(ruin * 1.6));
    expect(got.gold + got.mana + got.keys + got.summon).toBe(0);
    const one = captureControl(islandMap(), id, ['a'], NOW, 7);
    // Un seul armurier : environ moitié moins (share 1 contre 3).
    expect(harvestOver(one, id, NOW, 144, LV).gearSeals).toBeLessThanOrEqual(got.gearSeals * 0.6);
  });
  it('un cercle tenu d’avant la règle est rappelé, et produit jusque-là', () => {
    const id = controlIdOf('circle');
    let m = withOldCircle(islandMap());
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Cercle');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const price = bossSummonCost(LV);
    const got = collectControl(m, id, NOW + 48 * H, LV);
    expect(got.summon).toBeGreaterThanOrEqual(Math.floor(price * 0.85));
    expect(got.summon).toBeLessThanOrEqual(Math.ceil(price * 1.6));
    expect(got.gold + got.mana + got.gearSeals + got.keys).toBe(0);
    expect(retiredHeld(m).map((q) => q.id)).toEqual([id]);
    const one = captureControl(withOldCircle(islandMap()), id, ['a'], NOW, 7);
    expect(collectControl(one, id, NOW + 48 * H, LV).summon).toBeLessThanOrEqual(got.summon * 0.6);
  });
  it('le rapport dit les sceaux', () => {
    const p = islandMap().pois.find((q: Poi) => q.id === controlIdOf('arsenal'))!;
    expect(controlLootMessage(p, NOW, {}, 0, 0, 0, 5)!.title).toContain('5 sceaux d’objet');
  });
});
