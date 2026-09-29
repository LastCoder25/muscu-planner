import { describe, it, expect } from 'vitest';
import { poiHaulPreview, poiHaulBonus, poiTeamHaul, formatHaul } from '@/lib/poiYield';
import { refAdvGear, refChampionAdv, resolveCaravan } from '@/lib/caravan';
import { SUPPLY, type SupplyId } from '@/lib/supplies';
import type { Adventurer } from '@/lib/adventurers';
import {
  harvestGold,
  harvestYield,
  heroRewardLevel,
  poiForceOf,
  type Poi,
  type PoiType,
} from '@/lib/expedition';
import { forceLootPreview } from '@/lib/camp';
import { CARAVAN } from '@/lib/caravan';
import { riftClearMana } from '@/lib/rift';

const poi = (type: PoiType, id = 'p1', level = 30): Poi =>
  ({ id, type, level, x: 120, y: 100, distNorm: 0.5, spawnedAt: 0, expiresAt: 1e12 }) as Poi;

describe('poiHaulPreview : la récolte elle-même, jamais une seconde échelle', () => {
  it('une mine = son filon + les bourses de ses gardes', () => {
    // ⚠️ Une mine gardée par des BANDITS (les seuls qui portent une bourse) : au hasard, les
    // gardes pouvaient être des bêtes, et oublier les bourses passait au vert.
    let p = poi('mine');
    for (let i = 0; poiForceOf(p)?.faction !== 'bandits'; i++) p = poi('mine', 'm' + i);
    const force = poiForceOf(p);
    const loot = force ? forceLootPreview(p, force).gold : 0;
    expect(loot).toBeGreaterThan(0);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: true }).gold).toBe(
      harvestGold(p, 30) + loot,
    );
  });
  it('une source : pleine avec le héros, à la part d’équipe sans lui', () => {
    const p = poi('well');
    const plein = harvestYield('well', heroRewardLevel(p, 30), poiForceOf(p)?.size ?? 0).energy;
    expect(plein).toBeGreaterThan(0);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: true }).energy).toBe(plein);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: false }).energy).toBe(
      Math.round(plein * CARAVAN.energyShare),
    );
  });
  it('un sanctuaire : pierres pleines avec le héros, à la part d’équipe sans lui (v0.1210)', () => {
    const p = poi('shrine');
    const force = poiForceOf(p);
    const loot = force ? forceLootPreview(p, force).summonStones : 0;
    const plein = harvestYield('shrine', heroRewardLevel(p, 30), force?.size ?? 0).summonStones;
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: true }).summonStones).toBe(plein + loot);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: false }).summonStones).toBe(
      Math.round(plein * CARAVAN.stonesShare) + Math.round(loot * CARAVAN.stonesShare),
    );
  });
  it('un sanctuaire rend des pierres, des archives des clés', () => {
    expect(
      poiHaulPreview(poi('shrine'), { playerLevel: 30, heroGoes: false }).summonStones,
    ).toBeGreaterThan(0);
    expect(
      poiHaulPreview(poi('archive'), { playerLevel: 30, heroGoes: false }).keys,
    ).toBeGreaterThan(0);
  });
});

describe('une faille', () => {
  it('rend le mana de sa fermeture, gardien compris', () => {
    const p = poi('rift');
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: false }).mana).toBe(riftClearMana(p));
  });
});

describe('formatHaul : la quantité, sans les ressources nulles (v0.1265)', () => {
  it('liste ce qui rapporte, avec un préfixe au choix', () => {
    const haul = { gold: 3000, energy: 0, summonStones: 4, keys: 1, mana: 0 };
    const fr = (n: number) => n.toLocaleString('fr-FR');
    expect(formatHaul(haul)).toBe(`${fr(3000)} 🪙 · 4 🔮 · 1 🗝️`);
    expect(formatHaul(haul, '+')).toBe(`+${fr(3000)} 🪙 · +4 🔮 · +1 🗝️`);
    expect(formatHaul({ gold: 0, energy: 0, summonStones: 0, keys: 0, mana: 0 })).toBe('');
  });
});

