// Le MODÈLE DE REVENU d'une journée type — l'étalon des tests d'économie.
//
// ⚠️ EXTRAIT de `goldSink.test.ts` (il y vivait en privé) pour que le débit des CAMPS DE
// FACTION se mesure contre LE MÊME dénominateur. Une seconde copie du modèle aurait divergé
// au premier réglage, et c'est précisément par un mauvais dénominateur que ce fichier a déjà
// laissé passer un puits qui débordait (v0.684) puis un puits devenu mur (v0.733).
import {
  harvestGold,
  harvestGuardOf,
  createMap,
  advanceWorld,
  resolveOutcome,
  poiRewardLevel,
  HARVEST_TYPES,
  type Poi,
} from '@/lib/expedition';
import { gearedFighter } from './gearedFighter';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { levelForDifficulty } from '@/lib/poiDifficulty';
import { DUNGEONS, dungeonGold, dungeonSummonStones } from '@/data/dungeons';
import { BOSSES, bossSummonCost } from '@/data/bosses';
import { rollDrop, sellValue } from '@/lib/items';
import { mulberry32 } from '@/lib/combat';
import { caravanSlots, caravanLegMin, refChampionAdv } from '@/lib/caravan';
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

const bestPlaces = memo((L) => {
  const DAY = 24 * 3600_000;
  // ⚠️ Un héros ÉQUIPÉ (le harnais partagé) + un champion : les gardes sont calibrés contre
  // eux — nu, le héros perdait toutes les mines du début de partie.
  const hero = gearedFighter(L);
  const ally = refChampionAdv(L, 0);
  const team = [0, 1, 2].map((i) => refChampionAdv(L, i));
  let gold = 0;
  let diff = 0;
  let n = 0;
  // 🐫 Les mines que le héros ne prend pas, jouées par une équipe de 3 champions de référence
  // (v0.1159 : une équipe touche désormais l'or plein d'une mine) — une liste par journée.
  const teamDays: number[][] = [];
  for (let seed = 1; seed <= 12; seed++) {
    let map = createMap(seed * 7919, 0, L, L);
    for (let d = 1; d <= 2; d++) {
      map = advanceWorld(map, d * DAY, L, L);
      const lieux = map.pois
        .filter((p) => HARVEST_TYPES.has(p.type))
        .map((p) => {
          let g = 0;
          let t = 0;
          for (let s = 1; s <= 3; s++) {
            // ⚠️ Le VRAI chemin : un lieu de récolte est GARDÉ (v0.1043), le héros y va en
            // groupe et peut PERDRE — la défaite compte, elle ne rapporte rien.
            const o = resolveHarvestParty({
              poi: p,
              escort: [ally],
              road: { advGear: [] },
              hero: { name: 'H', level: L, combatant: hero },
              seed: s * 31 + seed,
              playerLevel: L,
              pantheonLevel: L,
            });
            g += o.gold;
            if (p.type === 'mine')
              t += resolveHarvestParty({
                poi: p,
                escort: team,
                road: { advGear: [] },
                hero: null,
                seed: s * 31 + seed,
                playerLevel: L,
                pantheonLevel: L,
              }).gold;
          }
          return { g: g / 3, t: t / 3, mine: p.type === 'mine', d: poiRewardLevel(p) };
        })
        .sort((a, b) => b.g - a.g);
      teamDays.push(
        lieux
          .slice(2)
          .filter((x) => x.mine)
          .map((x) => x.t)
          .sort((a, b) => b - a),
      );
      for (const x of lieux.slice(0, 2)) {
        gold += x.g;
        diff += x.d;
        n++;
      }
    }
  }
  return {
    gold: n ? Math.round(gold / n) : 0,
    level: n ? Math.round(diff / n) : Math.max(1, L),
    teamDays,
  };
});
/** 🎯 La DIFFICULTÉ des deux meilleurs lieux qu'une vraie carte propose au niveau L. */
export const bestPlaceLevel = (L: number): number => bestPlaces(L).level;
/** Or d'une expédition : la moyenne des DEUX MEILLEURS lieux de récolte d'une vraie carte,
 *  défaites comprises.
 *  ⚠️ ÉCHANTILLONNÉ SUR DE VRAIES CARTES (v0.1153), avec les fonctions du jeu (`createMap`,
 *  `advanceWorld`, `resolveHarvestParty`), plus supposé. Depuis que la récompense suit la
 *  DIFFICULTÉ, ce qu'on gagne dépend de ce que la carte PROPOSE et de ce qu'on BAT : une
 *  « mine de ton niveau, gagnée » comptait ×2 à ×4 l'or réel — l'erreur de dénominateur qui a
 *  déjà fait déborder (v0.684) puis murer (v0.733) ce puits. */
export const mineNet = (L: number): number => bestPlaces(L).gold;
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
 *  ouvre l'app matin et soir). Aucun salaire (les champions ne sont pas payés).
 *  🪙 Depuis la v0.1159, une équipe touche l'or PLEIN d'une mine (`harvestGold`, le même que
 *  le héros) : les équipes prennent d'abord les MINES que le héros laisse sur la carte (vraies
 *  cartes, défaites comprises), puis les créneaux restants vont sur un puits, qui ne paie
 *  qu'une part symbolique de son coût. */
function convoyGoldPerDay(L: number, comptoir: number): number {
  // ⚠️ Un puits de la DIFFICULTÉ des meilleurs lieux de la carte (v0.1153 : la cargaison la
  // lit), plus « de ton niveau », qu'une vraie carte propose rarement.
  const D = bestPlaceLevel(L);
  const size = harvestGuardOf({ id: 'w', type: 'well', level: D })!.size;
  const poi = { id: 'w', level: levelForDifficulty(D, size), distNorm: 0.6, type: 'well' } as Poi;
  const esc = [0, 1, 2].map((i) => refChampionAdv(L, i));
  const legH =
    caravanLegMin(
      poi,
      esc,
      0,
      travelTimeMult([{ typeId: 'outpost', level: comptoir, slot: 0, collectedAt: 0 }]),
    ) / 60;
  const trips = Math.min(3, 24 / (2 * legH));
  const cap = caravanSlots(comptoir) * trips;
  const days = bestPlaces(L).teamDays;
  let mines = 0;
  let used = 0;
  for (const day of days) {
    const k = Math.min(cap, day.length);
    mines += day.slice(0, Math.floor(k)).reduce((s, g) => s + g, 0);
    used += Math.floor(k);
  }
  const perDay = days.length ? mines / days.length : 0;
  const wells = Math.max(0, cap - (days.length ? used / days.length : 0));
  return Math.max(0, perDay + wells * harvestGold(poi, L));
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
