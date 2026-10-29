import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { archipelOn, ISLANDS, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, depositMessages, type ExpeditionMap } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  ensureIslandConquest,
  FORTRESS_ID,
  fortressForce,
  isIslandTargetId,
  islandConquest,
  razeIslandTarget,
  regainIslandTarget,
  redirectIslandAttacks,
} from '@/lib/islandConquest';
import {
  isMilestoneId,
  isMilestoneMessage,
  MILESTONE_OFFSETS,
  MILESTONES,
  milestoneId,
  milestonesOf,
  milestoneViews,
  settleMilestones,
} from '@/lib/islandMilestones';
import { messageCard } from '@/lib/missionCard';
import { messageCategory } from '@/lib/messageFilter';

/**
 * 🏅 LES JALONS D'ÎLE (livraison 1 « rival nommé + jalons ») : quatre paliers de niveau par île,
 * cochés une fois pour toutes, sans or, sans effet sur la conquête.
 */
const NOW = Date.UTC(2026, 9, 29, 12);

function island(id: number, lv = 42): ExpeditionMap {
  const m = createMap(5, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, lv, ISLAND_OUTPOST_LEVEL), NOW, lv);
}
/** Passe un tick au niveau `lv` et rend la carte (ou la même si rien ne change). */
const tick = (m: ExpeditionMap, lv: number, t = NOW) => settleMilestones(m, t, lv)?.map ?? m;
const marks = (m: ExpeditionMap) => m.archipel!.milestones;

describe('🏅 la table des jalons', () => {
  it('île 3 : quatre jalons aux niveaux 45, 50, 55 et 60 (entrée + 4, 9, 14, 19)', () => {
    expect(milestonesOf(3).map((m) => m.level)).toEqual([45, 50, 55, 60]);
    expect(milestonesOf(3).map((m) => m.id)).toEqual([
      'isl_mile_3_1',
      'isl_mile_3_2',
      'isl_mile_3_3',
      'isl_mile_3_4',
    ]);
  });

  it('chaque jalon a un nom et un texte uniques, jamais « Jalon n »', () => {
    const defs = milestonesOf(3).map((m) => m.def);
    expect(new Set(defs.map((d) => d.name)).size).toBe(4);
    expect(new Set(defs.map((d) => d.text)).size).toBe(4);
    for (const d of defs) {
      expect(d.name).not.toMatch(/jalon\s*\d/i);
      expect(d.text.length).toBeGreaterThan(40);
    }
  });

  it('un seul petit coffre, au dernier jalon, en runes seulement (aucun or)', () => {
    const chests = milestonesOf(3).filter((m) => m.def.chest);
    expect(chests.map((m) => m.n)).toEqual([4]);
    expect(chests[0]!.def.chest!.runes).toBeGreaterThan(0);
    expect(chests[0]!.def.chest!.runes).toBeLessThanOrEqual(3);
  });

  it('îles 1, 2, 4 et 5 : aucun jalon (comportement inchangé)', () => {
    for (const id of [1, 2, 4, 5]) expect(milestonesOf(id)).toEqual([]);
    expect(Object.keys(MILESTONES)).toEqual(['3']);
  });

  it('un jalon au-delà du plafond de l’île est omis', () => {
    const old = MILESTONE_OFFSETS[3];
    try {
      MILESTONE_OFFSETS[3] = 25; // 41 + 25 = 66 > 60
      expect(milestonesOf(3).map((m) => m.level)).toEqual([45, 50, 55]);
      MILESTONE_OFFSETS[3] = 19;
      expect(milestonesOf(3)).toHaveLength(4);
    } finally {
      MILESTONE_OFFSETS[3] = old;
    }
  });

  it('chaque île a sa plage de niveaux : le dernier jalon ne dépasse jamais son plafond', () => {
    for (const isl of ISLANDS)
      for (const m of milestonesOf(isl.id)) expect(m.level).toBeLessThanOrEqual(isl.maxLevel);
  });
});

