// @vitest-environment happy-dom
//
// ⏩ ÉCRITURES GROUPÉES DU RATTRAPAGE ET DES DÉPARTS : le VRAI store, une base simulée au niveau
// de `fetch` (chaque requête attend qu'on la libère).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

interface Sent {
  method: string;
  body: Record<string, unknown>;
  release: (status?: number) => void;
}

const base = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = base;
});

async function setup() {
  const sent: Sent[] = [];
  globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((resolve) => {
      sent.push({
        method: init?.method ?? 'GET',
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
        release: (status = 200) =>
          resolve(
            new Response(JSON.stringify({ updated_at: '2026-01-01T00:00:00Z' }), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
          ),
      });
    });
  }) as typeof fetch;
  setActivePinia(createPinia());
  const { useCharacterStore } = await import('@/stores/character');
  const char = useCharacterStore();
  (char as unknown as { row: unknown }).row = {
    user_id: 'u1',
    messages: [
      { id: 'm1', read: false, resolvedAt: Date.now() },
      { id: 'm2', read: false, resolvedAt: Date.now() },
    ],
    inventory: [{ id: 'i1', name: 'Épée', slot: 'weapon', rarity: 'common', locked: false }],
    adv_gear: { stock: [] },
  };
  return { char, sent };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Libère les requêtes au fil de leur arrivée, jusqu'à la fin de la promesse. */
async function drain(p: Promise<unknown>, sent: Sent[], from = 0) {
  let done = false;
  void p.finally(() => (done = true)).catch(() => undefined);
  let i = from;
  while (!done) {
    await flush();
    while (i < sent.length) sent[i++]!.release();
  }
  await p;
}

describe('écritures groupées', { timeout: 60000 }, () => {
  it('les gestes s’appliquent sans attendre le réseau, et partent groupés', async () => {
    const { char, sent } = await setup();
    let appliedBeforeAnyAnswer = false;
    const p = char.groupedWrites(async () => {
      await char.toggleLock('u1', 'i1');
      await char.expeMarkRead('u1');
      await char.toggleLock('u1', 'i1');
      await char.toggleLock('u1', 'i1');
      // Aucune réponse n'est arrivée : la fiche montre déjà tout.
      appliedBeforeAnyAnswer =
        char.row!.inventory[0]!.locked === true && char.row!.messages.every((m) => m.read);
    });
    await drain(p, sent);
    expect(appliedBeforeAnyAnswer).toBe(true);
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(sent.at(-1)!.body.inventory).toEqual([expect.objectContaining({ locked: true })]);
  });

  it('un geste fait pendant l’envoi final rejoint le lot : jamais deux écritures à la fois', async () => {
    const { char, sent } = await setup();
    const p = char.groupedWrites(async () => {
      await char.toggleLock('u1', 'i1');
    });
    while (!sent.length) await flush();
    // L'envoi du lot est parti, pas encore revenu : le joueur touche autre chose.
    const tap = char.expeMarkRead('u1');
    await flush();
    await flush();
    expect(sent).toHaveLength(1);
    await drain(Promise.all([p, tap]), sent);
    expect(sent).toHaveLength(2);
    expect(Object.keys(sent[1]!.body)).toContain('messages');
  });

  it('envoi raté : la promesse rejette, et rien de périmé ne repart ensuite', async () => {
    const { char, sent } = await setup();
    const p = char.groupedWrites(async () => {
      await char.expeMarkRead('u1');
    });
    const failed = expect(p).rejects.toBeTruthy();
    let i = 0;
    let done = false;
    void p.finally(() => (done = true)).catch(() => undefined);
    while (!done) {
      await flush();
      while (i < sent.length) sent[i++]!.release(500);
    }
    await failed;
    const before = sent.length;
    await drain(
      char.groupedWrites(async () => {
        await char.toggleLock('u1', 'i1');
      }),
      sent,
      before,
    );
    expect(sent.length).toBe(before + 1);
    expect(Object.keys(sent[before]!.body)).not.toContain('messages');
  });

  it('les tickets de quêtes (écriture + relecture directes) attendent la fin de la série', async () => {
    const { char, sent } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const p = char.groupedWrites(async () => {
      await gate;
    });
    await flush();
    const claim = char.claimWeeklyQuests('u1', '2026-01-05', 3);
    await flush();
    await flush();
    expect(sent).toHaveLength(0);
    release();
    await p;
    while (!sent.length) await flush();
    sent[0]!.release(500);
    await claim.catch(() => undefined);
  });
});
