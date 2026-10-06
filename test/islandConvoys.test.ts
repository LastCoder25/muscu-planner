import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { advanceWorld, createMap, poiLabel, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  CONVOY,
  FORTRESS_ID,
  convoyBonus,
  convoyVanquished,
  ensureIslandConquest,
  warlordConvoys,
} from '@/lib/islandConquest';
import { SORTIE_EVENTS, sortieThreshold } from '@/lib/sortieClock';
import { resolveConvoy } from '@/lib/rift';
import { refAdventurer } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const LV = 70;

function islandMap(id = 4, L = LV): ExpeditionMap {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const convoysOf = (m: ExpeditionMap) => m.pois.filter((p) => p.convoy);
const fortressSize = (m: ExpeditionMap) => m.pois.find((p) => p.id === FORTRESS_ID)!.control!.size!;

/** Les sorties qui font partir le premier convoi (une par heure) : leur dernier instant est
 *  son départ. */
function departuresFor(m: ExpeditionMap): number[] {
  const k = sortieThreshold(m.seed, 'convoy', 0, 1);
  return Array.from({ length: k }, (_, i) => NOW + (i + 1) * H);
}

/** Fait partir le premier convoi : rend la carte et le convoi en route. */
function firstConvoy(): { m: ExpeditionMap; c: Poi } {
  const m0 = islandMap();
  const dep = departuresFor(m0);
  const at = dep[dep.length - 1]!;
  const m = warlordConvoys({ ...m0, departures: dep }, at);
  return { m, c: convoysOf(m)[0]! };
}

describe('🐫 l’île 4 : les convois de ravitaillement', () => {
  it('un convoi part d’un camp vers la forteresse, et marche 8 h', () => {
    const m0 = islandMap();
    expect(convoysOf(m0)).toHaveLength(0);
    expect(m0.archipel!.convoyAt).toBeUndefined();
    expect(m0.archipel!.sorties!.convoy).toEqual({ from: NOW, charge: 0, fired: 0 });
    const dep = departuresFor(m0);
    expect(dep.length).toBeGreaterThanOrEqual(SORTIE_EVENTS.convoy.min);
    expect(dep.length).toBeLessThanOrEqual(SORTIE_EVENTS.convoy.max);
    // Une sortie de moins : aucun convoi.
    const short = warlordConvoys({ ...m0, departures: dep.slice(0, -1) }, NOW + 2 * 24 * H);
    expect(convoysOf(short)).toHaveLength(0);
    const { m, c } = firstConvoy();
    expect(c.spawnedAt).toBe(dep[dep.length - 1]);
    const camps = m.pois.filter((p) => p.control?.kind === 'objective');
    const f = m.pois.find((p) => p.id === FORTRESS_ID)!;
    expect(c.type).toBe('warband');
    expect(camps.some((p) => p.x === c.from!.x && p.y === c.from!.y)).toBe(true);
    expect(c.to).toEqual({ x: f.x, y: f.y });
    expect(c.expiresAt - c.spawnedAt).toBe(CONVOY.travelMs);
    expect(poiLabel(c)).toBe('Convoi de ravitaillement');
    expect(m.archipel!.convoys).toEqual([{ id: c.id, at: c.expiresAt }]);
  });

  it('arrivé sans encombre, il renforce la forteresse d’un champion de référence', () => {
    const { m, c } = firstConvoy();
    const before = fortressSize(m);
    // La carte avance comme dans le jeu : il reste jusqu’à ce que l’arrivée soit tranchée.
    const w = advanceWorld(m, c.expiresAt + 1, LV, ISLAND_OUTPOST_LEVEL);
    expect(w.pois.some((p) => p.id === c.id)).toBe(true);
    const after = ensureIslandConquest(w, c.expiresAt + 1, LV);
    expect(after.pois.some((p) => p.id === c.id)).toBe(false);
    expect(after.archipel!.delivered).toContain(c.id);
    expect(convoyBonus(after)).toBe(CONVOY.troop);
    // La troupe se rafraîchit au tick suivant de la carte.
    expect(fortressSize(ensureIslandConquest(after, c.expiresAt + 2, LV))).toBe(before + 1);
  });

  it('retiré de la carte avant d’arriver (rompu), il ne livre rien', () => {
    const { m, c } = firstConvoy();
    const gone = { ...m, pois: m.pois.filter((p) => p.id !== c.id) };
    const out = warlordConvoys(gone, c.expiresAt + 1);
    expect(out.archipel!.delivered ?? []).not.toContain(c.id);
    expect(out.archipel!.convoys ?? []).toEqual([]);
  });

  it('battu par un voyage, il ne livre rien même si la carte l’a encore', () => {
    const { m, c } = firstConvoy();
    const won = convoyVanquished([{ poi: c, outcome: { win: true } }]);
    const out = warlordConvoys(m, c.expiresAt + 1, won);
    expect(out.archipel!.delivered ?? []).not.toContain(c.id);
    expect(out.pois.some((p) => p.id === c.id)).toBe(false);
    // Une défaite ne l’arrête pas.
    const lost = convoyVanquished([{ poi: c, outcome: { win: false } }]);
    expect(warlordConvoys(m, c.expiresAt + 1, lost).archipel!.delivered).toContain(c.id);
  });

  it('le renfort est borné', () => {
    const m = islandMap();
    const many = { ...m, archipel: { ...m.archipel!, delivered: ['a', 'b', 'c', 'd', 'e', 'f'] } };
    expect(convoyBonus(many)).toBe(CONVOY.max * CONVOY.troop);
  });

  it('aucun convoi ailleurs qu’à l’île 4', () => {
    for (const id of [1, 2, 3, 5]) {
      const m = islandMap(id);
      expect(m.archipel!.sorties?.convoy).toBeUndefined();
      const dep = Array.from({ length: 30 }, (_, i) => NOW + (i + 1) * H);
      expect(convoysOf(warlordConvoys({ ...m, departures: dep }, NOW + 10 * 24 * H))).toHaveLength(
        0,
      );
    }
  });

  it('la même carte tant que rien n’est dû', () => {
    const { m, c } = firstConvoy();
    expect(warlordConvoys(m, c.expiresAt - 1)).toBe(m);
  });

  it('qui ne sort pas ne voit partir aucun convoi', () => {
    const m = islandMap();
    expect(warlordConvoys(m, NOW + 30 * 24 * H)).toBe(m);
  });

  it('l’horloge d’avant la v1.66.0 (`convoyAt`) est effacée', () => {
    const m0 = islandMap();
    const m = warlordConvoys(
      { ...m0, archipel: { ...m0.archipel!, convoyAt: NOW + H } },
      NOW + 2 * H,
    );
    expect(m.archipel!.convoyAt).toBeUndefined();
    expect(convoysOf(m)).toHaveLength(0);
  });
});

describe('🐫 intercepter un convoi', () => {
  const team = (lvl: number, n: number): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refAdventurer(lvl, i),
      id: `a${i}`,
      name: `A${i}`,
      seed: i + 1,
    }));
  it('rapporte de l’or, jamais de mana, et ne touche pas au débordement d’une faille', () => {
    const { c } = firstConvoy();
    const o = resolveConvoy({
      poi: c,
      escort: team(LV + 10, 8),
      road: { advGear: [] },
      hero: null,
      seed: 4,
      playerLevel: LV,
      pantheonLevel: LV,
    });
    expect(o.win).toBe(true);
    expect(o.gold).toBeGreaterThan(0);
    expect(o.mana).toBe(0);
    expect(o.party!.convoy).toBe(true);
    expect(o.party!.riftHit).toBeUndefined();
  });
  it('repoussé, il ne rapporte que la part abattue', () => {
    const { c } = firstConvoy();
    const o = resolveConvoy({
      poi: c,
      escort: team(LV, 3),
      road: { advGear: [] },
      hero: null,
      seed: 4,
      playerLevel: LV,
      pantheonLevel: LV,
    });
    expect(o.win).toBe(false);
    expect(o.gold).toBeGreaterThan(0);
    expect(o.mana).toBe(0);
    expect(o.party!.riftHit).toBeUndefined();
  });
});
