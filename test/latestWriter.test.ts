import { describe, it, expect } from 'vitest';
import { createLatestWriter } from '@/lib/latestWriter';

// Bug v1.248 : les séries d'une séance du 360 partaient en requêtes parallèles qui
// s'écrasaient dans le désordre. La file d'écriture garantit que la dernière porte tout.

/** Un faux serveur : chaque requête met un temps donné (la 1re plus lente que la suivante,
 *  comme sur un réseau mobile), et garde ce qu'elle a écrit en dernier. */
function fakeServer(delays: number[]) {
  const state = { sets: [] as number[] };
  let stored: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const send = async () => {
    const body = [...state.sets]; // l'état lu AU DÉPART de la requête
    const d = delays[calls++] ?? 0;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, d));
    inFlight--;
    stored = body;
  };
  return { state, send, stored: () => stored, max: () => maxInFlight, calls: () => calls };
}

describe('✍️ écritures sérialisées « dernier état » (latestWriter)', () => {
  it('⚠️ 5 séries enregistrées d’un coup : le serveur finit avec les 5', async () => {
    const srv = fakeServer([30, 5, 5, 5, 5]);
    const w = createLatestWriter<string>(srv.send);
    for (let i = 1; i <= 5; i++) {
      srv.state.sets.push(i);
      w.schedule('c1');
    }
    await w.idle('c1');
    expect(srv.stored()).toEqual([1, 2, 3, 4, 5]);
  });

  it('une seule requête à la fois, et les demandes en attente se regroupent', async () => {
    const srv = fakeServer([10, 10, 10]);
    const w = createLatestWriter<string>(srv.send);
    for (let i = 1; i <= 6; i++) {
      srv.state.sets.push(i);
      w.schedule('c1');
    }
    await w.idle('c1');
    expect(srv.max()).toBe(1);
    expect(srv.calls()).toBe(2); // la 1re, puis UNE avec tout ce qui est arrivé entre-temps
  });

  it('un échec se retente, puis l’état final passe', async () => {
    let fails = 2;
    let stored: number[] = [];
    const sets = [1, 2];
    const w = createLatestWriter<string>(
      async () => {
        if (fails-- > 0) throw new Error('réseau');
        stored = [...sets];
      },
      { retryMs: 1 },
    );
    w.schedule('c1');
    await w.idle('c1');
    expect(stored).toEqual([1, 2]);
  });

  it('abandonne après les nouvelles tentatives et le signale', async () => {
    const errors: unknown[] = [];
    const w = createLatestWriter<string>(
      async () => {
        throw new Error('hors ligne');
      },
      { retries: 2, retryMs: 1, onError: (_k, e) => errors.push(e) },
    );
    w.schedule('c1');
    await w.idle('c1');
    expect(errors).toHaveLength(1);
  });
});
