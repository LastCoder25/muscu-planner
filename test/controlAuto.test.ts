// 🏰 Plus de réserve à récolter sur les lieux fixes (2026-09-29) : la production est versée
// toute seule, et un rapport annonce consommables, runes et ascensions devenues possibles.
import { describe, expect, it } from 'vitest';
import {
  AUTO_COLLECT_MS,
  ascensionMessage,
  autoCollectable,
  captureControl,
  collectControl,
  controlIdOf,
  controlLootMessage,
  ensureControls,
  newAscensions,
} from '@/lib/controlPoints';
import { advXpToNext, grantAdvXp } from '@/lib/adventurers';
import { refAdvGear, refChampionAdv } from '@/lib/caravan';
import { advGearLevelBand } from '@/lib/advGear';
import { createMap, type ControlKind, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const heldMap = (kinds: ControlKind[]): ExpeditionMap => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  for (const k of kinds) m = captureControl(m, controlIdOf(k), ['a', 'b', 'c'], 0, 7);
  return m;
};

describe('🏰 la production des lieux fixes est versée toute seule', () => {
  it('chaque point tenu qui produit passe au plus une fois par minute ; la tour jamais', () => {
    const m = heldMap(['mine', 'tower', 'training']);
    expect(autoCollectable(m, AUTO_COLLECT_MS - 1)).toEqual([]);
    const ids = autoCollectable(m, AUTO_COLLECT_MS).map((p) => p.id);
    expect(ids).toContain(controlIdOf('mine'));
    expect(ids).toContain(controlIdOf('training'));
    expect(ids).not.toContain(controlIdOf('tower'));
  });
  it('un point ennemi n’est jamais récolté', () => {
    expect(autoCollectable(ensureControls(createMap(3, 0, L, 1), 0, L), 10 * H)).toEqual([]);
  });
  it('⛏️ récoltée souvent, la mine ne perd rien : la fraction d’une pièce est reportée', () => {
    const id = controlIdOf('mine');
    let m = heldMap(['mine']);
    let often = 0;
    for (let t = 1; t <= 60; t++) {
      const c = collectControl(m, id, t * AUTO_COLLECT_MS, L);
      often += c.gold;
      m = c.map;
    }
    const once = collectControl(heldMap(['mine']), id, 60 * AUTO_COLLECT_MS, L).gold;
    expect(Math.abs(often - once)).toBeLessThanOrEqual(1);
  });
});

describe('📬 les rapports d’un lieu fixe', () => {
  const p = heldMap(['garden']).pois.find((q) => q.id === controlIdOf('garden'))!;
  it('un consommable ou une rune : un rapport déjà crédité (rien à récupérer)', () => {
    const m = controlLootMessage(p, 5 * H, { ration: 2 }, 0)!;
    expect(m.title).toContain('2 consommables');
    expect(m.supplies).toEqual({ ration: 2 });
    expect(m.claimed).toBeUndefined();
    expect(m.read).toBe(false);
    const r = controlLootMessage(p, 5 * H, {}, 1)!;
    expect(r.title).toContain('1 rune');
    expect(r.runes).toBe(1);
    expect(r.text).toMatch(/Panthéon/);
  });
  it('rien produit : pas de rapport', () => {
    expect(controlLootMessage(p, 5 * H, {}, 0)).toBeNull();
  });
});

describe('🌟 prêt pour l’ascension', () => {
  const adv = { ...refChampionAdv(9, 0), id: 'a1', level: 9, xp: 0, ascended: 0 };
  const ready = grantAdvXp(adv, advXpToNext(9) + advXpToNext(10), 100);
  it('annonce le champion qui VIENT de devenir prêt, pas celui qui l’était déjà', () => {
    expect(newAscensions([adv], [ready], [], []).champs.map((a) => a.id)).toEqual(['a1']);
    expect(newAscensions([ready], [ready], [], []).champs).toEqual([]);
  });
  it('annonce la pièce qui vient de buter sur le ★5 de son rang', () => {
    const g = { ...refAdvGear(1, 1)[0]!, id: 'g1' };
    const capped = { ...g, level: advGearLevelBand(g.rarity).max };
    expect(g.level).toBeLessThan(capped.level);
    expect(newAscensions([], [], [g], [capped]).gear.map((x) => x.id)).toEqual(['g1']);
    expect(newAscensions([], [], [capped], [capped]).gear).toEqual([]);
  });
  it('le rapport nomme le champion et la pièce (et son porteur)', () => {
    const g = { ...refAdvGear(1, 1)[0]!, id: 'g1', name: 'Épée' };
    const m = ascensionMessage(7, { champs: [ready], gear: [g] }, new Map([['g1', 'Orsène']]))!;
    expect(m.title).toContain('2 prêts');
    expect(m.text).toContain(ready.name);
    expect(m.text).toContain('Épée (Orsène)');
    expect(ascensionMessage(7, { champs: [], gear: [] }, new Map())).toBeNull();
  });
});
