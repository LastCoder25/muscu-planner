// 🐉 LA fabrique de test d'un boss entre amis.
//
// ⚠️ POURQUOI UNE SEULE : `test/` n'est PAS vérifié par le typecheck (il est transpilé à
// l'exécution). Deux fabriques recopiées — c'était le cas dans `friendBoss.test` et
// `bodyBalance.test` — laisseraient un champ ajouté un jour à `FriendBoss` manquer en
// SILENCE dans l'une des deux. Ici il n'y a qu'un endroit à tenir à jour, et le typage
// `satisfies FriendBoss` fait rougir l'éditeur dès qu'un champ requis manque.
//
// Les valeurs par défaut sont NEUTRES : chaque fichier de test passe par-dessus celles qui
// comptent pour lui (PV, démarrage…), jamais l'inverse.
import type { FriendBoss } from '@/lib/friendBoss';

export function makeBoss(over: Partial<FriendBoss> = {}): FriendBoss {
  return {
    id: 'b1',
    ownerId: 'u1',
    family: 'push',
    exerciseId: 'ex_pushup',
    exerciseName: 'Pompes',
    repWeight: 1,
    createdAt: 0,
    startAt: null,
    defeatedAt: null,
    hpTotal: 300,
    damage: 0,
    ...over,
  } satisfies FriendBoss;
}
