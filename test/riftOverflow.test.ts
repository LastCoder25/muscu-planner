/**
 * 🕳️⚔️ L'ARMÉE QUI SORT D'UNE FAILLE — le mécanisme, pas encore branché.
 *
 * ⚠️ **NON BRANCHÉ, ET LA MESURE DIT POURQUOI** : `riftOverflows` → `riftOverflowOf` →
 * `markOverflow` → `rollRaid` est complet et vérifié ici, mais le store ne pose PAS le
 * marquage. Mesuré (sonde jetable, les vraies fonctions, 6 graines × 90 jours) : **0,78
 * débordement par jour** (un toutes les 30,6 h, plat selon le niveau) contre un siège
 * toutes les 24 à 72 h → **53 à 79 % des sièges seraient renforcés** ×1,3, donc une tenue
 * qui passe de 85-91 % à 51-71 % — et le joueur **ne peut PAS ENCORE refermer une faille**
 * (v0.926 : elle refuse tout envoi). Ce serait la punition sans le levier, et c'est le
 * joueur INACTIF qui paierait le plus (79 %), à l'envers exact de la règle 1 des sièges.
 */
import { describe, it, expect } from 'vitest';
import {
  RAID,
  advanceBase,
  emptyBase,
  markOverflow,
  rollRaid,
  groupCombatant,
  raidsEnabled,
  type BaseState,
  type DefenseStructure,
  type RiftOverflow,
} from '@/lib/raid';
import { riftOverflowOf, riftSpecOf, type RiftLike } from '@/lib/rift';
import { EXPE, advanceWorld, createMap, isRiftPoi, riftOverflows } from '@/lib/expedition';
// 🗺️ Avant-poste 7 = l'ancienne carte fixe (rayon 64, 16 lieux + 6 failles) : ces tests
// éprouvent la MÉCANIQUE de la carte, pas sa taille (cf. `revealRadius`, v0.1047).
const OUT = 7;

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 19, 8, 0, 0);

function rift(over: Partial<RiftLike> = {}): RiftLike {
  return { id: 'poi_rift_1', level: 30, spawnedAt: T0, ...over };
}
function ov(over: Partial<RiftOverflow> = {}): RiftOverflow {
  return { faction: 'bandits', level: 30, at: T0, ...over };
}
function defs(lvl: number): DefenseStructure[] {
  return [
    { typeId: 'wall', level: lvl },
    { typeId: 'turret', level: lvl },
  ];
}
/** Une base PRÊTE à être assiégée, échéance imminente. */
function readyBase(lvl = 26, at = T0): BaseState {
  return { ...emptyBase(7, at), defenses: defs(lvl), nextRaidAt: at + H };
}

describe('🕳️ ce qu’une faille ENVOIE', () => {
  it('porte la faction de la faille, son niveau et l’instant du débordement', () => {
    const r = rift();
    const o = riftOverflowOf(r);
    expect(o.faction).toBe(riftSpecOf(r).faction);
    expect(o.level).toBe(30);
    expect(o.at).toBe(T0 + EXPE.lifespanMs.rift);
  });

  it('est DATÉ du débordement, pas de la lecture — donc idempotent et comparable', () => {
    const r = rift();
    // Deux lectures à des instants différents donnent le MÊME descripteur : rejouer le
    // passage ne peut ni antidater ni dupliquer la menace.
    expect(riftOverflowOf(r)).toEqual(riftOverflowOf(r));
    expect(riftOverflowOf(rift({ spawnedAt: T0 + 5 * H })).at).toBe(
      T0 + 5 * H + EXPE.lifespanMs.rift,
    );
  });
});

