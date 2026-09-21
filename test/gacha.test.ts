import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  CHAMPIONS,
  CHAMPION_BY_ID,
  PULL_GRADES,
  championsOf,
  type PullGrade,
} from '@/data/champions';
import {
  ADV_LEVEL_K,
  AWAKEN,
  awakenLevel,
  advAvailable,
  advUnavailableReason,
  type Adventurer,
  awakenMult,
  championBudget,
  championStats,
  GRADE_BUDGET,
  RARITY_BUDGET,
} from '@/lib/adventurers';
import { prestigeRankIndex } from '@/lib/items';
import {
  GACHA,
  GACHA_RATES,
  TOP_GRADE,
  FLOOR_GRADE,
  emptyPity,
  pullGrade,
  pullsPerDay,
  grantChampion,
  wipeLegacyAdventurers,
  OVERFLOW_MANA,
  topRate,
  pullChampion,
  gachaOdds,
  pullMany,
  multiPullCost,
} from '@/lib/gacha';

/** Tire `n` fois et rend la suite des lettres obtenues. */
function serie(n: number, seed = 7919): PullGrade[] {
  const rng = mulberry32(seed);
  let pity = emptyPity();
  const out: PullGrade[] = [];
  for (let i = 0; i < n; i++) {
    const r = pullGrade(rng, pity);
    pity = r.pity;
    out.push(r.grade);
  }
  return out;
}
const rank = (g: PullGrade) => PULL_GRADES.indexOf(g);

describe('les taux (refonte S / A / B)', () => {
  it('⚠️ SOMMENT À 1 — sinon le reliquat irait en silence à la dernière entrée', () => {
    const s = PULL_GRADES.reduce((a, g) => a + GACHA_RATES[g], 0);
    expect(s).toBeCloseTo(1, 9);
  });

  it('sont ceux du genre : S 0,6 %, A 5,1 %, le reste en B', () => {
    expect(GACHA_RATES.S).toBe(0.006);
    expect(GACHA_RATES.A).toBe(0.051);
    expect(TOP_GRADE).toBe('S');
    expect(FLOOR_GRADE).toBe('A');
  });

  it('DÉCROISSENT strictement : plus c’est haut, moins ça tombe', () => {
    expect(GACHA_RATES.B).toBeGreaterThan(GACHA_RATES.A);
    expect(GACHA_RATES.A).toBeGreaterThan(GACHA_RATES.S);
  });
});

describe('le pity', () => {
  it('⚠️ LA RAMPE ATTEINT 1 PILE AU HARD PITY — pas de saut greffé à côté', () => {
    expect(topRate(0)).toBe(GACHA_RATES.S);
    expect(topRate(GACHA.softPityStart - 1)).toBe(GACHA_RATES.S);
    expect(topRate(GACHA.softPityStart)).toBeGreaterThan(GACHA_RATES.S);
    expect(topRate(GACHA.hardPity - 1)).toBe(1);
    expect(topRate(GACHA.hardPity - 2)).toBeLessThan(1);
  });

  it('⚠️ ON N’ATTEND JAMAIS PLUS DE `hardPity` TIRAGES un S', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let depuis = 0;
      for (const g of serie(600, seed * 131)) {
        depuis = g === 'S' ? 0 : depuis + 1;
        expect(depuis).toBeLessThan(GACHA.hardPity);
      }
    }
  });

  it('⚠️ ON N’ATTEND JAMAIS PLUS DE `minorPity` TIRAGES un A ou mieux', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let depuis = 0;
      for (const g of serie(600, seed * 977)) {
        depuis = rank(g) >= rank('A') ? 0 : depuis + 1;
        expect(depuis).toBeLessThan(GACHA.minorPity);
      }
    }
  });

  it('⚠️ LE 10ᵉ TIRAGE garanti n’est « mieux qu’un A » qu’au taux du S — comme dans le genre', () => {
    // L'ancien plancher re-tirait dans toute la tranche haute et la DÉPASSAIT 45 fois sur
    // 100 : c'est ce qui épuisait la collection. Ici, sur un tirage garanti, la part des S
    // ne vaut que le taux du S à cet instant (0,6 % hors pity).
    const rng = mulberry32(5);
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = pullGrade(rng, { sinceTop: 0, sinceFloor: GACHA.minorPity - 1 });
      expect(r.grade).not.toBe('B');
      if (r.grade === 'S') s++;
    }
    expect(s / N).toBeLessThan(0.02);
  });

  it('MORD VRAIMENT : le taux effectif du S est celui du genre (~1,6 %)', () => {
    let n = 0;
    let s = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const out = serie(700, seed * 7919);
      n += out.length;
      s += out.filter((g) => g === 'S').length;
    }
    // Mesuré en P0 : 1,56 %. Genshin ≈ 1,6 %.
    expect(s / n).toBeGreaterThan(0.013);
    expect(s / n).toBeLessThan(0.019);
  });

  it('DEUX compteurs indépendants : décrocher un A ne remet pas le grand pity à zéro', () => {
    const r = pullGrade(() => 0.01, { sinceTop: 40, sinceFloor: 3 });
    expect(r.grade).toBe('A');
    expect(r.pity).toEqual({ sinceTop: 41, sinceFloor: 0 });
  });

  it('⚠️ UN S COMPTE COMME « A OU MIEUX » : il remet AUSSI le compteur du A à zéro', () => {
    // Sinon un S tombé au 9ᵉ tirage laisserait le 10ᵉ garanti A — deux gains d'affilée,
    // alors que la garantie dit « un A OU MIEUX tous les 10 ».
    const r = pullGrade(() => 0, { sinceTop: 40, sinceFloor: 8 });
    expect(r.grade).toBe('S');
    expect(r.pity).toEqual({ sinceTop: 0, sinceFloor: 0 });
  });

  it('est PUR : il ne mute pas l’état qu’on lui donne', () => {
    const p = { sinceTop: 3, sinceFloor: 2 };
    pullGrade(mulberry32(1), p);
    expect(p).toEqual({ sinceTop: 3, sinceFloor: 2 });
  });
});

