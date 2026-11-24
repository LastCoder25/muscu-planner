// @vitest-environment happy-dom
//
// ✍️ Écritures GROUPÉES d'une série (×5, ×10, ×25 de donjons/boss, Labyrinthe en série).
// Mesuré avant correctif : ~175 Ko écrits PAR lancer, l'un après l'autre (4,4 Mo pour un ×25).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { createWriteCoalescer } from '@/lib/deferredWrites';

describe('createWriteCoalescer (pur)', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('une seule écriture à la fois ; ce qui arrive pendant le vol part ensemble ensuite', async () => {
    const sent: Record<string, unknown>[] = [];
    let live = 0;
    let maxLive = 0;
    const c = createWriteCoalescer(async (b) => {
      live++;
      maxLive = Math.max(maxLive, live);
      sent.push(b);
      await sleep(100);
      live--;
    });
    c.add({ gold: 1, inventory: ['x'] });
    await vi.advanceTimersByTimeAsync(10); // la 1re écriture est en vol (100 ms)…
    for (let i = 2; i <= 25; i++) c.add({ gold: i, inventory: ['x'.repeat(i)] }); // …les autres s'accumulent
    const done = c.flush();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(maxLive).toBe(1);
    expect(sent).toHaveLength(2); // 1 requête partie tout de suite + 1 avec les 24 autres
    expect(sent[1]).toEqual({ gold: 25, inventory: ['x'.repeat(25)] }); // le DERNIER état gagne
    expect(c.dirty()).toBe(false);
  });
  it('chaque colonne écrite au moins une fois arrive en base, même si elle n’a changé qu’au milieu', async () => {
    const state: Record<string, unknown> = {};
    const c = createWriteCoalescer(async (b) => {
      await sleep(50);
      Object.assign(state, b);
    });
    c.add({ gold: 1 });
    c.add({ gold: 2, talents: ['t'] });
    c.add({ gold: 3 });
    c.add({ gold: 4, keys: 7 });
    const done = c.flush();
    await vi.advanceTimersByTimeAsync(500);
    await done;
    expect(state).toEqual({ gold: 4, talents: ['t'], keys: 7 });
  });
  it('un échec ne perd rien : flush rejette, le patch reste, un nouveau flush le renvoie', async () => {
    let fail = true;
    const sent: Record<string, unknown>[] = [];
    const c = createWriteCoalescer(async (b) => {
      if (fail) throw new Error('réseau');
      sent.push(b);
    });
    c.add({ gold: 5, inventory: ['a'] });
    await expect(c.flush()).rejects.toThrow('réseau');
    expect(c.dirty()).toBe(true);
    fail = false;
    c.add({ gold: 6 }); // après l'échec : s'ajoute et retente
    await c.flush();
    expect(sent).toEqual([{ gold: 6, inventory: ['a'] }]); // rien perdu, la valeur la plus récente
    expect(c.dirty()).toBe(false);
  });
  it('une colonne réécrite PENDANT une écriture qui échoue garde sa valeur la plus récente', async () => {
    const sent: Record<string, unknown>[] = [];
    let first = true;
    const c: ReturnType<typeof createWriteCoalescer> = createWriteCoalescer(async (b) => {
      if (first) {
        first = false;
        c.add({ gold: 2 }); // arrive pendant le vol, plus récent que le gold: 1 qui part
        throw new Error('réseau');
      }
      sent.push(b);
    });
    c.add({ gold: 1, keys: 3 });
    await expect(c.flush()).rejects.toThrow('réseau');
    await c.flush();
    expect(sent).toEqual([{ gold: 2, keys: 3 }]);
  });
  it('un échec survenu en arrière-plan n’est pas resservi à un flush qui, lui, réussit', async () => {
    let fail = true;
    const sent: Record<string, unknown>[] = [];
    const c = createWriteCoalescer(async (b) => {
      if (fail) throw new Error('réseau');
      sent.push(b);
    });
    c.add({ gold: 1 }); // part en arrière-plan et échoue, personne n'a encore demandé de flush
    for (let i = 0; i < 6; i++) await Promise.resolve();
    fail = false;
    await c.flush(); // retente : réussit, ne rejette pas avec l'ancienne erreur
    expect(sent).toEqual([{ gold: 1 }]);
  });
  it('rien à écrire : flush ne fait aucune requête', async () => {
    const send = vi.fn(async () => undefined);
    const c = createWriteCoalescer(send);
    await c.flush();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('store character : une série écrit groupé', () => {
  const real = globalThis.fetch;
  let bodies: string[];
  let reads: number;
  let live = 0;
  let maxLive = 0;
  let latency = 0;
  let status = 200;
  beforeEach(() => {
    bodies = [];
    reads = 0;
    live = 0;
    maxLive = 0;
    latency = 0;
    status = 200;
    setActivePinia(createPinia());
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      live++;
      maxLive = Math.max(maxLive, live);
      if (init?.method === 'GET' || init?.body == null) reads++;
      else bodies.push(String(init.body));
      if (latency) await new Promise((r) => setTimeout(r, latency));
      live--;
      return new Response(JSON.stringify({ updated_at: new Date().toISOString() }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = real;
  });

  async function setup() {
    const { useCharacterStore } = await import('@/stores/character');
    const char = useCharacterStore();
    const inventory = Array.from({ length: 300 }, (_, i) => ({ id: 'i' + i, slot: 'weapon', name: 'x'.repeat(200) }));
    (char as unknown as { row: unknown }).row = {
      user_id: 'u',
      pseudo: 'T',
      gold: 100,
      energy_spent: 0,
      inventory,
      equipped: {},
      cleared_dungeons: [],
      talents: [],
      dungeon_stats: {},
      keys: 0,
      summon_stones: 0,
    };
    return char as unknown as {
      row: { gold: number; energy_spent: number };
      applyRun: (u: string, i: Record<string, unknown>) => Promise<unknown>;
      beginDeferredWrites: () => void;
      endDeferredWrites: () => Promise<void>;
      fetchMine: () => Promise<unknown>;
    };
  }
  const run = (char: Awaited<ReturnType<typeof setup>>) =>
    char.applyRun('u', { energyCost: 10, gold: 5, drops: [], dungeonId: 'd1' });

  it('sans série : une requête PAR lancer (comportement d’avant, inchangé)', async () => {
    const char = await setup();
    for (let i = 0; i < 5; i++) await run(char);
    expect(bodies).toHaveLength(5);
  });
  it('en série : la fiche locale est à jour tout de suite, et 25 lancers n’écrivent que quelques fois', async () => {
    const char = await setup();
    latency = 20;
    char.beginDeferredWrites();
    for (let i = 0; i < 25; i++) await run(char); // aucun lancer n'attend le réseau
    expect(char.row.gold).toBe(100 + 25 * 5);
    expect(char.row.energy_spent).toBe(250);
    await char.endDeferredWrites();
    expect(bodies.length).toBeLessThanOrEqual(3);
    expect(maxLive).toBe(1); // jamais deux écritures en même temps (pas de course)
    const last = JSON.parse(bodies[bodies.length - 1]!);
    expect(last.gold).toBe(225);
    expect(last.energy_spent).toBe(250);
    // l'inventaire (140 Ko pour un compte avancé) n'est plus renvoyé 25 fois
    const total = bodies.reduce((a, b) => a + b.length, 0);
    expect(total).toBeLessThan(0.2 * 25 * bodies[0]!.length);
  });
  it('la base reçoit l’état FINAL de chaque colonne (rien perdu au milieu)', async () => {
    const char = await setup();
    latency = 10;
    char.beginDeferredWrites();
    for (let i = 0; i < 10; i++) await run(char);
    await char.endDeferredWrites();
    const db: Record<string, unknown> = {};
    for (const b of bodies) Object.assign(db, JSON.parse(b));
    expect(db.gold).toBe(150);
    expect(db.energy_spent).toBe(100);
    expect((db.dungeon_stats as Record<string, { runs?: number; attempts?: number }>).d1).toBeTruthy();
  });
  it('échec réseau : endDeferredWrites rejette (l’appelant relit la fiche), rien n’est avalé', async () => {
    const char = await setup();
    status = 500;
    char.beginDeferredWrites();
    await run(char);
    await run(char);
    await expect(char.endDeferredWrites()).rejects.toBeTruthy();
  });
  it('pendant une série, relire la fiche ne l’écrase pas par une base en retard', async () => {
    const char = await setup();
    char.beginDeferredWrites();
    await run(char);
    await char.fetchMine(); // ne lit pas la base (en retard) et ne remplace pas la fiche
    expect(char.row.gold).toBe(105);
    expect(reads).toBe(0);
    await char.endDeferredWrites();
  });
  it('une série imbriquée ne vide qu’à la fermeture de la plus externe', async () => {
    const char = await setup();
    latency = 5;
    char.beginDeferredWrites();
    char.beginDeferredWrites();
    await run(char);
    status = 500; // l'écriture échoue pendant la série externe…
    await run(char);
    await char.endDeferredWrites(); // …la fermeture INTERNE ne vide pas, donc ne rejette pas
    status = 200;
    await run(char);
    await char.endDeferredWrites(); // l'externe réécrit tout ce qui était resté en attente
    const db: Record<string, unknown> = {};
    for (const b of bodies) Object.assign(db, JSON.parse(b));
    expect(db.gold).toBe(115); // 3 lancers, dont celui joué pendant l’échec
  });
});

describe('câblage : les trois séries passent par les écritures groupées', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('donjons et boss (runBatch)', () => {
    const s = src('../src/pages/AventurePage.vue');
    expect(s).toContain('char.beginDeferredWrites();');
    expect(s).toContain('await char.endDeferredWrites();');
  });
  it('Labyrinthe en série : ouverte au lancement, fermée à la clôture, au retour et au démontage', () => {
    const s = src('../src/pages/ExpeditionPage.vue');
    expect(s).toContain('if (total > 1) beginSeriesWrites();');
    expect(s.match(/void endSeriesWrites\(\);/g)!.length).toBeGreaterThanOrEqual(5);
  });
});
