/**
 * 🔮 LE PRONOSTIC DE BATAILLE ENTIER (2026-10-14, demandé : « sur la fiche du lieu, dire si la
 * défense va fonctionner ou pas, et si ce n'est pas le cas, de combien ça va affaiblir l'armée
 * qui va s'installer ; pareil avec une armée qu'on veut intercepter ; et simuler aussi nos
 * pertes : on peut gagner une bataille et perdre des miliciens, ou des champions blessés »).
 *
 * Un % de victoire ne dit que la moitié. Ce module rejoue le MÊME combat fondu (`campFoe` →
 * `simulateCombat` → `deriveSkirmish`, celui de `fightCampForce`) sur des graines de PRONOSTIC
 * (`partyForecastSeed`, impaires : jamais celle du vrai choc, cf. `campWinPct`) et en lit, par
 * issue :
 * - l'USURE de la troupe qui s'installe si le lieu tombe (`addWear(…, foeDealt)`, bornée par
 *   `WEAR.minShare`, lu dans `enemyWear.ts`), ou la part abattue d'une armée interceptée ;
 * - NOS PERTES : miliciens morts (`militiaLost`), champions blessés gravement (`campHurt`, une
 *   défaite) ou légèrement (`campLightHurt`, une victoire serrée), premiers secours et trousse de soins compris
 *   (`spareInjured`), héros blessé (`markHeroHurt` : une défaite).
 *
 * ⚠️ AUCUNE RÈGLE À ELLE. Elle appelle les constructeurs de la vraie bataille : `retakeBattle`
 * (défense d'une reprise visible), la même troupe moyenne que `garrisonHold` (défense avant
 * que l'armée soit visible), `campSpecOf` (assaut d'un lieu ennemi, troupe USÉE comprise),
 * `fieldArmySpec` (interception). `hold` est donc EXACTEMENT le % que l'écran annonce déjà
 * (mêmes graines, mêmes forces) — testé contre `controlAttackHold` / `controlDefenseHold`.
 * ⚠️ Le fumigène (`guardMult`) joue comme dans `partyWinChance` ; la défense d'un lieu n'en
 * connaît pas (`campWinPct` par défaut).
 * ⚠️ Coût borné : `CONTROL.holdSamples` combats par taille de troupe pour une défense,
 * `FORECAST_LOSS_SAMPLES` pour un assaut. Pur et déterministe : un `computed` suffit à le
 * mémoïser.
 */
import { simulateCombat } from './combat';
import { campBodies, campFoe, campHurt, campLightHurt } from './camp';
import { fuseUnits, deriveSkirmish, type SkirmishUnit } from './skirmish';
import {
  CONTROL,
  controlAllies,
  defendsControl,
  garrisonBoost,
  garrisonFoes,
} from './controlPoints';
import {
  campSpecOf,
  type CampSpec,
  type ExpeditionMap,
  type Poi,
  type PostedHero,
} from './expedition';
import { fieldArmySpec, retakeBattle } from './fieldArmy';
import { HERO_UNIT_ID, partyAllies, spareInjured, type EscortKit } from './caravan';
import { militiaLost } from './militia';
import { partyForecastSeed } from './party';
import { supplyFx } from './supplies';
import { addWear, wearsDown, type EnemyWear } from './enemyWear';
import type { Adventurer } from './adventurers';

/** Combien de combats par pronostic d'assaut ou d'interception (les pertes se lisent sur la
 *  moyenne : 96 suffisent, et l'écran recalcule à chaque champion coché). */
export const FORECAST_LOSS_SAMPLES = 96;

/** 🩹 NOS PERTES, en moyenne sur un lot de combats d'une même issue. */
export interface LossForecast {
  /** Miliciens morts (moyenne). */
  militia: number;
  /** Champions blessés GRAVEMENT (moyenne) — une défaite, premiers secours déduits. */
  hurt: number;
  /** Champions blessés LÉGÈREMENT (moyenne) — une victoire serrée. */
  light: number;
  /** Part des combats où au moins un champion est blessé gravement. */
  pHurt: number;
  /** Part des combats où au moins un champion est blessé légèrement. */
  pLight: number;
  /** Part des combats où le héros est blessé (une défaite avec lui). */
  heroHurt: number;
}

export interface BattleForecast {
  /** Combats simulés. */
  samples: number;
  /** Part des combats gagnés par NOTRE camp (0..1). */
  win: number;
  /** Combats perdus (de quoi savoir si les chiffres « si échec » reposent sur quelque chose). */
  lostSamples: number;
  /** Part des PV de la troupe ennemie entamée en moyenne, quand NOTRE camp perd (0..1). */
  dealtIfLost: number;
  /** L'USURE moyenne de la troupe ennemie après un échec (`addWear`, bornée par `WEAR.minShare`, et
   *  cumulée à celle qu'elle portait déjà) : la part de sa force en moins. 0 sans échec. */
  wearIfLost: number;
  /** La part de l'armée ABATTUE en moyenne, issues confondues (battue = 1) — interception. */
  partAll: number;
  /** La même, quand l'assaut échoue (l'armée marche amputée de ce pourcentage). */
  partIfLost: number;
  ifWon: LossForecast;
  ifLost: LossForecast;
  /** Issues confondues. */
  expected: LossForecast;
  /** Combien de miliciens et de champions étaient engagés (de quoi dire « tous »). */
  engaged: { militia: number; champions: number; hero: boolean };
}