describe('🏅 franchir un jalon', () => {
  it('le niveau atteint coche le jalon, annonce dans la boîte, une seule fois', () => {
    const m0 = tick(island(3), 44); // première lecture : rien devant lui n’est dépassé
    expect(marks(m0)).toEqual({});
    const s = settleMilestones(m0, NOW + 1000, 47)!;
    expect(s.fresh.map((m) => m.n)).toEqual([1]);
    expect(s.msgs).toHaveLength(1);
    expect(s.msgs[0]!.id).toBe('isl_mile_3_1');
    expect(s.msgs[0]!.title).toBe(MILESTONES[3]![0].name);
    expect(marks(s.map)!['isl_mile_3_1']).toEqual({ at: NOW + 1000 });
    // idempotent : le même niveau, plus rien
    expect(settleMilestones(s.map, NOW + 2000, 47)).toBeNull();
    expect(settleMilestones(s.map, NOW + 2000, 49)).toBeNull();
  });

  it('un message de passage ne porte ni or, ni énergie, ni coffre (jalons 1 à 3)', () => {
    const m0 = tick(island(3), 44);
    const s = settleMilestones(m0, NOW, 59)!;
    expect(s.msgs.map((m) => m.id)).toEqual(['isl_mile_3_1', 'isl_mile_3_2', 'isl_mile_3_3']);
    for (const msg of s.msgs) {
      expect(msg.gold).toBe(0);
      expect(msg.energy).toBe(0);
      expect(msg.chest).toBeUndefined();
      expect(msg.runes).toBeUndefined();
      expect(msg.claimed).toBeUndefined(); // rien à encaisser
    }
  });

  it('le niveau 60 dépose le petit coffre, à encaisser, une seule fois même rejoué', () => {
    const m0 = tick(island(3), 44);
    const s = settleMilestones(m0, NOW, 60)!;
    const chest = s.msgs.find((m) => m.id === 'isl_mile_3_4')!;
    expect(chest.chest).toBe(true);
    expect(chest.claimed).toBe(false);
    expect(chest.runes).toBe(MILESTONES[3]![3].chest!.runes);
    expect(chest.gold).toBe(0);
    expect(s.msgs.filter((m) => m.chest)).toHaveLength(1);
    // Rejouer le tick (écriture perdue, resynchronisation) ne dépose rien de plus sur la carte…
    expect(settleMilestones(s.map, NOW + 5, 60)).toBeNull();
    // …et la boîte ne double pas un id déjà déposé.
    const box = depositMessages([], s.msgs, 50, NOW);
    expect(depositMessages(box, s.msgs, 50, NOW)).toBe(box);
  });

  it('plusieurs jalons d’un coup (appli fermée pendant la montée) : chacun annoncé', () => {
    const s = settleMilestones(tick(island(3), 44), NOW, 56)!;
    expect(s.fresh.map((m) => m.n)).toEqual([1, 2, 3]);
  });

  it('le niveau qui baisse ne défait rien et ne rend rien', () => {
    const m1 = tick(tick(island(3), 44), 52);
    expect(Object.keys(marks(m1)!)).toEqual(['isl_mile_3_1', 'isl_mile_3_2']);
    expect(settleMilestones(m1, NOW + 9, 30)).toBeNull();
    expect(Object.keys(marks(m1)!)).toHaveLength(2);
    // Il repasse 52 : toujours rien (déjà cochés).
    expect(settleMilestones(m1, NOW + 9, 52)).toBeNull();
  });

  it('le niveau vu par la carte est plafonné au rang max de l’île', () => {
    const s = settleMilestones(tick(island(3), 44), NOW, 99)!;
    expect(s.fresh.map((m) => m.n)).toEqual([1, 2, 3, 4]);
  });
});

