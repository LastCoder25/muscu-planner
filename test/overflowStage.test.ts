// 🕳️💥 Le débordement d'une faille se dit et se rejoue (v0.1218).
import { describe, expect, it } from 'vitest';
import { EXPE, type ExpeditionMap, type ExpeditionMessage, type Poi } from '@/lib/expedition';
import {
  OVERFLOW_AMBUSHERS,
  OVERFLOW_MARCHERS,
  overflowAmbushed,
  overflowAutoReplay,
  overflowCast,
  overflowMessage,
} from '@/lib/overflowStage';
import { riftOverflowAt, riftSpecOf } from '@/lib/rift';

const RIFT_MS = EXPE.lifespanMs.rift;
const poi = (id: string, type: Poi['type'], x: number, y: number): Poi => ({
  id,
  type,
  level: 30,
  x,
  y,
  distNorm: 0.5,
  spawnedAt: 1000,
  expiresAt: 1000 + RIFT_MS,
});
const rift = poi('rift_1', 'rift', 100, 100);
const map = (pois: Poi[]): ExpeditionMap => ({ pois }) as unknown as ExpeditionMap;

describe('📬 le message d’un débordement', () => {
  const near = poi('a', 'mine', 100 + EXPE.irradMax - 1, 100);
  const far = poi('b', 'camp', 100 + EXPE.irradMax + 1, 100);
  const mine = poi('rift_1_mine', 'mana_mine', 100, 100);
  const other = poi('rift_2', 'rift', 101, 100);

  it('compte les lieux harcelés : à portée, hors failles et mines', () => {
    expect(overflowAmbushed(rift, map([near, far, mine, other]))).toBe(1);
  });
  it('id dérivé de la faille, daté du débordement, rien à encaisser', () => {
    const m = overflowMessage(rift, map([near]), true);
    expect(m.id).toBe('ovf_rift_1');
    expect(overflowMessage(rift, map([]), false).id).toBe(m.id);
    expect(m.resolvedAt).toBe(riftOverflowAt(rift));
    expect(m.claimed).toBeUndefined();
    expect(m.overflow).toEqual({
      faction: riftSpecOf(rift).faction,
      level: 30,
      ambushed: 1,
      marching: true,
    });
  });
  it('le texte dit ce qui marche — ou pas — sur la base', () => {
    expect(overflowMessage(rift, map([]), true).text).toContain('marche sur ta base');
    expect(overflowMessage(rift, map([]), false).text).toContain('se disperse');
  });
});

describe('▶️ le rejeu automatique', () => {
  const msg = (id: string, at: number, overflow = true) =>
    ({
      id,
      resolvedAt: at,
      ...(overflow
        ? { overflow: { faction: 'betes', level: 1, ambushed: 0, marching: false } }
        : {}),
    }) as unknown as ExpeditionMessage;
  const now = 10 * 24 * 3600_000;
  it('le plus récent, jamais vu, de moins de 3 jours ; les autres rapports ignorés', () => {
    const t = overflowAutoReplay(
      [msg('old', 0), msg('a', now - 5000), msg('b', now - 1000), msg('r', now, false)],
      new Set(),
      now,
    );
    expect(t.play?.id).toBe('b');
    expect(t.seen.sort()).toEqual(['a', 'b', 'old']);
  });
  it('rien de neuf : rien ne rejoue', () => {
    expect(overflowAutoReplay([msg('b', now)], new Set(['b']), now).play).toBeNull();
  });
});

describe('🐾 qui sort de la faille', () => {
  it('des embusqués, une colonne, et le gardien la ferme', () => {
    const c = overflowCast({ faction: 'mortsvivants', level: 30, ambushed: 2, marching: true });
    expect(c.ambushers.length).toBe(OVERFLOW_AMBUSHERS);
    expect(c.marchers.length).toBe(OVERFLOW_MARCHERS);
    expect(c.marchers.at(-1)!.name).toContain('(gardien)');
  });
});
