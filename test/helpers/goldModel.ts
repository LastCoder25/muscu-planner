// Le MODÈLE DE REVENU d'une journée type — l'étalon des tests d'économie.
//
// ⚠️ EXTRAIT de `goldSink.test.ts` (il y vivait en privé) pour que le débit des CAMPS DE
// FACTION se mesure contre LE MÊME dénominateur. Une seconde copie du modèle aurait divergé
// au premier réglage, et c'est précisément par un mauvais dénominateur que ce fichier a déjà
// laissé passer un puits qui débordait (v0.684) puis un puits devenu mur (v0.733).
import { goldCost, travelOneWayMin, travelFactor, type Poi } from '@/lib/expedition';
import { DUNGEONS, dungeonGold, dungeonSummonStones } from '@/data/dungeons';
import { BOSSES, bossSummonCost } from '@/data/bosses';
import { rollDrop, sellValue } from '@/lib/items';
import { mulberry32 } from '@/lib/combat';
import { caravanSlots, caravanWages, caravanLegMin, refChampionAdv } from '@/lib/caravan';
import { rollRaid } from '@/lib/raid';
import { travelTimeMult } from '@/lib/buildings';
import { comboChestReward } from '@/lib/comboChest';

export const LEVELS = [5, 10, 15, 20, 26, 35, 50, 70, 100];
/** ~4 séances de sport par semaine : le jeu est annexe. */
const SPORT_PER_DAY = 4 / 7;
/** Énergie d'une séance → ~8 descentes (coût plafonné à 40 ⚡). */
const RUNS_PER_SESSION = 8;
/** Descentes de donjon par JOUR, au rythme sportif du modèle. */
const RUNS_PER_DAY = RUNS_PER_SESSION * SPORT_PER_DAY;

const bestDungeon = (L: number) =>
  [...DUNGEONS].filter((d) => d.recoLevel <= L).sort((a, b) => b.recoLevel - a.recoLevel)[0] ??
  DUNGEONS[0]!;

/** Net d'une expédition de mine LOINTAINE — ce que joue un joueur qui optimise.
 *  ⚠️ ÉTAIT à distance MOYENNE (0,5), et c'est ce qui a fait SOUS-ESTIMER le revenu d'un
 *  facteur ~3 : depuis la v0.683 la récompense est SUPER-LINÉAIRE en temps de trajet
 *  (`TRAVEL_EXP` 1,4), donc aller loin paie bien plus que proportionnellement. */
export const MINE_DIST = 0.9;
export function mineNet(level: number): number {
  const rth = (2 * travelOneWayMin(level, MINE_DIST)) / 60;
  const cost = goldCost('mine', level);
  return Math.round(cost * (1.3 + travelFactor(rth))) - cost;
}
// ⚠️ PLUS DE MINE D’OR : le bâtiment a été retiré du registre (demandé), donc plus
// aucune production passive d’or. Mesuré avant retrait, elle pesait 19,3 % du revenu au
// niveau 10 mais seulement 3,4 % au niveau 100 — l’or vient des donjons et de la carte.
/** Revenu d'une JOURNÉE type : la séance de donjons au prorata, 2 mines LOINTAINES, le
 *  passif. Deux expéditions = ce que lance un joueur qui ouvre l'app matin et soir ; le
 *  héros n'en menant qu'UNE à la fois (~7 h de trajet au niveau 28), c'est aussi à peu
 *  près le plafond pratique. */
export function goldPerDay(L: number): number {
  return dungeonGold(bestDungeon(L)) * RUNS_PER_DAY + 2 * mineNet(L);
}
/** 🔮 Pierres d'invocation d'une journée type : elles tombent au NETTOYAGE d'un donjon
 *  (`dungeonSummonStones`, source unique de la règle). C'est l'étalon auquel se comparent
 *  les autres robinets de pierres. */
export function stonesPerDay(L: number): number {
  return dungeonSummonStones(bestDungeon(L)) * RUNS_PER_DAY;
}

// ── 💰 LE REVENU COMPLET d'une journée (v0.996) ─────────────────────────────────────────
// ⚠️ `goldPerDay` ne compte QUE les donjons et deux mines. C'est l'étalon des RATIOS
// (soins, ferraille, Équipementier…), et il le reste. Mais le puits d'or doit se mesurer
// contre TOUT ce qui rentre, sinon il déborde en silence : depuis sa calibration, la
// REVENTE du butin est revenue (v0.890), les convois et les camps rapportent de l'or, les
// boss aussi, les sièges de bandits et le coffre du Défi 360. Mesuré au niveau 30, ces
// sources ajoutent ~+50 % au modèle de référence — et le joueur tranquille atteignait
// 92 % du plafond en un an, HORS de la bande 55-90 %.

