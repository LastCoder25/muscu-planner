// @vitest-environment happy-dom
//
// ⏩ ÉCRITURES GROUPÉES DU RATTRAPAGE ET DES DÉPARTS : le VRAI store, une base simulée au niveau
// de `fetch` (chaque requête attend qu'on la libère).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

interface Sent {
  method: string;
  body: Record<string, unknown>;
  release: (status?: number, data?: unknown) => void;
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
        release: (status = 200, data = { updated_at: '2026-01-01T00:00:00Z' }) =>
          resolve(
            new Response(JSON.stringify(data), {
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
    const { useAuthStore } = await import('@/stores/auth');
    (useAuthStore() as unknown as { user: unknown }).user = { id: 'u1' };
    const stored = JSON.parse(JSON.stringify(char.row)) as { messages: { read: boolean }[] };
    stored.messages.forEach((m) => (m.read = false));
    let i = 0;
    let done = false;
    void p.finally(() => (done = true)).catch(() => undefined);
    while (!done) {
      await flush();
      while (i < sent.length) sent[i++]!.release(500);
    }
    await failed;
    // La fiche relue, une nouvelle série n'envoie que SES colonnes.
    const before = sent.length;
    const next = char.groupedWrites(async () => {
      await char.toggleLock('u1', 'i1');
    });
    let over = false;
    void next.finally(() => (over = true)).catch(() => undefined);
    while (!over) {
      await flush();
      while (i < sent.length) {
        const r = sent[i++]!;
        r.release(200, r.method === 'GET' ? [stored] : undefined);
      }
    }
    await next;
    const writes = sent.slice(before).filter((r) => r.method === 'PATCH');
    const last = writes.at(-1)!;
    expect(Object.keys(last.body)).toContain('inventory');
    expect(Object.keys(last.body)).not.toContain('messages');
  });

  it('⚠️ après un envoi raté, RIEN ne s’écrit tant que la fiche n’a pas été relue', async () => {
    const { char, sent } = await setup();
    const { useAuthStore } = await import('@/stores/auth');
    (useAuthStore() as unknown as { user: unknown }).user = { id: 'u1' };
    const stored = JSON.parse(JSON.stringify(char.row)) as unknown;
    let online = false;
    let answered = 0;
    /** Répond à tout ce qui est parti : en ligne, la lecture rend la fiche d'avant. */
    const pump = async (p: Promise<unknown>) => {
      let done = false;
      void p.finally(() => (done = true)).catch(() => undefined);
      while (!done) {
        await flush();
        while (answered < sent.length) {
          const r = sent[answered++]!;
          r.release(online ? 200 : 503, online && r.method === 'GET' ? [stored] : undefined);
        }
      }
      return p;
    };
    const patches = () => sent.filter((r) => r.method === 'PATCH').length;
    // Une fiche lue à l'instant : seule l'écriture ratée doit la faire relire.
    online = true;
    await pump(char.fetchMine());
    online = false;
    (char as unknown as { row: unknown }).row = JSON.parse(JSON.stringify(stored));
    await expect(
      pump(char.groupedWrites(async () => void (await char.toggleLock('u1', 'i1')))),
    ).rejects.toBeTruthy();
    // L'écran montre encore l'objet verrouillé, la base non.
    expect(char.row!.inventory[0]!.locked).toBe(true);
    expect(char.needsReload()).toBe(true);
    await pump(char.fetchMine()).catch(() => undefined); // toujours hors ligne
    const before = patches();
    await expect(pump(char.toggleLock('u1', 'i1'))).rejects.toThrow('pas à jour');
    await expect(pump(char.groupedWrites(async () => undefined))).rejects.toBeTruthy();
    expect(patches()).toBe(before);
    expect(char.needsReload()).toBe(true);
    // Le réseau revient : la fiche est relue, puis on écrit de nouveau.
    online = true;
    await pump(char.fetchIfStale(3_600_000));
    expect(char.needsReload()).toBe(false);
    expect(char.row!.inventory[0]?.locked).toBeFalsy();
    await pump(char.toggleLock('u1', 'i1'));
    expect(patches()).toBeGreaterThan(before);
  });

  it('une série demandée pendant une autre attend qu’elle soit enregistrée', async () => {
    const { char, sent } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const first = char.groupedWrites(async () => {
      await char.toggleLock('u1', 'i1');
      await gate;
    });
    let started = false;
    const second = char.groupedWrites(async () => {
      started = true;
      await char.expeMarkRead('u1');
    });
    for (let i = 0; i < 5; i++) await flush();
    expect(started).toBe(false);
    release();
    await drain(Promise.all([first, second]), sent);
    expect(started).toBe(true);
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
