import { describe, it, expect } from 'vitest';
import { CHAMPIONS, CHAMPION_BY_ID, championsOf, type Champion } from '@/data/champions';
import { RANK_ORDER, RARITY_RANK, prestigeRankIndex } from '@/lib/items';
import {
  AWAKEN,
  advAwaken,
  advChampion,
  advRank,
  advRarity,
  advRoles,
  advSignatureLevels,
  advSignatures,
  advAvatar,
  advStats,
  advTitle,
  canPromote,
  championRarity,
  championSkillLevel,
  championStats,
  nextStratum,
  type Adventurer,
} from '@/lib/adventurers';
import { refAdventurer } from '@/lib/caravan';
import { canWearAdvGear, lineageOf } from '@/lib/advGear';

/** Un aventurier qui EST ce champion, à ce niveau, avec ce nombre d'exemplaires. */
function asAdv(c: Champion, level: number, copies = 1): Adventurer {
  return { id: 'a', name: c.name, seed: 1, path: [], level, xp: 0, championId: c.id, copies };
}

const primordial = championsOf('primordial')[0]!;
const commun = championsOf('commun')[0]!;

describe('⚠️ NON-RÉGRESSION : un aventurier SANS champion ne bouge pas d’un iota', () => {
  it('les accesseurs lisent toujours son chemin de classes', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      const a = refAdventurer(L);
      expect(advChampion(a)).toBeUndefined();
      expect(a.path.length).toBeGreaterThan(0);
      // Ses stats viennent bien du CUMUL du chemin, pas d'un budget de rareté.
      expect(advStats(a).puissance).toBeGreaterThan(0);
      expect(advRarity(a)).toBe(RANK_ORDER[Math.min(RANK_ORDER.length - 1, a.path.length - 1)]);
      expect(nextStratum(a)).toBe(a.path.length);
      expect(lineageOf(a)).toBe(a.path[0]);
    }
  });

  it('⚠️ UN `championId` INCONNU RETOMBE SUR LE CHEMIN — jamais un combat qui tombe', () => {
    // Un champion retiré du roster laisserait sinon un aventurier fantôme au milieu d'une
    // escorte. Même règle que les familiers et les talents appariés (v0.758).
    const a = { ...refAdventurer(30), championId: 'champion_qui_nexiste_pas' };
    expect(advChampion(a)).toBeUndefined();
    expect(advStats(a)).toEqual(advStats(refAdventurer(30)));
    expect(lineageOf(a)).toBe(a.path[0]);
  });
});

