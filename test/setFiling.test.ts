// 🧩 RANGEMENT DES PIÈCES DE SET (v0.839) — une règle, un barème, jamais rien à la forge.
import { describe, it, expect } from 'vitest';
import {
  fileSetPieces,
  ownedInLoadouts,
  promoteSpare,
  takeSetPiece,
  sparesLot,
  setPieceScorer,
  voieSetIndex,
  normalizeLoadouts,
  compareSetPiece,
  setPieceRival,
} from '@/lib/setFiling';
import {
  MAX_LOADOUTS,
  VOIE_SETS,
  rollSetPiece,
  playerWithGear,
  mergeEffects,
  type Item,
  type ItemSlot,
} from '@/lib/items';
import { VOIES } from '@/lib/voies';
import { mulberry32, combatPowerRaw } from '@/lib/combat';
import { computeCharacter } from '@/lib/character';
import { cumXpForLevel } from '@/lib/proceduralContent';

const mk = (slot: ItemSlot, value: number, voie = 'berserker', extra: Partial<Item> = {}): Item =>
  ({
    id: `${voie}-${slot}-${value}`,
    slot,
    name: `${slot} ${value}`,
    emoji: '🗡️',
    rarity: 'rare',
    level: 10,
    baseLevel: 10,
    effect: { type: 'damage_pct', value },
    setId: `voie:${voie}`,
    ...extra,
  }) as Item;
// Barème de test lisible : la valeur du 1er affixe.
const byValue = (it: Item) => it.effect.value;

describe('🧩 la voie d’une pièce', () => {
  it('le set i est la voie i — l’ordre des sets suit celui des voies', () => {
    VOIES.forEach((v, i) => expect(VOIE_SETS[i]!.id).toBe(`voie:${v.id}`));
    expect(voieSetIndex(mk('weapon', 1, 'gardien'))).toBe(1);
  });
  it('une pièce hors set, ou d’un ancien set de boss, n’a pas de voie', () => {
    expect(voieSetIndex({ ...mk('weapon', 1), setId: undefined })).toBe(-1);
    expect(voieSetIndex({ ...mk('weapon', 1), setId: 'dragon' })).toBe(-1);
  });
});

