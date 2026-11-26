// 🧩 Les variantes rangées à côté de leur exo de base dans les listes de choix (v1.364.0).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupVariantFamilies, groupVariantFamiliesBy } from '@/data/combo';

const ids = (l: { id: string }[]) => l.map((e) => e.id);
const L = (...a: string[]) => a.map((id) => ({ id }));

describe('groupVariantFamilies', () => {
  it('une famille forme un bloc à la place de son premier membre, base d’abord puis ses variantes dans l’ordre de la famille', () => {
    const out = groupVariantFamilies(
      L('ex_pushup_archer', 'ex_dips', 'ex_pushup', 'ex_curl_barbell', 'ex_pushup_knees', 'ex_dips_assisted'),
    );
    expect(ids(out)).toEqual([
      'ex_pushup', // le bloc des pompes prend la place d'« archer » (premier vu), base en tête
      'ex_pushup_knees',
      'ex_pushup_archer',
      'ex_dips',
      'ex_dips_assisted',
      'ex_curl_barbell',
    ]);
  });
  it('l’ordre voulu par l’écran se conserve d’une famille à l’autre (favori en tête)', () => {
    // Le favori est un dips : sa famille passe devant celle des pompes.
    const out = groupVariantFamilies(L('ex_dips_bench', 'ex_pushup', 'ex_dips', 'ex_pushup_incline'));
    expect(ids(out)).toEqual(['ex_dips', 'ex_dips_bench', 'ex_pushup', 'ex_pushup_incline']);
  });
  it('un exo sans variante ne bouge pas ; ids inconnus compris', () => {
    const out = groupVariantFamilies(L('ex_zzz', 'ex_pushup_wide', 'ex_yyy', 'ex_pushup'));
    expect(ids(out)).toEqual(['ex_zzz', 'ex_pushup', 'ex_pushup_wide', 'ex_yyy']);
  });
  it('liste vide, un seul élément, aucun doublon perdu, entrée non modifiée', () => {
    expect(groupVariantFamilies([])).toEqual([]);
    expect(ids(groupVariantFamilies(L('ex_pushup')))).toEqual(['ex_pushup']);
    const input = L('ex_pushup_wide', 'ex_row_barbell', 'ex_pushup');
    const copy = [...input];
    const out = groupVariantFamilies(input);
    expect(input).toEqual(copy);
    expect(out).toHaveLength(3);
    expect(new Set(ids(out))).toEqual(new Set(ids(input)));
  });
  it('la version « par identifiant » sert aux éléments { ex, tag }', () => {
    const out = groupVariantFamiliesBy(
      [{ ex: { id: 'ex_pushup_wide' }, tag: 'a' }, { ex: { id: 'ex_bw_squat' }, tag: 'b' }, { ex: { id: 'ex_pushup' }, tag: 'c' }],
      (x) => x.ex.id,
    );
    expect(out.map((x) => x.tag)).toEqual(['c', 'a', 'b']);
  });
});

describe('branché sur les listes de choix', () => {
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('création du 360, changement d’exo, nouveau challenge, séance libre', () => {
    expect(src('src/pages/ComboNewPage.vue')).toContain('groupVariantFamilies(mineCandidates');
    expect(src('src/pages/ComboNewPage.vue')).toContain('v-for="e in shownMine"');
    expect(src('src/pages/ComboNewPage.vue')).toContain('v-for="e in shownOther"');
    expect(src('src/components/ComboSwapSheet.vue')).toContain('groupVariantFamilies(mine.length');
    expect(src('src/pages/ChallengeNewPage.vue')).toContain('groupVariantFamilies(');
    expect(src('src/pages/FreeSessionPage.vue')).toContain('groupVariantFamiliesBy(');
  });
  it('la présélection du 360 lit l’ordre d’origine (un favori passe avant sa famille), pas l’affichage', () => {
    const page = src('src/pages/ComboNewPage.vue');
    const apply = page.slice(page.indexOf('function applyPlan'), page.indexOf('watch([level, zone'));
    expect(apply).toContain('mineCandidates(slot)');
    expect(apply).not.toContain('groupVariantFamilies');
  });
});