describe('🏅 un champion à la place d’un aventurier', () => {
  it('ses STATS sont celles du champion, pas un cumul de classes', () => {
    for (const L of [1, 20, 60, 100]) {
      for (const c of [commun, primordial]) {
        expect(advStats(asAdv(c, L))).toEqual(championStats(c, L, 1));
      }
    }
  });

  it('⚠️ SA RARETÉ EST L’EFFECTIVE, PAS CELLE QU’ON A TIRÉE', () => {
    // Au niveau 1, un primordial fraîchement tiré ne mène que du Bronze : ses stats valent
    // déjà du commun (`championBudget`), son équipement doit suivre — sinon le gacha
    // court-circuite « le sport est le plafond » sur l'axe équipement.
    expect(advRarity(asAdv(primordial, 1))).toBe(RANK_ORDER[0]);
    expect(advRarity(asAdv(primordial, 100))).toBe('primordial');
    // …et le plafond COUPE, il ne pousse jamais : un commun reste commun à tout niveau.
    for (const L of [1, 50, 100]) expect(advRarity(asAdv(commun, L))).toBe('commun');
  });

  it('`championRarity` est la MÊME règle que le plafond du budget', () => {
    for (const r of RANK_ORDER)
      for (const L of [1, 15, 45, 100])
        expect(RARITY_RANK[championRarity(r, L)]).toBe(
          Math.min(RARITY_RANK[r], prestigeRankIndex(L)),
        );
  });

  it('⚠️ LE RANG AFFICHÉ SUIT LA RARETÉ EFFECTIVE — il ne promet rien qu’il ne peut mener', () => {
    expect(advRank(asAdv(primordial, 1)).rankIndex).toBe(0);
    expect(advRank(asAdv(primordial, 100)).rankIndex).toBe(RARITY_RANK.primordial);
  });

  it('✨ SES SIGNATURES PORTENT LEUR NIVEAU D’ÉVEIL — sans système neuf', () => {
    const c = CHAMPION_BY_ID.get('miren')!; // crit au cran 2, execute au cran 5
    const niveauDe = (copies: number, s: string) =>
      advSignatureLevels(asAdv(c, 60, copies)).find((x) => x.what === s)?.level ?? 0;
    expect(niveauDe(1, 'crit_pct')).toBe(1);
    expect(niveauDe(3, 'crit_pct')).toBe(2); // 3 copies = Éveil 2
    expect(niveauDe(3, 'execute_pct')).toBe(1);
    expect(niveauDe(6, 'execute_pct')).toBe(2); // 6 copies = Éveil 5
    // …et le comptage d'occurrences reste la SEULE mécanique : le niveau se lit sur la liste.
    for (const copies of [1, 4, 7]) {
      const a = asAdv(c, 60, copies);
      for (const s of c.skills)
        expect(advSignatures(a).filter((x) => x === s)).toHaveLength(
          championSkillLevel(c, s, advAwaken(a)),
        );
    }
  });

  it('porte 0 ou 1 RÔLE de convoi — jamais une pile de rôles cumulés', () => {
    for (const r of RANK_ORDER)
      for (const c of championsOf(r)) {
        const roles = advRoles(asAdv(c, 60));
        expect(roles.length, c.name).toBeLessThanOrEqual(1);
        if (c.role) expect(roles).toEqual([c.role]);
      }
  });

  it('⚠️ NE SE PROMEUT JAMAIS : ses doublons le réveillent, ils ne le changent pas de classe', () => {
    for (const L of [1, 50, 100])
      for (const g of [1, 50, 100]) expect(canPromote(asAdv(primordial, L), g)).toBe(false);
  });

  it('sa LIGNÉE est écrite, et elle décide de ce qu’il porte', () => {
    for (const r of RANK_ORDER)
      for (const c of championsOf(r)) expect(lineageOf(asAdv(c, 60))).toBe(c.lineage);
    // Une pièce de sa lignée et de sa rareté effective lui va ; une autre lignée, non.
    const a = asAdv(primordial, 100);
    const piece = {
      id: 'g',
      slot: 'weapon' as const,
      lineage: primordial.lineage,
      rarity: 'commun' as const,
      roll: 0.5,
      level: 1,
      effect: { type: 'damage_pct' as const, value: 1 },
    };
    expect(canWearAdvGear(a, piece)).toBe(true);
    const autre = RANK_ORDER.length && {
      ...piece,
      lineage: primordial.lineage === 'mage' ? ('archer' as const) : ('mage' as const),
    };
    expect(canWearAdvGear(a, autre)).toBe(false);
  });

  it('⚠️ AU NIVEAU 1, SA RARETÉ EFFECTIVE LUI INTERDIT L’ÉQUIPEMENT DE HAUT RANG', () => {
    const a = asAdv(primordial, 1);
    const piece = {
      id: 'g',
      slot: 'weapon' as const,
      lineage: primordial.lineage,
      rarity: 'primordial' as const,
      roll: 0.5,
      level: 1,
      effect: { type: 'damage_pct' as const, value: 1 },
    };
    expect(canWearAdvGear(a, piece)).toBe(false);
  });

  it('✨ l’Éveil se lit sur le compte d’exemplaires, plafonné', () => {
    expect(advAwaken(asAdv(commun, 60, 1))).toBe(0);
    expect(advAwaken(asAdv(commun, 60, 4))).toBe(3);
    expect(advAwaken(asAdv(commun, 60, 99))).toBe(AWAKEN.max);
    // Un compte absent vaut UNE copie — le champion lui-même.
    expect(advAwaken({ ...asAdv(commun, 60), copies: undefined })).toBe(0);
  });
});

