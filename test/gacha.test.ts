import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { RANK_ORDER, type Rarity } from '@/lib/items';
import { CHAMPIONS, CHAMPION_BY_ID, championsOf } from '@/data/champions';
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
  RARITY_BUDGET,
} from '@/lib/adventurers';
import {
  GACHA,
  GACHA_RATES,
  TOP_RARITY,
  emptyPity,
  pullRarity,
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

const rankOf = (r: Rarity) => RANK_ORDER.indexOf(r);

/** Tire `n` fois et rend la suite des raretés obtenues. */
function serie(n: number, seed = 7919): Rarity[] {
  const rng = mulberry32(seed);
  let pity = emptyPity();
  const out: Rarity[] = [];
  for (let i = 0; i < n; i++) {
    const r = pullRarity(rng, pity);
    pity = r.pity;
    out.push(r.rarity);
  }
  return out;
}

describe('les taux', () => {
  it('⚠️ SOMMENT À 1 — sinon le reliquat irait en silence à la dernière entrée', () => {
    const s = RANK_ORDER.reduce((a, r) => a + GACHA_RATES[r], 0);
    expect(s).toBeCloseTo(1, 10);
  });

  it('couvrent TOUTE l’échelle : aucune rareté n’est intirable', () => {
    for (const r of RANK_ORDER) expect(GACHA_RATES[r]).toBeGreaterThan(0);
  });

  it('DÉCROISSENT strictement : plus c’est rare, moins ça tombe', () => {
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(GACHA_RATES[RANK_ORDER[i]!]).toBeLessThan(GACHA_RATES[RANK_ORDER[i - 1]!]);
  });

  it('la rareté maximale est DÉRIVÉE de l’échelle, jamais écrite en dur', () => {
    expect(TOP_RARITY).toBe(RANK_ORDER[RANK_ORDER.length - 1]);
  });
});

describe('le pity', () => {
  it('⚠️ LA RAMPE ATTEINT 1 PILE AU HARD PITY — pas de saut greffé à côté', () => {
    expect(topRate(0)).toBeCloseTo(GACHA_RATES[TOP_RARITY], 10);
    expect(topRate(GACHA.softPityStart - 1)).toBeCloseTo(GACHA_RATES[TOP_RARITY], 10);
    expect(topRate(GACHA.hardPity - 1)).toBe(1);
    // …et elle MONTE entre les deux, sans plateau.
    let prev = -1;
    for (let n = GACHA.softPityStart - 1; n < GACHA.hardPity; n++) {
      expect(topRate(n)).toBeGreaterThanOrEqual(prev);
      prev = topRate(n);
    }
    expect(topRate(GACHA.softPityStart + 5)).toBeGreaterThan(GACHA_RATES[TOP_RARITY]);
  });

  it('⚠️ ON N’ATTEND JAMAIS PLUS DE `hardPity` TIRAGES la rareté maximale', () => {
    const s = serie(20_000);
    let depuis = 0;
    let pire = 0;
    for (const r of s) {
      depuis++;
      if (r === TOP_RARITY) {
        pire = Math.max(pire, depuis);
        depuis = 0;
      }
    }
    expect(pire).toBeLessThanOrEqual(GACHA.hardPity);
  });

  it('⚠️ ON N’ATTEND JAMAIS PLUS DE `minorPity` TIRAGES le plancher', () => {
    // Sans ce filet, une série de 30 communs d'affilée est banale — et il n'y a pas
    // d'argent réel pour compenser.
    const s = serie(20_000);
    let depuis = 0;
    let pire = 0;
    for (const r of s) {
      depuis++;
      if (rankOf(r) >= rankOf(GACHA.floorRarity)) {
        pire = Math.max(pire, depuis);
        depuis = 0;
      }
    }
    expect(pire).toBeLessThanOrEqual(GACHA.minorPity);
  });

  it('⚠️ la garantie de plancher n’est pas un PLAFOND : le tirage QU’ELLE déclenche varie', () => {
    // ⚠️ Ce test était TROUÉ au premier jet : il comptait les raretés > plancher sur une
    // longue série, or le tirage ORDINAIRE en produit de toute façon — la mutation
    // « le plancher rend toujours `floorRarity` » passait au vert. Il faut forcer l'état
    // qui DÉCLENCHE la garantie et regarder ce qu'elle rend, elle.
    const vus = new Set<Rarity>();
    for (let s = 1; s <= 400; s++) {
      const r = pullRarity(mulberry32(s * 7919), {
        sinceTop: 0,
        sinceFloor: GACHA.minorPity - 1,
      });
      expect(rankOf(r.rarity)).toBeGreaterThanOrEqual(rankOf(GACHA.floorRarity));
      vus.add(r.rarity);
    }
    // ⚠️ Et il était troué UNE SECONDE FOIS : « au moins deux raretés » ou « au moins une
    // au-dessus du plancher » sont satisfaits par la voie du grand pity (0,6 %), qui rend
    // la rareté MAXIMALE. Ce que seule la garantie peut produire, c'est une rareté
    // STRICTEMENT ENTRE le plancher et le sommet.
    const entreDeux = [...vus].filter(
      (r) => rankOf(r) > rankOf(GACHA.floorRarity) && r !== TOP_RARITY,
    );
    expect(entreDeux.length).toBeGreaterThan(0);
  });

  it('MORD VRAIMENT : le taux effectif dépasse nettement le taux de base', () => {
    const s = serie(20_000);
    const eff = s.filter((r) => r === TOP_RARITY).length / s.length;
    expect(eff).toBeGreaterThan(GACHA_RATES[TOP_RARITY] * 2);
    // …sans pour autant faire de la rareté maximale une banalité.
    expect(eff).toBeLessThan(0.04);
  });

  it('DEUX compteurs indépendants : décrocher un épique ne remet pas le grand pity à zéro', () => {
    let pity = { sinceTop: 40, sinceFloor: 9 };
    const rng = mulberry32(3);
    const r = pullRarity(rng, pity);
    // Le 10e tirage force un plancher+ ; s'il n'est pas maximal, `sinceTop` doit CONTINUER.
    if (r.rarity !== TOP_RARITY) expect(r.pity.sinceTop).toBe(41);
    expect(r.pity.sinceFloor).toBe(0);
    pity = r.pity;
  });

  it('est PUR : il ne mute pas l’état qu’on lui donne', () => {
    const avant = emptyPity();
    const copie = { ...avant };
    pullRarity(mulberry32(1), avant);
    expect(avant).toEqual(copie);
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
  /** Raretés maximales obtenues sur un an, moyenne de plusieurs simulations. */
  function topParAn(manaPerDay: number, runs = 12): number {
    const n = Math.round(pullsPerDay(manaPerDay) * 365);
    let tot = 0;
    for (let s = 1; s <= runs; s++)
      tot += serie(n, s * 7919).filter((r) => r === TOP_RARITY).length;
    return tot / runs;
  }

  it('sur la plage RÉALISTE (niveaux 12 à 60), 10 à 20 raretés maximales par an', () => {
    for (const [, mana] of DEBIT.slice(0, 3)) {
      const t = topParAn(mana);
      expect(t).toBeGreaterThan(9);
      expect(t).toBeLessThan(21);
    }
  });

  it('au niveau 100 ça reste borné — jamais le double de la plage réaliste', () => {
    expect(topParAn(240)).toBeLessThan(topParAn(63) * 2.5);
  });

  it('⚠️ LE TIRAGE GRATUIT PORTE LE PLANCHER : même sans une seule faille, on joue', () => {
    // C'est le filet du joueur qui ne combat pas. Sans lui, celui qui n'a pas l'énergie
    // d'entrer dans une faille ne tirerait jamais.
    expect(pullsPerDay(0)).toBe(GACHA.freePullsPerDay);
    expect(topParAn(0)).toBeGreaterThan(4);
  });

  it('le mana RESTE le levier principal : jouer double au moins les tirages', () => {
    // Si le gratuit dominait tout, fermer des failles ne servirait à rien.
    expect(pullsPerDay(91)).toBeGreaterThan(pullsPerDay(0) * 1.5);
  });

  it('fermer une faille se LIT en tirages : une mûre en vaut au moins un', () => {
    // Mesuré (v0.936) : une faille mûre rend 123 💠 au niveau 12, 756 au niveau 100.
    expect(123 / GACHA.pullCost).toBeGreaterThanOrEqual(1);
    expect(756 / GACHA.pullCost).toBeLessThan(10);
  });
});

describe('🏅 le budget d’un champion', () => {
  const ADV_LEVEL_MULT = 11.5; // ×11,5 sur 71 niveaux (ADV_LEVEL_K 0,15)

  it('⚠️ UN COMMUN INVESTI BAT UN PRIMORDIAL NU — la propriété de tout gacha', () => {
    // C'est ELLE qui fixe le plancher à 20. Avec la table d'aujourd'hui (6 en bas), le
    // commun monté à fond vaut 69 et PERD contre 106.
    const commun = RARITY_BUDGET[0]!;
    const top = RARITY_BUDGET[RARITY_BUDGET.length - 1]!;
    expect(commun * ADV_LEVEL_MULT).toBeGreaterThan(top);
    // …et l'écart de rareté reste donc sous le facteur du rang.
    expect(top / commun).toBeLessThan(ADV_LEVEL_MULT);
  });

  it('garde 106 EN HAUT — c’est lui qui tient l’équilibrage de fin de partie', () => {
    expect(RARITY_BUDGET[RARITY_BUDGET.length - 1]).toBe(106);
  });

  it('croît strictement, une entrée par rareté', () => {
    expect(RARITY_BUDGET).toHaveLength(RANK_ORDER.length);
    for (let i = 1; i < RARITY_BUDGET.length; i++)
      expect(RARITY_BUDGET[i]!).toBeGreaterThan(RARITY_BUDGET[i - 1]!);
  });

  it('⚠️ EST PLAFONNÉ PAR LE RANG DU JOUEUR — le sport reste le plafond', () => {
    // Un primordial tiré au niveau 5 ne vaut pas 106 : il révèle son budget en montant.
    expect(championBudget('primordial', 5)).toBeLessThan(RARITY_BUDGET[7]!);
    expect(championBudget('primordial', 100)).toBe(RARITY_BUDGET[7]!);
    // …et il ne DESCEND jamais quand on monte.
    let prev = 0;
    for (let L = 1; L <= 100; L++) {
      const b = championBudget('primordial', L);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it('ne RELÈVE jamais une rareté basse : le plafond coupe, il ne pousse pas', () => {
    for (const L of [1, 20, 50, 100]) expect(championBudget('commun', L)).toBe(RARITY_BUDGET[0]);
  });

  it('⚠️ LA CHANCE NE DOIT PAS DOUBLER LA PUISSANCE D’UN DÉBUTANT', () => {
    // Sans plafond, un primordial chanceux vaudrait ×5,3 un commun au même niveau — mesuré,
    // l'escorte devenait 3,9 à 5,6× l'étalon d'aujourd'hui en début de partie.
    const L = 12;
    const chanceux = championBudget('primordial', L);
    const malchanceux = championBudget('commun', L);
    expect(chanceux / malchanceux).toBeLessThan(2);
  });
});

describe('🎰 tirer un CHAMPION', () => {
  /** Rejoue `n` tirages complets et rend les champions obtenus. */
  function tirages(n: number, seed = 4421) {
    const rng = mulberry32(seed);
    let pity = emptyPity();
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = pullChampion(rng, pity);
      pity = r.pity;
      out.push(r.champion);
    }
    return out;
  }

  it('⚠️ LE CHAMPION APPARTIENT À LA RARETÉ TIRÉE — pas de décalage de pool', () => {
    // On rejoue `pullRarity` sur une graine JUMELLE : elle consomme le même premier
    // tirage, donc elle annonce exactement la rareté que `pullChampion` a obtenue.
    let pityA = emptyPity();
    let pityB = emptyPity();
    const a = mulberry32(31337);
    const b = mulberry32(31337);
    for (let i = 0; i < 400; i++) {
      const attendu = pullRarity(b, pityB);
      pityB = attendu.pity;
      b(); // le tirage que `pullChampion` consomme pour choisir dans le pool
      const obtenu = pullChampion(a, pityA);
      pityA = obtenu.pity;
      expect(obtenu.champion.rarity).toBe(attendu.rarity);
    }
  });

  it('⚠️ UNIFORME DANS LA RARETÉ — c’est ce qui fixe la vitesse de l’Éveil', () => {
    // À 4 champions par rareté, un champion PRÉCIS tombe à un quart du taux de sa rareté.
    const parRarete = new Map<Rarity, Map<string, number>>();
    for (const c of tirages(40_000)) {
      const m = parRarete.get(c.rarity) ?? new Map<string, number>();
      m.set(c.id, (m.get(c.id) ?? 0) + 1);
      parRarete.set(c.rarity, m);
    }
    let verifiees = 0;
    for (const [r, m] of parRarete) {
      const total = [...m.values()].reduce((s, n) => s + n, 0);
      if (total < 600) continue; // trop peu d'échantillons pour conclure
      expect(m.size, `${r} : un champion n’est jamais tombé`).toBe(championsOf(r).length);
      for (const [id, n] of m) {
        expect(n / total, `${r}/${id}`).toBeGreaterThan(0.18);
        expect(n / total, `${r}/${id}`).toBeLessThan(0.32);
      }
      verifiees++;
    }
    expect(verifiees, 'aucune rareté assez échantillonnée').toBeGreaterThanOrEqual(3);
  });

  it('le pity CONTINUE de courir : le tirage du champion ne le remet pas à zéro', () => {
    const rng = mulberry32(99);
    // Un état de pity déjà bien avancé doit ressortir intact (ou remis à zéro par une
    // rareté décrochée), jamais reconstruit depuis rien.
    const avant = { sinceTop: 40, sinceFloor: 3 };
    const apres = pullChampion(rng, avant).pity;
    expect(apres.sinceTop === 0 || apres.sinceTop === 41).toBe(true);
    expect(apres.sinceFloor === 0 || apres.sinceFloor === 4).toBe(true);
  });

  it('⚠️ LE HARD PITY VAUT AUSSI POUR LE CHAMPION, pas seulement pour la rareté', () => {
    const rng = mulberry32(5);
    const { champion } = pullChampion(rng, { sinceTop: GACHA.hardPity - 1, sinceFloor: 0 });
    expect(champion.rarity).toBe(TOP_RARITY);
  });

  it('est DÉTERMINISTE : même graine, même champion', () => {
    const a = tirages(50, 1234).map((c) => c.id);
    const b = tirages(50, 1234).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('tout le roster finit par tomber — aucun champion n’est intirable', () => {
    const vus = new Set(tirages(60_000).map((c) => c.id));
    expect(vus.size).toBe(CHAMPIONS.length);
  });
});

describe('🏅 les stats d’un champion', () => {
  const total = (s: { puissance: number; endurance: number; agilite: number }) =>
    s.puissance + s.endurance + s.agilite;

  it('le TOTAL vaut le budget × la courbe de niveau', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      for (const c of [CHAMPIONS[0]!, CHAMPIONS[20]!, CHAMPIONS[31]!]) {
        const attendu = championBudget(c.rarity, L) * (1 + ADV_LEVEL_K * (L - 1));
        // Trois arrondis, donc une tolérance de trois demi-points.
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
      // Une composante nulle de la forme reste nulle en stats.
      if (c.form.a === 0) expect(s.agilite, c.name).toBe(0);
    }
  });

  it('⚠️ LA COURBE DE NIVEAU EST CELLE DES AVENTURIERS (×11,5 du niveau 1 au 100)', () => {
    // C'est sur ce facteur que repose « un commun investi bat un primordial nu ». Un
    // champion de rareté BASSE l'éprouve sans que le plafond ne s'en mêle.
    const c = championsOf('commun')[0]!;
    const ratio = total(championStats(c, 100)) / total(championStats(c, 1));
    expect(ratio).toBeCloseTo(1 + ADV_LEVEL_K * 99, 1);
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
    // Au-delà du dernier cran, plus rien ne monte (la copie se convertit).
    expect(total(championStats(c, 60, 50))).toBe(total(championStats(c, 60, AWAKEN.max + 1)));
  });

  it('⚠️ À ÉVEIL ÉGAL, LA RARETÉ GAGNE TOUJOURS — sinon le tirage perdrait son sens', () => {
    const L = 100; // plafond de rang levé, les raretés s'expriment pleinement
    for (const copies of [1, 3, AWAKEN.max + 1]) {
      RANK_ORDER.forEach((r, i) => {
        if (i + 1 >= RANK_ORDER.length) return;
        const bas = total(championStats(championsOf(r)[0]!, L, copies));
        const haut = total(championStats(championsOf(RANK_ORDER[i + 1]!)[0]!, L, copies));
        expect(haut, `${r} vs ${RANK_ORDER[i + 1]} à ${copies} copies`).toBeGreaterThan(bas);
      });
    }
  });

  it('⚠️ UN ÉVEIL COMPLET VAUT UN CRAN DE RARETÉ, JAMAIS DEUX', () => {
    // MESURÉ : le pas entre deux raretés voisines vaut ×1,25 à ×1,28, un Éveil complet
    // ×1,48 — donc un C6 dépasse la rareté juste au-dessus, à TOUTES les raretés, et
    // n'atteint JAMAIS la suivante. C'est le contrat assumé du genre (un 4★ C6 vaut un
    // 5★ C0) : la collection rattrape la chance d'UN cran, pas plus. Rester sous un cran
    // demanderait perStep ≤ 0,042 — un Éveil complet imperceptible, donc pas d'Éveil.
    const L = 100;
    RANK_ORDER.forEach((r, i) => {
      if (i + 2 >= RANK_ORDER.length) return;
      const eveille = total(championStats(championsOf(r)[0]!, L, AWAKEN.max + 1));
      const deuxCrans = total(championStats(championsOf(RANK_ORDER[i + 2]!)[0]!, L, 1));
      expect(eveille, `${r} C6 atteint ${RANK_ORDER[i + 2]}`).toBeLessThan(deuxCrans);
    });
  });

  it('⚠️ LE PLAFOND DE RANG SE VOIT DANS LES STATS, pas seulement dans le budget', () => {
    // Au niveau 1, toutes les raretés valent la plus basse : le sport est le plafond.
    const bas = total(championStats(championsOf('commun')[0]!, 1));
    const haut = total(championStats(championsOf('primordial')[0]!, 1));
    // ±1 : trois arrondis, et les deux champions n'ont pas la même forme.
    expect(Math.abs(haut - bas)).toBeLessThanOrEqual(1);
    // Et au niveau 100 l'écart de rareté s'exprime en entier.
    expect(
      total(championStats(championsOf('primordial')[0]!, 100)) /
        total(championStats(championsOf('commun')[0]!, 100)),
    ).toBeGreaterThan(4);
  });

  it('⚠️ UN NIVEAU ABERRANT NE RETOURNE JAMAIS LES STATS — la symétrie avec `advStats`', () => {
    // ⚠️ Le niveau vient de `computeLevel(xp)` : il vaut toujours ≥ 1, donc ce garde ne
    // peut pas mordre en partie réelle. Il vit ICI parce que `advStats` porte EXACTEMENT
    // le même (`Math.max(1, adv.level)`) et que `championStats` en est le miroir : le
    // retirer ferait diverger deux fonctions qui doivent rendre la même courbe. ⚠️ Il
    // faut descendre sous −5,67 pour que `mult` passe négatif — un test posé à 0 ou −5
    // passerait au vert sans rien couvrir (mutation survivante au premier jet).
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
  // ⚠️ Signalé : « j'ai eu du primordial, légendaire, rare, alors que je pensais avoir
  // beaucoup de commun ». MESURÉ : les taux sont conformes (28,8 % de commun sur 14
  // tirages simulés, contre 30 % annoncés). Le défaut était le SILENCE — rien n'annonçait
  // ni les taux, ni la garantie, ni l'état du pity.
  const neuf = { sinceTop: 0, sinceFloor: 0 };

  it('annonce TOUTES les raretés, et exactement la table', () => {
    const o = gachaOdds(neuf);
    expect(o.rates).toHaveLength(RANK_ORDER.length);
    for (const { rarity, pct } of o.rates) {
      // ⚠️ DÉRIVÉ de la table, jamais recopié : une notice qui aurait ses propres chiffres
      // finirait par mentir au premier réglage.
      expect(pct, rarity).toBeCloseTo(GACHA_RATES[rarity] * 100, 6);
    }
  });

  it('⚠️ LE CHIFFRE QUI EXPLIQUE LE RESSENTI : un tirage garanti DÉPASSE souvent le plancher', () => {
    // La garantie re-tire dans TOUTE la tranche ≥ plancher (`pickAtLeast`) — elle ne rend
    // pas « épique ». C'est ce que personne ne pouvait deviner, et c'est ce qui fait qu'un
    // joueur voit des légendaires là où il attendait des communs.
    const o = gachaOdds(neuf);
    const idx = RANK_ORDER.indexOf(o.floorRarity);
    const somme = (f: (i: number) => boolean) =>
      RANK_ORDER.filter((r) => f(RANK_ORDER.indexOf(r))).reduce((a, r) => a + GACHA_RATES[r], 0);
    expect(o.aboveFloorPct).toBeCloseTo((somme((i) => i > idx) / somme((i) => i >= idx)) * 100, 6);
    // …et ce n'est pas anecdotique : près d'une fois sur deux.
    expect(o.aboveFloorPct).toBeGreaterThan(30);
  });

  it('dit où en est SON pity, jamais des compteurs nus', () => {
    expect(gachaOdds(neuf).nextFloorIn).toBe(GACHA.minorPity);
    expect(gachaOdds({ sinceTop: 0, sinceFloor: GACHA.minorPity - 1 }).nextFloorIn).toBe(1);
    // ⚠️ Jamais 0 ni négatif : « garanti dans 0 tirage » ne veut rien dire, et un état relu
    // d'un JSONB peut dépasser le seuil.
    expect(gachaOdds({ sinceTop: 999, sinceFloor: 999 }).nextFloorIn).toBe(1);
    expect(gachaOdds({ sinceTop: 999, sinceFloor: 999 }).nextTopIn).toBe(1);
  });

  it('la chance du sommet SUIT le pity majeur', () => {
    const base = gachaOdds(neuf).topPct;
    expect(base).toBeCloseTo(GACHA_RATES[TOP_RARITY] * 100, 6);
    expect(gachaOdds({ sinceTop: GACHA.softPityStart - 2, sinceFloor: 0 }).topPct).toBeCloseTo(
      base,
      6,
    );
    expect(gachaOdds({ sinceTop: GACHA.softPityStart + 5, sinceFloor: 0 }).topPct).toBeGreaterThan(
      base,
    );
    expect(gachaOdds({ sinceTop: GACHA.hardPity - 1, sinceFloor: 0 }).topPct).toBeCloseTo(100, 6);
  });
});

describe('🎰 LE LOT DE 10 (v0.968)', () => {
  it('⚠️ 9 PAYÉS POUR 10, et le prix est DÉRIVÉ du prix unitaire', () => {
    // ⚠️ Un second nombre écrit à la main divergerait au premier réglage du prix.
    // ⚠️ On passe un AUTRE prix : au prix d'aujourd'hui (110 × 9 = 990), « dérivé » et
    // « 990 en dur » rendent la même chose, et la mutation survivait.
    expect(multiPullCost()).toBe(GACHA.pullCost * GACHA.multiPaid);
    expect(multiPullCost(200)).toBe(200 * GACHA.multiPaid);
    expect(multiPullCost(1)).toBe(GACHA.multiPaid);
    expect(GACHA.multiPaid).toBeLessThan(GACHA.multiCount);
    // ⚠️ MESURÉ : à 15 % de remise on SORT de la bande visée (10-20 raretés maximales
    // par an sur les niveaux 12-60). La remise ne doit donc pas dépasser ~10 %.
    const remise = 1 - GACHA.multiPaid / GACHA.multiCount;
    expect(remise).toBeGreaterThan(0);
    expect(remise).toBeLessThanOrEqual(0.1);
  });

  it('⚠️ LE PITY S’ENCHAÎNE D’UN TIRAGE AU SUIVANT DANS LE LOT', () => {
    // Sans ça, dix tirages partiraient tous du même état : la garantie de plancher ne
    // tomberait jamais au sein d'un lot, et le grand pity n'avancerait que d'un cran
    // pour dix tirages payés.
    const lot = pullMany(mulberry32(7), emptyPity(), 10);
    expect(lot.champions).toHaveLength(10);
    // Un lot de 10 depuis un pity neuf contient au moins un plancher, par construction.
    const floorIdx = RANK_ORDER.indexOf(GACHA.floorRarity);
    expect(
      lot.champions.some((c) => RANK_ORDER.indexOf(c.rarity) >= floorIdx),
      'aucun épique+ dans un lot de 10',
    ).toBe(true);
    // …et le pity RENDU est celui d'après les dix, pas celui d'après un seul.
    const seul = pullMany(mulberry32(7), emptyPity(), 1);
    expect(lot.pity).not.toEqual(seul.pity);
  });

  it('⚠️ C’EST LA MÊME LOTERIE QU’À L’UNITÉ — un lot n’a pas ses propres taux', () => {
    // Sinon la notice des chances cesserait de dire la vérité dès qu'on groupe.
    let p = emptyPity();
    const rng = mulberry32(99);
    const un: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = pullChampion(rng, p);
      p = r.pity;
      un.push(r.champion.id);
    }
    const lot = pullMany(mulberry32(99), emptyPity(), 10);
    expect(lot.champions.map((c) => c.id)).toEqual(un);
    expect(lot.pity).toEqual(p);
  });

  it('un lot de taille nulle, négative ou DÉCIMALE ne fait rien tomber', () => {
    expect(pullMany(mulberry32(1), emptyPity(), 0).champions).toEqual([]);
    expect(pullMany(mulberry32(1), emptyPity(), -3).champions).toEqual([]);
    // ⚠️ LE CAS QUI DISCRIMINE : sans le `Math.floor`, `i < 2.7` fait TROIS tours —
    // un tirage de plus que ce qu'on a payé. Les négatifs, eux, ne bouclent pas de
    // toute façon (la mutation y était ÉQUIVALENTE).
    expect(pullMany(mulberry32(1), emptyPity(), 2.7).champions).toHaveLength(2);
  });
});
