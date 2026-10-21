import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap } from '@/lib/expedition';
import {
  CONTROL,
  FORGE_SKILLS,
  captureControl,
  collectControl,
  controlIdOf,
  controlKindsOf,
  controlProgress,
  ensureControls,
  forgeState,
  garrisonCap,
  militiaSeatsOf,
  seatsOf,
  setForgeSkill,
} from '@/lib/controlPoints';
import { controlAttackHold } from '@/lib/fieldArmy';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { refChampionAdv } from '@/lib/caravan';
import { addForgedSkills, emptyBank } from '@/lib/runeBank';

// 💎 LE LAPIDAIRE EST UNE USINE (v1.254.0, décision de l'utilisateur, 2026-10-21) : il fabrique
// la compétence verte choisie du niveau 0 au niveau 5, la verse au stock et recommence. La
// garnison (champions, héros, miliciens, 5 comptés) l'accélère comme les autres lieux fixes.

const NOW = Date.UTC(2026, 9, 3, 12);
const H = 3600_000;
const LV = 50;
const id = controlIdOf('lapidary');

function island5(): ExpeditionMap {
  const m = createMap(3, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(5));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
/** Pris par `garrison`, sans crans (le temps compte à plat : chiffres exacts). */
function held(garrison: string[]): ExpeditionMap {
  const m = captureControl(island5(), id, garrison, NOW, 7);
  return {
    ...m,
    pois: m.pois.map((p) =>
      p.id === id ? { ...p, control: { ...p.control!, flatTier: true, yieldMult: 1 } } : p,
    ),
  };
}
const poi = (m: ExpeditionMap) => m.pois.find((p) => p.id === id)!;
const three = ['a', 'b', 'mil:1'];
const T = CONTROL.lapidaryHoursPerSkill;

describe('💎 le lapidaire de l’île 5', () => {
  it('l’île 5 : cercle d’invocation, lapidaire, laboratoire', () => {
    expect([...controlKindsOf({ archipel: archipelOn(5) })].sort()).toEqual([
      'circle',
      'lab',
      'lapidary',
    ]);
    expect(poiLabel(island5().pois.find((p) => p.id === id)!)).toContain('Lapidaire');
  });

  it('il ne fabrique que les 4 compétences vertes', () => {
    expect([...FORGE_SKILLS].sort()).toEqual(['care', 'haul', 'scout', 'speed']);
    const m = held(three);
    expect(setForgeSkill(m, id, 'crit', NOW, LV)).toBe(m);
    expect(setForgeSkill(m, id, 'pv', NOW, LV)).toBe(m);
  });

  it('une verte Nv 5 en 24 h à 3 occupants (champions et miliciens comptent)', () => {
    let m = setForgeSkill(held(three), id, 'speed', NOW, LV);
    // À mi-chemin : niveau 2 (0,5 × 5 = 2,5), rien de versé.
    const mid = forgeState(poi(m), NOW + (T / 2) * H, LV);
    expect(mid.level).toBe(2);
    expect(mid.pct).toBeCloseTo(0.5, 6);
    expect(collectControl(m, id, NOW + (T / 2) * H, LV).forged).toBeUndefined();
    // Au bout de 24 h : un exemplaire, et il recommence de zéro.
    const got = collectControl(m, id, NOW + T * H, LV);
    expect(got.forged).toEqual([{ id: 'speed', count: 1 }]);
    m = got.map;
    expect(forgeState(poi(m), NOW + T * H, LV).pct).toBeCloseTo(0, 6);
    expect(forgeState(poi(m), NOW + T * H, LV).skill).toBe('speed');
  });

  it('la récolte garde l’entamé : 30 h → un exemplaire, et 25 % du suivant', () => {
    const m = setForgeSkill(held(three), id, 'haul', NOW, LV);
    const got = collectControl(m, id, NOW + 30 * H, LV);
    expect(got.forged).toEqual([{ id: 'haul', count: 1 }]);
    expect(forgeState(poi(got.map), NOW + 30 * H, LV).pct).toBeCloseTo(0.25, 6);
    expect(forgeState(poi(got.map), NOW + 30 * H, LV).level).toBe(1);
  });

  it('une compétence non verte lue en base est ignorée (relecture défensive)', () => {
    const m = held(three);
    const bad = { ...poi(m), control: { ...poi(m).control!, forge: 'crit' } };
    expect(forgeState(bad, NOW + 36 * H, LV).skill).toBeNull();
  });

  it('plus de monde, plus vite (5 au plus) ; personne, rien', () => {
    const at = (g: string[]) =>
      forgeState(poi(setForgeSkill(held(g), id, 'speed', NOW, LV)), NOW + 12 * H, LV).pct;
    expect(at(['a'])).toBeCloseTo(0.25, 6); // 1 occupant : la moitié
    expect(at(three)).toBeCloseTo(0.5, 6);
    const five = ['a', 'b', 'c', 'mil:1', 'mil:2'];
    expect(at(five)).toBeGreaterThan(at(three));
    expect(at([...five, 'mil:3'])).toBeCloseTo(at(five), 9); // le 6ᵉ ne compte pas
    expect(at([])).toBe(0);
  });

  it('la progression de CHAQUE compétence est gardée quand on en change', () => {
    let m = setForgeSkill(held(three), id, 'speed', NOW, LV);
    m = setForgeSkill(m, id, 'haul', NOW + 12 * H, LV); // speed à 50 %
    expect(forgeState(poi(m), NOW + 12 * H, LV).pct).toBeCloseTo(0, 6);
    m = setForgeSkill(m, id, 'speed', NOW + 18 * H, LV); // haul à 25 %
    expect(forgeState(poi(m), NOW + 18 * H, LV).pct).toBeCloseTo(0.5, 6);
    expect(poi(m).control!.forgeDone!.haul).toBeCloseTo(0.25, 6);
    // Speed reprend où elle en était : finie 12 h plus tard.
    expect(collectControl(m, id, NOW + 30 * H, LV).forged).toEqual([{ id: 'speed', count: 1 }]);
  });

  it('sans compétence choisie, la production attend et va à la première choisie', () => {
    let m = held(three);
    expect(collectControl(m, id, NOW + 36 * H, LV).forged).toBeUndefined();
    expect(forgeState(poi(m), NOW + 36 * H, LV).pending).toBeCloseTo(1.5, 6);
    expect(controlProgress(poi(m), NOW, LV)!.text).toContain('Choisis');
    m = setForgeSkill(m, id, 'scout', NOW + 36 * H, LV);
    expect(collectControl(m, id, NOW + 36 * H, LV).forged).toEqual([{ id: 'scout', count: 1 }]);
  });

  it('le stock reçoit des Nv 5 verts, uid à part', () => {
    const b = addForgedSkills(emptyBank(), [{ id: 'speed', count: 2 }]);
    expect(b.skills).toEqual([
      { uid: 'lp1', id: 'speed', level: 5 },
      { uid: 'lp2', id: 'speed', level: 5 },
    ]);
    const none = emptyBank();
    expect(addForgedSkills(none, [])).toBe(none);
  });

  it('cinq places de champion et cinq de milice ; ses champions le défendent (v1.254.0)', () => {
    expect(seatsOf('lapidary')).toBe(5);
    expect(militiaSeatsOf('lapidary')).toBe(5);
    expect(garrisonCap('lapidary')).toBe(10);
    const champs = [0, 1, 2].map((k) => refChampionAdv(LV + 20, k));
    const ids = champs.map((c) => c.id);
    const m = held(ids);
    const hold = controlAttackHold(m, poi(m), ids, champs, { advGear: [] }, LV, 1, null);
    expect(hold).toBeGreaterThan(0);
  });
});

describe('💎 les miliciens vont au lapidaire', () => {
  it('tenu ou ennemi : il a ses places de milice', async () => {
    const { acceptsMilitia, militiaMayHead, reinforceBlocker } =
      await import('@/lib/controlPoints');
    const enemy = island5().pois.find((p) => p.id === id)!.control!;
    const mine = { ...enemy, owner: 'player' as const, garrison: [] };
    expect(militiaMayHead(enemy)).toBe(true);
    expect(militiaMayHead(mine)).toBe(true);
    expect(acceptsMilitia(mine)).toBe(true);
    expect(reinforceBlocker(mine, 1, true)).toBeNull();
  });
});
