import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  RANK_ORDER,
  rankCeilingForLevel,
  maxGradeCran,
  enchantMult,
  ENCHANT_MAX,
  jetStar,
  gradeLabel,
} from '@/lib/items';
import {
  talentStar,
  talentRollOf,
  talentsEarned,
  TALENT_SLOT_LEVEL,
  pickBestTalents,
  talentEffects,
  TALENTS,
  talentTier,
  talentTierFloor,
  talentRank,
  talentQuality,
  talentRankOf,
  tierOf,
  talentValue,
  talentByCode,
  normalizeTalents,
  rollTalentDrop,
  type TalentInstance,
} from '@/lib/talents';

describe('talentsEarned', () => {
  it('UN SEUL emplacement, dès le niveau 1 (v0.1078 ; niveau 5 avant, 1 tous les 5 niveaux avant la v0.845)', () => {
    expect(TALENT_SLOT_LEVEL).toBe(1);
    expect(talentsEarned(0)).toBe(0);
    expect(talentsEarned(1)).toBe(1);
    expect(talentsEarned(4)).toBe(1);
    // ⚠️ Le cœur de la décision : il ne grandit plus avec le niveau.
    for (const L of [10, 20, 50, 100]) expect(talentsEarned(L)).toBe(1);
  });
});

describe('pickBestTalents — garder le plus PUISSANT, pas la plus forte magnitude', () => {
  // Vrais codes (normalizeTalents écarte les codes inconnus) ; la PUISSANCE est injectée
  // par l'id : « or » ne vaut rien en combat, « degats » beaucoup, « pv » moyennement.
  const t = (id: string, code: string): TalentInstance => ({ id, code, xp: 0, equipped: true });
  const worth: Record<string, number> = { or: 0, degats: 50, pv: 30 };
  const score = (ids: string[]) =>
    100 + ids.reduce((a, id) => a + (worth[id.split('-')[0]!] ?? 0), 0);

  it('⚠️ LE CAS RÉEL : un compte à plusieurs talents garde celui qui donne le plus de puissance', () => {
    const eq = [t('or-1', 't_crit'), t('pv-1', 't_pv'), t('degats-1', 't_dmg')];
    expect(pickBestTalents(eq, 1, score)).toEqual(['degats-1']);
  });

  it('remplit les emplacements même sans gain : un talent sans puissance reste mieux que rien', () => {
    const eq = [t('or-1', 't_crit'), t('or-2', 't_dodge')];
    expect(pickBestTalents(eq, 1, score)).toHaveLength(1);
  });

  it('un seul exemplaire par code, et rien retiré s’il n’y a pas d’excédent', () => {
    const eq = [t('degats-1', 't_dmg'), t('degats-2', 't_dmg'), t('pv-1', 't_pv')];
    expect(pickBestTalents(eq, 2, score).sort()).toEqual(['degats-1', 'pv-1']);
    expect(pickBestTalents([t('or-1', 't_crit')], 1, score)).toEqual(['or-1']);
  });

  it('aucun emplacement (avant le niveau 5) → aucun talent gardé', () => {
    const eq = [t('degats-1', 't_dmg'), t('pv-1', 't_pv')];
    expect(pickBestTalents(eq, 0, score)).toEqual([]);
  });
});

describe('catalogue élargi', () => {
  it('au moins 11 talents, codes uniques', () => {
    expect(TALENTS.length).toBeGreaterThanOrEqual(11);
    expect(new Set(TALENTS.map((t) => t.code)).size).toBe(TALENTS.length);
  });
});

