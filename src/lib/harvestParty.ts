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
import { missionXpFor, resolveCaravan, type EscortKit, type PartyHero } from './caravan';
import { campHurt, fightCampForce } from './camp';
import {
  harvestGuardOf,
  resolveOutcome,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from './expedition';
import { FACTION_EMOJI } from './raid';
import { supplyFx } from './supplies';
import type { Adventurer } from './adventurers';

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

/** Ajoute la part des gardes abattus à l'XP de la récolte (arrondie comme `missionXpFor`). */
function withShares(xp: Record<string, number>, shares: Record<string, number>) {
  const out: Record<string, number> = { ...xp };
  for (const [id, v] of Object.entries(shares)) out[id] = (out[id] ?? 0) + Math.round(v);
  return out;
}

export function resolveHarvestParty(input: HarvestPartyInput): ExpeditionOutcome {
  const { poi, escort, road, hero, seed } = input;
  const spec = harvestGuardOf(poi);
  if (!spec) throw new Error(`resolveHarvestParty : ${poi.type} n'est pas un lieu de récolte.`);
  const g = fightCampForce({
    poi,
    spec,
    escort,
    road,
    hero,
    seed,
    playerLevel: input.playerLevel,
    pantheonLevel: input.pantheonLevel,
  });
  const tag = `${FACTION_EMOJI[spec.faction]} ${g.slain}/${g.foes} gardes abattus.`;
  const base = {
    hero: !!hero,
    faction: spec.faction,
    escort: escort.map((a) => a.id),
    foes: g.foes,
    slain: g.slain,
    kills: g.kills,
    heroKills: g.heroKills,
  };

  if (!g.skirmish.win) {
    const party: PartyResult = {
      ...base,
      win: false,
      xp: missionXpFor(escort, poi, false, g.shares, input.pantheonLevel),
      hurt: campHurt(g.skirmish, escort),
      journal: g.journal,
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
      text: `💀 Repoussés par les gardes — rien n’a été récolté. ${tag}`,
      party,
    };
  }

  if (hero) {
    const raw = resolveOutcome(hero.combatant, poi, seed, input.playerLevel);
    // 🧺 Les bâts : avec le héros, la cargaison vient de SON expédition — le +20 % s'y applique
    // directement (le plafond du rôle 🐫 ne concerne que les champions).
    const k = 1 + supplyFx(road.supplies).haul;
    const out =
      k === 1
        ? raw
        : {
            ...raw,
            gold: Math.round(raw.gold * k),
            energy: Math.round(raw.energy * k),
            summonStones: Math.round(raw.summonStones * k),
            mana: Math.round(raw.mana * k),
            key: Math.round(raw.key * k),
          };
    const party: PartyResult = {
      ...base,
      win: true,
      xp: missionXpFor(escort, poi, true, g.shares, input.pantheonLevel),
      hurt: [],
      journal: [...g.journal, out.text],
    };
    return { ...out, text: `${tag} ${out.text}`, party };
  }
  const c = resolveCaravan(poi, escort, seed, road, input.pantheonLevel);
  const ambushes = c.events.filter((e) => e.kind === 'bandits');
  const kills = { ...g.kills };
  for (const [id, n] of Object.entries(c.kills ?? {})) kills[id] = (kills[id] ?? 0) + n;
  const roadSlain = ambushes.reduce((s, e) => s + (e.slain ?? 0), 0);
  const party: PartyResult = {
    ...base,
    // ⚠️ La « victoire » d'une récolte = les gardes abattus ET aucune embuscade PERDUE : la
    // même règle que l'XP du convoi (`missionXpFor(…, !lost, …)`).
    win: !ambushes.some((e) => e.won === false),
    foes: g.foes + roadSlain,
    slain: g.slain + roadSlain,
    kills,
    xp: withShares(c.xp, g.shares),
    hurt: c.hurt,
    journal: [...g.journal, ...c.events.map((e) => e.text)],
  };
  return {
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
  };
}
