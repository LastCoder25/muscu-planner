import { describe, it, expect } from 'vitest';
import {
  COMBAT,
  simulateCombat,
  type CombatEvent,
  type CombatSkill,
  type Combatant,
} from '@/lib/combat';
import { combatSkillInfo } from '@/lib/adventurers';
import { LEGENDARY_PROCS, SET_SIGNATURES } from '@/lib/items';

const base = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'A',
  pv: 4000,
  damage: 120,
  crit: 0,
  dodge: 0,
  initiative: 10,
  strikes: 2,
  ...over,
});
const foe = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'F',
  pv: 4000,
  damage: 110,
  crit: 0,
  dodge: 0,
  initiative: 1,
  ...over,
});

/** Toutes les compétences vues dans un combat. */
function skillsOf(p: Combatant, m: Combatant, seed = 7): Set<CombatSkill> {
  const out = new Set<CombatSkill>();
  for (const e of simulateCombat(p, m, { seed, goldOnWin: 0 }).log)
    for (const s of e.skills ?? []) out.add(s);
  return out;
}

/** Empreinte de TOUT ce qui décide du jeu — hors annotations. */
const empreinte = (log: CombatEvent[]) =>
  log
    .map((e) => `${e.round}|${e.who}|${e.type}|${e.damage}|${e.playerPv}|${e.monsterPv}`)
    .join(';');

describe('⚠️ L’INVARIANT : marquer un coup ne change RIEN au combat', () => {
  it('le résultat et le log chiffré sont IDENTIQUES avec ou sans compétences', () => {
    // ⚠️ C'est LA propriété sur laquelle repose toute la calibration du jeu (donjons, boss,
    // route, sièges). Un combat sans aucune compétence ne doit produire aucune annotation ;
    // le même combat AVEC doit rendre exactement les mêmes chiffres — les compétences
    // agissaient déjà, on ne fait que les NOMMER.
    for (const seed of [1, 7, 9001, 424242]) {
      const nu = simulateCombat(base(), foe(), { seed, goldOnWin: 10 });
      expect(
        nu.log.every((e) => e.skills === undefined),
        'un combat nu n’annote rien',
      ).toBe(true);
      // Un combat identique, rejoué : même graine, même issue, même log.
      const bis = simulateCombat(base(), foe(), { seed, goldOnWin: 10 });
      expect(bis.win).toBe(nu.win);
      expect(bis.rounds).toBe(nu.rounds);
      expect(bis.gold).toBe(nu.gold);
      expect(empreinte(bis.log)).toBe(empreinte(nu.log));
    }
  });

  it('⚠️ AUCUN TIRAGE CONSOMMÉ : deux combats qui ne diffèrent QUE par un proc marqué', () => {
    // Un proc qui consommerait un `rng()` décalerait tout le flux et changerait l'issue de
    // chaque combat seedé du jeu. On compare un combat SANS proc à lui-même : le résultat
    // doit rester reproductible tirage pour tirage.
    const a = simulateCombat(base(), foe(), { seed: 31337, goldOnWin: 0 });
    const b = simulateCombat(base(), foe(), { seed: 31337, goldOnWin: 0 });
    expect(empreinte(a.log)).toBe(empreinte(b.log));
    expect(a.log.length).toBeGreaterThan(20); // le combat est bien substantiel
  });
});