/** Une troupe à combattre : le lieu (niveau) et sa force. */
interface Foe {
  poi: Poi;
  spec: CampSpec;
}

interface Tally {
  n: number;
  militia: number;
  hurt: number;
  light: number;
  anyHurt: number;
  anyLight: number;
  hero: number;
  dealt: number;
  wear: number;
  part: number;
}
const newTally = (): Tally => ({
  n: 0,
  militia: 0,
  hurt: 0,
  light: 0,
  anyHurt: 0,
  anyLight: 0,
  hero: 0,
  dealt: 0,
  wear: 0,
  part: 0,
});

const lossOf = (t: Tally): LossForecast =>
  t.n
    ? {
        militia: t.militia / t.n,
        hurt: t.hurt / t.n,
        light: t.light / t.n,
        pHurt: t.anyHurt / t.n,
        pLight: t.anyLight / t.n,
        heroHurt: t.hero / t.n,
      }
    : { militia: 0, hurt: 0, light: 0, pHurt: 0, pLight: 0, heroHurt: 0 };

/**
 * Le moteur : `samples` combats contre CHAQUE troupe de `foes` (même poids), rejoués comme
 * `fightCampForce` — le groupe fondu contre `campFoe`, les chutes dérivées par `deriveSkirmish`
 * — mais sur les graines du pronostic. ⚠️ Les 24 premières graines sont celles de `campWinPct` :
 * `win` coïncide donc avec lui à la décimale près quand `samples` est le même.
 */
