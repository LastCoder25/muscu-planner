import { describe, it, expect } from 'vitest';
import {
  ADV_CLASSES,
  PROMO_LEVELS,
  PROMO_CHOICES,
  STRATUM_BUDGET,
  advAvailable,
  advTrainingLeftMs,
  settleTraining,
  settleAllTraining,
  advClass,
  advRarity,
  advStats,
  advSignatures,
  advRoles,
  advRoleLevels,
  advSignatureLevels,
  escortRoleLevel,
  reachableSkills,
  canPromote,
  canPromoteNow,
  classChoices,
  classRarity,
  eligibleClasses,
  nextStratum,
  pathTags,
  promoLevel,
  ADV_MAX_LEVEL,
  ADV_STARS,
  advRank,
  advRankProgress,
  advStar,
  advNextPromoLevel,
  advProgressOf,
  advXpToNext,
  guildRoster,
  recruitCost,
  grantAdvXp,
  type Adventurer,
} from '@/lib/adventurers';
import { RANK_ORDER } from '@/lib/items';
import { CHARACTER_RANKS, characterRank, rankStartLevel } from '@/lib/characterRank';

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
    for (let s = 2; s <= 7; s++) {
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
  it('⭐ « PROMOUVOIR MAINTENANT » : la règle COMPLÈTE, en un seul endroit', () => {
    // ⚠️ Signalé par un joueur : « j’ai encore l’étoile sur la guilde alors qu’il n’y a rien
    // à faire ». La condition vivait en TROIS exemplaires avec trois sous-ensembles
    // différents — la pastille ignorait le convoi ET le Centre de formation, que seul le
    // store exigeait. L’étoile s’allumait donc pour des promotions que rien n’acceptait.
    const NOW = 1_700_000_000_000;
    const a = make({ path: ['guerrier'], level: 1 });
    const need = promoLevel(nextStratum(a))!;
    const pret = { ...a, level: need };
    const ctx = { guildLevel: need, trainingLevel: 1, now: NOW };
    expect(canPromoteNow(pret, ctx)).toBe(true);

    // ⚠️ SANS CENTRE DE FORMATION, rien n’est promouvable — pas même annonçable.
    expect(canPromoteNow(pret, { ...ctx, trainingLevel: 0 })).toBe(false);
    // ⚠️ PARTI EN CONVOI : il est sur la route, pas au Centre.
    expect(canPromoteNow({ ...pret, busyUntil: NOW + 3600_000 }, ctx)).toBe(false);
    // Un convoi TERMINÉ ne bloque plus.
    expect(canPromoteNow({ ...pret, busyUntil: NOW - 1 }, ctx)).toBe(true);
    // Une formation déjà en cours : la décision est prise.
    expect(canPromoteNow({ ...pret, training: { classId: 'x', until: NOW + 1 } }, ctx)).toBe(false);
    // …et les deux verrous de `canPromote` restent, bien sûr.
    expect(canPromoteNow({ ...pret, level: need - 1 }, ctx)).toBe(false);
    expect(canPromoteNow(pret, { ...ctx, guildLevel: need - 1 })).toBe(false);
  });

  it('⚠️ UNE CONVALESCENCE NE BLOQUE PAS une formation — c’est même le bon moment', () => {
    // Décision v0.739, à ne pas défaire par mégarde : on ne fait pas attendre un blessé
    // deux fois. `hurtUntil` est donc volontairement absent de la règle.
    const NOW = 1_700_000_000_000;
    const a = make({ path: ['guerrier'], level: 1 });
    const need = promoLevel(nextStratum(a))!;
    const blesse = { ...a, level: need, hurtUntil: NOW + 6 * 3600_000 };
    expect(canPromoteNow(blesse, { guildLevel: need, trainingLevel: 1, now: NOW })).toBe(true);
  });

  it('⚠️ UNE PROMOTION EST UN RANG GAGNÉ — au sens littéral', () => {
    // ⚠️ MODÈLE POSÉ PAR L'UTILISATEUR : « le rang, c'est comme le joueur — bronze,
    // argent, or… L'aventurier choisit une classe au rang bronze à sa création, ensuite
    // une au rang argent, une à l'or. » Chaque promotion tombe donc EXACTEMENT au
    // premier niveau d'un rang, et la table est CALCULÉE depuis `rankStartLevel` —
    // deux tables jumelles écrites séparément divergent au premier réglage, ce que le
    // projet vient de se faire deux fois.
    for (let i = 0; i < PROMO_LEVELS.length; i++) {
      const L = PROMO_LEVELS[i]!;
      expect(L, `strate ${i}`).toBe(rankStartLevel(i));
      expect(characterRank(L).rankIndex, `strate ${i}`).toBe(i);
      expect(characterRank(L).star, `strate ${i}`).toBe(1);
      if (L > 1) expect(characterRank(L - 1).rankIndex).toBe(i - 1);
    }
  });
  it('la toute première classe reste immédiate — on ne recrute pas un aventurier muet', () => {
    // On choisit sa classe AU RECRUTEMENT, donc au rang Bronze, donc au niveau 1.
    expect(PROMO_LEVELS[0]).toBe(1);
  });
  it('⚠️ les DEUX DERNIERS RANGS ne donnent plus de classe, et c’est assumé', () => {
    // 10 rangs de prestige, 8 raretés de classe : l'écart est structurel. L'arbre est
    // fini, le titre continue. Écrire deux strates de plus ferait ~24 classes pour deux
    // paliers que presque personne n'atteindra.
    expect(PROMO_LEVELS.length).toBeLessThan(CHARACTER_RANKS.length);
    expect(promoLevel(PROMO_LEVELS.length)).toBeNull();
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
  it('⚠️ L’ARBRE EST COMPLET : 8 strates écrites, une par rareté', () => {
    // ⚠️ CE TEST DISAIT « écrit jusqu'à la strate 3 » — les quatre dernières manquaient,
    // donc un vivier plafonnait à « rare » sur huit rangs. Il ne documente plus un écart,
    // il verrouille une couverture : ajouter une rareté sans écrire sa strate le fait
    // tomber, au lieu de laisser un plafond silencieux.
    const written = Math.max(...ADV_CLASSES.map((c) => c.stratum));
    expect(written).toBe(PROMO_LEVELS.length - 1);
    expect(RANK_ORDER).toHaveLength(PROMO_LEVELS.length);
  });

  it('⚠️ … et il S’ARRÊTE là : le sommet est un sommet, pas un trou', () => {
    // Une lignée entière, du Guerrier au Socle premier. Au-delà, `classChoices` rend une
    // liste vide et `canPromote` refuse : l'aventurier plafonne proprement.
    const complet = make({
      path: [
        'guerrier',
        'brute',
        'colosse',
        'titan',
        'rempart',
        'colosse_eternel',
        'inebranlable',
        'socle_premier',
      ],
      level: 99,
    });
    expect(complet.path).toHaveLength(PROMO_LEVELS.length);
    expect(classChoices(complet, PROMO_LEVELS.length)).toEqual([]);
    expect(canPromote(complet, 99)).toBe(false);
    // Et il a bien atteint le HAUT de l'échelle — c'est tout l'objet de ces strates.
    expect(advRarity(complet)).toBe(RANK_ORDER[RANK_ORDER.length - 1]);
  });

  it('⚠️ chaque strate HAUTE porte de quoi défendre ET de quoi convoyer', () => {
    // Sans ça, monter en rang retirerait au joueur ses rôles de convoi (soin, cargaison,
    // vitesse, repérage) au profit de pure stat — et le vivier de fin de partie ne
    // saurait plus escorter. Les signatures, elles, ne valent que pour le combat.
    for (let st = 4; st <= 7; st++) {
      const strate = ADV_CLASSES.filter((c) => c.stratum === st);
      expect(strate.filter((c) => c.role).length, `strate ${st} — rôles`).toBeGreaterThanOrEqual(3);
      expect(
        strate.filter((c) => c.signature).length,
        `strate ${st} — signatures`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
  it('chaque strate écrite a de quoi alimenter toutes les lignées', () => {
    for (let s = 0; s <= 7; s++) {
      const n = ADV_CLASSES.filter((c) => c.stratum === s).length;
      expect(n, `strate ${s}`).toBeGreaterThanOrEqual(PROMO_CHOICES);
    }
  });
});

describe('🎖️ LE RANG EST CELUI DU JOUEUR, LES ÉTOILES SONT SON NIVEAU', () => {
  // Une lignée complète, une classe par rang.
  const LIGNEE = [
    'guerrier',
    'brute',
    'colosse',
    'titan',
    'rempart',
    'colosse_eternel',
    'inebranlable',
    'socle_premier',
  ];
  const strate = (n: number, level: number, xp = 0) =>
    make({ path: LIGNEE.slice(0, n), level, xp });
  /** Celui qui accepte CHAQUE promotion dès qu'elle s'ouvre. */
  const suiveur = (level: number) => {
    let n = 1;
    while (n < PROMO_LEVELS.length && level >= PROMO_LEVELS[n]!) n++;
    return strate(n, level);
  };

  it('⚠️ le rang affiché est LE MÊME BARÈME QUE LE JOUEUR', () => {
    // ⚠️ DEUX ALLERS-RETOURS ONT MENÉ ICI. Le rang a d'abord été ce barème, mais les
    // promotions étaient front-chargées (cinq dans le seul Bronze) : « une promotion = un
    // rang gagné » était faux. On a alors fait du rang la RARETÉ de la classe, ce qui
    // rendait la phrase vraie en abandonnant l'échelle commune avec le héros. La vraie
    // correction était ailleurs : c'est la CADENCE qui était fausse.
    for (const L of [1, 6, 11, 23, 47, 99]) {
      expect(advRank(strate(3, L))).toEqual(characterRank(L));
    }
  });

  it('⚠️ les étoiles suivent le NIVEAU, jamais les classes', () => {
    // À niveau égal, prendre une classe de plus ne doit RIEN changer aux étoiles : la
    // promotion se lit sur le rang, la progression de terrain sur l'étoile.
    for (let n = 1; n <= LIGNEE.length; n++)
      expect(advStar(strate(n, 17))).toBe(advStar(strate(1, 17)));
    // …et monter d'un cran de niveau les fait bouger.
    expect(advStar(strate(1, 3))).toBeGreaterThan(advStar(strate(1, 1)));
  });

  it('la rareté de la classe monte DU MÊME PAS que le rang', () => {
    // Elle reste affichée à côté du rang — mais elle ne le concurrence plus : pour qui
    // prend ses promotions, les deux index sont égaux, cran pour cran.
    for (let i = 0; i < PROMO_LEVELS.length; i++) {
      const a = suiveur(PROMO_LEVELS[i]!);
      expect(RANK_ORDER.indexOf(advRarity(a)), `rang ${i}`).toBe(advRank(a).rankIndex);
    }
  });

  it('⚠️ la promotion s’ouvre EXACTEMENT au passage de rang', () => {
    for (let i = 1; i < PROMO_LEVELS.length; i++) {
      const need = PROMO_LEVELS[i]!;
      expect(canPromote(strate(i, need), 99), `rang ${i}`).toBe(true);
      expect(canPromote(strate(i, need - 1), 99), `rang ${i}, juste avant`).toBe(false);
    }
  });

  it('⚠️ AU SOMMET DE L’ARBRE, le prestige continue sans nouvelle classe', () => {
    const fini = (level: number) => strate(LIGNEE.length, level);
    expect(advNextPromoLevel(fini(99))).toBeNull();
    expect(canPromote(fini(99), 99)).toBe(false);
    // Il monte pourtant encore de deux rangs entiers — le titre n'est pas figé.
    expect(advRank(fini(99)).rankIndex).toBeGreaterThan(advRank(fini(71)).rankIndex);
  });

  it('l’étoile ne recule jamais et reste dans ses bornes', () => {
    let vu = 0;
    for (let l = 1; l <= ADV_MAX_LEVEL; l++) {
      const st = advStar(strate(1, l));
      expect(st, `niveau ${l}`).toBeGreaterThanOrEqual(1);
      expect(st).toBeLessThanOrEqual(ADV_STARS);
      if (advRank(strate(1, l)).rankIndex === advRank(strate(1, Math.max(1, l - 1))).rankIndex)
        expect(st).toBeGreaterThanOrEqual(vu);
      vu = st;
    }
  });

  it('la barre avance avec l’XP, pas seulement au passage de niveau', () => {
    // Le niveau est CACHÉ : sans ça, on travaille un palier entier sans aucun retour.
    expect(advRankProgress(strate(1, 17, advXpToNext(17) / 2))).toBeGreaterThan(
      advRankProgress(strate(1, 17, 0)),
    );
  });

  it('reste bornée à [0, 1]', () => {
    for (const l of [1, 2, 5, 23, 99])
      for (const f of [0, 0.5, 1, 5]) {
        const p = advRankProgress(strate(1, l, advXpToNext(l) * f));
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
  });

  it('la barre BOUCLE à chaque étoile — une étoile tous les deux niveaux', () => {
    // ⚠️ Valeurs EXACTES, pas « > 0 » : une barre étirée sur tout le rang passerait un
    // test de simple croissance en rendant 0,1 là où on attend 0,5.
    expect(advRankProgress(strate(1, 1, 0))).toBe(0);
    expect(advRankProgress(strate(1, 3, 0))).toBe(0); // niveau 3 = nouvelle étoile
    expect(advRankProgress(strate(1, 2, 0))).toBeCloseTo(0.5, 6);
  });

  it('un aventurier sans classe ne fait pas exploser l’échelle', () => {
    const nu = make({ path: [], level: 1 });
    expect(Number.isFinite(advRankProgress(nu))).toBe(true);
    expect(advStar(nu)).toBeGreaterThanOrEqual(1);
  });
});
describe('⭐ CE QU’UNE MISSION ANNONCE', () => {
  const CTX = { guildLevel: 99, trainingLevel: 5, now: 1_000_000 };
  /** Bornes DÉRIVÉES du rang, jamais écrites : un test qui pin un nombre se casse à
   *  chaque réglage sans rien protéger de plus (leçon payée deux fois). */
  const DEB = PROMO_LEVELS[4]!; // premier niveau du 5e rang
  const FIN = PROMO_LEVELS[5]!; // premier niveau du 6e
  const at = (id: string, level: number, over: Partial<Adventurer> = {}) =>
    make({
      id,
      name: id,
      path: ['guerrier', 'brute', 'colosse', 'titan', 'rempart'],
      level,
      ...over,
    });

  it('une étoile gagnée est ANNONCÉE — le niveau, lui, reste caché', () => {
    // ⚠️ Sans ça, des semaines de convois ne se voient qu'en rouvrant la Guilde pour y
    // lire une barre : c'est le seul retour que le joueur ait sur son vivier.
    const ev = advProgressOf([at('a', DEB)], [at('a', DEB + 2)], CTX);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.to).toBeGreaterThan(ev[0]!.from);
    expect(ev[0]).toMatchObject({ id: 'a', rankUp: false, promoted: false });
    expect(ev[0]!.star).toBe(2);
  });

  it('rien à dire quand rien n’a bougé', () => {
    expect(advProgressOf([at('a', DEB)], [at('a', DEB)], CTX)).toEqual([]);
  });

  it('⚠️ UN RANG GAGNÉ EST ANNONCÉ, alors que son ÉTOILE RETOMBE de ★5 à ★1', () => {
    // ⚠️ DÉFAUT TROUVÉ PAR CE TEST, pas par relecture : comparer les ÉTOILES manquait
    // exactement le moment le plus important du jeu — celui qui donne droit à une
    // nouvelle classe — parce qu'au passage de rang l'étoile redescend. On compare donc
    // le CRAN GLOBAL, qui est monotone d'un bout à l'autre de l'échelle.
    const ev = advProgressOf([at('a', FIN - 1)], [at('a', FIN)], CTX);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.rankUp).toBe(true);
    expect(ev[0]!.to).toBeGreaterThan(ev[0]!.from);
    // L'étoile affichée, elle, est bien repartie à 1.
    expect(ev[0]!.star).toBe(1);
    expect(ev[0]!.rankName).toBe(characterRank(FIN).name);
  });

  it('⚠️ `promoted` est un FRANCHISSEMENT, pas un état', () => {
    // C'est tout ce qui empêche la feuille de promotion de se rouvrir à CHAQUE cargaison
    // pour quelqu'un qu'on a déjà décidé de ne pas promouvoir.
    expect(advProgressOf([at('a', FIN - 1)], [at('a', FIN)], CTX)[0]?.promoted).toBe(true);
    expect(advProgressOf([at('a', FIN)], [at('a', FIN)], CTX)).toEqual([]);
  });

  it('une promotion se dit même sans le moindre cran gagné', () => {
    // Cas réel : il était déjà au bon niveau mais PARTI EN CONVOI (donc pas promouvable).
    // Il rentre, la promotion s'ouvre — sans qu'aucun cran ne bouge.
    const ev = advProgressOf([at('a', FIN, { busyUntil: CTX.now + 60_000 })], [at('a', FIN)], CTX);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ promoted: true, rankUp: false });
    expect(ev[0]!.to).toBe(ev[0]!.from);
  });

  it('⚠️ sans Centre de formation, on n’annonce AUCUNE promotion', () => {
    // Le store la refuserait : promettre une fenêtre qui ne peut pas s'ouvrir est pire
    // que se taire. La règle vit dans `canPromoteNow`, on ne la ré-écrit pas ici.
    const ev = advProgressOf([at('a', FIN - 1)], [at('a', FIN)], { ...CTX, trainingLevel: 0 });
    expect(ev[0]!.promoted).toBe(false);
    // …mais le RANG gagné, lui, se dit quand même : il ne dépend d'aucun bâtiment.
    expect(ev[0]!.rankUp).toBe(true);
  });

  it('un aventurier recruté entre-temps n’a rien « gagné »', () => {
    expect(advProgressOf([], [at('a', FIN)], CTX)).toEqual([]);
  });

  it('chaque membre de l’escorte est annoncé séparément', () => {
    const ev = advProgressOf(
      [at('a', DEB), at('b', DEB + 2), at('c', DEB)],
      [at('a', DEB + 2), at('b', DEB + 2), at('c', DEB + 4)],
      CTX,
    );
    expect(ev.map((e) => e.id)).toEqual(['a', 'c']);
  });
});
describe('Guilde : effectif, coût de recrutement, XP', () => {
  it('l’effectif croît avec la Guilde — donc avec le sport, mais LINÉAIREMENT', () => {
    // C'est ce qui rend la boucle accessible : la puissance du héros croît en ~L⁴, là où
    // l'effectif d'une Guilde suit son niveau tout doucement.
    expect(guildRoster(0)).toBe(1);
    expect(guildRoster(2)).toBe(2);
    expect(guildRoster(20)).toBe(11);
    for (let l = 0; l < 60; l++) expect(guildRoster(l + 1)).toBeGreaterThanOrEqual(guildRoster(l));
  });
  it('⚠️ recruter coûte de plus en plus cher — sinon on remplit la Guilde d’un coup', () => {
    // Et « qui j'élève » cesse d'être une décision : c'est tout l'intérêt de la feature
    // pour un joueur qui n'a pas beaucoup d'or.
    expect(recruitCost(3, 10)).toBeGreaterThan(recruitCost(0, 10));
    expect(recruitCost(0, 30)).toBeGreaterThan(recruitCost(0, 5));
  });
  it('l’XP fait monter PLUSIEURS niveaux d’un coup si le voyage était gros', () => {
    const a = make({ level: 1, xp: 0 });
    const gros = advXpToNext(1) + advXpToNext(2) + advXpToNext(3);
    expect(grantAdvXp(a, gros, 99).level).toBe(4);
  });
  it('⚠️ au plafond, l’XP excédentaire est CONSERVÉE, jamais jetée', () => {
    // Sinon le joueur peu sportif — celui dont le plafond bouge le plus lentement, donc
    // exactement la cible — travaillerait des semaines pour rien.
    const bloque = grantAdvXp(make({ level: 3, xp: 0 }), 10_000, 3);
    expect(bloque.level).toBe(3);
    expect(bloque.xp).toBe(10_000);
    // …et quand la Guilde monte, il encaisse aussitôt ce qu’il avait accumulé.
    expect(grantAdvXp(bloque, 0, 20).level).toBeGreaterThan(3);
  });
  it('ne perd jamais d’XP ni ne recule', () => {
    for (const l of [1, 5, 12]) {
      const a = make({ level: l, xp: 17 });
      const n = grantAdvXp(a, 0, 99);
      expect(n.level).toBeGreaterThanOrEqual(a.level);
      expect(n.xp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('⚠️ une promotion se PAIE en temps de formation', () => {
  // Le Centre de formation annonce « formations plus courtes à chaque niveau » ; la
  // promotion était pourtant INSTANTANÉE, donc son niveau ne changeait rien et sa
  // promesse était creuse. C'est aussi ce que l'utilisateur a constaté : deux
  // aventuriers promus, aucun timer.
  const base = (): Adventurer => ({
    id: 'a',
    name: 'A',
    seed: 1,
    path: ['guerrier'],
    level: 5,
    xp: 0,
  });
  const enForm = (until: number): Adventurer => ({
    ...base(),
    training: { classId: 'epeiste', until },
  });

  it('⚠️ la classe n’entre PAS dans le chemin avant l’échéance', () => {
    // Sinon l'aventurier profiterait de ses nouvelles stats pendant sa formation.
    const a = settleTraining(enForm(1000), 999);
    expect(a.path).toEqual(['guerrier']);
    expect(a.training).toBeTruthy();
  });

  it('à l’échéance, la classe est appliquée et la formation disparaît', () => {
    const a = settleTraining(enForm(1000), 1000);
    expect(a.path).toEqual(['guerrier', 'epeiste']);
    expect(a.training).toBeUndefined();
  });

  it('⚠️ IDEMPOTENT : rejouer le règlement ne promeut pas deux fois', () => {
    // Il tourne à chaque tick — s'il n'était pas idempotent, un aventurier gagnerait
    // une classe par seconde.
    const a = settleTraining(enForm(1000), 5000);
    expect(settleTraining(a, 9000)).toEqual(a);
    expect(settleTraining(a, 9000).path).toHaveLength(2);
  });

  it('⚠️ un aventurier EN FORMATION est indisponible — c’est le coût de la promotion', () => {
    expect(advAvailable(enForm(2000), 1000)).toBe(false);
    expect(advAvailable(enForm(2000), 2000)).toBe(true);
    expect(advTrainingLeftMs(enForm(2000), 1500)).toBe(500);
    expect(advTrainingLeftMs(base(), 1500)).toBe(0);
  });

  it('une formation court PENDANT une convalescence — on ne fait pas attendre deux fois', () => {
    const blesse = { ...enForm(2000), hurtUntil: 9000 };
    expect(settleTraining(blesse, 2000).path).toHaveLength(2);
  });

  it('le règlement en masse ne recopie le vivier que s’il a bougé', () => {
    const l = [base(), enForm(5000)];
    expect(settleAllTraining(l, 1000)).toEqual({ list: l, changed: false });
    expect(settleAllTraining(l, 5000).changed).toBe(true);
  });
});

describe('⚠️ une compétence apprise DEUX FOIS monte d’un NIVEAU', () => {
  // Demandé par l'utilisateur. Le cumul EXISTAIT déjà (le compteur d'occurrences des
  // caravanes additionnait les doublons) — mais il n'avait pas de nom, et l'écran
  // listait la même compétence deux fois, ce qui se lit comme un défaut.

  it('une occurrence = niveau 1, deux = niveau 2', () => {
    // Vesna, du vivier réel : Éclaireur › Coursier › Rôdeur — éclaireur deux fois.
    const a = make({ path: ['eclaireur', 'coursier', 'rodeur'] });
    const lv = advRoleLevels(a);
    expect(lv.find((s) => s.what === 'scout')?.level).toBe(2);
    expect(lv.find((s) => s.what === 'speed')?.level).toBe(1);
    // ⚠️ Une seule entrée par compétence : c'est tout l'objet du changement.
    expect(lv.filter((s) => s.what === 'scout')).toHaveLength(1);
  });

  it('⚠️ l’ordre est celui du PARCOURS, pas celui des niveaux', () => {
    // C'est l'ordre dans lequel il a appris ; trier par niveau raconterait autre chose.
    const a = make({ path: ['eclaireur', 'coursier', 'rodeur'] });
    expect(advRoleLevels(a).map((s) => s.what)).toEqual(['scout', 'speed']);
  });

  it('⚠️ le NIVEAU redonne EXACTEMENT l’ancien décompte d’occurrences', () => {
    // Non-régression de calibrage : les valeurs de jeu des caravanes (cargaison, trajet,
    // convalescence) sont mesurées. Passer par le niveau ne doit RIEN changer.
    const team = [
      make({ id: 'x', path: ['eclaireur', 'coursier', 'rodeur'] }),
      make({ id: 'y', path: ['caravanier'] }),
      make({ id: 'z', path: ['eclaireur'] }),
    ];
    const brut = (role: string) =>
      team.reduce(
        (n, a) => n + a.path.map((id) => advClass(id)?.role).filter((r) => r === role).length,
        0,
      );
    for (const role of ['heal', 'haul', 'speed', 'scout'] as const) {
      expect(escortRoleLevel(team, role)).toBe(brut(role));
    }
    expect(escortRoleLevel(team, 'scout')).toBe(3);
  });

  it('une compétence absente vaut le niveau ZÉRO, jamais undefined', () => {
    expect(escortRoleLevel([make({ path: ['guerrier'] })], 'haul')).toBe(0);
    expect(advSignatureLevels(make({ path: ['guerrier'] }))).toEqual([]);
  });
});

describe('⚠️ « où il va » — l’horizon d’une lignée', () => {
  it('contient les compétences de la classe de départ', () => {
    const r = reachableSkills(['caravanier']);
    expect(r.roles).toContain(advClass('caravanier')!.role);
  });

  it('⚠️ RESPECTE LA FILIATION : un Guerrier ne peut pas atteindre le soin d’un Clerc', () => {
    // Le même invariant que le tirage des promotions. Si l'horizon l'ignorait, il
    // promettrait une voie que le joueur ne pourra jamais prendre — pire que rien.
    const guerrier = reachableSkills(['guerrier']);
    const clerc = reachableSkills(['mage', 'clerc']);
    expect(clerc.roles).toContain('heal');
    expect(guerrier.roles).not.toContain('heal');
  });

  it('⚠️ l’horizon RÉTRÉCIT à mesure qu’on avance — les choix se referment', () => {
    // C'est ce qui donne son poids à une promotion : plus on descend, moins il reste.
    const tot = (p: string[]) => {
      const r = reachableSkills(p);
      return r.roles.length + r.signatures.length;
    };
    const debut = tot(['eclaireur']);
    const apres = tot(['eclaireur', 'coursier']);
    expect(apres).toBeLessThanOrEqual(debut);
    expect(debut).toBeGreaterThan(0);
  });

  it('⚠️ contient TOUJOURS ce que le chemin porte DÉJÀ — balayage exhaustif', () => {
    // ⚠️ Test renforcé après une mutation passée au VERT : vérifier un seul cas nommé
    // ne suffisait pas — la compétence de la classe de départ se retrouvait souvent
    // plus bas sur la même branche, donc l oubli restait invisible. Le balayage de TOUS
    // les chemins, lui, tombe sur ceux où elle est unique.
    for (const p of allPaths(2)) {
      const r = reachableSkills(p);
      const adv = make({ path: p });
      for (const role of advRoles(adv)) expect(r.roles).toContain(role);
      for (const sg of advSignatures(adv)) expect(r.signatures).toContain(sg);
    }
  });

  it('se termine, même en partant de chaque racine', () => {
    // Garde-fou : l'énumération suit des chemins, elle ne doit pas boucler.
    for (const r of roots) expect(() => reachableSkills([r.id])).not.toThrow();
  });
});
