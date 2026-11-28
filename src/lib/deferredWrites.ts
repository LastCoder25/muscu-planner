// deferredWrites.ts — écritures GROUPÉES de la fiche du personnage (pur, testé).
//
// ⚠️ Pourquoi (mesuré, 2026-11-24) : un lancer de donjon ou de boss attendait l'écriture de TOUTE
// la fiche avant de partir au suivant. Pour un compte avancé (inventaire de 140 Ko), chaque lancer
// envoyait ~175 Ko, un par un : un ×25 envoyait 4,4 Mo en série, soit une à deux minutes
// d'attente alors que le calcul du lancer lui-même coûte ~25 ms.
//
// La règle : pendant une série, chaque lancer met la fiche à jour EN MÉMOIRE tout de suite (la
// suite part sans attendre le réseau) et ses colonnes sont ajoutées à UN patch en attente. Une
// seule requête vole à la fois ; quand elle revient, UNE requête repart avec le patch accumulé.
// Pour une colonne écrite plusieurs fois, le DERNIER état gagne (chaque patch est calculé sur la
// fiche déjà mise à jour : il contient l'état complet de la colonne). La série attend la fin
// (`flush`) avant de montrer son récap.
//
// Un échec ne perd rien : le patch revient en attente, l'erreur est rendue par `flush`, et un
// nouveau `flush` retente.

export interface WriteCoalescer {
  /** Ajoute un patch (colonnes complètes) à ce qui attend d'être écrit, et lance l'écriture. */
  add(patch: Record<string, unknown>): void;
  /** Se résout quand tout est écrit ; rejette avec la 1re erreur (le patch reste en attente). */
  flush(): Promise<void>;
  /** L'écriture en cours, s'il y en a une (ne rejette jamais). */
  current(): Promise<void> | null;
  /** Reste-t-il quelque chose à écrire (en vol ou en attente) ? */
  dirty(): boolean;
  /** Abandonne ce qui attend (la fiche va être relue en base). */
  drop(): void;
}

export function createWriteCoalescer(
  send: (patch: Record<string, unknown>) => Promise<void>,
): WriteCoalescer {
  let pending: Record<string, unknown> = {};
  let running: Promise<void> | null = null;
  let error: unknown = null;
  let failed = false;

  const hasPending = () => Object.keys(pending).length > 0;

  async function loop(): Promise<void> {
    // On cède la main UNE fois avant le premier envoi : `running` est alors déjà posé quand `send`
    // s'exécute, donc un `add` qui arrive pendant l'envoi ne peut jamais démarrer une 2e boucle.
    await Promise.resolve();
    while (hasPending()) {
      const body = pending;
      pending = {};
      try {
        await send(body);
      } catch (e) {
        // Rien n'est perdu : ce qui n'est pas parti revient, SOUS ce qui a été ajouté depuis
        // (une colonne réécrite entre-temps garde sa valeur la plus récente).
        pending = { ...body, ...pending };
        error = e;
        failed = true;
        return;
      }
    }
  }
  function kick(): void {
    if (running) return;
    const p = loop().finally(() => {
      running = null;
    });
    running = p;
  }

  return {
    add(patch) {
      pending = { ...pending, ...patch };
      // Après un échec on n'insiste pas à chaque ajout : c'est `flush` qui retente.
      if (!failed) kick();
    },
    async flush() {
      failed = false;
      error = null;
      kick();
      while (running) await running;
      if (failed) {
        const e = error;
        failed = false;
        error = null;
        throw e;
      }
    },
    current: () => running,
    dirty: () => running !== null || hasPending(),
    drop() {
      pending = {};
    },
  };
}
