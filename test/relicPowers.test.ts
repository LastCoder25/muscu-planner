// 🔮 La relique à pouvoir (refonte équipement, étape 4) : une attaque spéciale qui se charge.
import { describe, it, expect } from 'vitest';
import {
  COMBAT,
  RELIC,
  combatPowerRaw,
  mulberry32,
  simulateCombat,
  simulateDungeon,
  type Combatant,
  type RelicPowerId,
} from '@/lib/combat';
import {
  RELIC_AFFINITY,
  RELIC_POWERS,
  aggregateEffects,
  playerWithGear,
  relicCharge,
  relicForce,
  relicPowerText,
  rollDrop,
  rollRelicPower,
  voieRelicPower,
  type Item,
} from '@/lib/items';
import { VOIES } from '@/lib/voies';

const hero = (relic?: Combatant['relic'], over: Partial<Combatant> = {}): Combatant => ({
  name: 'H',
  pv: 1000,
  damage: 50,
  crit: 0,
  dodge: 0,
  initiative: 10,
  strikes: 1,
  ...(relic ? { relic } : {}),
  ...over,
});
const foe = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'M',
  pv: 1e6,
  damage: 30,
  crit: 0,
  dodge: 0,
  initiative: 1,
  ...over,
});
const R = (id: RelicPowerId, force = 1, fast = false) => ({ id, force, ...(fast ? { fast } : {}) });
const run = (p: Combatant, m: Combatant, extra: { startPlayerPv?: number; gauge?: number } = {}) =>
  simulateCombat(p, m, { seed: 7, goldOnWin: 0, ...extra });
const fired = (p: Combatant, m: Combatant, skill: `rp_${RelicPowerId}`, extra = {}) =>
  run(p, m, extra).log.filter((e) => e.skills?.includes(skill));

const relicItem = (power: RelicPowerId, over: Partial<Item> = {}): Item => ({
  id: 'r',
  slot: 'relic',
  name: 'Idole',
  emoji: '🗿',
  rarity: 'rare',
  level: 20,
  baseLevel: 20,
  effect: { type: 'max_pv_pct', value: 0 },
  power,
  roll: 0.5,
  ...over,
});

describe('🔮 le catalogue', () => {
  it('12 pouvoirs, un par voie pour les 8 voies, chacun nommé et chiffré', () => {
    expect(RELIC_POWERS).toHaveLength(12);
    expect(new Set(RELIC_POWERS.map((p) => p.id)).size).toBe(12);
    for (const v of VOIES) expect(voieRelicPower(v.id), v.id).toBeTruthy();
    const voiePowers = VOIES.map((v) => voieRelicPower(v.id));
    expect(new Set(voiePowers).size).toBe(VOIES.length); // un pouvoir différent par voie
    for (const p of RELIC_POWERS) expect(relicPowerText(relicItem(p.id))).toContain(p.name);
  });
  it('une relique à pouvoir ne donne AUCUNE stat', () => {
    const a = aggregateEffects({
      relic: relicItem('brasier', { effect: { type: 'max_pv_pct', value: 50 } }),
    });
    expect(a.maxPvPct).toBe(0);
  });
});

describe('🔮 la force suit le rang, le jet et le niveau d’objet — pour les 12 pouvoirs', () => {
  const stats = { puissance: 200, endurance: 200, agilite: 200 };
  const power = (it: Item) => combatPowerRaw(playerWithGear('H', stats, { relic: it }, {}, 40));
  for (const p of RELIC_POWERS)
    it(`${p.name} : mieux sur chaque axe ⇒ plus de puissance`, () => {
      const base = relicItem(p.id);
      expect(power(relicItem(p.id, { rarity: 'epique' }))).toBeGreaterThan(power(base));
      expect(power(relicItem(p.id, { roll: 0.9 }))).toBeGreaterThan(power(base));
      expect(power(relicItem(p.id, { level: 30 }))).toBeGreaterThan(power(base));
      expect(power(base)).toBeGreaterThan(combatPowerRaw(playerWithGear('H', stats, {}, {}, 40)));
    });
  it('Légendaire+ : la jauge se remplit plus vite', () => {
    expect(relicCharge(relicItem('ronces', { rarity: 'legendaire' }))?.fast).toBe(true);
    expect(relicCharge(relicItem('ronces'))?.fast).toBeUndefined();
    expect(relicForce(relicItem('ronces', { rarity: 'legendaire' }))).toBeGreaterThan(1);
  });
});

