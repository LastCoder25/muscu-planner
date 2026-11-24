import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 🔁 Démarrage bloqué par un fichier de l'app introuvable (v1.349.1 puis v1.349.2). Le script inline
// de index.html retélécharge les fichiers fautifs HORS CACHE puis recharge la page, UNE fois, seul.
// On l'exécute avec un faux window/location/sessionStorage/fetch et des minuteries pilotées à la main.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;

function boot(opts: { storage?: boolean; fetchFails?: boolean; fetchHangs?: boolean } = {}) {
  let reloads = 0;
  const fetched: { url: string; init: unknown }[] = [];
  const handlers: Record<string, (e: unknown) => void> = {};
  const mem = new Map<string, string>();
  const timers: { fn: () => void; ms: number }[] = [];
  const win = {
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
    __boot: '',
  };
  const store =
    opts.storage === false
      ? {
          getItem: () => {
            throw new Error('indisponible');
          },
          setItem: () => {
            throw new Error('indisponible');
          },
        }
      : {
          getItem: (k: string) => mem.get(k) ?? null,
          setItem: (k: string, v: string) => mem.set(k, v),
        };
  const fakeFetch = (url: string, init?: unknown) => {
    fetched.push({ url, init });
    if (opts.fetchHangs) return new Promise(() => undefined);
    return opts.fetchFails ? Promise.reject(new Error('réseau')) : Promise.resolve({});
  };
  new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', 'fetch', code)(
    win,
    { getElementById: () => null },
    { reload: () => reloads++ },
    store,
    (fn: () => void, ms: number) => timers.push({ fn, ms }),
    fakeFetch,
  );
  const fail = (src: string) => handlers.error!({ target: { src } });
  /** Joue les minuteries d'une durée donnée (le regroupement : 400 ms ; le secours : 6 s). */
  const fire = async (ms: number) => {
    for (const t of timers.splice(0)) if (t.ms === ms) t.fn();
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };
  return { fail, fire, reloads: () => reloads, fetched };
}

const A = 'https://x.app/assets/index-Dzh5Vkx_.js';
const B = 'https://x.app/assets/combo-BCSMosWz.js';
const C = 'https://x.app/assets/challenges-CgPFgeMG.js';

describe('démarrage : fichiers de l’app introuvables → retéléchargés hors cache, puis rechargement', () => {
  it('chaque fichier fautif est retéléchargé avec cache: "reload", PUIS la page se recharge', async () => {
    const b = boot();
    b.fail(A);
    b.fail(B);
    b.fail(C);
    expect(b.reloads()).toBe(0); // pas avant le délai de regroupement
    await b.fire(400);
    expect(b.fetched.map((f) => f.url).sort()).toEqual([A, B, C].sort());
    expect(b.fetched.every((f) => (f.init as { cache: string }).cache === 'reload')).toBe(true);
    expect(b.reloads()).toBe(1);
  });
  it('plusieurs échecs, dont un doublon : un seul rechargement, une requête par fichier', async () => {
    const b = boot();
    b.fail(A);
    b.fail(B);
    b.fail(A);
    await b.fire(400);
    expect(b.fetched).toHaveLength(2);
    expect(b.reloads()).toBe(1);
  });
  it('un retéléchargement qui échoue (réseau) recharge quand même', async () => {
    const b = boot({ fetchFails: true });
    b.fail(A);
    await b.fire(400);
    expect(b.reloads()).toBe(1);
  });
  it('réseau muet : la minuterie de secours de 6 s recharge tout de même, une seule fois', async () => {
    const b = boot({ fetchHangs: true });
    b.fail(A);
    await b.fire(400);
    expect(b.reloads()).toBe(0); // la requête n'a pas répondu
    await b.fire(6000);
    expect(b.reloads()).toBe(1);
  });
  it('une feuille de style /assets/ manquante compte aussi', async () => {
    const b = boot();
    b.fail('https://x.app/assets/index-AbC.css');
    await b.fire(400);
    expect(b.reloads()).toBe(1);
  });
  it('une ressource qui n’est pas un fichier de l’app (police, image) ne déclenche rien', async () => {
    const b = boot();
    b.fail('https://fonts.googleapis.com/css2?family=Inter');
    b.fail('https://x.app/exercises/ex_squat.jpg');
    await b.fire(400);
    expect(b.fetched).toHaveLength(0);
    expect(b.reloads()).toBe(0);
  });
  it('sans mémoire de session, jamais de rechargement automatique (risque de boucle)', async () => {
    const b = boot({ storage: false });
    b.fail(A);
    await b.fire(400);
    expect(b.reloads()).toBe(0);
  });
  it('deuxième échec dans la minute : pas de second rechargement (garde anti-boucle)', async () => {
    const b = boot();
    b.fail(A);
    await b.fire(400);
    b.fail(B);
    await b.fire(400);
    expect(b.reloads()).toBe(1);
  });
});

describe('vercel.json : une page ne remplace jamais un fichier introuvable', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
    rewrites: { source: string; destination: string }[];
  };
  const re = new RegExp('^' + v.rewrites[0]!.source + '$');
  it('/assets/… inconnu n’est PAS renvoyé vers index.html (sinon : une page HTML à la place du script)', () => {
    expect(re.test('/assets/combo-BCSMosWz.js')).toBe(false);
    expect(re.test('/assets/index-Dzh5Vkx_.js')).toBe(false);
    expect(re.test('/assets/sans-extension')).toBe(false); // même sans point dans le nom
  });
  it('un fichier (avec extension) inconnu non plus ; une route de l’app, oui', () => {
    expect(re.test('/exercises/ex_unknown.jpg')).toBe(false);
    expect(re.test('/')).toBe(true);
    expect(re.test('/reset-password')).toBe(true);
    expect(re.test('/challenges')).toBe(true);
  });
  it('les fichiers /assets/ ne sont plus « immutable » (une mauvaise réponse resterait un an)', () => {
    const assets = v.headers.find((h) => h.source.startsWith('/assets/'))!;
    const cc = assets.headers.find((h) => h.key === 'Cache-Control')!.value;
    expect(cc).not.toContain('immutable');
    expect(cc).not.toMatch(/max-age=\d{6,}/); // pas d'année
    expect(cc).toContain('stale-while-revalidate');
  });
});