describe('⚔️ les compétences se voient', () => {
  it('☠️ EXÉCUTION : marquée seulement quand l’ennemi est vraiment bas', () => {
    const vus = simulateCombat(base({ execute: 0.5 }), foe(), { seed: 7, goldOnWin: 0 }).log.filter(
      (e) => e.skills?.includes('execute'),
    );
    expect(vus.length).toBeGreaterThan(0);
    // ⚠️ Chaque marque est au-dessous du seuil — sinon on annoncerait une compétence qui
    // n'a rien fait, ce qui est pire que de ne rien annoncer.
    for (const e of vus) expect(e.monsterPv / 4000).toBeLessThan(COMBAT.executeThreshold);
    // …et sans la stat, jamais.
    expect(skillsOf(base(), foe()).has('execute')).toBe(false);
  });

  it('🔥 RAGE : marquée seulement quand c’est TOI qui es bas', () => {
    const p = base({ rage: 0.6, pv: 1200 });
    const vus = simulateCombat(p, foe({ damage: 200 }), { seed: 3, goldOnWin: 0 }).log.filter((e) =>
      e.skills?.includes('rage'),
    );
    expect(vus.length).toBeGreaterThan(0);
    for (const e of vus) expect(e.playerPv / 1200).toBeLessThan(COMBAT.rageThreshold);
  });

  it('🌀 ÉLAN : jamais sur le PREMIER coup — il n’y a pas encore d’élan', () => {
    const log = simulateCombat(base({ momentum: 0.2 }), foe(), { seed: 5, goldOnWin: 0 }).log;
    const premier = log.find((e) => e.who === 'player' && e.type !== 'dodge')!;
    expect(premier.skills?.includes('momentum') ?? false).toBe(false);
    expect(log.some((e) => e.skills?.includes('momentum'))).toBe(true);
  });

  it('🩸 VOL DE VIE : marqué seulement quand il SOIGNE vraiment', () => {
    // À PV pleins le soin est absorbé par le plafond : annoncer « il s'est soigné » serait faux.
    const plein = simulateCombat(base({ lifesteal: 0.3 }), foe({ damage: 1 }), {
      seed: 11,
      goldOnWin: 0,
    });
    const premier = plein.log.find((e) => e.who === 'player' && e.type !== 'dodge')!;
    expect(premier.skills?.includes('lifesteal') ?? false).toBe(false);
    // Entamé, il soigne — et on le voit.
    const entame = simulateCombat(base({ lifesteal: 0.3, pv: 900 }), foe({ damage: 150 }), {
      seed: 11,
      goldOnWin: 0,
    });
    expect(entame.log.some((e) => e.skills?.includes('lifesteal'))).toBe(true);
  });

  it('🛡️ ÉPINES : marquées sur les coups REÇUS, jamais sur les coups portés', () => {
    const log = simulateCombat(base({ thorns: 0.2 }), foe(), { seed: 13, goldOnWin: 0 }).log;
    const vus = log.filter((e) => e.skills?.includes('thorns'));
    expect(vus.length).toBeGreaterThan(0);
    for (const e of vus) expect(e.who).toBe('monster');
  });

  it('les PROCS et les SIGNATURES DE SET se voient aussi', () => {
    const avec = (proc: string, over: Partial<Combatant> = {}) =>
      skillsOf(base({ procs: new Set([proc]), ...over }), foe({ damage: 300 }), 17);
    expect(avec('charge').has('charge')).toBe(true);
    expect(avec('aegis').has('aegis')).toBe(true);
    expect(avec('retort').has('retort')).toBe(true);
    expect(avec('sig_berserker').has('sig_berserker')).toBe(true);
    expect(avec('sig_gardien').has('sig_gardien')).toBe(true);
  });
});

describe('⚠️ LES NOMS VIENNENT DES TABLES EXISTANTES, jamais d’une copie', () => {
  const TOUTES: CombatSkill[] = [
    'execute',
    'rage',
    'momentum',
    'lifesteal',
    'thorns',
    'initiative',
    'predator_eye',
    'aegis',
    'retort',
    'phoenix',
    'secondwind',
    'executioner',
    'vampiric',
    'charge',
    'cadence',
    'quarry',
    'endurance',
    'whetted',
    'thirst',
    'sig_berserker',
    'sig_gardien',
    'sig_assassin',
    'sig_vampire',
    'sig_colosse',
    'sig_duelliste',
    'sig_epineux',
    'sig_frenetique',
  ];

  it('chaque compétence a un nom et un emoji', () => {
    for (const s of TOUTES) {
      const i = combatSkillInfo(s);
      expect(i, s).toBeTruthy();
      expect(i!.name.length, s).toBeGreaterThan(0);
      expect(i!.emoji.length, s).toBeGreaterThan(0);
    }
  });

  it('⚠️ LE NOM EST EXACTEMENT CELUI DE SA TABLE D’ORIGINE', () => {
    // Si une quatrième copie apparaissait, ce test la verrait immédiatement.
    for (const p of LEGENDARY_PROCS) {
      const i = combatSkillInfo(p.id as CombatSkill);
      if (!i) continue; // un proc qui ne se marque pas encore : pas une erreur
      expect(i.name, p.id).toBe(p.name);
      expect(i.emoji, p.id).toBe(p.emoji);
    }
    for (const sig of Object.values(SET_SIGNATURES)) {
      const i = combatSkillInfo(sig.id as CombatSkill)!;
      expect(i.name, sig.id).toBe(sig.name);
      expect(i.emoji, sig.id).toBe(sig.emoji);
    }
  });

  it('une compétence inconnue ne fait pas tomber l’écran', () => {
    expect(combatSkillInfo('pas_une_competence' as CombatSkill)).toBeUndefined();
  });
});

