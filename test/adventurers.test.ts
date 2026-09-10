import { describe, it, expect } from 'vitest';
import {
  ADV_CLASSES,
  PROMO_LEVELS,
  PROMO_CHOICES,
  STRATUM_BUDGET,
  advClass,
  advRarity,
  advStats,
  advSignatures,
  canPromote,
  classChoices,
  classRarity,
  eligibleClasses,
  nextStratum,
  pathTags,
  promoLevel,
  advRankProgress,
  advNextStarLevel,
  advXpToNext,
  type Adventurer,
} from '@/lib/adventurers';
import { RANK_ORDER } from '@/lib/items';
import { characterRank } from '@/lib/characterRank';

const make = (over: Partial<Adventurer> = {}): Adventurer => ({
  id: 'a1',
  name: 'Test',
  seed: 12345,
  path: ['guerrier'],
  level: 1,
  xp: 0,
  ...over,
});
const roots = ADV_CLASSES.filter((c) => c.stratum === 0);

/** Tous les chemins atteignables jusqu'à `maxStratum`, en suivant les ÉLIGIBLES (pas le
 *  tirage) — c'est la forme réelle de l'arbre, indépendamment de la chance. */
function allPaths(maxStratum: number): string[][] {
  let paths: string[][] = roots.map((c) => [c.id]);
  for (let s = 1; s <= maxStratum; s++) {
    const next: string[][] = [];
    for (const p of paths) for (const c of eligibleClasses(p, s)) next.push([...p, c.id]);
    paths = next;
  }
  return paths;
}

