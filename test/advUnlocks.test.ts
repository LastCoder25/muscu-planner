import { describe, it, expect } from 'vitest';
import { ADV_SCHEDULE, unlocksAtLevel, upcomingUnlocks } from '@/lib/advUnlocks';

describe('advUnlocks — calendrier des déblocages', () => {
  it('le calendrier est trié par niveau croissant', () => {
    for (let i = 1; i < ADV_SCHEDULE.length; i++)
      expect(ADV_SCHEDULE[i]!.level).toBeGreaterThanOrEqual(ADV_SCHEDULE[i - 1]!.level);
  });

  it('niveau 5 : boss (Golem) — l’emplacement de talent est ouvert dès le niveau 1 (v0.1078)', () => {
    const kinds = new Set(unlocksAtLevel(5).map((u) => u.kind));
    expect(kinds.has('boss')).toBe(true);
    expect(kinds.has('talent')).toBe(false);
    // Plus de palier de rang au niveau 5 depuis la v0.875 : les objets suivent le rang du joueur.
    expect(kinds.has('rarity')).toBe(false);
    const boss = unlocksAtLevel(5).find((u) => u.kind === 'boss');
    expect(boss?.title).toContain('Golem');
    expect(boss?.detail).toContain('set');
  });

  it('emplacement de talent = un SLOT (drop-based), pas un choix 1-parmi-3', () => {
    const tal = unlocksAtLevel(1).find((u) => u.kind === 'talent');
    expect(tal?.title).toContain('Emplacement');
    expect(tal?.detail).toContain('droppent');
  });

  it('niveau 9 = uniquement l’effet Épines', () => {
    const at9 = unlocksAtLevel(9);
    expect(at9).toHaveLength(1);
    expect(at9[0]!.kind).toBe('effect');
    expect(at9[0]!.title).toContain('Épines');
  });

  it('niveau 20 : boss (Titan) — plus d’emplacement de talent', () => {
    const at20 = unlocksAtLevel(20);
    expect(at20.some((u) => u.kind === 'boss' && u.title.includes('Titan'))).toBe(true);
    // Un seul talent (v0.845) : l'emplacement ne s'annonce qu'une fois, au niveau 5.
    expect(at20.some((u) => u.kind === 'talent')).toBe(false);
  });

  it('rang des objets : un palier tous les 10 niveaux, le rang du joueur (v0.875)', () => {
    const rangs = ADV_SCHEDULE.filter((u) => u.kind === 'rarity');
    expect(rangs.map((u) => u.level)).toEqual([11, 21, 31, 41, 51, 61, 71]);
    // Au niveau 21 on devient Or : les objets tombent au rang Or, affiché en rang.
    const at21 = rangs.find((u) => u.level === 21)!;
    expect(at21.title).toContain('Or');
    expect(at21.title).not.toContain('Magique');
    // L'effet légendaire arrive avec le rang Légendaire (niveau 51).
    expect(rangs.find((u) => u.level === 51)!.detail).toContain('effet légendaire');
    expect(rangs.find((u) => u.level === 41)!.detail).not.toContain('effet légendaire');
  });

  it('UN SEUL déblocage de talent dans tout le calendrier, dès le niveau 1', () => {
    const tal = ADV_SCHEDULE.filter((u) => u.kind === 'talent');
    expect(tal.map((u) => u.level)).toEqual([1]);
  });

  it('les signatures sont gatées en profondeur (Exécution 12 / Rage 15 / Déferlante 18)', () => {
    expect(unlocksAtLevel(12).some((u) => u.title.includes('Exécution'))).toBe(true);
    expect(unlocksAtLevel(15).some((u) => u.title.includes('Rage'))).toBe(true);
    expect(unlocksAtLevel(18).some((u) => u.title.includes('Déferlante'))).toBe(true);
  });

  it('crit / vol de vie / réduction ne sont PLUS annoncés (dégatés)', () => {
    const titles = ADV_SCHEDULE.map((u) => u.title).join(' | ');
    expect(titles).not.toContain('Critique');
    expect(titles).not.toContain('Vol de vie');
    expect(titles).not.toContain('Réduction');
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
    expect(upcomingUnlocks(25).length).toBeGreaterThan(0);
    for (const u of upcomingUnlocks(25)) expect(u.level).toBeGreaterThan(25);
  });

  it('upcomingUnlocks au tout bout du calendrier (niv.100) → vide', () => {
    expect(upcomingUnlocks(100)).toHaveLength(0);
  });
});