describe('GRADE (rang + qualité, fixé au drop)', () => {
  it('le tier encodé par l’xp donne le grade', () => {
    expect(talentTier(0)).toBe(0);
    expect(talentTier(talentTierFloor(5))).toBe(5);
    expect(talentTier(talentTierFloor(20))).toBe(20);
    expect(talentTier(1e9)).toBe(39); // plafonné (8 raretés × 5 − 1)
  });
  it('rareté Commun→Primordial dérivée du tier (mêmes raretés que les objets)', () => {
    expect(talentRank(0)).toBe('commun');
    expect(talentRank(4)).toBe('commun');
    expect(talentRank(5)).toBe('inhabituel');
    expect(talentRank(39)).toBe('primordial');
  });
});

describe('magnitude = grade × enchant (uniforme avec les objets)', () => {
  it('talentValue grandit avec le TIER (grade) ET l’ENCHANT', () => {
    const def = talentByCode('t_dmg')!;
    expect(talentValue(def, 10, 0)).toBeGreaterThan(talentValue(def, 0, 0)); // grade ↑
    expect(talentValue(def, 0, 6)).toBeGreaterThan(talentValue(def, 0, 0)); // enchant ↑
  });
  it('enchant partage le mult des objets (enchantMult), à grade égal', () => {
    const def = talentByCode('t_dmg')!;
    expect(talentValue(def, 12, 4) / talentValue(def, 12, 0)).toBeCloseTo(enchantMult(4));
  });
  it('MAX (SSS, jet 100 %, +12) : ×1,8 l’ancien plafond — le talent pèse autant que le familier (v0.848)', () => {
    const def = talentByCode('t_dmg')!;
    // Ancien plafond ≈ ×10,5 la base (échelle 0,5). Mesuré v0.848 : talent et familier
    // n'apportent la même puissance qu'à ×1,8 → échelle 0,9, plafond ≈ ×18,9.
    const ratio = talentValue(def, 49, ENCHANT_MAX, 1) / def.base;
    expect(ratio).toBeGreaterThan(17.5);
    expect(ratio).toBeLessThan(20);
  });
  it('raretés NETTEMENT séparées — Rare > Magique (jet 0 = plancher du rang)', () => {
    const def = talentByCode('t_armor')!; // Cuirasse : base petite → cas du bug
    const tierAt = (rank: string) => RANK_ORDER.indexOf(rank as never) * 5;
    const higher = talentValue(def, tierAt('rare'), 0, 0);
    const lower = talentValue(def, tierAt('magique'), 0, 0);
    expect(higher).toBeGreaterThan(lower);
    expect(higher / lower).toBeGreaterThan(1.05); // écart de rareté net
  });
});

describe('plafond de grade de drop', () => {
  it('maxGradeCran = plafond de drop du niveau (rang √ × qualité 5)', () => {
    expect(maxGradeCran(1)).toBe(rankCeilingForLevel(1) * 5 + 4);
    expect(maxGradeCran(4)).toBe(rankCeilingForLevel(4) * 5 + 4);
    expect(maxGradeCran(25)).toBe(rankCeilingForLevel(25) * 5 + 4);
    expect(maxGradeCran(1)).toBeLessThan(maxGradeCran(100)); // monte avec le niveau
  });
});

describe('normalizeTalents (rétro-compat)', () => {
  it('convertit un ancien string[] en instances équipées (+0)', () => {
    const n = normalizeTalents(['t_dmg', 't_pv']);
    expect(n).toHaveLength(2);
    expect(n[0]!.equipped).toBe(true);
    expect(n[0]!.enchant).toBe(0);
  });
  it('préserve le niveau d’objet (ilvl) ; enchant reste 0 (vestige)', () => {
    expect(normalizeTalents([{ id: 'a', code: 't_dmg', xp: 0, level: 1 }])[0]!.level).toBe(1);
    const n = normalizeTalents([{ id: 'b', code: 't_dmg', xp: 0, level: 50 }])[0]!;
    expect(n.level).toBe(50); // ilvl conservé (v0.592)
    expect(n.enchant).toBe(0);
  });
  it('filtre les codes inconnus et tolère le non-tableau', () => {
    expect(normalizeTalents(['nope', 't_crit'])).toHaveLength(1);
    expect(normalizeTalents({})).toEqual([]);
  });
});