describe('🔮 le tirage', () => {
  it('une relique trouvée porte un pouvoir, jamais d’effet légendaire', () => {
    let n = 0;
    for (let s = 1; s <= 800; s++) {
      const d = rollDrop(mulberry32(s), { cleared: true, defeated: 3, level: 80, luck: 1 });
      if (d?.slot !== 'relic') continue;
      n++;
      expect(d.power).toBeTruthy();
      expect(d.legendary).toBeUndefined();
    }
    expect(n).toBeGreaterThan(50);
  });
  it('AFFINITÉ : 1 chance sur 3 de porter le pouvoir de la relique équipée (plus le hasard)', () => {
    let same = 0;
    const N = 6000;
    for (let s = 1; s <= N; s++) if (rollRelicPower(mulberry32(s), 'festin') === 'festin') same++;
    const attendu = RELIC_AFFINITY + (1 - RELIC_AFFINITY) / RELIC_POWERS.length;
    expect(same / N).toBeCloseTo(attendu, 1);
    let sans = 0;
    for (let s = 1; s <= N; s++) if (rollRelicPower(mulberry32(s)) === 'festin') sans++;
    expect(sans / N).toBeCloseTo(1 / RELIC_POWERS.length, 1);
  });
});

describe('🔮 chaque pouvoir fait ce qu’il annonce', () => {
  it('Ouverture : une frappe dès le premier tour, jauge pleine à chaque combat', () => {
    const log = run(hero(R('ouverture')), foe()).log;
    expect(log[0]!.skills).toContain('rp_ouverture');
    expect(log[0]!.damage).toBe(Math.round(50 * RELIC.ouvertureMult));
    // Même en arrivant jauge vide d'un combat précédent, elle repart pleine.
    expect(run(hero(R('ouverture')), foe(), { gauge: 0 }).log[0]!.skills).toContain('rp_ouverture');
  });
  it('Brasier : ne se charge que sous son seuil, et frappe plus fort si on saigne', () => {
    expect(fired(hero(R('brasier')), foe({ damage: 1 }), 'rp_brasier')).toHaveLength(0);
    // Seuil propre (étape 7), au-dessus du seuil de rage : à mi-vie il se charge déjà.
    const mid = (RELIC.brasierThreshold - 0.05) * 1000;
    expect(
      fired(hero(R('brasier')), foe({ damage: 1 }), 'rp_brasier', { startPlayerPv: mid }).length,
    ).toBeGreaterThan(0);
    const low = fired(hero(R('brasier')), foe({ damage: 1 }), 'rp_brasier', { startPlayerPv: 100 });
    expect(low.length).toBeGreaterThan(0);
    expect(low[0]!.damage).toBeGreaterThan(50 * RELIC.brasierMult * 2); // ×(1 + 2 × 0,9)
  });
  it('Coup fatal : après 5 critiques, un critique renforcé inesquivable', () => {
    const p = hero(R('coup_fatal'), { crit: 1 });
    const log = run(p, foe({ dodge: 0.5, damage: 0 })).log;
    const k = log.findIndex((e) => e.skills?.includes('rp_coup_fatal'));
    expect(k).toBeGreaterThan(0);
    expect(log[k]!.type).toBe('crit');
    expect(log[k]!.damage).toBeGreaterThan(50 * 2 * 1.3); // ×2 × (1 + 0,5)
  });
  it('Coup fatal : il ne peut PAS être esquivé — un par tranche de 5 critiques, même face à 90 % d’esquive', () => {
    const log = run(hero(R('coup_fatal'), { crit: 1 }), foe({ dodge: 0.9, damage: 0 })).log;
    const fatals = log.filter((e) => e.skills?.includes('rp_coup_fatal')).length;
    const crits = log.filter(
      (e) => e.type === 'crit' && !e.skills?.includes('rp_coup_fatal'),
    ).length;
    expect(crits).toBeGreaterThan(20);
    // Le dernier déclenchement peut être encore en attente en fin de combat.
    expect(fatals).toBeGreaterThanOrEqual(Math.floor(crits / (RELIC.full / RELIC.fatalCharge)) - 1);
  });
  it('Rempart vengeur : les blocages s’accumulent puis repartent en un coup', () => {
    const log = fired(hero(R('rempart'), { block: 1 }), foe(), 'rp_rempart');
    expect(log.length).toBeGreaterThan(0);
    // ⚠️ Étape 7 : une contre-attaque d'une volée et demie (volée de 50, force 1), et non plus
    // les dégâts évités (ils ne pesaient rien face à un boss).
    expect(log[0]!.damage).toBe(Math.round(50 * RELIC.rempartMult));
    expect(fired(hero(R('rempart')), foe(), 'rp_rempart')).toHaveLength(0); // sans blocage, rien
  });
  // ⚠️ RÉÉCRIT (étape 7) : l'explosion vaut une VOLÉE, et non plus le stock des dégâts renvoyés
  // — minuscule face aux PV d'un boss, il ne valait rien (0 % mesuré, même avec 30 % d'épines).
  it('Éclat de ronces : les coups d’épines chargent une explosion d’une volée et demie', () => {
    const log = fired(hero(R('ronces'), { thorns: 0.5 }), foe(), 'rp_ronces');
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]!.damage).toBe(Math.round(50 * RELIC.roncesMult)); // volée de 50, force 1
    expect(fired(hero(R('ronces')), foe(), 'rp_ronces')).toHaveLength(0); // sans épines, rien
  });
  it('Festin : le soin perdu au plafond du tour revient en dégâts', () => {
    const p = hero(R('festin'), { lifesteal: 1, strikes: 4 });
    expect(
      fired(p, foe({ damage: 0 }), 'rp_festin', { startPlayerPv: 500 }).length,
    ).toBeGreaterThan(0);
    expect(fired(hero(R('festin')), foe({ damage: 0 }), 'rp_festin')).toHaveLength(0); // sans vol de vie
  });
  it('Tempête : l’élan au maximum se charge, retombe, et rend une rafale', () => {
    // Élan fort (+50 % par tour) : la retombée se lit au-dessus de la variance des coups.
    const log = run(hero(R('tempete'), { momentum: 0.5 }), foe({ damage: 1 })).log;
    const k = log.findIndex((e) => e.skills?.includes('rp_tempete'));
    expect(k).toBeGreaterThan(0);
    // Juste après, le coup suivant du héros a perdu son élan.
    const avant = log
      .slice(0, k)
      .filter((e) => e.who === 'player')
      .pop()!;
    const apres = log.slice(k + 1).find((e) => e.who === 'player' && e.type === 'hit')!;
    // Élan au maximum (4 tours × 50 % = ×3) contre élan retombé (×1) : bien au-delà de la variance.
    expect(apres.damage).toBeLessThan(avant.damage * 0.6);
  });
  it('Riposte parfaite : chaque riposte charge, puis une riposte critique entière', () => {
    const log = fired(hero(R('riposte_parfaite'), { riposte: 1 }), foe(), 'rp_riposte_parfaite');
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]!.damage).toBe(Math.round(50 * 2)); // volée critique entière, force 1
  });
  it('Carapace : ce qu’on encaisse devient une barrière', () => {
    const avec = run(hero(R('carapace')), foe({ damage: 200 })).log.filter(
      (e) => e.who === 'monster',
    );
    const sans = run(hero(), foe({ damage: 200 })).log.filter((e) => e.who === 'monster');
    expect(avec.some((e) => e.skills?.includes('rp_carapace'))).toBe(true);
    const k = avec.findIndex((e) => e.skills?.includes('rp_carapace'));
    expect(avec[k + 1]!.playerPv).toBeGreaterThan(sans[k + 1]!.playerPv);
  });
  it('Moisson : chaque monstre abattu charge ; jauge pleine = un combat plus fort', () => {
    const r = run(hero(R('moisson')), foe({ pv: 30 }));
    expect(r.win).toBe(true);
    expect(r.gauge).toBe(RELIC.moissonCharge);
    const plein = run(hero(R('moisson')), foe(), { gauge: RELIC.full }).log[0]!;
    const vide = run(hero(R('moisson')), foe(), { gauge: 0 }).log[0]!;
    expect(plein.skills).toContain('rp_moisson');
    expect(plein.damage).toBeGreaterThan(vide.damage);
  });
  it('Phénix : le coup fatal perd une part qui suit la force (plafonnée)', () => {
    // Coup de ~70 sur 50 PV : sans le Phénix il tue ; amorti de 40 % (× force), il laisse vivant.
    const m = foe({ damage: 70, initiative: 99 });
    const p = (f: number) =>
      run(hero(R('phenix', f), { pv: 50 }), m).log.find((e) => e.who === 'monster')!;
    expect(p(1).playerPv).toBeGreaterThan(0);
    expect(p(1).skills).toContain('rp_phenix');
    expect(p(1.6).playerPv).toBeGreaterThan(p(1).playerPv); // plus fort, il amortit plus
    expect(Math.min(RELIC.phenixMax, RELIC.phenixBlock * 5)).toBe(RELIC.phenixMax);
  });
  it('Second souffle : sous 30 % de PV, un soin qui suit la force', () => {
    const e = (f: number) =>
      run(hero(R('second_souffle', f), { pv: 1000 }), foe({ damage: 400, initiative: 99 }), {
        startPlayerPv: 500,
      }).log.find((x) => x.skills?.includes('rp_second_souffle'))!;
    expect(e(1.6).playerPv).toBeGreaterThan(e(1).playerPv);
  });
});

