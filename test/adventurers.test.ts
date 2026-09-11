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
  advRankProgress,
  advNextStarLevel,
  advXpToNext,
  guildRoster,
  recruitCost,
  grantAdvXp,
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
    expect(canPromoteNow({ ...pret, training: { classId: 'x', until: NOW + 1 } }, ctx)).toBe(
      false,
    );
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