describe('talentEffects (équipés uniquement)', () => {
  it('⚠️ UN SEUL talent compte, même si plusieurs sont marqués équipés (v0.845)', () => {
    // Un compte d'avant la règle porte encore plusieurs talents équipés (ici l'ancien
    // format string[], tous équipés) : tant que la page ne les a pas rognés, la puissance
    // ne doit JAMAIS en compter plus d'un.
    const e = talentEffects(['t_dmg', 't_dmg', 't_pv']);
    expect(e.damagePct).toBeCloseTo(talentValue(talentByCode('t_dmg')!, 0, 0));
    expect(e.maxPvPct).toBe(0);
  });
  it('instances : seuls les ÉQUIPÉS comptent', () => {
    const insts: TalentInstance[] = [
      { id: 'a', code: 't_dmg', xp: 0, enchant: 0, equipped: true },
      { id: 'b', code: 't_crit', xp: 0, enchant: 0, equipped: false },
    ];
    const e = talentEffects(insts);
    expect(e.damagePct).toBeCloseTo(talentValue(talentByCode('t_dmg')!, 0, 0));
    expect(e.critAdd).toBe(0); // non équipé
  });
  it('l’enchant augmente la magnitude', () => {
    const base: TalentInstance = { id: 'a', code: 't_dmg', xp: 0, enchant: 0, equipped: true };
    const ench: TalentInstance = { id: 'b', code: 't_dmg', xp: 0, enchant: 6, equipped: true };
    expect(talentEffects([ench]).damagePct).toBeGreaterThan(talentEffects([base]).damagePct);
  });
});

describe('drop', () => {
  it('rollTalentDrop : code valide, +0, non équipé', () => {
    const t = rollTalentDrop(mulberry32(3), { level: 4, luck: 0.5, idSeed: 1 });
    expect(TALENTS.some((d) => d.code === t.code)).toBe(true);
    expect(t.enchant).toBe(0);
    expect(t.equipped).toBeFalsy();
  });

  it('rollTalentDrop : pyramide centrée niveau + cap anti-runaway (playerLevel)', () => {
    // joueur bas niveau en contenu profond → rang centré sur le joueur, plafonné ceiling(4)+2
    const cap = Math.min(9, rankCeilingForLevel(4) + 2);
    for (let s = 0; s < 80; s++) {
      const t = rollTalentDrop(mulberry32(s * 7 + 1), {
        level: 40,
        luck: 1,
        idSeed: s,
        playerLevel: 4,
      });
      expect(RANK_ORDER.indexOf(talentRankOf(t))).toBeLessThanOrEqual(cap);
    }
    // niveau haut + luck → dépasse le rang G (progression réelle)
    const highMax = Math.max(
      ...Array.from({ length: 60 }, (_, s) =>
        RANK_ORDER.indexOf(
          talentRankOf(rollTalentDrop(mulberry32(s * 13 + 5), { level: 80, luck: 1, idSeed: s })),
        ),
      ),
    );
    expect(highMax).toBeGreaterThan(0);
  });
});

