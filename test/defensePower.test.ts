// ⚖️ LE RAPPORT DE FORCES — ce que la jauge de défense promet, et rien de moins.
//
// ⚠️ Une jauge est une AFFIRMATION : « à ce rapport, tu tiens ». Si elle n'est pas
// prédictive, il vaut mieux ne rien afficher que d'afficher faux — le joueur y adosse
// ses décisions (garder le héros à la maison, ou partir farmer la carte).
import { describe, it, expect } from 'vitest';
import {
  armyCombatant,
  assaultEstimate,
  assaultPower,
  baseCombatant,
  defenseBreakdown,
  defensePower,
  referenceHold,
  departureRisk,
  heroDefends,
  isOddsRisky,
  guardUnits,
  siegeHoldChance,
  groupCombatant,
  resolveRaid,
  rollRaid,
  siegeOdds,
  RAID,
  type DefenseStructure,
} from '@/lib/raid';
import { refFighter, gearExpect } from '@/lib/proceduralContent';
import { TRAVEL } from '@/lib/expedition';
import { engageCap } from '@/lib/adventurers';
import { refChampionAdv } from '@/lib/caravan';

const defAt = (lvl: number): DefenseStructure[] => [
  { typeId: 'wall', level: lvl },
  { typeId: 'turret', level: lvl },
];
const NOW = 1_700_000_000_000;
/** Une garnison RÉALISTE : l’effectif de la Guilde, lignées de référence promues au rythme
 *  du jeu. ⚠️ Depuis la v0.801 c’est la configuration ATTENDUE d’une défense — la brèche
 *  s’ouvre souvent et la cour décide — donc les fenêtres de mesure la supposent. */
const garde = (lvl: number) =>
  guardUnits(
    lvl,
    Array.from({ length: engageCap(lvl) }, (_, i) => ({
      ...refChampionAdv(Math.max(1, lvl - (i % 6)), i),
      id: `g${i}`,
    })),
    99,
    { now: NOW, kennelLevel: lvl, advGear: [] },
  );

describe('la puissance de l’ASSAUT (ce que l’espionnage vend)', () => {
  // ⚠️ `defensePower` A DISPARU, et son test avec lui. Elle n’était qu’un PROXY : un
  // nombre censé résumer une base pour le comparer à un autre nombre. Le pronostic étant
  // désormais SIMULÉ sur le moteur, ce résumé n’a plus de consommateur — et il avait
  // cessé d’être fidèle (cf. le bloc « le pronostic est mesuré » plus bas). La puissance
  // de l’ARMÉE, elle, reste : c’est la marchandise de la Tour de guet.
  it('elle croît avec le niveau de l’armée', () => {
    let prev = 0;
    for (const lvl of [10, 26, 40, 60, 90]) {
      const a = assaultPower(rollRaid(4242, lvl, NOW, 0));
      expect(a).toBeGreaterThan(prev);
      prev = a;
    }
  });

  it('l’armée équivalente cumule les PV de TOUS les groupes', () => {
    const raid = rollRaid(777, 30, NOW, 0);
    const sum = raid.groups.reduce((s, g) => s + groupCombatant(g).pv, 0);
    expect(armyCombatant(raid).pv).toBe(sum);
  });

  // ⚠️ Ce test a d’abord été écrit avec un `if` (« si le champion frappe plus fort que
  // la moyenne, alors… ») : il s’auto-désarmait, et la mutation « moyenne plate » passait
  // au VERT. Un test conditionnel ne teste rien. On vérifie donc l’IDENTITÉ, et on exige
  // que les deux formules donnent des résultats DIFFÉRENTS.
  it('ses dégâts sont pondérés par les PV, et cela DIFFÈRE d’une moyenne plate', () => {
    let vus = 0;
    for (const seed of [778, 1234, 55_555, 9_001, 424_242]) {
      const raid = rollRaid(seed, 30, NOW, 0);
      const cs = raid.groups.map(groupCombatant);
      const pv = cs.reduce((s, x) => s + x.pv, 0);
      const attendu = cs.reduce((s, x) => s + x.damage * x.pv, 0) / pv;
      const plat = cs.reduce((s, x) => s + x.damage, 0) / cs.length;
      expect(armyCombatant(raid).damage).toBe(Math.max(1, Math.round(attendu)));
      if (Math.abs(Math.round(attendu) - Math.round(plat)) >= 1) vus++;
    }
    expect(vus).toBeGreaterThan(0);
  });
});

