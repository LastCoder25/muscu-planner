// 🏯🏝️ Basculer en mode archipel puis en sortir ne doit RIEN faire perdre aux citadelles :
// ni leur trêve (grisée 3 jours après destruction), ni leur palier, ni leurs destructions.
// Défaut constaté sur le compte réel le 2026-10-02 : elles revenaient à neuf.
import { describe, expect, it } from 'vitest';
import { archipelOn } from '@/lib/archipelago';
import {
  captureControl,
  citadelIdOf,
  ensureControls,
  razeCitadel,
} from '@/lib/controlPoints';
import { createMap, citadelRestingUntil, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const base = (): ExpeditionMap => ensureControls(createMap(5, 0, L, 1), 0, L, 100);
const cit = (m: ExpeditionMap, i: number) => m.pois.find((p) => p.id === citadelIdOf(i));
const tick = (m: ExpeditionMap, now: number) => ensureControls(m, now, L, 100);

describe('citadelles mises de côté pendant le mode archipel', () => {
  const razedAt = 10 * H;
  const razed = razeCitadel(base(), citadelIdOf(0), razedAt);
  const before = cit(razed, 0)!;

  it('sur une île, elles quittent la carte mais sont gardées', () => {
    const island = tick({ ...razed, archipel: archipelOn(1) }, razedAt + H);
    expect(cit(island, 0)).toBeUndefined();
    expect(island.citadelStash?.some((p) => p.id === citadelIdOf(0))).toBe(true);
  });

  it('en sortant, elles reviennent avec leur trêve, leur palier et leurs destructions', () => {
    const island = tick({ ...razed, archipel: archipelOn(1) }, razedAt + H);
    const off: ExpeditionMap = { ...island };
    delete off.archipel;
    const back = tick(off, razedAt + 2 * H);
    const c = cit(back, 0)!.control!;
    expect(c.truceUntil).toBe(before.control!.truceUntil);
    expect(c.palier).toBe(before.control!.palier);
    expect(c.retakes).toBe(before.control!.retakes);
    expect(citadelRestingUntil(cit(back, 0)!, razedAt + 2 * H)).toBeGreaterThan(0);
    expect(back.citadelStash).toBeUndefined();
  });

  it('un raid échu pendant l’île est reprogrammé, pas rattrapé', () => {
    // Des points tenus, attaque prévue loin : un raid rattrapé les avancerait dans le passé.
    const far = razedAt + 500 * H;
    let held = razed;
    for (const p of razed.pois)
      if (p.control && p.control.kind !== 'citadel')
        held = captureControl(held, p.id, ['a0'], razedAt, 7);
    held = {
      ...held,
      pois: held.pois.map((p) =>
        p.control?.owner === 'player' ? { ...p, control: { ...p.control, attackAt: far } } : p,
      ),
    };
    const island = tick({ ...held, archipel: archipelOn(1) }, razedAt + H);
    const stash = island.citadelStash!.map((p) =>
      p.id === citadelIdOf(1) ? { ...p, control: { ...p.control!, raidAt: razedAt + 2 * H } } : p,
    );
    const off: ExpeditionMap = { ...island, citadelStash: stash };
    delete off.archipel;
    const now = razedAt + 50 * H;
    const back = tick(off, now);
    const raidAt = cit(back, 1)!.control!.raidAt;
    expect(raidAt === undefined || raidAt > now).toBe(true);
    const pulled = back.pois.filter(
      (p) => p.control?.owner === 'player' && (p.control.attackAt ?? Infinity) <= now,
    );
    expect(pulled.map((p) => p.id)).toEqual([]);
  });

  it('une carte sans archipel ni réserve reste identique (aucune écriture à vide)', () => {
    const m = base();
    expect(tick(m, 0)).toBe(m);
  });
});