describe('poiHaulBonus : les bâts et les porteurs, à part (v0.1265)', () => {
  const team = (n: number): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(26, i),
      id: `a${i}`,
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
        relic: `refGear${i}relic`,
      },
    }));
  const advGear = refAdvGear(26, 3);
  const zero = { gold: 0, energy: 0, summonStones: 0, keys: 0, mana: 0 };
  const bats: SupplyId[] = ['bats'];

  it('rien sans bâts ni porteurs, rien sur un lieu qui n’est pas une récolte', () => {
    expect(
      poiHaulBonus(poi('mine'), {
        playerLevel: 30,
        heroGoes: true,
        escort: [],
        kit: { advGear: [], supplies: [] },
      }),
    ).toEqual(zero);
    expect(
      poiHaulBonus(poi('camp'), {
        playerLevel: 30,
        heroGoes: true,
        escort: [],
        kit: { advGear: [], supplies: bats },
      }),
    ).toEqual(zero);
  });

  it('avec le héros, les bâts s’appliquent à la récolte', () => {
    const p = poi('mine');
    const g = harvestGold(p, 30);
    const b = poiHaulBonus(p, {
      playerLevel: 30,
      heroGoes: true,
      escort: team(3),
      kit: { advGear, supplies: bats },
    });
    expect(b.gold).toBe(Math.round(g * (1 + SUPPLY.haul)) - g);
    expect(b.gold).toBeGreaterThan(0);
  });

  it('sans le héros : exactement ce que les bâts ajoutent au convoi (graines sans rencontre)', () => {
    const p = poi('mana_mine', 'mm', 26);
    const esc = team(3);
    const avecKit = { advGear, supplies: bats };
    const sansKit = { advGear, supplies: [] as SupplyId[] };
    const opts = (kit: typeof avecKit) => ({ playerLevel: 26, heroGoes: false, escort: esc, kit });
    let calmes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const avec = resolveCaravan(p, esc, seed, avecKit, 26, 26);
      if (!avec.events.every((e) => e.kind === 'calme')) continue;
      calmes++;
      const sans = resolveCaravan(p, esc, seed, sansKit, 26, 26);
      const dA = poiHaulBonus(p, opts(avecKit));
      const dS = poiHaulBonus(p, opts(sansKit));
      expect(avec.mana - sans.mana).toBe(dA.mana - dS.mana);
      expect(avec.gold - sans.gold).toBe(dA.gold - dS.gold);
    }
    expect(calmes).toBeGreaterThan(0);
  });

  it('sans le héros, l’énergie ne dépasse jamais sa base', () => {
    const b = poiHaulBonus(poi('well'), {
      playerLevel: 30,
      heroGoes: false,
      escort: team(3),
      kit: { advGear, supplies: bats },
    });
    expect(b.energy).toBe(0);
  });
});

describe('poiTeamHaul : la récolte de base et celle de cette équipe', () => {
  const adv = (i: number): Adventurer => ({
    ...refChampionAdv(26, i),
    id: `t${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  });
  const advGear = refAdvGear(26, 3);
  const porteur = [adv(0)]; // porte la cargaison 🐫
  const sansRole = [adv(2)]; // ne la porte pas
  const opts = (escort: Adventurer[], heroGoes = false, supplies: SupplyId[] = []) => ({
    playerLevel: 26,
    heroGoes,
    escort,
    kit: { advGear, supplies },
  });

  it('le total = la base + le bonus, champ par champ', () => {
    const p = poi('mana_mine', 'mm', 26);
    const o = opts(porteur, false, ['bats']);
    const { base, total } = poiTeamHaul(p, o);
    const b = poiHaulBonus(p, o);
    expect(base).toEqual(poiHaulPreview(p, o));
    for (const k of Object.keys(base) as (keyof typeof base)[])
      expect(total[k]).toBe(base[k] + b[k]);
  });

  it('une mine de mana : le porteur 🐫 ramène plus, et il n’est pas « inutile »', () => {
    const r = poiTeamHaul(poi('mana_mine', 'mm', 26), opts(porteur));
    expect(r.total.mana).toBeGreaterThan(r.base.mana);
    expect(r.idleHaul).toBe(false);
  });

  it('une mine d’or : le porteur 🐫 ne change pas l’or — et on le dit', () => {
    const r = poiTeamHaul(poi('mine'), opts(porteur));
    expect(r.total.gold).toBe(r.base.gold);
    expect(r.idleHaul).toBe(true);
  });

  it('avec le héros, le rôle 🐫 ne compte pas — et on le dit', () => {
    expect(poiTeamHaul(poi('mana_mine', 'mm', 26), opts(porteur, true)).idleHaul).toBe(true);
  });

  it('personne ne porte la cargaison : rien à signaler', () => {
    expect(poiTeamHaul(poi('mine'), opts(sansRole)).idleHaul).toBe(false);
    expect(poiTeamHaul(poi('mine'), opts([])).idleHaul).toBe(false);
  });

  it('un lieu de combat n’a pas de récolte à gonfler : rien à signaler', () => {
    expect(poiTeamHaul(poi('camp'), opts(porteur)).idleHaul).toBe(false);
  });
});
