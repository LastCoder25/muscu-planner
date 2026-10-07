import { describe, expect, it } from 'vitest';
import { createMap, type ExpeditionMap, type Poi, type PostedHero } from '@/lib/expedition';
import { captureControl, ensureControls } from '@/lib/controlPoints';
import {
  heroHeldOnMap,
  heroPostOf,
  heroPosted,
  recallPostedHero,
  unpostHero,
} from '@/lib/islandConquest';
import { heroCanStay, heroStaysAt, partySendBlocker } from '@/lib/party';

/**
 * 🧝 ÉTAPE 6 BIS : le héros peut tenir garnison sur N'IMPORTE QUEL lieu fixe (décision de
 * l'utilisateur) — il défend le lieu avec son instantané de combat, et se rappelle à la base.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const HERO: PostedHero = {
  name: 'Héros',
  level: 20,
  combatant: { name: 'Héros', pv: 500, damage: 40, crit: 0.1, dodge: 0.05, initiative: 5 },
};

function map(): ExpeditionMap {
  return ensureControls(createMap(3, NOW, 20, 10), NOW, 20, 10);
}
const mine = (m: ExpeditionMap): Poi => m.pois.find((p) => p.control?.kind === 'mine')!;

describe('🧝 le héros tient garnison partout', () => {
  it('un lieu fixe, un objectif ou la forteresse peut le garder ; ce qu’on abat, non', () => {
    const p = mine(map());
    expect(heroCanStay(p)).toBe(true);
    expect(heroCanStay({ ...p, control: { ...p.control!, kind: 'citadel' } })).toBe(false);
    // 🏳️ Un objectif d'île se tient ; la brèche sans fin, elle, s'abat.
    expect(heroCanStay({ ...p, control: { ...p.control!, kind: 'objective' } })).toBe(true);
    expect(
      heroCanStay({ ...p, id: 'isl_endless', control: { ...p.control!, kind: 'objective' } }),
    ).toBe(false);
    expect(heroCanStay({ ...p, control: { ...p.control!, kind: 'fortress' } })).toBe(true);
    expect(heroCanStay({ ...p, control: { ...p.control!, owner: 'player' } })).toBe(false);
    expect(heroCanStay({ ...p, type: 'camp', control: undefined })).toBe(false);
  });
  it('il reste : au choix avec des champions, d’office seul ou à la forteresse', () => {
    const p = mine(map());
    expect(heroStaysAt(p, 2, false, 5)).toBe(false);
    expect(heroStaysAt(p, 4, true, 5)).toBe(true);
    expect(heroStaysAt(p, 0, false, 5)).toBe(true);
    const f = { ...p, control: { ...p.control!, kind: 'fortress' as const } };
    expect(heroStaysAt(f, 3, false, 99)).toBe(true);
  });
  // 🧝 Demandé (2026-10-06) : « les champions qui ont attaqué restent en garnison ; le héros
  // aussi, s'il y a de la place pour lui ». Sans choix explicite, il reste s'il garde ses 2
  // places APRÈS les champions — il ne leur en prend aucune.
  it('sans choix : il reste s’il a encore sa place après les champions', () => {
    const p = mine(map()); // 5 places
    expect(heroStaysAt(p, 3, undefined, 5)).toBe(true);
    expect(heroStaysAt(p, 4, undefined, 5)).toBe(false);
    expect(heroStaysAt(p, 1, undefined, 3)).toBe(true);
    expect(heroStaysAt(p, 2, undefined, 3)).toBe(false);
    // Ce qu'on abat ne le garde jamais.
    expect(
      heroStaysAt({ ...p, control: { ...p.control!, kind: 'citadel' } }, 1, undefined, 5),
    ).toBe(false);
  });
  it('seul, le héros peut prendre un point (il y reste)', () => {
    const p = mine(map());
    expect(partySendBlocker(p, 0, false, 10, 0.5, NOW)).toBe('controlEmpty');
    expect(partySendBlocker(p, 0, true, 10, 0.5, NOW)).toBeNull();
  });
  it('la prise le poste, avec son instantané ; le rappel le renvoie à la base', () => {
    const m0 = map();
    const m = captureControl(m0, mine(m0).id, [], NOW, 7, HERO);
    expect(heroPosted(m)).toBe(true);
    expect(heroPostOf(m)!.id).toBe(mine(m0).id);
    expect(heroPostOf(m)!.control!.heroUnit).toEqual(HERO);
    const r = recallPostedHero(m, NOW, 60);
    expect(heroPosted(r)).toBe(false);
    expect(heroPostOf(r)).toBeUndefined();
    expect(mine(r).control!.heroUnit).toBeUndefined();
    expect(heroHeldOnMap(r, NOW + 59 * 60_000)).toBe(true);
    expect(heroHeldOnMap(r, NOW + 60 * 60_000)).toBe(false);
  });
  it('il QUITTE son poste pour partir ailleurs : sans retour à la base, la garnison reste', () => {
    const m0 = map();
    const m = captureControl(m0, mine(m0).id, ['a'], NOW, 7, HERO);
    const u = unpostHero(m, 0);
    expect(heroPosted(u)).toBe(false);
    expect(u.heroReturnAt).toBeUndefined();
    expect(heroHeldOnMap(u, NOW)).toBe(false);
    expect(mine(u).control!.garrison).toEqual(mine(m).control!.garrison);
    expect(mine(u).control!.heroUnit).toBeUndefined();
    expect(unpostHero(u, 0)).toBe(u);
  });
  it('sans héros, rien n’est posté', () => {
    const m0 = map();
    const m = captureControl(m0, mine(m0).id, ['a'], NOW, 7);
    expect(heroPosted(m)).toBe(false);
    expect(mine(m).control!.hero).toBeUndefined();
  });
});
