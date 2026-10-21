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
  /** L'erreur vient de l'AFFICHAGE (Vue) : l'écran est vraiment cassé. Sinon c'est une
   *  erreur d'arrière-plan (promesse rejetée, script) qui n'a souvent rien cassé à l'écran. */
  screen: boolean;
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
  const o = !e && err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : '');
  let message: string;
  let extra = '';
  if (e) message = `${e.name}: ${e.message}`;
  else if (o && str(o.message)) {
    // ⚠️ Erreur Supabase : un OBJET SIMPLE { message, details, hint, code } (v1.262.0 :
    // lu « [object Object] », et une coupure réseau passait ainsi le filtre des bruits).
    message = str(o.code) ? `${str(o.message)} (${str(o.code)})` : str(o.message);
    extra = [str(o.details), str(o.hint)].filter(Boolean).join('\n');
  } else if (o) message = safeJson(o);
  else message = String(err);
  const pile = (e?.stack ?? '').split('\n').slice(0, PILE_LINES).join('\n');
  return {
    message: message.slice(0, 400),
    detail: [`où : ${where}`, extra, pile].filter(Boolean).join('\n'),
    screen: where.startsWith('vue'),
  };
}

function safeJson(o: object): string {
  try {
    return JSON.stringify(o);
  } catch {
    return 'objet illisible (référence circulaire)';
  }
}

/** Le texte envoyé ou copié : l'erreur, l'écran et la version, rien d'autre (pas de donnée
 *  de jeu ni d'identifiant : le signalement porte déjà son auteur). */
export function crashReportText(c: CrashInfo, route: string, version: string): string {
  return [`⚠️ Plantage v${version} sur ${route}`, c.message, c.detail].join('\n').slice(0, 4000);
}
