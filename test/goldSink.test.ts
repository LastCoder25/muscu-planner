import { describe, it, expect } from 'vitest';
import { buildingUpgradeCost, BUILDING_TYPES, plotsForLevel } from '@/lib/buildings';
import { goldCost, resolveOutcome } from '@/lib/expedition';
import { refFighter } from '@/lib/proceduralContent';
import { computeLevel } from '@/lib/levels';
import { PROFILS, partDuPlafond, yearOfPlay } from './helpers/buildSim';
import { DEFENSE_TYPES, healCost } from '@/lib/raid';
import { outfitGoldCost, ADV_GEAR_SLOTS } from '@/lib/advGear';
import { RANK_ORDER, prestigeRankIndex } from '@/lib/items';
// ⚠️ LE MODÈLE DE REVENU VIT DANS UN HELPER PARTAGÉ (`test/helpers/goldModel`) : le débit
// des CAMPS DE FACTION se mesure contre LE MÊME dénominateur, et deux copies auraient
// divergé — c'est par un mauvais dénominateur que ce fichier a déjà laissé passer un puits
// qui débordait (v0.684) puis un puits devenu mur (v0.733).
import { LEVELS, MINE_DIST, goldPerDay, fullGoldPerDay, mineNet } from './helpers/goldModel';

/** LE PUITS D'OR, mesuré contre le REVENU RÉEL.
 *
 *  ⚠️ ERREUR D'UNITÉ CORRIGÉE ICI (v0.684). Ce fichier comparait le coût d'un niveau de
 *  bâtiment à UNE expédition de mine. Or, mesuré sur un an, **79 % de l'or vient des
 *  donjons** — qu'on enchaîne ~8 fois par séance — et 14 % seulement des mines. Le
 *  dénominateur était donc ~13× trop petit : le test déclarait l'équilibre sain pendant
 *  que le joueur finissait l'année avec **149 M d'or en banque** et tout au plafond de
 *  son niveau dès le 2e mois. Un puits qui déborde n'est pas un puits.
 *
 *  ⚠️ DEUX INVARIANTS OPPOSÉS, et il faut les deux :
 *   • le coût doit DÉPASSER le revenu (sinon on est au plafond, l'or n'a plus d'emploi) ;
 *   • sans DÉRIVER avec le niveau (sinon c'est le MUR de la v0.657 : coût en L^2.6 contre
 *     revenus en L^1.6, 115 expéditions pour un niveau à 100, bâtiments gelés).
 *  D'où la règle : on déplace la courbe par son COEFFICIENT, jamais par son exposant. */

/** Monter d'un cran tous les bâtiments DÉBLOQUÉS à ce niveau : le rythme de croisière.
 *  (L'enceinte a sa courbe dédiée, testée dans `raid.test` et `scrapEconomy.test`.) */
const cranTotal = (L: number) =>
  buildingUpgradeCost(L) * Math.min(plotsForLevel(L), BUILDING_TYPES.length);

describe('⛑️ les soins d’urgence du héros coûtent cher, sans devenir un mur', () => {
  // Mesuré contre le MÊME revenu journalier que les bâtiments : une convalescence complète
  // (6 h) doit coûter une vraie part de la journée, au même prix relatif à tout niveau.
  it('6 h de convalescence ≈ ½ journée de revenu, du niveau 2 au 100', () => {
    for (const L of [2, ...LEVELS]) {
      const part = healCost(6 * 3600_000, L) / goldPerDay(L);
      expect(part, `niveau ${L} : ${part.toFixed(2)} journée`).toBeGreaterThan(0.35);
      expect(part, `niveau ${L} : ${part.toFixed(2)} journée`).toBeLessThan(0.7);
    }
  });
});