describe('🕳️ le marquage de la base', () => {
  it('garde le PLUS RÉCENT, et un seul', () => {
    const b = emptyBase(1, T0);
    const m = markOverflow(b, [ov({ at: T0 }), ov({ at: T0 + 9 * H }), ov({ at: T0 + 2 * H })]);
    expect(m.overflow?.at).toBe(T0 + 9 * H);
  });

  it('NE S’EMPILE PAS : un marquage déjà posé ne fait pas ×1,3 deux fois', () => {
    const b = markOverflow(emptyBase(1, T0), [ov({ at: T0 })]);
    const b2 = markOverflow(b, [ov({ at: T0 + H, faction: 'betes' })]);
    // Un seul champ, donc au tirage un seul renfort — quel que soit le nombre de failles.
    const raid = rollRaid(1234, 26, T0, 0, b2.overflow);
    const th = raid.groups[0]!.threat!;
    expect(th).toBeCloseTo(RAID.riftThreat, 6); // earlyThreatMult(26) = 1
    expect(b2.overflow?.faction).toBe('betes');
  });

  it('un marquage ANCIEN ne remplace pas un plus récent déjà posé', () => {
    const b = markOverflow(emptyBase(1, T0), [ov({ at: T0 + 9 * H })]);
    const b2 = markOverflow(b, [ov({ at: T0 + H })]);
    expect(b2.overflow?.at).toBe(T0 + 9 * H);
    expect(b2).toBe(b); // rien n’a changé → même référence, l’appelant n’écrit pas à vide
  });

  it('rien à marquer → MÊME référence (pas d’écriture à vide)', () => {
    const b = emptyBase(1, T0);
    expect(markOverflow(b, [])).toBe(b);
  });
});

describe('⚔️ l’armée d’une faille', () => {
  it('prend la FACTION de la faille, quelle que soit celle qu’un tirage aurait donnée', () => {
    let impose = 0;
    for (let s = 1; s < 40; s++) {
      const ordinaire = rollRaid(s * 31 + 7, 26, T0, 0);
      const depuis = rollRaid(s * 31 + 7, 26, T0, 0, ov({ faction: 'mortsvivants' }));
      expect(depuis.faction).toBe('mortsvivants');
      if (ordinaire.faction !== 'mortsvivants') impose++;
    }
    // La faction est réellement IMPOSÉE, pas un hasard qui tomberait juste.
    expect(impose).toBeGreaterThan(20);
  });

  it('applique le renfort ×1,3 à CHAQUE groupe, champion compris', () => {
    const raid = rollRaid(4242, 40, T0, 0, ov());
    const nu = rollRaid(4242, 40, T0, 0);
    for (const g of raid.groups) expect(g.threat).toBeCloseTo(RAID.riftThreat, 6);
    for (const g of nu.groups) expect(g.threat).toBeCloseTo(1, 6);
    expect(raid.groups.at(-1)!.champion).toBe(true);
  });

  it('le renfort SE SENT dans le combattant : PV et dégâts montent ensemble', () => {
    const raid = rollRaid(99, 40, T0, 0, ov());
    const nu = rollRaid(99, 40, T0, 0);
    const a = groupCombatant(raid.groups[0]!);
    const b = groupCombatant(nu.groups[0]!);
    expect(a.pv / b.pv).toBeCloseTo(RAID.riftThreat, 1);
    expect(a.damage / b.damage).toBeCloseTo(RAID.riftThreat, 1);
  });

  it('se COMPOSE avec le renfort de début de partie, jamais ne le remplace', () => {
    // Au niveau 12, `earlyThreatMult` vaut déjà 1,35 : une armée de faille doit valoir le
    // PRODUIT des deux, sinon le renfort de faille annulerait l’apprentissage.
    const nu = rollRaid(7, 12, T0, 0).groups[0]!.threat!;
    const faille = rollRaid(7, 12, T0, 0, ov()).groups[0]!.threat!;
    expect(nu).toBeGreaterThan(1);
    expect(faille).toBeCloseTo(nu * RAID.riftThreat, 6);
  });

  it('⚠️ NE PREND PAS LE NIVEAU DE LA FAILLE — le garde-fou anti-exploit', () => {
    // Mesuré : une armée calibrée sur le niveau de la faille donne 100 % de tenue pour un
    // joueur de niveau 60 face à une faille Bronze (contre 88 % ordinaire), renfort ×1,3
    // compris. Laisser déborder deviendrait STRICTEMENT meilleur que fermer.
    // ⚠️ On impose LA MÊME faction que le tirage ordinaire : sans ça l'effectif change de
    // toute façon (la silhouette de faction, cf. le test suivant) et on ne saurait pas si
    // c'est le niveau ou la faction qu'on observe.
    for (const L of [28, 60]) {
      for (let s = 1; s < 25; s++) {
        const ordinaire = rollRaid(s * 991 + 5, L, T0, 0);
        const bronze = rollRaid(
          s * 991 + 5,
          L,
          T0,
          0,
          ov({ level: 5, faction: ordinaire.faction }),
        );
        expect(bronze.groups.map((g) => [g.level, g.count])).toEqual(
          ordinaire.groups.map((g) => [g.level, g.count]),
        );
        expect(bronze.level).toBe(ordinaire.level);
        // Tous les niveaux restent dans la ligue du JOUEUR, jamais celle de la faille.
        for (const g of bronze.groups) expect(g.level).toBeGreaterThanOrEqual(L);
      }
    }
  });

  it('LE FLUX ALÉATOIRE EST INCHANGÉ : niveaux et nombre de groupes ne bougent pas', () => {
    // ⚠️ `pick` est consommé MÊME quand la faction est imposée. Sans ça, toutes les armées
    // seedées du jeu (et tous les tests qui les épinglent) changeraient de composition.
    // ⚠️ L'EFFECTIF, lui, SUIT LA FACTION — et c'est voulu : `raidSize` lit `countMult`,
    // donc une horde de bêtes est plus nombreuse et chacune plus faible (iso-menace,
    // `countMult × unitMult ≈ 1`). Imposer la faction change la FORME, pas la menace.
    for (let s = 1; s < 30; s++) {
      const a = rollRaid(s * 7919 + 3, 35, T0, 0);
      const b = rollRaid(s * 7919 + 3, 35, T0, 0, ov());
      expect(b.groups.map((g) => g.level)).toEqual(a.groups.map((g) => g.level));
      expect(b.groups.length).toBe(a.groups.length);
      // À faction IMPOSÉE ÉGALE à celle du tirage, l'effectif est identique lui aussi.
      const c = rollRaid(s * 7919 + 3, 35, T0, 0, ov({ faction: a.faction }));
      expect(c.groups.map((g) => g.count)).toEqual(a.groups.map((g) => g.count));
    }
  });

  it('une armée ordinaire ne porte AUCUNE trace de faille', () => {
    expect(rollRaid(1, 26, T0, 0).overflow).toBeUndefined();
    expect(rollRaid(1, 26, T0, 0, ov()).overflow).toEqual(ov());
  });
});