const memo = <T>(f: (L: number) => T) => {
  const c = new Map<number, T>();
  return (L: number) => {
    if (!c.has(L)) c.set(L, f(L));
    return c.get(L)!;
  };
};
/** Revente de TOUT le butin d'une descente (la vente est la seule sortie d'un objet). */
const salePerRun = memo((L) => {
  const d = bestDungeon(L);
  const rng = mulberry32(1234 + L);
  const N = 300;
  let s = 0;
  for (let r = 0; r < N; r++)
    for (let m = 0; m < d.monsterIds.length; m++) {
      const it = rollDrop(rng, {
        cleared: true,
        defeated: 1,
        level: d.dropLevel,
        luck: d.dropLuck,
        playerLevel: L,
      });
      if (it) s += sellValue({ ...it, id: '' });
    }
  return s / N;
});
/** Boss du palier, payés en pierres de donjon ; ~60 % de victoires. */
function bossGoldPerDay(L: number): number {
  const b = [...BOSSES]
    .filter((x) => x.unlockLevel <= L)
    .sort((a, c) => c.unlockLevel - a.unlockLevel)[0];
  if (!b) return 0;
  return (stonesPerDay(L) / bossSummonCost(b.unlockLevel)) * 0.6 * b.gold;
}
/** Convois : chaque créneau fait un aller-retour de récolte au plus 3 fois par jour (on
 *  ouvre l'app matin et soir), salaires déduits. Une récolte ne paie qu'un FILET d'or
 *  (30 % du coût) : l'épave, qui payait en or, est retirée (v0.999). */
function convoyGoldPerDay(L: number, comptoir: number): number {
  const poi = { level: L, distNorm: 0.6, type: 'well' } as Poi;
  const esc = [0, 1, 2].map((i) => refChampionAdv(L, i));
  const legH =
    caravanLegMin(
      poi,
      esc,
      0,
      travelTimeMult([{ typeId: 'outpost', level: comptoir, slot: 0, collectedAt: 0 }]),
    ) / 60;
  const trips = Math.min(3, 24 / (2 * legH));
  const net = Math.round(goldCost('well', L) * 0.3) - caravanWages(esc, poi);
  return Math.max(0, caravanSlots(comptoir) * trips * net);
}
/** Camps de faction, en PART du revenu de référence — la valeur MESURÉE par
 *  `campEconomy.test` (+9 % au niveau 12, +16 à +19 % au 26, ~+17 % au-delà). Borne haute :
 *  un camp occupe un créneau qu'un convoi n'occupe donc pas. */
// ⚠️ RE-MESURÉE en v0.1049 (carte agrandie par l'Avant-poste, champions à la moitié de sa
// réduction) : +29 % au niveau 12, +21 % au 26, +23 % au 60. La valeur d'avant (+9/+16/+17)
// datait d'avant la v0.1033 et n'avait jamais suivi.
function campShare(L: number): number {
  if (L <= 12) return 0.29;
  if (L <= 26) return 0.29 - ((L - 12) / 14) * 0.08;
  if (L <= 60) return 0.21 + ((L - 26) / 34) * 0.02;
  return 0.23;
}
/** Or laissé par une armée repoussée (même barème que `lootCorpses`). */
const siegeGold = memo((L) => {
  let g = 0;
  const N = 40;
  for (let s = 0; s < N; s++) {
    const r = rollRaid(s + 1, L, 0, 0);
    for (const grp of r.groups) {
      const n = grp.champion ? 4 : grp.count / (grp.massMult ?? 1);
      g += n * (r.faction === 'bandits' ? 14 + grp.level * 5.5 : 5 + grp.level * 1.8);
    }
  }
  return g / N;
});

/** Le revenu d'or COMPLET d'une journée type. `comptoir` = niveau de l'Avant-poste (il
 *  règle le nombre et la vitesse des convois) ; `siegesPerDay` suit le rythme sportif. */
export function fullGoldPerDay(L: number, comptoir = L, siegesPerDay = 0.5): number {
  const runs = dungeonGold(bestDungeon(L)) * RUNS_PER_DAY;
  const mines = 2 * mineNet(L);
  return (
    runs +
    mines +
    salePerRun(L) * RUNS_PER_DAY +
    bossGoldPerDay(L) +
    convoyGoldPerDay(L, comptoir) +
    campShare(L) * (runs + mines) +
    siegeGold(L) * siegesPerDay +
    comboChestReward(40, L).gold / 7
  );
}