describe('⚠️ LA CALIBRATION — elle tient au débit de mana des failles', () => {
  /** Débit MESURÉ en v0.936 (`riftManaDebit`), en fermant une faille par jour. */
  const DEBIT: [number, number][] = [
    [12, 63],
    [30, 91],
    [60, 157],
    [100, 240],
  ];
  function sParAn(manaPerDay: number, runs = 12): number {
    const n = Math.round(pullsPerDay(manaPerDay) * 365);
    let tot = 0;
    for (let s = 1; s <= runs; s++) tot += serie(n, s * 7919).filter((g) => g === 'S').length;
    return tot / runs;
  }

  it('sur la plage RÉALISTE (niveaux 12 à 60), 8 à 20 S par an', () => {
    for (const [, mana] of DEBIT.slice(0, 3)) {
      const t = sParAn(mana);
      expect(t).toBeGreaterThan(8);
      expect(t).toBeLessThan(20);
    }
  });

  it('⚠️ LE TIRAGE GRATUIT PORTE LE PLANCHER : même sans une seule faille, on joue', () => {
    expect(pullsPerDay(0)).toBe(GACHA.freePullsPerDay);
    expect(sParAn(0)).toBeGreaterThan(3);
  });

  it('le mana RESTE le levier principal : jouer double au moins les tirages', () => {
    expect(pullsPerDay(91)).toBeGreaterThan(pullsPerDay(0) * 1.5);
  });
});

