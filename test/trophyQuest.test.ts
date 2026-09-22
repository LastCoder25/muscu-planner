import { describe, it, expect } from 'vitest';
import {
  simulateCombat,
  playerCombatant,
  TROPHY,
  type Combatant,
  type CombatSkill,
  type TrophyPowerId,
} from '@/lib/combat';
import { combatSkillInfo } from '@/lib/adventurers';
import { TROPHY_POWERS, trophyPowerOf } from '@/lib/items';

// 🏆 LE MOTEUR DU TROPHÉE À QUÊTE (sets spécialisés, spec § 5).
// ⚠️ ON COMPTE DES GESTES REÇUS OU SUBIS (coups encaissés, parades, ripostes, critiques
// portés), jamais les coups PORTÉS : le héros frappe jusqu'à 37 fois par tour, un compteur
// dessus ne vaudrait rien.
const hero = (over: Partial<Combatant> = {}): Combatant => ({
  ...playerCombatant('H', { puissance: 20, endurance: 40, agilite: 5 }, 8),
  crit: 0,
  dodge: 0,
  ...over,
});
const foe = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'M',
  pv: 4000,
  damage: 60,
  crit: 0,
  dodge: 0,
  initiative: 99, // il commence : les gestes « subis » arrivent tout de suite
  strikes: 1,
  ...over,
});
const quest = (id: TrophyPowerId, len = 2, fast = false) => ({
  id,
  len,
  ...(fast ? { fast } : {}),
});
const skills = (log: { skills?: CombatSkill[] }[], s: CombatSkill) =>
  log.filter((e) => e.skills?.includes(s));
const run = (p: Combatant, m = foe(), seed = 7) => simulateCombat(p, m, { seed, goldOnWin: 0 });

describe('🏆 la quête avance sur un GESTE, et le dit', () => {
  it('chaque pouvoir a son geste, et la quête accomplie se voit dans le log', () => {
    const cas: [TrophyPowerId, Combatant][] = [
      ['etaler', hero({ trophy: quest('etaler') })], // encaisser
      ['dechainer', hero({ trophy: quest('dechainer') })], // perdre des PV
      ['annuler', hero({ trophy: quest('annuler'), parry: 1 })], // parer
      ['desarmer', hero({ trophy: quest('desarmer'), riposte: 1 })], // riposter
      ['renvoyer', hero({ trophy: quest('renvoyer'), thorns: 0.2 })], // épines
      ['retourner', hero({ trophy: quest('retourner'), lifesteal: 0.3 })], // se soigner
      ['achever', hero({ trophy: quest('achever'), crit: 1 })], // critiques portés
      ['accelerer', hero({ trophy: quest('accelerer'), momentum: 0.1 })], // élan au max
    ];
    for (const [id, p] of cas) {
      const log = run(p).log;
      expect(skills(log, 'tr_quest').length, id).toBeGreaterThan(0);
    }
  });

  it('sans trophée, aucune quête — et le combat reste identique au bit près', () => {
    const nu = hero();
    const a = run(nu);
    const b = run({ ...nu, trophy: undefined });
    expect(skills(a.log, 'tr_quest')).toHaveLength(0);
    expect(a.log).toEqual(b.log);
  });

  it('un geste qui n’est pas le sien ne fait rien avancer', () => {
    // ⚠️ Le seul geste qu'un héros peut ne JAMAIS faire est le critique : les autres (encaisser,
    // subir une attaque, tenir un tour) arrivent à tout le monde — c'est voulu (§ gestes
    // universels), sinon six trophées sur huit valaient 0 % en combat.
    const log = run(hero({ trophy: quest('achever'), crit: 0 })).log;
    expect(skills(log, 'tr_quest')).toHaveLength(0);
  });

  it('la VOIE PORTÉE fait compter chaque geste double', () => {
    const lent = run(hero({ trophy: quest('etaler', 6) })).log;
    const vite = run(hero({ trophy: quest('etaler', 6, true) })).log;
    expect(skills(vite, 'tr_quest').length).toBeGreaterThan(skills(lent, 'tr_quest').length);
  });

  it('une quête plus COURTE s’accomplit plus souvent', () => {
    const n = (len: number) =>
      skills(run(hero({ trophy: quest('etaler', len) })).log, 'tr_quest').length;
    expect(n(2)).toBeGreaterThan(n(8));
  });
});

