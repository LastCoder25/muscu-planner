// 🧝 Le héros peut tenir garnison sur un lieu fixe : la bataille du store le fait combattre
// (`heroUnit`). Le % affiché doit le compter aussi — il passait `null` et annonçait une tenue
// sans lui.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlDefenseHold,
  controlIdOf,
  defendersAtAttack,
  ensureControls,
  heroAtAttack,
} from '@/lib/controlPoints';
import { controlAttackHold, retakeBattle } from '@/lib/fieldArmy';
import { campWinPct } from '@/lib/camp';
import { partyAllies, refChampionAdv } from '@/lib/caravan';
import { militiaUnits } from '@/lib/militia';
import { refFighter } from '@/lib/proceduralContent';
import { createMap, type ControlState, type PostedHero } from '@/lib/expedition';

const H = 3_600_000;
const NOW = 1_000 * H;
const L = 30;
const HERO: PostedHero = { name: 'Toi', level: L, combatant: refFighter(L) };
const ctl = (c: Partial<ControlState>): ControlState =>
  ({ kind: 'mine', owner: 'player', garrison: [], collectedAt: 0, ...c }) as ControlState;

describe('heroAtAttack', () => {
  it('posté : il défend, avec son instantané', () => {
    expect(heroAtAttack(ctl({ hero: true, heroUnit: HERO }), NOW)).toBe(HERO);
  });
  it('posté sans instantané : la bataille ne le fait pas combattre, le % non plus', () => {
    expect(heroAtAttack(ctl({ hero: true }), NOW)).toBeNull();
  });
  it('en route : compté s’il arrive à temps (ou si l’heure est secrète)', () => {
    const c = ctl({ heroComing: { at: NOW + H, from: NOW, unit: HERO } });
    expect(heroAtAttack(c, NOW + 2 * H)).toBe(HERO);
    expect(heroAtAttack(c, NOW + H)).toBe(HERO);
    expect(heroAtAttack(c, null)).toBe(HERO);
    expect(heroAtAttack(c, NOW + H / 2)).toBeNull();
    const r = defendersAtAttack(c, NOW + H / 2);
    expect(r.hero).toBeNull();
    expect(r.heroLate).toBe(true);
  });
});

describe('le % de défense compte le héros posté', () => {
  const m = captureControl(
    ensureControls(createMap(3, 0, L, 1), 0, L),
    controlIdOf('mine'),
    ['a0'],
    0,
    7,
  );
  const base = m.pois.find((q) => q.id === controlIdOf('mine'))!;
  // Une attaque où le héros change l'issue (sans lui la mine tombe à coup sûr).
  const p = { ...base, control: { ...base.control!, attackAt: NOW + 3_333_333 } };
  const advs = [{ ...refChampionAdv(L, 0), id: 'a0' }];
  const kit = { advGear: [] };
  const ids = ['a0'];

  it('plancher : un héros en plus fait monter la tenue', () => {
    const without = controlDefenseHold(p, ids, advs, kit, L, 1, null);
    const withHero = controlDefenseHold(p, ids, advs, kit, L, 1, HERO);
    expect(withHero).toBeGreaterThan(without);
  });

  it('face à l’armée : le % rejoue EXACTEMENT la bataille du store, héros compris', () => {
    // La composition du store : `partyAllies(escorte, kit, heroUnit)` + miliciens.
    const allies = [...partyAllies(advs, kit, HERO), ...militiaUnits(ids, L)];
    const { foe, force } = retakeBattle({ seed: 3 }, p, allies, L, 1);
    const withHero = controlAttackHold({ seed: 3 }, p, ids, advs, kit, L, 1, HERO);
    expect(withHero).toBe(campWinPct(foe, force, allies, 24));
    expect(withHero).toBeGreaterThan(controlAttackHold({ seed: 3 }, p, ids, advs, kit, L, 1, null));
  });
});
