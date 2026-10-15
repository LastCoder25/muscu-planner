// Les tests ne parlent jamais à une vraie base. Sans ce filet, chaque montage d'écran
// tentait de joindre l'URL factice de `vitest.config.ts` et remplissait la sortie de
// dizaines de `ECONNREFUSED` qui noyaient les vrais échecs.
//
// On répond comme un serveur INDISPONIBLE (503) : supabase-js le traduit en `{ error }`,
// exactement le chemin que prenait déjà l'échec de connexion — le comportement des stores
// ne change pas, seul le bruit disparaît. Les autres URL passent au vrai `fetch`.
const FAKE_SUPABASE = 'http://localhost:54321';
const realFetch = globalThis.fetch;

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(FAKE_SUPABASE)) {
    return Promise.resolve(
      new Response(JSON.stringify({ message: 'offline (tests)', code: 'OFFLINE' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return realFetch(input, init);
};
