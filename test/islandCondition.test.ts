// 🌗 Les conditions d'île (v1.276.0) : fonction pure de (graine, île, période de 12 h).
import { describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  CONDITION_PERIOD_MS as P,
  activeCondition,
  meanGoldMult,
  conditionFor,
  conditionFx,
  nextRareCondition,
  scaleXp,
  upcomingCondition,
  type ConditionId,
} from '@/lib/islandCondition';
import { createMap, harvestGold, startExpedition, type Poi } from '@/lib/expedition';
import { resolveCaravan, refAdvGear, refChampionAdv } from '@/lib/caravan';
import { refFighter } from '@/lib/proceduralContent';
import { rollSupplyDrop } from '@/lib/supplies';
import { planPushes } from '@/lib/push';

const mapOn = (seed: number, island = 3) => ({
  ...createMap(seed, 0, 30, 30),
  archipel: { island, levelCap: 60 },
});
const mine = (type: Poi['type'] = 'mine'): Poi => ({
  id: 'p_' + type,
  type,
  level: 40,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});
/** Une période (de la carte donnée) où `id` tombe, ou -1. */
function findPeriod(seed: number, island: number, id: ConditionId | null, from = 1000) {
  for (let p = from; p < from + 5000; p++) if (conditionFor(seed, island, p) === id) return p;
  return -1;
}

describe('🌗 la condition est une fonction pure et périodique', () => {
  it('déterministe : mêmes entrées, même réponse', () => {
    for (let p = 0; p < 200; p++) expect(conditionFor(77, 3, p)).toBe(conditionFor(77, 3, p));
  });

  it('constante pendant toute une période, indépendante de l’instant', () => {
    const m = mapOn(5);
    for (let p = 2000; p < 2300; p++) {
      const a = activeCondition(m, p * P)?.def.id ?? null;
      expect(activeCondition(m, p * P + P / 2)?.def.id ?? null).toBe(a);
      expect(activeCondition(m, (p + 1) * P - 1)?.def.id ?? null).toBe(a);
    }
  });

  it('change avec la période, la graine et l’île ; le repos existe', () => {
    const ids = new Set<string | null>();
    for (let p = 0; p < 400; p++) ids.add(conditionFor(9, 3, p));
    expect(ids.size).toBe(5); // 4 conditions + le repos (null)
    const a = Array.from({ length: 300 }, (_, p) => conditionFor(9, 3, p)).join();
    expect(Array.from({ length: 300 }, (_, p) => conditionFor(10, 3, p)).join()).not.toBe(a);
    expect(Array.from({ length: 300 }, (_, p) => conditionFor(9, 4, p)).join()).not.toBe(a);
  });

  it('MESURÉ : les fréquences collent aux chances, plus de la moitié des périodes au repos', () => {
    const N = 40000;
    const n: Record<string, number> = {};
    for (let p = 0; p < N; p++) {
      const k = conditionFor(123, 2, p) ?? 'repos';
      n[k] = (n[k] ?? 0) + 1;
    }
    for (const c of Object.values(CONDITIONS))
      expect(Math.abs((n[c.id] ?? 0) / N - c.odds), c.id).toBeLessThan(0.01);
    expect((n.repos ?? 0) / N).toBeGreaterThan(0.5);
  });

  it('⚖️ ÉCONOMIE : le gain MOYEN d’or de mine reste borné (une condition à ×2 n’est pas permanente)', () => {
    const N = 40000;
    let mineSum = 0;
    let plunderSum = 0;
    for (let p = 0; p < N; p++) {
      const id = conditionFor(321, 3, p);
      mineSum += (id && CONDITIONS[id].gold?.mine) || 1;
      plunderSum += (id && CONDITIONS[id].gold?.plunder) || 1;
    }
    expect(mineSum / N).toBeGreaterThan(1.015);
    expect(mineSum / N).toBeLessThan(1.05);
    expect(plunderSum / N).toBeLessThan(1.04);
    expect(meanGoldMult('mine')).toBeCloseTo(1.03, 3);
  });

  it('sans archipel, aucune condition', () => {
    const m = createMap(5, 0, 30, 30);
    expect(m.archipel).toBeUndefined();
    for (let p = 0; p < 50; p++) expect(activeCondition(m, p * P)).toBeNull();
    expect(nextRareCondition(m, 0)).toBeNull();
    expect(conditionFx(m, 0).goldOf('mine')).toBe(1);
  });

  it('la durée restante couvre une série de périodes identiques', () => {
    const m = mapOn(5);
    for (let p = 3000; p < 3600; p++) {
      const c = activeCondition(m, p * P + 1);
      if (!c) continue;
      expect(c.startsAt).toBeLessThanOrEqual(p * P);
      expect(c.endsAt).toBeGreaterThanOrEqual((p + 1) * P);
      // Après la fin de la série, la condition n'est plus la même.
      expect(activeCondition(m, c.endsAt)?.def.id).not.toBe(c.def.id);
    }
  });

  it('upcomingCondition rend la première condition NOUVELLE', () => {
    const m = mapOn(5);
    let vus = 0;
    for (let p = 4000; p < 4100; p++) {
      const u = upcomingCondition(m, p * P + 1);
      if (!u) continue; // 4 périodes de repos de suite : possible (≈ 9 %)
      vus++;
      expect(activeCondition(m, u.startsAt)?.def.id).toBe(u.def.id);
      expect(activeCondition(m, u.startsAt - 1)?.def.id).not.toBe(u.def.id);
      expect(u.startsAt).toBeGreaterThan(p * P + 1);
    }
    expect(vus).toBeGreaterThan(70);
  });
});

