// latestWriter.ts — écritures « dernier état » sérialisées, par clé (pur/testé).
//
// ⚠️ Pourquoi (bug v1.248, constaté en base) : la fin de séance du Défi 360 enregistre ses
// séries une par une, et chaque série lançait SA requête qui réécrit toute la ligne. Parties
// en même temps, elles arrivent dans le désordre : la dernière à passer gagne, et si c'est une
// ancienne (moins de séries), les suivantes sont écrasées. Seules 2 séries sur la séance
// étaient restées.
//
// La règle : une seule écriture à la fois par clé ; une demande pendant qu'une écriture est en
// vol est retenue, puis UNE écriture repart avec l'état du moment (`send` lit l'état courant).
// La dernière écriture porte donc toujours le dernier état. Un échec se retente quelques fois.

export interface LatestWriter<K> {
  /** Demande d'écrire l'état courant de `key`. */
  schedule(key: K): void;
  /** Se résout quand plus rien n'est en vol ni en attente pour `key`. */
  idle(key: K): Promise<void>;
}

export function createLatestWriter<K>(
  send: (key: K) => Promise<void>,
  opts: { retries?: number; retryMs?: number; onError?: (key: K, e: unknown) => void } = {},
): LatestWriter<K> {
  const retries = opts.retries ?? 3;
  const retryMs = opts.retryMs ?? 2000;
  const running = new Map<K, Promise<void>>();
  const pending = new Set<K>();

  async function loop(key: K) {
    do {
      pending.delete(key);
      for (let attempt = 0; ; attempt++) {
        try {
          await send(key);
          break;
        } catch (e) {
          // Une nouvelle demande arrivée entre-temps repartira de toute façon.
          if (pending.has(key)) break;
          if (attempt >= retries) {
            opts.onError?.(key, e);
            break;
          }
          await new Promise((r) => setTimeout(r, retryMs * (attempt + 1)));
        }
      }
    } while (pending.has(key));
    running.delete(key);
  }

  return {
    schedule(key) {
      pending.add(key);
      if (!running.has(key)) running.set(key, loop(key));
    },
    async idle(key) {
      while (running.has(key)) await running.get(key);
    },
  };
}