describe("puits d'or : on court toujours après les derniers niveaux", () => {
  it('⚠️ LA RÈGLE : un cran coûte PLUS qu’une journée de revenu, sans devenir un mur', () => {
    // ⚠️ MESURÉ PAR BÂTIMENT, plus sur « un cran sur TOUS ». Cette assertion portait sur
    // le total, qui mélange deux phénomènes — la forme de la courbe (ce qu'on veut
    // tester) et la montée de `plotsForLevel` — exactement le défaut que le test suivant
    // avait déjà corrigé de son côté. Le total faisait apparaître le niveau 5 comme une
    // anomalie (8,7 jours) alors qu'il a simplement 5 emplacements ouverts au lieu de 10.
    // ⚠️ LE PLAFOND PORTE SUR UN CRAN DE TOUTE LA BASE, plus « par bâtiment ». Le coût par
    // bâtiment bouge MÉCANIQUEMENT avec la taille du roster : passé de 9 à 6 types (Mine
    // d'or, Fonderie et Comptoir retirés), il monte de 2,0-2,7 à 3,1-4,2 jours — alors que
    // le puits n'a PAS changé de profondeur, `upBase` ayant été recalé pour compenser
    // (mesuré : 81/72/66 % du plafond sur un an, contre 84/74/68 % avant). Une borne posée
    // là rougit donc à chaque retrait sans rien garder de ce qui compte.
    // Ce que le joueur poursuit vraiment, c'est de monter SA BASE d'un cran, et ce total
    // est stable de part et d'autre du retrait : ~18 à 25 jours.
    for (const L of LEVELS) {
      const parBat = buildingUpgradeCost(L) / fullGoldPerDay(L);
      // ⚠️ CONTRE LE REVENU COMPLET (v0.996) : mesuré contre les seuls donjons + mines, le
      // cran paraissait plus cher qu’il ne l’est (la revente, les convois, les camps, les
      // boss et les sièges ajoutent ~+50 % au niveau 30).
      const jours = cranTotal(L) / fullGoldPerDay(L);
      // Sous quelques jours, on est en permanence au plafond de son niveau et l'or n'a
      // plus de destination.
      expect(jours, `niveau ${L} : ${jours.toFixed(2)} jour(s) de revenu`).toBeGreaterThan(12);
      // Au-delà, on ne progresse plus, on attend. ⚠️ C'est ce qui était livré : à `upBase`
      // 1320, un cran sur toute la base coûtait ~57 jours de revenu au niveau 28, et le
      // compte réel portait 312 jours de retard.
      expect(jours, `niveau ${L} : ${jours.toFixed(2)} jour(s) de revenu`).toBeLessThan(32);
      // …et un cran d'un SEUL bâtiment reste au-dessus d'une journée : un bâtiment qu'on
      // monte sans y penser n'est pas un puits.
      expect(parBat, `niveau ${L} : ${parBat.toFixed(2)} jour(s) par bâtiment`).toBeGreaterThan(1);
    }
  });

  it('⚠️ le ratio ne DÉRIVE pas avec le niveau — c’est le MUR de la v0.657 qu’on interdit', () => {
    // Le coût et le revenu doivent garder la même forme. Un exposant plus raide que celui
    // des revenus (L^1.6) creuse un écart qui grandit sans fin : à L^2.6 il fallait 13
    // expéditions pour un niveau au niveau 5, et 115 au niveau 100.
    // ⚠️ ON MESURE UN SEUL BÂTIMENT, pas « un cran sur tous ». Cette assertion portait sur
    // le total, qui mélange DEUX phénomènes : la forme de la courbe (ce qu’on veut tester)
    // et la montée de `plotsForLevel` (1 emplacement par niveau, jusqu’au roster). Passer
    // le roster de 7 à 10 a fait bondir l’écart de 1,96 à 2,80 — sans que l’exposant ait
    // bougé d’un iota. Le test accusait donc la courbe d’un défaut qui n’était pas le sien.
    const ratios = LEVELS.map((L) => buildingUpgradeCost(L) / fullGoldPerDay(L));
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    expect(max / min, `écart ${min.toFixed(2)} → ${max.toFixed(2)}`).toBeLessThan(2.5);

    // …et une fois TOUS les emplacements ouverts, le total ne dérive pas non plus.
    const pleins = LEVELS.filter((L) => plotsForLevel(L) >= BUILDING_TYPES.length).map(
      (L) => cranTotal(L) / fullGoldPerDay(L),
    );
    expect(Math.max(...pleins) / Math.min(...pleins)).toBeLessThan(2.5);
  });

  it('⚠️ POSER ses DEUX premiers bâtiments reste à portée d’un DÉBUTANT', () => {
    // C’est le seul chiffre qui décide si la base existe pour le joueur qu’elle vise. Le
    // puits d’or s’approfondit avec les niveaux ; l’ENTRÉE, elle, ne doit pas bouger.
    //
    // ⚠️ RÉÉCRIT, ET IL ÉTAIT DEVENU CREUX. Il nommait `caravanserail` et `guild` — deux
    // ids RETIRÉS du registre (le Comptoir est absorbé par l'Avant-poste, la Guilde par le
    // Panthéon). `find(...)?.buildGold ?? 0` rendait donc **0**, et « 0 < 1 » passait au
    // vert sans rien mesurer. Un test qui nomme des ids finit par nommer des fantômes :
    // on prend les DEUX MOINS CHERS du registre, ce qui reste vrai quel qu'il devienne.
    const deux = [...BUILDING_TYPES].sort((a, b) => a.buildGold - b.buildGold).slice(0, 2);
    expect(deux, 'il faut au moins deux bâtiments au registre').toHaveLength(2);
    const entree = deux.reduce((s, t) => s + t.buildGold, 0);
    expect(entree, 'un mur d’entrée doit être un vrai montant').toBeGreaterThan(0);
    for (const L of [3, 5, 8]) {
      expect(entree / goldPerDay(L), `niveau ${L}`).toBeLessThan(1);
    }
  });
  it('l’AMORÇAGE reste doux : construire ses premiers bâtiments ne demande pas une semaine', () => {
    // On durcit la MONTÉE, pas l'entrée. Poser un bâtiment doit rester à portée immédiate.
    for (const t of BUILDING_TYPES) expect(t.buildGold).toBeLessThan(goldPerDay(10));
    for (const t of DEFENSE_TYPES) expect(t.buildGold).toBeLessThan(goldPerDay(12));
  });

  it('le coût reste strictement croissant avec le niveau', () => {
    for (let L = 2; L <= 100; L++) {
      expect(buildingUpgradeCost(L)).toBeGreaterThan(buildingUpgradeCost(L - 1));
    }
  });

  it('⚠️ le puits tient MÊME pour un joueur qui optimise tout : revenu doublé', () => {
    // Garde-fou contre la régression qui a motivé cette réécriture : sous-estimer le
    // revenu fait déclarer sain un puits qui déborde. On refait donc la mesure avec un
    // revenu DEUX FOIS supérieur au modèle — un joueur plus assidu, mieux équipé, qui
    // enchaîne mines et donjons. Un cran doit encore coûter une demi-journée.
    for (const L of LEVELS) {
      const jours = buildingUpgradeCost(L) / (goldPerDay(L) * 2);
      expect(
        jours,
        `niveau ${L} : ${jours.toFixed(2)} jour(s) même à revenu doublé`,
      ).toBeGreaterThan(0.5);
    }
  });
  it('⚠️ LE MODÈLE DE REVENU NE DOIT PAS DÉRIVER DU JEU', () => {
    // ⚠️ CE TEST FERME LE TROU QUI A PRODUIT LES DEUX RÉGRESSIONS DE CE FICHIER.
    // Le reste du fichier compare des coûts à `goldPerDay` — une HYPOTHÈSE. Si elle
    // s'écarte du jeu, tout ce qui s'appuie dessus devient faux SANS qu'aucun test ne
    // rougisse : c'est ainsi qu'un puits qui débordait (v0.684, mauvais dénominateur)
    // puis un puits devenu mur (v0.733, mines à distance moyenne) sont passés au vert.
    // Vérifié par mutation : sans ce test, ramener MINE_DIST à 0,5 ne casse RIEN.

    // 1. Le net d'une mine doit être CELUI QUE LE JEU PAIE, pas une formule recopiée.
    //    Une mine est une récolte : aucun combat, donc le combattant n'influe pas.
    //    ⚠️ On compare des MOYENNES : `resolveOutcome` tire des rencontres de trajet
    //    (v0.659), donc un seul tirage s'écarte de 33 % sans rien prouver.
    for (const lv of [10, 28, 60]) {
      const p = {
        id: 'm',
        type: 'mine' as const,
        level: lv,
        x: 0,
        y: 0,
        dist: MINE_DIST,
        distNorm: MINE_DIST,
        spawnAt: 0,
        expireAt: 9e15,
        perilous: false,
      };
      let somme = 0;
      for (let s = 1; s <= 300; s++)
        somme += resolveOutcome(refFighter(lv), p as never, s, lv).gold;
      const reel = somme / 300 - goldCost('mine', lv);
      const ecart = mineNet(lv) / reel;
      // Le modèle peut être un peu SOUS le jeu (il ignore les rencontres, d'espérance
      // légèrement positive) — jamais AU-DESSUS, et jamais d'un facteur.
      expect(
        ecart,
        `niveau ${lv} : modèle ${Math.round(mineNet(lv))} vs jeu ${Math.round(reel)}`,
      ).toBeGreaterThan(0.75);
      expect(
        ecart,
        `niveau ${lv} : modèle ${Math.round(mineNet(lv))} vs jeu ${Math.round(reel)}`,
      ).toBeLessThan(1.1);
    }

    // 2. On modélise le joueur qui OPTIMISE, pas le joueur moyen : un puits calibré sur
    //    le second déborde pour le premier. La récompense étant super-linéaire en temps
    //    de trajet (v0.683), « optimiser » veut dire viser LOIN.
    expect(MINE_DIST).toBeGreaterThanOrEqual(0.8);
  });

  it('⚠️ SIMULATION SUR UN AN : le puits ne déborde pas, et n’est pas un mur non plus', () => {
    // ⚠️ CE TEST EXISTE PARCE QUE SON ABSENCE A COÛTÉ CHER. La v0.684 avait fixé
    // `upBase` PAR SIMULATION, puis écrit la conclusion dans un commentaire — sans
    // l’encoder. Quand le roster est passé de 7 à 10 bâtiments (v0.727), le puits s’est
    // approfondi de 43 % tout seul ; le seul test en place mesurait un PROXY (jours de
    // revenu par cran), et on s’est contenté d’en relâcher la borne (70 → 80). Résultat
    // mesuré un an plus tard : le joueur le plus actif ne tenait plus que 44 % du
    // plafond, et le compte réel portait 312 jours de revenu de retard.
    // On mesure donc désormais LA CHOSE ELLE-MÊME.
    for (const [nom, xpParJour] of PROFILS) {
      const part = partDuPlafond(xpParJour);
      const dit = `${nom} : ${(part * 100).toFixed(0)} % du plafond après un an`;
      // PLANCHER : sous ~55 %, les bâtiments restent à la moitié de ton niveau pour
      // toujours — ils cessent d'être un objectif et deviennent du décor. C'est très
      // exactement l'état livré à 1320 (44-53 % mesurés).
      expect(part, dit).toBeGreaterThan(0.55);
      // PLAFOND : au-dessus de ~90 %, on a tout, et l'or n'a plus de destination —
      // le débordement que la v0.684 corrigeait.
      expect(part, dit).toBeLessThan(0.9);
    }
  });

  it('⚠️ L’OR NE DORT PAS : sur un an, il est dépensé au fil de l’eau (v0.996)', () => {
    // « Pas en excès » se mesure là : ce qui reste en banque en fin d’année, et la part du
    // gain effectivement dépensée. Mesuré à `upBase` 1400 : 0,8 / 0,8 / 1,4 jour de
    // revenu en banque, 99 % dépensé. Un puits qui déborde laisserait l’or s’entasser.
    for (const [nom, xpParJour] of PROFILS) {
      const y = yearOfPlay(xpParJour);
      const bank = `${nom} : ${y.bankDays.toFixed(1)} j de revenu en banque`;
      expect(y.bankDays, bank).toBeLessThan(3);
      const spent = `${nom} : ${(y.spentShare * 100).toFixed(0)} % dépensé`;
      expect(y.spentShare, spent).toBeGreaterThan(0.95);
    }
  });

  it('⚠️ LE REVENU COMPLET COMPTE VRAIMENT LES AUTRES SOURCES', () => {
    // Revente du butin, boss, convois, camps, sièges, coffre du 360 : sans elles le puits
    // se calibrait sur ~2/3 du revenu réel, et le joueur tranquille atteignait 92 % du
    // plafond. Si `fullGoldPerDay` retombait sur le modèle partiel, la simulation d’un an
    // redeviendrait optimiste en silence. Mesuré : +41 % (niv. 10) à +53 % (niv. 70).
    for (const L of [10, 30, 70]) {
      expect(fullGoldPerDay(L) / goldPerDay(L), `niveau ${L}`).toBeGreaterThan(1.25);
    }
  });

  it('⚠️ LA MARGE EST MINCE : un bâtiment de moins frôle le plafond, deux le franchissent', () => {
    // Le puits d'or est DÉRIVÉ du roster (`BUILD.plotCap = BUILDING_TYPES.length`) : moins
    // d'emplacements = moins de dépenses = l'or s'entasse. C'est le piège de la v0.733, où
    // trois bâtiments AJOUTÉS avaient approfondi le puits de 43 % en silence.
    //
    // ✅ CE TEST A FAIT SON TRAVAIL. Il prévenait qu'« un bâtiment de plus en moins n'est
    // pas un ménage, c'est un réglage d'économie qui impose de re-mesurer `BUILD.upBase` ».
    // Le chantier de simplification en a retiré TROIS d'un coup (Mine d'or, Fonderie,
    // Comptoir) : mesuré à `upBase` 550, la part du plafond montait à **94,3 / 83,3 /
    // 76,4 %** — le profil tranquille DEHORS. `upBase` est donc passé à 850, ce qui rend
    // **81,4 / 71,8 / 65,9 %**, la courbe d'avant à moins de 3 points près.
    //
    // ✅ ET UNE SECONDE FOIS : l'Entrepôt retiré (6 → 5), `upBase` est passé à 1000 —
    // 81,9 / 72,4 / 66,2 %, la courbe d'avant à 0,5 point près.
    //
    // ✅ ET UNE TROISIÈME (v0.996) : la simulation passe au revenu COMPLET, `upBase` à 1400
    // — 81,9 / 72,1 / 66,0 %, et la marge tient (88 % à un bâtiment de moins, 97 % à deux).
    //
    // ⚠️ CE QU'IL GARDE reste inchangé : la MARGE. À un bâtiment de moins on frôle le
    // plafond (88 %), à deux on le franchit (97 %) — la prochaine fois vaudra la même
    // re-mesure.
    const [, xpTranquille] = PROFILS[0]!;
    const aNeuf = partDuPlafond(xpTranquille, BUILDING_TYPES.length);
    const aHuit = partDuPlafond(xpTranquille, BUILDING_TYPES.length - 1);
    const aSept = partDuPlafond(xpTranquille, BUILDING_TYPES.length - 2);
    // ⚠️ La propriété mesurée est qu'un roster plus COURT fait MONTER la part. Sans elle,
    // un simulateur qui IGNORERAIT `nbTypes` passerait au vert — la mutation l'a montré
    // en survivant, du temps où ce test ne regardait qu'une seule taille.
    expect(aHuit, 'un roster plus court doit faire monter la part').toBeGreaterThan(aNeuf);
    expect(aSept).toBeGreaterThan(aHuit);
    // Et la marge, chiffrée : on est encore dedans, on ne l'est plus deux crans plus loin.
    expect(aHuit, `à 8 bâtiments : ${(aHuit * 100).toFixed(0)} %`).toBeLessThan(0.9);
    expect(aSept, `à 7 bâtiments : ${(aSept * 100).toFixed(0)} %`).toBeGreaterThan(0.9);
  });
});