describe('🪙 l’or n’est multiplié que sous la condition', () => {
  it('harvestGold : ×1 par défaut, ×2 avec la lune ; un puits ne rapporte jamais d’or', () => {
    const p = mine();
    expect(Math.abs(harvestGold(p, 40, 2) - harvestGold(p, 40) * 2)).toBeLessThanOrEqual(1);
    expect(harvestGold(p, 40, 1)).toBe(harvestGold(p, 40));
    expect(harvestGold({ ...p, type: 'well' }, 40, 2)).toBe(0);
  });

  it('conditionFx : lune ×1,6 mine+pillée, filon ×1,2 mines SEULES, repos ×1', () => {
    const seed = 11;
    const lune = findPeriod(seed, 3, 'lune_rouge');
    const filon = findPeriod(seed, 3, 'filon_riche');
    const repos = findPeriod(seed, 3, null);
    const m = mapOn(seed);
    expect(conditionFx(m, lune * P).goldOf('mine')).toBe(1.6);
    expect(conditionFx(m, lune * P).goldOf('plunder')).toBe(1.6);
    expect(conditionFx(m, filon * P).goldOf('mine')).toBe(1.2);
    expect(conditionFx(m, filon * P).goldOf('plunder')).toBe(1);
    expect(conditionFx(m, repos * P).goldOf('mine')).toBe(1);
  });

  it('le héros (startExpedition) et une équipe (resolveCaravan) touchent le multiplicateur', () => {
    const p = mine();
    const base = startExpedition(refFighter(40), p, 0, 12345, 1, 40);
    const lune = startExpedition(refFighter(40), p, 0, 12345, 1, 40, 2);
    expect(Math.abs(lune.outcome.gold - base.outcome.gold * 2)).toBeLessThanOrEqual(1);
    expect(lune.outcome.gold).toBeGreaterThan(base.outcome.gold);
    const esc = [0, 1, 2].map((i) => refChampionAdv(40, i));
    const kit = { advGear: refAdvGear(40, 3) };
    for (let seed = 1; seed <= 30; seed++) {
      const a = resolveCaravan(p, esc, seed, kit, 40, 40);
      const b = resolveCaravan(p, esc, seed, kit, 40, 40, { conditionMult: 2 });
      if (a.turnBack !== undefined) continue;
      expect(b.gold).toBeGreaterThan(a.gold * 1.9);
      expect(b.gold).toBeLessThan(a.gold * 2.1);
    }
  });
});

