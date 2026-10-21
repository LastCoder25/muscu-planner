// crashReport.ts — dire CE QUI A PLANTÉ au lieu de laisser un écran noir (cœur PUR).
//
// ⚠️ Pourquoi (2026-10-21, signalé : « Aventure, écran noir sauf la version en bas à
// gauche ») : une erreur levée pendant le rendu laisse l'écran vide, sans un mot, et elle
// n'arrive que sur le téléphone — impossible à reproduire au banc avec les mêmes données.
// Le panneau `CrashPanel` montre l'erreur et propose de l'envoyer : c'est lui qui la dira.

/** Une erreur captée, prête à montrer et à envoyer. */
export interface CrashInfo {
  /** Le message, une ligne. */
  message: string;
  /** Le détail : d'où elle vient (Vue, navigateur), la pile tronquée. */
  detail: string;
}

/** Bruits connus qui ne cassent rien : ignorés (sinon le panneau s'ouvrirait pour rien).
 *  ⚠️ Un module introuvable après un redéploiement est déjà RÉCUPÉRÉ par le routeur
 *  (`chunkReload`, la page se recharge) : pas besoin de l'afficher. */
export function isIgnorableError(message: string): boolean {
  return (
    /ResizeObserver loop/i.test(message) ||
    /dynamically imported module|importing a module script failed/i.test(message) ||
    /^Script error\.?$/i.test(message.trim()) ||
    /Failed to fetch|NetworkError|Load failed|AbortError/i.test(message)
  );
}

const PILE_LINES = 12;

/** Met une erreur en forme. `where` : « vue · setup function », « window.onerror »… */
export function describeCrash(err: unknown, where: string): CrashInfo {
  const e = err instanceof Error ? err : null;
  const message = (e ? `${e.name}: ${e.message}` : String(err)).slice(0, 400);
  const pile = (e?.stack ?? '').split('\n').slice(0, PILE_LINES).join('\n');
  return { message, detail: [`où : ${where}`, pile].filter(Boolean).join('\n') };
}

/** Le texte envoyé ou copié : l'erreur, l'écran et la version, rien d'autre (pas de donnée
 *  de jeu ni d'identifiant : le signalement porte déjà son auteur). */
export function crashReportText(c: CrashInfo, route: string, version: string): string {
  return [`⚠️ Plantage v${version} sur ${route}`, c.message, c.detail].join('\n').slice(0, 4000);
}
