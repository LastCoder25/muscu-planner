/**
 * 🎨 LE SERVICE D'ILLUSTRATIONS — client Pollinations à clé et repli Stable Horde, pour les
 * scripts de génération (reliques et trophées). ⚠️ `fetch-monster-art.mjs` en garde sa propre
 * copie (avec le détourage) : les unifier est à faire lors d'une régénération d'ennemis, pour
 * revérifier la planche.
 *
 * ⚠️ LE MODÈLE PAR DÉFAUT DU SERVICE PUBLIC NE SAIT PAS DESSINER (mesuré le 2026-09-21) :
 * `image.pollinations.ai` ne sert plus que `sana`, flou et délavé, qui ignore le fond
 * demandé. D'où l'API à CLÉ (`gen.pollinations.ai`) et **Z-Image Turbo**, retenu sur une
 * planche à trois (FLUX schnell : gribouillis parasites ; FLUX.2 klein : plus terne). Il
 * respecte le fond blanc uni, ce qui rend le détourage fiable.
 *
 * ⚠️ LA CLÉ vit dans `.pollinations-token` (gitignoré, comme `.supabase-token`) : jamais
 * dans le dépôt, jamais dans le code. Chaque image consomme 0,004 pollen sur la dotation
 * QUOTIDIENNE du compte — le solde est vérifié AVANT chaque image par l'appelant, qui
 * s'arrête net plutôt que de facturer du solde payant.
 */
import { readFileSync, existsSync } from 'node:fs';

export const MODEL = 'zimage';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Client authentifié. `null` si la clé est absente (l'appelant décide s'il peut s'en passer). */
export function pollinationsClient(tokenFile) {
  const token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';
  if (!token) return null;
  const auth = { Authorization: `Bearer ${token}` };
  return {
    /** Solde gratuit du jour. On ne touche JAMAIS au solde payant. */
    async freeBalance() {
      const res = await fetch('https://gen.pollinations.ai/account/balance', { headers: auth });
      const j = await res.json();
      return j.accountBalance?.tier ?? 0;
    },
    async fetchImage(prompt, seed, gen) {
      const url =
        `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}` +
        `?model=${MODEL}&width=${gen}&height=${gen}&seed=${seed}&nologo=true`;
      for (let essai = 0; essai < 6; essai++) {
        try {
          const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(180000) });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 5000) return buf;
          } else console.log(`  … ${res.status}, nouvel essai`);
        } catch (e) {
          console.log(`  … ${e.message}, nouvel essai`);
        }
        await sleep(5000 + essai * 5000);
      }
      return null;
    },
  };
}

/**
 * 🐎 REPLI STABLE HORDE (`--horde`) : la dotation gratuite Pollinations ne se recharge plus
 * depuis le 21/09. Stable Horde est gratuit (clé anonyme), sans solde, mais en file
 * d'attente (~2 à 10 min par image). **Juggernaut XL**, retenu sur planche pour les ennemis
 * (fond blanc, trait net). ⚠️ Le filtre NSFW reste ACTIF : une image censurée est retentée.
 */
const HORDE_API = 'https://stablehorde.net/api/v2';
const HORDE_HEAD = {
  apikey: '0000000000',
  'Content-Type': 'application/json',
  'Client-Agent': 'muscu-planner:1:alban',
};
const HORDE_NEG =
  'text, watermark, cast shadow, ground, scenery, background, cropped, blurry, photo, person, hand';

async function hordeJson(url, init) {
  for (let k = 0; k < 20; k++) {
    try {
      // ⚠️ Délai de garde : sans lui, une connexion qui ne répond jamais bloquait le script
      // indéfiniment (vu : 8 h sans rien produire).
      const res = await fetch(url, {
        headers: HORDE_HEAD,
        signal: AbortSignal.timeout(60000),
        ...init,
      });
      return await res.json();
    } catch {
      await sleep(10000);
    }
  }
  return null;
}

export async function fetchHorde(prompt, seed) {
  for (let essai = 0; essai < 3; essai++) {
    const j = await hordeJson(`${HORDE_API}/generate/async`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: `${prompt} ### ${HORDE_NEG}`,
        params: {
          width: 832,
          height: 832,
          steps: 25,
          cfg_scale: 6,
          sampler_name: 'k_euler_a',
          seed: String(seed + essai),
          n: 1,
        },
        models: ['Juggernaut XL'],
        nsfw: false,
        censor_nsfw: true,
        r2: true,
      }),
    });
    if (!j?.id) {
      console.log(`  … refus ${JSON.stringify(j)}`);
      await sleep(30000);
      continue;
    }
    let c;
    do {
      await sleep(10000);
      c = await hordeJson(`${HORDE_API}/generate/check/${j.id}`);
    } while (c && !c.done && !c.faulted && c.is_possible !== false);
    if (!c?.done) continue;
    const s = await hordeJson(`${HORDE_API}/generate/status/${j.id}`);
    const g = s?.generations?.[0];
    if (!g?.img || g.censored) {
      console.log('  … image censurée, nouvel essai');
      continue;
    }
    // ⚠️ Le téléchargement final aussi peut couper (vu : délai dépassé sur le stockage
    // R2) ; sans garde, une seule coupure arrêtait tout le lot.
    let buf = null;
    for (let k = 0; k < 6 && !buf; k++) {
      try {
        const res = await fetch(g.img, { signal: AbortSignal.timeout(60000) });
        if (res.ok) buf = Buffer.from(await res.arrayBuffer());
      } catch {
        await sleep(10000);
      }
    }
    if (!buf) continue;
    if (buf.length > 5000) return buf;
  }
  return null;
}