describe('🏆 chaque pouvoir fait ce qu’il annonce', () => {
  it('🧱 Mur de fer : le prochain coup ennemi est ANNULÉ', () => {
    const log = run(hero({ trophy: quest('annuler'), parry: 0.6 })).log;
    const fired = skills(log, 'tr_annuler');
    expect(fired.length).toBeGreaterThan(0);
    for (const e of fired) expect(e.damage).toBe(0);
  });

  it('🧛 Don du sang : le prochain coup ennemi SOIGNE au lieu de blesser', () => {
    const p = hero({ trophy: quest('retourner'), lifesteal: 0.3 });
    const log = run(p).log;
    const fired = skills(log, 'tr_retourner');
    expect(fired.length).toBeGreaterThan(0);
    for (const e of fired) expect(e.damage).toBe(0);
    // Les PV remontent sur ce coup-là (ou restent au max).
    const i = log.indexOf(fired[0]!);
    expect(log[i]!.playerPv).toBeGreaterThanOrEqual(log[i - 1]?.playerPv ?? 0);
  });

  it('↩️ Retour à l’envoyeur : le coup part à l’ENNEMI, et le héros n’encaisse rien', () => {
    const p = hero({ trophy: quest('renvoyer'), thorns: 0.2 });
    const log = run(p).log;
    const fired = skills(log, 'tr_renvoyer');
    expect(fired.length).toBeGreaterThan(0);
    const i = log.indexOf(fired[0]!);
    expect(fired[0]!.damage).toBe(0); // rien pour le héros
    expect(fired[0]!.monsterPv).toBeLessThan(log[i - 1]!.monsterPv); // tout pour l'ennemi
  });

  it('⛰️ Longue patience : le coup est ÉTALÉ sur trois tours', () => {
    const p = hero({ trophy: quest('etaler', 2), pv: 400000, damage: 1 });
    const cible = foe({ pv: 400000, damage: 600 });
    const log = run(p, cible).log;
    const parts = log.filter((e) => e.skills?.length === 1 && e.skills[0] === 'tr_etaler');
    expect(parts.length).toBeGreaterThanOrEqual(TROPHY.spreadTurns - 1);
    // ⚠️ CE QUI DISTINGUE L'ÉTALEMENT : un coup étalé se paie en PLUSIEURS fois. Sans
    // répartition, le pouvoir marquerait le coup mais n'ajouterait aucune échéance.
    const echeances = (t?: Combatant['trophy']) =>
      run({ ...p, trophy: t }, cible).log.filter((e) => e.who === 'monster' && e.damage > 0).length;
    expect(echeances(p.trophy)).toBeGreaterThan(echeances(undefined));
    // Chaque part est une FRACTION : plus petite que le coup plein qui l'a déclenchée.
    const plein = run({ ...p, trophy: undefined }, cible).log.find(
      (e) => e.who === 'monster' && e.damage > 0,
    )!;
    expect(parts[0]!.damage).toBeLessThan(plein.damage);
  });

  it('🪶 Désarmement : il se DÉCLENCHE là où la quête tombe, riposte ou pas', () => {
    // ⚠️ Il s'ARMAIT sans jamais partir quand la quête tombait sur un coup ENCAISSÉ (et non sur
    // une riposte) : rien ne consommait l'armement, la quête ne repartait plus, et le pouvoir
    // valait 0 % en combat (mesuré).
    // Combat LONG (personne ne meurt) : on compte les tours que l'ennemi joue vraiment.
    const dur = hero({ trophy: quest('desarmer', 2), riposte: 0, pv: 400000, damage: 1 });
    const cible = foe({ pv: 400000, damage: 40 });
    const tours = (t?: Combatant['trophy']) =>
      run({ ...dur, trophy: t }, cible).log.filter((e) => e.who === 'monster').length;
    expect(skills(run(dur, cible).log, 'tr_quest').length).toBeGreaterThan(3); // elle repart
    expect(tours(dur.trophy)).toBeLessThan(tours(undefined)); // l'ennemi joue MOINS souvent
  });

  it('🪶 Désarmement : l’ennemi PERD SON TOUR', () => {
    const p = hero({ trophy: quest('desarmer'), riposte: 1 });
    const log = run(p).log;
    const fired = skills(log, 'tr_desarmer');
    expect(fired.length).toBeGreaterThan(0);
    // Après le désarmement, l'ennemi saute un tour : deux tours du héros d'affilée.
    const i = log.indexOf(fired[0]!);
    const suivants = log.slice(i + 1).filter((e) => e.damage > 0 || e.type === 'dodge');
    expect(suivants[0]?.who).toBe('player');
  });

  it('⏩ Seconde main : le héros joue un tour SUPPLÉMENTAIRE', () => {
    const p = hero({ trophy: quest('accelerer'), momentum: 0.1, strikes: 1 });
    const sans = run({ ...p, trophy: undefined });
    const avec = run(p);
    const coups = (r: typeof avec) =>
      r.log.filter((e) => e.who === 'player' && e.damage > 0).length;
    expect(coups(avec)).toBeGreaterThan(coups(sans));
  });

  it('💢 Sang qui bout : la rage joue à PLEIN même à PV pleins', () => {
    const p = hero({ trophy: quest('dechainer'), rage: 1, pv: 400000 });
    const log = run(p, foe({ damage: 30, pv: 900000 })).log;
    const fired = skills(log, 'tr_dechainer');
    expect(fired.length).toBeGreaterThan(0);
    const ordinaire = log.find(
      (e) => e.who === 'player' && e.damage > 0 && !e.skills?.includes('tr_dechainer'),
    )!;
    expect(fired[0]!.damage).toBeGreaterThan(ordinaire.damage);
  });

  it('☠️ Sentence : le prochain coup ACHÈVE, ennemi à pleine vie', () => {
    const p = hero({ trophy: quest('achever'), crit: 1, execute: 1 });
    const log = run(p, foe({ pv: 500000, damage: 1 })).log;
    const fired = skills(log, 'tr_achever');
    expect(fired.length).toBeGreaterThan(0);
    const i = log.indexOf(fired[0]!);
    // L'ennemi est loin d'être à terre : sans le trophée, l'exécution ne s'appliquerait pas.
    expect(log[i]!.monsterPv / 500000).toBeGreaterThan(0.5);
    expect(fired[0]!.skills).toContain('execute');
  });
});

