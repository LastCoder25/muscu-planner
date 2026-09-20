import { describe, it, expect } from 'vitest';
import { defenseUpgradeScrap, defenseUpgradeCost, repairCost, DEFENSE_TYPES } from '@/lib/raid';
import { HARVEST, travelOneWayMin, type Poi } from '@/lib/expedition';
import { campGroupHaul } from '@/lib/camp';
import { DUNGEONS, dungeonGold } from '@/data/dungeons';
import { CARAVAN } from '@/lib/caravan';
import { BUILDING_TYPES } from '@/lib/buildings';

/** L'économie de la FERRAILLE, mesurée de bout en bout, en JOURS RÉELS.
 *
 *  ⚠️ RÈGLE DE CONCEPTION (décidée avec l'utilisateur) : **la ferraille doit être PLUS
 *  DURE à obtenir que l'or.** L'or mesure le volume de jeu — il tombe des donjons qu'on
 *  fait de toute façon ; la ferraille mesure qu'on est allé la CHERCHER. Si les deux
 *  avancent au même rythme, l'enceinte n'a qu'un seul verrou et le second est décoratif.
 *
 *  ⚠️ PIÈGE D'UNITÉ, qui a fait conclure l'inverse une première fois : comparer « N séances
 *  de sport » à « N jours » n'a aucun sens. Une séance n'arrive pas tous les jours — on
 *  ramène donc TOUT en jours, avec un rythme sportif réaliste. Sous cette lecture, la
 *  ferraille était en réalité ~1,7× plus RAPIDE que l'or (compte réel : 1 327 🔩 en banque
 *  pour 6 634 🪙, avec un sac vidé à 5 objets). */

const N_STRUCT = DEFENSE_TYPES.length;
/** ~4 séances de sport par semaine : le jeu est annexe, il ne se joue pas tous les jours. */
const SPORT_PER_DAY = 4 / 7;
/** Niveaux où la règle s'applique. ⚠️ Le niveau 12 (déblocage de la défense) en est
 *  EXCLU volontairement : l'amorçage doit rester doux, même politique que le premier
 *  niveau de chaque structure, qui ne coûte déjà aucune ferraille. */
const LEVELS = [20, 26, 40, 60, 100];

const bestDungeon = (L: number) =>
  [...DUNGEONS].filter((d) => d.recoLevel <= L).sort((a, b) => b.recoLevel - a.recoLevel)[0]!;

/** Une visite d'épave — la source qu'on va CHERCHER (une expédition entière y passe). */
function wreckYield(L: number): number {
  const rthH = (2 * travelOneWayMin(L, 0.5)) / 60;
  return Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * Math.min(0.5 + rthH, 6));
}
/** Journée type : UNE épave pour le héros, UN convoi vers une épave — et RIEN D'AUTRE.
 *
 *  ⚠️ LA FONDERIE EST RETIRÉE (demandé) : il n'y a plus AUCUNE source passive de ferraille.
 *  Mesuré avant retrait, elle pesait 20 à 22 % du débit ; l'épave a été remontée de ×1,25
 *  en compensation (`HARVEST.scrapBase`), ce qui ramène le ratio ferraille/or à 1,16-1,65
 *  — la courbe d'avant (1,13-1,63).
 *
 *  ⚠️ LE RECYCLAGE N’Y EST PLUS (v0.890, décision de l’utilisateur : « énormément trop de
 *  ferraille avec le recyclage »). Ce modèle ne comptait que 8 descentes par séance ; le
 *  compte réel en enchaîne ~40 par jour, soit ~320 🔩/jour de recyclage au niveau 30 contre
 *  ~870 🔩 pour un cran des structures — le métal tombait tout seul. Sans recyclage, le
 *  modèle d’origine donnait 1,54-2,21 ; il comptait une seule épave par jour et ignorait les
 *  convois (v0.726), qui en ramènent à `CARAVAN.yieldShare` : un convoi par jour les compte.
 *  ⚠️ L'acier des sièges (v0.702) n'y est PLUS : les assaillants de la base ne laissent
 *  aucune ferraille depuis la v0.856 (décision de l'utilisateur). Mesuré avant retrait, ils
 *  pesaient 5 à 9 % du débit ; sans eux le ratio ferraille/or passe de 1,15-1,74 à
 *  1,22-1,86, toujours dans la bande. Un test de `raid.test` verrouille leur absence. */
const wreckPerDay = (L: number) => wreckYield(L) * (1 + CARAVAN.yieldShare);
const scrapPerDay = (L: number) => wreckPerDay(L);
const goldPerDay = (L: number) => dungeonGold(bestDungeon(L)) * 8 * SPORT_PER_DAY;
/** Monter TOUTES les structures d'un cran : le rythme de croisière. */
const cranScrap = (L: number) => defenseUpgradeScrap(L) * N_STRUCT;
const cranGold = (L: number) => defenseUpgradeCost(L) * N_STRUCT;