describe('🔮 la jauge', () => {
  it('se remplit plus vite sur une relique Légendaire+', () => {
    const at = (fast: boolean) =>
      run(hero(R('coup_fatal', 1, fast), { crit: 1 }), foe({ damage: 0 })).log.findIndex((e) =>
        e.skills?.includes('rp_coup_fatal'),
      );
    expect(at(true)).toBeLessThan(at(false));
  });
  it('chaque événement la porte quand le héros a une relique, jamais sinon', () => {
    expect(run(hero(R('ronces')), foe()).log.every((e) => typeof e.gauge === 'number')).toBe(true);
    expect(run(hero(), foe()).log.some((e) => 'gauge' in e)).toBe(false);
    expect(run(hero(), foe()).gauge).toBeUndefined();
  });
  it('⚠️ elle SUIT le donjon : le 2ᵉ combat repart de la jauge du 1er', () => {
    const d = simulateDungeon(
      hero(R('ronces'), { thorns: 0.2 }),
      [0, 1].map(() => ({ combatant: foe({ pv: 120, damage: 20 }), gold: 0 })),
      { seed: 3 },
    );
    const g1 = d.fights[0]!.result.gauge!;
    expect(g1).toBeGreaterThan(0);
    const first2 = d.fights[1]!.result.log[0]!;
    expect(first2.gauge).toBeGreaterThanOrEqual(g1);
  });
  it('⚠️ sans relique, aucun tirage de plus : le combat seedé est inchangé', () => {
    const a = run(
      hero(undefined, { crit: 0.3, dodge: 0.1 }),
      foe({ crit: 0.2, dodge: 0.1, pv: 3000 }),
    );
    const b = run(
      hero(undefined, { crit: 0.3, dodge: 0.1 }),
      foe({ crit: 0.2, dodge: 0.1, pv: 3000 }),
    );
    expect(a.log).toEqual(b.log);
    expect(COMBAT.maxRounds).toBeGreaterThan(a.rounds);
  });
});
