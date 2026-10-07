import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';
import {
  CARAVAN,
  caravanHaulMult,
  caravanHurtMs,
  caravanLegMin,
  firstAidChance,
  mentorXpMult,
  roleCut,
  roleShare,
} from '@/lib/caravan';
import type { Poi } from '@/lib/expedition';
import { skillValue, type SkillId } from '@/lib/skillRunes';

/** 🔓 LES COMPÉTENCES DES CHAMPIONS N'ONT PLUS DE PLAFOND (demandé par l'utilisateur). */

const champ = (n: string, id: SkillId, level = 5): Adventurer => ({
  id: n,
  name: n,
  seed: 1,
  path: [],
  level: 20,
  xp: 0,
  championId: CHAMPIONS[0]!.id,
  copies: 1,
  skills: [{ id, level }],
});
const team = (id: SkillId, n: number) => Array.from({ length: n }, (_, i) => champ('c' + i, id));
const poi = {
  id: 'p',
  type: 'well',
  level: 30,
  x: 40,
  y: 40,
  distNorm: 0.9,
  spawnedAt: 0,
  expiresAt: 9e15,
} as unknown as Poi;

describe('🔓 compétences sans plafond', () => {
  it('Vitesse : chaque porteur raccourcit encore le trajet, au-delà de l’ancien plafond, sans jamais l’annuler', () => {
    const t = (n: number) => caravanLegMin(poi, team('speed', n), 0, 1);
    const base = t(0);
    for (let n = 1; n <= 10; n++) expect(t(n)).toBeLessThan(t(n - 1));
    // L'ancien plafond (−30 %) est franchi dès 3 Vitesse au maximum.
    expect(t(3)).toBeLessThan(base * (1 - CARAVAN.speedMax));
    expect(t(10)).toBeGreaterThanOrEqual(1);
  });

  it('roleCut : chaque porteur retire sa part de ce qui reste', () => {
    const v = skillValue('speed', 5) / 100;
    expect(roleCut(team('speed', 2), 'speed')).toBeCloseTo(1 - (1 - v) ** 2, 9);
    expect(roleCut(team('speed', 40), 'speed')).toBeLessThan(1);
  });

  it('⛑️ Premiers secours : la chance d’éviter la blessure monte à chaque porteur, jamais 100 %', () => {
    const p = (n: number) => firstAidChance(team('care', n));
    expect(p(0)).toBe(0);
    for (let n = 1; n <= 6; n++) expect(p(n)).toBeGreaterThan(p(n - 1));
    expect(p(3)).toBeGreaterThan(0.6);
    expect(p(40)).toBeLessThan(1);
    // La convalescence elle-même ne bouge plus.
    expect(caravanHurtMs(team('care', 3), 0)).toBe(CARAVAN.hurtMs);
  });

  it('Cargaison et Mentor s’additionnent sans borne', () => {
    const esc = team('haul', 6);
    expect(caravanHaulMult(esc, [])).toBeCloseTo(1 + 6 * (skillValue('haul', 5) / 100), 9);
    expect(caravanHaulMult(esc, [])).toBeGreaterThan(1 + CARAVAN.haulMax);
    expect(roleShare(esc, 'haul')).toBeCloseTo((6 * skillValue('haul', 5)) / 100, 9);
    expect(mentorXpMult(team('mentor', 4))).toBeCloseTo(1 + (4 * skillValue('mentor', 5)) / 100, 9);
  });
});
