import { describe, it, expect } from 'vitest';
import { ADV_SCHEDULE, unlocksAtLevel, upcomingUnlocks } from '@/lib/advUnlocks';

describe('advUnlocks — calendrier des déblocages', () => {
  it('le calendrier est trié par niveau croissant', () => {
    for (let i = 1; i < ADV_SCHEDULE.length; i++)
      expect(ADV_SCHEDULE[i]!.level).toBeGreaterThanOrEqual(ADV_SCHEDULE[i - 1]!.level);
  });

  it('niveau 5 = gros palier : boss + talent + effet crit + étage d’expédition', () => {
    const kinds = new Set(unlocksAtLevel(5).map((u) => u.kind));
    expect(kinds.has('boss')).toBe(true);
    expect(kinds.has('talent')).toBe(true);
    expect(kinds.has('effect')).toBe(true);
    expect(kinds.has('expedition')).toBe(true);
    // Le boss du palier 5 est le Golem, avec son set.
    const boss = unlocksAtLevel(5).find((u) => u.kind === 'boss');
    expect(boss?.title).toContain('Golem');
    expect(boss?.detail).toContain('Rempart du Golem');
  });

  it('niveau 8 = uniquement l’effet vol de vie', () => {
    const at8 = unlocksAtLevel(8);
    expect(at8).toHaveLength(1);
    expect(at8[0]!.kind).toBe('effect');
    expect(at8[0]!.title).toContain('Vol de vie');
  });

  it('niveau 10 débloque le Dragon et la réduction de dégâts', () => {
    const titles = unlocksAtLevel(10).map((u) => u.title).join(' | ');
    expect(titles).toContain('Dragon');
    expect(titles).toContain('Réduction');
  });

  it('niveau sans déblocage → liste vide', () => {
    expect(unlocksAtLevel(7)).toHaveLength(0);
    expect(unlocksAtLevel(3)).toHaveLength(0);
  });

  it('upcomingUnlocks : ne renvoie que des niveaux STRICTEMENT supérieurs, limités', () => {
    const up = upcomingUnlocks(4, 3);
    expect(up).toHaveLength(3);
    for (const u of up) expect(u.level).toBeGreaterThan(4);
  });

  it('upcomingUnlocks tease le contenu procédural (boss jusqu’au niv.100)', () => {
    // Depuis le contenu procédural, il reste des déblocages (boss de palier) après 25.
    expect(upcomingUnlocks(25).length).toBeGreaterThan(0);
    for (const u of upcomingUnlocks(25)) expect(u.level).toBeGreaterThan(25);
  });

  it('upcomingUnlocks au tout bout du calendrier (niv.100) → vide', () => {
    expect(upcomingUnlocks(100)).toHaveLength(0);
  });
});
