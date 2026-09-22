// ⭐ SIGNATURES DE SET (v0.835) — l’effet unique du set complet porté dans SA voie.
//
// ⚠️ Calibrées par la mesure (combat de boss, niveaux 30/60/90, boss calé à 50 % de victoire
// sans elles) : chacune vaut ~+8 à +10 % de puissance équivalente en moyenne. Ces tests ne
// re-mesurent pas l’équilibrage (trop lent) ; ils verrouillent que chaque effet FAIT ce qu’il
// annonce, qu’il ne s’active qu’au bon moment, et que la puissance affichée le compte.
import { describe, it, expect } from 'vitest';
import {
  SET_SIGNATURES,
  VOIE_SETS,
  LEGENDARY_PROCS,
  SET_SLOTS,
  SET_SIZE,
  voieSetId,
  setSignatureOf,
  playerWithGear,
  type Equipped,
  type Item,
} from '@/lib/items';
import { COMBAT, PROC_POWER, combatPowerRaw, simulateCombat, type Combatant } from '@/lib/combat';

const piece = (slot: string, setId: string): Item =>
  ({
    id: slot + setId,
    slot,
    name: 'x',
    emoji: '',
    rarity: 'rare',
    level: 10,
    baseLevel: 10,
    setId,
    effect: { type: 'damage_pct', value: 1 },
  }) as Item;
const fullSet = (voie: string, n = SET_SIZE): Equipped =>
  Object.fromEntries(SET_SLOTS.slice(0, n).map((sl) => [sl, piece(sl, voieSetId(voie))]));

const hero = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'h',
  pv: 10_000,
  damage: 100,
  crit: 0,
  dodge: 0,
  initiative: 10,
  strikes: 1,
  ...over,
});
const foe = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'm',
  pv: 5_000,
  damage: 50,
  crit: 0,
  dodge: 0,
  initiative: 1,
  ...over,
});
const withSig = (voie: string, c: Combatant): Combatant => ({
  ...c,
  procs: new Set([SET_SIGNATURES[voie]!.id]),
});
const fight = (p: Combatant, m: Combatant) => simulateCombat(p, m, { seed: 42, goldOnWin: 0 });
const playerHits = (p: Combatant, m: Combatant) =>
  fight(p, m).log.filter((e) => e.who === 'player' && e.type !== 'dodge');
const foeHits = (p: Combatant, m: Combatant) =>
  fight(p, m).log.filter((e) => e.who === 'monster' && e.type !== 'dodge');

