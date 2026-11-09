import { describe, expect, it } from 'vitest';
import { ISLANDS, archipelOn, islandPacified, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { captureControl, controlIdOf, ensureControls } from '@/lib/controlPoints';
import {
  EMBER,
  FORTRESS_ID,
  emberGhosts,
  emberStatus,
  ensureIslandConquest,
  heldRazedObjectives,
  islandConquest,
  islandRules,
  islandTargetLabel,
  objectiveSpot,
  razeIslandTarget,
  takeObjective,
  warlordConvoys,
  warlordRaids,
} from '@/lib/islandConquest';
import { SORTIE_EVENTS, sortieThreshold } from '@/lib/sortieClock';
import { buildDeployment } from '@/lib/deployPlan';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';

/**
 * 🕯️⚔️ LES CAMPS DE GUERRE DE L'ÎLE 4 S'ÉTEIGNENT (décision de l'utilisateur, 2026-10-16, même
 * brique que l'île 3) : battus, ils ne se prennent pas, ils se rallument après 6 à 10 sorties
 * (jamais avant 24 h) ; éteint, un camp n'envoie ni armée mobile ni convoi ; île 4 sans clé de
 * voûte (tous les camps sont ordinaires).
 */
const NOW = Date.UTC(2026, 9, 16, 12);
const H = 3600_000;
const DAY = 24 * H;
const LV = 70;
const C0 = 'isl_obj_0';
const C1 = 'isl_obj_1';
const C2 = 'isl_obj_2';

function island(id = 4, lv = LV): ExpeditionMap {
  const m = createMap(5, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, lv, ISLAND_OUTPOST_LEVEL), NOW, lv);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
const sorties = (m: ExpeditionMap, from: number, n: number, step = H): ExpeditionMap => ({
  ...m,
  departures: [...(m.departures ?? []), ...Array.from({ length: n }, (_, i) => from + i * step)],
});
const onMap = (m: ExpeditionMap, id: string) => m.pois.some((p) => p.id === id);
const camps = (m: ExpeditionMap) =>
  m.pois.filter((p) => p.control?.owner === 'enemy' && p.control.kind === 'objective');
const off = (m: ExpeditionMap, ...ids: string[]) =>
  tick(
    ids.reduce((acc, id) => razeIslandTarget(acc, id, NOW), m),
    NOW,
  );

/** Un lieu tenu (le fortin) dont l'attaque est lointaine : de quoi recevoir une armée. */
const FAR = NOW + 30 * DAY;
function held(m: ExpeditionMap): ExpeditionMap {
  const out = captureControl(m, controlIdOf('fort'), ['d'], NOW, 7);
  return {
    ...out,
    pois: out.pois.map((p) =>
      p.control?.owner === 'player' ? { ...p, control: { ...p.control, attackAt: FAR } } : p,
    ),
  };
}
const fortOf = (m: ExpeditionMap) => m.pois.find((p) => p.control?.kind === 'fort')!.control!;

describe('🕯️⚔️ île 4 : un camp de guerre battu s’éteint', () => {
  it('il s’abat (drapeau), n’a pas de clé de voûte, et la braise est dans la fourchette ordinaire', () => {
    const m0 = island();
    expect(EMBER.islands.has(4)).toBe(true);
    expect(ISLANDS.find((i) => i.id === 4)!.keystone).toBeUndefined();
    for (const c of camps(m0)) expect(c.control!.razes).toBe(true);
    const m = off(m0, C0);
    expect(onMap(m, C0)).toBe(false);
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    const e = m.archipel!.embers![C0]!;
    expect(e.need).toBeGreaterThanOrEqual(EMBER.cemetery.min);
    expect(e.need).toBeLessThanOrEqual(EMBER.cemetery.max);
  });
  it('le prendre n’y laisse personne : il quitte la carte, la braise est posée', () => {
    const m = takeObjective(island(), C1, ['a', 'b', 'c'], NOW);
    expect(onMap(m, C1)).toBe(false);
    expect(m.archipel!.embers![C1]).toBeDefined();
    expect(heldRazedObjectives(m)).toEqual([]);
  });
  it('aucun camp n’est gelé, même tous éteints (pas de clé de voûte)', () => {
    const m = off(island(), C0, C1, C2);
    expect(emberStatus(m).map((s) => s.frozen)).toEqual([false, false, false]);
    expect(emberStatus(m).every((s) => s.left > 0)).toBe(true);
  });
  it('il reste visible, grisé, à sa place et avec l’icône du camp', () => {
    const m = off(island(), C1);
    const g = emberGhosts(m, NOW);
    expect(g.map((x) => x.id)).toEqual([C1]);
    const spot = objectiveSpot(4, 1);
    expect([g[0]!.x, g[0]!.y]).toEqual([spot.x, spot.y]);
    expect(g[0]!.emoji).toBe('⚔️');
  });
  it('il se rallume après `need` sorties, pas une de moins, et jamais avant 24 h', () => {
    const m = off(island(), C0);
    const need = m.archipel!.embers![C0]!.need;
    const late = NOW + 2 * DAY;
    expect(onMap(tick(sorties(m, late, need - 1), late + need * H), C0)).toBe(false);
    expect(onMap(tick(sorties(m, late, need), late + need * H), C0)).toBe(true);
    const fast = tick(sorties(m, NOW + 60_000, need, 60_000), NOW + 2 * H);
    expect(onMap(fast, C0)).toBe(false);
    expect(emberStatus(fast)[0]!.dueAt).toBe(NOW + EMBER.floorMs);
  });
  it('la fiche dit « s’éteint » sans parler de citadelle ni de cimetière', () => {
    const t = islandTargetLabel(island(), C0)!;
    expect(t.detail).toContain('ÉTEINT');
    expect(t.detail).toContain(`${EMBER.cemetery.min} à ${EMBER.cemetery.max}`);
    expect(t.detail).toContain('éteint, il n’envoie plus rien');
    expect(t.detail.toLowerCase()).not.toContain('citadelle');
    expect(t.detail).toContain('2 éteints ouvrent la forteresse');
  });
  it('les règles de l’île : fourchette, plancher, camp éteint muet — et rien de l’île 3', () => {
    const i4 = ISLANDS.find((i) => i.id === 4)!;
    const t = islandRules(i4)
      .map((r) => r.text)
      .join(' ');
    expect(t).toContain(`${EMBER.cemetery.min} à ${EMBER.cemetery.max}`);
    expect(t).toContain(`${Math.round(EMBER.floorMs / 3600_000)} h`);
    expect(t).toContain('Un camp éteint n’envoie rien');
    expect(t.toLowerCase()).not.toContain('citadelle des morts');
    expect(t).not.toContain(`${EMBER.keystone.min} à ${EMBER.keystone.max}`);
    const t3 = islandRules(ISLANDS.find((i) => i.id === 3)!)
      .map((r) => r.text)
      .join(' ');
    expect(t3).toContain('Citadelle des morts');
  });
  it('l’île 5 n’est pas touchée : ses sanctuaires se tiennent encore', () => {
    expect(EMBER.islands.has(5)).toBe(false);
    const m = island(5, 90);
    for (const c of camps(m)) expect(c.control!.razes).toBeUndefined();
    expect(emberGhosts(razeIslandTarget(m, C0, NOW), NOW)).toEqual([]);
    const after = takeObjective(m, C0, ['a'], NOW);
    expect(after.pois.find((p) => p.id === C0)!.control!.owner).toBe('player');
  });
});

describe('🕯️⚔️ île 4 : un camp éteint n’envoie ni armée ni convoi', () => {
  const seuil = (m: ExpeditionMap, scale: number, n = 0) =>
    sortieThreshold(m.seed, 'warlord', n, scale);
  const hourly = (k: number) => Array.from({ length: k }, (_, i) => NOW + (i + 1) * H);

  it('l’armée part d’un camp ALLUMÉ, au rythme des camps allumés (×3 avec un seul)', () => {
    const m0 = held(off(island(), C0, C1));
    expect(camps(m0).map((c) => c.id)).toEqual([C2]);
    const k3 = seuil(m0, 3);
    const times = hourly(k3);
    // Au seuil d'un camp (×3) : une sortie de moins, rien ; le compte plein, elle part.
    expect(
      fortOf(warlordRaids({ ...m0, departures: times.slice(0, -1) }, NOW + 5 * DAY)).attackAt,
    ).toBe(FAR);
    const m = warlordRaids({ ...m0, departures: times }, NOW + 5 * DAY);
    const f = fortOf(m);
    expect(f.attackAt!).toBeLessThan(FAR);
    const lit = camps(m0)[0]!;
    expect([f.raidFrom!.x, f.raidFrom!.y]).toEqual([lit.x, lit.y]);
  });
  it('au seuil des TROIS camps, un seul allumé ne fait rien partir', () => {
    const m0 = held(off(island(), C0, C1));
    const k1 = seuil(m0, 1);
    expect(seuil(m0, 3)).toBe(k1 * 3);
    const m = warlordRaids({ ...m0, departures: hourly(k1) }, NOW + 5 * DAY);
    expect(fortOf(m).attackAt).toBe(FAR);
  });
  it('tous les camps éteints : plus d’armée, plus de convoi, horloges effacées', () => {
    let m = held(off(island(), C0, C1, C2));
    m = warlordRaids({ ...m, departures: hourly(40) }, NOW + 5 * DAY);
    expect(m.archipel!.sorties?.warlord).toBeUndefined();
    expect(fortOf(m).attackAt).toBe(FAR);
    m = warlordConvoys(m, NOW + 5 * DAY);
    expect(m.archipel!.sorties?.convoy).toBeUndefined();
    expect(m.pois.some((p) => p.convoy)).toBe(false);
  });
  it('un convoi part d’un camp ALLUMÉ seulement', () => {
    const m0 = off(island(), C0, C1);
    const k = sortieThreshold(m0.seed, 'convoy', 0, 3);
    expect(k).toBeGreaterThanOrEqual(SORTIE_EVENTS.convoy.min * 3);
    const dep = Array.from({ length: k }, (_, i) => NOW + (i + 1) * H);
    const m = warlordConvoys({ ...m0, departures: dep }, dep[k - 1]!);
    const c = m.pois.find((p) => p.convoy)!;
    const lit = camps(m0)[0]!;
    expect([c.from!.x, c.from!.y]).toEqual([lit.x, lit.y]);
  });
  it('éteindre le dernier camp retire le convoi en route ; rallumé, tout repart de zéro', () => {
    const m0 = off(island(), C0, C1);
    const k = sortieThreshold(m0.seed, 'convoy', 0, 3);
    const dep = Array.from({ length: k }, (_, i) => NOW + (i + 1) * H);
    let m = warlordConvoys({ ...m0, departures: dep }, dep[k - 1]!);
    expect(m.pois.some((p) => p.convoy)).toBe(true);
    // Le dernier camp s'éteint : plus aucun camp, le convoi disparaît.
    const t = dep[k - 1]! + H;
    m = tick(razeIslandTarget(m, C2, t), t);
    expect(m.pois.some((p) => p.convoy)).toBe(false);
    expect(m.archipel!.convoys).toBeUndefined();
    // Des sorties pendant que tout est éteint ne comptent pas pour la suite.
    const dark = sorties(m, t + H, 30);
    const e = Math.max(...Object.values(dark.archipel!.embers!).map((x) => x.need));
    expect(e).toBeGreaterThan(0);
    const back = warlordRaids(tick(dark, t + 2 * H), t + 2 * H);
    expect(back.archipel!.sorties?.warlord).toBeUndefined();
  });
  it('rallumé, un camp redonne un compteur neuf (les sorties sombres ne comptent pas)', () => {
    let m = held(off(island(), C0, C1, C2));
    const maxNeed = Math.max(...Object.values(m.archipel!.embers!).map((x) => x.need));
    const t1 = NOW + 3 * DAY;
    m = tick(sorties(m, t1, maxNeed), t1 + maxNeed * H);
    const t2 = t1 + (maxNeed + 1) * H;
    m = tick(m, t2);
    expect(camps(m).length).toBeGreaterThan(0);
    const clock = m.archipel!.sorties?.warlord;
    expect(clock).toBeDefined();
    expect(clock!.charge).toBe(0);
    expect(clock!.fired).toBe(0);
  });
});

describe('🕯️⚔️ île 4 : forteresse et pacification', () => {
  it('abattue, elle pacifie pour de bon : les camps encore allumés tombent, plus de braise', () => {
    let m = razeIslandTarget(island(), C0, NOW);
    m = razeIslandTarget(m, FORTRESS_ID, NOW + H);
    expect(islandPacified(m)).toBe(true);
    expect(m.archipel!.embers).toBeUndefined();
    expect(camps(m)).toEqual([]);
    m = tick(sorties(m, NOW + 2 * DAY, 40), NOW + 30 * DAY);
    expect(camps(m)).toEqual([]);
    expect(emberStatus(m)).toEqual([]);
  });
  it('📏 mesuré (40 cartes) : après deux camps éteints, elle reste ouverte ≥ 5 sorties et ≥ 22 h', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let m = createMap(seed, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(4));
      m = ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
      m = razeIslandTarget(m, C0, NOW);
      m = razeIslandTarget({ ...m, departures: [NOW + H] }, C1, NOW + H);
      m = tick(m, NOW + H);
      expect(islandConquest(m)!.locked).toBe(false);
      let deps = [NOW + H];
      let t = NOW + H;
      let n = 0;
      // Un joueur très actif : une sortie par heure, jusqu'au rallumage du premier camp.
      while (!islandConquest(m)!.locked && n < 100) {
        t += H;
        deps = [...deps, t];
        m = tick({ ...m, departures: deps }, t);
        n++;
      }
      expect(n).toBeGreaterThanOrEqual(5);
      expect(t - (NOW + H)).toBeGreaterThanOrEqual(EMBER.floorMs - H);
    }
  });
  it('un camp rallumé la reverrouille (deux éteints l’ouvrent)', () => {
    const m = off(island(), C0);
    expect(islandConquest(m)!.locked).toBe(true);
    expect(islandConquest(off(island(), C0, C1))!.locked).toBe(false);
  });
});