describe('🏅 un jalon déjà dépassé à l’arrivée est coché sans bruit', () => {
  it('carte sans le champ, joueur niveau 52 : 45 et 50 cochés « silent », ni message ni fanfare', () => {
    const m = island(3, 52);
    expect(m.archipel!.milestones).toBeUndefined();
    const s = settleMilestones(m, NOW, 52)!;
    expect(s.msgs).toEqual([]);
    expect(s.fresh).toEqual([]);
    expect(marks(s.map)).toEqual({
      isl_mile_3_1: { at: NOW, silent: true },
      isl_mile_3_2: { at: NOW, silent: true },
    });
    // Ensuite 55 est un vrai événement.
    const next = settleMilestones(s.map, NOW + 1, 55)!;
    expect(next.fresh.map((x) => x.n)).toEqual([3]);
    expect(next.msgs).toHaveLength(1);
  });

  it('arrivée au niveau 60 : les quatre cochés sans coffre', () => {
    const s = settleMilestones(island(3, 60), NOW, 60)!;
    expect(s.msgs).toEqual([]);
    expect(Object.keys(marks(s.map)!)).toHaveLength(4);
    expect(settleMilestones(s.map, NOW + 1, 60)).toBeNull();
  });

  it('joueur niveau 42 : 45 et 50 sont devant lui, première lecture = champ vide posé', () => {
    const s = settleMilestones(island(3), NOW, 42)!;
    expect(marks(s.map)).toEqual({});
    expect(s.msgs).toEqual([]);
  });

  it('une carte ancienne (sans le champ) continue de fonctionner partout ailleurs', () => {
    const m = island(3);
    expect('milestones' in m.archipel!).toBe(false);
    expect(milestoneViews(m, 42).map((v) => v.state)).toEqual(['next', 'todo', 'todo', 'todo']);
    expect(islandConquest(m)).not.toBeNull();
    expect(ensureIslandConquest(m, NOW, 42)).toBeTruthy();
  });

  it('carte sans archipel : jamais touchée', () => {
    const plain = createMap(5, NOW, 42, ISLAND_OUTPOST_LEVEL);
    expect(plain.archipel).toBeUndefined();
    expect(settleMilestones(plain, NOW, 60)).toBeNull();
    expect(milestoneViews(plain, 60)).toEqual([]);
    expect(milestoneViews(null, 60)).toEqual([]);
  });
});

describe('🏅 les jalons ne sont pas des lieux : la conquête ne les voit pas', () => {
  it('leurs ids ne sont jamais reconnus comme objectif ou forteresse', () => {
    for (const isl of ISLANDS)
      for (let n = 1; n <= 4; n++) {
        const id = milestoneId(isl.id, n);
        expect(isMilestoneId(id)).toBe(true);
        expect(isIslandTargetId(id)).toBe(false);
      }
    expect(isMilestoneId(FORTRESS_ID)).toBe(false);
    expect(isMilestoneId('isl_obj_0')).toBe(false);
  });

  it('valider tous les jalons ne change ni la conquête, ni le verrou, ni la force de la forteresse', () => {
    const m = island(3, 60);
    const before = {
      conq: islandConquest(m),
      force: fortressForce(ISLANDS[2]!, 0),
      destroyed: m.archipel!.destroyed,
      pois: m.pois,
    };
    const after = tick(m, 60);
    expect(marks(after)).toBeDefined();
    expect(islandConquest(after)).toEqual(before.conq);
    expect(islandConquest(after)!.locked).toBe(before.conq!.locked);
    expect(islandConquest(after)!.objectivesTotal).toBe(before.conq!.objectivesTotal);
    expect(fortressForce(ISLANDS[2]!, islandConquest(after)!.objectivesDown)).toEqual(before.force);
    expect(after.archipel!.destroyed).toEqual(before.destroyed);
    expect(after.pois).toEqual(before.pois);
    // Et le tick de conquête suivant ne les touche pas non plus.
    const again = ensureIslandConquest(after, NOW + 1, 60);
    expect(marks(again)).toEqual(marks(after));
    expect(again.archipel!.destroyed).toEqual(before.destroyed);
  });

  it('les appelants de isIslandTargetId n’attrapent jamais un jalon (abattre, reprendre, rediriger)', () => {
    const m = tick(island(3, 60), 60);
    const id = milestoneId(3, 2);
    expect(razeIslandTarget(m, id, NOW)).toBe(m);
    expect(regainIslandTarget(m, id)).toBe(m);
    const red = redirectIslandAttacks(m, NOW);
    expect(marks(red)).toEqual(marks(m));
    expect(red.archipel!.destroyed).toEqual(m.archipel!.destroyed);
    expect(islandConquest(razeIslandTarget(m, id, NOW))!.objectivesDown).toBe(0);
  });

  it('abattre un objectif ne défait pas un jalon, et le jalon ne défait pas l’objectif', () => {
    const m = tick(island(3, 60), 60);
    const raised = razeIslandTarget(m, 'isl_obj_0', NOW);
    expect(marks(raised)).toEqual(marks(m));
    expect(islandConquest(raised)!.objectivesDown).toBe(1);
  });

  it('un jalon ignoré (jamais franchi) ne verrouille ni ne débloque rien', () => {
    const m = island(3, 42);
    const c = islandConquest(m)!;
    const never = tick(m, 42);
    expect(islandConquest(never)).toEqual(c);
  });
});