describe('⚒️ LE COÛT DE L’ÉQUIPEMENTIER — mesuré contre le revenu, comme le reste', () => {
  // ⚠️ Le repère du projet : UN CRAN de bâtiment coûte 160 à 260 % d'une journée de revenu.
  // Forger doit se SENTIR sans jamais rivaliser avec ce puits-là.
  const pieceCost = (L: number) => {
    // La pièce sort au rang de la CLASSE de l'aventurier, qui ne dépasse jamais le rang du
    // joueur — on mesure donc au pire cas réaliste : un aventurier promu à son maximum.
    const rank = RANK_ORDER[Math.min(RANK_ORDER.length - 1, prestigeRankIndex(L))]!;
    return outfitGoldCost(rank, L);
  };

  it('équiper UN aventurier (4 pièces) reste une FRACTION d’une journée, à tout niveau', () => {
    for (const L of LEVELS) {
      const part = (pieceCost(L) * ADV_GEAR_SLOTS.length) / goldPerDay(L);
      expect(part, `niveau ${L}`).toBeGreaterThan(0.005); // ça doit se sentir
      expect(part, `niveau ${L}`).toBeLessThan(0.2); // …sans jamais bloquer
    }
  });

  it('⚠️ et il reste LOIN sous un cran de bâtiment — le vrai puits d’or', () => {
    for (const L of LEVELS) {
      const quatre = pieceCost(L) * ADV_GEAR_SLOTS.length;
      expect(quatre, `niveau ${L}`).toBeLessThan(buildingUpgradeCost(L) / 3);
    }
  });
});
