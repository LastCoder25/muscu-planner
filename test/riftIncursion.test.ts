import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RIFT,
  incursionBodies,
  incursionFoesDown,
  incursionMana,
  incursionWinPct,
  resolveIncursion,
  riftClearMana,
  riftFoe,
  riftPopulation,
  riftSpecOf,
  simulateIncursion,
  type RiftRun,
} from '@/lib/rift';
import { EXPE, harvestYield, type Poi } from '@/lib/expedition';
import {
  caravanWages,
  missionXp,
  missionXpFor,
  missionXpSplit,
  CARAVAN,
  XP_TEAM_REF,
  partyAllies,
  refAdvGear,
  refChampionAdv,
  type PartyHero,
  type EscortKit,
} from '@/lib/caravan';
import { partyCapFor, partyFightSeed, partyForecastSeed, partySendBlocker } from '@/lib/party';
import { fuseUnits, skirmishXpShares } from '@/lib/skirmish';
import { gearedFighter } from './helpers/gearedFighter';
import { type Adventurer } from '@/lib/adventurers';

/**
 * ⚔️ L'INCURSION JOUABLE — ce qu'on envoie dans une faille, et ce qu'on en rapporte.
 *
 * `rift.test.ts` couvre le MODÈLE (effectif, mana, mine résiduelle) et la CALIBRATION du
 * parcours ; ce fichier couvre la MISSION : qui part, qui apprend, qui finit à l'infirmerie,
 * et ce que la faille paie — en mana, et en mana seulement.
 */

const RIFT_MS = EXPE.lifespanMs.rift;
/** `now` correspondant à un âge en jours (la faille naît à 0). */
const at = (days: number) => Math.round((days / 7) * RIFT_MS);

const rift = (over: Partial<Poi> = {}): Poi => ({
  id: 'rift_a',
  type: 'rift',
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: RIFT_MS,
  ...over,
});