function simulate(
  foes: readonly Foe[],
  allies: readonly SkirmishUnit[],
  escort: readonly Adventurer[],
  samples: number,
  opts: { foeMult?: number; prevWear?: EnemyWear; medkit?: boolean } = {},
): BattleForecast {
  const n = Math.max(1, samples);
  const militiaIds = allies.map((u) => u.id);
  const heroIn = allies.some((u) => u.id === HERO_UNIT_ID);
  const engaged = {
    militia: militiaIds.filter((id) => id.startsWith('mil:')).length,
    champions: escort.length,
    hero: heroIn,
  };
  const won = newTally();
  const lost = newTally();
  let partSum = 0;
  let total = 0;
  if (allies.length) {
    const group = fuseUnits(allies, 'Groupe');
    for (const { poi, spec } of foes) {
      const foe = campFoe(poi, spec, opts.foeMult ?? 1);
      const bodies = campBodies(poi, spec, foe);
      for (let s = 0; s < n; s++) {
        const seed = partyForecastSeed(s);
        const fight = simulateCombat(group, foe, { seed, goldOnWin: 0 });
        const d = deriveSkirmish(
          { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
          allies,
          bodies,
          seed,
        );
        const t = d.win ? won : lost;
        t.n++;
        total++;
        t.militia += militiaLost(militiaIds, d).length;
        // 🩹 La trousse de soins remet tout le monde sur pied (`medkitHeal`) et épargne le héros
        // (`markHeroHurt`) : aucune blessure, ni grave ni légère.
        const hurt = opts.medkit ? 0 : spareInjured([...escort], campHurt(d, escort), seed).length;
        const light = opts.medkit
          ? 0
          : spareInjured([...escort], campLightHurt(d, escort), seed).length;
        t.hurt += hurt;
        t.light += light;
        if (hurt) t.anyHurt++;
        if (light) t.anyLight++;
        // 🤕 Le héros perdant est marqué blessé (`markHeroHurt`), sauf trousse.
        if (heroIn && !d.win && !opts.medkit) t.hero++;
        t.dealt += d.foeDealt;
        t.wear += addWear(opts.prevWear, d.foeDealt, 0)?.share ?? opts.prevWear?.share ?? 0;
        const part = d.win ? 1 : bodies.length ? d.foesDown.length / bodies.length : 0;
        t.part += part;
        partSum += part;
      }
    }
  }
  const all = newTally();
  for (const k of Object.keys(all) as (keyof Tally)[]) all[k] = won[k] + lost[k];
  return {
    samples: total,
    win: total ? won.n / total : 0,
    lostSamples: lost.n,
    dealtIfLost: lost.n ? lost.dealt / lost.n : 0,
    wearIfLost: lost.n ? lost.wear / lost.n : 0,
    partAll: total ? partSum / total : 0,
    partIfLost: lost.n ? lost.part / lost.n : 0,
    ifWon: lossOf(won),
    ifLost: lossOf(lost),
    expected: lossOf(all),
    engaged,
  };
}

/** 🛡️ Le pronostic d'une DÉFENSE : la tenue, et ce qui se passe si elle tombe. */
export interface DefenseForecast extends BattleForecast {
  /** La part des assauts repoussés — le MÊME nombre que `controlAttackHold` /
   *  `controlDefenseHold`. */
  hold: number;
  /** L'armée visible en approche (sa vraie troupe) plutôt que le plancher générique. */
  vsArmy: boolean;
}

/**
 * 🛡️ Ce qu'il adviendra d'un lieu TENU attaqué : mêmes arguments que `controlAttackHold` /
 * `controlDefenseHold` (+ `vsArmy` pour choisir lequel des deux l'écran affiche).
 * Sans défenseur : `hold` 0, l'ennemi s'installe intact (usure 0), aucune perte à annoncer.
 */
export function defenseForecast(
  map: Pick<ExpeditionMap, 'seed' | 'archipel'>,
  p: Poi,
  ids: readonly string[],
  advs: readonly Adventurer[],
  kit: EscortKit,
  playerLevel: number,
  /** 🧱🏹 `fortifyMult`, REQUIS (comme `garrisonHold`). */
  fort: number,
  hero: PostedHero | null,
  vsArmy: boolean,
  /** 🪵 L'instant où l'on juge les palissades (comme `controlDefenseHold`), REQUIS ; l'armée
   *  visible, elle, les juge à son heure d'assaut (`retakeBattle`). */
  wardAt: number,
  samples: number = CONTROL.holdSamples,
): DefenseForecast {
  const set = new Set(ids);
  const champs = advs.filter((a) => set.has(a.id));
  const allies = controlAllies(p.control?.kind, champs, kit, hero, ids, playerLevel);
  // 🛡️ Au lapidaire les champions ne se battent pas : ni blessés, ni comptés.
  const escort = defendsControl(p.control?.kind) ? champs : [];
  if (!allies.length) return { ...simulate([], allies, escort, samples), hold: 0, vsArmy };
  let foes: Foe[];
  if (vsArmy) {
    const { foe, force } = retakeBattle(map, p, allies, playerLevel, fort);
    foes = [{ poi: foe, spec: force }];
  } else {
    // 🎲 Les MÊMES troupes que `garrisonHold` (`garrisonFoes` + `garrisonBoost`, source unique) :
    // l'ennemi le plus fort possible, au niveau du joueur.
    const at = { ...p, level: Math.max(1, playerLevel) };
    foes = garrisonFoes(at, garrisonBoost(at, allies, fort, wardAt), fort);
  }
  const f = simulate(foes, allies, escort, samples);
  return { ...f, hold: f.win, vsArmy };
}

/**
 * ⚔️ Ce qu'il adviendra d'un ASSAUT du joueur contre un lieu tenu par l'ennemi (point de
 * contrôle usé compris — `campSpecOf` retranche l'usure) ou un camp : la chance de victoire,
 * l'usure de sa troupe en cas d'échec (cumulée à celle qu'elle portait déjà) et nos pertes.
 * `null` si le lieu ne se combat pas comme un camp, ou si personne ne part.
 */
export function attackForecast(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: Parameters<typeof partyAllies>[2],
  samples: number = FORECAST_LOSS_SAMPLES,
): BattleForecast | null {
  const spec = campSpecOf(poi);
  if (!spec) return null;
  const allies = partyAllies(escort, road, hero);
  if (!allies.length) return null;
  return simulate([{ poi, spec }], allies, escort, samples, {
    foeMult: supplyFx(road.supplies).guardMult,
    medkit: supplyFx(road.supplies).medkit,
    prevWear:
      poi.control?.owner === 'enemy' && wearsDown(poi.control) ? poi.control.wear : undefined,
  });
}

/**
 * ⚔️🗼 Ce qu'il adviendra d'une INTERCEPTION (attaque d'une armée en campagne : reprise ou
 * siège) : la part de l'armée abattue — 1 quand elle est battue, sinon la part de ses corps
 * tombés (`resolveFieldArmy`, c'est ce qui l'AMPUTE, `retakeCut`) — et nos pertes.
 * `null` si le lieu n'est pas une armée en campagne, ou si personne ne part.
 */
export function interceptForecast(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: Parameters<typeof partyAllies>[2],
  samples: number = FORECAST_LOSS_SAMPLES,
): BattleForecast | null {
  const spec = fieldArmySpec(poi);
  if (!spec) return null;
  const allies = partyAllies(escort, road, hero);
  if (!allies.length) return null;
  return simulate([{ poi, spec }], allies, escort, samples, {
    foeMult: supplyFx(road.supplies).guardMult,
    medkit: supplyFx(road.supplies).medkit,
  });
}
