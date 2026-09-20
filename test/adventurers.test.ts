import { describe, it, expect } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import {
  ADV_CLASSES,
  PROMO_LEVELS,
  STRATUM_BUDGET,
  advAvailable,
  advUnavailableReason,
  ADV_UNAVAILABLE_LABEL,
  advStatus,
  ADV_STATUSES,
  ADV_STATUS_LABEL,
  advClass,
  advRarity,
  advStats,
  advSignatures,
  advRoles,
  advRoleLevels,
  advSignatureLevels,
  escortRoleLevel,
  ADV_MAX_LEVEL,
  ADV_STARS,
  advRank,
  advRankProgress,
  advStar,
  advProgressOf,
  advXpToNext,
  deployCap,
  grantAdvXp,
  type Adventurer,
  advAvatar,
  compareAdventurers,
  advShapeLabel,
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
describe('vivier de classes — cohérence de l’arbre', () => {
  it('les ids sont uniques', () => {
    const ids = ADV_CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('la rareté DÉCOULE de la strate — une seule échelle dans tout le jeu', () => {
    for (const c of ADV_CLASSES)
      expect(advRarity(make({ path: [c.id] })), c.id).toBe(RANK_ORDER[c.stratum]);
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

describe('🏅 UNE CLASSE PAR RANG — l’échelle est celle du héros', () => {
  it('⚠️ UNE CLASSE EST UN RANG GAGNÉ — au sens littéral', () => {
    // ⚠️ MODÈLE POSÉ PAR L'UTILISATEUR : « le rang, c'est comme le joueur — bronze,
    // argent, or… » Chaque strate tombe donc EXACTEMENT au premier niveau d'un rang, et
    // la table est CALCULÉE depuis `rankStartLevel` — deux tables jumelles écrites
    // séparément divergent au premier réglage, ce que le projet s’est déjà fait deux fois.
    for (let i = 0; i < PROMO_LEVELS.length; i++) {
      const L = PROMO_LEVELS[i]!;
      expect(L, `strate ${i}`).toBe(rankStartLevel(i));
      expect(characterRank(L).rankIndex, `strate ${i}`).toBe(i);
      expect(characterRank(L).star, `strate ${i}`).toBe(1);
      if (L > 1) expect(characterRank(L - 1).rankIndex).toBe(i - 1);
    }
  });
  it('la toute première classe reste immédiate — on ne recrute pas un aventurier muet', () => {
    expect(PROMO_LEVELS[0]).toBe(1);
  });
  it('⚠️ les DEUX DERNIERS RANGS ne donnent plus de classe, et c’est assumé', () => {
    // 10 rangs de prestige, 8 raretés de classe : l'écart est structurel.
    expect(PROMO_LEVELS.length).toBeLessThan(CHARACTER_RANKS.length);
  });
  it('l’arbre s’arrête à 8 strates, comme les 8 raretés', () => {
    expect(PROMO_LEVELS.length).toBe(RANK_ORDER.length);
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
    // Une lignée entière, du Guerrier au Socle premier — elle atteint bien le HAUT de
    // l'échelle, c'est tout l'objet de ces strates.
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
  const suiveur = (level: number, xp = 0) => {
    let n = 1;
    while (n < PROMO_LEVELS.length && level >= PROMO_LEVELS[n]!) n++;
    return strate(n, level, xp);
  };

  it('⚠️ le rang affiché est LE MÊME BARÈME QUE LE JOUEUR', () => {
    // ⚠️ DEUX ALLERS-RETOURS ONT MENÉ ICI. Le rang a d'abord été ce barème, mais les
    // promotions étaient front-chargées (cinq dans le seul Bronze) : « une promotion = un
    // rang gagné » était faux. On a alors fait du rang la RARETÉ de la classe, ce qui
    // rendait la phrase vraie en abandonnant l'échelle commune avec le héros. La vraie
    // correction était ailleurs : c'est la CADENCE qui était fausse.
    // Pour qui prend ses promotions (v0.834 : sinon le rang reste bloqué, cf. plus bas).
    for (const L of [1, 6, 11, 23, 47, 99]) {
      expect(advRank(suiveur(L))).toEqual(characterRank(L));
    }
  });

  it('⚠️ les étoiles suivent le NIVEAU, jamais les classes', () => {
    // À niveau égal, prendre une classe de plus ne doit RIEN changer aux étoiles : la
    // promotion se lit sur le rang, la progression de terrain sur l'étoile.
    // (tant que la classe autorise ce rang — cf. le test suivant)
    for (let n = 2; n <= LIGNEE.length; n++)
      expect(advStar(strate(n, 17))).toBe(advStar(strate(2, 17)));
    // …et monter d'un cran de niveau les fait bouger.
    expect(advStar(strate(1, 3))).toBeGreaterThan(advStar(strate(1, 1)));
  });

  it('⚠️ PAS PROMU, PAS DE NOUVEAU RANG À L’ÉCRAN (v0.834) — il reste ★★★★★, barre pleine', () => {
    // Demandé par l'utilisateur. La CLASSE borne ses compagnons : afficher « Argent » à qui
    // ne peut mener que du Bronze ferait mentir la règle.
    const argent = PROMO_LEVELS[1]!;
    const bleu = strate(1, argent + 4);
    expect(advRank(bleu).name).toBe(characterRank(1).name);
    expect(advStar(bleu)).toBe(ADV_STARS);
    expect(advRankProgress(bleu)).toBe(1);
    // La promotion le fait monter aussitôt, à l'étoile que son niveau lui vaut.
    expect(advRank(strate(2, argent + 4))).toEqual(characterRank(argent + 4));
    // Un rang ne se prend jamais d'avance : il reste bloqué au dernier rang de sa classe,
    // pas au premier (trois classes → Or, pas Bronze).
    expect(advRank(strate(3, 99)).name).toBe(characterRank(PROMO_LEVELS[2]!).name);
  });

  it('la rareté de la classe monte DU MÊME PAS que le rang', () => {
    // Elle reste affichée à côté du rang — mais elle ne le concurrence plus : pour qui
    // prend ses promotions, les deux index sont égaux, cran pour cran.
    for (let i = 0; i < PROMO_LEVELS.length; i++) {
      const a = suiveur(PROMO_LEVELS[i]!);
      expect(RANK_ORDER.indexOf(advRarity(a)), `rang ${i}`).toBe(advRank(a).rankIndex);
    }
  });

  it('l’étoile ne recule jamais et reste dans ses bornes', () => {
    let vu = 0;
    for (let l = 1; l <= ADV_MAX_LEVEL; l++) {
      const st = advStar(suiveur(l));
      expect(st, `niveau ${l}`).toBeGreaterThanOrEqual(1);
      expect(st).toBeLessThanOrEqual(ADV_STARS);
      if (advRank(suiveur(l)).rankIndex === advRank(suiveur(Math.max(1, l - 1))).rankIndex)
        expect(st).toBeGreaterThanOrEqual(vu);
      vu = st;
    }
  });

  it('la barre avance avec l’XP, pas seulement au passage de niveau', () => {
    // Le niveau est CACHÉ : sans ça, on travaille un palier entier sans aucun retour.
    expect(advRankProgress(suiveur(17, advXpToNext(17) / 2))).toBeGreaterThan(
      advRankProgress(suiveur(17, 0)),
    );
  });

  it('reste bornée à [0, 1]', () => {
    for (const l of [1, 2, 5, 23, 99])
      for (const f of [0, 0.5, 1, 5]) {
        const p = advRankProgress(suiveur(l, advXpToNext(l) * f));
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
    const ev = advProgressOf([at('a', DEB)], [at('a', DEB + 2)]);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.to).toBeGreaterThan(ev[0]!.from);
    expect(ev[0]).toMatchObject({ id: 'a', rankUp: false });
    expect(ev[0]!.star).toBe(2);
  });

  it('rien à dire quand rien n’a bougé', () => {
    expect(advProgressOf([at('a', DEB)], [at('a', DEB)])).toEqual([]);
  });

  it('⚠️ UN RANG GAGNÉ EST ANNONCÉ, alors que son ÉTOILE RETOMBE de ★5 à ★1', () => {
    // ⚠️ DÉFAUT TROUVÉ PAR CE TEST, pas par relecture : comparer les ÉTOILES manquait
    // exactement le moment le plus important du jeu — parce qu'au passage de rang l'étoile
    // redescend. On compare donc le CRAN GLOBAL, monotone d'un bout à l'autre.
    // ⚠️ RÉÉCRIT (v0.834) : un rang ne se gagne plus qu'avec la PROMOTION. Le cas se produit
    // quand la formation se conclut — sa classe entre dans son parcours.
    const promu = at('a', FIN, { path: [...at('a', FIN).path, 'colosse_eternel'] });
    const ev = advProgressOf([at('a', FIN)], [promu]);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.rankUp).toBe(true);
    expect(ev[0]!.to).toBeGreaterThan(ev[0]!.from);
    // L'étoile affichée, elle, est bien repartie à 1.
    expect(ev[0]!.star).toBe(1);
    expect(ev[0]!.rankName).toBe(characterRank(FIN).name);
  });

  it('⚠️ AU PLAFOND DE SA CLASSE, un aventurier n’annonce plus RIEN', () => {
    // ⚠️ RÉÉCRIT (v0.951) : ces trois tests décrivaient la PROMOTION, qui est partie avec
    // l'arbre de classes. Ce qui reste vrai, et qui compte : le rang affiché est plafonné
    // par la classe (v0.834), donc franchir un palier de niveau sans pouvoir progresser
    // n'annonce rien — il ne s'est effectivement rien passé.
    expect(advProgressOf([at('a', FIN - 1)], [at('a', FIN)])).toEqual([]);
  });

  it('⚠️ UN CHAMPION, LUI, continue de monter — son rang n’est pas borné par un chemin', () => {
    // C'est ce qui remplace la promotion : on ne l'ÉLÈVE plus de classe en classe, son
    // rang suit son niveau jusqu’au plafond de sa RARETÉ.
    const champ = CHAMPIONS.find((c) => c.rarity === 'primordial')!;
    const cha = (level: number) =>
      make({ id: 'c', name: champ.name, path: [], championId: champ.id, level });
    const ev = advProgressOf([cha(DEB)], [cha(DEB + 2)]);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.to).toBeGreaterThan(ev[0]!.from);
  });

  it('rien à dire quand seule sa disponibilité change', () => {
    // Un aventurier qui rentre de convoi n’a rien GAGNÉ : l’annonce ne parle que de
    // progression, jamais d’état.
    const ev = advProgressOf([at('a', FIN, { busyUntil: 2_000_000 })], [at('a', FIN)]);
    expect(ev).toEqual([]);
  });

  it('un aventurier recruté entre-temps n’a rien « gagné »', () => {
    expect(advProgressOf([], [at('a', FIN)])).toEqual([]);
  });

  it('chaque membre de l’escorte est annoncé séparément', () => {
    const ev = advProgressOf(
      [at('a', DEB), at('b', DEB + 2), at('c', DEB)],
      [at('a', DEB + 2), at('b', DEB + 2), at('c', DEB + 4)],
    );
    expect(ev.map((e) => e.id)).toEqual(['a', 'c']);
  });
});
describe('🗿 Panthéon : effectif déployé et XP', () => {
  it('l’effectif croît avec la Guilde — donc avec le sport, mais LINÉAIREMENT', () => {
    // C'est ce qui rend la boucle accessible : la puissance du héros croît en ~L⁴, là où
    // l'effectif d'une Guilde suit son niveau tout doucement.
    expect(deployCap(0)).toBe(1);
    expect(deployCap(2)).toBe(2);
    expect(deployCap(20)).toBe(11);
    for (let l = 0; l < 60; l++) expect(deployCap(l + 1)).toBeGreaterThanOrEqual(deployCap(l));
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

describe('⚠️ LA DISPONIBILITÉ D’UN AVENTURIER — une seule source, trois lectures', () => {
  // ⚠️ `advUnavailableReason` est la SOURCE : `advAvailable`, `advStatus`, le filtre du
  // vivier, le cadre coloré et la ligne d’état en dérivent tous. La Guilde avait sa propre
  // règle, avec un ordre à elle — donc un blessé s’affichait autrement qu’il ne se rangeait.
  const base = (): Adventurer => ({
    id: 'a',
    name: 'A',
    seed: 1,
    path: ['guerrier'],
    level: 5,
    xp: 0,
  });

  it('advUnavailableReason est la SOURCE de advAvailable : jamais de contradiction', () => {
    const at = 1000;
    const cas = [
      base(),
      { ...base(), busyUntil: 2000 },
      { ...base(), hurtUntil: 2000 },
      { ...base(), busyUntil: 1000 },
      { ...base(), hurtUntil: 999 },
      { ...base(), championId: 'orsene' },
      { ...base(), hurtUntil: 3000, busyUntil: 4000 },
    ];
    for (const a of cas) expect(advAvailable(a, at)).toBe(advUnavailableReason(a, at) === null);
    expect(advUnavailableReason({ ...base(), busyUntil: 2000 }, at)).toBe('busy');
    expect(advUnavailableReason({ ...base(), hurtUntil: 2000 }, at)).toBe('hurt');
    expect(advUnavailableReason({ ...base(), championId: 'orsene' }, at)).toBe('benched');
    expect(advUnavailableReason({ ...base(), hurtUntil: 3000, busyUntil: 4000 }, at)).toBe('busy');
    for (const k of ADV_STATUSES.filter((s) => s !== 'free'))
      expect(ADV_UNAVAILABLE_LABEL[k].length).toBeGreaterThan(0);
  });

  it('⚠️ advStatus DÉRIVE de advUnavailableReason — la Guilde avait un ordre à elle', () => {
    const at = 1000;
    const cas = [
      base(),
      { ...base(), busyUntil: 2000 },
      { ...base(), hurtUntil: 2000 },
      { ...base(), championId: 'orsene' },
      { ...base(), championId: 'orsene', hurtUntil: 3000 },
      { ...base(), championId: 'orsene', hurtUntil: 3000, busyUntil: 4000 },
    ];
    for (const a of cas) expect(advStatus(a, at)).toBe(advUnavailableReason(a, at) ?? 'free');
    // ⚠️ Le cas qui divergeait : un blessé en collection se range à l’INFIRMERIE.
    expect(advStatus({ ...base(), championId: 'orsene', hurtUntil: 3000 }, at)).toBe('hurt');
    // « free » ⟺ disponible : le filtre ne peut pas proposer comme partant quelqu’un que
    // le store refusera.
    for (const a of cas) expect(advStatus(a, at) === 'free').toBe(advAvailable(a, at));
  });

  it('⚠️ les catégories COUVRENT tous les états, et chacune a son libellé', () => {
    // Exhaustif par construction : ajouter une raison d'indisponibilité sans l'ajouter aux
    // catégories ferait disparaître ces aventuriers de tous les filtres.
    const at = 1000;
    const vus = new Set(
      [
        base(),
        { ...base(), busyUntil: 2000 },
        { ...base(), hurtUntil: 2000 },
        // 🗿 EN COLLECTION : un champion que le Panthéon ne déploie pas. ⚠️ Il lui faut un
        // `championId` — un aventurier LEGACY n'est jamais mis au banc (il n'a pas de
        // Panthéon, et le priver de mission serait le punir d'avoir existé avant).
        { ...base(), championId: 'orsene' },
      ].map((a) => advStatus(a, at)),
    );
    expect([...vus].sort()).toEqual([...ADV_STATUSES].sort());
    for (const s of ADV_STATUSES) expect(ADV_STATUS_LABEL[s].length).toBeGreaterThan(0);
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

describe('🖼️ L’APPARENCE D’UN AVENTURIER DANS SON PORTRAIT (v0.807)', () => {
  const mk = (path: string[], level = 20) =>
    ({ id: 'a', name: 'A', seed: 1, path, level, xp: 0 }) as Parameters<typeof advAvatar>[0];
  const racine = ADV_CLASSES.find((c) => c.stratum === 0)!;
  /** Une lignée valide de n classes (chaque classe descend de la précédente). */
  function lignee(n: number): string[] {
    const out = [racine.id];
    const tags = new Set(racine.tags);
    for (let st = 1; out.length < n; st++) {
      const next = ADV_CLASSES.find(
        (c) => c.stratum === st && (c.req ?? []).every((t) => tags.has(t)),
      );
      if (!next) break;
      out.push(next.id);
      next.tags.forEach((t) => tags.add(t));
    }
    return out;
  }

  it('⚠️ chaque CLASSE met une pièce sur le dos — une promotion se VOIT', () => {
    expect(Object.keys(advAvatar(mk(lignee(1))).gear)).toEqual(['weapon']);
    expect(Object.keys(advAvatar(mk(lignee(2))).gear)).toEqual(['weapon', 'armor']);
    expect(Object.keys(advAvatar(mk(lignee(4))).gear)).toEqual([
      'weapon',
      'armor',
      'accessory',
      'relic',
    ]);
    expect(Object.keys(advAvatar(mk([])).gear)).toEqual([]);
  });

  it('⚠️ la pièce porte la RARETÉ de sa classe, et les 4 plus récentes habillent', () => {
    const p = lignee(6);
    expect(p.length).toBe(6);
    const g = advAvatar(mk(p)).gear;
    // Six classes : ce sont les strates 2..5 qui habillent, pas les deux premières.
    expect(g.weapon).toBe(RANK_ORDER[2]);
    expect(g.relic).toBe(RANK_ORDER[5]);
  });

  it('⚠️ la SILHOUETTE suit la forme RÉELLE (la même lecture que sa fiche)', () => {
    for (const c of ADV_CLASSES.filter((x) => x.stratum === 0)) {
      const a = mk([c.id]);
      const st = advStats(a);
      const shape = advShapeLabel({ p: st.puissance, e: st.endurance, a: st.agilite });
      const attendu =
        shape === 'Cogneur' ? 'puissant' : shape === 'Rapide' ? 'agile' : 'polyvalent';
      expect(advAvatar(a).profile, c.id).toBe(attendu);
    }
    // Les trois silhouettes existent dans le vivier de départ.
    const profils = new Set(
      ADV_CLASSES.filter((x) => x.stratum === 0).map((c) => advAvatar(mk([c.id])).profile),
    );
    expect(profils.size).toBeGreaterThan(1);
  });
});

describe('🗂️ L’ORDRE DU VIVIER : rang, puis expérience, puis puissance (v0.808)', () => {
  const mk = (id: string, level: number, xp: number) =>
    ({ id, name: id, seed: 1, path: [], level, xp }) as Parameters<typeof advAvatar>[0];
  const pw: Record<string, number> = {};
  const trie = (l: ReturnType<typeof mk>[]) =>
    [...l].sort((a, b) => compareAdventurers(a, b, (x) => pw[x.id] ?? 0)).map((x) => x.id);

  it('⚠️ le RANG passe avant tout, même devant une puissance écrasante', () => {
    pw.bronze = 9999;
    pw.argent = 1;
    expect(trie([mk('bronze', 10, 50), mk('argent', 11, 0)])).toEqual(['argent', 'bronze']);
  });
  it('⚠️ à rang égal, l’EXPÉRIENCE : le niveau, puis l’XP du niveau — pas l’XP seule', () => {
    pw.a = 5;
    pw.b = 5;
    pw.c = 5;
    // b vient de monter (xp 0) mais a un niveau de plus que a, qui a beaucoup d'xp.
    expect(trie([mk('a', 4, 900), mk('b', 5, 0), mk('c', 4, 10)])).toEqual(['b', 'a', 'c']);
  });
  it('⚠️ à rang et expérience égaux, la PUISSANCE départage', () => {
    pw.faible = 10;
    pw.fort = 80;
    expect(trie([mk('faible', 6, 20), mk('fort', 6, 20)])).toEqual(['fort', 'faible']);
  });
});