const team = (n: number, level: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(level, i),
    id: `adv_${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = (level: number, n: number): EscortKit => ({
  talents: [],
  advGear: refAdvGear(level, n),
});

interface Opts {
  poi?: Poi;
  escort?: Adventurer[];
  hero?: PartyHero | null;
  seed?: number;
  now?: number;
}
function run(o: Opts = {}) {
  const poi = o.poi ?? rift();
  const escort = o.escort ?? team(3, poi.level);
  return resolveIncursion({
    poi,
    escort,
    road: road(poi.level, escort.length),
    hero: o.hero ?? null,
    seed: o.seed ?? 4242,
    now: o.now ?? at(7),
    // ⚠️ Panthéon AU NIVEAU du lieu : la prime de rattrapage vaut 1, comme dans toutes
    // les calibrations de ce fichier (elle a ses tests à part).
    pantheonLevel: o.pantheonLevel ?? poi.level,
  });
}

/** Le héros ÉQUIPÉ du projet (`gearedFighter`, le harnais partagé) : mesuré, il ferme
 *  n'importe quelle faille à 100 %, à tout niveau. ⚠️ On mesure le joueur qui EXISTE,
 *  pas un combattant fabriqué à la main. */
const heroFort = (level: number): PartyHero => ({
  name: 'Toi',
  level,
  combatant: gearedFighter(level, 7),
});
/** Un groupe amputé : il ne ferme rien (mesuré : 0 à 2 % dès deux membres de moins). */
const groupeFaible = (level: number) => team(1, level);

describe('💠 ce qu’une incursion paie — du mana, et RIEN d’autre', () => {
  it('⚠️ un ÉCHEC paie quand même le mana des monstres abattus', () => {
    const o = run({ escort: groupeFaible(26) });
    expect(o.win).toBe(false);
    // Les abattus paient : `incursionMana` sans la prime du gardien.
    expect(o.mana).toBe(
      incursionMana(
        {
          cleared: false,
          killed: o.party!.slain,
          population: o.party!.foes,
          bossDown: false,
          finalPv: 0,
          journal: [],
        },
        26,
      ),
    );
    // ⚠️ La garantie qui compte : on ne repart JAMAIS les mains vides si l'on a tué.
    if (o.party!.slain > 0) expect(o.mana).toBeGreaterThan(0);
  });

  it('fermer ajoute la prime du gardien — exactement `riftClearMana`', () => {
    const p = rift();
    const o = run({ poi: p, hero: heroFort(26) });
    expect(o.win).toBe(true);
    expect(o.mana).toBe(riftClearMana(p, at(7)));
    // Et la prime EST la différence avec « tout tué, gardien debout ».
    const sansBoss = incursionMana(
      {
        cleared: false,
        killed: riftPopulation(p, at(7)),
        population: riftPopulation(p, at(7)),
        bossDown: false,
        finalPv: 0,
        journal: [],
      },
      p.level,
    );
    expect(o.mana).toBeGreaterThan(sansBoss);
    expect(o.mana).toBe(Math.round(sansBoss * (1 + RIFT.bossManaShare)));
  });

  it('⚠️ AUCUNE autre devise, AUCUN objet, AUCUNE pièce d’aventurier — même en fermant', () => {
    // La faille EST l'usine de mana : y ajouter une source d'équipement non mesurée est
    // précisément ce que le projet s'interdit (les pièces d'ensemble de la spec sont écartées
    // pour cette raison). Et une devise MORTE (poussière, parchemins) n'y suinte pas non plus.
    for (const hero of [null, heroFort(26)]) {
      const o = run({ hero });
      expect(o.gold).toBe(0);
      expect(o.energy).toBe(0);
      expect(o.summonStones).toBe(0);
      expect('scrap' in o).toBe(false);
      expect(o.key).toBe(0);
      expect(o.item).toBeNull();
      expect(o.items).toEqual([]);
      expect(o.party).not.toHaveProperty('advGear');
      expect(o.mana).toBeGreaterThan(0);
    }
  });

  it('⚠️ fermer paie NETTEMENT mieux que laisser déborder et ramasser la mine', () => {
    // L'invariant économique : sinon le robinet du gacha serait alimenté par la PASSIVITÉ.
    for (const level of [5, 26, 60, 100]) {
      const p = rift({ level });
      const fermer = run({ poi: p, hero: heroFort(level) }).mana;
      const ignorer = harvestYield('mana_mine', level, 3).mana;
      expect(fermer / Math.max(1, ignorer), `niv ${level}`).toBeGreaterThan(2.5);
    }
  });
});

describe('🎓 l’XP d’une incursion : les aventuriers, et eux seuls', () => {
  it('socle de mission selon l’issue + part des abattus — la règle EXACTE des camps', () => {
    const p = rift({ distNorm: 0.9 });
    const esc = team(3, p.level);
    const o = run({ poi: p, escort: esc, hero: heroFort(p.level) });
    const bodies = incursionBodies(p, at(7));
    const shares = skirmishXpShares(esc, bodies, {
      foesDown: incursionFoesDown(
        {
          cleared: o.win,
          killed: o.party!.slain,
          population: o.party!.foes,
          bossDown: o.win,
          finalPv: 0,
          journal: [],
        },
        bodies,
      ),
    });
    // ⚠️ 3 champions + le héros (compte pour 2) : 5 membres, le socle se partage (v0.1038).
    expect(o.party!.xp).toEqual(missionXpFor(esc, p, o.win, shares, 26));
  });

  it('⚠️ le HÉROS ne prend AUCUNE part : les aventuriers partagent entre eux', () => {
    const p = rift();
    const esc = team(3, p.level);
    const avec = run({ poi: p, escort: esc, hero: heroFort(p.level) });
    // Sa clé n'existe pas, et les parts ne sont pas divisées par 4.
    expect(Object.keys(avec.party!.xp).sort()).toEqual(esc.map((a) => a.id).sort());
    expect(avec.party!.heroKills).toBe(0);
  });

  it('⚠️ la distance ne change rien : seul le NIVEAU de la faille compte (v0.1014)', () => {
    const esc = team(3, 26);
    const pres = run({ poi: rift({ distNorm: 0.1 }), escort: esc, hero: heroFort(26) });
    const loin = run({ poi: rift({ distNorm: 0.9 }), escort: esc, hero: heroFort(26) });
    expect(loin.party!.xp).toEqual(pres.party!.xp);
  });

  it('un groupe VIDE (héros seul) ne verse aucune XP', () => {
    // ⚠️ Il ne « ferme quand même » plus (v0.980) : seul, il ne vaut que deux champions.
    const o = run({ escort: [], hero: heroFort(26) });
    expect(o.party!.xp).toEqual({});
    expect(o.party!.escort).toEqual([]);
  });
});

describe('🤕 l’infirmerie et les salaires', () => {
  it('⚠️ DÉFAITE → TOUT le groupe à l’infirmerie (le combattant fondu est mort)', () => {
    const esc = team(1, 26);
    const o = run({ escort: esc });
    expect(o.win).toBe(false);
    expect(o.party!.hurt).toEqual(esc.map((a) => a.id));
  });

  it('VICTOIRE → personne à l’infirmerie', () => {
    const o = run({ hero: heroFort(26) });
    expect(o.win).toBe(true);
    expect(o.party!.hurt).toEqual([]);
  });

  it('les salaires sont facturés à l’escorte, jamais au héros', () => {
    const p = rift();
    const esc = team(3, p.level);
    expect(run({ poi: p, escort: esc, hero: heroFort(p.level) }).party!.wages).toBe(
      caravanWages(esc, p),
    );
    expect(run({ poi: p, escort: [], hero: heroFort(p.level) }).party!.wages).toBe(
      caravanWages([], p),
    );
  });
});

describe('👾 les corps d’une faille — ceux du COMBAT, pas une seconde construction', () => {
  it('chaque corps est le `riftFoe` de son rang de profondeur, gardien en DERNIER', () => {
    const p = rift({ level: 40 });
    const now = at(5);
    const pop = riftPopulation(p, now);
    const bodies = incursionBodies(p, now);
    const faction = riftSpecOf(p).faction;
    expect(bodies).toHaveLength(pop + 1);
    for (let i = 0; i < pop; i++) {
      const f = riftFoe(p.level, faction, i, false);
      expect(bodies[i]!.combatant.pv, `corps ${i}`).toBe(f.pv);
      expect(bodies[i]!.combatant.damage, `corps ${i}`).toBe(f.damage);
      expect(bodies[i]!.level).toBe(p.level);
    }
    const boss = riftFoe(p.level, faction, pop, true);
    expect(bodies[pop]!.combatant.pv).toBe(boss.pv);
    // Le gardien PÈSE : sa force est celle que le combat lui donne.
    expect(bodies[pop]!.combatant.pv).toBeGreaterThan(bodies[pop - 1]!.combatant.pv);
  });

  it('⚠️ `incursionFoesDown` : les `killed` premiers, le gardien SEULEMENT s’il est tombé', () => {
    const p = rift();
    const bodies = incursionBodies(p, at(7));
    const base: RiftRun = {
      cleared: false,
      killed: 4,
      population: bodies.length - 1,
      bossDown: false,
      finalPv: 0,
      journal: [],
    };
    expect(incursionFoesDown(base, bodies)).toEqual(['rift_0', 'rift_1', 'rift_2', 'rift_3']);
    expect(incursionFoesDown({ ...base, bossDown: true }, bodies)).toContain('rift_boss');
    expect(incursionFoesDown(base, bodies)).not.toContain('rift_boss');
    // Rien tué, rien à créditer.
    expect(incursionFoesDown({ ...base, killed: 0 }, bodies)).toEqual([]);
    // Tout tué + gardien = tous les corps, sans doublon.
    const tout = incursionFoesDown(
      { ...base, killed: base.population, bossDown: true, cleared: true },
      bodies,
    );
    expect(tout).toHaveLength(bodies.length);
    expect(new Set(tout).size).toBe(bodies.length);
  });
});

describe('🎯 le pronostic ne rejoue JAMAIS la bataille qui aura lieu', () => {
  it('⚠️ graines DISJOINTES PAR PARITÉ (doctrine v0.767)', () => {
    const forecast = new Set(Array.from({ length: 500 }, (_, i) => partyForecastSeed(i)));
    const seeds = Array.from({ length: 400 }, (_, i) => i * 7 + 1);
    for (const s of seeds) expect(forecast.has(partyFightSeed(s)), `graine ${s}`).toBe(false);
  });

  it('`incursionWinPct` pronostique la FERMETURE, et échantillonne les graines du pronostic', () => {
    const p = rift();
    const esc = team(3, p.level);
    const allies = partyAllies(esc, road(p.level, 3), null);
    const group = fuseUnits(allies, 'Groupe');
    const n = 20;
    let w = 0;
    for (let i = 0; i < n; i++)
      if (simulateIncursion(group, p, at(7), partyForecastSeed(i)).cleared) w++;
    expect(incursionWinPct(p, allies, at(7), n)).toBeCloseTo(w / n, 6);
  });

  it('un groupe vide n’a aucune chance annoncée', () => {
    expect(incursionWinPct(rift(), [], at(7), 10)).toBe(0);
  });
});

describe('📐 la calibration MESURÉE tient sur le vrai chemin d’envoi', () => {
  /** Part des incursions fermées par ce groupe, par `resolveIncursion` (le chemin réel). */
  const part = (level: number, days: number, n: number, tries = 60) => {
    const esc = team(n, level);
    let w = 0;
    for (let s = 1; s <= tries; s++)
      if (run({ poi: rift({ level }), escort: esc, seed: s * 7919 + 1, now: at(days) }).win) w++;
    return w / tries;
  };

  it('⚠️ le GROUPE DE RÉFÉRENCE reste un PARI sur une faille mûre (0,55 → 0,90)', () => {
    // Mesuré en v0.923 sur `simulateIncursion` (0,68-0,75) ; on vérifie que le chemin RÉEL
    // (`partyAllies` → `fuseUnits` → `resolveIncursion`) reproduit la même bande — c'est ce
    // qui prouve que l'écran et la résolution parlent du groupe qu'on a calibré.
    for (const level of [12, 26, 45, 70, 100]) {
      const p = part(level, 7, 3);
      expect(p, `niv ${level}`).toBeGreaterThan(0.55);
      expect(p, `niv ${level}`).toBeLessThan(0.9);
    }
  });

  it('⚠️ L’ÂGE EST L’AXE : une faille jeune se ferme, une faille mûre se mérite', () => {
    for (const level of [26, 70]) {
      expect(part(level, 1, 3), `niv ${level} jeune`).toBeGreaterThan(0.85);
      expect(part(level, 7, 3), `niv ${level} mûre`).toBeLessThan(part(level, 1, 3));
    }
  });

  it('⚠️ MESURÉ ET ASSUMÉ : à QUATRE aventuriers la difficulté s’éteint (aucun axe de taille)', () => {
    // La faille n'a **qu'un** axe de force (son niveau, donc son rang) : `riftFoe` est calibré
    // sur le groupe de RÉFÉRENCE (3 aventuriers) et rien ne le fait grandir avec le groupe
    // envoyé — décision explicite de la v0.922 (« un second axe “taille” façon `CAMP_SIZES`
    // demanderait sa propre calibration mesurée »). Mesuré ici : 1 av → 0-2 %, 2 → 0-45 %,
    // 3 → 68-98 %, **4 et plus → 100 % à tout âge et à tout niveau**. Ce test ENCODE la
    // conséquence pour qu'elle ne passe pas pour un hasard : « combien j'en envoie » n'a
    // qu'une réponse dès qu'on a quatre aventuriers libres.
    for (const level of [26, 70]) {
      expect(part(level, 7, 1), `niv ${level} solo`).toBeLessThan(0.1);
      expect(part(level, 7, 4, 30), `niv ${level} quatuor`).toBeGreaterThan(0.95);
    }
  });

  it('⚠️ le HÉROS ÉQUIPÉ ne vaut que DEUX champions (v0.980) — il ne ferme plus tout seul', () => {
    // ⚠️ RENVERSE la v0.932 (« un héros équipé ferme tout — assumé ») : mesuré, il refermait
    // à 100 % des failles de 40 à 60 niveaux au-dessus de lui, et le plafond de 3 champions
    // ne bornait rien. Borné (`heroPartyCombatant`), il vaut 2 champions : seul, il ne
    // referme presque jamais une faille mûre ; avec un champion, il vaut à peu près un
    // groupe de 2 à 4.
    const seul = (level: number) => {
      let w = 0;
      for (let s = 1; s <= 30; s++)
        if (
          run({ poi: rift({ level }), escort: [], hero: heroFort(level), seed: s * 7919 + 1 }).win
        )
          w++;
      return w / 30;
    };
    const plusUn = (level: number) => {
      let w = 0;
      for (let s = 1; s <= 30; s++)
        if (
          run({
            poi: rift({ level }),
            escort: team(1, level),
            hero: heroFort(level),
            seed: s * 7919 + 1,
          }).win
        )
          w++;
      return w / 30;
    };
    for (const level of [12, 26, 70]) {
      expect(seul(level), `niv ${level} seul`).toBeLessThan(0.4);
      const p = plusUn(level);
      expect(p, `niv ${level} +1`).toBeGreaterThanOrEqual(part(level, 7, 2, 30));
      expect(p, `niv ${level} +1`).toBeLessThanOrEqual(part(level, 7, 4, 30));
    }
  });
});

describe('🧊 l’issue est figée AU DÉPART', () => {
  it('même graine, même instant, même issue — et une autre graine peut différer', () => {
    const a = run({ seed: 99 });
    const b = run({ seed: 99 });
    expect(b).toEqual(a);
    // Le combat suit `partyFightSeed`, donc la graine du départ change le parcours.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => run({ seed: s, escort: team(3, 26) }).mana);
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('le journal raconte le parcours, et se termine par le sort du gardien', () => {
    const o = run({ hero: heroFort(26) });
    expect(o.party!.journal.length).toBeGreaterThan(2);
    expect(o.party!.journal.some((l) => l.includes('porte'))).toBe(true);
    expect(o.party!.journal.at(-1)).toMatch(/refer|tient/);
  });
});

describe('🔗 la résolution emprunte bien la graine DU COMBAT', () => {
  it('⚠️ `resolveIncursion` rejoue EXACTEMENT `simulateIncursion(…, partyFightSeed(seed))`', () => {
    // Sans ce test, `resolveIncursion` pourrait employer la graine du départ TELLE QUELLE :
    // les graines du pronostic ne seraient plus disjointes de la bataille, et un % affiché
    // avant l'envoi finirait par en révéler l'issue. La parité ne protège que si les deux
    // bouts l'utilisent.
    const p = rift({ level: 45 });
    const esc = team(3, p.level);
    const seed = 777;
    const o = run({ poi: p, escort: esc, seed });
    const group = fuseUnits(partyAllies(esc, road(p.level, 3), null), 'Groupe');
    const attendu = simulateIncursion(group, p, at(7), partyFightSeed(seed));
    expect(o.win).toBe(attendu.cleared);
    expect(o.party!.slain).toBe(attendu.killed);
    expect(o.party!.journal).toEqual(attendu.journal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 👥 LA TAILLE D'UNE ÉQUIPE : le Panthéon seul (v0.1038)
//
// Décision de l'utilisateur : « permettre aux expéditions de partir à plus que 3 pour abattre
// les events plus haut niveau ; plus il y a de champions plus l'XP est divisée, c'est tout ».
// Mesuré avant (v0.979) : une faille mûre, sans héros — 3 → 62-83 %, 4 → 99-100 %. Au-delà de
// 3 le nombre ne coûte plus une place, il coûte de l'XP (`missionXpSplit`).
// ─────────────────────────────────────────────────────────────────────────────
describe('👥 une équipe n’est bornée que par le Panthéon (v0.1038)', () => {
  const camp = (): Poi => ({ ...rift(), id: 'camp_x', type: 'camp' });
  const mine = (): Poi => ({ ...rift(), id: 'mine_x', type: 'mine' });

  it('⚠️ le plafond est celui du Panthéon, plus 3', () => {
    for (const engage of [2, 3, 16, 51]) expect(partyCapFor(engage)).toBe(engage);
    for (const p of [camp(), rift(), mine()]) {
      expect(partySendBlocker(p, 16, false, 5, 16), p.type).toBeNull();
      expect(partySendBlocker(p, 17, false, 5, 16), p.type).toBe('tooMany');
    }
  });

  it('le héros ne prend plus de place : il s’ajoute à autant de champions que permis', () => {
    expect(partySendBlocker(rift(), 0, true, 5, 51)).toBeNull();
    expect(partySendBlocker(rift(), 5, true, 5, 51)).toBeNull();
    // L'équipe du héros ne prend pas de créneau de l'Avant-poste.
    expect(partySendBlocker(mine(), 1, true, 0, 51)).toBeNull();
    expect(partySendBlocker(mine(), 1, false, 0, 51)).toBe('slots');
  });
});

describe('🎓 plus il y a de membres, plus l’XP se partage (v0.1038)', () => {
  it('⚠️ le partage est STRICT dès le 1er membre (v0.1107)', () => {
    // ⚠️ RÉÉCRIT. Il épinglait « jusqu’à 3 membres rien ne change » — le palier que la
    // refonte supprime (décision de l’utilisateur : « c’est normal de diviser le total
    // d’XP d’un lieu entre les participants »). L’XP d’un lieu est désormais FIXE et se
    // divise dès le deuxième champion : un champion seul la prend entière.
    expect(missionXpSplit(1)).toBeCloseTo(XP_TEAM_REF);
    expect(missionXpSplit(2)).toBeCloseTo(XP_TEAM_REF / 2);
    expect(missionXpSplit(XP_TEAM_REF)).toBe(1);
  });

  it('⚠️ PARTAGER veut dire que le TOTAL de l’équipe ne bouge pas', () => {
    // La propriété centrale du partage, et elle n’était testée nulle part : tant que le
    // plancher ne mord pas, l’XP du LIEU est une enveloppe — la répartir autrement ne la
    // crée ni ne la détruit. C’est ce qui rend « qualité ou quantité » honnête.
    const total = (n: number) => n * missionXpSplit(n);
    for (let n = 1; n <= 6; n++) expect(total(n), `n=${n}`).toBeCloseTo(XP_TEAM_REF);
    // Au-delà, le plancher en rend PLUS que l’enveloppe : c’est voulu (cf. plus bas),
    // sinon gagner à 10 rapporterait moins que perdre à 3.
    expect(total(10)).toBeGreaterThan(XP_TEAM_REF);
  });

  it('au-delà, le socle se partage à parts égales entre les champions', () => {
    expect(missionXpSplit(4)).toBeCloseTo(XP_TEAM_REF / 4);
    expect(missionXpSplit(6)).toBeCloseTo(0.5);
    for (let n = 3; n < 12; n++)
      expect(missionXpSplit(n + 1)).toBeLessThanOrEqual(missionXpSplit(n));
  });

  // ⚠️ PLANCHER À `xpLossShare` (v0.1095, mesuré ; décision de l'utilisateur : « si le lieu
  // est trop dur il faut envoyer tout le monde, mais du coup on ne peut pas les envoyer
  // ailleurs — en soi c'est déjà un inconvénient »). Sans lui, sur les lieux qui ne se
  // gagnent qu'à 8, la meilleure stratégie était d'envoyer 3 champions et de PERDRE.
  it('⚠️ GAGNER ne rapporte JAMAIS moins que PERDRE avec l’escorte de référence', () => {
    const p = rift({ level: 26 });
    const perduARef = missionXpFor(team(XP_TEAM_REF, 26), p, false, {}, 26).adv_0!;
    for (const n of [4, 6, 8, 10, 14, 20]) {
      const gagne = missionXpFor(team(n, 26), p, true, {}, 26).adv_0!;
      expect(gagne, `escorte de ${n}`).toBeGreaterThanOrEqual(perduARef);
    }
  });

  it('le plancher EST la part d’un échec, et il en est dérivé', () => {
    for (let n = 1; n <= 50; n++)
      expect(missionXpSplit(n), `n=${n}`).toBeGreaterThanOrEqual(CARAVAN.xpLossShare);
    // Il MORD : au-delà de 6, le partage à parts égales passerait dessous.
    expect(XP_TEAM_REF / 8).toBeLessThan(CARAVAN.xpLossShare);
    expect(missionXpSplit(8)).toBeCloseTo(CARAVAN.xpLossShare);
  });

  // ⚠️ TEST DE COPIE, assumé comme tel : écrire `0.5` en dur donne EXACTEMENT le même
  // résultat tant que `xpLossShare` vaut 0,5 — aucune valeur d'exécution ne peut les
  // distinguer. Ce qu'on garde ici, c'est que le plancher SUIVRA si cette part change ;
  // sinon la garantie « gagner ≥ perdre » tomberait en silence au prochain réglage.
  it('le plancher est LU sur xpLossShare, pas recopié', () => {
    const src = readFileSync(new URL('../src/lib/caravan.ts', import.meta.url), 'utf8');
    const corps = src.slice(src.indexOf('export function missionXpSplit'));
    const fin = corps.slice(0, corps.indexOf('}'));
    expect(fin).toContain('CARAVAN.xpLossShare');
  });

  it('⚠️ il supprime une punition, il n’ajoute AUCUNE prime à sur-remplir', () => {
    // Un champion en surnombre rapporte toujours moins qu'à l'escorte de référence…
    for (let n = XP_TEAM_REF + 1; n <= 20; n++)
      expect(missionXpSplit(n)).toBeLessThan(missionXpSplit(XP_TEAM_REF));
    // …et le partage suit exactement l’enveloppe tant que le plancher ne mord pas.
    for (const n of [1, 2, 3, 4, 5, 6])
      expect(missionXpSplit(n), `n=${n}`).toBeCloseTo(
        Math.max(CARAVAN.xpLossShare, XP_TEAM_REF / n),
      );
  });

  it('le socle d’un membre baisse quand l’équipe grossit, la part des abattus reste la sienne', () => {
    const p = rift({ level: 26 });
    const trois = missionXpFor(team(3, 26), p, true, {}, 26);
    const six = missionXpFor(team(6, 26), p, true, {}, 26);
    expect(six.adv_0!).toBeLessThan(trois.adv_0!);
    expect(six.adv_0!).toBeCloseTo(trois.adv_0! / 2, -1);
    // Les abattus passent tels quels (déjà divisés entre les présents).
    const avec = missionXpFor(team(6, 26), p, true, { adv_0: 40 }, 26);
    expect(avec.adv_0! - six.adv_0!).toBe(40);
  });

  it('⚠️ le HÉROS ne prend AUCUNE part du partage (v0.1109, demandé)', () => {
    // Il comptait pour deux parts, perdues : sa présence coûtait de l'XP aux champions. Le
    // partage ne CONNAÎT plus le héros — la garantie est dans la SIGNATURE : un paramètre
    // « héros » qui reviendrait rouvrirait la porte, et c'est ça qu'on interdit.
    expect(missionXpSplit.length).toBe(1);
    expect(missionXpFor.length).toBe(5);
    // Trois champions touchent leur part entière, avec ou sans héros à leurs côtés.
    const p = rift({ level: 26 });
    expect(missionXpFor(team(3, 26), p, true, {}, 26).adv_0!).toBe(
      Math.round(missionXp(team(3, 26)[0]!, p, true)),
    );
  });
});