describe('🕯️⚔️ île 4 : les parties existantes', () => {
  /** Un camp de guerre TENU sous l'ancienne règle (compté abattu, garnison dedans). */
  function legacy(garrison: string[]): ExpeditionMap {
    const m = razeIslandTarget(island(), C0, NOW - 50 * H);
    const enemy = island().pois.find((p) => p.id === C0)!;
    const { razes: _r, ...c } = enemy.control!;
    void _r;
    return {
      ...m,
      archipel: { ...m.archipel!, embers: undefined },
      pois: [...m.pois, { ...enemy, control: { ...c, owner: 'player', garrison } }],
    };
  }
  it('un camp tenu avec garnison : le store le rappelle ; vide, il s’éteint à compteur neuf', () => {
    const m = legacy(['a', 'b']);
    expect(heldRazedObjectives(m).map((p) => p.id)).toEqual([C0]);
    expect(onMap(tick(m, NOW), C0)).toBe(true);
    const empty = tick(legacy([]), NOW);
    expect(onMap(empty, C0)).toBe(false);
    expect(empty.archipel!.embers![C0]!.at).toBe(NOW);
    expect(emberGhosts(empty, NOW).map((g) => g.id)).toEqual([C0]);
    expect(tick(empty, NOW + H)).toBe(empty);
  });
  it('« Répartir » ne propose aucune place sur un camp tenu d’avant ni sur un camp éteint', () => {
    const champ = (n: string): Adventurer => ({
      id: n,
      name: n,
      seed: 1,
      path: [],
      level: 30,
      xp: 0,
      championId: CHAMPIONS[0]!.id,
      copies: 1,
      skills: [],
    });
    const out = buildDeployment({
      map: tick(legacy([]), NOW),
      atBase: [champ('a'), champ('b')],
      garrisons: new Map<string, Adventurer[]>(),
      hero: null,
      road: { advGear: [] },
      heroLevel: 30,
      travelMult: 1,
      outpostLevel: 1,
    })!;
    expect(out.spots.map((s) => s.id)).not.toContain(C0);
    const held0 = buildDeployment({
      map: legacy([]),
      atBase: [champ('a'), champ('b')],
      garrisons: new Map<string, Adventurer[]>(),
      hero: null,
      road: { advGear: [] },
      heroLevel: 30,
      travelMult: 1,
      outpostLevel: 1,
    })!;
    expect(held0.spots.map((s) => s.id)).not.toContain(C0);
  });
  it('une forteresse déjà abattue avec un camp debout (partie d’avant) pacifie l’île', () => {
    const m0 = island();
    const old: ExpeditionMap = {
      ...m0,
      archipel: { ...m0.archipel!, destroyed: [C0, C1, FORTRESS_ID] },
    };
    const m = tick(old, NOW);
    expect(islandPacified(m)).toBe(true);
    expect(camps(m)).toEqual([]);
    expect(m.archipel!.embers).toBeUndefined();
    expect(tick(m, NOW + H)).toBe(m);
  });
  it('la migration ne touche ni une île sans braises ni une île déjà pacifiée', () => {
    const m1 = island(1, 10);
    const d1: ExpeditionMap = {
      ...m1,
      archipel: { ...m1.archipel!, destroyed: [FORTRESS_ID] },
    };
    expect(islandPacified(ensureIslandConquest(d1, NOW, 10))).toBe(false);
  });
});