describe('🛒🍃 consommable et XP', () => {
  it('Marchand : le seuil monte, le tirage ne change pas (un drop à ×1 l’est à ×2)', () => {
    let a = 0;
    let b = 0;
    for (let s = 1; s <= 4000; s++) {
      const x = Object.keys(rollSupplyDrop(s * 2654435761)).length;
      const y = Object.keys(rollSupplyDrop(s * 2654435761, 2)).length;
      expect(y).toBeGreaterThanOrEqual(x);
      a += x;
      b += y;
    }
    expect(b).toBeGreaterThan(a * 1.3);
  });

  it('Vents calmes : l’XP est mise à l’échelle, inchangée à ×1', () => {
    const xp = { a: 100, b: 41 };
    expect(scaleXp(xp, 1)).toBe(xp);
    expect(scaleXp(xp, 1.25)).toEqual({ a: 125, b: 51 });
    const seed = 11;
    const vents = findPeriod(seed, 3, 'vents_calmes');
    expect(conditionFx(mapOn(seed), vents * P).xp).toBe(1.25);
  });
});

describe('🔔 la prévision de notification = ce que la carte applique', () => {
  it('nextRareCondition annonce une condition RARE qui COMMENCE à l’heure dite', () => {
    let vus = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const m = mapOn(seed * 7919, 1 + (seed % 5));
      const now = 5000 * P + 12345;
      const n = nextRareCondition(m, now);
      if (!n) continue;
      vus++;
      const at = activeCondition(m, n.at)!;
      expect(at.def.rare).toBe(true);
      expect(at.def.label).toBe(n.label);
      expect(at.startsAt).toBe(n.at);
      // Avant l'heure annoncée, ce n'était pas elle ; et c'est la PREMIÈRE rare à venir.
      expect(activeCondition(m, n.at - 1)?.def.id).not.toBe(at.def.id);
      for (let t = Math.ceil(now / P) * P; t < n.at; t += P) {
        const c = activeCondition(m, t);
        expect(c?.def.rare && c.startsAt === t).toBeFalsy();
      }
      // Stable : replanifier plus tard dans la même période rend le même id.
      expect(nextRareCondition(m, now + 1000)?.id).toBe(n.id);
    }
    expect(vus).toBeGreaterThan(12);
  });

  it('une rare qui PROLONGE la précédente n’est pas ré-annoncée', () => {
    const m = mapOn(31);
    let paires = 0;
    for (let p = 100; p < 40000 && paires < 5; p++) {
      const id = conditionFor(31, 3, p);
      if (!id || !CONDITIONS[id].rare || conditionFor(31, 3, p - 1) !== id) continue;
      paires++;
      const n = nextRareCondition(m, (p - 1) * P + 1, P + 1000);
      expect(n?.at).not.toBe(p * P);
    }
    expect(paires).toBe(5);
  });

  it('planPushes programme « condition » à l’heure, rien si null', () => {
    const base = {
      base: null,
      expedition: null,
      parties: [],
      watchtowerLevel: 0,
      fortSightMs: () => 0,
      activeDays7: 0,
      pacified: false,
      playerLevel: 30,
      plunder: null,
      controls: [],
    };
    let s = 7;
    for (let i = 0; i < 500 && !nextRareCondition(mapOn(s), 0); i++) s++; // borné : jamais de boucle folle
    const n = nextRareCondition(mapOn(s), 0)!;
    expect(n).not.toBeNull();
    const plans = planPushes({ ...base, towerBoost: 0, condition: n } as never, 0);
    const c = plans.filter((p) => p.kind === 'condition');
    expect(c).toHaveLength(1);
    expect(c[0]!.sendAt).toBe(n.at);
    expect(c[0]!.dedupe).toBe(n.id);
    expect(
      planPushes({ ...base, towerBoost: 0, condition: null } as never, 0).filter(
        (p) => p.kind === 'condition',
      ),
    ).toHaveLength(0);
    // Une sorte coupée n'est pas programmée.
    expect(
      planPushes({ ...base, towerBoost: 0, condition: n } as never, 0, ['condition']).some(
        (p) => p.kind === 'condition',
      ),
    ).toBe(false);
  });
});
