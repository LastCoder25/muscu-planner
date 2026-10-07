import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';
import { firstAidChance, resolveCaravan, spareInjured } from '@/lib/caravan';
import { siegeHurtIds, type RaidReport } from '@/lib/raid';
import type { Poi } from '@/lib/expedition';
import { skillValue, type SkillId } from '@/lib/skillRunes';

/** ⛑️ PREMIERS SECOURS (2026-10-07) : remplace le 🩺 Soin. La compétence ne raccourcit plus
 *  la convalescence, elle donne à la TROUPE une chance d'éviter la blessure. */

const champ = (n: string, skills: { id: SkillId; level: number }[] = []): Adventurer => ({
  id: n,
  name: n,
  seed: 1,
  path: [],
  level: 20,
  xp: 0,
  championId: CHAMPIONS[0]!.id,
  copies: 1,
  skills,
});
const nus = ['a', 'b', 'c'].map((n) => champ(n));
const secours = ['a', 'b', 'c'].map((n, i) => champ(n, i === 0 ? [{ id: 'care', level: 5 }] : []));
const IDS = Array.from({ length: 4000 }, (_, i) => 'adv' + i);

describe('⛑️ premiers secours', () => {
  it('sans porteur, personne n’est épargné', () => {
    expect(firstAidChance(nus)).toBe(0);
    expect(spareInjured(nus, ['a', 'b'], 7)).toEqual(['a', 'b']);
  });

  it('un porteur épargne la part annoncée de la troupe (valeur de la rune)', () => {
    const p = skillValue('care', 5) / 100;
    expect(firstAidChance(secours)).toBeCloseTo(p, 9);
    const kept = spareInjured(secours, IDS, 12345).length / IDS.length;
    expect(1 - kept).toBeGreaterThan(p - 0.03);
    expect(1 - kept).toBeLessThan(p + 0.03);
  });

  it('le verdict ne dépend ni de l’ordre ni de la liste, seulement de la graine et de l’id', () => {
    const a = spareInjured(secours, IDS.slice(0, 50), 99);
    const b = spareInjured(secours, [...IDS.slice(0, 50)].reverse(), 99);
    expect([...b].reverse()).toEqual(a);
    const solo = IDS.slice(0, 50).filter((id) => spareInjured(secours, [id], 99).length);
    expect(solo).toEqual(a);
    expect(spareInjured(secours, IDS.slice(0, 50), 100)).not.toEqual(a);
  });

  it('convoi : les blessés avec secouriste sont un SOUS-ENSEMBLE de ceux sans, et moins nombreux', () => {
    // ⚠️ La rune ne touche ni le combat ni la route : à graine égale, seuls les blessés changent.
    const poi = {
      id: 'p',
      type: 'well',
      level: 45,
      x: 40,
      y: 40,
      distNorm: 0.9,
      perilous: true,
      spawnedAt: 0,
      expiresAt: 9e15,
    } as unknown as Poi;
    let without = 0;
    let withAid = 0;
    for (let s = 1; s <= 300; s++) {
      const o0 = resolveCaravan(poi, nus, s, { advGear: [] }, 20, 45);
      const o1 = resolveCaravan(poi, secours, s, { advGear: [] }, 20, 45);
      const hurt0 = [...o0.hurt, ...(o0.lightHurt ?? [])];
      const hurt1 = [...o1.hurt, ...(o1.lightHurt ?? [])];
      for (const id of hurt1) expect(hurt0).toContain(id);
      without += hurt0.length;
      withAid += hurt1.length;
    }
    expect(without).toBeGreaterThan(20);
    expect(withAid).toBeLessThan(without * 0.8);
  });

  it('siège : une victoire ne blesse personne ; une défaite passe par les premiers secours', () => {
    const wounded = IDS.slice(0, 400);
    const lost = { held: false, wounded, seed: 3 } as unknown as RaidReport;
    expect(siegeHurtIds({ ...lost, held: true }, secours)).toEqual([]);
    expect(siegeHurtIds(lost, nus)).toEqual(wounded);
    expect(siegeHurtIds(lost, secours).length).toBeLessThan(wounded.length * 0.75);
  });
});
