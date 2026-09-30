// 🧺 UNE ÉQUIPE SUR UN LIEU DE RÉCOLTE (2026-09-21, pur/testé). Décision de l'utilisateur :
// « on remplace les convois par les expéditions ; les équipes de 3 champions, ou 1 héros et
// 1 champion, partent sur tous les events ». Ce module est la RÉSOLUTION d'une équipe sur une
// mine, un puits, un sanctuaire, des archives ou une mine de mana — les camps, failles et
// armées ont déjà la leur (`resolveCamp`, `resolveIncursion`, `resolveInterception`).
//
// 🛡️ DES GARDES D'ABORD (2026-09-22, décision de l'utilisateur : « toutes les mines ont des
// ennemis qu'il faut tuer pour y accéder », force « comme un petit camp », défaite = « rien
// n'est récolté »). Le lieu est gardé par une force de camp (`harvestGuardOf`, 1-2 champions
// de référence) : on la combat avec le MÊME choc que les camps (`fightCampForce`), ce qui
// donne enfin un 🎯 % à un sanctuaire et de l'XP d'abattus aux champions partout.
// - Défaite : RIEN n'est récolté, le socle d'XP de défaite, les tombés à l'infirmerie
//   (`campHurt`).
// - Victoire : la récolte telle qu'avant, plus la part des gardes abattus.
//
// ⚠️ ON NE RÉINVENTE RIEN, on DÉLÈGUE la récolte :
// - SANS le héros : c'est le CONVOI d'avant (`resolveCaravan`) — embuscades à danger ABSOLU,
//   calibrées sur un trio de référence (1 → 0 %, 3 → pari, 4 → quasi sûr), cargaison, blessés,
//   Une équipe de 3 champions EST un convoi de 3 : les bandes restent vraies.
// - AVEC le héros : c'est son EXPÉDITION (`resolveOutcome`) — la récolte pleine et les
//   rencontres de trajet ; le champion qui l'accompagne apprend (XP).
// ⚠️ Le héros SEUL y passe aussi par ce module (plus par `expeSend`) : sinon une expédition
// solo contournait les gardes.
import {
  CARAVAN,
  caravanHaulMult,
  missionXpFor,
  resolveCaravan,
  type CaravanOutcome,
  type EscortKit,
  type PartyHero,
} from './caravan';
import {
  campHurt,
  campLightHurt,
  fightCampForce,
  forceHaul,
  type BodyLoot,
  type CampFight,
} from './camp';
import { mulberry32 } from './combat';
import {
  HARVEST_TYPES,
  fallenSupplyCount,
  harvestGuardOf,
  ruinsSeals,
  resolveOutcome,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { FACTION_EMOJI } from './raid';
import { addSupplies, supplyFx, pickSupply, type SupplyStock } from './supplies';
import { teamRuneValue, type Adventurer } from './adventurers';

/** Le « combat » d'un lieu sans gardes : personne à abattre, victoire acquise. */
const NO_GUARDS: CampFight = {
  skirmish: { win: true } as CampFight['skirmish'],
  foes: 0,
  slain: 0,
  kills: {},
  heroKills: 0,
  shares: {},
  journal: [],
  replay: { name: '', emoji: '', maxPv: 0, beastPv: 0, steps: [] },
};

export interface HarvestPartyInput {
  poi: Poi;
  escort: Adventurer[];
  road: EscortKit;
  hero: PartyHero | null;
  seed: number;
  playerLevel: number;
  /** ⚠️ REQUIS : la référence de la prime de rattrapage (`catchUpMult`) — c'est le plafond
   *  que `grantAdvXp` applique, jamais le niveau du joueur. */
  pantheonLevel: number;
}

/** 💰 Ajoute à une récolte ce que portaient les gardes (`forceHaul` : bourses des bandits,
 *  pierres des morts-vivants, consommables des bêtes). ⚠️ Pour une MINE, c'est EN PLUS de son
 *  filon (décision de l'utilisateur : « si il y a des ennemis ils donnent leur ressource aussi »). */
function withGuardLoot(out: ExpeditionOutcome, loot: BodyLoot): ExpeditionOutcome {
  const supplies = addSupplies(out.supplies ?? {}, loot.supplies);
  return {
    ...out,
    gold: out.gold + loot.gold,
    summonStones: out.summonStones + loot.summonStones,
    ...(Object.keys(supplies).length ? { supplies } : {}),
  };
}

/** Ajoute la part des gardes abattus à l'XP de la récolte (arrondie comme `missionXpFor`). */
function withShares(xp: Record<string, number>, shares: Record<string, number>) {
  const out: Record<string, number> = { ...xp };
  for (const [id, v] of Object.entries(shares)) out[id] = (out[id] ?? 0) + Math.round(v);
  return out;
}

/**
 * 🏛️🏚️ CE QUE LE LIEU LUI-MÊME REND, une fois atteint (victoire) : les sceaux des ruines
 * anciennes (`ruinsSeals`), les consommables d'un héros tombé (`fallenSupplyCount`, tirés
 * sur un générateur À PART pour ne rien décaler du combat ni de la route). Ajouté aux DEUX
 * chemins (équipe seule, héros), qui ne connaissent pas ces lieux.
 */
function withSiteLoot(out: ExpeditionOutcome, input: HarvestPartyInput): ExpeditionOutcome {
  const { poi } = input;
  if (poi.type === 'ruins') return { ...out, seals: ruinsSeals(poi, input.playerLevel) };
  if (poi.type !== 'fallen') return out;
  const rng = mulberry32((input.seed ^ 0x61c88647) >>> 0 || 1);
  const found: SupplyStock = {};
  for (let i = 0; i < fallenSupplyCount(poi.level); i++) {
    const id = pickSupply(rng());
    found[id] = (found[id] ?? 0) + 1;
  }
  return {
    ...out,
    supplies: addSupplies(out.supplies ?? {}, found),
    // 🏚️ Ce que la fouille a trouvé, À PART de la route : le rejeu montre ces objets-là.
    ...(out.party ? { party: { ...out.party, fallen: { supplies: found } } } : {}),
  };
}

/**
 * 🔮 🧲 PILLARD (rune dorée) : une chance que la récolte rapporte une SECONDE cargaison —
 * quelle que soit la ressource (or, pierres, mana, clés). ⚠️ Jamais l'ÉNERGIE : elle reste
 * « complément, jamais substitut au sport ». Tirée sur SON générateur, et seulement si
 * l'équipe porte la rune : sans elle, aucune issue seedée ne bouge.
 */
export function withPlunder(
  out: ExpeditionOutcome,
  escort: readonly Adventurer[],
  seed: number,
): ExpeditionOutcome {
  const chance = teamRuneValue(escort, 'plunder');
  if (!out.win || chance <= 0) return out;
  if (mulberry32((seed ^ 0x51a7d3c1) >>> 0 || 1)() >= chance) return out;
  const text = '🧲 Pillard : une seconde cargaison !';
  return {
    ...out,
    gold: out.gold * 2,
    summonStones: out.summonStones * 2,
    mana: out.mana * 2,
    key: out.key * 2,
    text: `${out.text} ${text}`,
    ...(out.party ? { party: { ...out.party, journal: [...out.party.journal, text] } } : {}),
  };
}

/** 🔙 L'issue d'un demi-tour : le lieu n'est jamais atteint. Échec, XP de la route, blessés
 *  de la route, aucun butin. */
function turnedBack(
  input: HarvestPartyInput,
  c: CaravanOutcome,
  spec: ReturnType<typeof harvestGuardOf>,
): ExpeditionOutcome {
  const ambushes = c.events.filter((e) => e.kind === 'bandits');
  const slain = ambushes.reduce((s, e) => s + (e.slain ?? 0), 0);
  const party: PartyResult = {
    hero: false,
    faction: spec?.faction ?? input.poi.faction ?? 'mortsvivants',
    escort: input.escort.map((a) => a.id),
    foes: slain,
    slain,
    kills: { ...(c.kills ?? {}) },
    heroKills: 0,
    win: false,
    roadLost: true,
    turnedBack: true,
    xp: c.xp,
    hurt: c.hurt,
    lightHurt: c.lightHurt ?? [],
    journal: c.events.map((e) => e.text),
  };
  return {
    win: false,
    gold: 0,
    energy: 0,
    summonStones: 0,
    mana: 0,
    item: null,
    items: [],
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    turnBack: c.turnBack,
    text: c.text,
    party,
  };
}

export function resolveHarvestParty(input: HarvestPartyInput): ExpeditionOutcome {
  return withPlunder(resolveHarvest(input), input.escort, input.seed);
}

function resolveHarvest(input: HarvestPartyInput): ExpeditionOutcome {
  const { poi, escort, road, hero, seed } = input;
  if (!HARVEST_TYPES.has(poi.type))
    throw new Error(`resolveHarvestParty : ${poi.type} n'est pas un lieu de récolte.`);
  // 💠 Un lieu SANS gardes (la mine de mana : ses monstres sont partis vers la base) se
  // récolte sans combat — on saute le choc, la récolte est celle d'une victoire.
  const spec = harvestGuardOf(poi);
  // 🔙 Sans le héros, l'équipe voyage comme un convoi : une embuscade perdue à l'ALLER la fait
  // rentrer avant d'atteindre le lieu — ni gardes, ni récolte, les blessés à l'infirmerie.
  // ⚠️ Le convoi tire sur SON générateur (graine du départ) : l'appeler plus tôt ne change rien
  // à son issue, ni à celle des gardes.
  const road0 = hero
    ? null
    : resolveCaravan(poi, escort, seed, road, input.pantheonLevel, input.playerLevel);
  if (road0?.turnBack !== undefined) return turnedBack(input, road0, spec);
  const g: CampFight = spec
    ? fightCampForce({
        poi,
        spec,
        escort,
        road,
        hero,
        seed,
        playerLevel: input.playerLevel,
        pantheonLevel: input.pantheonLevel,
      })
    : NO_GUARDS;
  const won = spec ? g.skirmish.win : true;
  const tag = spec
    ? `${FACTION_EMOJI[spec.faction]} ${g.slain}/${g.foes} gardes abattus.`
    : poi.type === 'vein'
      ? '💎 Aucun garde — le filon affleurait, il n’y avait qu’à creuser.'
      : '💠 Aucun garde — ses monstres sont partis vers ta base.';
  const raw: BodyLoot = spec
    ? forceHaul({ poi, road, seed }, spec, g.skirmish)
    : { gold: 0, summonStones: 0, supplies: {} };
  // 🔮 Sans le héros, les pierres des gardes passent à la PART d'équipe (v0.1210, décision de
  // l'utilisateur) : récolte et gardes ensemble, sinon les gardes morts-vivants apportaient à
  // eux seuls 8 à 33 % d'une journée de donjons (mesuré). Un camp garde ses pierres pleines :
  // il a sa propre borne (`campEconomy`).
  const loot: BodyLoot = hero
    ? raw
    : { ...raw, summonStones: Math.round(raw.summonStones * CARAVAN.stonesShare) };
  const base = {
    hero: !!hero,
    faction: spec?.faction ?? poi.faction ?? 'mortsvivants',
    escort: escort.map((a) => a.id),
    foes: g.foes,
    slain: g.slain,
    kills: g.kills,
    heroKills: g.heroKills,
  };

  if (!won) {
    const party: PartyResult = {
      ...base,
      win: false,
      xp: missionXpFor(escort, poi, false, g.shares, input.pantheonLevel, !!hero),
      hurt: campHurt(g.skirmish, escort),
      journal: g.journal,
    };
    // ⚠️ Rien n'est récolté — mais les gardes ABATTUS laissent ce qu'ils portaient.
    return withGuardLoot(
      {
        win: false,
        gold: 0,
        energy: 0,
        summonStones: 0,
        mana: 0,
        item: null,
        items: [],
        key: 0,
        reconBonus: 0,
        returnMult: 1,
        text: `💀 Repoussés par les gardes — rien n’a été récolté. ${tag}`,
        party,
      },
      loot,
    );
  }

  if (hero) {
    const raw = resolveOutcome(hero.combatant, poi, seed, input.playerLevel);
    // 🧺🐫 La cargaison avec le héros (v0.1299, décision de l'utilisateur : « les porteurs
    // comptent aussi quand le héros est là ») : les bâts ET les porteurs 🐫 / pièces de
    // cargaison des champions, sous le MÊME plafond qu'une équipe (`caravanHaulMult`).
    // ⚠️ L'ÉNERGIE ne suit que les bâts, comme avant : « complément, jamais substitut au
    // sport » — une équipe sans le héros ne dépasse déjà jamais sa base d'énergie.
    const bats = supplyFx(road.supplies).haul;
    const k = caravanHaulMult(escort, road.advGear, bats);
    const kEnergy = 1 + Math.max(0, bats);
    const out =
      k === 1
        ? raw
        : {
            ...raw,
            gold: Math.round(raw.gold * k),
            energy: Math.round(raw.energy * kEnergy),
            summonStones: Math.round(raw.summonStones * k),
            mana: Math.round(raw.mana * k),
            key: Math.round(raw.key * k),
          };
    const party: PartyResult = {
      ...base,
      win: true,
      xp: missionXpFor(escort, poi, true, g.shares, input.pantheonLevel, !!hero),
      hurt: [],
      lightHurt: spec ? campLightHurt(g.skirmish, escort) : [],
      journal: [...g.journal, out.text],
    };
    return withSiteLoot(withGuardLoot({ ...out, text: `${tag} ${out.text}`, party }, loot), input);
  }
  const c = road0!;
  const ambushes = c.events.filter((e) => e.kind === 'bandits');
  const kills = { ...g.kills };
  for (const [id, n] of Object.entries(c.kills ?? {})) kills[id] = (kills[id] ?? 0) + n;
  const roadSlain = ambushes.reduce((s, e) => s + (e.slain ?? 0), 0);
  const party: PartyResult = {
    ...base,
    // ⚠️ La « victoire » d'une récolte = les gardes abattus ET aucune embuscade PERDUE : la
    // même règle que l'XP du convoi (`missionXpFor(…, !lost, …)`).
    win: !ambushes.some((e) => e.won === false),
    ...(ambushes.some((e) => e.won === false) ? { roadLost: true as const } : {}),
    foes: g.foes + roadSlain,
    slain: g.slain + roadSlain,
    kills,
    xp: withShares(c.xp, g.shares),
    hurt: c.hurt,
    // 🩹 Gardes pris de justesse OU embuscade gagnée de justesse — jamais un blessé grave.
    lightHurt: [
      ...new Set([...(spec ? campLightHurt(g.skirmish, escort) : []), ...(c.lightHurt ?? [])]),
    ].filter((id) => !c.hurt.includes(id)),
    journal: [...g.journal, ...c.events.map((e) => e.text)],
  };
  // ⚠️ Le lieu rend son butin dès que ses gardes sont tombés — une embuscade perdue sur la
  // route n'y change rien (c'est la cargaison du trajet qui en pâtit).
  return withSiteLoot(
    withGuardLoot(
      {
        win: party.win,
        gold: c.gold,
        energy: c.energy,
        summonStones: c.summonStones,
        mana: c.mana ?? 0,
        item: null,
        items: [],
        key: c.keys,
        reconBonus: 0,
        returnMult: 1,
        text: `${tag} ${c.text}`,
        party,
      },
      loot,
    ),
    input,
  );
}
