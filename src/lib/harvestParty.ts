// 🧺 UNE ÉQUIPE SUR UN LIEU DE RÉCOLTE (2026-09-21, pur/testé). Décision de l'utilisateur :
// « on remplace les convois par les expéditions ; les équipes de 3 champions, ou 1 héros et
// 1 champion, partent sur tous les events ». Ce module est la RÉSOLUTION d'une équipe sur une
// mine, un puits, un sanctuaire, des archives ou une mine de mana — les camps, failles et
// armées ont déjà la leur (`resolveCamp`, `resolveIncursion`, `resolveInterception`).
//
// ⚠️ ON NE RÉINVENTE RIEN, on DÉLÈGUE :
// - SANS le héros : c'est le CONVOI d'avant (`resolveCaravan`) — embuscades à danger ABSOLU,
//   calibrées sur un trio de référence (1 → 0 %, 3 → pari, 4 → quasi sûr), cargaison, blessés,
//   salaires. Une équipe de 3 champions EST un convoi de 3 : les bandes restent vraies.
// - AVEC le héros : c'est son EXPÉDITION (`resolveOutcome`) — la récolte pleine et les
//   rencontres de trajet ; le champion qui l'accompagne apprend (XP) et touche son salaire.
import {
  caravanWages,
  missionXpFor,
  resolveCaravan,
  type EscortKit,
  type PartyHero,
} from './caravan';
import { resolveOutcome, type ExpeditionOutcome, type PartyResult, type Poi } from './expedition';
import type { Adventurer } from './adventurers';

export interface HarvestPartyInput {
  poi: Poi;
  escort: Adventurer[];
  road: EscortKit;
  hero: PartyHero | null;
  seed: number;
  playerLevel: number;
}

export function resolveHarvestParty(input: HarvestPartyInput): ExpeditionOutcome {
  const { poi, escort, road, hero, seed } = input;
  if (hero) {
    const out = resolveOutcome(hero.combatant, poi, seed, input.playerLevel);
    const party: PartyResult = {
      hero: true,
      faction: 'bandits',
      escort: escort.map((a) => a.id),
      win: true,
      foes: 0,
      slain: 0,
      kills: {},
      heroKills: 0,
      // Une récolte ne se perd pas (aucun combat au lieu) : le socle entier.
      xp: missionXpFor(escort, poi, true, {}),
      hurt: [],
      wages: caravanWages(escort, poi),
      journal: [out.text],
    };
    return { ...out, party };
  }
  const c = resolveCaravan(poi, escort, seed, road);
  const ambushes = c.events.filter((e) => e.kind === 'bandits');
  const kills = c.kills ?? {};
  const party: PartyResult = {
    hero: false,
    faction: 'bandits',
    escort: escort.map((a) => a.id),
    // ⚠️ La « victoire » d'une récolte = aucune embuscade PERDUE (sans combat compris) : la
    // même règle que l'XP du convoi (`missionXpFor(…, !lost, …)`).
    win: !ambushes.some((e) => e.won === false),
    foes: ambushes.reduce((s, e) => s + (e.slain ?? 0), 0),
    slain: ambushes.reduce((s, e) => s + (e.slain ?? 0), 0),
    kills,
    heroKills: 0,
    xp: c.xp,
    hurt: c.hurt,
    wages: c.wages,
    journal: c.events.map((e) => e.text),
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
    text: c.text,
    party,
  };
}
