import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, EXPE, poiLabel, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  captureControl,
  collectControl,
  controlIdOf,
  controlLootMessage,
  ensureControls,
} from '@/lib/controlPoints';
import {
  CURSE,
  INVASION,
  corruptRifts,
  ensureIslandConquest,
  islandTargetLabel,
  razeIslandTarget,
  warlordRaids,
} from '@/lib/islandConquest';
import { harvestOver } from './helpers/controlHarvest';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const DAY = 24 * H;
const LV = 90;

function islandMap(id = 5, L = LV): ExpeditionMap {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const kinds = (m: ExpeditionMap) => m.pois.flatMap((p) => (p.control ? [p.control.kind] : []));
function rift(m: ExpeditionMap): Poi {
  const base = m.pois.find((p) => !p.control)!;
  return {
    ...base,
    id: 'rift_test',
    type: 'rift',
    spawnedAt: NOW,
    expiresAt: NOW + EXPE.lifespanMs.rift,
  };
}
/** Trois lieux tenus, attaques lointaines. */
function held(m: ExpeditionMap): ExpeditionMap {
  let out = captureControl(m, controlIdOf('mine'), ['a', 'b', 'c'], NOW, 7);
  out = captureControl(out, controlIdOf('altar'), ['d'], NOW, 7);
  out = captureControl(out, controlIdOf('mana'), ['e', 'f'], NOW, 7);
  const far = NOW + 30 * DAY;
  return {
    ...out,
    archipel: { ...out.archipel!, warAt: undefined },
    pois: out.pois.map((p) =>
      p.control?.owner === 'player' ? { ...p, control: { ...p.control, attackAt: far } } : p,
    ),
  };
}
const attacks = (m: ExpeditionMap) =>
  m.pois.filter((p) => p.control?.owner === 'player').map((p) => p.control!.attackAt);

describe('🔮 l’île 5 : les sanctuaires maudits', () => {
  it('trois sanctuaires maudits', () => {
    const o = islandMap().pois.filter((p) => p.control?.kind === 'objective');
    expect(o.map((p) => p.control!.name)).toEqual(Array(3).fill('Sanctuaire maudit'));
  });
  it('les failles naissent vieillies d’un jour par sanctuaire debout, une seule fois', () => {
    const m = islandMap();
    const r = rift(m);
    const out = corruptRifts(m, [...m.pois, r]);
    const c = out.find((p) => p.id === r.id)!;
    expect(c.corrupt).toBe(true);
    expect(c.spawnedAt).toBe(NOW - 3 * CURSE.ageMs);
    expect(c.expiresAt).toBe(r.expiresAt - 3 * CURSE.ageMs);
    expect(corruptRifts(m, out)).toBe(out);
    // Une faille neuve à côté : seule elle est vieillie, l’ancienne ne l’est pas deux fois.
    const fresh = { ...r, id: 'rift_neuve' };
    const again = corruptRifts(m, [...out, fresh]);
    expect(again.find((p) => p.id === r.id)!.spawnedAt).toBe(NOW - 3 * CURSE.ageMs);
    expect(again.find((p) => p.id === 'rift_neuve')!.spawnedAt).toBe(NOW - 3 * CURSE.ageMs);
  });
  it('moins de sanctuaires, moins de corruption ; aucun, aucune', () => {
    let m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW);
    const r = rift(m);
    expect(corruptRifts(m, [...m.pois, r]).find((p) => p.id === r.id)!.spawnedAt).toBe(
      NOW - 2 * CURSE.ageMs,
    );
    m = razeIslandTarget(razeIslandTarget(m, 'isl_obj_1', NOW), 'isl_obj_2', NOW);
    const pois = [...m.pois, r];
    expect(corruptRifts(m, pois)).toBe(pois);
  });
  it('branchée sur le tick de la carte ; les autres îles n’ont pas de faille corrompue', () => {
    const m = islandMap();
    const t = ensureIslandConquest({ ...m, pois: [...m.pois, rift(m)] }, NOW, LV);
    expect(t.pois.find((p) => p.id === 'rift_test')!.corrupt).toBe(true);
    const four = islandMap(4, 70);
    const t4 = ensureIslandConquest({ ...four, pois: [...four.pois, rift(four)] }, NOW, 70);
    expect(t4.pois.find((p) => p.id === 'rift_test')!.corrupt).toBeUndefined();
  });
  it('les invasions combinées frappent TOUS les lieux tenus à la fois', () => {
    let m = warlordRaids(held(islandMap()), NOW);
    const at = m.archipel!.warAt!;
    expect(at - NOW).toBeGreaterThanOrEqual((INVASION.raidMs / 3) * 0.75 - 1);
    expect(at - NOW).toBeLessThanOrEqual((INVASION.raidMs / 3) * 1.25);
    m = warlordRaids(m, at);
    expect(attacks(m)).toEqual(attacks(m).map(() => at));
  });
  it('ne recule jamais une attaque déjà plus proche', () => {
    const m0 = held(islandMap());
    const soon = NOW + H;
    const m1 = {
      ...m0,
      archipel: { ...m0.archipel!, warAt: NOW + 12 * H },
      pois: m0.pois.map((p) =>
        p.control?.kind === 'altar' ? { ...p, control: { ...p.control, attackAt: soon } } : p,
      ),
    };
    const m = warlordRaids(m1, NOW + 12 * H);
    expect(m.pois.find((p) => p.control?.kind === 'altar')!.control!.attackAt).toBe(soon);
    expect(m.pois.find((p) => p.control?.kind === 'mine')!.control!.attackAt).toBe(NOW + 12 * H);
  });
  it('la fiche le dit', () => {
    const d = islandTargetLabel(islandMap(), 'isl_obj_0')!.detail;
    expect(d).toContain('corrompues');
    expect(d).toContain('TOUS');
  });
});

describe('🗿 l’autel des runes', () => {
  it('l’île 5 porte socle + scriptorium + autel, sans tour de guet', () => {
    const k = kinds(islandMap());
    for (const x of ['mine', 'training', 'mana', 'scriptorium', 'altar']) expect(k).toContain(x);
    expect(k).not.toContain('tower');
    expect(k).not.toContain('garden');
    expect(k).not.toContain('arsenal');
  });
  it('tenu au complet, une rune multicolore tous les 2 jours (étape 0)', () => {
    const id = controlIdOf('altar');
    let m = islandMap();
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Autel des runes');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const got = harvestOver(m, id, NOW, 8 * 24, LV);
    // 4 runes en 8 jours (au cran du jour du point, d’où la marge basse).
    expect(got.runes).toBeGreaterThanOrEqual(3);
    expect(got.runes).toBeLessThanOrEqual(6);
    expect(got.gold + got.gearSeals + got.keys + got.summon + got.champSeals).toBe(0);
    const one = captureControl(islandMap(), id, ['a'], NOW, 7);
    expect(harvestOver(one, id, NOW, 8 * 24, LV).runes).toBeLessThan(got.runes);
  });
});