describe('🕳️ le marquage est CONSOMMÉ au tirage', () => {
  const ctx = { playerLevel: 26, activeDays7: 7, globalXp: 0 };

  it('l’armée détectée vient de la faille, et le marquage s’efface', () => {
    const b = markOverflow(readyBase(), [ov({ faction: 'betes' })]);
    expect(raidsEnabled(b, ctx.activeDays7, ctx.playerLevel)).toBe(true);
    const t = advanceBase(b, ctx, T0 + H);
    expect(t.detected).not.toBeNull();
    expect(t.detected!.faction).toBe('betes');
    expect(t.detected!.groups[0]!.threat).toBeCloseTo(RAID.riftThreat, 6);
    // ⚠️ Effacé : sans ça, TOUS les sièges suivants seraient renforcés à vie.
    expect(t.base.overflow).toBeNull();
  });

  it('le siège SUIVANT redevient ordinaire si aucune faille n’a débordé entre-temps', () => {
    const b = markOverflow(readyBase(), [ov()]);
    const t1 = advanceBase(b, ctx, T0 + H);
    const apres: BaseState = { ...t1.base, raid: null, nextRaidAt: T0 + 2 * H };
    const t2 = advanceBase(apres, ctx, T0 + 2 * H);
    expect(t2.detected).not.toBeNull();
    expect(t2.detected!.groups[0]!.threat).toBeCloseTo(1, 6);
  });

  it('SIÈGES ÉTEINTS → le marquage s’efface aussi (il ne s’accumule pas)', () => {
    // Enceinte pas prête : aucune armée ne vient, celle qui est sortie s’est dispersée.
    // ⚠️ Sans ça, bâtir sa PREMIÈRE enceinte vaudrait un siège renforcé d’entrée.
    const nue: BaseState = { ...emptyBase(7, T0), nextRaidAt: T0 - H };
    const b = markOverflow(nue, [ov()]);
    expect(raidsEnabled(b, 7, 26)).toBe(false);
    const t = advanceBase(b, ctx, T0);
    expect(t.base.overflow).toBeNull();
    expect(t.changed).toBe(true);
  });

  it('un débordement pendant qu’une armée marche reste EN ATTENTE pour la suivante', () => {
    const t1 = advanceBase(readyBase(), ctx, T0 + H);
    expect(t1.base.raid).not.toBeNull();
    const b = markOverflow(t1.base, [ov()]);
    // L’armée en marche garde la force annoncée (aucun renfort rétroactif)…
    expect(b.raid!.groups[0]!.threat).toBeCloseTo(1, 6);
    // …et le marquage attend la prochaine.
    expect(b.overflow).not.toBeNull();
  });
});