describe('🏅 les autres îles : carte inchangée', () => {
  for (const id of [1, 2, 4, 5]) {
    it(`île ${id} : la carte sérialisée est identique, rien n’est posé`, () => {
      const m = island(id, ISLANDS[id - 1]!.maxLevel);
      const json = JSON.stringify(m);
      expect(settleMilestones(m, NOW, ISLANDS[id - 1]!.maxLevel)).toBeNull();
      expect(JSON.stringify(tick(m, 99))).toBe(json);
      expect(json).not.toContain('milestones');
      expect(milestoneViews(m, 99)).toEqual([]);
    });
  }
});

describe('🏅 l’affichage', () => {
  it('atteint / prochain / à venir, le prochain mis en avant', () => {
    expect(milestoneViews(island(3), 42).map((v) => v.state)).toEqual([
      'next',
      'todo',
      'todo',
      'todo',
    ]);
    expect(milestoneViews(island(3), 47).map((v) => v.state)).toEqual([
      'done',
      'next',
      'todo',
      'todo',
    ]);
    expect(milestoneViews(island(3), 60).map((v) => v.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('un jalon coché reste atteint même si le niveau a baissé', () => {
    const m = tick(tick(island(3), 44), 52);
    expect(milestoneViews(m, 30).map((v) => v.state)).toEqual(['done', 'done', 'next', 'todo']);
  });

  it('la vue porte le niveau, le nom, le texte et le coffre du dernier', () => {
    const v = milestoneViews(island(3), 42);
    expect(v.map((x) => x.level)).toEqual([45, 50, 55, 60]);
    expect(v.map((x) => x.chestRunes)).toEqual([null, null, null, 2]);
    expect(v[0]!.name).toBe('La veille des cimetières');
  });

  it('la boîte 📬 reconnaît un jalon : carte « 🏅 », ni héros ni rang, rangée dans « Autres »', () => {
    const s = settleMilestones(tick(island(3), 44), NOW, 47)!;
    const msg = s.msgs[0]!;
    expect(isMilestoneMessage(msg)).toBe(true);
    const card = messageCard(msg, []);
    expect(card.emoji).toBe('🏅');
    expect(card.verdict).toBe('jalon');
    expect(card.hero).toBe(false);
    expect(card.rank).toBeNull();
    expect(messageCategory(msg)).toBe('other');
    const chest = settleMilestones(tick(island(3), 44), NOW, 60)!.msgs.find((m) => m.chest)!;
    expect(messageCategory(chest)).toBe('gift');
    expect(messageCard(chest, []).emoji).toBe('🎁');
  });
});

describe('🏅 le câblage du tick (lecture du store, comme pour les conditions d’île)', () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/stores/character.ts'),
    'utf8',
  );
  it('expeSyncMap coche les jalons avec le niveau VU PAR LA CARTE, persiste la carte et la boîte, fête les neufs', () => {
    expect(src).toMatch(
      /settleMilestones\(endless\?\.map \?\? fort\?\.map \?\? mapP, now, level\)/,
    );
    expect(src).toMatch(/mile\?\.map \?\? endless\?\.map/);
    expect(src).toMatch(/\.\.\.\(mile\?\.msgs \?\? \[\]\)/);
    expect(src).toMatch(/for \(const m of mile\?\.fresh \?\? \[\]\)/);
  });
});
