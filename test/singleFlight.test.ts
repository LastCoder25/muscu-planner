import { describe, it, expect } from 'vitest';
import { singleFlight } from '@/lib/singleFlight';

/** Promesse qu'on résout à la main : c'est le seul moyen d'avoir DEUX appels réellement
 *  concurrents (le défaut qu'on corrige ne se produit qu'entre l'appel et sa réponse). */
function differee<T>() {
  let ok!: (v: T) => void;
  let ko!: (e: unknown) => void;
  const p = new Promise<T>((res, rej) => {
    ok = res;
    ko = rej;
  });
  return { p, ok, ko };
}

describe('🔒 singleFlight — deux appelants concurrents ne déclenchent qu’UN travail', () => {
  it('le deuxième appel PENDANT le premier reçoit la même promesse, sans relancer', async () => {
    const d = differee<number>();
    let appels = 0;
    const f = singleFlight(() => {
      appels++;
      return d.p;
    });
    const a = f();
    const b = f();
    expect(appels).toBe(1); // ⚠️ le cœur : un seul chargement, donc un seul versement
    expect(a).toBe(b);
    d.ok(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
  });

  it('une fois terminé, l’appel suivant relance vraiment (ce n’est PAS un cache)', async () => {
    let appels = 0;
    const f = singleFlight(() => {
      appels++;
      return Promise.resolve(appels);
    });
    expect(await f()).toBe(1);
    expect(await f()).toBe(2);
    expect(appels).toBe(2);
  });

  it('un ÉCHEC ne bloque pas les appels suivants, et se propage aux deux appelants', async () => {
    const d = differee<number>();
    let appels = 0;
    const f = singleFlight(() => {
      appels++;
      return appels === 1 ? d.p : Promise.resolve(42);
    });
    const a = f();
    const b = f();
    d.ko(new Error('réseau'));
    await expect(a).rejects.toThrow('réseau');
    await expect(b).rejects.toThrow('réseau');
    // La porte s'est rouverte : on peut retenter.
    expect(await f()).toBe(42);
  });
});