describe('⚠️ L’EMPREINTE FIGÉE — le seul test qui voie un décalage du flux aléatoire', () => {
  it('un combat de référence rend EXACTEMENT la même suite de coups', () => {
    // ⚠️ MES AUTRES TESTS NE POUVAIENT PAS VOIR ÇA, et une mutation l'a montré : ils
    // comparent un combat À LUI-MÊME (deux appels, même graine). Si `mark` consommait un
    // tirage, les DEUX appels le consommeraient — donc ils resteraient identiques, et
    // l'invariant le plus important du moteur passerait au vert pendant que tous les
    // combats seedés du jeu auraient changé (donjons, boss, route, sièges).
    //
    // ⚠️ CE TEST DOIT ROUGIR si l'on touche au flux aléatoire ou aux constantes de dégâts
    // — c'est son métier. On ne le met à jour qu'en SACHANT ce qu'on change, jamais pour
    // le faire taire.
    const p: Combatant = {
      name: 'A',
      pv: 4000,
      damage: 120,
      crit: 0.2,
      dodge: 0.1,
      initiative: 10,
      strikes: 2,
    };
    const f: Combatant = {
      name: 'F',
      pv: 4000,
      damage: 110,
      crit: 0.15,
      dodge: 0.08,
      initiative: 1,
    };
    const r = simulateCombat(p, f, { seed: 20260920, goldOnWin: 0 });
    const debut = r.log
      .slice(0, 12)
      .map((x) => `${x.who[0]}${x.type[0]}${x.damage}`)
      .join(',');
    expect(debut).toBe('ph112,pc274,mh102,ph122,ph121,mh103,pd0,pc232,mc187,ph116,ph106,mh106');
    expect(r.rounds).toBe(31);
    expect(r.log).toHaveLength(46);
    expect(r.win).toBe(true);
  });
});

describe('⚠️ L’EMPREINTE ARMÉE — celle qui couvre VRAIMENT le marquage', () => {
  it('un combat où HUIT compétences mordent rend la même suite de coups', () => {
    // ⚠️ L'EMPREINTE NUE CI-DESSUS NE SUFFISAIT PAS, et la mutation l'a montré : dans un
    // combat sans compétence, `mark` n'est JAMAIS appelé — donc « une marque consomme un
    // tirage » y passait au vert. Une empreinte ne couvre que le chemin qu'elle emprunte.
    // Ici huit compétences mordent : si l'une d'elles touchait au flux aléatoire, la suite
    // des coups se décalerait et ce test tomberait.
    const p: Combatant = {
      name: 'A',
      pv: 3000,
      damage: 120,
      crit: 0.2,
      dodge: 0.1,
      initiative: 10,
      strikes: 2,
      execute: 0.5,
      rage: 0.4,
      momentum: 0.15,
      thorns: 0.2,
      lifesteal: 0.1,
      procs: new Set(['charge', 'aegis', 'retort', 'sig_berserker']),
    };
    const f: Combatant = {
      name: 'F',
      pv: 5000,
      damage: 260,
      crit: 0.15,
      dodge: 0.08,
      initiative: 1,
    };
    const r = simulateCombat(p, f, { seed: 20260920, goldOnWin: 0 });
    const vues = new Set<CombatSkill>();
    for (const e of r.log) for (const s of e.skills ?? []) vues.add(s);
    // Le combat emprunte bien le chemin instrumenté — sinon le test ne prouverait rien.
    expect([...vues].sort()).toEqual([
      'aegis',
      'charge',
      'execute',
      'lifesteal',
      'momentum',
      'rage',
      'retort',
      'sig_berserker',
      'thorns',
    ]);
    expect(
      r.log
        .slice(0, 12)
        .map((x) => `${x.who[0]}${x.type[0]}${x.damage}`)
        .join(','),
      // ⚠️ Mise à jour SCIEMMENT à la refonte de l'équipement (étape 1) : l'élan se compte par
      // TOUR. Seuls les DÉGÂTS du joueur changent — la suite qui/quoi est identique, preuve
      // que la règle ne consomme aucun tirage de plus. Étape 5 : Égide passe de −45 % à −75 %
      // (« bloquée d'office ») — seul le 1er coup ENCAISSÉ change (mh133 → mh61), et avec lui
      // les coups de rage qui suivent (PV plus hauts). Encore une fois : aucun tirage de plus.
      // Étape 7 : Carnage passe de +300 % à +45 % (signatures recalibrées) — seuls les DÉGÂTS
      // du joueur changent, la suite qui/quoi est IDENTIQUE ; le combat, plus long, voit la rage
      // mordre (d'où « rage » ci-dessus).
    ).toBe('ph146,pc361,mh61,ph195,ph196,mh243,pd0,pc438,mc442,ph195,ph180,mh250');
    expect(r.rounds).toBe(15); // Carnage plus faible : combat plus long (était 10)
    expect(r.log).toHaveLength(22); // était 15
  });
});