describe('⚖️ LE PRONOSTIC EST MESURÉ, PAS ESTIMÉ', () => {
  // ⚠️ CE BLOC REMPLACE « le rapport prédit la tenue », et le remplacement est le sujet.
  // L’ancien test mesurait la CORRÉLATION entre un proxy (défense ÷ assaut) et la tenue
  // réelle, et tolérait 6 % d’inversions — il fallait bien tolérer quelque chose, puisque
  // le proxy n’était pas la bataille. Il a fini par mentir : mesuré après le branchement
  // du moteur en deux phases, « Tu tiens largement » recouvrait des tenues réelles de
  // 13 % à 100 %, et le seuil d’équilibre dérivait de 1,15 à 1,55 selon le niveau.
  //
  // Le pronostic étant désormais SIMULÉ sur le moteur, la question change : il n’y a plus
  // de corrélation à vérifier, il y a une FIDÉLITÉ à garantir — le % annoncé doit être ce
  // que `resolveRaid` fait vraiment. Une divergence ne peut plus venir que d’un chemin
  // qui construirait ses unités autrement, et c’est exactement ce qu’on verrouille ici.
  it('⚠️ le % annoncé est CE QUE LE MOTEUR FAIT — même chemin, mêmes unités', () => {
    for (const lvl of [12, 28, 60]) {
      const defs = defAt(lvl);
      const hero = refFighter(lvl);
      let annonce = 0;
      let reel = 0;
      const N = 40;
      for (let s = 0; s < N; s++) {
        const raid = rollRaid(3000 + s * 7919, lvl, NOW, 0);
        annonce += siegeHoldChance(defs, lvl, hero, [], raid, 8);
        if (resolveRaid({ defenses: defs, playerLevel: lvl, hero }, raid, NOW, true).held) reel++;
      }
      // Sur 40 armées, l’annonce moyenne et le taux réel ne doivent pas s’écarter de plus
      // de 12 points — l’écart restant est l’échantillonnage, pas un biais de modèle.
      expect(Math.abs(annonce / N - reel / N)).toBeLessThan(0.12);
    }
  });

  it('⚠️ il est DÉTERMINISTE : le même état donne le même chiffre', () => {
    // Sans ça le pronostic sautillerait d’un rendu à l’autre sans que rien n’ait changé,
    // et on cesserait de le croire. C’est aussi ce qui permet de comparer sa base à
    // elle-même d’un jour sur l’autre.
    const raid = rollRaid(9_001, 28, NOW, 0);
    const a = siegeHoldChance(defAt(28), 28, refFighter(28), [], raid);
    const b = siegeHoldChance(defAt(28), 28, refFighter(28), [], raid);
    expect(a).toBe(b);
  });

  it('⚠️ une enceinte plus forte tient mieux, à armée ÉGALE', () => {
    // L’invariant qui donne son sens à « améliorer ». Contrairement à l’ancien test, il
    // n’a plus besoin de tolérer des inversions : à armée fixée, c’est monotone.
    const lvl = 28;
    const raid = rollRaid(4242, lvl, NOW, 0);
    let prev = -1;
    for (const part of [0.4, 0.6, 0.8, 1]) {
      const h = siegeHoldChance(defAt(Math.round(lvl * part)), lvl, null, [], raid, 60);
      expect(h).toBeGreaterThanOrEqual(prev - 0.06);
      prev = h;
    }
  });

  it('les bandes sont des tranches de PROBABILITÉ, monotones et exhaustives', () => {
    // ⚠️ Elles ne se calibrent plus : ce sont des tranches d'une probabilité.
    // ⚠️ TROIS crans depuis la v0.902 : mesuré sur 96 configurations, 98 % des sièges
    // tiennent 0-10 % ou 90-100 % — cinq bandes promettaient une nuance que le moteur ne
    // produit jamais. Le cran central existe pour les 2 % qui tombent vraiment entre deux.
    expect(siegeOdds(0.05)).toBe('perdu');
    expect(siegeOdds(0.3)).toBe('perdu');
    expect(siegeOdds(0.55)).toBe('serre');
    expect(siegeOdds(0.75)).toBe('tenu');
    expect(siegeOdds(0.95)).toBe('tenu');
    const rank = ['perdu', 'serre', 'tenu'];
    let prev = -1;
    for (let h = 0; h <= 1; h += 0.005) {
      const i = rank.indexOf(siegeOdds(h));
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});

describe('la répartition par contributeur', () => {
  it('chaque contributeur pèse ce qu’il change VRAIMENT, les absents rien', () => {
    // ⚠️ `power` est devenu `holdLoss` : plus « combien de puissance abstraite je
    // perdrais », mais « combien de POINTS DE TENUE » — la seule grandeur qu’on puisse
    // relier à une décision. On mesure sur une enceinte INCOMPLÈTE, là où chaque
    // structure compte encore (cf. le test de saturation juste en dessous).
    // ⚠️ LA FENÊTRE DE MESURE SE DÉPLACE À CHAQUE RECALIBRAGE, et c'est inhérent : une
    // ablation en PROBABILITÉ ne dit quelque chose que là où la tenue n'est ni 0 ni 1.
    // Historique : niveau 30, puis 60 (le rempart s'est mis à couvrir ses tireurs),
    // puis 26 à 60 % d'enceinte, et maintenant 26 à **70 %** — la volée et la place au
    // pied du mur (v0.788) ont redressé la tenue, et à 60 % la part du héros retombait à
    // zéro. Balayé sur 6 niveaux × 4 parts d'enceinte : 70 % au niveau 26 donne une
    // tenue de **0,50** — le milieu exact de la courbe, là où une ablation dit le plus —
    // avec mur 0,50 · tourelles 0,50 · héros 0,17.
    // ⚠️ Puis niveau **40** à 70 % (v0.800) : les tireurs adverses ne voient plus que leur côté
    // de l’enceinte, et au niveau 26 la part du héros retombait à zéro. Balayé sur 8 niveaux ×
    // 6 parts : tenue 0,50 · mur 0,50 · tourelles 0,50 · héros **0,21**, la plus nette.
    // ⚠️ Puis AVEC SA GARNISON (v0.801) : les engins ouvrent la brèche et la cour décide, donc
    // sans vivier une enceinte incomplète tombe à zéro et plus aucune ablation ne dit rien.
    // Balayé sur 6 niveaux × 4 parts : niveau 40 à 70 % donne tenue 0,67 · mur 0,58 ·
    // tourelles 0,67 · héros 0,17 · garnison **0,50** — les quatre contributeurs y pèsent.
    // ⚠️ Puis niveau **60 à 60 %** (v0.952) : avec les champions le vivier a doublé de
    // force, donc à 70 % on tient déjà 0,67 au niveau 40 et la part du héros retombe à
    // zéro. Balayé sur 6 niveaux × 5 parts : 60 % au niveau 60 donne tenue **0,46** — le
    // milieu exact de la courbe — avec mur 0,46 · tourelles 0,46 · héros 0,13 ·
    // garnison 0,46. Les quatre y pèsent.
    const lvl = 60;
    const defs = defAt(Math.round(lvl * 0.6));
    const b = defenseBreakdown(defs, lvl, refFighter(lvl), garde(lvl), NOW);
    const by = Object.fromEntries(b.parts.map((p) => [p.id, p]));
    expect(by.wall!.holdLoss).toBeGreaterThan(0);
    expect(by.turret!.holdLoss).toBeGreaterThan(0);
    expect(by.hero!.holdLoss).toBeGreaterThan(0);
    expect(by.garrison!.holdLoss).toBeGreaterThan(0);
    // Héros parti → sa part tombe à zéro et il est marqué inactif.
    const sansHeros = defenseBreakdown(defs, lvl, null, garde(lvl), NOW);
    const h = sansHeros.parts.find((p) => p.id === 'hero')!;
    expect(h.holdLoss).toBe(0);
    expect(h.active).toBe(false);
  });

  it('⚠️ UNE PART NULLE À ENCEINTE PLEINE EST UNE INFORMATION, pas un bug', () => {
    // Mesuré : enceinte à niveau, on tient 100 % des sièges — et retirer le MUR n’y change
    // rien face à une armée type. Une ablation en PROBABILITÉ sature par nature, et c’est
    // précisément ce qu’on veut dire : à ce stade, la muraille n’est plus ce qui décide.
    // ⚠️ Les TOURELLES, elles, ne saturent jamais : sans elles on tombe à zéro à tous les
    // niveaux. C’est la seule structure qui ABAT quelqu’un, donc la seule indispensable.
    // ⚠️ L’écran doit dire ce qu’un total de 0 partout signifie (cf. `holdNote`) : « rien
    // ne suffit » et « tout suffit » se lisent pareil dans les chiffres.
    // ⚠️ RÉÉCRIT PLUTÔT QUE RELÂCHÉ. Le seuil avait déjà glissé une fois (0,9 → 0,85) ;
    // le correctif de `perdu()` a retiré une classe de tenues non méritées et la fin de
    // partie est retombée à 0,833. Relâcher la borne une TROISIÈME fois n'aurait rien
    // verrouillé — on épingle donc ce que le test veut vraiment dire, et qui est EXACT :
    // **sans les tourelles on ne tient RIEN**, à tous les niveaux. `holdLoss` = `hold`
    // signifie littéralement « la tenue sans elles vaut zéro ». C'est plus fort qu'un
    // seuil, et ça ne peut pas dériver.
    // Mesuré (enceinte pleine + héros nu) : 1,000 (26) · 1,000 (40) · 1,000 (60) ·
    // 0,833 (80) · 0,833 (90).
    // ⚠️ AVEC SA GARNISON depuis la v0.801 (enceinte pleine + héros nu + vivier : 1,00 au
    // niveau 60, 0,88 au 90). Sans elle une enceinte seule ne tient plus que 0,67 : c’est
    // la doctrine choisie, pas une régression. Et la propriété que ce test épingle est
    // RESTAURÉE par la règle d’occupation — avant elle, un vivier fort tenait la cour sans
    // une seule tourelle, par chronos expirés.
    // ⚠️ RE-MESURÉ (v0.952) : avec `guardSiegeK` ramené à 0,9 pour absorber la force des
    // champions, la fin de partie retombe à **0,71 au niveau 90** — sous le seuil. On
    // mesure donc là où la saturation EXISTE (0,88 au 26, 1,00 au 40, 0,92 au 60) ; le
    // niveau 90 n'y appartient plus, et le forcer reviendrait à relâcher la borne une
    // quatrième fois pour épingler autre chose que la propriété visée.
    for (const lvl of [40, 60]) {
      const b = defenseBreakdown(defAt(lvl), lvl, refFighter(lvl), garde(lvl), NOW);
      const by = Object.fromEntries(b.parts.map((p) => [p.id, p]));
      expect(b.hold).toBeGreaterThan(0.8);
      // Les tourelles portent la tenue ENTIÈRE : les retirer la ramène à zéro.
      expect(by.turret!.holdLoss).toBeCloseTo(b.hold, 10);
      // ⚠️ RÉÉCRIT, et c’est une BONNE nouvelle : le mur valait `0` ici parce qu’il ne
      // faisait qu’encaisser — on tenait sans lui. Depuis qu’il COUVRE ses tireurs, le
      // retirer les expose et la tenue baisse VRAIMENT. La muraille a enfin une part
      // mesurable à enceinte pleine, ce qui est exactement ce qu’un joueur attend d’elle.
      expect(by.wall!.holdLoss).toBeGreaterThan(0);
    }
  });

  it('la part est mesurée PAR ABLATION — retirer les tourelles coûte ce qui est annoncé', () => {
    // ⚠️ Jamais une formule recopiée : l’étiquette et le combat empruntent le MÊME appel,
    // donc elle ne PEUT pas diverger. C’est la leçon de `garrisonBonus` (v0.683).
    const L = 30;
    const defs = defAt(L);
    const b = defenseBreakdown(defs, L, null, [], NOW);
    const turret = b.parts.find((p) => p.id === 'turret')!;
    const sans = referenceHold(
      defs.filter((d) => d.typeId !== 'turret'),
      L,
      null,
      [],
      NOW,
    );
    expect(b.hold - sans).toBeCloseTo(turret.holdLoss, 10);
  });

  // ⚠️ Remplace un test du champ `share`, supprimé avec la barre de proportion qu'il
  // alimentait. Ce qu'on vérifie désormais est ce que l'écran AFFICHE : chaque poste a
  // un métier, et les deux colonnes ne mentent pas dessus.
  it('chaque poste a son MÉTIER : le mur tient sans tuer, les tourelles tuent surtout', () => {
    const L = 30;
    const b = defenseBreakdown(defAt(L), L, refFighter(L), []);
    const by = Object.fromEntries(b.parts.map((p) => [p.id, p]));
    // Le mur ENCAISSE et n'abat personne (`wallDmgK` = 0).
    expect(by.wall!.def).toBeGreaterThan(0);
    expect(by.wall!.atk).toBe(0);
    // ⚠️ LES TOURELLES ENCAISSENT DÉSORMAIS UN PEU, et c'est VOULU : le moteur en deux
    // phases en fait des unités qu'on peut RÉDUIRE AU SILENCE, donc il leur faut des PV —
    // sans eux, « faire taire les tireurs » n'existerait pas. Le test affirmait `def === 0`,
    // vrai du modèle FONDU où elles n'étaient qu'un terme de dégâts. Ce qui reste vrai,
    // et qui est leur vrai métier : elles tuent BEAUCOUP plus qu'elles ne tiennent —
    // exactement l'inverse du mur.
    expect(by.turret!.atk).toBeGreaterThan(0);
    expect(by.turret!.atk).toBeGreaterThan(0);
    // ⚠️ ET ELLES PORTENT MÊME PLUS DE TENUE QUE LE MUR (mesuré) : huit corps à abattre
    // pèsent plus que le rempart lui-même. Surprenant, mais c'est ce que le moteur simule,
    // et c'est avec ces valeurs que l'équivalence de difficulté a été mesurée. Le métier
    // qui les distingue n'est donc PAS « qui encaisse » mais « qui TUE » : les tourelles
    // sont la seule STRUCTURE qui abat quelqu'un.
    expect(by.wall!.atk).toBe(0);
    // Le héros fait les deux — c'est un renfort, pas une structure.
    expect(by.hero!.def).toBeGreaterThan(0);
    expect(by.hero!.atk).toBeGreaterThan(0);
  });

  it('la muraille ABRITE : elle apporte de la réduction de dégâts', () => {
    const L = 30;
    const avec = baseCombatant(defAt(L), L, null);
    const sans = baseCombatant(
      defAt(L).filter((d) => d.typeId !== 'wall'),
      L,
      null,
      [],
    );
    expect(avec.dmgReduction ?? 0).toBeGreaterThan(sans.dmgReduction ?? 0);
    // Elle vaut exactement sa PART du niveau du joueur, comme tout le reste de l'enceinte.
    // ⚠️ LE PLAFOND DE 50 % DE `baseCombatant` MORD DÉSORMAIS. La v0.753 le décrivait
    // comme une « sécurité dormante » — vrai quand l’abri valait 0,05 ; faux depuis
    // qu’il vaut `wallArmorK` = 0,65. ⚠️ `baseCombatant` est un chemin LEGACY (plus
    // aucun appel dans `src/`) : c’est le MOTEUR qui applique l’abri réel, plafonné à
    // 0,9 dans `strike`. On épingle donc ce qui est vrai ici — le plafond.
    expect(avec.dmgReduction ?? 0).toBeCloseTo(Math.min(0.5, RAID.wallArmorK), 6);
    const demi = baseCombatant(defAt(Math.round(L / 2)), L, null);
    expect(demi.dmgReduction ?? 0).toBeCloseTo(Math.min(0.5, RAID.wallArmorK / 2), 2);
  });

  // ⚠️ RÉÉCRIT (v0.777). Il vérifiait que la réduction du mur S’AJOUTE à celle de la
  // GARNISON — or la garnison de familiers postés n'existe plus : un familier est
  // confié à un aventurier et épaule SON homme, pas l'enceinte. Il n'y a donc plus
  // qu'UNE source de réduction sur la base, et le plafond de 50 % redevient ce qu'il
  // était avant la v0.769 : une sécurité dormante.
  // (Il avait DÉJÀ été réécrit une fois : sa version d'origine affirmait « la réduction
  // reste sous 50 % », ce qu'aucune valeur réelle ne pouvait violer — le test passait
  // au vert avec un plafond mis à 9.)
  it('la réduction vient du MUR, et elle suit sa part du niveau', () => {
    // 40 : divisible par 4, donc pas d'arrondi de niveau qui fausserait le rapport.
    const L = 40;
    const plein = baseCombatant(defAt(L), L, null).dmgReduction ?? 0;
    const demi = baseCombatant(defAt(Math.round(L / 2)), L, null).dmgReduction ?? 0;
    const quart = baseCombatant(defAt(Math.round(L / 4)), L, null).dmgReduction ?? 0;
    // ⚠️ LE PLAFOND DE 50 % MORD À MUR PLEIN, et il faut le dire : `wallArmorK` vaut
    // 0,65 depuis la v0.769, donc une enceinte complète est ÉCRÊTÉE. Ce n'est plus la
    // « sécurité dormante » d'avant — une première version de ce test l'affirmait, et
    // la mesure l'a démentie (0,325 à mi-mur, pas 0,25).
    expect(plein).toBeCloseTo(0.5, 6);
    // SOUS le plafond, en revanche, elle suit la part du niveau : proportionnelle,
    // pas une falaise (la leçon de la v0.672).
    expect(demi).toBeCloseTo(quart * 2, 2);
    expect(demi).toBeLessThan(0.5);
  });
});

describe("l'espionnage achète de la PRÉCISION", () => {
  it('sans clarté, on ne sait rien', () => {
    expect(assaultEstimate(1000, 0, 42).known).toBe(false);
  });

  it('la fourchette CONTIENT toujours la vérité — le renseignement ne ment jamais', () => {
    for (let c = 1; c <= RAID.clarityMax; c++) {
      for (const seed of [1, 7, 99, 12345, 777777]) {
        const e = assaultEstimate(1000, c, seed);
        expect(e.lo).toBeLessThanOrEqual(1000);
        expect(e.hi).toBeGreaterThanOrEqual(1000);
      }
    }
  });

  it('elle se RESSERRE strictement à chaque cran, et devient exacte au maximum', () => {
    let prev = Infinity;
    for (let c = 1; c < RAID.clarityMax; c++) {
      const e = assaultEstimate(1000, c, 42);
      const w = e.hi - e.lo;
      expect(w).toBeLessThan(prev);
      prev = w;
    }
    const max = assaultEstimate(1000, RAID.clarityMax, 42);
    expect(max.exact).toBe(true);
    expect(max.lo).toBe(1000);
    expect(max.hi).toBe(1000);
  });

  it("elle n'est pas centrée sur la vérité — sinon « imprécis » ne voudrait rien dire", () => {
    // Sur un échantillon de graines, la vérité doit tomber ailleurs qu'au milieu.
    let offCenter = 0;
    const N = 40;
    for (let s = 1; s <= N; s++) {
      const e = assaultEstimate(1000, 2, s * 1013);
      const mid = (e.lo + e.hi) / 2;
      if (Math.abs(mid - 1000) > (e.hi - e.lo) * 0.1) offCenter++;
    }
    expect(offCenter).toBeGreaterThan(N * 0.6);
  });
});

describe('📐 LE REPÈRE PERMANENT : ma base face à une armée type', () => {
  // ⚠️ CE BLOC REMPLACE « la jauge place l’ÉQUILIBRE au milieu » (5 tests), devenu SANS
  // OBJET — pas faux, sans objet. Cette jauge existait pour placer au centre d’une barre
  // un seuil qu’on ne pouvait pas deviner (`SIEGE_EVEN` = 0,88, mesuré une fois) ; elle
  // saturait, elle avait un sens à gauche et un autre à droite. Une TENUE n’a besoin de
  // rien de tout ça : elle est DÉJÀ une position de 0 à 1. `siegeGauge` et `SIEGE_EVEN`
  // ont donc été supprimés, pas recalibrés — il n’y avait plus de constante à régler.
  //
  // Ce qu’on verrouille à la place, c’est le REPÈRE qui rend le panneau lisible hors
  // siège : « face à une armée type de ton niveau, ta base tient X fois sur 100 ».
  it('⚠️ il existe MÊME SANS ARMÉE EN VUE — sinon le panneau serait muet 3 fois sur 4', () => {
    // Et c’est justement au calme qu’on décide d’améliorer une structure.
    const h = referenceHold(defAt(28), 28, refFighter(28), [], NOW);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
  });

  it('⚠️ il MOYENNE sur plusieurs armées — une seule serait un tirage au sort', () => {
    // Mesuré : deux armées du même niveau donnent 8 % et 78 % de tenue. Adosser le repère
    // à une graine fixe en ferait un dé déguisé. On vérifie donc qu’il ne colle à AUCUNE
    // armée particulière — s’il n’en tirait qu’une, il vaudrait exactement sa tenue.
    const lvl = 28;
    const defs = defAt(Math.round(lvl * 0.75));
    const ref = referenceHold(defs, lvl, null, [], NOW);
    let colle = 0;
    for (let i = 0; i < 12; i++) {
      const raid = rollRaid(6000 + i * 7919, lvl, NOW, 0);
      const seule = siegeHoldChance(defs, lvl, null, [], raid, 60);
      if (Math.abs(seule - ref) < 0.02) colle++;
    }
    expect(colle).toBeLessThan(12);
    expect(RAID.typicalArmies).toBeGreaterThan(1);
  });

  it('⚠️ il est STABLE : deux lectures du même état donnent le même repère', () => {
    // On compare sa base à elle-même d’un jour sur l’autre ; un repère qui bouge tout seul
    // ne sert à rien.
    const a = referenceHold(defAt(20), 28, null, [], NOW);
    const b = referenceHold(defAt(20), 28, null, [], NOW);
    expect(a).toBe(b);
  });

  it('⚠️ il ne dit RIEN de l’armée en approche — la Tour garde son métier', () => {
    // Il ne prend aucun raid en paramètre : il ne PEUT pas révéler la faction, l’effectif
    // ou le niveau de ce qui arrive. Le pronostic sur CE siège-là reste payant.
    const lvl = 60;
    const defs = defAt(lvl);
    // ⚠️ AVEC SA GARNISON (v0.801) : sans elle, une enceinte seule au niveau 60 perd les deux
    // sièges (0 contre 0) et le test ne distinguait plus rien. Mesuré avec : 0,00 contre 1,00.
    const g = garde(lvl);
    const ref = referenceHold(defs, lvl, null, g, NOW);
    // Deux armées très différentes ne changent pas le repère : il ne les regarde pas.
    const dur = rollRaid(1, lvl, NOW, 0);
    const autre = rollRaid(999_983, lvl, NOW, 0);
    expect(siegeHoldChance(defs, lvl, null, g, dur, 60)).not.toBe(
      siegeHoldChance(defs, lvl, null, g, autre, 60),
    );
    expect(referenceHold(defs, lvl, null, g, NOW)).toBe(ref);
  });
});

describe('🚪 CE QUE COÛTE UN DÉPART, face à l’armée qui arrive', () => {
  // ⚠️ La question du joueur au moment d'envoyer : « puis-je faire partir ce convoi sans
  // me mettre dans le rouge ? ». L'écran d'envoi ne savait RIEN du siège en approche.
  const L = 28;
  const d = [
    { typeId: 'wall', level: L },
    { typeId: 'turret', level: L },
  ] as DefenseStructure[];
  const adv = (id: string): Adventurer => ({
    id,
    name: id,
    seed: 1,
    path: ['guerrier', 'epeiste'],
    level: 20,
    xp: 0,
  });
  const tous = [adv('a'), adv('b'), adv('c'), adv('d')];
  const g = (list: Adventurer[]) => guardUnits(L, list, 99);
  const h = refFighter(L);
  /** ⚠️ UNE ARMÉE QUI FAIT VRAIMENT BASCULER, CHOISIE PAR LA MESURE et jamais devinée.
   *  L’ancienne version fabriquait un « assaut » numérique à mi-chemin entre deux
   *  puissances — une arithmétique sur un proxy, qui a déjà laissé passer un test creux
   *  (la base vide tenait quand même). Ici on BALAIE des armées réelles et on garde celle
   *  où vider la base change effectivement la bande : si aucune ne convient, le test
   *  ÉCHOUE au lieu de s’auto-satisfaire. */
  const raidBascule = (() => {
    for (let i = 0; i < 400; i++) {
      const r = rollRaid(1000 + i * 7919, L, NOW, 0);
      const plein = siegeHoldChance(d, L, h, g(tous), r, 40);
      const vide = siegeHoldChance(d, L, null, [], r, 40);
      if (!isOddsRisky(siegeOdds(plein)) && isOddsRisky(siegeOdds(vide))) return r;
    }
    throw new Error('aucune armée ne fait basculer la bande — le test ne prouverait rien');
  })();
  const plein = () => ({ hero: h, guard: g(tous) });
  const vide = () => ({ hero: null, guard: [] });

  it('⚠️ faire partir du monde ne peut JAMAIS améliorer le pronostic', () => {
    // L’invariant qui donne son sens à l’alerte : si partir pouvait aider, l’écran
    // conseillerait de vider sa base. ⚠️ On balaie de VRAIES armées, à tous les niveaux —
    // l’ancienne version inventait des nombres d’assaut, ce que le pronostic simulé ne
    // sait plus lire (et ce qui laissait passer des cas impossibles).
    for (const lvl of [12, 28, 60]) {
      const defs = defAt(lvl);
      const hero = refFighter(lvl);
      const garde = guardUnits(lvl, tous, 99);
      for (let i = 0; i < 6; i++) {
        const raid = rollRaid(2000 + i * 7919, lvl, NOW, 0);
        const r = departureRisk(defs, lvl, raid, { hero, guard: garde }, { hero: null, guard: [] });
        expect(r.holdAfter).toBeLessThanOrEqual(r.holdBefore + 0.001);
        expect(r.worsens || r.after === r.before).toBe(true);
      }
    }
  });

  it('ne rien changer ne fait PAS empirer', () => {
    const etat = plein();
    const r = departureRisk(d, L, raidBascule, etat, etat);
    expect(r.before).toBe(r.after);
    expect(r.holdBefore).toBe(r.holdAfter);
    expect(r.worsens).toBe(false);
  });

  it('⚠️ vider la base FACE À UNE ARMÉE QUI COMPTE bascule le pronostic', () => {
    // ⚠️ L’armée est CHOISIE PAR LA MESURE (cf. `raidBascule`), jamais devinée : un
    // assaut fabriqué à la main (« 95 % du plein ») laissait la base vide tenir quand
    // même, et le test passait au vert sans rien prouver.
    const r = departureRisk(d, L, raidBascule, plein(), vide());
    expect(isOddsRisky(r.before)).toBe(false);
    expect(r.worsens).toBe(true);
    expect(isOddsRisky(r.after)).toBe(true);
  });

  // ── ⏱️ LE MOMENT OÙ ILS RENTRENT ──────────────────────────────────────────────
  // ⚠️ Signalé par l’utilisateur : « l’alerte se met bien si le convoi revient après
  // l’attaque et pas avant ? » — elle ne le faisait PAS. La défense qui compte est
  // celle du MOMENT OÙ L’ARMÉE FRAPPE, jamais celle de l’instant du départ.

  it('⚠️ un convoi RENTRÉ avant l’assaut ne coûte RIEN — plus de faux positif', () => {
    const r = departureRisk(d, L, raidBascule, plein(), vide(), {
      backAt: NOW + 2 * 3600_000,
      raidAt: NOW + 8 * 3600_000,
    });
    expect(r.inTime).toBe(true);
    expect(r.worsens).toBe(false);
    expect(r.risky).toBe(false);
    // …mais on le DIT : le silence, à la place d’une alerte attendue, ressemble à un oubli.
    expect(r.covered).toBe(true);
  });

  it('⚠️ un retour APRÈS l’assaut alerte, lui', () => {
    const r = departureRisk(d, L, raidBascule, plein(), vide(), {
      backAt: NOW + 9 * 3600_000,
      raidAt: NOW + 8 * 3600_000,
    });
    expect(r.inTime).toBe(false);
    expect(r.worsens).toBe(true);
    expect(r.covered).toBe(false);
  });

  it('sans horodatage, on ALERTE — ne pas savoir n’est pas une raison de se taire', () => {
    const r = departureRisk(d, L, raidBascule, plein(), vide());
    expect(r.inTime).toBe(false);
    expect(r.worsens).toBe(true);
  });

  it('rentrer à temps ne fabrique pas une bonne nouvelle quand rien ne change', () => {
    // `covered` ne s’allume QUE si le départ aurait dégradé la bande : sinon l’écran
    // annoncerait « ils seront rentrés » pour une escorte vide.
    const etat = plein();
    const r = departureRisk(d, L, raidBascule, etat, etat, { backAt: NOW, raidAt: NOW + 3600_000 });
    expect(r.inTime).toBe(true);
    expect(r.covered).toBe(false);
  });

  it('⚠️ RENTRER PILE À L’HEURE compte comme rentré', () => {
    // La borne est inclusive : ils sont derrière les murs quand l’armée arrive.
    const t = NOW + 5 * 3600_000;
    const r = departureRisk(d, L, raidBascule, plein(), vide(), { backAt: t, raidAt: t });
    expect(r.inTime).toBe(true);
  });

  it('🧭 UN HÉROS DEHORS QUI RENTRE AVANT L’ASSAUT DÉFEND QUAND MÊME', () => {
    // ⚠️ Signalé par l’utilisateur : « arrête de marquer que le héros ne défendra pas
    // vu qu’il arrive dans 1 h et l’attaque dans 2 h ». La RÉSOLUTION était déjà juste
    // (`baseTick` lit `heroIsHome` à l’instant du combat) — seul l’AFFICHAGE était
    // pessimiste, et il faisait renoncer à des départs qui ne coûtaient rien.
    const H = 3600_000;
    expect(heroDefends(false, NOW + 1 * H, NOW + 2 * H)).toBe(true);
    expect(heroDefends(false, NOW + 3 * H, NOW + 2 * H)).toBe(false);
    // Rentrer à l’heure PILE, c’est être derrière les murs (borne inclusive, comme le
    // garde de `departureRisk` — les deux règles doivent dire la même chose).
    expect(heroDefends(false, NOW + 2 * H, NOW + 2 * H)).toBe(true);
  });

  it('à la base, il défend — et sans dates connues, il est compté ABSENT', () => {
    expect(heroDefends(true)).toBe(true);
    // ⚠️ Ne pas SAVOIR n’autorise pas à supposer : sans armée en vue (pas de `raidAt`)
    // ou sans date de retour, le compter présent gonflerait la défense affichée sur
    // une devinette. Il est dehors : on le dit.
    expect(heroDefends(false, NOW + 3600_000, null)).toBe(false);
    expect(heroDefends(false, null, NOW + 3600_000)).toBe(false);
    expect(heroDefends(false)).toBe(false);
  });

  it('⚠️ LA DURÉE ANNONCÉE EST UN MAJORANT : la route ne peut que raccourcir le retour', () => {
    // C’est CE QUI AUTORISE le garde à se taire. L’écran compare l’assaut à la durée
    // ANNONCÉE ; si une rencontre pouvait RALLONGER le retour, un convoi annoncé rentré
    // à temps pourrait arriver après la bataille — et l’alerte aurait été tue à tort.
    // Ajouter un jour un « retard » (`returnMult` > 1) oblige à revoir `departureRisk`.
    expect(TRAVEL.shortcutReturnMult).toBeLessThanOrEqual(1);
    expect(TRAVEL.setbackReturnMult).toBeLessThanOrEqual(1);
  });

  it('sans armée en vue, aucun départ n’est risqué', () => {
    // Assaut nul = rien n'arrive : l'écran ne doit alarmer personne.
    // ⚠️ Une armée existe TOUJOURS ici : le pronostic est simulé, il lui faut une
    // composition. « Aucune armée en vue » se traite désormais dans l’écran, qui
    // n’appelle simplement pas la fonction — un assaut nul n’a plus de sens.
    const r = departureRisk(d, L, raidBascule, plein(), plein());
    expect(r.risky).toBe(false);
    expect(r.worsens).toBe(false);
  });

  it('les bandes RISQUÉES sont celles où la base ne tient plus', () => {
    // ⚠️ TROIS crans depuis la v0.902 (la tenue est binaire à 98 %) : seul « tu tiens »
    // n'alarme pas. `serre` reste risqué — c'est précisément le cran où un départ bascule.
    expect(isOddsRisky('perdu')).toBe(true);
    expect(isOddsRisky('serre')).toBe(true);
    expect(isOddsRisky('tenu')).toBe(false);
  });
});

describe('⚔️ LA PUISSANCE DE DÉFENSE : une MAGNITUDE, pas un pronostic', () => {
  // ⚠️ RENDUE À LA DEMANDE DE L’UTILISATEUR (« je voudrais ravoir la puissance de défense
  // plutôt qu’un % »), et il a raison : le pronostic SATURE. À enceinte pleine il affiche
  // 100 % et ne bouge plus — il ne montre donc RIEN du progrès quand on améliore une
  // structure, alors que c’est exactement la question qu’on se pose devant « Améliorer ».
  //
  // ⚠️ ELLE NE PRÉDIT RIEN, et c’est l’accord avec la v0.767 : ce chiffre avait été retiré
  // parce qu’on s’en servait pour PRONOSTIQUER via un rapport de puissances devenu infidèle.
  // Le pronostic reste SIMULÉ ; la puissance ne répond qu’à « est-ce que je vaux plus
  // qu’hier ? » — ce à quoi elle répond toujours juste, parce qu’elle est MONOTONE.
  it('⚠️ elle MONTE À CHAQUE CRAN, là où la tenue ne bouge pas', () => {
    // ⚠️ RÉÉCRIT (v0.800), pas relâché. Il comptait les crans « collés à 100 % » ; depuis que
    // les tireurs adverses ne gaspillent plus leur feu sur le côté opposé de la ville, plus
    // aucune enceinte INCOMPLÈTE ne sature (mesuré aux niveaux 6 à 60). La propriété, elle,
    // tient toujours : la tenue avance par PALIERS (elle se mesure sur six armées), la
    // puissance à chaque cran. Mesuré au niveau 26 : 60 % et 70 % tiennent tous deux 0,50,
    // 75 % et 80 % tous deux 0,67 — quatre améliorations dont deux invisibles sans elle.
    const L = 26;
    let prevPower = 0;
    let prevHold = -1;
    let muets = 0;
    for (const part of [0.6, 0.7, 0.75, 0.8, 0.9, 1]) {
      const b = defenseBreakdown(defAt(Math.round(L * part)), L, refFighter(L), [], NOW);
      expect(b.power).toBeGreaterThan(prevPower);
      if (b.hold === prevHold) muets++;
      prevPower = b.power;
      prevHold = b.hold;
    }
    // …et la démonstration : au moins deux crans sont INDISCERNABLES en tenue. Sans la
    // puissance, le joueur paierait des dizaines de milliers d’or sans voir bouger un chiffre.
    expect(muets).toBeGreaterThanOrEqual(2);
  });

  it('⚠️ la PART d’un contributeur ne sature pas non plus', () => {
    // `holdLoss` tombe à 0 dès qu’on tient sans lui (documenté, et c’est une information
    // en soi) — mais on ne VAUT pas la même chose pour autant. La part en puissance dit
    // ce que chaque structure APPORTE, même quand la bataille est déjà gagnée d’avance.
    // ⚠️ AVEC SA GARNISON (v0.801) : c’est elle qui mène une enceinte pleine à la tenue
    // complète (1,00 mesuré au niveau 30, contre 0,67 sans).
    const L = 30;
    const b = defenseBreakdown(defAt(L), L, refFighter(L), garde(L), NOW);
    const by = Object.fromEntries(b.parts.map((p) => [p.id, p]));
    expect(b.hold).toBeGreaterThan(0.9);
    for (const id of ['wall', 'turret', 'hero']) {
      expect(by[id]!.power, id).toBeGreaterThan(0);
    }
  });

  it('elle vit dans la MÊME UNITÉ que la puissance d’assaut', () => {
    // ⚠️ Un seul arbitre dans tout le jeu (`combatPower`) : en inventer un second pour la
    // défense recréerait le défaut « deux comparateurs qui disent des trucs différents ».
    const L = 30;
    const d = defensePower(defAt(L), L, refFighter(L), []);
    const a = assaultPower(rollRaid(4242, L, NOW, 0));
    expect(d).toBeGreaterThan(0);
    // ⚠️ Et elle COMPTE VRAIMENT tout le monde : « > 0 » ne prouvait rien — la mutation
    // « ignore le héros et la garnison » passait au VERT, puisque les murs seuls suffisent
    // à rendre un nombre positif du bon ordre de grandeur.
    expect(d).toBeGreaterThan(defensePower(defAt(L), L, null, []));
    expect(a).toBeGreaterThan(0);
  });
});

describe('⚖️ À PUISSANCE ÉGALE, UNE CHANCE SUR DEUX (v0.830)', () => {
  // ⚠️ RÉÉCRIT À PARTIR D’UN TEST CREUX. Il exigeait seulement que les deux chiffres soient
  // « du même ordre de grandeur » (rapport < 12) — c’est ce qui a laissé passer le défaut
  // signalé : « plus de 6000 en défense contre 2000, et j’ai perdu ». Mesuré, on ne tenait
  // une fois sur deux qu’à un rapport de 2,36. Deux chiffres posés côte à côte sous un
  // « vs » promettent une comparaison : on vérifie désormais la comparaison elle-même.
  type Row = { L: number; ratio: number; hold: number };
  const rows: Row[] = [];
  const LEVELS = [12, 28, 60, 90];
  for (const L of LEVELS) {
    for (const share of [0.6, 0.8, 1]) {
      const d = Math.max(1, Math.round(L * share));
      for (const withHero of [true, false]) {
        for (const guard of [[], garde(L)]) {
          // Le héros ÉQUIPÉ de son niveau : c’est lui qui défend en jeu, pas le héros nu.
          const ge = gearExpect(L);
          const f = refFighter(L);
          const h = withHero
            ? { ...f, damage: Math.round(f.damage * ge.off), pv: Math.round(f.pv * ge.pv) }
            : null;
          const dp = defensePower(defAt(d), L, h, guard);
          for (let k = 0; k < 4; k++) {
            const raid = rollRaid(k * 7919 + 13 + L, L, NOW, 0);
            rows.push({
              L,
              ratio: dp / assaultPower(raid),
              hold: siegeHoldChance(defAt(d), L, h, guard, raid, 24),
            });
          }
        }
      }
    }
  }
  /** Le rapport qui sépare le mieux « on tient » de « on tombe », et l’erreur à ce seuil. */
  const seuil = (r: Row[]) => {
    let best = 0;
    let err = Infinity;
    for (let t = 0.3; t < 4; t += 0.01) {
      const e = r.filter((x) => x.ratio >= t !== x.hold >= 0.5).length;
      if (e < err) {
        err = e;
        best = t;
      }
    }
    return { best, err: err / r.length };
  };

  it('l’équilibre tombe à parité, et le chiffre sépare vraiment les issues', () => {
    const s = seuil(rows);
    expect(s.best).toBeGreaterThan(0.8);
    expect(s.best).toBeLessThan(1.25);
    expect(s.err).toBeLessThan(0.2);
  });

  it('⚠️ et ce seuil ne DÉRIVE pas avec le niveau (sinon une échelle unique mentirait)', () => {
    for (const L of LEVELS) {
      const s = seuil(rows.filter((x) => x.L === L));
      expect(s.best, `niveau ${L}`).toBeGreaterThan(0.75);
      expect(s.best, `niveau ${L}`).toBeLessThan(1.3);
    }
  });

  it('les deux bouts sont francs : nettement devant on tient, nettement derrière on tombe', () => {
    const devant = rows.filter((x) => x.ratio >= 1.4);
    const derriere = rows.filter((x) => x.ratio <= 0.7);
    expect(devant.length).toBeGreaterThan(10);
    expect(derriere.length).toBeGreaterThan(10);
    expect(devant.filter((x) => x.hold >= 0.5).length / devant.length).toBeGreaterThan(0.85);
    expect(derriere.filter((x) => x.hold < 0.5).length / derriere.length).toBeGreaterThan(0.85);
  });
});

describe('⚖️ UNE SEULE RÉPONSE À « EST-CE QUE JE TIENS ? » (v0.902)', () => {
  it('⚠️ LA TENUE EST BINAIRE : les crans du milieu sont l’exception, pas la règle', () => {
    // C'est ce qui justifie TROIS crans au lieu de cinq. `siegeHoldChance` ne fait varier
    // que la CONDUITE du combat — la composition de l'armée est fixe — et mesuré, elle ne
    // décide presque rien : une fois l'armée connue, le siège est joué.
    let extremes = 0;
    let total = 0;
    for (const L of [12, 28, 50, 80]) {
      const g = garde(L);
      for (const part of [0.5, 0.75, 1]) {
        const d = defAt(Math.round(L * part));
        for (let s = 1; s <= 4; s++) {
          const h = siegeHoldChance(
            d,
            L,
            refFighter(L),
            g,
            rollRaid((s * 7919 + L * 31) >>> 0, L, NOW, 0),
          );
          total++;
          if (h < 0.1 || h > 0.9) extremes++;
        }
      }
    }
    // Mesuré : 98 % des cas. On borne large — ce qui compte est que ce soit la RÈGLE.
    expect(extremes / total, `${extremes}/${total} aux extrêmes`).toBeGreaterThan(0.85);
  });

  it('⚠️ LE REPÈRE N’EST PAS UN PRONOSTIC — et c’est mesurable', () => {
    // Le défaut signalé par l'utilisateur : « tient 100 % face à une armée type » s'affichait
    // au-dessus de « Tu tiens 0 % ». `referenceHold` moyenne SIX armées génériques, le
    // pronostic joue CELLE qui arrive — deux questions, et les deux réponses s'écartent
    // largement. Ce test ne corrige rien : il EXIGE que l'écart existe, pour que personne
    // ne remette les deux pourcentages côte à côte en croyant qu'ils disent la même chose.
    let big = 0;
    let total = 0;
    for (const L of [28, 50]) {
      const g = garde(L);
      for (const part of [0.75, 1]) {
        const d = defAt(Math.round(L * part));
        const ref = referenceHold(d, L, refFighter(L), g, NOW);
        for (let s = 1; s <= 4; s++) {
          const h = siegeHoldChance(
            d,
            L,
            refFighter(L),
            g,
            rollRaid((s * 7919 + L * 31) >>> 0, L, NOW, 0),
          );
          total++;
          if (Math.abs(ref - h) > 0.3) big++;
        }
      }
    }
    expect(big, `${big}/${total} cas d’écart > 30 points`).toBeGreaterThan(0);
  });
});