describe('🏅 le budget d’un champion (S / A)', () => {
  it('⚠️ UN S VAUT EXACTEMENT LE BUDGET DE SON RANG — l’étalon des combats ne bouge pas', () => {
    for (const L of [1, 12, 30, 60, 100])
      expect(championBudget('S', L)).toBe(RARITY_BUDGET[prestigeRankIndex(L)]);
  });

  it('⚠️ UN A À ÉVEIL COMPLET ≈ UN S NU — le contrat du genre (4★ C6 ≈ 5★ C0)', () => {
    const a6 = GRADE_BUDGET.A * awakenMult(AWAKEN.max);
    expect(a6).toBeGreaterThan(0.95);
    expect(a6).toBeLessThan(1.1);
  });

  it('⚠️ À ÉVEIL ÉGAL, LE S GAGNE TOUJOURS', () => {
    expect(GRADE_BUDGET.S).toBeGreaterThan(GRADE_BUDGET.A);
  });

  it('⚠️ LE NIVEAU EST LE PLAFOND — le budget suit le rang, pas la lettre', () => {
    let prev = 0;
    for (let L = 1; L <= 100; L++) {
      const b = championBudget('S', L);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
    // Un S tiré au niveau 1 n'a que le budget du rang Bronze.
    expect(championBudget('S', 1)).toBe(RARITY_BUDGET[0]);
  });

  it('⚠️ UN A INVESTI BAT UN S NU — le niveau domine la lettre', () => {
    expect(championBudget('A', 100) * (1 + ADV_LEVEL_K * 99)).toBeGreaterThan(
      championBudget('S', 1),
    );
  });
});

describe('🎰 tirer un CHAMPION', () => {
  function tirages(n: number, seed = 3) {
    const rng = mulberry32(seed);
    let p = emptyPity();
    const out: ReturnType<typeof pullChampion>[] = [];
    for (let i = 0; i < n; i++) {
      const r = pullChampion(rng, p);
      p = r.pity;
      out.push(r);
    }
    return out;
  }

  it('⚠️ UN B N’EST PAS UN CHAMPION — le fond du tirage est une pièce', () => {
    const out = tirages(300);
    for (const r of out) {
      if (r.grade === 'B') expect(r.champion).toBeNull();
      else expect(r.champion!.grade).toBe(r.grade);
    }
    expect(out.some((r) => r.grade === 'B')).toBe(true);
  });

  it('⚠️ UNIFORME DANS LA LETTRE — c’est ce qui fixe la vitesse de l’Éveil', () => {
    const cpt = new Map<string, number>();
    for (const r of tirages(40000, 11))
      if (r.grade === 'A') cpt.set(r.champion!.id, (cpt.get(r.champion!.id) ?? 0) + 1);
    const vals = championsOf('A').map((c) => cpt.get(c.id) ?? 0);
    const moy = vals.reduce((a, b) => a + b, 0) / vals.length;
    for (const v of vals) expect(Math.abs(v - moy) / moy).toBeLessThan(0.3);
  });

  it('est DÉTERMINISTE : même graine, même champion', () => {
    const a = tirages(50, 21).map((r) => r.champion?.id ?? r.grade);
    const b = tirages(50, 21).map((r) => r.champion?.id ?? r.grade);
    expect(a).toEqual(b);
  });

  it('tout le roster finit par tomber — aucun champion n’est intirable', () => {
    const vus = new Set(
      tirages(30000, 5)
        .map((r) => r.champion?.id)
        .filter(Boolean),
    );
    for (const c of CHAMPIONS) expect(vus.has(c.id), c.name).toBe(true);
  });
});

describe('🏅 les stats d’un champion', () => {
  const total = (s: { puissance: number; endurance: number; agilite: number }) =>
    s.puissance + s.endurance + s.agilite;

  it('le TOTAL vaut le budget × la courbe de niveau', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      for (const c of [CHAMPIONS[0]!, CHAMPIONS[20]!, CHAMPIONS[31]!]) {
        const attendu = championBudget(c.grade, L) * (1 + ADV_LEVEL_K * (L - 1));
        expect(Math.abs(total(championStats(c, L)) - attendu), `${c.name} niv ${L}`).toBeLessThan(
          2,
        );
      }
    }
  });

  it('⚠️ LA RÉPARTITION SUIT LA FORME — sinon la forme écrite ne servirait à rien', () => {
    for (const c of CHAMPIONS) {
      const s = championStats(c, 60);
      const t = total(s);
      const f = c.form.p + c.form.e + c.form.a;
      expect(Math.abs(s.puissance / t - c.form.p / f), c.name).toBeLessThan(0.02);
      expect(Math.abs(s.agilite / t - c.form.a / f), c.name).toBeLessThan(0.02);
      if (c.form.a === 0) expect(s.agilite, c.name).toBe(0);
    }
  });

  it('✨ l’ÉVEIL multiplie exactement le barème, et il est plafonné', () => {
    const c = CHAMPIONS[15]!;
    const nu = total(championStats(c, 60, 1));
    for (let copies = 1; copies <= AWAKEN.max + 1; copies++) {
      const attendu = nu * awakenMult(awakenLevel(copies));
      expect(
        Math.abs(total(championStats(c, 60, copies)) - attendu),
        `${copies} copies`,
      ).toBeLessThan(2);
    }
    expect(total(championStats(c, 60, 50))).toBe(total(championStats(c, 60, AWAKEN.max + 1)));
  });

  it('⚠️ UN NIVEAU ABERRANT NE RETOURNE JAMAIS LES STATS — la symétrie avec `advStats`', () => {
    const c = CHAMPION_BY_ID.get(CHAMPIONS[3]!.id)!;
    for (const L of [0, -5, -10, -100]) {
      const s = championStats(c, L);
      for (const v of [s.puissance, s.endurance, s.agilite])
        expect(v, `niveau ${L}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('🏅 CE QU_UN TIRAGE AJOUTE AU VIVIER', () => {
  const champ = CHAMPIONS[0]!;
  const autre = CHAMPIONS.find((c) => c.id !== champ.id)!;
  const legacy = (id: string): Adventurer => ({
    id,
    name: 'Recrue',
    seed: 1,
    path: ['guerrier'],
    level: 5,
    xp: 0,
  });

  it('un champion neuf entre au vivier — identité, aucun chemin', () => {
    const g = grantChampion([], champ, { id: 'a1' });
    expect(g.advs).toHaveLength(1);
    expect(g.advs[0]!.championId).toBe(champ.id);
    // ⚠️ Un champion a une IDENTITÉ, pas un chemin (v0.939) : un `path` non vide le ferait
    // retomber dans l'arbre des classes, et les doublons redeviendraient impossibles.
    expect(g.advs[0]!.path).toEqual([]);
    expect(g.advs[0]!.copies).toBe(1);
    expect(g.duplicate).toBe(false);
  });

  it('⚠️ TOUT CHAMPION TIRÉ EST UTILISABLE TOUT DE SUITE — plus aucun banc', () => {
    // ⚠️ RÉÉCRIT (v0.958). Le tirage engageait « tant qu'il reste une place » et mettait
    // les suivants EN COLLECTION : un champion pouvait donc être mort-né, l'inverse de ce
    // qu'un gacha promet. Le plafond du Panthéon borne désormais l'ENGAGEMENT — combien
    // partent ensemble, combien tiennent le rempart — et se lit dans `engageCap`.
    const plein = grantChampion([], champ, { id: 'a1' }).advs;
    const second = grantChampion(plein, autre, { id: 'a2' });
    expect(advUnavailableReason(second.advs[1]!, 0)).toBeNull();
    expect(advAvailable(second.advs[1]!, 0)).toBe(true);
  });

  it('⚠️ un aventurier LEGACY est disponible lui aussi', () => {
    // Il n'a pas de Panthéon : le priver de mission serait le punir d'avoir existé avant
    // la bascule. Les deux systèmes cohabitent le temps de celle-ci.
    const g = grantChampion([legacy('v1'), legacy('v2')], champ, { id: 'a1' });
    expect(g.advs).toHaveLength(3);
    expect(advAvailable(legacy('v1'), 0)).toBe(true);
  });

  it('un doublon RÉVEILLE, il ne crée pas un second aventurier', () => {
    let advs = grantChampion([], champ, { id: 'a1' }).advs;
    const g = grantChampion(advs, champ, { id: 'a2' });
    expect(g.advs).toHaveLength(1);
    expect(g.copies).toBe(2);
    expect(g.duplicate).toBe(true);
    expect(awakenLevel(g.copies), 'la PREMIÈRE copie est le champion').toBe(1);
    expect(g.manaBack).toBe(0);
    // ⚠️ Un doublon ne change QUE le compte d'exemplaires : il ne doit toucher ni
    // l'identité, ni le niveau, ni l'XP accumulée de celui qu'on réveille.
    advs = g.advs;
    expect(advs[0]!.championId).toBe(champ.id);
    expect(advs[0]!.copies).toBe(2);
  });

  it('⚠️ la copie DE TROP ne gonfle pas le compteur, elle se convertit', () => {
    // Un compteur qui monte sans que l'Éveil bouge se lit comme une panne.
    let advs = grantChampion([], champ, { id: 'a1' }).advs;
    let last = null as ReturnType<typeof grantChampion> | null;
    for (let i = 0; i < 10; i++) {
      last = grantChampion(advs, champ, { id: 'x' });
      advs = last.advs;
    }
    expect(advs[0]!.copies, 'plafonné au dernier cran').toBe(AWAKEN.max + 1);
    expect(awakenLevel(advs[0]!.copies!)).toBe(AWAKEN.max);
    expect(last!.manaBack, 'un tirage n_est jamais perdu').toBe(OVERFLOW_MANA);
  });

  it('⚠️ une conversion ne peut JAMAIS être rentable', () => {
    // Sinon farmer le même commun deviendrait une source de mana, et le gacha
    // s'alimenterait lui-même.
    expect(OVERFLOW_MANA).toBeLessThan(GACHA.pullCost);
  });
});

describe('🗑️ LE WIPE DES AVENTURIERS', () => {
  const champ = CHAMPIONS[0]!;
  const legacy = (id: string): Adventurer => ({
    id,
    name: 'Recrue',
    seed: 1,
    path: ['guerrier'],
    level: 9,
    xp: 0,
  });
  const heros = (id: string): Adventurer => ({
    id,
    name: champ.name,
    seed: 1,
    path: [],
    championId: champ.id,
    copies: 1,
    level: 1,
    xp: 0,
  });

  it('les recrues d_avant s_en vont, les champions restent', () => {
    const w = wipeLegacyAdventurers([legacy('v1'), heros('c1'), legacy('v2')]);
    expect(w.advs.map((a) => a.id)).toEqual(['c1']);
  });

  it('⚠️ COMPENSÉ À HAUTEUR D_UN TIRAGE CHACUN — dans la monnaie de ce qui les remplace', () => {
    // Pas en or : on rend de quoi invoquer autant de champions qu'on perd de recrues.
    const w = wipeLegacyAdventurers([legacy('v1'), legacy('v2'), legacy('v3')]);
    expect(w.mana).toBe(3 * GACHA.pullCost);
  });

  it('⚠️ IDEMPOTENT — sinon on compenserait à chaque chargement', () => {
    const apres = wipeLegacyAdventurers([legacy('v1'), heros('c1')]);
    const encore = wipeLegacyAdventurers(apres.advs);
    expect(encore.mana).toBe(0);
    expect(encore.advs).toBe(apres.advs);
  });

  it('un vivier qui n_a que des champions n_est pas touché du tout', () => {
    const advs = [heros('c1')];
    const w = wipeLegacyAdventurers(advs);
    expect(w.advs, 'la MÊME référence').toBe(advs);
    expect(w.mana).toBe(0);
  });
});

describe('📊 CE QUE L’ÉCRAN DIT DES CHANCES (v0.966)', () => {
  it('annonce TOUTES les lettres, et exactement la table', () => {
    const o = gachaOdds(emptyPity());
    expect(o.rates.map((r) => r.grade)).toEqual([...PULL_GRADES]);
    for (const r of o.rates) expect(r.pct).toBeCloseTo(GACHA_RATES[r.grade] * 100, 9);
  });

  it('dit où en est SON pity, jamais des compteurs nus', () => {
    const o = gachaOdds({ sinceTop: 30, sinceFloor: 7 });
    expect(o.nextFloorIn).toBe(GACHA.minorPity - 7);
    expect(o.nextTopIn).toBe(GACHA.hardPity - 30);
    expect(o.floorEvery).toBe(GACHA.minorPity);
  });

  it('la chance du S SUIT le pity majeur', () => {
    expect(gachaOdds({ sinceTop: 0, sinceFloor: 0 }).topPct).toBeCloseTo(0.6, 9);
    expect(gachaOdds({ sinceTop: GACHA.hardPity - 1, sinceFloor: 0 }).topPct).toBe(100);
  });
});

describe('🎰 LE LOT DE 10 (v0.968)', () => {
  it('⚠️ 9 PAYÉS POUR 10, et le prix est DÉRIVÉ du prix unitaire', () => {
    expect(multiPullCost()).toBe(GACHA.pullCost * GACHA.multiPaid);
    expect(multiPullCost(200)).toBe(200 * GACHA.multiPaid);
    expect(multiPullCost(1)).toBe(GACHA.multiPaid);
    expect(GACHA.multiPaid).toBeLessThan(GACHA.multiCount);
    const remise = 1 - GACHA.multiPaid / GACHA.multiCount;
    expect(remise).toBeGreaterThan(0);
    expect(remise).toBeLessThanOrEqual(0.1);
  });

  it('⚠️ LE PITY S’ENCHAÎNE D’UN TIRAGE AU SUIVANT DANS LE LOT', () => {
    const lot = pullMany(mulberry32(7), emptyPity(), 10);
    expect(lot.results).toHaveLength(10);
    // Un lot de 10 depuis un pity neuf contient au moins un A, par construction.
    expect(
      lot.results.some((r) => r.grade !== 'B'),
      'aucun A ni S dans un lot de 10',
    ).toBe(true);
    const seul = pullMany(mulberry32(7), emptyPity(), 1);
    expect(lot.pity).not.toEqual(seul.pity);
  });

  it('⚠️ C’EST LA MÊME LOTERIE QU’À L’UNITÉ — un lot n’a pas ses propres taux', () => {
    let p = emptyPity();
    const rng = mulberry32(99);
    const un: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = pullChampion(rng, p);
      p = r.pity;
      un.push(r.champion?.id ?? r.grade);
    }
    const lot = pullMany(mulberry32(99), emptyPity(), 10);
    expect(lot.results.map((r) => r.champion?.id ?? r.grade)).toEqual(un);
    expect(lot.pity).toEqual(p);
  });

  it('un lot de taille nulle, négative ou DÉCIMALE ne fait rien tomber de trop', () => {
    expect(pullMany(mulberry32(1), emptyPity(), 0).results).toEqual([]);
    expect(pullMany(mulberry32(1), emptyPity(), -3).results).toEqual([]);
    expect(pullMany(mulberry32(1), emptyPity(), 2.7).results).toHaveLength(2);
  });
});