describe('⭐ quand une signature s’active', () => {
  // ⚠️ RÉÉCRIT (2026-09-22) : plus de condition de voie — la voie se déduit du set porté.
  it('les SIX pièces d’un même set — pas cinq', () => {
    expect(setSignatureOf(fullSet('assassin'))?.id).toBe('sig_assassin');
    expect(setSignatureOf(fullSet('assassin', SET_SIZE - 1))).toBeUndefined();
  });
  it('le combattant la porte — et pas autrement', () => {
    const stats = { puissance: 100, endurance: 100, agilite: 100 };
    expect(playerWithGear('p', stats, fullSet('colosse'), {}, 20).procs?.has('sig_colosse')).toBe(
      true,
    );
    expect(
      playerWithGear('p', stats, fullSet('colosse', SET_SIZE - 1), {}, 20).procs?.has(
        'sig_colosse',
      ) ?? false,
    ).toBe(false);
  });
  it('une par set de voie, toutes distinctes et distinctes des procs d’objets', () => {
    const ids = VOIE_SETS.map((s) => s.signature?.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(VOIE_SETS.length);
    const procIds = new Set(LEGENDARY_PROCS.map((p) => p.id));
    for (const id of ids) expect(procIds.has(id!)).toBe(false);
  });
  it('la puissance affichée la compte, avec SON poids (sinon l’optimiseur ne la verrait pas)', () => {
    for (const [v, sig] of Object.entries(SET_SIGNATURES)) {
      const w = PROC_POWER[sig.id];
      expect(w?.weight, v).toBeGreaterThan(0);
      const r = combatPowerRaw(withSig(v, hero())) / combatPowerRaw(hero());
      expect(r, v).toBeCloseTo(Math.sqrt(1 + w!.weight), 6);
    }
  });
});

describe('⭐ chaque signature fait ce qu’elle annonce', () => {
  it('Coup de grâce : un critique inflige plus que ×2', () => {
    const p = hero({ crit: 1 });
    const a = playerHits(p, foe())[0]!.damage;
    const b = playerHits(withSig('assassin', p), foe())[0]!.damage;
    expect(b / a).toBeCloseTo(COMBAT.graceCritMult / 2, 1);
  });
  it('Carnage : rien au premier coup, de plus en plus fort à mesure que l’ennemi saigne', () => {
    const a = playerHits(hero(), foe());
    const b = playerHits(withSig('berserker', hero()), foe());
    expect(b[0]!.damage).toBe(a[0]!.damage);
    expect(b[20]!.damage).toBeGreaterThan(a[20]!.damage * 1.2);
  });
  it('Botte secrète : un coup porté sur 3 est un critique, sans le moindre taux de critique', () => {
    const types = playerHits(withSig('duelliste', hero()), foe())
      .slice(0, 9)
      .map((e) => e.type);
    types.forEach((t, i) =>
      expect(t, `coup ${i + 1}`).toBe((i + 1) % COMBAT.secretThrustEvery === 0 ? 'crit' : 'hit'),
    );
  });
  it('Transe : l’élan continue de monter au-delà de 4 tours', () => {
    const p = hero({ momentum: 0.1 });
    const a = playerHits(p, foe({ pv: 1e9 }));
    const b = playerHits(withSig('frenetique', p), foe({ pv: 1e9 }));
    // ⚠️ Même coup, même graine, avec et sans : deux coups différents n'ont pas la même
    // variance, les comparer entre eux ne prouve rien (premier jet de ce test).
    // Un coup par tour ici : le coup i est le tour i+1, donc i cumuls d'élan (par tour).
    expect(b[3]!.damage).toBe(a[3]!.damage); // 3 cumuls : sous les deux plafonds
    const attendu = (1 + COMBAT.tranceMaxStacks * 0.1) / (1 + COMBAT.momentumMaxStacks * 0.1);
    expect(b[12]!.damage / a[12]!.damage).toBeCloseTo(attendu, 1);
  });
  it('Bastion : les 3 premières attaques qui touchent sont amorties, pas la 4ᵉ', () => {
    const a = foeHits(hero(), foe({ pv: 1e9 }));
    const b = foeHits(withSig('gardien', hero()), foe({ pv: 1e9 }));
    for (let i = 0; i < COMBAT.bastionHits; i++) expect(b[i]!.damage).toBeLessThan(a[i]!.damage);
    expect(b[COMBAT.bastionHits]!.damage).toBe(a[COMBAT.bastionHits]!.damage);
  });
  it('Inébranlable : aucun coup ne retire plus de 40 % des PV max', () => {
    const cap = Math.round(10_000 * COMBAT.unshakenMaxHitPct);
    const hits = foeHits(withSig('colosse', hero()), foe({ damage: 50_000 }));
    expect(hits.length).toBeGreaterThan(1); // sans elle on meurt au premier coup
    for (const h of hits) expect(h.damage).toBeLessThanOrEqual(cap);
  });
  it('Soif éternelle : on vole plus que le plafond ordinaire en un tour', () => {
    const p = hero({ pv: 10_000, lifesteal: 0.5, damage: 20_000 });
    const m = foe({ pv: 1e9, damage: 3_000 });
    const base = Math.round(10_000 * COMBAT.lifestealRoundCap);
    const heal = (c: Combatant) => {
      const log = fight(c, m).log;
      // PV rendus par le 2ᵉ tour du joueur, après avoir encaissé un coup ennemi.
      const i = log.findIndex((e, k) => k > 0 && e.who === 'player');
      return log[i]!.playerPv - log[i - 1]!.playerPv;
    };
    expect(heal(p)).toBeLessThanOrEqual(base);
    expect(heal(withSig('vampire', p))).toBeGreaterThan(base);
  });
  it('Ronces : chaque coup reçu retire une part fixe des PV max de l’ennemi', () => {
    const m = foe({ pv: 100_000 });
    const p = hero({ damage: 1 });
    const log = fight(withSig('epineux', p), m).log;
    const i = log.findIndex((e) => e.who === 'monster' && e.type !== 'dodge');
    expect(log[i - 1]!.monsterPv - log[i]!.monsterPv).toBe(
      Math.round(100_000 * COMBAT.bramblesMaxPvPct),
    );
  });
});
