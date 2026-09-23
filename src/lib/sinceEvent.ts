/**
 * ⏱️ UNE CONSÉQUENCE COURT DEPUIS SON ÉVÉNEMENT, PAS DEPUIS L'INSTANT OÙ ON LA DÉCOUVRE.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE. Le jeu se résout hors ligne : un siège tombe à son heure, un
 * convoi rentre à la sienne, que l'app soit ouverte ou non. Poser la durée d'une conséquence
 * (convalescence, gel de production, champ de cadavres) à partir de `Date.now()` revient donc
 * à faire payer une absence — ce que ce jeu ne fait jamais — et deux fois plutôt qu'une,
 * puisqu'on n'a pas joué non plus pendant ce temps.
 *
 * La règle a été redécouverte et réécrite à la main TROIS fois (l'embuscade de faille dans
 * `expedition.ts`, le `until` du siège dans `raid.ts`, et rien du tout côté convois — d'où le
 * défaut). Elle vit ici, une fois.
 *
 * ⚠️ `null` veut dire « déjà écoulée » : on ne pose pas un état mort que le tick suivant
 * effacerait, et qui immobiliserait quelqu'un une seconde pour rien.
 *
 * ⚠️ CE N'EST PAS LA RÈGLE DES CALENDRIERS. Un PROCHAIN rendez-vous (le siège suivant, un
 * spawn) se rebase sur `now` : compté depuis l'événement, un retour après trois jours le
 * rendrait dû à la seconde même, puis le suivant — une salve, c'est-à-dire l'arriéré que ce
 * jeu interdit. Une conséquence court depuis son passé, un calendrier repart du présent.
 */
export function sinceEvent(at: number, ms: number, now: number): number | null {
  const until = at + ms;
  return until > now ? until : null;
}
