import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap } from '@/lib/expedition';
import {
  applyLapis,
  captureControl,
  collectControl,
  controlAllies,
  controlIdOf,
  controlKindsOf,
  defenderCount,
  defendsControl,
  ensureControls,
  garrisonCap,
  garrisonHold,
  lapidaryHours,
  lapisCandidates,
  lapisTarget,
  militiaSeatsOf,
  seatsOf,
  setLapisSkill,
} from '@/lib/controlPoints';
import { controlAttackHold } from '@/lib/fieldArmy';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { refEscortUnits } from '@/lib/caravan';
import { refChampionAdv } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';
import { OVERCLOCK_MULT, SKILL_OVERCLOCK_LEVEL, skillValue } from '@/lib/skillRunes';

const NOW = Date.UTC(2026, 9, 3, 12);
const H = 3600_000;
const LV = 50;
const id = controlIdOf('lapidary');

function island3(): ExpeditionMap {
  const m = createMap(3, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(5));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const adv = (over: Partial<Adventurer> = {}): Adventurer =>
  ({
    id: 'a',
    name: 'A',
    seed: 1,
    path: [],
    level: 20,
    xp: 0,
    skills: [
      { id: 'speed', level: 1 },
      { id: 'plunder', level: 4 },
      { id: 'care', level: 5 },
    ],
    ...over,
  }) as Adventurer;

describe('💎 le lapidaire de l’île 5', () => {
  it('l’île 5 : cercle d’invocation, lapidaire, laboratoire', () => {
    expect([...controlKindsOf({ archipel: archipelOn(5) })].sort()).toEqual([
      'circle',
      'lab',
      'lapidary',
    ]);
    expect(poiLabel(island3().pois.find((p) => p.id === id)!)).toContain('Lapidaire');
  });

  it('cinq champions qui ne se battent pas, cinq miliciens qui le défendent', () => {
    expect(seatsOf('lapidary')).toBe(5);
    expect(garrisonCap('lapidary')).toBe(10);
    expect(defendsControl('lapidary')).toBe(false);
    expect(defendsControl('mine')).toBe(true);
    const m = captureControl(island3(), id, ['a', 'b'], NOW, 7);
    const p = m.pois.find((q) => q.id === id)!;
    expect(p.control!.garrison).toEqual(['a', 'b']);
    expect(militiaSeatsOf('lapidary')).toBe(5);
    // Ses champions ne combattent pas : aucun allié tant qu'il n'y a pas de milicien.
    expect(
      controlAllies('lapidary', [refChampionAdv(LV, 0)], { advGear: [] }, null, ['a'], LV),
    ).toEqual([]);
    expect(garrisonHold(p, [], 1)).toBe(0);
    // Ses miliciens, eux, combattent — et eux seuls.
    const milIds = ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'];
    const allies = controlAllies(
      'lapidary',
      [refChampionAdv(LV, 0)],
      { advGear: [] },
      null,
      ['a', ...milIds],
      LV,
    );
    expect(allies.map((u) => u.id)).toEqual(milIds);
    expect(defenderCount('lapidary', ['a', ...milIds], true)).toBe(5);
    expect(garrisonHold(p, allies, 1)).toBeGreaterThan(0);
    // Les mêmes défenseurs tiendraient un autre lieu : c'est bien le lapidaire qui ne se défend
    // pas. 🛡️ Depuis le 2026-10-08, seuls des MILICIENS défendent une mine ; des champions,
    // eux, défendent un objectif (aucune milice n'y va).
    const champs = [0, 1, 2].map((k) => refChampionAdv(LV + 20, k));
    const ids = champs.map((c) => c.id);
    const kit = { advGear: [] };
    const asObj = { ...p, control: { ...p.control!, kind: 'objective' as const, garrison: ids } };
    expect(controlAttackHold(m, asObj, ids, champs, kit, LV, 1, null)).toBeGreaterThan(0);
    // 💎 Ses champions ne le défendent pas…
    expect(controlAttackHold(m, p, ids, champs, kit, LV, 1, null)).toBe(0);
    // …ses miliciens, si (2026-10-12) : la même milice tient le lapidaire comme une mine.
    const asMine = { ...p, control: { ...p.control!, kind: 'mine' as const, garrison: milIds } };
    const asLapis = { ...p, control: { ...p.control!, garrison: milIds } };
    expect(controlAttackHold(m, asMine, milIds, [], kit, LV, 1, null)).toBeGreaterThan(0);
    expect(controlAttackHold(m, asLapis, milIds, [], kit, LV, 1, null)).toBeGreaterThan(0);
  });

  it('le temps dépend de la couleur : 1, 2, 4 et 7 jours', () => {
    expect(lapidaryHours('speed')).toBe(24);
    expect(lapidaryHours('speed')).toBeLessThan(lapidaryHours('plunder'));
    expect(lapidaryHours('plunder')).toBe(168);
  });

  it('seule une compétence au niveau 5 se surcharge, et elle le reste', () => {
    expect(lapisCandidates(adv())).toEqual(['care']);
    const a = applyLapis([adv()], [{ advId: 'a', hours: lapidaryHours('care') }]);
    expect(a.up).toBe(1);
    expect(a.advs[0]!.skills!.find((s) => s.id === 'care')!.level).toBe(SKILL_OVERCLOCK_LEVEL);
    // Les autres ne bougent pas, et une compétence surchargée ne se surcharge plus.
    expect(a.advs[0]!.skills!.find((s) => s.id === 'plunder')!.level).toBe(4);
    const again = applyLapis(a.advs, [{ advId: 'a', hours: 1e6 }]);
    expect(again.advs).toBe(a.advs);
    // Rien au niveau 5 : rien ne change.
    const none = [adv({ skills: [{ id: 'speed', level: 2 }] })];
    expect(applyLapis(none, [{ advId: 'a', hours: 1e6 }]).advs).toBe(none);
  });

  it('⚡ surchargée, elle vaut +50 % de sa valeur au niveau 5', () => {
    expect(skillValue('care', SKILL_OVERCLOCK_LEVEL)).toBeCloseTo(
      skillValue('care', 5) * OVERCLOCK_MULT,
      0,
    );
  });

  it('la progression est GARDÉE sur le champion : s’il part, elle se met en pause', () => {
    const half = lapidaryHours('care') / 2;
    const one = applyLapis([adv()], [{ advId: 'a', hours: half }]);
    expect(one.up).toBe(0);
    expect(one.advs[0]!.lapisHours!.care).toBeCloseTo(half, 6);
    const two = applyLapis(one.advs, [{ advId: 'a', hours: half }]);
    expect(two.up).toBe(1);
  });

  it('chaque champion a sa barre, et seul celui qui est sur place avance', () => {
    let m = captureControl(island3(), id, ['a'], NOW, 7);
    const got = collectControl(m, id, NOW + 5.5 * H, LV).lapis!;
    expect(got).toEqual([{ advId: 'a', hours: 5.5 }]);
    m = collectControl(m, id, NOW + 5.5 * H, LV).map;
    // Il part : la récolte suivante ne lui verse plus rien.
    m = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === id ? { ...p, control: { ...p.control!, garrison: [] } } : p,
      ),
    };
    expect(collectControl(m, id, NOW + 20 * H, LV).lapis).toBeUndefined();
  });

  it('le joueur choisit la compétence taillée, sinon celle qui a le plus avancé', () => {
    const two = adv({
      skills: [
        { id: 'speed', level: 5 },
        { id: 'plunder', level: 5 },
      ],
      lapisHours: { speed: 10 },
    });
    expect(lapisTarget(two)).toBe('speed');
    expect(lapisTarget(two, 'plunder')).toBe('plunder');
    let m = captureControl(island3(), id, ['a'], NOW, 7);
    m = setLapisSkill(m, id, 'a', 'plunder');
    expect(collectControl(m, id, NOW + 2 * H, LV).lapis![0]!.skill).toBe('plunder');
    // Un champion absent ne se choisit pas.
    expect(setLapisSkill(m, id, 'zz', 'speed')).toBe(m);
    const got = applyLapis([two], [{ advId: 'a', hours: 1, skill: 'plunder' }]);
    expect(got.advs[0]!.lapisHours).toEqual({ speed: 10, plunder: 1 });
  });
});

describe('💎 les miliciens vont au lapidaire', () => {
  it('tenu ou ennemi : il a ses places de milice', async () => {
    const { acceptsMilitia, militiaMayHead, reinforceBlocker } =
      await import('@/lib/controlPoints');
    const enemy = island3().pois.find((p) => p.id === id)!.control!;
    const mine = { ...enemy, owner: 'player' as const, garrison: [] };
    expect(militiaMayHead(enemy)).toBe(true);
    expect(militiaMayHead(mine)).toBe(true);
    expect(acceptsMilitia(mine)).toBe(true);
    expect(reinforceBlocker(mine, 1, true)).toBeNull();
    // Un lieu de production, lui, en reçoit toujours.
    expect(militiaMayHead({ ...mine, kind: 'arsenal' })).toBe(true);
    expect(acceptsMilitia({ ...mine, kind: 'arsenal' })).toBe(true);
  });
});