describe('🗺️ la carte DÉSIGNE les débordements', () => {
  it('ne rend que les failles dont l’heure est passée', () => {
    let map = createMap(4242, T0, 26, OUT);
    expect(riftOverflows(map, T0).length).toBe(0);
    const jeune = map.pois.filter(isRiftPoi);
    expect(jeune.length).toBeGreaterThan(0);
    const at = Math.min(...jeune.map((p) => p.spawnedAt)) + EXPE.lifespanMs.rift;
    map = { ...map, nextSpawnAt: at + 1, nextRiftAt: at + 1 };
    const over = riftOverflows(map, at);
    expect(over.length).toBeGreaterThan(0);
    for (const p of over) expect(p.spawnedAt + EXPE.lifespanMs.rift).toBeLessThanOrEqual(at);
  });

  it('ne désigne QUE des failles — un POI ordinaire périmé n’en est pas une', () => {
    // ⚠️ Trou trouvé par une mutation SURVIVANTE : sans le filtre de type, tout POI plus
    // vieux que la maturation d'une faille serait « débordé » et `advanceWorld` en ferait
    // une mine de mana. Les autres POI vivent 10 à 48 h, donc le cas se produit dès
    // qu'une absence dépasse 7 jours — et il transformerait un puits en mine.
    const map = createMap(31337, T0, 26, OUT);
    const vieux = { ...map.pois.find((p) => !isRiftPoi(p))!, spawnedAt: T0 - 30 * 24 * H };
    const truque = { ...map, pois: [...map.pois.filter(isRiftPoi), vieux] };
    for (const p of riftOverflows(truque, T0)) expect(isRiftPoi(p)).toBe(true);
    expect(riftOverflows(truque, T0).some((p) => p.id === vieux.id)).toBe(false);
    // Et la carte avancée ne fabrique aucune mine à partir de lui.
    const apres = advanceWorld(truque, T0, 26, OUT);
    expect(apres.pois.some((p) => p.id === `${vieux.id}_mine`)).toBe(false);
  });

  it('UN SEUL PRÉDICAT : chaque faille désignée devient sa mine, aucune ne survit', () => {
    let map = createMap(99, T0, 26, OUT);
    const at = T0 + EXPE.lifespanMs.rift + H;
    const over = riftOverflows(map, at);
    expect(over.length).toBeGreaterThan(0);
    const ids = new Set(over.map((p) => p.id));
    map = advanceWorld(map, at, 26, OUT);
    // Ni doublon (la faille ET sa mine), ni faille fantôme.
    for (const id of ids) expect(map.pois.some((p) => p.id === id)).toBe(false);
    expect(riftOverflows(map, at).length).toBe(0);
  });

  it('se lit AVANT `advanceWorld` — après, il n’y a plus rien à voir', () => {
    const map = createMap(1717, T0, 26, OUT);
    const at = T0 + EXPE.lifespanMs.rift + H;
    expect(riftOverflows(map, at).length).toBeGreaterThan(0);
    expect(riftOverflows(advanceWorld(map, at, 26, OUT), at).length).toBe(0);
  });
});