describe('🏆 la quête se lit dans le rejeu', () => {
  it('chaque compétence de trophée a un nom et un emoji', () => {
    for (const p of TROPHY_POWERS) {
      const info = combatSkillInfo(`tr_${p.id}` as CombatSkill);
      expect(info?.name, p.id).toBe(p.name);
      expect(info?.emoji, p.id).toBe(p.emoji);
    }
    expect(combatSkillInfo('tr_quest')?.name).toBeTruthy();
  });

  it('⚠️ contre un BOSS seul, la quête s’accomplit au moins une fois même en Bronze', () => {
    // Spec § 5.3 : sinon un trophée de début de partie ne se déclencherait jamais.
    const p = hero({ trophy: quest('etaler', 10), pv: 60000 });
    const log = run(p, foe({ pv: 200000, damage: 900 })).log;
    expect(skills(log, 'tr_quest').length).toBeGreaterThan(0);
  });

  it('le journal porte l’avancement de la quête, et il REPART à zéro une fois accomplie', () => {
    const p = hero({ trophy: quest('etaler', 3) });
    const log = run(p).log;
    const suivis = log.filter((e) => e.quest !== undefined);
    expect(suivis.length).toBe(log.length); // un trophée porté : tous les événements le disent
    for (const e of suivis) expect(e.quest!).toBeLessThan(3); // jamais au-delà de la longueur
    // Il monte, puis retombe : c'est ce que la barre du rejeu montre.
    const vus = suivis.map((e) => e.quest!);
    expect(Math.max(...vus)).toBeGreaterThan(0);
    expect(vus.some((v, i) => i > 0 && v < vus[i - 1]!)).toBe(true);
    // Sans trophée, rien à afficher.
    expect(run(hero()).log.every((e) => e.quest === undefined)).toBe(true);
  });

  it('le pouvoir d’un trophée se retrouve par son id', () => {
    for (const p of TROPHY_POWERS) expect(trophyPowerOf(p.id)).toBe(p);
    expect(trophyPowerOf('inconnu')).toBeUndefined();
    expect(trophyPowerOf(undefined)).toBeUndefined();
  });
});
