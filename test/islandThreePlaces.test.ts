import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap, type PartyResult } from '@/lib/expedition';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlKindsOf,
  controlYieldCard,
  ensureControls,
  hospiceDivisor,
  hospiceHealMult,
} from '@/lib/controlPoints';
import { ensureIslandConquest, FORTRESS_ID, objectiveIdOf } from '@/lib/islandConquest';
import { onIsland } from '@/lib/islandTerrain';
import { partyClaimRoster } from '@/lib/party';
import { caravanHurtMs } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';

/**
 * 🏝️ TROIS LIEUX FIXES PAR ÎLE (2026-10-04, décision de l'utilisateur) : archives (île 2),
 * hospice (île 3), cercle d'invocation (île 4), laboratoire (île 5).
 */
const NOW = Date.UTC(2026, 9, 4, 12);
const H = 3600_000;
const L = 40;

function islandMap(id: number, lv = L): ExpeditionMap {
  const m = createMap(5, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, lv, ISLAND_OUTPOST_LEVEL), NOW, lv);
}
const fixedOf = (m: ExpeditionMap) =>
  m.pois.filter((p) => p.control && !['objective', 'fortress', 'citadel'].includes(p.control.kind));
/** Tenu, sans reprise prévue (la production s'arrête à l'heure de l'attaque). */
function held(m: ExpeditionMap, id: string, crew: string[]): ExpeditionMap {
  const c = captureControl(m, id, crew, NOW, 7);
  return {
    ...c,
    pois: c.pois.map((p) =>
      p.id === id ? { ...p, control: { ...p.control!, attackAt: undefined } } : p,
    ),
  };
}

