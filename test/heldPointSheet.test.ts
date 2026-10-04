// 🏰 La fiche d'un lieu qu'on TIENT reste complète même quand le héros (ou une équipe) qui
// l'a pris rentre (v1.51.2, signalé : « ça me met que le héros est sur le retour et je n'ai
// pas accès au détail »). `engagedTrip` masque le panneau du lieu (garnison, production,
// renforts) : il ne doit jamais valoir pour un lieu tenu. Test de COPIE assumé : la fiche vit
// dans ExpeditionMapPage, hors du harnais de montage.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/ExpeditionMapPage.vue', 'utf8');

describe('🏰 la fiche d’un lieu tenu n’est jamais « déjà attaquée »', () => {
  it('engagedTrip rend null pour un lieu que le joueur tient, avant toute autre règle', () => {
    const i = src.indexOf('const engagedTrip = computed(() => {');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('const t = now.value;', i));
    expect(body).toMatch(/liveControl\.value\?\.owner === 'player'\) return null/);
  });
  it('et c’est bien engagedTrip qui garde le panneau du lieu tenu', () => {
    expect(src).toMatch(/<template v-if="!engagedTrip">[\s\S]{0,400}liveControl\?\.owner === 'player'/);
  });
});
