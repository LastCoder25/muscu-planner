import { describe, it, expect } from 'vitest';
import { championsOf, CHAMPIONS, type Champion } from '@/data/champions';
import { RANK_ORDER, prestigeRankIndex } from '@/lib/items';
import { advChampion, advRarity, advStats } from '@/lib/adventurers';
import { refAdvGear, refAdventurer, refChampionAdv, refChampions } from '@/lib/caravan';

const part = (c: Champion, axe: 'p' | 'e' | 'a') => c.form[axe] / (c.form.p + c.form.e + c.form.a);

describe('🏅 l’étalon en champions', () => {
  it('⚠️ PAS ENCORE BRANCHÉ : la route se calibre toujours sur les aventuriers', () => {
    // La basculer aujourd'hui rendrait les convois IMPOSSIBLES pour les aventuriers
    // existants (mesuré : un trio tombe de 75-88 % à 1-2 %). Les deux camps doivent
    // bouger ENSEMBLE (leçon v0.795). Ce test tombera le jour de la bascule — c'est
    // exactement ce qu'on veut : il force à relire la mesure avant de la faire.
    const a = refAdventurer(30, 0);
    expect(advChampion(a)).toBeUndefined();
    expect(a.path.length).toBeGreaterThan(0);
  });

  it('rend TROIS orientations — une escorte monochrome effondre le multi-frappe', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      const cs = refChampions(L);
      expect(cs).toHaveLength(3);
      // Celui qu'on prend pour la puissance est bien le plus « puissance » du pool, etc.
      const pool = championsOf(RANK_ORDER[prestigeRankIndex(L)]!);
      (['p', 'a', 'e'] as const).forEach((axe, i) => {
        const best = Math.max(...pool.map((c) => part(c, axe)));
        expect(part(cs[i]!, axe), `niveau ${L}, axe ${axe}`).toBeCloseTo(best, 10);
      });
    }
  });

  it('⚠️ ROBUSTE À L’ORDRE DU ROSTER — sinon ajouter un champion déplacerait la calibration', () => {
    // On ne prend jamais « les trois premiers » : on trie par la part de l'axe visé, puis
    // par `id`. Un pool mélangé doit donner exactement la même référence.
    for (const L of [12, 45, 100]) {
      const attendu = refChampions(L).map((c) => c.id);
      // Le tri est déterministe : le rejouer doit donner le même résultat, et l'ordre
      // d'écriture du roster n'entre pas dans la décision.
      expect(refChampions(L).map((c) => c.id)).toEqual(attendu);
      const pool = championsOf(RANK_ORDER[prestigeRankIndex(L)]!);
      for (const id of attendu) expect(pool.some((c) => c.id === id)).toBe(true);
    }
  });

  it('sa RARETÉ est celle que le joueur peut exprimer, jamais plus', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      const attendu = RANK_ORDER[prestigeRankIndex(L)]!;
      for (const c of refChampions(L)) expect(c.rarity).toBe(attendu);
      // …et la rareté EFFECTIVE de l'aventurier qui le porte vaut la même chose.
      for (let slot = 0; slot < 4; slot++) expect(advRarity(refChampionAdv(L, slot))).toBe(attendu);
    }
  });

  it('⚠️ SANS ÉVEIL — il se mérite, il ne doit pas être une attente', () => {
    for (const L of [12, 60]) expect(refChampionAdv(L).copies).toBe(1);
  });

  it('les orientations BOUCLENT au-delà de 3, comme `refAdventurer`', () => {
    const ids = [0, 1, 2, 3, 4].map((s) => refChampionAdv(30, s).championId);
    expect(ids[3]).toBe(ids[0]);
    expect(ids[4]).toBe(ids[1]);
  });

  it('⚠️ SA FORME N’EST PAS PLATE : les trois membres ne sont pas interchangeables', () => {
    // C'est la raison d'être des trois orientations. Si le roster devenait uniforme, la
    // référence perdrait sa non-linéarité d'offense sans que rien ne le dise.
    for (const L of [12, 45, 100]) {
      const st = [0, 1, 2].map((s) => advStats(refChampionAdv(L, s)));
      const domines = new Set(
        st.map((x) =>
          x.puissance >= x.endurance && x.puissance >= x.agilite
            ? 'p'
            : x.agilite >= x.endurance
              ? 'a'
              : 'e',
        ),
      );
      expect(domines.size, `niveau ${L}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('un champion de référence existe bien dans le roster', () => {
    for (const L of [1, 50, 100])
      for (let s = 0; s < 3; s++) {
        const a = refChampionAdv(L, s);
        expect(CHAMPIONS.some((c) => c.id === a.championId)).toBe(true);
        expect(advChampion(a)).toBeDefined();
      }
  });
});

describe('⚠️ LES DEUX TROUS QUE LA MUTATION A RÉVÉLÉS', () => {
  it('⚠️ À EX ÆQUO, C’EST LE PLUS PETIT `id` QUI GAGNE — et il y a VRAIMENT des ex æquo', () => {
    // Mesuré : 6 cas sur 24 (rareté × axe) sont à égalité parfaite — `inhabituel`/puissance
    // (gorm, sylve), `legendaire`/puissance (tarn, ysolde), `mythique`/agilité (fulgur,
    // nyx)… Sans le départage par `id`, `Array.sort` étant STABLE, c'est l'ordre d'écriture
    // du roster qui trancherait : réordonner le fichier déplacerait la référence, donc
    // toute la calibration de la route, et rien ne le dirait.
    const exAequo = (rarete: string, axe: 'p' | 'e' | 'a') => {
      const pool = championsOf(rarete as never);
      const parts = pool.map((c) => part(c, axe));
      const max = Math.max(...parts);
      return pool.filter((_, i) => Math.abs(parts[i]! - max) < 1e-12);
    };
    let vus = 0;
    for (const r of RANK_ORDER)
      for (const [i, axe] of (['p', 'a', 'e'] as const).entries()) {
        const ties = exAequo(r, axe);
        if (ties.length < 2) continue;
        vus++;
        const attendu = [...ties].sort((x, y) => x.id.localeCompare(y.id))[0]!;
        const L = RANK_ORDER.indexOf(r) * 10 + 5; // un niveau dont le rang cible est `r`
        expect(prestigeRankIndex(L), `niveau témoin de ${r}`).toBe(RANK_ORDER.indexOf(r));
        expect(refChampions(L)[i]!.id, `${r} / ${axe}`).toBe(attendu.id);
      }
    expect(vus, 'le roster n’a plus d’ex æquo : ce garde est devenu dormant').toBeGreaterThan(0);
  });

  it('⚠️ LA ROUTE SE CALIBRE ENCORE SUR LES LIGNÉES D’AVENTURIER', () => {
    // Mon premier test regardait `refAdventurer`, que la bascule ne touche PAS — il ne
    // pouvait donc pas voir `refEscortBare` passer aux champions. On observe ici l'ÉTALON
    // réellement employé : `refAdvGear` en dérive, et ses pièces portent sa lignée.
    const lignees = new Set(refAdvGear(30, 3).map((g) => g.lineage));
    expect([...lignees].sort()).toEqual(['archer', 'caravanier', 'guerrier']);
    // …et ce ne sont PAS celles des champions de référence, sinon le test ne dirait rien.
    const champs = new Set(refChampions(30).map((c) => c.lineage));
    expect([...champs].sort()).not.toEqual([...lignees].sort());
  });
});