describe('🏝️ trois lieux fixes par île', () => {
  it('chaque île en a exactement 3, distincts, sans doublon d’une île à l’autre', () => {
    const seen = new Map<string, number>();
    for (const isl of [1, 2, 3, 4, 5]) {
      const ks = controlKindsOf({ archipel: archipelOn(isl) });
      expect(ks.length, `île ${isl}`).toBe(3);
      expect(new Set(ks).size).toBe(3);
      for (const k of ks) {
        expect(seen.get(k), `${k} déjà sur l’île ${seen.get(k)}`).toBeUndefined();
        seen.set(k, isl);
      }
    }
    expect(controlKindsOf({ archipel: archipelOn(2) })).toContain('archives');
    expect(controlKindsOf({ archipel: archipelOn(3) })).toContain('hospice');
    expect(controlKindsOf({ archipel: archipelOn(4) })).toContain('circle');
    expect(controlKindsOf({ archipel: archipelOn(5) })).toContain('lab');
  });

  it('les trois sont posés sur la terre, écartés entre eux et des objectifs', () => {
    for (const isl of [1, 2, 3, 4, 5])
      for (const seed of [1, 5, 9, 13]) {
        const base = createMap(seed, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(isl));
        const m = ensureIslandConquest(ensureControls(base, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
        const fx = fixedOf(m);
        expect(fx.length, `île ${isl}`).toBe(3);
        for (const p of fx) expect(onIsland(isl, p.x, p.y), `${p.id} île ${isl}`).toBe(true);
        for (let i = 0; i < fx.length; i++)
          for (let j = i + 1; j < fx.length; j++)
            expect(Math.hypot(fx[i]!.x - fx[j]!.x, fx[i]!.y - fx[j]!.y)).toBeGreaterThan(9);
        const targets = [objectiveIdOf(0), objectiveIdOf(1), FORTRESS_ID]
          .map((id) => m.pois.find((p) => p.id === id))
          .filter((p) => !!p);
        for (const t of targets)
          for (const p of fx) expect(Math.hypot(t.x - p.x, t.y - p.y)).toBeGreaterThan(9);
      }
  });

  it('une île déjà jouée gagne son 3ᵉ lieu au chargement, sans toucher aux deux autres', () => {
    const full = islandMap(3);
    const hid = controlIdOf('hospice');
    const old = { ...full, pois: full.pois.filter((p) => p.id !== hid) };
    const again = ensureControls(old, NOW + H, L, ISLAND_OUTPOST_LEVEL);
    expect(again.pois.some((p) => p.id === hid)).toBe(true);
    for (const k of ['lapidary', 'arsenal'] as const) {
      const id = controlIdOf(k);
      expect(again.pois.find((p) => p.id === id)).toBe(old.pois.find((p) => p.id === id));
    }
    expect(poiLabel(again.pois.find((p) => p.id === hid)!)).toContain('Hospice');
  });
});

describe('🕯️ l’hospice (île 3)', () => {
  const id = controlIdOf('hospice');
  it('ne produit rien et divise la convalescence par 2 au complet', () => {
    const m = held(islandMap(3), id, ['a', 'b', 'c', 'd', 'e']);
    expect(hospiceHealMult(m)).toBeCloseTo(0.5, 9);
    const got = collectControl(m, id, NOW + 72 * H, L);
    expect(got.gold + got.mana + got.runes + got.keys + got.summon).toBe(0);
    expect(controlYieldCard(m.pois.find((p) => p.id === id)!, NOW, L)!.value).toBe('÷2');
  });
  it('rien sans garnison, ni quand il n’est pas tenu, ni hors archipel', () => {
    const m = islandMap(3);
    expect(hospiceHealMult(m)).toBe(1);
    expect(hospiceDivisor(0)).toBe(1);
    expect(hospiceHealMult(held(m, id, []))).toBe(1);
    const off = { ...held(m, id, ['a', 'b', 'c', 'd', 'e']) };
    delete off.archipel;
    expect(hospiceHealMult(off)).toBe(1);
    expect(hospiceHealMult(null)).toBe(1);
  });
  it('un soigneur : moins qu’au complet, mieux que rien', () => {
    const one = hospiceHealMult(held(islandMap(3), id, ['a']));
    expect(one).toBeGreaterThan(0.5);
    expect(one).toBeLessThan(1);
  });
  it('la convalescence d’un champion blessé sur l’île est réellement abrégée', () => {
    const adv = { id: 'a', name: 'A', seed: 1, path: ['guerrier'], level: 10, xp: 0 } as Adventurer;
    const party = { escort: ['a'], xp: { a: 10 }, hurt: ['a'] } as unknown as PartyResult;
    const ctx = { pantheonLevel: 50, infirmaryLevel: 0, backAt: 1000, now: 1000, xpGranted: true };
    const full = caravanHurtMs([adv], 0);
    const plain = partyClaimRoster(party, [adv], { ...ctx, healMult: 1 }).adventurers[0]!;
    const healed = partyClaimRoster(party, [adv], {
      ...ctx,
      healMult: hospiceHealMult(held(islandMap(3), id, ['b', 'c', 'd', 'e', 'f'])),
    }).adventurers[0]!;
    expect(plain.hurtUntil).toBe(1000 + full);
    expect(healed.hurtUntil).toBe(1000 + full / 2);
  });
});

describe('⚗️ le laboratoire (île 5)', () => {
  it('deux fois moins vite que le scriptorium, toutes ses runes bénies', () => {
    expect(CONTROL.labSlowdown).toBe(2);
    const crew = ['a', 'b', 'c', 'd', 'e'];
    const lab = held(islandMap(5), controlIdOf('lab'), crew);
    const scr = held(islandMap(2), controlIdOf('scriptorium'), crew);
    const T = NOW + 20 * CONTROL.runeHoursPerItem * H;
    const gl = collectControl(lab, controlIdOf('lab'), T, L);
    const gs = collectControl(scr, controlIdOf('scriptorium'), T, L);
    expect(gs.runes).toBeGreaterThan(10);
    expect(Math.abs(gl.runes - gs.runes / 2)).toBeLessThanOrEqual(1);
    expect(gl.blessedRunes).toBe(gl.runes);
    expect(gs.blessedRunes).toBe(0);
  });
});