describe('⚠️ LES DEUX TROUS QUE LA MUTATION A RÉVÉLÉS', () => {
  it('✨ L’ÉVEIL EST TRANSMIS AUX STATS — mes premiers tests ne tiraient qu’une copie', () => {
    // Tous les cas d'`advStats` ci-dessus passaient `copies = 1`, donc « l'Éveil n'est pas
    // transmis » survivait : un champion éveillé aurait eu les stats d'un champion nu.
    for (const copies of [2, 4, AWAKEN.max + 1]) {
      const a = asAdv(primordial, 60, copies);
      expect(advStats(a)).toEqual(championStats(primordial, 60, copies));
      const nu = advStats(asAdv(primordial, 60, 1));
      expect(advStats(a).puissance).toBeGreaterThan(nu.puissance);
    }
  });

  it('⚠️ LA BRANCHE « SANS RÔLE » EST INATTEIGNABLE AUJOURD’HUI — deux règles se contredisent', () => {
    // `Champion.role` est typé `AdvRole | null` et la v0.939 écrit que « `null` est un
    // choix, pas un oubli ». Mais la GRILLE l'interdit : `champions.test.ts` exige 4 rôles
    // DISTINCTS sur les 4 champions de chaque rareté, donc aucun `null` n'est possible.
    // ⚠️ C'est pour ça que la mutation « il en porte un quand même » survivait — et c'est
    // pour ça que mon premier test était CREUX : il fabriquait un champion hors registre,
    // donc `advChampion` rendait `undefined` et l'on mesurait le repli sur le chemin, pas
    // la branche. On épingle donc ce qui est VRAI et vérifiable : tout champion du roster
    // porte exactement un rôle. La branche `null` reste une porte ouverte pour un roster
    // élargi (la règle d'extension ajoute en HAUT, où une rareté peut dépasser 4 places).
    for (const r of RANK_ORDER)
      for (const c of championsOf(r)) {
        expect(c.role, c.name).not.toBeNull();
        expect(advRoles(asAdv(c, 60)), c.name).toEqual([c.role]);
      }
  });
});

describe('🏅 le VISAGE d’un champion (le 8ᵉ accesseur)', () => {
  it('⚠️ CHAQUE CHAMPION A SON EMOJI, ET ILS SONT TOUS DISTINCTS', () => {
    // C'est le visage qui identifie un champion dans une grille de 32 — deux identiques
    // et la collection devient illisible. Un gacha sans visage n'en est pas un.
    const emos = CHAMPIONS.map((c) => c.emoji);
    for (const [i, e] of emos.entries()) expect(e.length, CHAMPIONS[i]!.name).toBeGreaterThan(0);
    expect(new Set(emos).size).toBe(CHAMPIONS.length);
  });

  it('`advTitle` rend le champion lui-même : son emoji et son NOM', () => {
    for (const c of [commun, primordial]) {
      const t = advTitle(asAdv(c, 60))!;
      expect(t.emoji).toBe(c.emoji);
      expect(t.label).toBe(c.name);
    }
    // …et un aventurier garde son métier courant.
    const a = refAdventurer(30);
    const t = advTitle(a)!;
    expect(t.label).not.toBe(a.name);
    expect(t.emoji.length).toBeGreaterThan(0);
  });

  it('⚠️ SON AVATAR EST HABILLÉ DE SA RARETÉ EFFECTIVE, pas de celle qu’on a tirée', () => {
    // Un primordial au niveau 1 ne mène que du Bronze : le portrait ne doit pas promettre
    // ce que le combat refuse.
    const bas = advAvatar(asAdv(primordial, 1));
    for (const r of Object.values(bas.gear)) expect(r).toBe(RANK_ORDER[0]);
    const haut = advAvatar(asAdv(primordial, 100));
    for (const r of Object.values(haut.gear)) expect(r).toBe('primordial');
    // Les QUATRE emplacements sont habillés — un champion n'a pas de chemin à dévoiler.
    expect(Object.keys(haut.gear)).toHaveLength(4);
  });

  it('sa SILHOUETTE suit sa forme réelle, comme celle d’un aventurier', () => {
    const cogneur = CHAMPIONS.find((c) => c.form.p > c.form.e && c.form.p > c.form.a)!;
    expect(advAvatar(asAdv(cogneur, 60)).profile).toBe('puissant');
    const rapide = CHAMPIONS.find((c) => c.form.a > c.form.p && c.form.a > c.form.e)!;
    expect(advAvatar(asAdv(rapide, 60)).profile).toBe('agile');
  });
});
