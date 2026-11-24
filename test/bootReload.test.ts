import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 🔁 Démarrage bloqué par un fichier périmé (v1.349.1) : le script inline de index.html recharge
// la page UNE fois, seul. On l'exécute avec un faux window/location/sessionStorage.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;

function boot(opts: { storage?: boolean } = {}) {
  let reloads = 0;
  const handlers: Record<string, (e: unknown) => void> = {};
  const mem = new Map<string, string>();
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
  new Function('window', 'document', 'location', 'sessionStorage', 'setTimeout', code)(
    win,
    { getElementById: () => null },
    { reload: () => reloads++ },
    store,
    () => 0,
  );
  const fail = (src: string) => handlers.error!({ target: { src } });
  return { fail, reloads: () => reloads };
}

describe('démarrage : un fichier de l’app introuvable recharge la page, une fois', () => {
  it('un script /assets/ introuvable déclenche UN rechargement', () => {
    const b = boot();
    b.fail('https://x.app/assets/index-CY328gTz.js');
    expect(b.reloads()).toBe(1);
  });
  it('plusieurs fichiers manquants à la suite : toujours un seul rechargement (pas de boucle)', () => {
    const b = boot();
    b.fail('https://x.app/assets/index-CY328gTz.js');
    b.fail('https://x.app/assets/combo-BCSMosWz.js');
    b.fail('https://x.app/assets/challenges-CgPFgeMG.js');
    expect(b.reloads()).toBe(1);
  });
  it('une feuille de style /assets/ manquante compte aussi', () => {
    const b = boot();
    b.fail('https://x.app/assets/index-AbC.css');
    expect(b.reloads()).toBe(1);
  });
  it('une ressource qui n’est pas un fichier de l’app (police, image) ne recharge rien', () => {
    const b = boot();
    b.fail('https://fonts.googleapis.com/css2?family=Inter');
    b.fail('https://x.app/exercises/ex_squat.jpg');
    expect(b.reloads()).toBe(0);
  });
  it('sans mémoire de session, jamais de rechargement automatique (risque de boucle)', () => {
    const b = boot({ storage: false });
    b.fail('https://x.app/assets/index-CY328gTz.js');
    expect(b.reloads()).toBe(0);
  });
});
