import { describe, expect, it } from 'vitest';
import {
  SUPPLY,
  SUPPLY_IDS,
  addSupplies,
  normalizeSupplies,
  rollSupplyDrop,
  sealRift,
  supplyFx,
  supplyUselessWhy,
  takeSupplies,
  type SupplyId,
} from '@/lib/supplies';
import {
  CARAVAN,
  ambushChance,
  caravanHaulMult,
  caravanHurtMs,
  escortGear,
  partyAllies,
  refAdvGear,
  refChampionAdv,
  roadUnits,
} from '@/lib/caravan';
import { campFoe, campGroupHaul, campWinPct, resolveCamp } from '@/lib/camp';
import { incursionWinPct, resolveIncursion } from '@/lib/rift';
import { partyWinChance } from '@/lib/partyForecast';
import { partyClaimRoster, partyLegMin, suppliesBlocker, supplyTarget } from '@/lib/party';
import { haulPills, type PartyResult, type Poi } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const poiAt = (L: number, type: Poi['type'] = 'camp', id = 'p'): Poi => ({
  id,
  type,
  level: L,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});
const team = (n: number, L: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(L, i),
    id: `a${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const kit = (L: number, n: number, supplies: SupplyId[] = []) => ({
  advGear: refAdvGear(L, n),
  supplies,
});

describe('🎒 le stock', () => {
  it('se relit sans ids inconnus ni comptes invalides', () => {
    expect(normalizeSupplies({ rations: 2.7, potion: 0, inconnu: 5, cor: -1, bats: 'x' })).toEqual({
      rations: 2,
    });
    expect(normalizeSupplies(null)).toEqual({});
  });
  it('un butin s’ajoute, et rien n’est réécrit quand il n’y a rien', () => {
    const s = { rations: 1 };
    expect(addSupplies(s, { rations: 1, cor: 1 })).toEqual({ rations: 2, cor: 1 });
    expect(addSupplies(s, {})).toBe(s);
  });
  it('on n’emporte que ce qu’on a — et un seul de chaque', () => {
    expect(takeSupplies({ rations: 2, cor: 1 }, ['rations', 'cor'])).toEqual({ rations: 1 });
    expect(takeSupplies({ rations: 1 }, ['potion'])).toBeNull();
    expect(takeSupplies({ rations: 5 }, ['rations', 'rations'])).toBeNull();
  });
  it('un doublon passé aux effets ne compte qu’une fois', () => {
    expect(supplyFx(['rations', 'rations']).speed).toBe(SUPPLY.speed);
  });
});

describe('🎒 le butin : tout partout', () => {
  it('environ un voyage sur 2 à 3, et chaque consommable peut tomber', () => {
    const seen = new Set<string>();
    let drops = 0;
    const N = 4000;
    for (let s = 1; s <= N; s++) {
      const d = rollSupplyDrop(s);
      const ids = Object.keys(d);
      expect(ids.length).toBeLessThanOrEqual(1);
      if (ids.length) {
        drops++;
        seen.add(ids[0]!);
      }
    }
    expect(drops / N).toBeGreaterThan(0.35);
    expect(drops / N).toBeLessThan(0.55);
    expect(seen.size).toBe(SUPPLY_IDS.length);
  });
  it('se voit dans les pastilles de butin', () => {
    expect(haulPills({ supplies: { potion: 1 } })).toContainEqual({ emoji: '🧪', n: 1 });
  });
});

describe('🎒 chaque effet agit, et par le chemin du combat', () => {
  it('🧪🪨 potion et pierre renforcent chaque membre du groupe', () => {
    const L = 26;
    const escort = team(3, L);
    const base = partyAllies(escort, kit(L, 3), null);
    const boosted = partyAllies(escort, kit(L, 3, ['potion', 'pierre']), null);
    base.forEach((u, i) => {
      const b = boosted[i]!.combatant;
      expect(b.pv).toBe(Math.round(u.combatant.pv * (1 + SUPPLY.pv)));
      expect(b.damage).toBe(Math.round(u.combatant.damage * (1 + SUPPLY.dmg)));
    });
  });

  it('🎯 le % affiché MONTE avec les consommables de combat (jamais ne baisse)', () => {
    let strictly = false;
    for (const L of [12, 26, 45])
      for (const size of [2, 3, 4]) {
        const escort = team(2, L);
        const p = poiAt(L, 'camp', `c${L}-${size}`);
        const plain = partyWinChance(p, escort, kit(L, 2), null, 0, 40)!;
        const boosted = partyWinChance(
          p,
          escort,
          kit(L, 2, ['potion', 'pierre', 'fumigene']),
          null,
          0,
          40,
        )!;
        expect(boosted).toBeGreaterThanOrEqual(plain);
        if (boosted > plain) strictly = true;
      }
    expect(strictly).toBe(true);
  });

  it('🔥 le fumigène affaiblit le camp, dans le combat ET dans le pronostic', () => {
    const p = poiAt(26);
    const spec = { faction: 'bandits' as const, size: 3 };
    const f = campFoe(p, spec, SUPPLY.guardMult);
    const f0 = campFoe(p, spec);
    expect(f.pv).toBeLessThan(f0.pv);
    const allies = roadUnits(team(2, 26), escortGear(team(2, 26), kit(26, 2)));
    expect(campWinPct(p, spec, allies, 40, SUPPLY.guardMult)).toBeGreaterThanOrEqual(
      campWinPct(p, spec, allies, 40),
    );
  });

  it('⚔️ la RÉSOLUTION voit les mêmes consommables que le pronostic', () => {
    // Sur 60 départs, une équipe renforcée ne gagne jamais moins souvent.
    const L = 26;
    const escort = team(2, L);
    const spec = { faction: 'bandits' as const, size: 3 };
    let plain = 0;
    let boosted = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const base = {
        poi: poiAt(L),
        spec,
        escort,
        hero: null,
        seed,
        playerLevel: L,
        pantheonLevel: L,
      };
      if (resolveCamp({ ...base, road: kit(L, 2) }).win) plain++;
      if (resolveCamp({ ...base, road: kit(L, 2, ['potion', 'pierre', 'fumigene']) }).win)
        boosted++;
    }
    expect(boosted).toBeGreaterThan(plain);
  });

  it('⚔️ CHAQUE consommable de combat, SEUL, aide au pronostic ET à la résolution', () => {
    // ⚠️ Un par un : testés ensemble, un effet oublié d'un côté se cacherait derrière les autres.
    const L = 26;
    const escort = team(2, L);
    const spec = { faction: 'bandits' as const, size: 3 };
    for (const id of ['potion', 'pierre', 'fumigene'] as const) {
      const p = poiAt(L, 'camp', 'solo');
      // Pronostic : ce que lit la carte (fumigène compris, lu par `partyWinChance`).
      expect(partyWinChance(p, escort, kit(L, 2, [id]), null, 0, 200)!, id).toBeGreaterThan(
        partyWinChance(p, escort, kit(L, 2), null, 0, 200)!,
      );
      // Résolution : le vrai combat du départ.
      let plain = 0;
      let boosted = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const base = { poi: p, spec, escort, hero: null, seed, playerLevel: L, pantheonLevel: L };
        if (resolveCamp({ ...base, road: kit(L, 2) }).win) plain++;
        if (resolveCamp({ ...base, road: kit(L, 2, [id]) }).win) boosted++;
      }
      expect(boosted, id).toBeGreaterThan(plain);
    }
  });

  it('🕯️ la lanterne rend une faille plus facile à refermer', () => {
    const L = 26;
    const rift = { ...poiAt(L, 'rift', 'rift_1'), spawnedAt: 0 };
    const now = 6 * 24 * 3600_000;
    const allies = partyAllies(team(3, L), kit(L, 3), null);
    expect(incursionWinPct(rift, allies, now, 40, SUPPLY.riftFoeMult)).toBeGreaterThan(
      incursionWinPct(rift, allies, now, 40),
    );
    // …et c'est bien ce que lit le pronostic de la carte.
    expect(partyWinChance(rift, team(3, L), kit(L, 3, ['lanterne']), null, now, 40)).toBe(
      incursionWinPct(rift, allies, now, 40, SUPPLY.riftFoeMult),
    );
    // …et la VRAIE incursion aussi.
    let plain = 0;
    let lit = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const base = { poi: rift, escort: team(3, L), hero: null, seed, now, pantheonLevel: L };
      if (resolveIncursion({ ...base, road: kit(L, 3) }).win) plain++;
      if (resolveIncursion({ ...base, road: kit(L, 3, ['lanterne']) }).win) lit++;
    }
    expect(lit).toBeGreaterThan(plain);
  });

  it('📯 le cor : un camp perdu rend la moitié de son butin au lieu de rien', () => {
    const L = 26;
    const spec = { faction: 'bandits' as const, size: 10 };
    const poi = poiAt(L, 'lair');
    const input = {
      poi,
      spec,
      escort: team(1, L),
      hero: null,
      seed: 3,
      playerLevel: L,
      pantheonLevel: L,
    };
    const lost = resolveCamp({ ...input, road: kit(L, 1) });
    expect(lost.win).toBe(false);
    expect(lost.gold).toBe(0);
    const withCor = resolveCamp({ ...input, road: kit(L, 1, ['cor']) });
    expect(withCor.win).toBe(false);
    expect(withCor.gold).toBe(Math.round(campGroupHaul(poi, spec).gold * SUPPLY.retreatShare));
    expect(withCor.gold).toBeGreaterThan(0);
  });

  it('🩹 la trousse divise la convalescence', () => {
    const escort = team(1, 20);
    const party: PartyResult = {
      hero: false,
      faction: 'bandits',
      escort: ['a0'],
      win: false,
      foes: 3,
      slain: 0,
      kills: {},
      heroKills: 0,
      xp: { a0: 0 },
      hurt: ['a0'],
      journal: [],
    };
    const ctx = {
      pantheonLevel: 20,
      infirmaryLevel: 0,
      backAt: 1_000_000,
      now: 1_000_000,
      xpGranted: false,
    };
    const full = partyClaimRoster(party, escort, ctx).adventurers[0]!.hurtUntil!;
    const half = partyClaimRoster({ ...party, healMult: SUPPLY.healMult }, escort, ctx)
      .adventurers[0]!.hurtUntil!;
    expect(full - ctx.backAt).toBe(caravanHurtMs(escort, 0));
    expect(half - ctx.backAt).toBe(caravanHurtMs(escort, 0) * SUPPLY.healMult);
  });

  it('🥖 les rations raccourcissent le trajet — sous le plafond du rôle 🧭 pour les champions', () => {
    const poi = poiAt(40);
    const escort = team(3, 40);
    const leg = (supplies: SupplyId[], gearSpeed = 0, hero = false) =>
      partyLegMin(poi, escort, { hero, travelMult: 1, gearSpeed, supplies });
    expect(leg(['rations'])).toBeLessThan(leg([]));
    expect(leg(['rations'], 0, true)).toBeLessThan(leg([], 0, true));
    // Vitesse déjà au plafond : les rations ne font plus rien aux champions.
    expect(leg(['rations'], 1)).toBe(leg([], 1));
  });

  it('🗺️🧺 carte et bâts partagent le plafond de leur rôle', () => {
    const poi = poiAt(20, 'mine');
    expect(ambushChance(poi, [], SUPPLY.scout)).toBeCloseTo(
      ambushChance(poi, []) * (1 - SUPPLY.scout),
    );
    expect(ambushChance(poi, [], 5)).toBeCloseTo(ambushChance(poi, []) * (1 - CARAVAN.scoutMax));
    expect(caravanHaulMult([], [], SUPPLY.haul)).toBeCloseTo(1 + SUPPLY.haul);
    expect(caravanHaulMult([], [], 5)).toBeCloseTo(1 + CARAVAN.haulMax);
  });

  it('🧿 le sceau recule l’âge de la faille d’un jour, une seule fois', () => {
    const rift = { ...poiAt(30, 'rift'), spawnedAt: 1000, expiresAt: 5000 };
    const s = sealRift(rift)!;
    expect(s.spawnedAt).toBe(1000 + SUPPLY.sealMs);
    expect(s.expiresAt).toBe(5000 + SUPPLY.sealMs);
    expect(sealRift(s)).toBeNull();
    expect(sealRift(poiAt(30, 'camp'))).toBeNull();
  });
});

describe('🎒 ce qui ne sert à rien est dit, et refusé', () => {
  it('chaque consommable a un lieu où il sert', () => {
    const t = (type: Poi['type'], fights = true, hero = false, escort = 2) => ({
      type,
      fights,
      hero,
      escort,
    });
    expect(supplyUselessWhy('lanterne', t('camp'))).not.toBeNull();
    expect(supplyUselessWhy('lanterne', t('rift'))).toBeNull();
    expect(supplyUselessWhy('bats', t('mine'))).toBeNull();
    expect(supplyUselessWhy('carte', t('mine', true, true))).not.toBeNull();
    expect(supplyUselessWhy('trousse', t('camp', true, true, 0))).not.toBeNull();
    expect(supplyUselessWhy('potion', t('mine', false))).not.toBeNull();
    expect(supplyUselessWhy('sceau', t('rift'))).not.toBeNull();
    // Le fumigène agit sur un camp ou des gardes — pas dans une faille, ni sur une récolte sans gardes.
    expect(supplyUselessWhy('fumigene', t('rift'))).not.toBeNull();
    expect(supplyUselessWhy('fumigene', t('mine', false))).not.toBeNull();
    expect(supplyUselessWhy('fumigene', t('mine'))).toBeNull();
  });
  it('le store refuse ce que l’écran grise — une seule règle', () => {
    const target = supplyTarget(poiAt(20, 'camp'), false, 2);
    expect(suppliesBlocker(['potion', 'cor'], target)).toBeNull();
    expect(suppliesBlocker(['lanterne'], target)).toMatch(/Lanterne/);
    expect(suppliesBlocker(['potion', 'potion'], target)).not.toBeNull();
  });
});
