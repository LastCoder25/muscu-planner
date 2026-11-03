import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useExpeditionParty, type PartyCtx } from '@/composables/useExpeditionParty';

// Test minimal : l'équipe envoyée suit l'ordre des CLICS, pas celui du vivier.
function setup() {
  setActivePinia(createPinia());
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never[];
  const base: Record<string, unknown> = {
    selected: ref(null),
    freeStable: computed(() => pool),
    freeSorted: computed(() => pool),
    cap: computed(() => 10),
    heroLevel: computed(() => 1),
    progressionLevel: computed(() => 1),
    now: computed(() => 0),
    coarseNow: computed(() => 0),
  };
  const ctx = new Proxy(base, {
    get(t, k: string) {
      if (!(k in t)) t[k] = computed(() => null);
      return t[k];
    },
  }) as unknown as PartyCtx;
  return useExpeditionParty(ctx);
}

describe('partyAdvs suit l’ordre des clics', () => {
  it('b coché avant a : b est en tête', () => {
    const p = setup();
    p.togglePartyAdv('b');
    p.togglePartyAdv('a');
    expect(p.partyAdvs.value.map((x) => x.id)).toEqual(['b', 'a']);
    expect(p.partyLeadId.value).toBe('b');
    p.togglePartyAdv('b');
    expect(p.partyLeadId.value).toBe('a');
  });
});