describe('⚠️ UN TALENT N’EST ÉQUIPÉ QUE S’IL LE DIT', () => {
  // ⚠️ Signalé en urgence par l’utilisateur (« le comparatif de puissance au drop et
  // dans le sac a l’air complètement faux »). Ce n’était pas le comparatif : c’était LA
  // PUISSANCE. `talentEffects` comptait « tout sauf equipped === false » alors que TOUS
  // les autres lecteurs — gardes de `equipTalent`, compteur d’emplacements,
  // auto-correction — lisent `t.equipped` en truthy. Et `rollTalentDrop` ne posait
  // AUCUN champ : chaque talent jamais tombé comptait donc à vie, sans limite de place.
  // Mesuré sur le compte réel : 79 possédés, 74 comptés, 5 emplacements → puissance
  // gonflée de 85 % (1683 au lieu de 911).
  const drop = (seed: number) => rollTalentDrop(mulberry32(seed), { level: 20 });

  it('un talent qui TOMBE n’est pas équipé', () => {
    const t = drop(1);
    // Explicite, jamais `undefined` : un champ absent, chaque lecteur l’interprète à sa façon.
    expect(t.equipped).toBe(false);
  });

  it('⚠️ un talent SANS champ `equipped` ne compte PAS', () => {
    // Le cas des lignes déjà en base : le champ n’existe pas. On ne peut pas deviner
    // « équipé » — les emplacements, eux, ne le comptent pas.
    const t = { ...drop(2) } as Record<string, unknown>;
    delete t.equipped;
    const sans = talentEffects([t]);
    const avec = talentEffects([{ ...drop(2), equipped: true }]);
    expect(sans).toEqual(talentEffects([]));
    expect(avec).not.toEqual(talentEffects([]));
  });

  it('⚠️ LES TALENTS LEGACY (ancien string[]) RESTENT équipés', () => {
    // `normalizeTalents` leur pose `equipped: true` explicitement : ce correctif ne
    // devait pas les désarmer au passage.
    const code = TALENTS[0]!.code;
    expect(normalizeTalents([code])[0]!.equipped).toBe(true);
    expect(talentEffects([code])).not.toEqual(talentEffects([]));
  });

  it('⚠️ POSSÉDER N’EST PAS PORTER : 50 talents au sac ne valent pas 50 talents', () => {
    // Le vrai symptôme : la puissance grandissait à CHAQUE drop, sans plafond.
    const sac = Array.from({ length: 50 }, (_, i) => drop(i + 10));
    expect(talentEffects(sac)).toEqual(talentEffects([]));
    const portes = sac.slice(0, talentsEarned(28)).map((t) => ({ ...t, equipped: true }));
    expect(talentEffects(portes)).not.toEqual(talentEffects([]));
  });

  it('⭐ un talent se lit en ÉTOILES, par la MÊME découpe que les objets (v0.907)', () => {
    // ⚠️ `talentStar` ne refait PAS le découpage : il délègue à `jetStar`. Une seconde
    // formule divergerait au premier réglage, et la même qualité s'afficherait ★3 ici et
    // ★4 sur un objet.
    //
    // ⚠️ ET ÇA SE VÉRIFIE AUX FRONTIÈRES, pas sur des drops aléatoires : une formule
    // plausible comme `ceil(roll × 5)` donne le MÊME résultat partout AILLEURS (elle ne
    // diffère de `floor(roll × 5) + 1` que lorsque `roll × 5` tombe pile sur un entier),
    // donc un test tiré au hasard la laissait passer — mesuré, il l'a laissée passer.
    const base = drop(1);
    for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const t = { ...base, roll };
      expect(talentStar(t), `roll ${roll}`).toBe(jetStar(roll));
    }
    for (let s = 1; s <= 40; s++) {
      const t = drop(s);
      expect(talentStar(t)).toBe(jetStar(talentRollOf(t)));
      expect(talentStar(t)).toBeGreaterThanOrEqual(1);
      expect(talentStar(t)).toBeLessThanOrEqual(5);
    }
    // Et son étiquette complète s'écrit comme celle d'un objet : rang + étoiles.
    const t = drop(3);
    expect(gradeLabel({ rarity: talentRankOf(t), roll: talentRollOf(t) })).toMatch(/★/);
  });

  it('⭐ les 5 étoiles d’un talent sont TOUTES atteignables', () => {
    // Un affichage qui ne prendrait que 2 valeurs sur 5 n'apprendrait rien.
    const vus = new Set<number>();
    for (let s = 1; s <= 400; s++) vus.add(talentStar(drop(s)));
    expect(vus.size).toBe(5);
  });
});
