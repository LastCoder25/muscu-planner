// 🧝 Le héros peut tenir garnison sur un lieu fixe. Depuis le 2026-10-08 (décision de
// l'utilisateur), SEULS LES MILICIENS défendent un lieu de production : le héros y produit
// sans combattre. Il ne défend que là où aucune milice ne va (objectif tenu, forteresse,
// `champsDefend`) — et là, le % affiché doit le compter comme la bataille du store.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlAllies,
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
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { ensureIslandConquest, objectiveIdOf, takeObjective } from '@/lib/islandConquest';

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

describe('sur une mine, le héros posté ne défend pas', () => {
  const m = captureControl(
    ensureControls(createMap(3, 0, L, 1), 0, L),
    controlIdOf('mine'),
    ['a0'],
    0,
    7,
  );
  const base = m.pois.find((q) => q.id === controlIdOf('mine'))!;
  // Une attaque que cinq miliciens repoussent parfois : la tenue n'est ni 0 ni 1.
  const p = { ...base, control: { ...base.control!, attackAt: NOW + 3_333_333 } };
  const advs = [{ ...refChampionAdv(L, 0), id: 'a0' }];
  const kit = { advGear: [] };
  const ids = ['a0', 'mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'];

  it('le héros n’ajoute rien à la tenue : seuls les miliciens comptent', () => {
    const without = controlDefenseHold(p, ids, advs, kit, L, 1, null);
    expect(without).toBeGreaterThan(0);
    expect(controlDefenseHold(p, ids, advs, kit, L, 1, HERO)).toBe(without);
    expect(controlDefenseHold(p, ['a0'], advs, kit, L, 1, HERO)).toBe(0);
  });

  it('face à l’armée : le % rejoue EXACTEMENT la bataille du store, sur ses miliciens', () => {
    // La composition du store sur un lieu de production : les miliciens seuls.
    const allies = militiaUnits(ids, L);
    expect(controlAllies('mine', advs, kit, HERO, ids, L)).toEqual(allies);
    const { foe, force } = retakeBattle({ seed: 3 }, p, allies, L, 1);
    const withHero = controlAttackHold({ seed: 3 }, p, ids, advs, kit, L, 1, HERO);
    expect(withHero).toBe(campWinPct(foe, force, allies, 24));
    expect(withHero).toBe(controlAttackHold({ seed: 3 }, p, ids, advs, kit, L, 1, null));
  });
});

describe('sur un objectif d’île, le héros posté défend', () => {
  const lv = archipelOn(1).levelCap;
  const hero: PostedHero = { name: 'Toi', level: lv, combatant: refFighter(lv) };
  const isl = ensureIslandConquest(
    ensureControls(
      createMap(7, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1)),
      NOW,
      lv,
      ISLAND_OUTPOST_LEVEL,
    ),
    NOW,
    lv,
  );
  const OBJ = objectiveIdOf(0);
  const held = takeObjective(isl, OBJ, ['a0'], NOW);
  const base = held.pois.find((q) => q.id === OBJ)!;
  // Une attaque où le héros change l'issue (sans lui l'objectif tombe presque à coup sûr).
  const p = { ...base, control: { ...base.control!, attackAt: NOW + 1_111_111 } };
  const advs = [{ ...refChampionAdv(lv, 0), id: 'a0' }];
  const kit = { advGear: [] };
  const ids = ['a0'];

  it('plancher : un héros en plus fait monter la tenue', () => {
    const without = controlDefenseHold(p, ids, advs, kit, lv, 1, null);
    const withHero = controlDefenseHold(p, ids, advs, kit, lv, 1, hero);
    expect(withHero).toBeGreaterThan(without);
  });

  it('face à l’armée : le % rejoue EXACTEMENT la bataille du store, héros compris', () => {
    // La composition du store là où les champions défendent : `partyAllies(escorte, kit, héros)`.
    const allies = partyAllies(advs, kit, hero);
    const { foe, force } = retakeBattle(held, p, allies, lv, 1);
    const withHero = controlAttackHold(held, p, ids, advs, kit, lv, 1, hero);
    expect(withHero).toBe(campWinPct(foe, force, allies, 24));
    expect(withHero).toBeGreaterThan(controlAttackHold(held, p, ids, advs, kit, lv, 1, null));
  });
});
