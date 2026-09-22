// statText.ts — découper une ligne de stat autour de sa VALEUR, pour mettre le chiffre en
// avant sans ajouter de couleur (v0.1074, demandé : « on fait ressortir un peu les stats ? »
// après le passage en sobre). Pur, sans dépendance.
//
// Les lignes viennent de `effectLabelFor` : le chiffre est le plus souvent en tête
// (« +12% dégâts »), mais pas toujours (« renvoie 12% des dégâts reçus »). On prend donc le
// PREMIER nombre de la ligne, où qu'il soit. Une ligne sans nombre (effet légendaire
// « 🔥 Bourreau ») reste entière dans `pre` : on n'invente jamais de valeur.

export interface StatParts {
  pre: string;
  /** Le chiffre, signe et % compris (« +12% ») — '' si la ligne n'en a pas. */
  value: string;
  post: string;
}

// ⚠️ L'espace n'appartient au chiffre QUE devant un « % » : placé seul (`\s?%?`), il
// avalait l'espace qui suit le nombre et « de 1.4 volée » s'affichait « de 1.4volée ».
const VALUE = /[+−-]?\d[\d.,]*(?:\s?%)?/;

export function splitStat(line: string): StatParts {
  const m = VALUE.exec(line);
  if (!m) return { pre: line, value: '', post: '' };
  return {
    pre: line.slice(0, m.index),
    value: m[0],
    post: line.slice(m.index + m[0].length),
  };
}
