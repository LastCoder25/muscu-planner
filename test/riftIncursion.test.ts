import { describe, it, expect } from 'vitest';
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
  missionTravelMult,
  missionXp,
  partyAllies,
  refAdvGear,
  refChampionAdv,
  type PartyHero,
  type EscortKit,
} from '@/lib/caravan';
import {
  RIFT_MAX_PARTY,
  partyCapFor,
  partyFightSeed,
  partyForecastSeed,
  partySendBlocker,
} from '@/lib/party';
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
      expect(o.scrap).toBe(0);
      expect(o.key).toBe(0);
      expect(o.item).toBeNull();
      expect(o.items).toEqual([]);
      expect(o.party!.advGear).toEqual([]);
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
  it('socle de mission + part des abattus × distance — la règle EXACTE des camps', () => {
    // ⚠️ LOIN, pas à mi-carte : `missionTravelMult` vaut EXACTEMENT 1 à `CARAVAN.xpRefDist`
    // (0,5), donc un test posé là ne peut pas voir un « × travel » disparaître.
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
    const travel = missionTravelMult(p);
    for (const a of esc)
      expect(o.party!.xp[a.id], a.id).toBe(
        missionXp(a, p) + Math.round((shares[a.id] ?? 0) * travel),
      );
  });

  it('⚠️ le HÉROS ne prend AUCUNE part : les aventuriers partagent entre eux', () => {
    const p = rift();
    const esc = team(3, p.level);
    const avec = run({ poi: p, escort: esc, hero: heroFort(p.level) });
    // Sa clé n'existe pas, et les parts ne sont pas divisées par 4.
    expect(Object.keys(avec.party!.xp).sort()).toEqual(esc.map((a) => a.id).sort());
    expect(avec.party!.heroKills).toBe(0);
  });

  it('⚠️ aller LOIN paie plus : l’XP suit `missionTravelMult`, comme un convoi', () => {
    const esc = team(3, 26);
    const pres = run({ poi: rift({ distNorm: 0.1 }), escort: esc, hero: heroFort(26) });
    const loin = run({ poi: rift({ distNorm: 0.9 }), escort: esc, hero: heroFort(26) });
    const somme = (o: typeof pres) => Object.values(o.party!.xp).reduce((a, b) => a + b, 0);
    expect(somme(loin)).toBeGreaterThan(somme(pres));
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
// 🕳️ COMBIEN DE CHAMPIONS UNE FAILLE LAISSE ENTRER
//
// ⚠️ MESURÉ : au-delà de 3, une faille ne se joue plus. Part nettoyée d'une faille MÛRE,
// sans héros : 1 → 0 % · 2 → 0-2 % · 3 → 62-83 % · 4 → 99-100 % · 5+ → 100 %, identique
// aux niveaux 12, 26, 45 et 70. La cause est structurelle : une faille n'a qu'UN axe de
// force (son niveau), donc rien ne la fait grandir avec le groupe envoyé.
// ─────────────────────────────────────────────────────────────────────────────
describe('🕳️ le plafond de champions d’une faille', () => {
  const camp = (): Poi => ({ ...rift(), id: 'camp_x', type: 'camp' });

  it('⚠️ une FAILLE n’en laisse passer que RIFT_MAX_PARTY, quel que soit le Panthéon', () => {
    // Le Panthéon d'un joueur avancé en autorise 51 : ici il ne sert à rien.
    for (const engage of [3, 16, 51]) {
      expect(partyCapFor(rift(), engage, false)).toBe(RIFT_MAX_PARTY);
    }
    // …mais il mord quand il est PLUS strict : un débutant n'en a pas trois.
    expect(partyCapFor(rift(), 2, false)).toBe(2);
  });

  it('⚠️ un CAMP garde le plafond du Panthéon — sa TAILLE fait déjà le gradateur', () => {
    // Mesuré : un camp de 10 se gagne à 20-61 % avec 8 champions, 57-99 % avec 10. Un
    // plafond bas y rendrait les gros repaires impossibles sans le héros.
    for (const engage of [3, 16, 51]) {
      expect(partyCapFor(camp(), engage, false)).toBe(engage);
      expect(partyCapFor(camp(), engage, true)).toBe(engage);
    }
  });

  it('le refus DISTINGUE les deux plafonds — ils ne se corrigent pas pareil', () => {
    // Trop pour le Panthéon : ça se lève en le montant.
    expect(partySendBlocker(rift(), 4, false, 5, 2)).toBe('tooMany');
    // Trop pour la faille : ça ne se lèvera jamais.
    expect(partySendBlocker(rift(), 4, false, 5, 51)).toBe('riftCrowd');
    // Trois passent.
    expect(partySendBlocker(rift(), RIFT_MAX_PARTY, false, 5, 51)).toBeNull();
    // Et un camp, lui, en accepte dix.
    expect(partySendBlocker(camp(), 10, false, 5, 51)).toBeNull();
  });

  it('⚠️ le HÉROS compte dans les 3 d’une faille (décision 2026-09-21)', () => {
    // Mesuré (v0.979) : héros seul → 100 % de fermeture. Sans ça il décidait seul.
    expect(partyCapFor(rift(), 51, true)).toBe(RIFT_MAX_PARTY - 1);
    expect(partySendBlocker(rift(), RIFT_MAX_PARTY, true, 5, 51)).toBe('riftCrowd');
    expect(partySendBlocker(rift(), RIFT_MAX_PARTY - 1, true, 5, 51)).toBeNull();
    // Un Panthéon plus strict mord toujours, héros ou non.
    expect(partyCapFor(rift(), 1, true)).toBe(1);
  });

  it('⚠️ le plafond est SOUS le point où la faille cesse de se jouer', () => {
    // C'est tout l'objet du nombre : à 4 la part nettoyée est de 99-100 % à tout niveau
    // et à tout âge, donc « combien j'en envoie » n'aurait plus qu'une réponse.
    expect(RIFT_MAX_PARTY).toBeLessThan(4);
    // …et au-dessus de 2, où elle est quasi imprenable (0-2 % sur une faille mûre).
    expect(RIFT_MAX_PARTY).toBeGreaterThan(2);
  });
});
