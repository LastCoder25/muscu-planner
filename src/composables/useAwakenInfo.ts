import { Dialog } from 'quasar';
import { awakenExplain, type Adventurer } from '@/lib/adventurers';

/** Échappe le texte avant de l'insérer en HTML (le nom d'un aventurier est une donnée). */
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * ✨ Ouvre l'explication de l'Éveil d'un champion (demandé : « quand je clique sur Éveil,
 * me dire ce que ça signifie »). Le contenu vient de `awakenExplain` (lib, testée) ;
 * ce composable ne fait que l'afficher, pour que le portrait et la fiche de la Guilde
 * disent exactement la même chose.
 */
export function showAwakenInfo(adv: Adventurer): void {
  const e = awakenExplain(adv);
  const lines = e.lines.map((l) => `<div style="margin-top:6px">${esc(l)}</div>`).join('');
  Dialog.create({
    title: esc(e.title),
    message: `<div>${esc(e.intro)}</div>${lines}`,
    html: true,
    ok: { label: 'Compris', color: 'primary', textColor: 'dark', unelevated: true },
  });
}