describe('vivier de classes — cohérence de l’arbre', () => {
  it('les ids sont uniques', () => {
    const ids = ADV_CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('la rareté DÉCOULE de la strate — une seule échelle dans tout le jeu', () => {
    for (const c of ADV_CLASSES) expect(classRarity(c)).toBe(RANK_ORDER[c.stratum]);
  });
  it('le budget d’une strate suit le PAS DE RARETÉ des objets (ratio 1,219)', () => {
    // Sans ça, « épique » ne voudrait pas dire la même chose pour une classe et un objet.
    for (let i = 1; i < STRATUM_BUDGET.length; i++) {
      const ratio = STRATUM_BUDGET[i]! / STRATUM_BUDGET[i - 1]!;
      expect(ratio).toBeGreaterThan(1.1);
      expect(ratio).toBeLessThan(1.35);
    }
  });
  it('les racines n’ont AUCUN prérequis, les autres en ont tous un', () => {
    for (const c of ADV_CLASSES) {
      if (c.stratum === 0) expect(c.req ?? []).toEqual([]);
      else expect((c.req ?? []).length).toBeGreaterThan(0);
    }
  });
  it('tout prérequis est un tag réellement produit par une classe plus basse', () => {
    for (const c of ADV_CLASSES) {
      for (const t of c.req ?? []) {
        const produit = ADV_CLASSES.some((o) => o.stratum < c.stratum && o.tags.includes(t));
        expect(produit, `${c.id} exige « ${t} » que personne ne produit avant lui`).toBe(true);
      }
    }
  });
});

describe('⚠️ FILIATION — un Guerrier ne se voit jamais proposer Clerc', () => {
  it('aucune proposition ne sort de la lignée du chemin', () => {
    // La condition posée pour accepter le TIRAGE : la surprise, oui, mais pas l'absurde.
    for (const p of allPaths(2)) {
      const have = pathTags(p);
      for (let s = 1; s <= 3; s++) {
        for (const c of eligibleClasses(p, s)) {
          for (const t of c.req ?? []) {
            expect(have.has(t), `${p.join('→')} ne devrait pas ouvrir ${c.id}`).toBe(true);
          }
        }
      }
    }
  });
  it('le cas nommé : un Guerrier n’accède ni à Clerc, ni à Pyromancien', () => {
    const g = make({ path: ['guerrier'] });
    const ids = classChoices(g, 1).map((c) => c.id);
    expect(ids).not.toContain('clerc');
    expect(ids).not.toContain('pyromancien');
    // …et un Mage n'accède pas aux classes d'épée.
    const m = make({ path: ['mage'] });
    const mids = classChoices(m, 1).map((c) => c.id);
    expect(mids).not.toContain('epeiste');
    expect(mids).not.toContain('brute');
  });
});

describe('⚠️ AUCUN CUL-DE-SAC — chaque lignée mène quelque part', () => {
  it('toute racine offre au moins PROMO_CHOICES orientations', () => {
    for (const r of roots) {
      expect(eligibleClasses([r.id], 1).length, r.id).toBeGreaterThanOrEqual(PROMO_CHOICES);
    }
  });
  it('tout chemin garde au moins 2 offres jusqu’à la strate 3', () => {
    // Une lignée qui n'aurait qu'UNE suite ne serait plus un choix, juste un couloir.
    for (let s = 2; s <= 3; s++) {
      for (const p of allPaths(s - 1)) {
        expect(eligibleClasses(p, s).length, `${p.join('→')} @S${s}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('le tirage des propositions', () => {
  it('est DÉTERMINISTE : on ne relance pas le dé en rechargeant l’app', () => {
    const a = make({ seed: 777 });
    const first = classChoices(a, 1).map((c) => c.id);
    for (let i = 0; i < 20; i++) expect(classChoices(a, 1).map((c) => c.id)).toEqual(first);
  });
  it('VARIE d’un aventurier à l’autre — deux Guerriers n’ont pas le même destin', () => {
    const vus = new Set(
      Array.from({ length: 30 }, (_, i) =>
        classChoices(make({ seed: i * 977 + 3 }), 1)
          .map((c) => c.id)
          .join(','),
      ),
    );
    expect(vus.size).toBeGreaterThan(1);
  });
  it('ne propose jamais deux fois la même classe, ni une déjà prise', () => {
    for (const p of allPaths(1)) {
      const a = make({ path: p, seed: 42 });
      const ids = classChoices(a, 2).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(p).not.toContain(id);
    }
  });
  it('ne REPROPOSE jamais une classe du chemin, même sur une strate déjà franchie', () => {
    // ⚠️ Garde DÉFENSIF : avec un chemin bien formé les strates avancent une par une,
    // donc le cas ne peut pas survenir — et une mutation qui retire le garde passait
    // inaperçue. Les chemins venant d’un JSONB, on force ici la situation pour que le
    // garde soit réellement couvert.
    const a = make({ path: ['guerrier', 'epeiste', 'duelliste'], seed: 5 });
    const ids = classChoices(a, 2).map((c) => c.id);
    expect(ids).not.toContain('duelliste');
    expect(ids.length).toBeGreaterThan(0);
  });
  it('rend au plus PROMO_CHOICES offres', () => {
    for (const p of allPaths(1)) {
      expect(classChoices(make({ path: p }), 2).length).toBeLessThanOrEqual(PROMO_CHOICES);
    }
  });
});

describe('promotion — deux verrous, et le sport ne doit pas être le frein habituel', () => {
  it('exige le niveau de l’aventurier ET celui de la Guilde', () => {
    const a = make({ path: ['guerrier'], level: 1 });
    const need = promoLevel(nextStratum(a))!;
    expect(need).toBe(PROMO_LEVELS[1]);
    expect(canPromote({ ...a, level: need - 1 }, 99)).toBe(false); // pas assez travaillé
    expect(canPromote({ ...a, level: need }, need - 1)).toBe(false); // Guilde trop basse
    expect(canPromote({ ...a, level: need }, need)).toBe(true);
  });
  it('les 3 premières promotions tombent tôt — c’est ce qui accroche', () => {
    expect(PROMO_LEVELS[0]).toBe(1);
    expect(PROMO_LEVELS[2]).toBeLessThanOrEqual(3);
  });
  it('l’arbre s’arrête à 8 strates, comme les 8 raretés', () => {
    expect(PROMO_LEVELS.length).toBe(RANK_ORDER.length);
    expect(promoLevel(RANK_ORDER.length)).toBeNull();
    const fini = make({ path: allPaths(0)[0]!, level: 99 });
    expect(canPromote({ ...fini, path: Array(8).fill('guerrier') }, 99)).toBe(false);
  });
});

describe('stats et rareté', () => {
  it('la rareté se DÉDUIT du chemin — elle ne peut pas mentir', () => {
    expect(advRarity(make({ path: ['guerrier'] }))).toBe(RANK_ORDER[0]);
    expect(advRarity(make({ path: ['guerrier', 'epeiste'] }))).toBe(RANK_ORDER[1]);
    expect(advRarity(make({ path: ['guerrier', 'epeiste', 'duelliste'] }))).toBe(RANK_ORDER[2]);
  });
  it('la FORME des stats suit la classe : un Homme d’armes encaisse, un Mage frappe', () => {
    const garde = advStats(make({ path: ['homme_armes'] }));
    const mage = advStats(make({ path: ['mage'] }));
    expect(garde.endurance).toBeGreaterThan(garde.puissance);
    expect(mage.puissance).toBeGreaterThan(mage.endurance);
  });
  it('⚠️ le NIVEAU domine la rareté : l’élevé bat le fraîchement promu', () => {
    // C'est la promesse faite au joueur peu sportif — son investissement ne doit pas
    // être effacé par une recrue mieux née.
    const veteran = advStats(make({ path: ['guerrier'], level: 23 }));
    const promu = advStats(make({ path: ['guerrier', 'epeiste', 'duelliste'], level: 1 }));
    const tot = (s: { puissance: number; endurance: number; agilite: number }) =>
      s.puissance + s.endurance + s.agilite;
    expect(tot(veteran)).toBeGreaterThan(tot(promu));
  });
  it('les signatures n’apparaissent qu’aux strates hautes', () => {
    for (const c of ADV_CLASSES) if (c.signature) expect(c.stratum).toBeGreaterThanOrEqual(3);
    expect(advSignatures(make({ path: ['guerrier', 'brute'] }))).toEqual([]);
    expect(advSignatures(make({ path: ['guerrier', 'brute', 'chevalier', 'berserker'] }))).toEqual([
      'rage_pct',
    ]);
  });
  it('un id de classe inconnu est ignoré, jamais une exception', () => {
    expect(advClass('nexistepas')).toBeUndefined();
    expect(() => advStats(make({ path: ['nexistepas'] }))).not.toThrow();
  });
});

describe('profondeur RÉELLEMENT écrite du vivier', () => {
  it('documente jusqu’où l’arbre est authoré — le reste n’est pas un trou silencieux', () => {
    // ⚠️ `PROMO_LEVELS` prévoit 8 strates (une par rareté) mais le vivier n'en couvre
    // que les premières. Ce test dit LAQUELLE, pour que l'écart soit une décision et non
    // un oubli : au-delà, `classChoices` rend une liste vide et `canPromote` refuse —
    // l'aventurier plafonne proprement, il ne casse pas.
    const written = Math.max(...ADV_CLASSES.map((c) => c.stratum));
    expect(written).toBe(3); // ← à monter en même temps que le vivier
    expect(written).toBeLessThan(PROMO_LEVELS.length);
    const complet = make({ path: ['guerrier', 'brute', 'colosse', 'titan'], level: 99 });
    expect(classChoices(complet, 4)).toEqual([]);
    expect(canPromote(complet, 99)).toBe(false);
  });
  it('chaque strate écrite a de quoi alimenter toutes les lignées', () => {
    for (let s = 0; s <= 3; s++) {
      const n = ADV_CLASSES.filter((c) => c.stratum === s).length;
      expect(n, `strate ${s}`).toBeGreaterThanOrEqual(PROMO_CHOICES);
    }
  });
});

describe('la BARRE de progression vers l’étoile suivante', () => {
  const at = (level: number, xp = 0) => make({ level, xp });

  it('avance avec l’XP, pas seulement au passage de niveau', () => {
    // Le niveau est CACHÉ : sans ça, un aventurier peut travailler deux niveaux entiers
    // sans le moindre retour visible.
    const a = advRankProgress(at(3, 0));
    const b = advRankProgress(at(3, advXpToNext(3) / 2));
    expect(b).toBeGreaterThan(a);
  });
  it('reste bornée à [0, 1]', () => {
    for (const l of [1, 2, 5, 23, 99]) {
      for (const f of [0, 0.5, 1, 5]) {
        const p = advRankProgress(at(l, advXpToNext(l) * f));
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
  it('boucle à chaque étoile — elle ne s’étire pas sur tout le rang', () => {
    // 1 étoile = 2 niveaux : la barre repart de bas à chaque étoile gagnée, sinon elle
    // bougerait de 10 % par niveau et ne dirait plus rien.
    expect(advRankProgress(at(1, 0))).toBe(0);
    expect(advRankProgress(at(3, 0))).toBe(0); // niveau 3 = nouvelle étoile
    // ⚠️ Valeur EXACTE, pas « > 0 » : une barre étirée sur tout le rang (10 niveaux)
    // passait le test précédent en rendant 0,1 au lieu de 0,5.
    expect(advRankProgress(at(2, 0))).toBeCloseTo(0.5, 6);
    expect(advRankProgress(at(1, advXpToNext(1)))).toBeCloseTo(0.5, 6);
  });
  it('est cohérente avec le rang affiché', () => {
    // Quand la barre est pleine, l'étoile suivante est bien celle qu'annonce l'échelle.
    for (const l of [1, 2, 4, 7, 12]) {
      const suivant = advNextStarLevel(at(l));
      expect(characterRank(suivant).tier).toBe(characterRank(l).tier + 1);
    }
  });
});
