import { describe, expect, it } from 'vitest';
import {
  BASCULE,
  basculeRefundGold,
  basculeRefunds,
  basculeToArchipel,
} from '@/lib/archipelBascule';
import { controlGoldPerHour, ensureControls, retiredHeld, seatsOf } from '@/lib/controlPoints';
import { createMap, type ExpeditionMap } from '@/lib/expedition';

const NOW = Date.UTC(2026, 9, 3, 12);

/** Une carte CLASSIQUE (sans archipel) avec ses points fixes, dont certains tenus. */
function classicMap(held: string[]): ExpeditionMap {
  const m = ensureControls(createMap(42, NOW, 30, 10), NOW, 30, 10);
  return {
    ...m,
    pois: m.pois.map((p) =>
      p.control && held.includes(p.control.kind)
        ? {
            ...p,
            control: { ...p.control, owner: 'player' as const, garrison: ['adv_a', 'adv_b'] },
          }
        : p,
    ),
  };
}

describe('🏝️ bascule des comptes sur l’archipel (étape 7)', () => {
  it('une carte classique passe sur l’île 1', () => {
    const b = basculeToArchipel(classicMap([]), NOW)!;
    expect(b.map.archipel?.island).toBe(1);
    expect(b.map.archipel?.levelCap).toBe(20);
  });

  it('une carte déjà en archipel ne rebascule jamais (idempotence)', () => {
    const b = basculeToArchipel(classicMap(['training']), NOW)!;
    expect(basculeToArchipel(b.map, NOW + 1000)).toBeNull();
  });

  it('les lieux tenus de l’île 1 restent tenus, sans compensation', () => {
    const b = basculeToArchipel(classicMap(['mine', 'garden', 'scriptorium', 'mana']), NOW)!;
    expect(b.refunds).toEqual([]);
    expect(b.message).toBeNull();
    const held = b.map.pois
      .filter((p) => p.control?.owner === 'player')
      .map((p) => p.control!.kind);
    expect(held.sort()).toEqual(['garden', 'mana', 'mine', 'scriptorium']);
    // ⚠️ Aucun d'eux n'est rappelé au tick suivant.
    expect(retiredHeld(b.map)).toEqual([]);
  });

  it('un lieu absent de l’île 1 est compensé de 2 jours de sa production en or', () => {
    const m = classicMap(['training', 'mine']);
    const refunds = basculeRefunds(m);
    expect(refunds.map((r) => r.kind)).toEqual(['training']);
    const camp = m.pois.find((p) => p.control?.kind === 'training')!;
    // La règle de production du jeu, garnison pleine (3 au camp), au rang du lieu, × 48 h.
    const expected = Math.round(controlGoldPerHour(camp, seatsOf('training'), camp.level) * 48);
    expect(refunds[0]!.gold).toBe(expected);
    expect(refunds[0]!.gold).toBeGreaterThan(0);
    expect(BASCULE.compensationHours).toBe(48);
  });

  it('le coffre porte la somme des compensations, à encaisser une seule fois', () => {
    // 🗼 Une tour de guet tenue (type retiré, encore présent sur de vieilles cartes).
    const m = classicMap(['training']);
    const mine = m.pois.find((p) => p.control?.kind === 'mine')!;
    m.pois.push({
      ...mine,
      id: 'ctl_tower',
      control: { ...mine.control!, kind: 'tower', owner: 'player', garrison: ['adv_c'] },
    });
    const b = basculeToArchipel(m, NOW)!;
    const sum = b.refunds.reduce((s, r) => s + r.gold, 0);
    expect(b.refunds).toHaveLength(2);
    expect(b.message?.id).toBe(BASCULE.messageId);
    expect(b.message?.gold).toBe(sum);
    expect(b.message?.claimed).toBe(false);
    expect(b.message?.chest).toBe(true);
  });

  it('la garnison d’un lieu rendu est rappelée au tick suivant (`retiredHeld`)', () => {
    const b = basculeToArchipel(classicMap(['training']), NOW)!;
    expect(retiredHeld(b.map).map((p) => p.control!.kind)).toEqual(['training']);
  });

  it('les lieux ennemis ne sont pas compensés', () => {
    expect(basculeRefunds(classicMap([]))).toEqual([]);
  });

  it('la compensation suit le rang du lieu', () => {
    const p = { id: 'ctl_training' };
    expect(basculeRefundGold({ ...p, level: 30 }, 'training')).toBeGreaterThan(
      basculeRefundGold({ ...p, level: 10 }, 'training'),
    );
  });
});