describe('ferraille : plus dure à obtenir que l’or', () => {
  it('⚠️ LA RÈGLE : à niveau égal, un cran d’enceinte prend PLUS de jours en ferraille qu’en or', () => {
    for (const L of LEVELS) {
      const daysScrap = cranScrap(L) / scrapPerDay(L);
      const daysGold = cranGold(L) / goldPerDay(L);
      const ratio = daysScrap / daysGold;
      expect(
        ratio,
        `niveau ${L} : ${daysScrap.toFixed(2)} j de ferraille contre ${daysGold.toFixed(2)} j d’or`,
      ).toBeGreaterThan(1.1);
      // …sans virer au mur : au-delà, l'enceinte n'attendrait plus que le métal.
      // ⚠️ PLAFOND RESSERRÉ 2,2 → 1,85, ET C'EST UNE PROPRIÉTÉ, pas un tour de vis.
      // Il n'existe plus qu'UNE source de ferraille (l'épave) depuis le retrait de la
      // Fonderie : il n'y a donc plus aucun coussin, et frôler le mur n'est plus
      // acceptable comme il l'était à deux sources. La compensation de l'épave (×1,25,
      // `HARVEST.scrapBase`) rend 1,16-1,65 ; SANS elle on remonte à 1,45-2,06, ce qui
      // passait l'ancienne borne — une mutation l'a montré en SURVIVANT. Cette marge est
      // désormais ce qui garde la compensation.
      expect(ratio, `niveau ${L} : ratio ${ratio.toFixed(2)}`).toBeLessThan(1.85);
    }
  });

  it('⚠️ E3 : la règle tient avec UN camp de groupe par jour en plus', () => {
    // Un camp pris sans le héros rend de l'OR, jamais de ferraille (cf. `campGroupHaul`) :
    // ajouté au seul débit d'or, il accélère l'or — le métal doit rester plus lent, sans
    // virer au mur, et l'épave garder la tête du débit de ferraille. Bandits : la faction
    // qui rend le plus d'or.
    // ⚠️ CE N'EST PAS « le cas le plus défavorable », comme l'affirmait ce commentaire : un
    // camp de taille 3 est le plus PETIT (un repaire de taille 10 rend 3,3× cet or), et un
    // joueur en prend plusieurs par jour. Le débit RÉEL des camps en parallèle — borné par
    // les créneaux de convoi — est mesuré dans `campEconomy.test.ts` ; ici on ne vérifie
    // qu'une chose : un camp de plus ne renverse pas le rapport ferraille/or.
    const campGold = (L: number) => {
      const p: Poi = {
        id: 'c',
        type: 'camp',
        level: L,
        x: 60,
        y: 60,
        distNorm: 0.5,
        spawnedAt: 0,
        expiresAt: 9e15,
      };
      return campGroupHaul(p, { faction: 'bandits', size: 3 }).gold;
    };
    for (const L of LEVELS) {
      const goldDay = goldPerDay(L) + campGold(L);
      const ratio = cranScrap(L) / scrapPerDay(L) / (cranGold(L) / goldDay);
      expect(ratio, `niveau ${L} : ratio ${ratio.toFixed(2)}`).toBeGreaterThan(1.1);
      // (même plafond resserré que ci-dessus : une seule source, donc aucune marge à perdre)
      expect(ratio, `niveau ${L} : ratio ${ratio.toFixed(2)}`).toBeLessThan(1.85);
      // (la part de l'épave n'est pas re-vérifiée ici : un camp ne rend aucune ferraille,
      //  le test suivant la couvre)
    }
  });

  it('⚠️ TOUT LE DÉBIT SE GAGNE SUR LA CARTE — plus aucune source passive', () => {
    // ⚠️ RÉÉCRIT. Ce test disait « l’épave domine le débit, pas les sources passives » et
    // le vérifiait à plus de 45 %. Depuis le retrait de la Fonderie il n’y a PLUS de
    // source passive du tout : la version d’avant serait trivialement vraie (100 %) et ne
    // garderait plus rien. Ce qui reste à garder, c’est la propriété qu’elle protégeait —
    // que le métal se MÉRITE, donc qu’aucune horloge n’en dépose.
    for (const L of LEVELS) {
      expect(scrapPerDay(L), `niveau ${L}`).toBe(wreckPerDay(L));
    }
    expect(
      BUILDING_TYPES.some((t) => t.resource === 'scrap'),
      'aucun bâtiment ne doit produire de ferraille',
    ).toBe(false);
  });

  it('⚠️ LA SOURCE UNIQUE reste À PORTÉE : un cran se paie en quelques visites', () => {
    // ⚠️ RÉÉCRIT. Il vérifiait que la Fonderie ne suffisait pas À ELLE SEULE à payer un
    // cran (« jamais en moins de 5 jours »). Le risque a changé de bord : avec une source
    // unique, c’est l’EXCÈS DE LENTEUR qui murerait l’enceinte. On borne donc des DEUX
    // côtés le nombre de visites d’épave qu’un cran demande — assez pour que le geste
    // compte, jamais assez pour qu’il devienne une corvée.
    for (const L of LEVELS) {
      const visites = cranScrap(L) / wreckYield(L);
      expect(visites, `niveau ${L} : ${visites.toFixed(1)} visites`).toBeGreaterThan(1);
      expect(visites, `niveau ${L} : ${visites.toFixed(1)} visites`).toBeLessThan(8);
    }
  });

  it('RÉPARER reste bon marché : un siège perdu ne se paie pas en corvée', () => {
    // Améliorer et réparer sont deux dépenses de natures différentes. Remettre l'enceinte
    // en état après une défaite doit rester à portée, sinon l'échec devient une punition —
    // la spirale que tout le système de siège s'attache à éviter.
    // ⚠️ L’étalon était « un jour de Fonderie » ; elle n’existe plus, c’est donc UNE
    // VISITE d’épave — la même idée (un seul geste suffit), dans la seule monnaie qui
    // reste.
    for (const L of LEVELS) {
      expect(repairCost(L)).toBeLessThan(wreckYield(L));
      expect(repairCost(L) * N_STRUCT).toBeLessThan(cranScrap(L)); // tout réparer < progresser
    }
  });

  it('le coût reste strictement croissant', () => {
    for (let L = 2; L <= 100; L++)
      expect(defenseUpgradeScrap(L)).toBeGreaterThan(defenseUpgradeScrap(L - 1));
  });
});