describe('🧩 ranger une pièce', () => {
  it('emplacement libre → elle l’occupe', () => {
    const r = fileSetPieces([], [mk('weapon', 10)], byValue);
    expect(r.loadouts[0]!.items.weapon?.id).toBe('berserker-weapon-10');
    expect(r.filed.map((f) => f.outcome)).toEqual(['added']);
    expect(r.loadouts).toHaveLength(MAX_LOADOUTS);
  });
  it('meilleure que la pièce en place → elle la remplace, l’ancienne passe en DOUBLON', () => {
    const start = fileSetPieces([], [mk('weapon', 10)], byValue).loadouts;
    const r = fileSetPieces(start, [mk('weapon', 20)], byValue);
    expect(r.loadouts[0]!.items.weapon?.effect.value).toBe(20);
    expect(r.loadouts[0]!.spares!.map((s) => s.effect.value)).toEqual([10]);
    expect(r.filed[0]!.outcome).toBe('upgraded');
    expect(r.filed[0]!.displaced?.effect.value).toBe(10);
  });
  it('moins bonne → elle devient DOUBLON, la pièce en place ne bouge pas', () => {
    const start = fileSetPieces([], [mk('weapon', 20)], byValue).loadouts;
    const r = fileSetPieces(start, [mk('weapon', 10)], byValue);
    expect(r.loadouts[0]!.items.weapon?.effect.value).toBe(20);
    expect(r.loadouts[0]!.spares!.map((s) => s.effect.value)).toEqual([10]);
    expect(r.filed[0]!.outcome).toBe('spare');
  });
  it('à égalité la pièce en place reste : un rangement ne fait pas tourner deux équivalentes', () => {
    const start = fileSetPieces([], [mk('weapon', 10)], byValue).loadouts;
    const twin = { ...mk('weapon', 10), id: 'jumelle' };
    const r = fileSetPieces(start, [twin], byValue);
    expect(r.loadouts[0]!.items.weapon?.id).toBe('berserker-weapon-10');
    expect(r.loadouts[0]!.spares!.map((s) => s.id)).toEqual(['jumelle']);
  });
  it('⚠️ JAMAIS DESTRUCTEUR : tout ce qui entre ressort (set, doublon ou reste), rien de plus', () => {
    const rng = mulberry32(7);
    const slots: ItemSlot[] = ['weapon', 'armor', 'accessory', 'relic'];
    const pieces: Item[] = Array.from({ length: 60 }, (_, k) => {
      const voie = VOIES[Math.floor(rng() * VOIES.length)]!.id;
      const it = mk(slots[Math.floor(rng() * 4)]!, Math.round(rng() * 50), voie, { id: `p${k}` });
      return k % 7 === 0 ? { ...it, setId: undefined } : it; // quelques objets hors set
    });
    const r = fileSetPieces([], pieces, byValue);
    const out = [...ownedInLoadouts(r.loadouts), ...r.rest].map((i) => i.id).sort();
    expect(out).toEqual(pieces.map((i) => i.id).sort());
    // Les objets hors set ressortent intacts, et eux seuls.
    expect(r.rest.every((i) => voieSetIndex(i) < 0)).toBe(true);
    // À chaque emplacement de chaque set, la pièce en place est la meilleure possédée.
    r.loadouts.forEach((lo) => {
      for (const s of slots) {
        const held = lo.items[s];
        const rivals = (lo.spares ?? []).filter((x) => x.slot === s);
        if (rivals.length) expect(held).toBeDefined();
        for (const x of rivals) expect(byValue(held!)).toBeGreaterThanOrEqual(byValue(x));
      }
    });
  });
  it('ne mute pas les réserves reçues', () => {
    const start = fileSetPieces([], [mk('weapon', 10)], byValue).loadouts;
    const snapshot = JSON.stringify(start);
    fileSetPieces(start, [mk('weapon', 20)], byValue);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('🗂️ les doublons', () => {
  const withSpare = () =>
    fileSetPieces([], [mk('weapon', 20), mk('weapon', 10), mk('armor', 5)], byValue).loadouts;
  it('les doublons comptent comme possédés (l’optimiseur doit les voir)', () => {
    expect(
      ownedInLoadouts(withSpare())
        .map((i) => i.effect.value)
        .sort(),
    ).toEqual([10, 20, 5]);
  });
  it('utiliser un doublon l’échange avec la pièce en place', () => {
    const lo = promoteSpare(withSpare(), 0, 'berserker-weapon-10')!;
    expect(lo[0]!.items.weapon?.effect.value).toBe(10);
    expect(lo[0]!.spares!.map((s) => s.effect.value)).toEqual([20]);
    expect(lo[0]!.items.armor?.effect.value).toBe(5); // le reste du set ne bouge pas
  });
  it('un doublon inconnu ne change rien', () => {
    expect(promoteSpare(withSpare(), 0, 'nope')).toBeNull();
    expect(promoteSpare(withSpare(), 3, 'berserker-weapon-10')).toBeNull(); // autre set
  });
  it('vendre les doublons ne touche ni aux sets, ni aux 🔒', () => {
    const lo = normalizeLoadouts(withSpare());
    lo[0]!.spares!.push({ ...mk('relic', 3), id: 'verrou', locked: true });
    lo[2]!.spares = [mk('armor', 1, 'assassin')];
    const all = sparesLot(lo);
    expect(all.sold.map((i) => i.id).sort()).toEqual(['assassin-armor-1', 'berserker-weapon-10']);
    expect(all.keep.map((i) => i.id)).toEqual(['verrou']);
    // Un seul set.
    expect(sparesLot(lo, 2).sold.map((i) => i.id)).toEqual(['assassin-armor-1']);
    // Les pièces EN PLACE ne sont jamais dans le lot.
    expect(all.sold.some((i) => i.effect.value === 20)).toBe(false);
  });
});

describe('🪙 vendre UNE pièce de set', () => {
  const lots = () => {
    const lo = fileSetPieces(
      [],
      [mk('weapon', 20), mk('weapon', 10), mk('weapon', 15), mk('armor', 5)],
      byValue,
    ).loadouts;
    return lo;
  };
  it('un doublon : lui seul part, le set et les autres doublons restent', () => {
    const r = takeSetPiece(lots(), 'berserker-weapon-10', byValue)!;
    expect(r.taken.id).toBe('berserker-weapon-10');
    expect(r.loadouts[0]!.items.weapon?.effect.value).toBe(20);
    expect(r.loadouts[0]!.items.armor?.effect.value).toBe(5);
    expect(r.loadouts[0]!.spares!.map((s) => s.effect.value)).toEqual([15]);
  });
  it('la pièce EN PLACE : le MEILLEUR doublon de l’emplacement la remplace', () => {
    const r = takeSetPiece(lots(), 'berserker-weapon-20', byValue)!;
    expect(r.taken.effect.value).toBe(20);
    expect(r.loadouts[0]!.items.weapon?.effect.value).toBe(15);
    expect(r.loadouts[0]!.spares!.map((s) => s.effect.value)).toEqual([10]);
    // Aucune autre pièce ne disparaît.
    expect(ownedInLoadouts(r.loadouts)).toHaveLength(3);
  });
  it('la pièce en place sans doublon laisse l’emplacement vide', () => {
    const r = takeSetPiece(lots(), 'berserker-armor-5', byValue)!;
    expect(r.loadouts[0]!.items.armor).toBeUndefined();
    expect(r.loadouts[0]!.spares!.map((s) => s.slot)).toEqual(['weapon', 'weapon']);
  });
  it('🔒 ou pièce absente des réserves (portée) → rien', () => {
    const lo = normalizeLoadouts(lots());
    lo[0]!.spares = lo[0]!.spares!.map((s) => ({ ...s, locked: true }));
    lo[0]!.items.armor = { ...lo[0]!.items.armor!, locked: true };
    expect(takeSetPiece(lo, 'berserker-weapon-10', byValue)).toBeNull();
    expect(takeSetPiece(lo, 'berserker-armor-5', byValue)).toBeNull();
    expect(takeSetPiece(lots(), 'porte-ailleurs', byValue)).toBeNull();
  });
  it('ne mute pas les réserves reçues', () => {
    const lo = lots();
    takeSetPiece(lo, 'berserker-weapon-20', byValue);
    expect(lo[0]!.items.weapon?.effect.value).toBe(20);
    expect(lo[0]!.spares).toHaveLength(2);
  });
});

describe('⚖️ le barème : ce qu’une pièce vaut POUR SON SET', () => {
  const L = 40;
  const s = cumXpForLevel(L) / 3;
  const stats = computeCharacter(s, s, s, 0);
  const ctx = { name: 'h', stats, level: L, fx: {}, equipped: {}, loadouts: [] };
  const piece = (voie: string, seed: number, luck = 0.5) => ({
    ...rollSetPiece(mulberry32(seed), {
      setId: `voie:${voie}`,
      level: L,
      luck,
      preferSlot: 'weapon',
      playerLevel: L,
    }),
    id: `w${seed}`,
  });

  it('suit la puissance : la pièce la plus forte en combat l’emporte', () => {
    const score = setPieceScorer(ctx);
    const a = piece('berserker', 1, 0);
    const b = { ...a, id: 'forte', effect: { ...a.effect, value: a.effect.value * 3 } };
    expect(score(b)).toBeGreaterThan(score(a));
  });
  // ⚠️ RÉÉCRIT (2026-09-22) : la voie ne change plus aucun calcul (elle se déduit du set
  // porté) — le barème est la puissance brute de la pièce, avec les autres pièces du set.
  it('⚠️ jugée avec les autres pièces rangées de son set', () => {
    const p = piece('berserker', 3);
    const plain = combatPowerRaw(playerWithGear('h', stats, { weapon: p }, {}, L));
    expect(setPieceScorer(ctx)(p)).toBeCloseTo(plain, 9);
    const fourPieces = ['weapon', 'armor', 'accessory', 'relic'].map((slot, k) => ({
      ...rollSetPiece(mulberry32(50 + k), {
        setId: 'voie:berserker',
        level: L,
        luck: 0.5,
        preferSlot: slot as ItemSlot,
        playerLevel: L,
      }),
      id: `s${k}`,
    }));
    const stored = normalizeLoadouts([]);
    for (const it of fourPieces.slice(1)) stored[0]!.items[it.slot] = it;
    // Le set rangé complète l'équipement : avec les 3 autres pièces, la 4ᵉ active le
    // capstone et la signature de la voie — son score doit le refléter.
    const alone = setPieceScorer(ctx)(fourPieces[0]!);
    const inSet = setPieceScorer({ ...ctx, loadouts: stored })(fourPieces[0]!);
    expect(inSet).toBeGreaterThan(alone);
  });
  it('symétrique : deux candidates au même emplacement voient le même reste d’équipement', () => {
    const stored = normalizeLoadouts([]);
    const a = piece('gardien', 11);
    const b = piece('gardien', 12);
    stored[1]!.items.weapon = a; // A est en place : elle ne doit pas se compter deux fois
    const score = setPieceScorer({ ...ctx, loadouts: stored });
    const bare = setPieceScorer(ctx);
    expect(score(a) - score(b)).toBeCloseTo(bare(a) - bare(b), 6);
  });
  it('une pièce hors set vaut 0 (elle ne se range pas)', () => {
    expect(setPieceScorer(ctx)({ ...mk('weapon', 5), setId: undefined })).toBe(0);
  });
});

describe('🧩 une pièce de set se compare à SA pièce du set, pas au build porté', () => {
  it('emplacement libre → rien à comparer', () => {
    expect(compareSetPiece(mk('weapon', 10), undefined, byValue)).toEqual({ verdict: 'free' });
    // Déjà rangée dans l'emplacement : elle ne se compare pas à elle-même.
    const p = mk('weapon', 10);
    expect(compareSetPiece(p, p, byValue).verdict).toBe('free');
  });
  it('meilleure / moins bonne / égale — et la puissance du SET avant → après', () => {
    const c = compareSetPiece(mk('weapon', 20), mk('weapon', 10), byValue);
    expect(c).toMatchObject({ verdict: 'better', before: 10, after: 20 });
    expect(compareSetPiece(mk('weapon', 5), mk('weapon', 10), byValue).verdict).toBe('worse');
    const twin = { ...mk('weapon', 10), id: 'jumelle' };
    expect(compareSetPiece(twin, mk('weapon', 10), byValue).verdict).toBe('equal');
  });
  it('le verdict dit ce que le rangement va faire (même barème, même égalité)', () => {
    for (const [held, neu] of [
      [10, 20],
      [20, 10],
      [10, 10],
    ] as const) {
      const start = fileSetPieces([], [mk('weapon', held)], byValue).loadouts;
      const piece = { ...mk('weapon', neu), id: 'neuve' };
      const v = compareSetPiece(piece, setPieceRival(piece, start), byValue).verdict;
      const r = fileSetPieces(start, [piece], byValue);
      expect(v === 'better').toBe(r.filed[0]!.outcome === 'upgraded');
    }
  });
  it('après rangement : la rivale est la pièce DÉLOGÉE (vendue depuis), ou celle qui a gardé sa place', () => {
    const start = fileSetPieces([], [mk('weapon', 10)], byValue).loadouts;
    const up = fileSetPieces(start, [mk('weapon', 20)], byValue);
    expect(setPieceRival(mk('weapon', 20), up.loadouts, up.filed[0])?.effect.value).toBe(10);
    const down = fileSetPieces(start, [mk('weapon', 5)], byValue);
    expect(setPieceRival(mk('weapon', 5), down.loadouts, down.filed[0])?.effect.value).toBe(10);
    const add = fileSetPieces([], [mk('weapon', 5)], byValue);
    expect(setPieceRival(mk('weapon', 5), add.loadouts, add.filed[0])).toBeUndefined();
    // Hors set de voie : aucune rivale.
    expect(setPieceRival({ ...mk('weapon', 5), setId: undefined }, start)).toBeUndefined();
  });
});
